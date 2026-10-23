# Pabrik SuS

Rakit file **exe** dan **installer** Windows dari arsip kode sumber (.zip, .7z, .rar), tanpa login apa pun.
Saudara dari [RilisKu](https://github.com/mikotos59-dotcom/RilisKu): Pabrik SuS untuk merakit, RilisKu untuk merakit sekaligus merilis ke GitHub.

Pengembang: @SuS_X_x · Komunitas: Discord Bengkel SuS

## Cara pakai

1. Seret arsip kode sumber (.zip, .7z, atau .rar) ke jendela Pabrik SuS (atau klik **Tambah kode sumber**).
   Untuk versi baru, klik **Perbarui kode sumber** lalu seret arsipnya atau klik **Cari file**, atau seret langsung ke halaman proyek.
   Proyek yang sudah ada diperbarui ala GitHub: file berubah ditimpa, file yang hilang dihapus.
2. Build pertama: baca skrip yang akan dijalankan, lalu klik **Saya percaya kode ini**.
3. Pilih hasil (Installer + portable / installer saja / portable saja), lalu klik **Bangun**.
4. Hasil bisa ditampilkan di folder atau langsung dipasang.

**Merilis ke GitHub tanpa login:** isi kolom *Repo GitHub* (misalnya `nama-akun/nama-repo` atau tempel link repo),
lalu klik **Buka halaman rilis GitHub**. Browser membuka halaman rilis baru dengan tag versi dan judul sudah terisi,
dan folder hasil ikut terbuka. Tinggal seret file hasil ke halaman GitHub, lalu klik *Publish release*.

## Resep yang didukung

- **Electron** (`package.json` dengan electron / electron-builder): npm install → `npm run setup` (kalau ada) →
  electron-builder (installer NSIS dan/atau zip, ikon exe terpasang).
- **Python** (`requirements.txt`, `.spec`, `versi.py`): venv `.venv-build` → pip → skrip `ambil_*.ps1` /
  `pabrik.json` `"sebelum"` → PyInstaller → Inno Setup (kalau ada `.iss`, versi dari `versi.py`).

## Gudang bahan

Node.js, Python 3.12, Inno Setup, dan cache npm/pip/Electron disimpan sekali lalu dipakai ulang.
Alat yang sudah terpasang di Windows langsung dipakai. Kalau RilisKu juga terpasang, Pabrik SuS memakai gudang yang sama
(`%LOCALAPPDATA%\RilisKu\Pabrik`) dan keduanya tidak akan membangun bersamaan.

Langkah yang tidak perlu dilewati: paket tidak dipasang ulang kalau tidak berubah, dan build dilewati kalau kode sama persis
dengan build terakhir. Kalau proyek hanya punya `icon.png`, `.ico` 16–256 px dibuat otomatis.

## Pengembangan

```
npm install
npm start
npm run build:win
```

Mesin pabrik ada di `lib/pabrik/` dan sama persis dengan yang di RilisKu.
