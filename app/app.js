// Pabrik SuS — tampilan
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const main = $("#main");
const I = {
  back: '<svg viewBox="0 0 24 24"><path d="M15.4 5L8.4 12l7 7-1.4 1.4L5.6 12 14 3.6z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6.4 5L12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z"/></svg>',
  ok: '<svg viewBox="0 0 24 24"><path d="M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.4-1.4z"/></svg>',
  skip: '<svg viewBox="0 0 24 24"><path d="M5 11h14v2H5z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>',
  box: '<svg viewBox="0 0 24 24"><path d="M12 2l9 5v10l-9 5-9-5V7zm0 2.3L5.5 8 12 11.7 18.5 8zM5 9.7v6.1l6 3.4v-6.1zm14 0l-6 3.4v6.1l6-3.4z"/></svg>',
  factory: '<svg viewBox="0 0 24 24"><path d="M2 20V9l5 3V9l5 3V9l5 3V4h4v16zm4-4v2h2v-2zm5 0v2h2v-2zm5 0v2h2v-2z"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 5h7l2 2h9v12H3z"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>',
  ext: '<svg viewBox="0 0 24 24"><path d="M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4L17.6 5H14zM5 5h6v2H7v10h10v-4h2v6H5z"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><path d="M8 3h11v13h-2V5H8zM4 7h11v14H4zm2 2v10h7V9z"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M12 2l11 19H1zm-1 7v5h2V9zm0 7v2h2v-2z"/></svg>',
};
const KIND = { installer: "Installer", portable: "Portable", folder: "Folder" };

// ---------- Bantuan ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function ago(ts) {
  if (!ts) return "";
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return "baru saja";
  if (d < 3600) return `${Math.floor(d / 60)} menit lalu`;
  if (d < 86400) return `${Math.floor(d / 3600)} jam lalu`;
  if (d < 172800) return "kemarin";
  if (d < 86400 * 30) return `${Math.floor(d / 86400)} hari lalu`;
  return new Date(ts).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
function size(b) {
  if (b >= 1 << 30) return (b / (1 << 30)).toFixed(1) + " GB";
  if (b >= 1 << 20) return (b / (1 << 20)).toFixed(1) + " MB";
  if (b >= 1024) return Math.round(b / 1024) + " KB";
  return b + " B";
}
function dur(ms) { const s = Math.round(ms / 1000); return s < 60 ? `${s} detik` : `${Math.floor(s / 60)} menit ${s % 60} detik`; }
function toast(msg, err = false, ms = 2800) {
  const t = $("#toast");
  t.textContent = msg; t.classList.toggle("err", err); t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), err ? 5000 : ms);
}
async function attempt(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r === undefined ? true : r; }
  catch (e) { toast(e.message || "Terjadi kesalahan.", true); return undefined; }
}
const typeBadge = (t) => `<span class="badge type-${t}">${t === "electron" ? "Electron" : "Python"}</span>`;
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => e.preventDefault());
main.addEventListener("click", (e) => { const a = e.target.closest("a[href]"); if (a && /^https:/.test(a.href)) { e.preventDefault(); ps.openUrl(a.href); } });

