const { contextBridge, ipcRenderer, webUtils } = require("electron");

const call = (ch) => async (...args) => {
  const r = await ipcRenderer.invoke(ch, ...args);
  if (r && r.ok === false) throw new Error(r.error);
  return r ? r.data : undefined;
};

contextBridge.exposeInMainWorld("ps", {
  info: call("info"),
  pickRoot: call("pick-root"),
  pickZip: call("pick-zip"),
  importZip: call("import"),
  project: call("project"),
  plan: call("plan"),
  review: call("review"),
  trust: call("trust"),
  build: call("build"),
  cancel: call("cancel"),
  bahan: call("bahan"),
  cleanBahan: call("bahan-clean"),
  remove: call("remove"),
  setRepo: call("set-repo"),
  releasePage: call("release-page"),
  reveal: call("reveal"),
  open: call("open"),
  openUrl: call("open-url"),
  copy: call("copy"),
  pathOf: (file) => webUtils.getPathForFile(file),
  on: (fn) => ipcRenderer.on("event", (_e, ev) => fn(ev)),
});
