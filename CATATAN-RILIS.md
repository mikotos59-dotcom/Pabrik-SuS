# Catatan rilis Pabrik SuS

File ini dipakai untuk mengisi catatan rilis secara otomatis.
Tulis bagian baru di paling atas dengan judul `## <versi>`.

## 0.1.3
- **Antrean build:** kalau satu proyek sedang dibangun, proyek lain tinggal klik "Masukkan antrean" dan mulai otomatis begitu giliran tiba.
- Daftar proyek menampilkan yang sedang dibangun dan urutan antrean; proyek bisa dikeluarkan dari antrean kapan saja.
- Kode sumber proyek lain bisa diunggah atau diperbarui walau sedang ada build berjalan.
- RilisKu dan Pabrik SuS yang memakai gudang yang sama saling menunggu, tidak lagi gagal karena "sedang membangun".
- Kalau skrip proyek berubah saat menunggu di antrean, build-nya minta ditinjau ulang dulu demi keamanan.

## 0.1.2
- Tombol "Buka halaman rilis GitHub" sekarang mengisi catatan rilis otomatis: daftar file unduhan dan perubahan dari `CATATAN-RILIS.md`.
- Installer dan versi portable diberi keterangan jelas di daftar unduhan.

## 0.1.1
- Perbarui kode sumber: seret file atau klik Cari file.
- Arsip .7z dan .rar didukung, selain .zip.

## 0.1.0
- Rilis pertama: rakit exe dan installer dari kode sumber tanpa login GitHub.
- Gudang bahan dipakai bersama RilisKu kalau ada di PC yang sama.