function dropZone(el, onPaths) {
  el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("over"); });
  el.addEventListener("dragleave", () => el.classList.remove("over"));
  el.addEventListener("drop", (e) => {
    e.preventDefault(); el.classList.remove("over");
    const paths = [...e.dataTransfer.files].map((f) => ps.pathOf(f)).filter(Boolean);
    if (paths.length) onPaths(paths);
  });
}
function openModal(html) {
  const m = $("#modal");
  m.innerHTML = `<div class="box" role="dialog" aria-modal="true">${html}</div>`;
  m.hidden = false;
  m.onclick = (e) => { if (e.target === m) closeModal(); };
  $$("[data-close]", m).forEach((b) => (b.onclick = closeModal));
  return $(".box", m);
}
function closeModal() { const m = $("#modal"); m.hidden = true; m.innerHTML = ""; }
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(); });
function confirmBox(title, text, okLabel = "Ya", danger = false) {
  return new Promise((resolve) => {
    const layer = document.createElement("div");
    layer.className = "modal"; layer.style.zIndex = 30;
    layer.innerHTML = `<div class="box" style="width:min(460px,100%)"><div class="modal-head"><div><h2>${esc(title)}</h2><p>${text}</p></div></div>
      <div class="modal-foot"><button class="btn" data-no>Batal</button><button class="btn ${danger ? "danger" : "primary"}" data-yes>${esc(okLabel)}</button></div></div>`;
    document.body.appendChild(layer);
    const done = (v) => { layer.remove(); resolve(v); };
    $("[data-no]", layer).onclick = () => done(false);
    $("[data-yes]", layer).onclick = () => done(true);
    $("[data-yes]", layer).focus();
  });
}

// ---------- Status build (tetap tersimpan saat pindah halaman) ----------
const run = { slug: null, steps: [], status: {}, notes: {}, progress: {}, logs: [], error: null, outputs: null, skipped: false, icon: null, started: 0, finished: false, finishedAt: 0 };
const view = { slug: null, plan: [], outputs: null };
ps.on((ev) => {
  if (ev.slug !== run.slug) return;
  if (ev.type === "plan") run.steps = ev.steps;
  if (ev.type === "step") { run.status[ev.id] = ev.status; if (ev.note !== undefined) run.notes[ev.id] = ev.note; }
  if (ev.type === "progress") run.progress[ev.step] = ev;
  if (ev.type === "log") { run.logs.push(ev); if (run.logs.length > 3000) run.logs.splice(0, run.logs.length - 3000); }
  if (view.slug === ev.slug) { if (ev.type === "log") appendLog(ev); else drawRun(); }
});

// ---------- Daftar proyek ----------
async function renderHome() {
  view.slug = null;
  main.innerHTML = `<div class="wrap">
    <div class="page-head"><div><h1>Proyek</h1><p>Seret arsip kode sumber (.zip, .7z, .rar) ke sini, lalu klik Bangun. Hasilnya Setup.exe dan/atau zip portable.</p></div>
      <button class="btn primary" id="add">${I.plus}Tambah kode sumber</button></div>
    <div class="drop" id="drop">${I.factory}<span>Seret arsip kode sumber (.zip, .7z, .rar) ke sini. Proyek yang sudah ada otomatis diperbarui: file berubah ditimpa, file yang hilang dihapus.</span></div>
    <div id="list"><div class="waiting"><span class="dot"></span>Memuat…</div></div>
    <p class="foot-note" id="where"></p>
  </div>`;
  $("#add").onclick = async () => { const p = await ps.pickZip(); if (p) importSource(p); };
  dropZone($("#drop"), (paths) => importSource(paths[0]));
  const info = await attempt(() => ps.info());
  if (!info || view.slug) return;
  $("#where").innerHTML = `Lokasi pabrik: <span class="mono">${esc(info.root)}</span>${info.shared ? ' <span class="badge ok">gudang bersama RilisKu</span>' : ""}`;
  if (!info.projects.length) {
    $("#list").innerHTML = `<div class="empty"><h2>Belum ada proyek</h2><p>Minta kode sumber aplikasi dalam bentuk arsip .zip, .7z, atau .rar (biasanya cuma ratusan KB), lalu seret ke kotak di atas.<br>Mendukung aplikasi <b>Electron</b> dan <b>Python</b>.</p></div>`;
    return;
  }
  $("#list").innerHTML = `<div class="list">${info.projects.map((p) => {
    const lb = p.lastBuild;
    const st = info.building === p.slug ? `<span class="st-busy">Sedang dibangun…</span>`
      : !lb ? "Belum pernah dibangun"
      : lb.ok ? `<span class="st-ok">Berhasil ${ago(lb.at)} · ${lb.outputs.length} hasil</span>`
      : `<span class="st-fail">Gagal ${ago(lb.at)}</span>`;
    return `<button class="row" data-slug="${esc(p.slug)}">
      <span class="ic">${p.icon ? `<img src="${p.icon}" alt="">` : I.box}</span>
      <span class="nm"><b>${esc(p.name)}</b>${typeBadge(p.type)}${p.version ? `<span class="ver">v${esc(p.version)}</span>` : ""}</span>
      <span class="ds">${st}${p.repo ? ` · <span class="mono">${esc(p.repo)}</span>` : ""}</span>
      <span class="side">kode diperbarui ${ago(p.imported)}</span>
    </button>`;
  }).join("")}</div>`;
  $$(".row").forEach((b) => (b.onclick = () => openProject(b.dataset.slug)));
}

