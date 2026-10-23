// Memasang ikon & info versi ke .exe Windows tanpa Wine (memakai resedit)
// Pemakaian: node scripts/set-exe-icon.mjs "dist/win-unpacked/Pabrik SuS.exe"
import fs from "fs";
import * as ResEdit from "resedit";
import * as PELibrary from "pe-library";

const exePath = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url)));
const exe = PELibrary.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
const res = PELibrary.NtExecutableResource.from(exe);

const ico = ResEdit.Data.IconFile.from(fs.readFileSync(new URL("../build/icon.ico", import.meta.url)));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const groupId = groups.length ? groups[0].id : 1;
const lang = groups.length ? groups[0].lang : 1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, ico.icons.map((i) => i.data));

const vers = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
const vi = vers[0] || ResEdit.Resource.VersionInfo.createEmpty();
const [a, b, c] = pkg.version.split(".").map(Number);
vi.setFileVersion(a, b, c, 0, 1033);
vi.setProductVersion(a, b, c, 0, 1033);
vi.setStringValues({ lang: 1033, codepage: 1200 }, {
  FileDescription: "Pabrik SuS",
  ProductName: "Pabrik SuS",
  CompanyName: "@SuS_X_x",
  LegalCopyright: "MIT",
  OriginalFilename: "Pabrik SuS.exe",
  InternalName: "Pabrik SuS",
});
vi.outputToResourceEntries(res.entries);

res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
console.log("Ikon & info versi terpasang:", exePath);
