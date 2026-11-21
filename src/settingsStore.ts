import type {
  UserPreferences,
  VoiceCustomAudioSettings,
  VoiceUserVolumeSetting,
} from './types';

export type { VoiceUserVolumeSetting };

const PREFS_STORAGE_KEY = 'redshift.preferences.v1';

export const DEFAULT_VOICE_CUSTOM_SETTINGS: VoiceCustomAudioSettings = {
  noiseGateThresholdDb: -54,
  highPassHz: 95,
  lowPassHz: 14500,
  voiceClarityDb: 2.5,
  warmthDb: 0,
  compressorAmount: 35,
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
};

function clampFinite(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function sanitizeVoiceCustom(raw: unknown): VoiceCustomAudioSettings {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    noiseGateThresholdDb: Math.round(
      clampFinite(obj.noiseGateThresholdDb, -75, -18, DEFAULT_VOICE_CUSTOM_SETTINGS.noiseGateThresholdDb),
    ),
    highPassHz: Math.round(
      clampFinite(obj.highPassHz, 20, 300, DEFAULT_VOICE_CUSTOM_SETTINGS.highPassHz),
    ),
    lowPassHz: Math.round(
      clampFinite(obj.lowPassHz, 4000, 20000, DEFAULT_VOICE_CUSTOM_SETTINGS.lowPassHz),
    ),
    voiceClarityDb:
      Math.round(clampFinite(obj.voiceClarityDb, -6, 12, DEFAULT_VOICE_CUSTOM_SETTINGS.voiceClarityDb) * 2) / 2,
    warmthDb:
      Math.round(clampFinite(obj.warmthDb, -8, 8, DEFAULT_VOICE_CUSTOM_SETTINGS.warmthDb) * 2) / 2,
    compressorAmount: Math.round(
      clampFinite(obj.compressorAmount, 0, 100, DEFAULT_VOICE_CUSTOM_SETTINGS.compressorAmount),
    ),
    noiseSuppression:
      typeof obj.noiseSuppression === 'boolean'
        ? obj.noiseSuppression
        : DEFAULT_VOICE_CUSTOM_SETTINGS.noiseSuppression,
    echoCancellation:
      typeof obj.echoCancellation === 'boolean'
        ? obj.echoCancellation
        : DEFAULT_VOICE_CUSTOM_SETTINGS.echoCancellation,
    autoGainControl:
      typeof obj.autoGainControl === 'boolean'
        ? obj.autoGainControl
        : DEFAULT_VOICE_CUSTOM_SETTINGS.autoGainControl,
  };
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'dark',
  messageDensity: 'cozy',
  fontSize: 15,
  use24HourTime: false,
  reducedMotion: false,
  desktopNotifications: true,
  inAppNotifications: false,
  notifyOnSocialRemovals: false,
  notificationSound: true,
  notificationShowPreview: true,
  enterToSend: true,
  sendTypingIndicators: true,
  alwaysRevealSpoilers: false,
  inlineMedia: true,
  voiceInputDeviceId: 'default',
  voiceOutputDeviceId: 'default',
  voiceInputMode: 'always-on',
  voicePushToTalkKey: 'KeyV',
  voicePushToTalkReleaseDelayMs: 150,
  voiceSelfMuted: false,
  voiceSelfDeafened: false,
  voiceModifierMode: 'none',
  voiceMicAmplification: 100,
  voiceCustom: { ...DEFAULT_VOICE_CUSTOM_SETTINGS },
};

function sanitizePreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_PREFERENCES };
  }
  const obj = raw as Record<string, unknown>;
  const theme =
    obj.theme === 'light' || obj.theme === 'high-contrast' || obj.theme === 'dark'
      ? obj.theme
      : DEFAULT_PREFERENCES.theme;
  const messageDensity =
    obj.messageDensity === 'compact' || obj.messageDensity === 'cozy'
      ? obj.messageDensity
      : DEFAULT_PREFERENCES.messageDensity;
  const fontSize =
    obj.fontSize === 14 || obj.fontSize === 15 || obj.fontSize === 16 || obj.fontSize === 18
      ? obj.fontSize
      : DEFAULT_PREFERENCES.fontSize;

  return {
    theme,
    messageDensity,
    fontSize,
    use24HourTime:
      typeof obj.use24HourTime === 'boolean'
        ? obj.use24HourTime
        : DEFAULT_PREFERENCES.use24HourTime,
    reducedMotion:
      typeof obj.reducedMotion === 'boolean'
        ? obj.reducedMotion
        : DEFAULT_PREFERENCES.reducedMotion,
    desktopNotifications:
      typeof obj.desktopNotifications === 'boolean'
        ? obj.desktopNotifications
        : DEFAULT_PREFERENCES.desktopNotifications,
    inAppNotifications:
      typeof obj.inAppNotifications === 'boolean'
        ? obj.inAppNotifications
        : DEFAULT_PREFERENCES.inAppNotifications,
    notifyOnSocialRemovals:
      typeof obj.notifyOnSocialRemovals === 'boolean'
        ? obj.notifyOnSocialRemovals
        : DEFAULT_PREFERENCES.notifyOnSocialRemovals,
    notificationSound:
      typeof obj.notificationSound === 'boolean'
        ? obj.notificationSound
        : DEFAULT_PREFERENCES.notificationSound,
    notificationShowPreview:
      typeof obj.notificationShowPreview === 'boolean'
        ? obj.notificationShowPreview
        : DEFAULT_PREFERENCES.notificationShowPreview,
    enterToSend:
      typeof obj.enterToSend === 'boolean'
        ? obj.enterToSend
        : DEFAULT_PREFERENCES.enterToSend,
    sendTypingIndicators:
      typeof obj.sendTypingIndicators === 'boolean'
        ? obj.sendTypingIndicators
        : DEFAULT_PREFERENCES.sendTypingIndicators,
    alwaysRevealSpoilers:
      typeof obj.alwaysRevealSpoilers === 'boolean'
        ? obj.alwaysRevealSpoilers
        : DEFAULT_PREFERENCES.alwaysRevealSpoilers,
    inlineMedia:
      typeof obj.inlineMedia === 'boolean'
        ? obj.inlineMedia
        : DEFAULT_PREFERENCES.inlineMedia,
    voiceInputDeviceId:
      typeof obj.voiceInputDeviceId === 'string' && obj.voiceInputDeviceId.trim()
        ? obj.voiceInputDeviceId.trim()
        : DEFAULT_PREFERENCES.voiceInputDeviceId,
    voiceOutputDeviceId:
      typeof obj.voiceOutputDeviceId === 'string' && obj.voiceOutputDeviceId.trim()
        ? obj.voiceOutputDeviceId.trim()
        : DEFAULT_PREFERENCES.voiceOutputDeviceId,
    voiceInputMode:
      obj.voiceInputMode === 'push-to-talk' || obj.voiceInputMode === 'always-on'
        ? obj.voiceInputMode
        : DEFAULT_PREFERENCES.voiceInputMode,
    voicePushToTalkKey:
      typeof obj.voicePushToTalkKey === 'string' && obj.voicePushToTalkKey.trim()
        ? obj.voicePushToTalkKey.trim().slice(0, 32)
        : DEFAULT_PREFERENCES.voicePushToTalkKey,
    voicePushToTalkReleaseDelayMs:
      typeof obj.voicePushToTalkReleaseDelayMs === 'number' &&
      Number.isFinite(obj.voicePushToTalkReleaseDelayMs)
        ? Math.min(600, Math.max(0, Math.round(obj.voicePushToTalkReleaseDelayMs)))
        : DEFAULT_PREFERENCES.voicePushToTalkReleaseDelayMs,
    voiceSelfMuted:
      typeof obj.voiceSelfMuted === 'boolean'
        ? obj.voiceSelfMuted
        : DEFAULT_PREFERENCES.voiceSelfMuted,
    voiceSelfDeafened:
      typeof obj.voiceSelfDeafened === 'boolean'
        ? obj.voiceSelfDeafened
        : DEFAULT_PREFERENCES.voiceSelfDeafened,
    voiceModifierMode:
      obj.voiceModifierMode === 'background-drowner' ||
      obj.voiceModifierMode === 'custom' ||
      obj.voiceModifierMode === 'none'
        ? obj.voiceModifierMode
        : DEFAULT_PREFERENCES.voiceModifierMode,
    voiceMicAmplification: Math.round(
      clampFinite(obj.voiceMicAmplification, 50, 250, DEFAULT_PREFERENCES.voiceMicAmplification),
    ),
    voiceCustom: sanitizeVoiceCustom(obj.voiceCustom),
  };
}

function loadPreferences(): UserPreferences {
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_PREFERENCES };
    }
    return sanitizePreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

let currentPreferences: UserPreferences = loadPreferences();
const listeners = new Set<(prefs: UserPreferences) => void>();

export type AccountPreferencesSyncPayload = {
  preferences: Omit<UserPreferences, 'voiceInputDeviceId' | 'voiceOutputDeviceId'>;
  voiceUserVolumes: Record<string, VoiceUserVolumeSetting>;
};

let remoteSyncHandler:
  | ((payload: AccountPreferencesSyncPayload) => Promise<void> | void)
  | null = null;
let pendingRemoteSyncTimer: number | null = null;
let suppressRemoteSync = false;
let inFlightRemoteSaves = 0;

