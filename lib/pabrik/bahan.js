// Gudang bahan: alat build (Node.js, Python, Inno Setup) dan cache unduhan
// Prinsip: pakai yang sudah ada (di gudang atau terpasang di Windows), unduh hanya kalau belum ada.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const { extractZip, folderSize, WIN } = require("./jalankan");

const SYSTEM_ONLY = process.env.PABRIK_SYSTEM_ONLY === "1"; // khusus pengujian di Linux

function dirs(root) {
  const bahan = path.join(root, "Bahan");
  return {
    bahan,
    node: path.join(bahan, "node"),
    python: path.join(bahan, "python"),
    inno: path.join(bahan, "innosetup"),
    unduhan: path.join(bahan, "unduhan"),
    npmCache: path.join(bahan, "cache", "npm"),
    pipCache: path.join(bahan, "cache", "pip"),
    electronCache: path.join(bahan, "cache", "electron"),
    builderCache: path.join(bahan, "cache", "electron-builder"),
  };
}

function cmdOut(cmd, args) {
  try {
    const r = spawnSync(cmd, args, { encoding: "utf8", windowsHide: true, timeout: 15000 });
    return r.status === 0 ? (r.stdout || "").trim() : null;
  } catch { return null; }
}
const major = (v) => +(String(v || "").replace(/^v/, "").split(".")[0] || 0);

// ---------- Node.js ----------
function findNode(root) {
  const d = dirs(root).node;
  if (!SYSTEM_ONLY && fs.existsSync(d)) {
    for (const sub of fs.readdirSync(d).filter((n) => /^node-v/.test(n)).sort().reverse()) {
      const exe = path.join(d, sub, WIN ? "node.exe" : "bin/node");
      if (fs.existsSync(exe)) {
        const dir = path.dirname(exe);
        return { where: "gudang", version: sub.match(/v[\d.]+/)[0], dir, node: exe, npm: path.join(dir, WIN ? "npm.cmd" : "npm"), npx: path.join(dir, WIN ? "npx.cmd" : "npx") };
      }
    }
  }
  const v = cmdOut("node", ["--version"]);
  if (v && major(v) >= 18) {
    const where = cmdOut(WIN ? "where" : "which", ["node"]);
    const exe = where ? where.split(/\r?\n/)[0] : "node";
    const dir = path.dirname(exe);
    const npm = WIN ? path.join(dir, "npm.cmd") : "npm";
    return { where: "terpasang", version: v, dir, node: exe, npm: fs.existsSync(npm) || !WIN ? npm : "npm.cmd", npx: WIN ? path.join(dir, "npx.cmd") : "npx" };
  }
  return null;
}
async function installNode(job, root, step) {
  job.log("Mencari versi Node.js LTS terbaru…");
  let list;
  try { list = await (await fetch("https://nodejs.org/dist/index.json")).json(); }
  catch { throw new Error("Tidak bisa menghubungi nodejs.org. Periksa koneksi internet."); }
  const arch = WIN ? "win-x64-zip" : "linux-x64";
  const pick = list.find((r) => r.lts && r.files.includes(arch));
  if (!pick) throw new Error("Versi Node.js yang cocok tidak ditemukan.");
  const name = WIN ? `node-${pick.version}-win-x64.zip` : `node-${pick.version}-linux-x64.tar.xz`;
  const D = dirs(root);
  const file = path.join(D.unduhan, name);
  if (!fs.existsSync(file)) await job.download(`https://nodejs.org/dist/${pick.version}/${name}`, file, { step, name: `Node.js ${pick.version}` });
  job.log(`Mengekstrak ${name}…`);
  if (WIN) await extractZip(job, file, D.node);
  else await job.run("tar", ["-xJf", file, "-C", (fs.mkdirSync(D.node, { recursive: true }), D.node)]);
  try { fs.unlinkSync(file); } catch {}
  return findNode(root);
}

// ---------- Python ----------
function pyOk(v) { const m = String(v || "").match(/(\d+)\.(\d+)/); return m && +m[1] === 3 && +m[2] >= 10 && +m[2] <= 13; }
function findPython(root) {
  const d = dirs(root).python;
  if (!SYSTEM_ONLY && fs.existsSync(d)) {
    for (const sub of fs.readdirSync(d).sort().reverse()) {
      const exe = path.join(d, sub, "tools", WIN ? "python.exe" : "python3");
      if (fs.existsSync(exe)) return { where: "gudang", version: sub, exe };
    }
  }
  const tries = WIN
    ? [["py", ["-3.12", "-c", "import sys;print(sys.executable)"]], ["py", ["-3", "-c", "import sys;print(sys.executable)"]], ["python", ["-c", "import sys;print(sys.executable)"]]]
    : [["python3", ["-c", "import sys;print(sys.executable)"]]];
  for (const [cmd, args] of tries) {
    const exe = cmdOut(cmd, args);
    if (!exe || /WindowsApps/i.test(exe)) continue; // alias Microsoft Store bukan Python sungguhan
    const v = cmdOut(exe, ["--version"]);
    if (pyOk(v)) return { where: "terpasang", version: v.replace(/^Python\s*/i, ""), exe };
  }
  return null;
}
async function installPython(job, root, step) {
  if (!WIN) throw new Error("Pengunduhan Python otomatis hanya untuk Windows.");
  job.log("Mencari Python 3.12 terbaru…");
  let versions;
  try { versions = (await (await fetch("https://api.nuget.org/v3-flatcontainer/python/index.json")).json()).versions; }
  catch { throw new Error("Tidak bisa menghubungi server Python. Periksa koneksi internet."); }
  const ver = versions.filter((v) => /^3\.12\.\d+$/.test(v)).pop();
  if (!ver) throw new Error("Python 3.12 tidak ditemukan.");
  const D = dirs(root);
  const file = path.join(D.unduhan, `python.${ver}.zip`);
  if (!fs.existsSync(file)) await job.download(`https://api.nuget.org/v3-flatcontainer/python/${ver}/python.${ver}.nupkg`, file, { step, name: `Python ${ver}` });
  await extractZip(job, file, path.join(D.python, ver));
  try { fs.unlinkSync(file); } catch {}
  return findPython(root);
}