// current: proyek yang sedang dibuka (kalau arsip ternyata proyek lain, beri tahu)
async function importSource(p, current = null) {
  if (!p) return;
  if (!/\.(zip|7z|rar)$/i.test(p)) { toast("Pakai arsip kode sumber: .zip, .7z, atau .rar.", true); return; }
  try {
    const r = await ps.importZip(p);
    const s = r.stats;
    closeModal();
    if (current && r.project.slug !== current.slug) toast(`Arsip ini berisi proyek lain (${r.project.name}), jadi ditambahkan sebagai proyek terpisah.`, false, 5000);
    else if (!r.isNew && !s.added && !s.updated && !s.removed) toast(`${r.project.name}: kode sumber sama persis, tidak ada yang berubah.`, false, 4000);
    else toast(r.isNew ? `${r.project.name} ditambahkan (${r.project.files} file)` : `${r.project.name} diperbarui: ${s.added} baru, ${s.updated} diubah, ${s.removed} dihapus`, false, 4000);
    openProject(r.project.slug);
  } catch (e) { toast(e.message, true); }
}

function openUpdateSource(st) {
  const box = openModal(`<div class="modal-head"><div><h2>Perbarui kode sumber</h2><p>${esc(st.name)}${st.version ? " v" + esc(st.version) : ""} · File yang berubah ditimpa, file yang hilang dihapus. Paket dan hasil build lama tetap disimpan.</p></div><button class="x" data-close aria-label="Tutup">${I.x}</button></div>
    <div class="drop big" id="upDrop">${I.factory}<div><b>Seret arsip kode sumber versi baru ke sini</b><div class="muted" style="font-size:13px;margin-top:4px">.zip, .7z, atau .rar</div></div></div>
    <div style="display:flex;justify-content:center;gap:8px;margin-top:12px"><button class="btn primary" id="upPick">${I.folder}Cari file</button><button class="btn" data-close>Batal</button></div>`);
  dropZone($("#upDrop", box), (paths) => importSource(paths[0], st));
  $("#upPick", box).onclick = async () => { const p = await ps.pickZip(); if (p) importSource(p, st); };
}

