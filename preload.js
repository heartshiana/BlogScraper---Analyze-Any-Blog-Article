const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  scrapeUrl: (url) => ipcRenderer.invoke('scrape-url', url),
  saveJson: (data) => ipcRenderer.invoke('save-json', data),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  detectPython: () => ipcRenderer.invoke('detect-python'),
  setPythonPath: (p) => ipcRenderer.invoke('set-python-path', p),
  browsePython: () => ipcRenderer.invoke('browse-python'),
  checkPackages: () => ipcRenderer.invoke('check-packages'),
  installPackages: (pkgs) => ipcRenderer.invoke('install-packages', pkgs),
  setScraperPath: (p) => ipcRenderer.invoke('set-scraper-path', p),
  getScraperPath: () => ipcRenderer.invoke('get-scraper-path'),
});
