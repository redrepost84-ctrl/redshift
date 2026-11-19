const { contextBridge, ipcRenderer } = require('electron');

let cachedVersion = '0.1.0';
try {
  const pkg = require('../package.json');
  if (pkg && pkg.version) cachedVersion = pkg.version;
} catch (_) {}

contextBridge.exposeInMainWorld('redshiftDesktop', {
  isElectron: true,
  platform: process.platform,
  version: cachedVersion,

  // Launcher & Auto-Updater
  closeLauncher: () => ipcRenderer.send('launcher-close'),
  launcherReady: () => ipcRenderer.send('launcher-finished'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  initiateUpdate: () => ipcRenderer.send('initiate-update'),
  startDownloadUpdate: () => ipcRenderer.send('start-download-update'),
  applyUpdateAndRestart: () => ipcRenderer.send('apply-update-and-restart'),
  startFirstTimeInstall: () => ipcRenderer.send('start-first-time-install'),

  onUpdateProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('update-progress', listener);
    return () => ipcRenderer.removeListener('update-progress', listener);
  },
  onUpdateComplete: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('update-complete', listener);
    return () => ipcRenderer.removeListener('update-complete', listener);
  },
  onUpdateError: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('update-error', listener);
    return () => ipcRenderer.removeListener('update-error', listener);
  },
  onInstallProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('install-progress', listener);
    return () => ipcRenderer.removeListener('install-progress', listener);
  },
  onInstallComplete: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('install-complete', listener);
    return () => ipcRenderer.removeListener('install-complete', listener);
  },
  onInstallError: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('install-error', listener);
    return () => ipcRenderer.removeListener('install-error', listener);
  },
  onBackgroundUpdateAvailable: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('background-update-available', listener);
    return () => ipcRenderer.removeListener('background-update-available', listener);
  },

  // Native Screen & Window Capture (desktopCapturer)
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
  selectDesktopSource: (sourceId, withAudio) =>
    ipcRenderer.invoke('select-desktop-source', { sourceId, withAudio }),

  // Desktop Config, Server URL & Tray
  getDesktopConfig: () => ipcRenderer.invoke('get-desktop-config'),
  saveDesktopConfig: (patch) => ipcRenderer.invoke('save-desktop-config', patch),
  setUnreadCount: (count) => ipcRenderer.send('set-unread-count', Number(count) || 0),
  openExternal: (url) => ipcRenderer.send('open-external', String(url || '')),
  relaunchApp: () => ipcRenderer.send('relaunch-app'),
  quitApp: () => ipcRenderer.send('app-quit'),
});