// ---------- Halaman proyek ----------
async function openProject(slug) {
  view.slug = slug;
  let st, plan, review;
  try { [st, plan, review] = await Promise.all([ps.project(slug), ps.plan(slug), ps.review(slug)]); }
  catch (e) { toast(e.message, true); return renderHome(); }
  if (view.slug !== slug) return;
  view.plan = plan;
  view.outputs = st.lastBuild && st.lastBuild.ok ? st.lastBuild.outputs : null;
  view.project = st;
  const opts = JSON.parse(localStorage.getItem("opts-" + slug) || '{"targets":"both"}');
  const lb = st.lastBuild;
  main.innerHTML = `<div class="wrap">
    <button class="back" id="back">${I.back}Proyek</button>
    <div class="head">
      <span class="ic big" id="icon">${st.icon ? `<img src="${st.icon}" alt="">` : I.box}</span>
      <div style="min-width:0"><h1>${esc(st.name)} ${typeBadge(st.type)} ${st.version ? `<span class="ver">v${esc(st.version)}</span>` : ""}</h1>
        <p class="muted" style="margin:6px 0 0">${st.files} file dari <span class="mono">${esc(st.sourceName || "")}</span> · diperbarui ${ago(st.imported)}</p></div>
    </div>
    <div class="actions">
      <button class="btn" id="upd">Perbarui kode sumber</button>
      <button class="btn" id="code">${I.folder}Buka folder kode</button>
      <button class="btn danger" id="del">Hapus dari pabrik</button>
    </div>
    <div class="grid">
      <div>
        <div id="review"></div>
        <section class="section">
          <div class="section-h"><h3>Langkah build</h3><span class="muted" id="time" style="font-size:13px"></span></div>
          <ul class="steps" id="steps"></ul>
          <div class="log-head"><button class="btn small" id="logT">Tampilkan log</button><button class="btn small" id="logC" hidden>${I.copy}Salin log</button></div>
          <pre class="log" id="log" hidden></pre>
        </section>
        <section class="section" id="out" hidden></section>
      </div>
      <aside class="side-card">
        <h3>Pengaturan build</h3>
        ${st.type === "electron" ? `
          <label class="check"><input type="radio" name="t" value="both" ${opts.targets === "both" ? "checked" : ""}><span><b>Installer + portable</b><br><span class="muted">Setup.exe dan zip</span></span></label>
          <label class="check"><input type="radio" name="t" value="installer" ${opts.targets === "installer" ? "checked" : ""}><span><b>Installer saja</b></span></label>
          <label class="check"><input type="radio" name="t" value="portable" ${opts.targets === "portable" ? "checked" : ""}><span><b>Portable saja</b> (zip)</span></label>`
        : `<p class="muted" style="margin:0;font-size:14px">Hasil mengikuti resep proyek: exe dari PyInstaller${plan.some((x) => x.id === "installer") ? ", lalu installer dari Inno Setup" : ""}.</p>`}
        <label class="check"><input type="checkbox" id="force"><span>Paksa bangun ulang semua<br><span class="muted" style="font-size:13px">Pasang ulang paket walau tidak berubah.</span></span></label>
        <button class="btn primary" id="go" style="justify-content:center;padding:12px">${I.factory}Bangun</button>
        <button class="btn danger" id="stop" hidden style="justify-content:center">${I.stop}Hentikan</button>
        ${lb && lb.ok ? `<p class="muted" style="margin:0;font-size:13px">Build terakhir berhasil ${ago(lb.at)}${lb.durationMs && !lb.skipped ? ` dalam ${dur(lb.durationMs)}` : ""}.</p>` : ""}
        <hr style="border:0;border-top:1px solid var(--line);margin:4px 0">
        <h3>Repo GitHub (opsional)</h3>
        <p class="muted" style="margin:0;font-size:13px">Untuk tombol "Buka halaman rilis". Tanpa login: halaman rilis dibuka di browser.</p>
        <div class="repo-row"><input class="input mono" id="repo" placeholder="nama-akun/nama-repo" value="${esc(st.repo || "")}" spellcheck="false"><button class="btn small" id="repoSave">Simpan</button></div>
      </aside>
    </div>
  </div>`;
  $("#back").onclick = renderHome;
  $("#upd").onclick = () => openUpdateSource(st);
  dropZone($(".wrap", main), (paths) => importSource(paths[0], st));
  $("#code").onclick = () => ps.open(st.workspace);
  $("#del").onclick = async () => {
    if (!(await confirmBox(`Hapus ${st.name} dari pabrik?`, "Folder kerja (kode, paket, dan hasil build) dihapus. Gudang bahan tidak ikut terhapus.", "Hapus", true))) return;
    if (await attempt(() => ps.remove(slug), "Proyek dihapus")) renderHome();
  };
  $$('input[name="t"]').forEach((r) => (r.onchange = () => localStorage.setItem("opts-" + slug, JSON.stringify({ targets: r.value }))));
  $("#go").onclick = () => startBuild(slug);
  $("#stop").onclick = () => ps.cancel();
  $("#logT").onclick = () => toggleLog();
  $("#logC").onclick = () => { ps.copy(run.logs.map((l) => l.text).join("\n")); toast("Log disalin"); };
  $("#repoSave").onclick = async () => {
    const r = await attempt(() => ps.setRepo(slug, $("#repo").value), "Repo disimpan");
    if (r) { view.project = r; $("#repo").value = r.repo || ""; drawOutputs(); }
  };
  drawReview(review);
  drawRun();
  if (run.slug === slug && run.logs.length) { $("#log").textContent = ""; run.logs.forEach(appendLog); }
}

