// Menyalin font dari node_modules ke app/fonts (dijalankan setelah npm install)
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const dst = path.join(root, "app", "fonts");
fs.mkdirSync(dst, { recursive: true });
for (const [pkg, f] of [
  ["bricolage-grotesque", "bricolage-grotesque-latin-600-normal.woff2"],
  ["bricolage-grotesque", "bricolage-grotesque-latin-800-normal.woff2"],
  ["atkinson-hyperlegible", "atkinson-hyperlegible-latin-400-normal.woff2"],
  ["atkinson-hyperlegible", "atkinson-hyperlegible-latin-700-normal.woff2"],
  ["jetbrains-mono", "jetbrains-mono-latin-400-normal.woff2"],
]) fs.copyFileSync(path.join(root, "node_modules", "@fontsource", pkg, "files", f), path.join(dst, f));
console.log("Font siap di app/fonts");
