// Antrean build: satu build berjalan, sisanya menunggu dan otomatis dimulai bergiliran.
// Kalau aplikasi saudara (RilisKu / Pabrik SuS) sedang memakai gudang yang sama, antrean menunggu sampai selesai.
const proyek = require("./proyek");
const resep = require("./resep");
const kunci = require("./kunci");
const { Pekerjaan } = require("./jalankan");

class Antrean {
  // root(): lokasi pabrik · appName: nama aplikasi untuk kunci · emit(ev): kirim event ke tampilan
  constructor({ root, appName, emit }) {
    this.root = root; this.appName = appName; this.emit = emit;
    this.items = [];          // [{ slug, name, opts, at }]
    this.job = null; this.current = null; // { slug, name, started }
    this.waiting = null;      // pesan kalau sedang menunggu aplikasi lain
    this.timer = null;
  }
  get busy() { return !!this.job || this.items.length > 0; }
  has(slug) { return (this.current && this.current.slug === slug) || this.items.some((q) => q.slug === slug); }
  state() {
    return { building: this.current ? this.current.slug : null, current: this.current, waiting: this.waiting,
      queue: this.items.map((q, i) => ({ slug: q.slug, name: q.name, pos: i + 1 })) };
  }
  changed() { this.emit({ type: "queue", ...this.state() }); }

  // Tambah ke antrean. Hasil: { started: true } atau { pos: n }
  add(slug, opts = {}) {
    const st = proyek.load(this.root(), slug);
    if (!st) throw new Error("Proyek tidak ditemukan.");
    if (!proyek.scriptsToReview(this.root(), st).trusted) throw new Error("Tinjau dan setujui skrip proyek ini dulu.");
    if (this.current && this.current.slug === slug) throw new Error(`${st.name} sedang dibangun.`);
    const q = this.items.find((x) => x.slug === slug);
    if (q) { q.opts = opts; throw new Error(`${st.name} sudah ada di antrean (urutan ${this.items.indexOf(q) + 1}).`); }
    this.items.push({ slug, name: st.name, opts, at: Date.now() });
    const willStart = !this.job && this.items.length === 1 && !this.waiting;
    this.changed();
    this.pump();
    return willStart ? { started: true } : { pos: this.items.findIndex((x) => x.slug === slug) + 1 };
  }
  remove(slug) {
    const i = this.items.findIndex((q) => q.slug === slug);
    if (i < 0) return false;
    this.items.splice(i, 1);
    if (!this.items.length && this.waiting) { this.waiting = null; clearTimeout(this.timer); }
    this.changed();
    return true;
  }
  cancel() { if (this.job) this.job.cancel(); }
  cancelAll() { this.items = []; this.waiting = null; clearTimeout(this.timer); if (this.job) this.job.cancel(); this.changed(); }

  async pump() {
    if (this.job || !this.items.length) return;
    clearTimeout(this.timer);
    const root = this.root();
    const next = this.items[0];
    let release;
    try { release = kunci.acquire(root, this.appName, next.name); }
    catch (e) {
      if (!e.locked) throw e;
      // aplikasi lain sedang membangun: coba lagi sebentar lagi
      const msg = `Menunggu ${e.app} selesai membangun ${e.slug}…`;
      if (this.waiting !== msg) { this.waiting = msg; this.changed(); }
      this.timer = setTimeout(() => this.pump(), 4000);
      return;
    }
    this.waiting = null;
    this.items.shift();
    const slug = next.slug;
    this.current = { slug, name: next.name, started: Date.now() };
    this.job = new Pekerjaan((ev) => this.emit({ slug, ...ev }));
    this.changed();
    this.emit({ slug, type: "start" });
    try {
      const st = proyek.load(root, slug);
      if (!st) throw new Error("Proyek sudah dihapus dari pabrik.");
      // kode bisa diperbarui saat menunggu: skrip yang berubah wajib ditinjau lagi
      if (!proyek.scriptsToReview(root, st).trusted) throw new Error("Skrip proyek berubah saat menunggu di antrean. Tinjau ulang lalu bangun lagi.");
      const r = await resep.build(this.job, root, st, next.opts || {});
      const after = proyek.load(root, slug);
      this.emit({ slug, type: "done", outputs: r.outputs, skipped: r.skipped, icon: after && after.icon, name: next.name });
    } catch (e) {
      this.emit({ slug, type: "error", error: e.message || String(e), cancelled: !!(this.job && this.job.cancelled), name: next.name });
    } finally {
      this.job = null; this.current = null; release();
      this.changed();
      setImmediate(() => this.pump());
    }
  }
}

module.exports = { Antrean };