// ---------- Inno Setup ----------
function findInno(root) {
  const own = path.join(dirs(root).inno, "ISCC.exe");
  if (!SYSTEM_ONLY && fs.existsSync(own)) return { where: "gudang", exe: own };
  if (!WIN) return null;
  const cands = [
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Inno Setup 6", "ISCC.exe"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Inno Setup 6", "ISCC.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Inno Setup 6", "ISCC.exe"),
  ];
  const f = cands.find((c) => fs.existsSync(c));
  return f ? { where: "terpasang", exe: f } : null;
}
async function installInno(job, root, step) {
  if (!WIN) throw new Error("Inno Setup hanya tersedia di Windows.");
  const D = dirs(root);
  const file = path.join(D.unduhan, "innosetup.exe");
  if (!fs.existsSync(file)) await job.download("https://jrsoftware.org/download.php/is.exe", file, { step, name: "Inno Setup 6" });
  // Dipasang diam-diam ke dalam gudang, tanpa ikon Start Menu dan tanpa hak admin
  await job.run(file, ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/SP-", "/CURRENTUSER", "/PORTABLE=1", "/NOICONS", `/DIR=${D.inno}`], { label: "Memasang Inno Setup ke gudang" });
  try { fs.unlinkSync(file); } catch {}
  const r = findInno(root);
  if (!r) throw new Error("Inno Setup gagal dipasang.");
  return r;
}

const TOOLS = {
  node: { name: "Node.js", find: findNode, install: installNode, note: "Untuk aplikasi Electron (Ruang Main, RilisKu, AlurProduksi)" },
  python: { name: "Python", find: findPython, install: installPython, note: "Untuk aplikasi Python (Ruang Putar)" },
  inno: { name: "Inno Setup", find: findInno, install: installInno, note: "Pembungkus installer untuk aplikasi Python" },
};

async function ensure(job, root, key, step) {
  const t = TOOLS[key];
  const found = t.find(root);
  if (found) { job.log(`${t.name} ${found.version || ""} sudah ada (${found.where === "gudang" ? "di gudang" : "terpasang di komputer"}), tidak perlu diunduh.`); return found; }
  job.log(`${t.name} belum ada. Mengunduh ke gudang…`);
  return t.install(job, root, step);
}

// Lingkungan perintah: cache diarahkan ke gudang supaya tidak diunduh ulang
function env(root, extraPath = []) {
  const D = dirs(root);
  for (const d of [D.npmCache, D.pipCache, D.electronCache, D.builderCache]) fs.mkdirSync(d, { recursive: true });
  const sep = WIN ? ";" : ":";
  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") || "PATH";
  const e = { ...process.env };
  e[pathKey] = [...extraPath.filter(Boolean), process.env[pathKey]].join(sep);
  Object.assign(e, {
    npm_config_cache: D.npmCache,
    npm_config_fund: "false",
    npm_config_audit: "false",
    npm_config_update_notifier: "false",
    ELECTRON_CACHE: D.electronCache,
    electron_config_cache: D.electronCache,
    ELECTRON_BUILDER_CACHE: D.builderCache,
    PIP_CACHE_DIR: D.pipCache,
    PIP_DISABLE_PIP_VERSION_CHECK: "1",
    PYTHONIOENCODING: "utf-8",
    FORCE_COLOR: "0",
  });
  delete e.ELECTRON_RUN_AS_NODE;
  return e;
}

// Ringkasan isi gudang untuk ditampilkan
async function inventory(root) {
  const D = dirs(root);
  const items = [];
  for (const [key, t] of Object.entries(TOOLS)) {
    const f = t.find(root);
    const own = { node: D.node, python: D.python, inno: D.inno }[key];
    items.push({ key, name: t.name, note: t.note, found: !!f, where: f && f.where, version: f && f.version, size: fs.existsSync(own) ? await folderSize(own) : 0, path: own });
  }
  const caches = [
    ["npm", "Cache paket npm", D.npmCache], ["electron", "Cache Electron", D.electronCache],
    ["builder", "Cache electron-builder (NSIS, dll)", D.builderCache], ["pip", "Cache paket Python", D.pipCache],
  ];
  for (const [key, name, p] of caches) items.push({ key: "cache-" + key, name, cache: true, size: fs.existsSync(p) ? await folderSize(p) : 0, path: p, found: fs.existsSync(p) });
  return items;
}
function clean(root, key) {
  const D = dirs(root);
  const map = { node: D.node, python: D.python, inno: D.inno, "cache-npm": D.npmCache, "cache-electron": D.electronCache, "cache-builder": D.builderCache, "cache-pip": D.pipCache };
  if (!map[key]) return false;
  fs.rmSync(map[key], { recursive: true, force: true });
  return true;
}

module.exports = { dirs, ensure, env, inventory, clean, TOOLS };
