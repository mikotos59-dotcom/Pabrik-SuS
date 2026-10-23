// Membaca arsip kode sumber: .zip (adm-zip) serta .7z dan .rar (7-Zip versi WebAssembly, tanpa program tambahan)
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

const ARCHIVE_EXT = ["zip", "7z", "rar"];
const JUNK = /(^|\/)(Thumbs\.db|desktop\.ini|\.DS_Store|__MACOSX\/.*)$/i;
const extOf = (p) => (String(p).split(".").pop() || "").toLowerCase();
const isArchive = (p) => ARCHIVE_EXT.includes(extOf(p));

let szPromise = null;
function sevenZip() {
  if (!szPromise) {
    const SevenZip = require("7z-wasm");
    szPromise = SevenZip({ print: () => {}, printErr: () => {} });
  }
  return szPromise;
}

async function readRaw(file) {
  const ext = extOf(file);
  if (ext === "zip") {
    return new AdmZip(file).getEntries().filter((e) => !e.isDirectory)
      .map((e) => ({ path: e.entryName.replace(/\\/g, "/"), size: e.header.size, data: () => e.getData() }));
  }
  if (ext !== "7z" && ext !== "rar") throw new Error("Format arsip tidak didukung. Pakai .zip, .7z, atau .rar.");
  const sz = await sevenZip();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const arc = `/arsip-${id}.${ext}`, out = `/hasil-${id}`;
  sz.FS.writeFile(arc, fs.readFileSync(file));
  try {
    // -y: timpa tanpa bertanya, -p-: jangan tanya kata sandi (arsip berpassword langsung gagal)
    const code = sz.callMain(["x", arc, `-o${out}`, "-y", "-p-", "-bso0", "-bsp0"]);
    if (code !== 0 && code !== undefined) throw new Error("Arsip rusak, terkunci kata sandi, atau tidak bisa dibuka.");
    const files = [];
    const walk = (d) => {
      let names = [];
      try { names = sz.FS.readdir(d); } catch { return; }
      for (const n of names) {
        if (n === "." || n === "..") continue;
        const p = d + "/" + n;
        const st = sz.FS.stat(p);
        if (sz.FS.isDir(st.mode)) walk(p);
        else {
          const buf = Buffer.from(sz.FS.readFile(p));
          files.push({ path: p.slice(out.length + 1), size: buf.length, data: () => buf });
        }
      }
    };
    walk(out);
    // bersihkan sistem berkas memori supaya tidak menumpuk
    const rm = (d) => { for (const n of sz.FS.readdir(d)) { if (n === "." || n === "..") continue; const p = d + "/" + n; if (sz.FS.isDir(sz.FS.stat(p).mode)) { rm(p); sz.FS.rmdir(p); } else sz.FS.unlink(p); } };
    try { rm(out); sz.FS.rmdir(out); } catch {}
    if (!files.length) throw new Error("Arsip kosong, atau isinya tidak bisa dibaca.");
    return files;
  } finally { try { sz.FS.unlink(arc); } catch {} }
}

// Mengembalikan { rootName, entries:[{path,size,data()}] }. Kalau semua file ada di satu folder, folder itu dibuang.
async function readArchive(file) {
  let entries = (await readRaw(file)).filter((e) => e.path && !JUNK.test(e.path));
  const firsts = new Set(entries.map((e) => e.path.split("/")[0]));
  let rootName = null;
  if (firsts.size === 1 && entries.every((e) => e.path.includes("/"))) {
    rootName = [...firsts][0];
    entries = entries.map((e) => ({ ...e, path: e.path.slice(rootName.length + 1) }));
  }
  return { rootName, entries };
}

// Simpan entri sebagai ZIP biasa (dipakai untuk salinan kode sumber, apa pun format aslinya)
function writeZip(entries, dest, rootName) {
  const zip = new AdmZip();
  for (const e of entries) zip.addFile((rootName ? rootName + "/" : "") + e.path, e.data());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  zip.writeZip(dest);
}

module.exports = { readArchive, writeZip, isArchive, ARCHIVE_EXT };
