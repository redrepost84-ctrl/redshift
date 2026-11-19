export interface DesktopUpdateInfo {
  ok?: boolean;
  source?: 'env' | 'github' | 'custom' | 'server' | 'unreachable' | 'unconfigured';
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  changelog?: string;
  asarUrl?: string;
  sha256?: string;
  size?: number;
}

export interface DesktopCaptureSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnailDataUrl: string;
  appIconDataUrl: string;
}

export interface DesktopConfig {
  serverUrl: string;
  githubRepo: string;
  customManifestUrl: string;
  minimizeToTray: boolean;
  channel: string;
  version?: string;
  isPackaged?: boolean;
  installDir?: string;
  dataDir?: string;
}

export interface RedshiftDesktopBridge {
  isElectron: true;
  platform: string;
  version: string;
  getPersistentSessionToken?: () => string | null;
  setPersistentSessionToken?: (token: string | null) => void;
  readClipboardText?: () => Promise<string>;
  writeClipboardText?: (text: string) => Promise<{ ok: boolean }>;
  readClipboardImageDataUrl?: () => Promise<string>;
  copyImageFromUrl?: (url: string) => Promise<{ ok: boolean }>;
  closeLauncher: () => void;
  launcherReady: () => void;
  checkForUpdates: () => Promise<DesktopUpdateInfo>;
  initiateUpdate: () => void;
  startDownloadUpdate: () => void;
  applyUpdateAndRestart: () => void;
  startFirstTimeInstall: () => void;
  onBackgroundUpdateAvailable: (cb: (info: DesktopUpdateInfo) => void) => () => void;
  getDesktopSources: () => Promise<DesktopCaptureSource[]>;
  selectDesktopSource: (sourceId: string, withAudio: boolean) => Promise<{ ok: boolean }>;
  getDesktopConfig: () => Promise<DesktopConfig>;
  saveDesktopConfig: (patch: Partial<DesktopConfig>) => Promise<DesktopConfig>;
  setUnreadCount: (count: number) => void;
  openExternal: (url: string) => void;
  relaunchApp: () => void;
  quitApp: () => void;
}

declare global {
  interface Window {
    redshiftDesktop?: RedshiftDesktopBridge;
  }
}

export function getDesktopBridge(): RedshiftDesktopBridge | null {
  if (typeof window !== 'undefined' && window.redshiftDesktop?.isElectron) {
    return window.redshiftDesktop;
  }
  return null;
}

export function isElectronDesktop(): boolean {
  return Boolean(getDesktopBridge());
}
