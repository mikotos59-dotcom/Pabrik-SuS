// Kunci build: mencegah RilisKu dan Pabrik SuS membangun bersamaan di gudang yang sama
const fs = require("fs");
const path = require("path");

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}

function acquire(root, appName, slug) {
  fs.mkdirSync(root, { recursive: true });
  const f = path.join(root, ".sedang-build.json");
  try {
    const cur = JSON.parse(fs.readFileSync(f, "utf8"));
    if (cur.pid !== process.pid && alive(cur.pid)) {
      throw Object.assign(new Error(`${cur.app} sedang membangun ${cur.slug}. Tunggu sampai selesai dulu.`), { locked: true, app: cur.app, slug: cur.slug });
    }
  } catch (e) { if (e.locked) throw e; }
  fs.writeFileSync(f, JSON.stringify({ pid: process.pid, app: appName, slug, at: Date.now() }));
  return () => { try { const cur = JSON.parse(fs.readFileSync(f, "utf8")); if (cur.pid === process.pid) fs.unlinkSync(f); } catch {} };
}

module.exports = { acquire };
