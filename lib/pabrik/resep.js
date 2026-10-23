// Resep build: Electron (Node + electron-builder) dan Python (PyInstaller + Inno Setup)
const fs = require("fs");
const path = require("path");
const bahan = require("./bahan");
const proyek = require("./proyek");
const { WIN } = require("./jalankan");

const sha1 = proyek.sha1;
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };

// ---------- Ikon ----------
// Membuat .ico (16–256 px, berisi PNG) dari gambar PNG, memakai nativeImage Electron
function makeIco(pngPath, icoPath) {
  const { nativeImage } = require("electron");
  const img = nativeImage.createFromPath(pngPath);
  if (img.isEmpty()) throw new Error("Gambar ikon tidak bisa dibaca.");
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = sizes.map((s) => img.resize({ width: s, height: s, quality: "best" }).toPNG());
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  const dir = Buffer.alloc(16 * sizes.length);
  let offset = 6 + dir.length;
  sizes.forEach((s, i) => {
    const o = i * 16;
    dir.writeUInt8(s >= 256 ? 0 : s, o); dir.writeUInt8(s >= 256 ? 0 : s, o + 1);
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(pngs[i].length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += pngs[i].length;
  });
  fs.mkdirSync(path.dirname(icoPath), { recursive: true });
  fs.writeFileSync(icoPath, Buffer.concat([head, dir, ...pngs]));
}
function iconPreview(file) {
  try {
    const { nativeImage } = require("electron");
    const img = nativeImage.createFromPath(file);
    return img.isEmpty() ? null : img.resize({ width: 64, height: 64, quality: "best" }).toDataURL();
  } catch { return null; }
}

// Menemukan & menyiapkan ikon. Mengembalikan { ok, note, preview }
function checkIcon(kode, type, job) {
  if (type === "electron") {
    let pkg = {}; try { pkg = JSON.parse(fs.readFileSync(path.join(kode, "package.json"), "utf8")); } catch {}
    const want = (pkg.build && pkg.build.win && pkg.build.win.icon) || "build/icon.ico";
    const abs = path.join(kode, want);
    const png = [abs.replace(/\.ico$/i, ".png"), path.join(kode, "build", "icon.png"), path.join(kode, "icon.png")].find(exists);
    if (exists(abs) && /\.ico$/i.test(abs)) return { ok: true, note: `Memakai ${want}`, preview: iconPreview(png || abs) };
    if (png) {
      const ico = /\.ico$/i.test(abs) ? abs : path.join(kode, "build", "icon.ico");
      makeIco(png, ico);
      job.log(`Ikon .ico dibuat dari ${path.relative(kode, png)} (16–256 px)`);
      return { ok: true, note: `Ikon .ico dibuat dari ${path.relative(kode, png)}`, preview: iconPreview(png) };
    }
    return { ok: false, note: "Tidak ada ikon. File exe akan memakai ikon bawaan Electron.", preview: null };
  }
  // Python: ikon disebut di .spec (icon=...) atau .iss (SetupIconFile=)
  const files = fs.readdirSync(kode);
  const refs = [];
  for (const f of files.filter((f) => /\.(spec|iss)$/i.test(f))) {
    const t = fs.readFileSync(path.join(kode, f), "utf8");
    for (const m of t.matchAll(/(?:icon\s*=\s*\[?\s*|SetupIconFile\s*=\s*)["']?([^"'\]\r\n,]+\.ico)/gi)) refs.push(m[1].trim());
  }
  const found = refs.map((r) => path.join(kode, r)).find(exists);
  if (found) return { ok: true, note: `Memakai ${path.relative(kode, found)}`, preview: iconPreview(found.replace(/\.ico$/i, ".png")) || iconPreview(found) };
  const missing = refs.find((r) => !exists(path.join(kode, r)));
  if (missing) {
    const png = path.join(kode, missing.replace(/\.ico$/i, ".png"));
    if (exists(png)) { makeIco(png, path.join(kode, missing)); return { ok: true, note: `Ikon ${missing} dibuat dari PNG`, preview: iconPreview(png) }; }
    throw new Error(`Ikon ${missing} disebut di resep tapi filenya tidak ada.`);
  }
  return { ok: false, note: "Resep tidak menyebut ikon. Exe akan memakai ikon bawaan.", preview: null };
}

// ---------- Bantuan ----------
function npmCli(node) {
  const cands = [path.join(node.dir, "node_modules", "npm", "bin", "npm-cli.js"), path.join(node.dir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js")];
  return cands.find(exists) || null;
}
function npmCmd(node, args) {
  const cli = npmCli(node);
  return cli ? [node.node, [cli, ...args]] : [node.npm, args];
}
function collectOutputs(dir, since, exts, type) {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).map((e) => {
    const full = path.join(dir, e.name);
    const st = fs.statSync(full);
    return { name: e.name, path: full, size: st.size, mtime: st.mtimeMs, dir: e.isDirectory() };
  }).filter((f) => f.mtime >= since - 2000 && (f.dir ? exts.includes("/") : exts.some((x) => f.name.toLowerCase().endsWith(x))))
    .filter((f) => !/\.blockmap$|builder-(debug|effective)|-unpacked$|^__/i.test(f.name))
    .map(({ name, path: p, size, dir: isDir }) => ({ name, path: p, size,
      // Electron: .exe hasil NSIS selalu installer. Python: installer hanya kalau namanya "setup"/"installer".
      kind: isDir ? "folder" : /setup|installer/i.test(name) || (type === "electron" && /\.(exe|msi)$/i.test(name)) ? "installer" : "portable" }));
}

// ---------- Resep ----------
function plan(st, kode) {
  if (st.type === "electron") {
    const pkg = JSON.parse(fs.readFileSync(path.join(kode, "package.json"), "utf8"));
    const steps = [
      { id: "bahan", title: "Siapkan Node.js" },
      { id: "ikon", title: "Periksa ikon" },
      { id: "paket", title: "Pasang paket npm" },
    ];
    if (pkg.scripts && pkg.scripts.setup) steps.push({ id: "setup", title: "Jalankan persiapan proyek (npm run setup)" });
    steps.push({ id: "rakit", title: "Rakit aplikasi (electron-builder)" }, { id: "hasil", title: "Kumpulkan hasil" });
    return steps;
  }
  const files = fs.readdirSync(kode);
  const steps = [{ id: "bahan", title: "Siapkan Python" }, { id: "ikon", title: "Periksa ikon" }, { id: "venv", title: "Siapkan lingkungan build (.venv-build)" }, { id: "paket", title: "Pasang paket Python" }];
  const pj = exists(path.join(kode, "pabrik.json"));
  if (pj || files.some((f) => /^ambil_.*\.ps1$/i.test(f))) steps.push({ id: "sebelum", title: "Jalankan skrip persiapan" });
  steps.push({ id: "rakit", title: "Rakit exe (PyInstaller)" });
  if (files.some((f) => /\.iss$/i.test(f))) steps.push({ id: "installer", title: "Bungkus jadi installer (Inno Setup)" });
  steps.push({ id: "hasil", title: "Kumpulkan hasil" });
  return steps;
}

async function build(job, root, st, opts = {}) {
  const P = proyek.paths(root, st.slug);
  const kode = P.kode;
  const steps = plan(st, kode);
  const started = Date.now();
  job.emit({ type: "plan", steps });
  const step = (id, status, note) => job.emit({ type: "step", id, status, note });
  let current = null;
  const doing = (id) => { current = id; step(id, "doing"); };
  const targets = opts.targets || "both";
  const key = sha1([st.sourceHash, targets, process.platform, st.type].join("|"));
  const result = { outputs: [], icon: null, skipped: false };

  try {
    if (st.type === "electron") {
      doing("bahan");
      const node = await bahan.ensure(job, root, "node", "bahan");
      step("bahan", "done", `Node.js ${node.version} (${node.where === "gudang" ? "gudang" : "terpasang"})`);
      const env = bahan.env(root, [node.dir]);

      doing("ikon");
      const ic = checkIcon(kode, "electron", job);
      result.icon = ic.preview;
      step("ikon", ic.ok ? "done" : "warn", ic.note);

      doing("paket");
      const lock = exists(path.join(kode, "package-lock.json")) ? fs.readFileSync(path.join(kode, "package-lock.json")) : Buffer.alloc(0);
      const pkg = JSON.parse(fs.readFileSync(path.join(kode, "package.json"), "utf8"));
      const depsHash = sha1(JSON.stringify([pkg.dependencies, pkg.devDependencies, sha1(lock), node.version]));
      if (!opts.force && st.depsHash === depsHash && exists(path.join(kode, "node_modules", "electron-builder"))) {
        step("paket", "skip", "Paket sama seperti build sebelumnya, tidak dipasang ulang");
      } else {
        const [c, a] = npmCmd(node, ["install", "--no-audit", "--no-fund", "--loglevel=error"]);
        await job.run(c, a, { cwd: kode, env, label: "npm install" });
        st.depsHash = depsHash; proyek.save(root, st);
        step("paket", "done");
      }

      if (steps.some((s) => s.id === "setup")) {
        doing("setup");
        const [c, a] = npmCmd(node, ["run", "setup"]);
        await job.run(c, a, { cwd: kode, env, label: "npm run setup" });
        step("setup", "done");
      }

      doing("rakit");
      const outDir = path.join(kode, (pkg.build && pkg.build.directories && pkg.build.directories.output) || "dist");
      const last = st.lastBuild;
      if (!opts.force && last && last.ok && last.key === key && last.outputs.every((o) => exists(o.path))) {
        step("rakit", "skip", "Tidak ada perubahan sejak build terakhir; memakai hasil yang sudah ada");
        result.outputs = last.outputs; result.skipped = true;
      } else {
        const cliCands = [path.join(kode, "node_modules", "electron-builder", "cli.js"), path.join(kode, "node_modules", "electron-builder", "out", "cli", "cli.js")];
        const cli = cliCands.find(exists);
        if (!cli) throw new Error("electron-builder tidak ada di proyek ini (cek devDependencies di package.json).");
        const args = [cli];
        if (WIN) {
          args.push("--win", ...(targets === "installer" ? ["nsis"] : targets === "portable" ? ["zip"] : ["nsis", "zip"]), "--x64", "-c.win.signAndEditExecutable=true");
        } else {
          args.push("--linux", process.env.PABRIK_LINUX_TARGET || "dir");
        }
        args.push("--publish", "never");
        await job.run(node.node, args, { cwd: kode, env, label: "electron-builder " + args.slice(1).join(" ") });
        result.outputs = collectOutputs(outDir, started, WIN ? [".exe", ".zip", ".msi"] : [".appimage", ".zip", ".deb"], "electron");
        if (!WIN && !result.outputs.length) result.outputs = collectOutputs(outDir, started, ["/"]).concat(fs.readdirSync(outDir).filter((n) => /-unpacked$/.test(n)).map((n) => ({ name: n, path: path.join(outDir, n), size: 0, kind: "folder" })));
        step("rakit", "done");
      }
    } else {
      // ---------- Python ----------
      doing("bahan");
      const py = await bahan.ensure(job, root, "python", "bahan");
      step("bahan", "done", `Python ${py.version} (${py.where === "gudang" ? "gudang" : "terpasang"})`);

      doing("ikon");
      const ic = checkIcon(kode, "python", job);
      result.icon = ic.preview;
      step("ikon", ic.ok ? "done" : "warn", ic.note);

      const venv = path.join(kode, ".venv-build");
      const vpy = path.join(venv, WIN ? "Scripts/python.exe" : "bin/python");
      const env = bahan.env(root, [path.dirname(vpy)]);
      doing("venv");
      if (exists(vpy)) step("venv", "skip", "Sudah ada");
      else { await job.run(py.exe, ["-m", "venv", venv], { cwd: kode, env, label: "python -m venv .venv-build" }); step("venv", "done"); }

      doing("paket");
      const req = exists(path.join(kode, "requirements.txt")) ? fs.readFileSync(path.join(kode, "requirements.txt")) : Buffer.alloc(0);
      const depsHash = sha1(JSON.stringify([sha1(req), py.version]));
      if (!opts.force && st.depsHash === depsHash && exists(vpy)) step("paket", "skip", "Paket sama seperti build sebelumnya");
      else {
        const args = ["-m", "pip", "install", "--disable-pip-version-check", "pyinstaller"];
        if (req.length) args.push("-r", "requirements.txt");
        await job.run(vpy, args, { cwd: kode, env, label: "pip install" + (req.length ? " -r requirements.txt" : "") + " pyinstaller" });
        st.depsHash = depsHash; proyek.save(root, st);
        step("paket", "done");
      }

      if (steps.some((s) => s.id === "sebelum")) {
        doing("sebelum");
        let cmds = [];
        try { cmds = JSON.parse(fs.readFileSync(path.join(kode, "pabrik.json"), "utf8")).sebelum || []; } catch {}
        for (const f of fs.readdirSync(kode).filter((f) => /^ambil_.*\.ps1$/i.test(f))) {
          if (WIN) await job.run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", f], { cwd: kode, env, label: `powershell ${f}` });
          else job.log(`(${f} dilewati: PowerShell hanya di Windows)`);
        }
        for (const c of cmds) await job.run(WIN ? "cmd.exe" : "sh", WIN ? ["/d", "/s", "/c", c] : ["-c", c], { cwd: kode, env, label: c });
        step("sebelum", "done");
      }

      doing("rakit");
      const last = st.lastBuild;
      const specs = fs.readdirSync(kode).filter((f) => /\.spec$/i.test(f));
      if (!specs.length) throw new Error("Tidak ada file .spec (resep PyInstaller) di proyek ini.");
      if (!opts.force && last && last.ok && last.key === key && last.outputs.every((o) => exists(o.path))) {
        step("rakit", "skip", "Tidak ada perubahan sejak build terakhir; memakai hasil yang sudah ada");
        if (steps.some((s) => s.id === "installer")) step("installer", "skip");
        result.outputs = last.outputs; result.skipped = true;
      } else {
        for (const s of specs) await job.run(vpy, ["-m", "PyInstaller", "--noconfirm", s], { cwd: kode, env, label: `PyInstaller ${s}` });
        step("rakit", "done");
        if (steps.some((s) => s.id === "installer")) {
          doing("installer");
          const inno = await bahan.ensure(job, root, "inno", "installer");
          for (const iss of fs.readdirSync(kode).filter((f) => /\.iss$/i.test(f))) {
            const args = ["/Q"];
            if (st.version) args.push(`/DVersiApp=${st.version}`);
            args.push(iss);
            await job.run(inno.exe, args, { cwd: kode, env, label: `ISCC ${iss}` });
          }
          step("installer", "done");
        }
        const dist = path.join(kode, "dist");
        result.outputs = collectOutputs(dist, started, [".exe", ".zip", ".msi"], "python");
        if (!result.outputs.length) result.outputs = collectOutputs(dist, started, ["/"], "python");
      }
    }

    doing("hasil");
    if (!result.outputs.length) throw new Error("Build selesai tapi tidak ada file hasil yang ditemukan di folder dist.");
    step("hasil", "done", result.outputs.map((o) => o.name).join(", "));
    st.lastBuild = { key, ok: true, at: Date.now(), durationMs: Date.now() - started, version: st.version, targets, outputs: result.outputs, skipped: result.skipped };
    st.icon = result.icon;
    proyek.save(root, st);
    return result;
  } catch (e) {
    if (current) step(current, e.cancelled ? "cancel" : "fail", e.message);
    st.lastBuild = { ...(st.lastBuild || {}), ok: false, error: e.message, at: Date.now() };
    if (st.lastBuild.key !== key) st.lastBuild.key = null;
    proyek.save(root, st);
    throw e;
  }
}

module.exports = { build, plan, checkIcon, makeIco };