function extractSyncedPreferences(
  prefs: UserPreferences,
): Omit<UserPreferences, 'voiceInputDeviceId' | 'voiceOutputDeviceId'> {
  const { voiceInputDeviceId: _inDev, voiceOutputDeviceId: _outDev, ...synced } = prefs;
  return synced;
}

function dispatchRemotePreferencesSync(): void {
  if (!remoteSyncHandler) return;
  const payload: AccountPreferencesSyncPayload = {
    preferences: extractSyncedPreferences(currentPreferences),
    voiceUserVolumes: { ...voiceUserVolumes },
  };
  inFlightRemoteSaves += 1;
  void Promise.resolve(remoteSyncHandler(payload)).finally(() => {
    inFlightRemoteSaves = Math.max(0, inFlightRemoteSaves - 1);
  });
}

function scheduleRemotePreferencesSync(): void {
  if (suppressRemoteSync || !remoteSyncHandler || typeof window === 'undefined') {
    return;
  }
  if (pendingRemoteSyncTimer !== null) {
    window.clearTimeout(pendingRemoteSyncTimer);
  }
  pendingRemoteSyncTimer = window.setTimeout(() => {
    pendingRemoteSyncTimer = null;
    dispatchRemotePreferencesSync();
  }, 180);
}

/** Registers or clears the signed-in server persistence callback for cross-device settings sync. */
export function registerAccountPreferencesSyncHandler(
  handler: ((payload: AccountPreferencesSyncPayload) => Promise<void> | void) | null,
): void {
  remoteSyncHandler = handler;
  if (!handler && pendingRemoteSyncTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(pendingRemoteSyncTimer);
    pendingRemoteSyncTimer = null;
  }
}

/** Immediately flushes any queued local preference changes to the server before teardown/sign-out. */
export function flushPendingAccountPreferencesSync(): void {
  if (pendingRemoteSyncTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(pendingRemoteSyncTimer);
    pendingRemoteSyncTimer = null;
    dispatchRemotePreferencesSync();
  }
}

export function applyPreferencesToDocument(prefs: UserPreferences = currentPreferences): void {
  if (typeof document === 'undefined') {
    return;
  }
  const root = document.documentElement;
  root.dataset.theme = prefs.theme;
  root.dataset.density = prefs.messageDensity;
  root.dataset.reducedMotion = prefs.reducedMotion ? 'true' : 'false';
  root.dataset.revealSpoilers = prefs.alwaysRevealSpoilers ? 'true' : 'false';
  root.style.setProperty('--chat-font-size', `${prefs.fontSize}px`);
  root.style.colorScheme = prefs.theme === 'light' ? 'light' : 'dark';
}

export function getUserPreferences(): UserPreferences {
  return currentPreferences;
}

export function updateUserPreferences(partial: Partial<UserPreferences>): UserPreferences {
  currentPreferences = sanitizePreferences({ ...currentPreferences, ...partial });
  try {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(currentPreferences));
  } catch {
    // Ignore storage quota errors in restricted environments.
  }
  applyPreferencesToDocument(currentPreferences);
  for (const listener of listeners) {
    listener(currentPreferences);
  }
  scheduleRemotePreferencesSync();
  return currentPreferences;
}

export function resetUserPreferences(): UserPreferences {
  return updateUserPreferences({ ...DEFAULT_PREFERENCES });
}

export function subscribeUserPreferences(
  listener: (prefs: UserPreferences) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Applies account-synced preferences from server snapshot/WebSocket without echoing back to server. */
export function applyRemoteAccountPreferences(
  remotePrefs?: Partial<UserPreferences> | null,
  remoteVolumes?: Record<string, VoiceUserVolumeSetting> | null,
): void {
  if (pendingRemoteSyncTimer !== null || inFlightRemoteSaves > 0) {
    return;
  }
  suppressRemoteSync = true;
  try {
    if (remotePrefs && typeof remotePrefs === 'object') {
      const {
        voiceInputDeviceId: _inDev,
        voiceOutputDeviceId: _outDev,
        ...safeRemote
      } = remotePrefs;
      const merged = sanitizePreferences({
        ...currentPreferences,
        ...safeRemote,
        voiceInputDeviceId: currentPreferences.voiceInputDeviceId,
        voiceOutputDeviceId: currentPreferences.voiceOutputDeviceId,
      });
      if (JSON.stringify(merged) !== JSON.stringify(currentPreferences)) {
        currentPreferences = merged;
        try {
          window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(currentPreferences));
        } catch {}
        applyPreferencesToDocument(currentPreferences);
        for (const listener of listeners) {
          listener(currentPreferences);
        }
      }
    }

    if (remoteVolumes && typeof remoteVolumes === 'object') {
      const sanitizedVols: Record<string, VoiceUserVolumeSetting> = {};
      for (const [rawKey, rawVal] of Object.entries(remoteVolumes)) {
        if (!rawVal || typeof rawVal !== 'object') continue;
        const cleanKey = rawKey.trim().toLowerCase();
        if (!cleanKey) continue;
        const item = rawVal as unknown as Record<string, unknown>;
        const vol = Math.round(clampFinite(item.volume, 0, 200, 100));
        const muted = Boolean(item.muted);
        const scrVol =
          item.screenVolume !== undefined
            ? Math.round(clampFinite(item.screenVolume, 0, 200, 100))
            : 100;
        const scrMuted = Boolean(item.screenMuted);
        if (vol !== 100 || muted || scrVol !== 100 || scrMuted) {
          sanitizedVols[cleanKey] = {
            volume: vol,
            muted,
            screenVolume: scrVol,
            screenMuted: scrMuted,
          };
        }
      }
      if (JSON.stringify(sanitizedVols) !== JSON.stringify(voiceUserVolumes)) {
        voiceUserVolumes = sanitizedVols;
        try {
          window.localStorage.setItem(USER_VOLUMES_STORAGE_KEY, JSON.stringify(voiceUserVolumes));
        } catch {}
      }
    }
  } finally {
    suppressRemoteSync = false;
  }
}

