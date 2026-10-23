// Pabrik SuS — rakit exe & installer dari ZIP kode sumber (tanpa login)
const { app, BrowserWindow, ipcMain, shell, dialog, Menu, clipboard, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");
const bahan = require("./lib/pabrik/bahan");
const proyek = require("./lib/pabrik/proyek");
const resep = require("./lib/pabrik/resep");
const kunci = require("./lib/pabrik/kunci");
const { Pekerjaan } = require("./lib/pabrik/jalankan");

const APP = "Pabrik SuS";
app.setName(APP);
if (process.env.PABRIK_DATA) app.setPath("userData", process.env.PABRIK_DATA);

let win = null;
let settings = {};
const settingsFile = () => path.join(app.getPath("userData"), "pengaturan.json");
function loadSettings() { try { settings = JSON.parse(fs.readFileSync(settingsFile(), "utf8")); } catch { settings = {}; } }
function saveSettings() { fs.mkdirSync(app.getPath("userData"), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 1)); }

// Lokasi pabrik: kalau RilisKu sudah punya gudang di PC ini, pakai yang sama supaya bahan tidak diunduh dua kali
const local = () => process.env.LOCALAPPDATA || app.getPath("userData");
const rilisKuRoot = () => path.join(local(), "RilisKu", "Pabrik");
function root() {
  if (process.env.PABRIK_ROOT) return process.env.PABRIK_ROOT;
  if (settings.root) return settings.root;
  if (fs.existsSync(rilisKuRoot())) return rilisKuRoot();
  return path.join(local(), "Pabrik SuS");
}