function drawReview(review) {
  const box = $("#review");
  if (review.trusted) { box.innerHTML = ""; $("#go").disabled = false; return; }
  $("#go").disabled = true;
  box.innerHTML = `<section class="section review">
    <div class="section-h"><h3 style="display:flex;gap:8px;align-items:center;color:#ffd166">${I.warn}<span style="color:var(--ink)">Tinjau dulu sebelum build</span></h3></div>
    <p style="margin:0 0 12px">Build akan menjalankan perintah dari dalam kode sumber ini di komputermu. Pastikan kodenya dari sumber yang kamu percaya. Persetujuan diminta lagi kalau skripnya berubah.</p>
    ${review.items.map((it) => `<details class="item"><summary>${esc(it.title)}</summary><pre>${esc(it.body)}</pre>${(it.files || []).map((f) => `<div class="muted" style="font-size:13px;margin-top:8px">${esc(f.name)}:</div><pre>${esc(f.body)}</pre>`).join("")}</details>`).join("")}
    <button class="btn primary" id="trust" style="margin-top:12px">Saya percaya kode ini, izinkan build</button>
  </section>`;
  $("#trust").onclick = async () => { if (await attempt(() => ps.trust(view.slug, review.hash), "Diizinkan")) { box.innerHTML = ""; $("#go").disabled = false; } };
}

function drawRun() {
  const ul = $("#steps");
  if (!ul) return;
  const mine = run.slug === view.slug;
  const active = mine && run.started && !run.finished;
  const steps = mine && run.steps.length ? run.steps : view.plan;
  ul.innerHTML = steps.map((s) => {
    const st = mine ? run.status[s.id] : null;
    const cls = { doing: "doing", done: "done", skip: "skip", warn: "warn", fail: "fail", cancel: "fail" }[st] || "";
    const icon = { done: I.ok, skip: I.skip, warn: "!", fail: I.x, cancel: I.x }[st] || "";
    const pr = mine ? run.progress[s.id] : null;
    const note = mine ? run.notes[s.id] : "";
    const prLine = pr && st === "doing" ? `${pr.name || ""} · ${size(pr.got)}${pr.total ? " / " + size(pr.total) : ""}${pr.speed > 0 ? " · " + size(pr.speed) + "/s" : ""}` : "";
    return `<li class="${cls}"><span class="ic2">${icon}</span><span class="tx">${esc(s.title)}${st === "skip" ? ' <span class="muted" style="font-weight:400">· dilewati</span>' : ""}</span>
      ${note || prLine ? `<span class="sub">${esc(prLine || note)}</span>` : ""}
      ${pr && st === "doing" && pr.total ? `<span class="bar"><i style="width:${(pr.got / pr.total) * 100}%"></i></span>` : ""}</li>`;
  }).join("");
  $("#go").hidden = active; $("#stop").hidden = !active;
  $("#time").textContent = active ? "berjalan…" : mine && run.finishedAt ? `selesai dalam ${dur(run.finishedAt - run.started)}` : "";
  if (mine && run.icon) $("#icon").innerHTML = `<img src="${run.icon}" alt="">`;
  drawOutputs();
}

