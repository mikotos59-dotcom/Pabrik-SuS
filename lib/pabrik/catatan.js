// Catatan rilis otomatis: diambil dari CATATAN-RILIS.md di kode sumber + daftar file unduhan
const NOTE_FILES = ["CATATAN-RILIS.md", "catatan-rilis.md", "CHANGELOG.md", "changelog.md"];

// Ambil bagian untuk versi tertentu, mis. "## 0.2.3" atau "## v0.2.3 — 23 Okt 2026".
// Kalau tidak ada judul versi sama sekali, seluruh isi dipakai.
function section(text, version) {
  if (!text) return "";
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  const heads = [];
  lines.forEach((l, i) => { const m = l.match(/^(#{1,3})\s+(.*)$/); if (m) heads.push({ i, level: m[1].length, title: m[2] }); });
  const v = String(version || "").replace(/^v/i, "");
  const verHeads = heads.filter((h) => /\d+\.\d+/.test(h.title));
  if (!verHeads.length) return lines.filter((l, i) => !(i === 0 && /^#\s/.test(l))).join("\n").trim();
  const h = v ? verHeads.find((x) => new RegExp(`(^|[^\\d.])v?${v.replace(/\./g, "\\.")}([^\\d.]|$)`).test(x.title)) : null;
  if (!h) return "";
  const next = heads.find((x) => x.i > h.i && x.level <= h.level);
  return lines.slice(h.i + 1, next ? next.i : lines.length).join("\n").trim();
}

function describe(name, kind) {
  if (kind === "installer") return "installer (disarankan)";
  if (kind === "portable") return /\.zip$/i.test(name) ? "versi portable, tanpa instal" : "versi portable, langsung jalan";
  if (/setup|installer/i.test(name) || /\.(exe|msi)$/i.test(name)) return "installer (disarankan)";
  if (/\.zip$/i.test(name)) return "versi portable, tanpa instal";
  if (/\.apk$/i.test(name)) return "untuk Android";
  if (/\.appimage$/i.test(name)) return "untuk Linux";
  return "";
}
// names: ["file.exe"] atau [{ name, kind }] (kind dari hasil Pabrik: installer/portable)
function downloads(names) {
  if (!names || !names.length) return "";
  const items = names.map((n) => (typeof n === "string" ? { name: n } : n)).map((n) => ({ ...n, d: describe(n.name, n.kind) }));
  items.sort((a, b) => b.d.includes("disarankan") - a.d.includes("disarankan"));
  return "### Unduh\n" + items.map((n) => `- ${n.name}${n.d ? " — " + n.d : ""}`).join("\n");
}

// Gabungan lengkap: perubahan versi ini + daftar unduhan
function compose(noteText, version, assetNames) {
  const parts = [];
  const dl = downloads(assetNames);
  if (dl) parts.push(dl);
  const s = section(noteText, version);
  if (s) parts.push(/^#{1,4}\s/.test(s) ? s : "### Yang baru\n" + s);
  return parts.join("\n\n");
}

module.exports = { NOTE_FILES, section, downloads, compose, describe };
