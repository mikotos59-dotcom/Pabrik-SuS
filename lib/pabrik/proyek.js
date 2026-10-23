// Proyek di pabrik: impor ZIP kode sumber, sinkron ala GitHub, dan catatan build
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const arsip = require("./arsip");

const JUNK = /(^|\/)(Thumbs\.db|desktop\.ini|\.DS_Store|__MACOSX\/.*)$/i;
// Folder hasil build/bahan di dalam proyek: tidak pernah dihapus saat sinkron
const KEEP = /^(node_modules|dist|\.venv-build)(\/|$)/;

const sha1 = (buf) => crypto.createHash("sha1").update(buf).digest("hex");
const slugify = (s) => String(s || "proyek").trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "proyek";

function proyekDir(root) { return path.join(root, "Proyek"); }
function paths(root, slug) {
  const base = path.join(proyekDir(root), slug);
  return { base, kode: path.join(base, "kode"), state: path.join(base, "pabrik.json"), sumber: path.join(base, "sumber.zip") };
}
function load(root, slug) {
  try { return JSON.parse(fs.readFileSync(paths(root, slug).state, "utf8")); } catch { return null; }
}
function save(root, st) {
  const p = paths(root, st.slug);
  fs.mkdirSync(p.base, { recursive: true });
  fs.writeFileSync(p.state + ".tmp", JSON.stringify(st, null, 1));
  fs.renameSync(p.state + ".tmp", p.state);
}
function list(root) {
  const d = proyekDir(root);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).map((s) => load(root, s)).filter(Boolean).sort((a, b) => (b.imported || 0) - (a.imported || 0));
}

// Mengenali jenis proyek, nama, dan versi dari isi file
function identify(get, names, fallback) {
  const info = { type: null, name: null, version: null, description: null, pkgName: null };
  const pkgRaw = get("package.json");
  if (pkgRaw) {
    try {
      const p = JSON.parse(pkgRaw);
      const deps = { ...(p.dependencies || {}), ...(p.devDependencies || {}) };
      info.name = p.productName || p.name; info.version = p.version || null;
      info.pkgName = p.name || null; info.description = p.description || null;
      if (deps.electron || deps["electron-builder"]) info.type = "electron";
    } catch {}
  }
  if (!info.type && (names.some((n) => /^requirements\.txt$/i.test(n)) || names.some((n) => /^[^/]+\.spec$/i.test(n)) || names.includes("versi.py"))) {
    info.type = "python";
    const v = get("versi.py");
    if (v) {
      const m = v.match(/^\s*VERSI\s*=\s*["']([^"']+)["']/m); if (m) info.version = m[1];
      const n = v.match(/^\s*NAMA(?:_APP)?\s*=\s*["']([^"']+)["']/m); if (n) info.name = n[1];
      const d = v.match(/^\s*(?:DESKRIPSI|KETERANGAN)\s*=\s*["']([^"']+)["']/m); if (d) info.description = d[1];
    }
    if (!info.name) { const spec = names.find((n) => /^[^/]+\.spec$/i.test(n)); if (spec) info.name = spec.replace(/\.spec$/i, ""); }
  }
  if (!info.name) info.name = fallback;
  return info;
}