function drawOutputs() {
  const box = $("#out");
  if (!box) return;
  const mine = run.slug === view.slug;
  const err = mine && run.error ? `<p class="error" style="margin:0 0 10px">${esc(run.error)}</p>` : "";
  const outs = mine && run.finished ? run.outputs : mine && run.started ? null : view.outputs;
  if (!outs || !outs.length) {
    box.hidden = !err;
    box.innerHTML = err ? `<div class="section-h"><h3>Build berhenti</h3></div>${err}<p class="muted" style="margin:0">Buka log untuk melihat penyebabnya. Salin log lalu kirim ke yang membuat kode sumbernya kalau perlu bantuan.</p>` : "";
    return;
  }
  box.hidden = false;
  const files = outs.filter((o) => o.kind !== "folder");
  const repo = view.project && view.project.repo;
  box.innerHTML = `<div class="section-h"><h3>Hasil build</h3>${mine && run.skipped ? '<span class="muted" style="font-size:13px">memakai hasil sebelumnya</span>' : ""}</div>${err}
    <ul class="outs">${outs.map((o, i) => `<li><span class="badge">${KIND[o.kind] || o.kind}</span><span class="n">${esc(o.name)}</span><span class="s">${o.size ? size(o.size) : ""}</span>
      <button class="btn small" data-rev="${i}">${I.folder}Tampilkan</button>${o.kind === "installer" ? `<button class="btn small" data-inst="${i}">Pasang</button>` : ""}</li>`).join("")}</ul>
    ${files.length ? `<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;align-items:center">
      <button class="btn primary" id="rel" ${repo ? "" : "disabled"}>${I.ext}Buka halaman rilis GitHub</button>
      <span class="muted" style="font-size:13px">${repo ? `Browser membuka halaman rilis baru <span class="mono">${esc(repo)}</span> dan folder hasil ikut terbuka. Seret file hasil ke halaman itu.` : "Isi repo GitHub di panel kanan untuk memakai tombol ini."}</span></div>` : ""}`;
  $$("[data-rev]", box).forEach((b) => (b.onclick = () => ps.reveal(outs[+b.dataset.rev].path)));
  $$("[data-inst]", box).forEach((b) => (b.onclick = () => ps.open(outs[+b.dataset.inst].path)));
  $("#rel", box)?.addEventListener("click", () => attempt(() => ps.releasePage(view.slug)));
}

function appendLog(ev) {
  const pre = $("#log");
  if (!pre) return;
  const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 30;
  const line = document.createElement("span");
  line.className = "l-" + ev.kind;
  line.textContent = ev.text + "\n";
  pre.appendChild(line);
  while (pre.childNodes.length > 3000) pre.removeChild(pre.firstChild);
  if (atBottom) pre.scrollTop = pre.scrollHeight;
}
function toggleLog(force) {
  const pre = $("#log");
  const show = force !== undefined ? force : pre.hidden;
  pre.hidden = !show;
  $("#logT").textContent = show ? "Sembunyikan log" : "Tampilkan log";
  $("#logC").hidden = !show;
  if (show) pre.scrollTop = pre.scrollHeight;
}

async function startBuild(slug) {
  const targets = ($('input[name="t"]:checked') || {}).value || "both";
  const force = $("#force") && $("#force").checked;
  Object.assign(run, { slug, steps: view.plan, status: {}, notes: {}, progress: {}, logs: [], error: null, outputs: null, skipped: false, icon: null, started: Date.now(), finished: false, finishedAt: 0 });
  $("#log").textContent = "";
  drawRun();
  try {
    const r = await ps.build(slug, { targets, force });
    run.outputs = r.outputs; run.skipped = r.skipped; run.icon = r.project && r.project.icon;
    if (view.slug === slug) { view.outputs = r.outputs; view.project = r.project; }
    toast(r.skipped ? "Tidak ada perubahan, memakai hasil sebelumnya" : "Build selesai");
  } catch (e) {
    run.error = e.message;
    const cancelled = /Dibatalkan/.test(e.message);
    if (view.slug === slug && !cancelled) toggleLog(true);
    toast(cancelled ? "Build dihentikan" : e.message, !cancelled);
  } finally {
    run.finished = true; run.finishedAt = Date.now();
    if (view.slug === slug) drawRun();
  }
}

