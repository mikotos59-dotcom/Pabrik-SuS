// Menjalankan perintah & mengunduh file dengan progress, bisa dibatalkan
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const WIN = process.platform === "win32";

class Dibatalkan extends Error { constructor() { super("Dibatalkan."); this.cancelled = true; } }

// Satu "pekerjaan" build: menampung proses yang berjalan supaya bisa dihentikan
class Pekerjaan {
  constructor(emit) { this.emit = emit; this.cancelled = false; this.child = null; this.abort = null; }
  cancel() {
    this.cancelled = true;
    if (this.abort) this.abort.abort();
    if (this.child && !this.child.killed) {
      if (WIN) spawnSync("taskkill", ["/pid", String(this.child.pid), "/T", "/F"], { windowsHide: true });
      else try { process.kill(-this.child.pid, "SIGTERM"); } catch { try { this.child.kill("SIGTERM"); } catch {} }
    }
  }
  check() { if (this.cancelled) throw new Dibatalkan(); }
  log(text, kind = "out") { this.emit({ type: "log", kind, text }); }

  // Jalankan perintah; keluaran dikirim ke log baris per baris
  run(cmd, args, { cwd, env, label } = {}) {
    this.check();
    const shown = [cmd, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ");
    this.log(`> ${label || shown}`, "cmd");
    // File .cmd/.bat di Windows harus lewat shell; argumen berspasi perlu dikutip sendiri
    const viaShell = WIN && /\.(cmd|bat)$/i.test(cmd);
    const q = (a) => (/[\s&()^|<>"]/.test(a) ? `"${String(a).replace(/"/g, '""')}"` : a);
    return new Promise((resolve, reject) => {
      const child = spawn(viaShell ? q(cmd) : cmd, viaShell ? args.map(q) : args, {
        cwd, env, windowsHide: true,
        shell: viaShell,
        detached: !WIN,
      });
      this.child = child;
      const feed = (kind) => {
        let buf = "";
        return (chunk) => {
          buf += chunk.toString("utf8");
          const lines = buf.split(/\r?\n|\r/);
          buf = lines.pop();
          for (const l of lines) if (l.trim()) this.log(l.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ""), kind);
        };
      };
      child.stdout.on("data", feed("out"));
      child.stderr.on("data", feed("err"));
      child.on("error", (e) => { this.child = null; reject(new Error(`Tidak bisa menjalankan ${path.basename(cmd)}: ${e.message}`)); });
      child.on("close", (code) => {
        this.child = null;
        if (this.cancelled) return reject(new Dibatalkan());
        if (code === 0) resolve();
        else reject(new Error(`${label || path.basename(cmd)} gagal (kode ${code}). Lihat log untuk detailnya.`));
      });
    });
  }

  // Unduh dengan laporan progress; file sementara .part supaya unduhan putus tidak dianggap jadi
  async download(url, dest, { step, name } = {}) {
    this.check();
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    this.abort = new AbortController();
    let res;
    try { res = await fetch(url, { signal: this.abort.signal, headers: { "User-Agent": "RilisKu-Pabrik" } }); }
    catch (e) { if (this.cancelled) throw new Dibatalkan(); throw new Error(`Gagal mengunduh ${name || url}. Periksa koneksi internet.`); }
    if (!res.ok) throw new Error(`Gagal mengunduh ${name || url} (kode ${res.status}).`);
    const total = +res.headers.get("content-length") || 0;
    const part = dest + ".part";
    const out = fs.createWriteStream(part);
    let got = 0, last = 0, lastGot = 0, lastT = Date.now();
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        got += value.length;
        if (!out.write(value)) await new Promise((r) => out.once("drain", r));
        const now = Date.now();
        if (now - last > 250) {
          const speed = ((got - lastGot) / Math.max(1, now - lastT)) * 1000;
          lastGot = got; lastT = now; last = now;
          this.emit({ type: "progress", step, name, got, total, speed });
        }
      }
    } catch (e) {
      out.destroy();
      try { fs.unlinkSync(part); } catch {}
      if (this.cancelled) throw new Dibatalkan();
      throw new Error(`Unduhan ${name || ""} terputus. Coba lagi.`);
    } finally { this.abort = null; }
    await new Promise((r) => out.end(r));
    this.emit({ type: "progress", step, name, got, total: total || got, speed: 0 });
    fs.renameSync(part, dest);
    return dest;
  }
}

// Ekstrak ZIP: pakai tar bawaan Windows 10+ (cepat), kalau tidak ada pakai adm-zip
async function extractZip(job, file, dir) {
  fs.mkdirSync(dir, { recursive: true });
  if (WIN) {
    try { await job.run("tar", ["-xf", file, "-C", dir], { label: `Mengekstrak ${path.basename(file)}` }); return; }
    catch (e) { if (e.cancelled) throw e; job.log("tar gagal, memakai pengekstrak cadangan", "err"); }
  }
  const AdmZip = require("adm-zip");
  await new Promise((resolve, reject) => new AdmZip(file).extractAllToAsync(dir, true, false, (err) => (err ? reject(err) : resolve())));
}

// Ukuran folder (untuk halaman Bahan)
async function folderSize(dir) {
  let total = 0;
  const walk = async (d) => {
    let ents;
    try { ents = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) { try { total += (await fs.promises.stat(p)).size; } catch {} }
    }
  };
  await walk(dir);
  return total;
}

module.exports = { Pekerjaan, Dibatalkan, extractZip, folderSize, WIN };