// Impor/perbarui proyek dari arsip (.zip/.7z/.rar). Mengembalikan statistik perubahan.
async function importArchive(root, zipPath) {
  const { rootName, entries } = await arsip.readArchive(zipPath);
  if (!entries.length) throw new Error("Arsip kosong.");
  const byPath = new Map(entries.map((e) => [e.path, e]));
  const get = (p) => (byPath.has(p) ? byPath.get(p).data().toString("utf8") : null);
  const info = identify(get, entries.map((e) => e.path), rootName || path.basename(zipPath).replace(/\.(zip|7z|rar)$/i, ""));
  if (!info.type) throw new Error("Jenis proyek tidak dikenali. Pabrik mendukung aplikasi Electron (ada package.json dengan electron) dan Python (ada requirements.txt, .spec, atau versi.py).");

  const slug = slugify(info.name);
  const p = paths(root, slug);
  const prev = load(root, slug);
  const st = prev || { slug, created: Date.now() };
  if (prev && prev.type && prev.type !== info.type) throw new Error(`Proyek "${slug}" sudah ada dengan jenis lain.`);

  fs.mkdirSync(p.kode, { recursive: true });
  const oldManifest = (prev && prev.manifest) || {};
  const manifest = {};
  const stats = { added: 0, updated: 0, removed: 0, same: 0 };
  for (const e of entries) {
    const data = e.data();
    const h = sha1(data);
    manifest[e.path] = h;
    const dest = path.join(p.kode, e.path);
    if (!path.resolve(dest).startsWith(path.resolve(p.kode) + path.sep)) continue; // tolak path aneh (../)
    let same = false;
    if (fs.existsSync(dest)) { try { same = sha1(fs.readFileSync(dest)) === h; } catch {} }
    if (same) { stats.same++; continue; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(dest) || oldManifest[e.path]) stats.updated++; else stats.added++;
    fs.writeFileSync(dest, data);
  }
  // Hapus file yang dulu datang dari ZIP tapi sekarang tidak ada lagi (hasil build & bahan tidak disentuh)
  for (const old of Object.keys(oldManifest)) {
    if (manifest[old] || KEEP.test(old)) continue;
    const f = path.join(p.kode, old);
    try { fs.unlinkSync(f); stats.removed++; } catch {}
    let d = path.dirname(f);
    while (d.startsWith(p.kode) && d !== p.kode) { try { if (fs.readdirSync(d).length) break; fs.rmdirSync(d); } catch { break; } d = path.dirname(d); }
  }
  // salinan kode sumber selalu disimpan sebagai ZIP (dipakai untuk rilis), apa pun format aslinya
  if (/\.zip$/i.test(zipPath)) fs.copyFileSync(zipPath, p.sumber);
  else arsip.writeZip(entries, p.sumber, rootName || slug);

  Object.assign(st, {
    name: info.name, type: info.type, version: info.version, description: info.description, pkgName: info.pkgName,
    manifest, sourceHash: sha1(JSON.stringify(Object.entries(manifest).sort())),
    imported: Date.now(), sourceName: path.basename(zipPath),
  });
  save(root, st);
  return { project: st, stats, isNew: !prev };
}

// Skrip yang akan dijalankan saat build, untuk ditunjukkan dan disetujui pengguna
function scriptsToReview(root, st) {
  const k = paths(root, st.slug).kode;
  const read = (f) => { try { return fs.readFileSync(path.join(k, f), "utf8"); } catch { return null; } };
  const items = [];
  if (st.type === "electron") {
    const pkg = JSON.parse(read("package.json") || "{}");
    const s = pkg.scripts || {};
    for (const key of ["preinstall", "install", "postinstall", "prepare", "setup"]) {
      if (s[key]) items.push({ title: `npm script "${key}"`, body: s[key], files: refFiles(s[key]).map((f) => ({ name: f, body: read(f) })).filter((f) => f.body) });
    }
    const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
    items.push({ title: "Paket npm yang diunduh", body: deps.join(", ") || "(tidak ada)" });
  } else {
    const files = fs.readdirSync(k);
    const pj = read("pabrik.json");
    if (pj) { try { for (const c of JSON.parse(pj).sebelum || []) items.push({ title: "Perintah dari pabrik.json", body: c }); } catch {} }
    for (const f of files.filter((f) => /^ambil_.*\.ps1$/i.test(f))) items.push({ title: `Skrip PowerShell ${f}`, body: read(f) });
    for (const f of files.filter((f) => /\.spec$/i.test(f))) items.push({ title: `Resep PyInstaller ${f}`, body: read(f) });
    for (const f of files.filter((f) => /\.iss$/i.test(f))) items.push({ title: `Resep installer ${f}`, body: read(f) });
    const req = read("requirements.txt");
    if (req) items.push({ title: "Paket Python yang diunduh (requirements.txt)", body: req.trim() });
  }
  const hash = sha1(JSON.stringify(items));
  return { items, hash, trusted: st.trusted === hash };
}
function refFiles(cmd) { return [...cmd.matchAll(/(?:node|python)\s+([\w./-]+\.(?:js|mjs|cjs|py))/g)].map((m) => m[1]); }

function remove(root, slug) { fs.rmSync(paths(root, slug).base, { recursive: true, force: true }); }

module.exports = { paths, load, save, list, importArchive, scriptsToReview, remove, sha1, slugify };