function createWindow() {
  const icon = path.join(__dirname, "build", "icon.png");
  win = new BrowserWindow({
    width: 1200, height: 800, minWidth: 900, minHeight: 600, backgroundColor: "#151a21", title: APP, show: false, autoHideMenuBar: true,
    icon: fs.existsSync(icon) ? nativeImage.createFromPath(icon) : undefined,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.once("ready-to-show", () => win.show());
  win.loadFile(path.join(__dirname, "app", "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); });
  win.webContents.on("before-input-event", (e, i) => { if (i.type === "keyDown" && i.key === "I" && i.control && i.shift) win.webContents.toggleDevTools(); });
  win.on("close", (e) => {
    if (!job) return;
    const r = dialog.showMessageBoxSync(win, { type: "warning", buttons: ["Tetap di sini", "Hentikan build & tutup"], defaultId: 0, cancelId: 0, title: "Build sedang berjalan", message: "Pabrik masih membangun aplikasi. Tutup sekarang dan hentikan build?" });
    if (r === 0) e.preventDefault(); else job.cancel();
  });
}
const send = (ch, ...a) => { if (win && !win.isDestroyed()) win.webContents.send(ch, ...a); };
function handle(ch, fn) {
  ipcMain.handle(ch, async (_e, ...args) => {
    try { return { ok: true, data: await fn(...args) }; }
    catch (e) { return { ok: false, error: e.message || String(e) }; }
  });
}

function slim(st) {
  if (!st) return null;
  const { manifest, ...rest } = st;
  const p = proyek.paths(root(), st.slug);
  return { ...rest, files: manifest ? Object.keys(manifest).length : 0, workspace: p.kode, sumber: p.sumber };
}
// "owner/repo", URL github.com/owner/repo, atau URL .git → "owner/repo"
function parseRepo(s) {
  s = String(s || "").trim();
  if (!s) return null;
  const m = s.match(/(?:github\.com[/:])?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);
  if (!m) throw new Error("Tulis repo seperti nama-akun/nama-repo, atau tempel link repo GitHub.");
  return `${m[1]}/${m[2]}`;
}

let job = null, jobSlug = null;
function register() {
  handle("info", () => ({ root: root(), shared: root() === rilisKuRoot(), projects: proyek.list(root()).map(slim), building: jobSlug, version: app.getVersion() }));
  handle("pick-root", async () => {
    const r = await dialog.showOpenDialog(win, { title: "Pilih folder untuk Pabrik (bahan & proyek)", defaultPath: root(), properties: ["openDirectory", "createDirectory"] });
    if (r.canceled || !r.filePaths[0]) return null;
    settings.root = /pabrik/i.test(path.basename(r.filePaths[0])) ? r.filePaths[0] : path.join(r.filePaths[0], "Pabrik");
    saveSettings();
    return settings.root;
  });
  handle("pick-zip", async () => {
    const r = await dialog.showOpenDialog(win, { title: "Pilih arsip kode sumber", properties: ["openFile"], filters: [{ name: "Arsip kode sumber (.zip, .7z, .rar)", extensions: ["zip", "7z", "rar"] }] });
    return r.canceled ? null : r.filePaths[0] || null;
  });
  handle("import", async (zip) => {
    if (job) throw new Error("Tunggu build yang sedang berjalan selesai dulu.");
    if (!/\.(zip|7z|rar)$/i.test(zip || "") || !fs.existsSync(zip)) throw new Error("Pilih arsip kode sumber: .zip, .7z, atau .rar.");
    const r = await proyek.importArchive(root(), zip);
    return { project: slim(r.project), stats: r.stats, isNew: r.isNew };
  });
  handle("project", (slug) => slim(proyek.load(root(), slug)));
  handle("plan", (slug) => resep.plan(proyek.load(root(), slug), proyek.paths(root(), slug).kode));
  handle("review", (slug) => proyek.scriptsToReview(root(), proyek.load(root(), slug)));
  handle("trust", (slug, hash) => {
    const st = proyek.load(root(), slug);
    if (proyek.scriptsToReview(root(), st).hash !== hash) throw new Error("Skrip berubah sejak ditinjau. Tinjau ulang.");
    st.trusted = hash; proyek.save(root(), st); return true;
  });
  handle("build", async (slug, opts) => {
    if (job) throw new Error("Sudah ada build yang berjalan.");
    const r0 = root();
    const st = proyek.load(r0, slug);
    if (!st) throw new Error("Proyek tidak ditemukan.");
    if (!proyek.scriptsToReview(r0, st).trusted) throw new Error("Tinjau dan setujui skrip proyek ini dulu.");
    const release = kunci.acquire(r0, APP, st.name);
    jobSlug = slug;
    job = new Pekerjaan((ev) => send("event", { slug, ...ev }));
    try {
      const r = await resep.build(job, r0, st, opts || {});
      return { outputs: r.outputs, skipped: r.skipped, project: slim(proyek.load(r0, slug)) };
    } finally { job = null; jobSlug = null; release(); }
  });
  handle("cancel", () => { if (job) job.cancel(); });
  handle("bahan", () => bahan.inventory(root()));
  handle("bahan-clean", (key) => { if (job) throw new Error("Tunggu build selesai dulu."); return bahan.clean(root(), key); });
  handle("remove", (slug) => { if (jobSlug === slug) throw new Error("Proyek ini sedang dibangun."); proyek.remove(root(), slug); return true; });
  handle("set-repo", (slug, repo) => { const st = proyek.load(root(), slug); st.repo = parseRepo(repo); proyek.save(root(), st); return slim(st); });
  handle("release-page", (slug) => {
    const st = proyek.load(root(), slug);
    if (!st.repo) throw new Error("Isi repo GitHub proyek ini dulu.");
    const ver = st.version ? `v${st.version}` : "";
    const q = new URLSearchParams();
    if (ver) { q.set("tag", ver); q.set("title", `${st.name} ${st.version}`); }
    shell.openExternal(`https://github.com/${st.repo}/releases/new${ver ? "?" + q.toString() : ""}`);
    // folder hasil ikut dibuka supaya file tinggal diseret ke halaman GitHub
    const first = st.lastBuild && st.lastBuild.ok && st.lastBuild.outputs.find((o) => o.kind !== "folder");
    if (first && fs.existsSync(first.path)) shell.showItemInFolder(first.path);
    return true;
  });
  handle("reveal", (p) => { if (p && fs.existsSync(p)) shell.showItemInFolder(p); });
  handle("open", (p) => { if (p && fs.existsSync(p)) return shell.openPath(p); });
  handle("open-url", (u) => { if (/^https:\/\//.test(u)) shell.openExternal(u); });
  handle("copy", (t) => clipboard.writeText(String(t)));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  loadSettings();
  register();
  createWindow();
});
app.on("window-all-closed", () => app.quit());