// ---------- Gudang bahan & pengaturan ----------
async function openBahan() {
  const box = openModal(`<div class="modal-head"><div><h2>Gudang bahan</h2><p>Alat dan cache build. Yang sudah ada tidak diunduh ulang. Alat yang sudah terpasang di Windows langsung dipakai.</p></div><button class="x" data-close aria-label="Tutup">${I.x}</button></div>
    <div id="bl"><div class="waiting"><span class="dot"></span>Menghitung isi gudang…</div></div>`);
  const draw = async () => {
    const items = await attempt(() => ps.bahan());
    if (!items) return;
    const total = items.reduce((t, i) => t + i.size, 0);
    $("#bl", box).innerHTML = `<ul class="bahan">${items.map((i) => `<li>
        <div><b>${esc(i.name)}</b>${i.cache ? "" : i.found ? ` <span class="badge ${i.where === "gudang" ? "" : "ok"}">${i.where === "gudang" ? "di gudang" : "terpasang di Windows"}${i.version ? " · " + esc(i.version) : ""}</span>` : ' <span class="badge">belum ada, diunduh saat dibutuhkan</span>'}
          ${i.note ? `<div class="muted" style="font-size:13px">${esc(i.note)}</div>` : ""}</div>
        <span class="s">${i.size ? size(i.size) : "–"}</span>
        ${i.size ? `<button class="btn small" data-clean="${i.key}">Bersihkan</button>` : "<span></span>"}</li>`).join("")}</ul>
      <p class="muted" style="margin:14px 0 0">Total di gudang: <b>${size(total)}</b>. Membersihkan cache aman; build berikutnya hanya lebih lama karena mengunduh lagi.</p>`;
    $$("[data-clean]", box).forEach((b) => (b.onclick = async () => { b.disabled = true; if (await attempt(() => ps.cleanBahan(b.dataset.clean), "Dibersihkan")) draw(); else b.disabled = false; }));
  };
  draw();
}
async function openSettings() {
  const info = await attempt(() => ps.info());
  if (!info) return;
  const box = openModal(`<div class="modal-head"><div><h2>Pengaturan</h2><p>Pabrik SuS ${esc(info.version)} · Pengembang: @SuS_X_x</p></div><button class="x" data-close aria-label="Tutup">${I.x}</button></div>
    <div class="set-row"><div><b>Lokasi pabrik</b><p class="mono">${esc(info.root)}</p>${info.shared ? '<p>Memakai gudang yang sama dengan RilisKu, jadi bahan tidak diunduh dua kali.</p>' : ""}</div><button class="btn small" id="chg">Ganti</button></div>
    <div class="set-row"><div><b>Komunitas</b><p>Laporan bug, saran, dan rilis terbaru ada di Discord Bengkel SuS.</p></div><button class="btn small" id="dc">${I.ext}Buka</button></div>
    <div class="modal-foot"><button class="btn primary" data-close>Selesai</button></div>`);
  $("#chg", box).onclick = async () => {
    if (!(await confirmBox("Ganti lokasi pabrik?", "Bahan dan proyek di lokasi lama tidak ikut pindah; build berikutnya mengunduh ulang bahan ke lokasi baru. Pilih drive yang lega, karena gudang bisa mencapai 1–2 GB.", "Pilih folder"))) return;
    const r = await attempt(() => ps.pickRoot());
    if (r && r !== true) { closeModal(); toast("Lokasi pabrik diganti"); renderHome(); }
  };
  $("#dc", box).onclick = () => ps.openUrl("https://discord.gg/VRqw9EGUpb");
}

$("#home").onclick = renderHome;
$("#bahanBtn").onclick = openBahan;
$("#setBtn").onclick = openSettings;
renderHome();