applyPreferencesToDocument(currentPreferences);

const USER_VOLUMES_STORAGE_KEY = 'redshift.voiceUserVolumes.v1';

function loadAllVoiceUserVolumes(): Record<string, VoiceUserVolumeSetting> {
  try {
    const raw = window.localStorage.getItem(USER_VOLUMES_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    const out: Record<string, VoiceUserVolumeSetting> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (!val || typeof val !== 'object') {
        continue;
      }
      const item = val as Record<string, unknown>;
      out[key.toLowerCase()] = {
        volume: Math.round(clampFinite(item.volume, 0, 200, 100)),
        muted: Boolean(item.muted),
        screenVolume:
          item.screenVolume !== undefined
            ? Math.round(clampFinite(item.screenVolume, 0, 200, 100))
            : 100,
        screenMuted: Boolean(item.screenMuted),
      };
    }
    return out;
  } catch {
    return {};
  }
}

let voiceUserVolumes: Record<string, VoiceUserVolumeSetting> = loadAllVoiceUserVolumes();

export function getVoiceUserVolume(username: string): VoiceUserVolumeSetting {
  const key = username.trim().toLowerCase();
  const entry = voiceUserVolumes[key];
  return {
    volume: entry?.volume ?? 100,
    muted: Boolean(entry?.muted),
    screenVolume: entry?.screenVolume ?? 100,
    screenMuted: Boolean(entry?.screenMuted),
  };
}

export function getVoiceUserScreenVolume(username: string): { volume: number; muted: boolean } {
  const entry = getVoiceUserVolume(username);
  return {
    volume: entry.screenVolume ?? 100,
    muted: Boolean(entry.screenMuted),
  };
}

function persistVoiceUserVolumeEntry(key: string, next: VoiceUserVolumeSetting): void {
  const isDefault =
    next.volume === 100 &&
    !next.muted &&
    (next.screenVolume ?? 100) === 100 &&
    !next.screenMuted;
  if (isDefault) {
    delete voiceUserVolumes[key];
  } else {
    voiceUserVolumes[key] = next;
  }
  try {
    window.localStorage.setItem(USER_VOLUMES_STORAGE_KEY, JSON.stringify(voiceUserVolumes));
  } catch {
    // Ignore storage quota errors cleanly.
  }
  scheduleRemotePreferencesSync();
}

export function setVoiceUserVolume(
  username: string,
  partial: Partial<VoiceUserVolumeSetting>,
): VoiceUserVolumeSetting {
  const key = username.trim().toLowerCase();
  const prev = getVoiceUserVolume(key);
  const next: VoiceUserVolumeSetting = {
    volume: Math.round(clampFinite(partial.volume ?? prev.volume, 0, 200, prev.volume)),
    muted: typeof partial.muted === 'boolean' ? partial.muted : prev.muted,
    screenVolume: Math.round(
      clampFinite(partial.screenVolume ?? prev.screenVolume ?? 100, 0, 200, prev.screenVolume ?? 100),
    ),
    screenMuted:
      typeof partial.screenMuted === 'boolean' ? partial.screenMuted : Boolean(prev.screenMuted),
  };
  persistVoiceUserVolumeEntry(key, next);
  return next;
}

export function setVoiceUserScreenVolume(
  username: string,
  partial: { volume?: number; muted?: boolean },
): { volume: number; muted: boolean } {
  const updated = setVoiceUserVolume(username, {
    ...(partial.volume !== undefined ? { screenVolume: partial.volume } : {}),
    ...(partial.muted !== undefined ? { screenMuted: partial.muted } : {}),
  });
  return {
    volume: updated.screenVolume ?? 100,
    muted: Boolean(updated.screenMuted),
  };
}
