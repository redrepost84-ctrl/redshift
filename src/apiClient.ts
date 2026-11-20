import { getDesktopBridge } from './desktopBridge';
import type {
  AttachmentKind,
  ChatMessage,
  DmAttachment,
  DmDeleteEventPayload,
  DmEditEventPayload,
  DmMessageEventPayload,
  DmPinEventPayload,
  DmReactEventPayload,
  DmReadEventPayload,
  DmReadReceipt,
  GifItem,
  GlobalSearchResultItem,
  GroupDmInfo,
  LinkPreviewData,
  MessageReaction,
  PublicProfile,
  SocialNotifyEventPayload,
  SocialSnapshot,
  TypingEventPayload,
  UserStatus,
  ValidationResult,
  VcIncomingCallPayload,
  VcSignalData,
  VcSignalEventPayload,
  VcSpeakingEventPayload,
  VcStateEventPayload,
  VoiceNoteMeta,
} from './types';

export type ThreadTarget = string | { peerUsername?: string; groupId?: string };

function normalizeThreadTarget(target: ThreadTarget): {
  peerUsername?: string;
  groupId?: string;
} {
  if (typeof target === 'string') {
    return { peerUsername: target };
  }
  return target.groupId
    ? { groupId: target.groupId }
    : { peerUsername: target.peerUsername };
}

export const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024; // 1 GB max per uploaded file.

/** Formats a byte count into B / KB / MB / GB for attachment badges. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '0 B';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
  }
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

/** Classifies a client File object into image, video, audio, or generic file preview kind. */
export function classifyFileKind(file: File): AttachmentKind {
  const name = (file.name || '').toLowerCase();
  const mime = (file.type || '').toLowerCase();
  if (
    /\.(png|jpe?g|webp|gif|bmp|avif)$/.test(name) ||
    (mime.startsWith('image/') && mime !== 'image/svg+xml')
  ) {
    return 'image';
  }
  if (/\.(mp3|wav|ogg|opus|flac|m4a|aac|weba)$/.test(name) || mime.startsWith('audio/')) {
    return 'audio';
  }
  if (/\.(mp4|m4v|webm|ogv|mov|mkv)$/.test(name) || mime.startsWith('video/')) {
    return 'video';
  }
  return 'file';
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_.-]+$/;
const MAX_AVATAR_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif'];
const SESSION_STORAGE_KEY = 'redshift.session_token.v1';
const PERSISTENT_SESSION_KEY = 'redshift.session_persistent_token.v1';
const SERVER_URL_STORAGE_KEY = 'redshift.server_base_url.v1';
const SERVER_MANUAL_OVERRIDE_KEY = 'redshift.server_manual_override.v1';
const DEFAULT_GITHUB_DIRECTORY_REPO = 'redrepost84-ctrl/redshift';

function readStoredServerBaseUrl(): string {
  try {
    return (window.localStorage.getItem(SERVER_URL_STORAGE_KEY) || '').trim().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function hasManualServerOverride(): boolean {
  try {
    return window.localStorage.getItem(SERVER_MANUAL_OVERRIDE_KEY) === '1';
  } catch {
    return false;
  }
}

let apiServerBaseUrl: string = readStoredServerBaseUrl();

export function getApiServerBaseUrl(): string {
  return apiServerBaseUrl;
}

export function setApiServerBaseUrl(rawUrl: string, isManual = false): string {
  const clean = rawUrl.trim().replace(/\/+$/, '');
  apiServerBaseUrl = clean;
  try {
    if (clean) {
      window.localStorage.setItem(SERVER_URL_STORAGE_KEY, clean);
    } else {
      window.localStorage.removeItem(SERVER_URL_STORAGE_KEY);
    }
    if (isManual) {
      window.localStorage.setItem(SERVER_MANUAL_OVERRIDE_KEY, '1');
    }
  } catch {
    // Ignore storage errors.
  }
  return clean;
}

/**
 * Automatically checks the GitHub online-server.json directory so every Redshift client
 * around the world connects to the live online server unconditionally with zero user input.
 */
export async function autoDiscoverWorldwideServer(githubRepo?: string): Promise<string | null> {
  const repo = (githubRepo || DEFAULT_GITHUB_DIRECTORY_REPO).trim();
  if (!repo) return null;

  const lookupUrls = [
    `https://api.github.com/repos/${repo}/contents/online-server.json`,
    `https://raw.githubusercontent.com/${repo}/main/online-server.json?t=${Date.now()}`,
  ];

  for (const lookupUrl of lookupUrls) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3800);
    try {
      const res = await fetch(lookupUrl, {
        method: 'GET',
        cache: 'no-store',
        headers: lookupUrl.includes('api.github.com')
          ? { Accept: 'application/vnd.github.raw+json' }
          : {},
        signal: controller.signal,
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { serverUrl?: string };
      const candidate = (data?.serverUrl || '').trim().replace(/\/+$/, '');
      if (!candidate || !/^https?:\/\//i.test(candidate)) {
        continue;
      }
      const health = await apiCheckServerHealth(candidate);
      if (health.ok) {
        setApiServerBaseUrl(candidate, false);
        return candidate;
      }
    } catch {
      // Try next lookup URL
    } finally {
      window.clearTimeout(timer);
    }
  }
  return null;
}

export function resolveApiUrl(pathOrUrl: string): string {
  if (!apiServerBaseUrl || /^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  return `${apiServerBaseUrl}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

let inflightTunnelRediscovery: Promise<string | null> | null = null;
let lastTunnelRediscoveryAt = 0;
const TUNNEL_REDISCOVERY_COOLDOWN_MS = 12_000;

function isAutoDiscoverableRemoteUrl(rawUrl: string): boolean {
  if (!rawUrl || hasManualServerOverride()) return false;
  if (!/^https:\/\//i.test(rawUrl)) return false;
  return !/^https:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(rawUrl);
}

async function tryRediscoverDeadTunnel(failedBaseUrl: string): Promise<boolean> {
  if (!isAutoDiscoverableRemoteUrl(failedBaseUrl)) {
    return false;
  }
  if (apiServerBaseUrl && apiServerBaseUrl !== failedBaseUrl) {
    return true;
  }
  if (inflightTunnelRediscovery) {
    const discovered = await inflightTunnelRediscovery;
    return Boolean(discovered && discovered !== failedBaseUrl);
  }
  const now = Date.now();
  if (now - lastTunnelRediscoveryAt < TUNNEL_REDISCOVERY_COOLDOWN_MS) {
    return false;
  }
  lastTunnelRediscoveryAt = now;
  inflightTunnelRediscovery = autoDiscoverWorldwideServer().finally(() => {
    inflightTunnelRediscovery = null;
  });
  const discovered = await inflightTunnelRediscovery;
  return Boolean(discovered && discovered !== failedBaseUrl);
}

function isDeadTunnelStatus(status: number): boolean {
  return status === 530 || status === 502 || status === 503 || status === 504;
}

async function fetchWithTunnelRecovery(
  pathOrUrl: string,
  init: RequestInit,
): Promise<Response> {
  const baseBefore = apiServerBaseUrl;
  try {
    const res = await fetch(resolveApiUrl(pathOrUrl), init);
    if (isDeadTunnelStatus(res.status) && isAutoDiscoverableRemoteUrl(baseBefore)) {
      const switched = await tryRediscoverDeadTunnel(baseBefore);
      if (switched) {
        return await fetch(resolveApiUrl(pathOrUrl), init);
      }
    }
    return res;
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    if (!isAbort && isAutoDiscoverableRemoteUrl(baseBefore)) {
      const switched = await tryRediscoverDeadTunnel(baseBefore);
      if (switched) {
        return await fetch(resolveApiUrl(pathOrUrl), init);
      }
    }
    throw err;
  }
}

/** Resolves server-hosted relative media paths (/api/uploads/..., /gif/...) against the active Redshift server URL. */
export function resolveMediaUrl(url: string): string {
  if (!url || !apiServerBaseUrl) {
    return url;
  }
  if (/^(https?:|blob:|data:)/i.test(url)) {
    return url;
  }
  if (url.startsWith('/api/') || url.startsWith('/gif/')) {
    return `${apiServerBaseUrl}${url}`;
  }
  return url;
}

export interface ServerHealthResult {
  ok: boolean;
  service?: string;
  version?: string;
  onlineUsers?: number;
  latencyMs?: number;
  error?: string;
}

export async function apiCheckServerHealth(serverBaseUrl?: string): Promise<ServerHealthResult> {
  const cleanBase =
    serverBaseUrl !== undefined
      ? serverBaseUrl.trim().replace(/\/+$/, '')
      : apiServerBaseUrl;
  const target = cleanBase ? `${cleanBase}/api/health` : '/api/health';
  const startedAt = performance.now();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(target, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));
    if (!res.ok) {
      return { ok: false, latencyMs, error: `Server returned HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      ok?: boolean;
      service?: string;
      version?: string;
      onlineUsers?: number;
    };
    if (!data?.ok || data.service !== 'redshift') {
      return { ok: false, latencyMs, error: 'URL is not a Redshift server' };
    }
    return {
      ok: true,
      service: data.service,
      version: data.version,
      onlineUsers: data.onlineUsers,
      latencyMs,
    };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      error: isAbort ? 'Connection timed out (4.5s)' : 'Could not reach server',
    };
  } finally {
    window.clearTimeout(timer);
  }
}

export function resolveWsUrl(wsPathWithQuery: string): string {
  if (apiServerBaseUrl) {
    try {
      const parsed = new URL(apiServerBaseUrl);
      const proto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${parsed.host}${wsPathWithQuery.startsWith('/') ? '' : '/'}${wsPathWithQuery}`;
    } catch {
      // Fallback to current window origin
    }
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${wsPathWithQuery.startsWith('/') ? '' : '/'}${wsPathWithQuery}`;
}

function readStoredToken(): string | null {
  try {
    const fromWeb =
      sessionStorage.getItem(SESSION_STORAGE_KEY) ||
      window.localStorage.getItem(PERSISTENT_SESSION_KEY);
    if (fromWeb) {
      return fromWeb;
    }
  } catch {
    // Ignore web storage errors.
  }
  try {
    const fromDesktop = getDesktopBridge()?.getPersistentSessionToken?.();
    if (fromDesktop && fromDesktop.trim()) {
      const clean = fromDesktop.trim();
      try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, clean);
        window.localStorage.setItem(PERSISTENT_SESSION_KEY, clean);
      } catch {
        // Ignore hydration errors.
      }
      return clean;
    }
  } catch {
    // Ignore desktop bridge errors.
  }
  return null;
}

let sessionToken: string | null = readStoredToken();

function setSessionToken(token: string, persist = false): void {
  sessionToken = token;
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, token);
  } catch {
    // Ignore sessionStorage errors.
  }
  try {
    if (persist) {
      window.localStorage.setItem(PERSISTENT_SESSION_KEY, token);
    } else {
      window.localStorage.removeItem(PERSISTENT_SESSION_KEY);
    }
  } catch {
    // Ignore localStorage errors.
  }
  try {
    getDesktopBridge()?.setPersistentSessionToken?.(persist ? token : null);
  } catch {
    // Ignore desktop bridge errors.
  }
}

export function clearSessionToken(): void {
  sessionToken = null;
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
  try {
    window.localStorage.removeItem(PERSISTENT_SESSION_KEY);
  } catch {
    // Ignore localStorage errors.
  }
  try {
    getDesktopBridge()?.setPersistentSessionToken?.(null);
  } catch {
    // Ignore desktop bridge errors.
  }
}

export function hasStoredSessionToken(): boolean {
  return Boolean(sessionToken);
}

export function isEmailFormat(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

export function validateSignInInputs(identifierRaw: string, password: string): ValidationResult {
  const identifier = identifierRaw.trim();
  if (!identifier && !password) {
    return { ok: false, error: 'Error: Enter your username/email and password' };
  }
  if (!identifier) {
    return { ok: false, error: 'Error: Username or email is required' };
  }
  if (!password) {
    return { ok: false, error: 'Error: Password is required' };
  }
  if (identifier.includes('@') && !isEmailFormat(identifier)) {
    return { ok: false, error: 'Error: Invalid email format' };
  }
  return { ok: true };
}

export function validateSignUpAccountInputs(
  usernameRaw: string,
  emailRaw: string,
  confirmEmailRaw: string,
): ValidationResult {
  const username = usernameRaw.trim();
  const email = emailRaw.trim();
  const confirmEmail = confirmEmailRaw.trim();

  if (!username) {
    return { ok: false, error: 'Error: Username is required' };
  }
  if (username.length < 2 || username.length > 32) {
    return { ok: false, error: 'Error: Username must be between 2 and 32 characters' };
  }
  if (!USERNAME_REGEX.test(username)) {
    return {
      ok: false,
      error: 'Error: Username can only use letters, numbers, underscores, periods, and hyphens',
    };
  }
  if (!email) {
    return { ok: false, error: 'Error: Email is required' };
  }
  if (!isEmailFormat(email)) {
    return { ok: false, error: 'Error: Invalid email format' };
  }
  if (!confirmEmail) {
    return { ok: false, error: 'Error: Please confirm your email' };
  }
  if (email.toLowerCase() !== confirmEmail.toLowerCase()) {
    return { ok: false, error: 'Error: Emails do not match' };
  }
  return { ok: true };
}

export function validatePasswordPair(password: string, confirmPassword: string): ValidationResult {
  if (!password) {
    return { ok: false, error: 'Error: Password is required' };
  }
  if (!password.trim()) {
    return { ok: false, error: 'Error: Password cannot be only spaces' };
  }
  if (password.length < 6) {
    return { ok: false, error: 'Error: Password must be at least 6 characters' };
  }
  if (password.length > 128) {
    return { ok: false, error: 'Error: Password must be 128 characters or fewer' };
  }
  if (!confirmPassword) {
    return { ok: false, error: 'Error: Please confirm your password' };
  }
  if (password !== confirmPassword) {
    return { ok: false, error: 'Error: Passwords do not match' };
  }
  return { ok: true };
}

export function validateAvatarFile(file: File): ValidationResult {
  const lowerName = file.name.toLowerCase();
  const hasImageMime = file.type.startsWith('image/');
  const hasImageExtension = ALLOWED_IMAGE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));

  if (!hasImageMime && !hasImageExtension) {
    return { ok: false, error: 'Error: Please choose a valid image file' };
  }
  if (file.size <= 0) {
    return { ok: false, error: 'Error: Selected image file is empty' };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { ok: false, error: 'Error: Image file must be 10 MB or smaller' };
  }
  return { ok: true };
}

export function validateResetCodeFormat(inputRaw: string): ValidationResult {
  const code = inputRaw.trim();
  if (!code) {
    return { ok: false, error: 'Error: Please enter the 6-character code' };
  }
  if (!/^[a-zA-Z0-9]+$/.test(code)) {
    return { ok: false, error: 'Error: Code can only contain letters and numbers' };
  }
  if (code.length !== 6) {
    return { ok: false, error: 'Error: Code must be 6 letters and numbers' };
  }
  return { ok: true };
}

async function postJson<T extends { ok?: boolean; error?: string }>(
  url: string,
  body: Record<string, unknown>,
  authenticated = false,
  options?: { timeoutMs?: number },
): Promise<{ ok: boolean; data?: T; error?: string; isNetworkError?: boolean }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, isNetworkError: true, error: 'Error: You are offline' };
  }

  let controller: AbortController | null = null;
  let timerId: number | null = null;
  if (options?.timeoutMs && typeof AbortController !== 'undefined') {
    controller = new AbortController();
    timerId = window.setTimeout(() => controller?.abort(), options.timeoutMs);
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authenticated) {
      if (!sessionToken) {
        return { ok: false, error: 'Error: Not authenticated' };
      }
      headers.Authorization = `Bearer ${sessionToken}`;
    }

    const res = await fetchWithTunnelRecovery(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller?.signal,
    });

    let parsed: T | null = null;
    try {
      parsed = (await res.json()) as T;
    } catch {
      parsed = null;
    }

    if (!res.ok || !parsed?.ok) {
      return {
        ok: false,
        data: parsed ?? undefined,
        isNetworkError: res.status >= 500,
        error: parsed?.error ?? 'Error: Request failed',
      };
    }
    return { ok: true, data: parsed };
  } catch {
    return { ok: false, isNetworkError: true, error: 'Error: Could not reach Redshift server' };
  } finally {
    if (timerId !== null) {
      window.clearTimeout(timerId);
    }
  }
}

export async function apiSignIn(
  identifier: string,
  password: string,
  rememberMe = true,
): Promise<{ ok: boolean; snapshot?: SocialSnapshot; error?: string }> {
  const res = await postJson<{ ok?: boolean; token?: string; snapshot?: SocialSnapshot; error?: string }>(
    '/api/auth/signin',
    { identifier, password },
  );
  if (!res.ok || !res.data?.token || !res.data?.snapshot) {
    return { ok: false, error: res.error ?? 'Error: Could not sign in' };
  }
  setSessionToken(res.data.token, rememberMe);
  return { ok: true, snapshot: res.data.snapshot };
}

export async function apiResumeSession(): Promise<{
  ok: boolean;
  snapshot?: SocialSnapshot;
}> {
  if (!sessionToken) {
    return { ok: false };
  }
  try {
    const res = await fetchWithTunnelRecovery('/api/auth/session', {
      method: 'GET',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    if (!res.ok) {
      if (res.status === 401) {
        clearSessionToken();
      }
      return { ok: false };
    }
    const data = (await res.json()) as { ok?: boolean; snapshot?: SocialSnapshot };
    if (!data.ok || !data.snapshot) {
      return { ok: false };
    }
    return { ok: true, snapshot: data.snapshot };
  } catch {
    return { ok: false };
  }
}

export async function apiSignOut(): Promise<void> {
  if (sessionToken) {
    await postJson('/api/auth/signout', {}, true);
  }
  clearSessionToken();
}

export async function apiSignUp(input: {
  username: string;
  email: string;
  confirmEmail: string;
  password: string;
  confirmPassword: string;
  avatarPreset: number | null;
  avatarDataUrl?: string;
}): Promise<{ ok: boolean; snapshot?: SocialSnapshot; error?: string }> {
  const res = await postJson<{ ok?: boolean; token?: string; snapshot?: SocialSnapshot; error?: string }>(
    '/api/auth/signup',
    input,
  );
  if (!res.ok || !res.data?.token || !res.data?.snapshot) {
    return { ok: false, error: res.error ?? 'Error: Could not complete sign up' };
  }
  setSessionToken(res.data.token, true);
  return { ok: true, snapshot: res.data.snapshot };
}

export async function apiForgotPassword(
  email: string,
): Promise<{ ok: boolean; cooldownSeconds?: number; error?: string }> {
  const res = await postJson<{ ok?: boolean; cooldownSeconds?: number; error?: string }>(
    '/api/forgot-password',
    { email },
  );
  return {
    ok: res.ok,
    cooldownSeconds: res.data?.cooldownSeconds,
    error: res.error,
  };
}

export async function apiVerifyResetCode(
  email: string,
  code: string,
): Promise<{ ok: boolean; resetProofToken?: string; error?: string }> {
  const res = await postJson<{ ok?: boolean; resetProofToken?: string; error?: string }>(
    '/api/verify-reset-code',
    { email, code },
  );
  if (!res.ok || !res.data?.resetProofToken) {
    return { ok: false, error: res.error ?? 'Error: Invalid verification code' };
  }
  return { ok: true, resetProofToken: res.data.resetProofToken };
}

export async function apiCompleteReset(input: {
  email: string;
  resetProofToken: string;
  newPassword?: string;
  confirmPassword?: string;
}): Promise<{ ok: boolean; snapshot?: SocialSnapshot; error?: string }> {
  const res = await postJson<{ ok?: boolean; token?: string; snapshot?: SocialSnapshot; error?: string }>(
    '/api/auth/complete-reset',
    input,
  );
  if (!res.ok || !res.data?.token || !res.data?.snapshot) {
    return { ok: false, error: res.error ?? 'Error: Could not complete reset' };
  }
  setSessionToken(res.data.token, true);
  return { ok: true, snapshot: res.data.snapshot };
}

export async function apiUpdateStatus(
  status: UserStatus,
): Promise<{ ok: boolean; snapshot?: SocialSnapshot; error?: string }> {
  const res = await postJson<{ ok?: boolean; snapshot?: SocialSnapshot; error?: string }>(
    '/api/profile/status',
    { status },
    true,
  );
  if (!res.ok || !res.data?.snapshot) {
    return { ok: false, error: res.error ?? 'Error: Could not update status' };
  }
  return { ok: true, snapshot: res.data.snapshot };
}

export async function apiUpdateCustomStatus(input: {
  text?: string;
  emoji?: string | null;
  expiresAt?: number | null;
  clear?: boolean;
}): Promise<{ ok: boolean; snapshot?: SocialSnapshot; error?: string }> {
  const res = await postJson<{ ok?: boolean; snapshot?: SocialSnapshot; error?: string }>(
    '/api/profile/custom-status',
    input,
    true,
  );
  if (!res.ok || !res.data?.snapshot) {
    return { ok: false, error: res.error ?? 'Error: Could not save custom status' };
  }
  return { ok: true, snapshot: res.data.snapshot };
}

export async function apiUpdateProfile(input: {
  displayName: string;
  username: string;
  bio: string;
  avatarPreset: number | null;
  avatarDataUrl?: string;
  bannerColor?: string | null;
  bannerDataUrl?: string | null;
}): Promise<{ ok: boolean; snapshot?: SocialSnapshot; previousUsername?: string; error?: string }> {
  const res = await postJson<{
    ok?: boolean;
    snapshot?: SocialSnapshot;
    previousUsername?: string;
    error?: string;
  }>('/api/profile/update', input, true);
  if (!res.ok || !res.data?.snapshot) {
    return { ok: false, error: res.error ?? 'Error: Could not save profile' };
  }
  return {
    ok: true,
    snapshot: res.data.snapshot,
    previousUsername: res.data.previousUsername,
  };
}

export async function apiSendFriendRequest(
  username: string,
): Promise<{ ok: boolean; message?: string; snapshot?: SocialSnapshot; error?: string }> {
  const res = await postJson<{
    ok?: boolean;
    message?: string;
    snapshot?: SocialSnapshot;
    error?: string;
  }>('/api/friends/request', { username }, true);
  if (!res.ok || !res.data?.snapshot) {
    return { ok: false, error: res.error ?? 'Error: Could not send friend request' };
  }
  return {
    ok: true,
    message: res.data.message,
    snapshot: res.data.snapshot,
  };
}

export async function apiCancelFriendRequest(
  targetUsername: string,
): Promise<{ ok: boolean; snapshot?: SocialSnapshot; error?: string }> {
  const res = await postJson<{ ok?: boolean; snapshot?: SocialSnapshot; error?: string }>(
    '/api/friends/cancel',
    { targetUsername },
    true,
  );
  return { ok: res.ok, snapshot: res.data?.snapshot, error: res.error };
}

export async function apiDeclineFriendRequest(
  fromUsername: string,
): Promise<{ ok: boolean; snapshot?: SocialSnapshot; error?: string }> {
  const res = await postJson<{ ok?: boolean; snapshot?: SocialSnapshot; error?: string }>(
    '/api/friends/decline',
    { fromUsername },
    true,
  );
  return { ok: res.ok, snapshot: res.data?.snapshot, error: res.error };
}

export async function apiAcceptFriendRequest(
  fromUsername: string,
): Promise<{ ok: boolean; snapshot?: SocialSnapshot; error?: string }> {
  const res = await postJson<{ ok?: boolean; snapshot?: SocialSnapshot; error?: string }>(
    '/api/friends/accept',
    { fromUsername },
    true,
  );
  return { ok: res.ok, snapshot: res.data?.snapshot, error: res.error };
}

async function postFriendTargetAction(
  endpoint: string,
  targetUsername: string,
): Promise<{ ok: boolean; snapshot?: SocialSnapshot; error?: string }> {
  const res = await postJson<{ ok?: boolean; snapshot?: SocialSnapshot; error?: string }>(
    endpoint,
    { targetUsername },
    true,
  );
  return { ok: res.ok, snapshot: res.data?.snapshot, error: res.error };
}

export function apiRemoveFriend(
  targetUsername: string,
): Promise<{ ok: boolean; snapshot?: SocialSnapshot; error?: string }> {
  return postFriendTargetAction('/api/friends/remove', targetUsername);
}

export function apiBlockUser(
  targetUsername: string,
): Promise<{ ok: boolean; snapshot?: SocialSnapshot; error?: string }> {
  return postFriendTargetAction('/api/friends/block', targetUsername);
}

export function apiUnblockUser(
  targetUsername: string,
): Promise<{ ok: boolean; snapshot?: SocialSnapshot; error?: string }> {
  return postFriendTargetAction('/api/friends/unblock', targetUsername);
}

export async function apiFetchDmHistory(
  target: ThreadTarget,
  opts?: { before?: string; around?: string; limit?: number },
): Promise<{
  ok: boolean;
  messages?: ChatMessage[];
  hasMore?: boolean;
  peerReceipt?: DmReadReceipt;
  error?: string;
}> {
  try {
    if (!sessionToken) {
      return { ok: false, error: 'Error: Not authenticated' };
    }
    const norm = normalizeThreadTarget(target);
    const params = new URLSearchParams();
    if (norm.groupId) {
      params.set('groupId', norm.groupId);
    } else {
      params.set('peer', norm.peerUsername ?? '');
    }
    if (opts?.before) {
      params.set('before', opts.before);
    }
    if (opts?.around) {
      params.set('around', opts.around);
    }
    if (opts?.limit) {
      params.set('limit', String(opts.limit));
    }
    const res = await fetchWithTunnelRecovery(`/api/dms/history?${params.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const data = (await res.json()) as {
      ok?: boolean;
      messages?: ChatMessage[];
      hasMore?: boolean;
      peerReceipt?: DmReadReceipt;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? 'Error: Could not load messages' };
    }
    return {
      ok: true,
      messages: data.messages ?? [],
      hasMore: Boolean(data.hasMore),
      peerReceipt: data.peerReceipt,
    };
  } catch {
    return { ok: false, error: 'Error: Could not reach Redshift server' };
  }
}

/** Searches across all DM and Group DM conversations belonging to the signed-in user. */
export async function apiSearchGlobalMessages(
  query: string,
): Promise<{ ok: boolean; results: GlobalSearchResultItem[] }> {
  try {
    if (!sessionToken || !query.trim()) {
      return { ok: true, results: [] };
    }
    const res = await fetchWithTunnelRecovery(`/api/dms/search?q=${encodeURIComponent(query.trim())}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const data = (await res.json()) as { ok?: boolean; results?: GlobalSearchResultItem[] };
    if (!res.ok || !data.ok) {
      return { ok: false, results: [] };
    }
    return { ok: true, results: Array.isArray(data.results) ? data.results : [] };
  } catch {
    return { ok: false, results: [] };
  }
}

/** Fetches cached OpenGraph/link embed metadata from the server for a public URL. */
export async function apiFetchLinkPreview(
  url: string,
): Promise<{ ok: boolean; preview?: LinkPreviewData }> {
  try {
    if (!sessionToken || !url.trim()) {
      return { ok: false };
    }
    const res = await fetchWithTunnelRecovery(`/api/links/preview?url=${encodeURIComponent(url.trim())}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const data = (await res.json()) as { ok?: boolean; preview?: LinkPreviewData };
    if (!res.ok || !data.ok || !data.preview) {
      return { ok: false };
    }
    return { ok: true, preview: data.preview };
  } catch {
    return { ok: false };
  }
}

export interface HostScreenSource {
  id: string;
  kind: 'screen' | 'window';
  name: string;
  processName: string;
  width: number;
  height: number;
  thumbnailDataUrl: string;
}

/** Fetches live local desktop/window preview cards from Redshift's host capture worker (loopback only). */
export async function apiFetchHostScreenSources(): Promise<{
  supported: boolean;
  sources: HostScreenSource[];
}> {
  try {
    if (!sessionToken) {
      return { supported: false, sources: [] };
    }
    const res = await fetchWithTunnelRecovery('/api/vc/screen-sources', {
      method: 'GET',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const data = (await res.json()) as {
      ok?: boolean;
      supported?: boolean;
      sources?: HostScreenSource[];
    };
    if (!res.ok || !data.ok || !data.supported || !Array.isArray(data.sources)) {
      return { supported: false, sources: [] };
    }
    return { supported: true, sources: data.sources };
  } catch {
    return { supported: false, sources: [] };
  }
}

export function buildHostScreenCaptureWsUrl(
  sourceId: string,
  params: { maxW: number; maxH: number; fps: 30 | 60; quality?: number },
): string | null {
  if (!sessionToken) {
    return null;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const qs = new URLSearchParams({
    token: sessionToken,
    sourceId,
    maxW: String(params.maxW),
    maxH: String(params.maxH),
    fps: String(params.fps),
    quality: String(params.quality ?? 76),
  });
  return `${protocol}//${window.location.host}/ws/screen-capture?${qs.toString()}`;
}

/** Fetches server-configured STUN + TURN ICE servers for WebRTC calls. */
export async function apiFetchIceServers(): Promise<RTCIceServer[]> {
  const fallback: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  try {
    if (!sessionToken) {
      return fallback;
    }
    const res = await fetchWithTunnelRecovery('/api/vc/ice-servers', {
      method: 'GET',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const data = (await res.json()) as { ok?: boolean; iceServers?: RTCIceServer[] };
    if (!res.ok || !data.ok || !Array.isArray(data.iceServers) || data.iceServers.length === 0) {
      return fallback;
    }
    return data.iceServers;
  } catch {
    return fallback;
  }
}

export async function apiUploadAttachment(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{
  ok: boolean;
  attachment?: DmAttachment;
  error?: string;
  isNetworkError?: boolean;
}> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, isNetworkError: true, error: 'Error: You are offline' };
  }
  if (!sessionToken) {
    return { ok: false, error: 'Error: Not authenticated' };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: 'Error: File exceeds the 1 GB attachment limit' };
  }

  const attemptUpload = (): Promise<{
    ok: boolean;
    attachment?: DmAttachment;
    error?: string;
    isNetworkError?: boolean;
    httpStatus?: number;
  }> =>
    new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', resolveApiUrl('/api/uploads'), true);
      xhr.setRequestHeader('Authorization', `Bearer ${sessionToken}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name || 'attachment'));
      xhr.setRequestHeader('X-File-Mime', file.type || 'application/octet-stream');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0 && onProgress) {
          const pct = Math.min(100, Math.max(0, Math.round((e.loaded / e.total) * 100)));
          onProgress(pct);
        }
      };

      xhr.onload = () => {
        let parsed: { ok?: boolean; attachment?: DmAttachment; error?: string } | null = null;
        try {
          parsed = JSON.parse(xhr.responseText) as {
            ok?: boolean;
            attachment?: DmAttachment;
            error?: string;
          };
        } catch {
          parsed = null;
        }
        if (xhr.status >= 200 && xhr.status < 300 && parsed?.ok && parsed.attachment) {
          onProgress?.(100);
          resolve({ ok: true, attachment: parsed.attachment });
          return;
        }
        resolve({
          ok: false,
          isNetworkError: xhr.status >= 500,
          httpStatus: xhr.status,
          error: parsed?.error ?? 'Error: Could not upload file',
        });
      };

      xhr.onerror = () => {
        resolve({ ok: false, isNetworkError: true, error: 'Error: Upload interrupted' });
      };
      xhr.onabort = () => {
        resolve({ ok: false, isNetworkError: true, error: 'Error: Upload aborted' });
      };

      xhr.send(file);
    });

  const baseBefore = apiServerBaseUrl;
  const first = await attemptUpload();
  if (
    !first.ok &&
    baseBefore.includes('trycloudflare.com') &&
    (first.isNetworkError || (typeof first.httpStatus === 'number' && isDeadTunnelStatus(first.httpStatus)))
  ) {
    const switched = await tryRediscoverDeadTunnel(baseBefore);
    if (switched) {
      return await attemptUpload();
    }
  }
  return first;
}

export async function apiSendDmMessage(
  target: ThreadTarget,
  content: string,
  options?: {
    imageDataUrls?: string[];
    attachmentIds?: string[];
    spoilerAttachmentIds?: string[];
    gif?: GifItem;
    replyToMessageId?: string;
    voiceNote?: VoiceNoteMeta;
  },
): Promise<{
  ok: boolean;
  message?: ChatMessage;
  error?: string;
  isNetworkError?: boolean;
}> {
  const norm = normalizeThreadTarget(target);
  const res = await postJson<{ ok?: boolean; message?: ChatMessage; error?: string }>(
    '/api/dms/send',
    {
      toUsername: norm.peerUsername,
      groupId: norm.groupId,
      content,
      imageDataUrls: options?.imageDataUrls,
      attachmentIds: options?.attachmentIds,
      spoilerAttachmentIds: options?.spoilerAttachmentIds,
      gif: options?.gif,
      replyToMessageId: options?.replyToMessageId,
      voiceNote: options?.voiceNote,
    },
    true,
    { timeoutMs: 12000 },
  );
  if (!res.ok || !res.data?.message) {
    return {
      ok: false,
      error: res.error ?? 'Error: Could not send message',
      isNetworkError: res.isNetworkError,
    };
  }
  return { ok: true, message: res.data.message };
}

export async function apiToggleAttachmentSpoiler(
  target: ThreadTarget,
  messageId: string,
  attachmentId: string,
  spoiler?: boolean,
): Promise<{ ok: boolean; message?: ChatMessage; error?: string }> {
  const norm = normalizeThreadTarget(target);
  const res = await postJson<{ ok?: boolean; message?: ChatMessage; error?: string }>(
    '/api/dms/spoiler',
    {
      peerUsername: norm.peerUsername,
      groupId: norm.groupId,
      messageId,
      attachmentId,
      spoiler,
    },
    true,
  );
  if (!res.ok || !res.data?.message) {
    return { ok: false, error: res.error ?? 'Error: Could not update spoiler status' };
  }
  return { ok: true, message: res.data.message };
}

export type ForwardTargetRef =
  | { kind: 'dm'; username: string }
  | { kind: 'group'; groupId: string };

export async function apiForwardMessage(
  sourceTarget: ThreadTarget,
  messageId: string,
  targets: ForwardTargetRef[],
  note?: string,
): Promise<{ ok: boolean; forwardedCount?: number; snapshot?: SocialSnapshot; error?: string }> {
  const norm = normalizeThreadTarget(sourceTarget);
  const res = await postJson<{
    ok?: boolean;
    forwardedCount?: number;
    snapshot?: SocialSnapshot;
    error?: string;
  }>(
    '/api/dms/forward',
    {
      sourcePeerUsername: norm.peerUsername,
      sourceGroupId: norm.groupId,
      messageId,
      targets,
      note: note?.trim() || undefined,
    },
    true,
  );
  if (!res.ok) {
    return { ok: false, error: res.error ?? 'Error: Could not forward message' };
  }
  return {
    ok: true,
    forwardedCount: res.data?.forwardedCount ?? 0,
    snapshot: res.data?.snapshot,
  };
}

export async function apiToggleFavoriteGif(
  gif: GifItem,
  mode: 'toggle' | 'add' = 'toggle',
): Promise<{ ok: boolean; isFavorited?: boolean; snapshot?: SocialSnapshot; error?: string }> {
  const res = await postJson<{
    ok?: boolean;
    isFavorited?: boolean;
    snapshot?: SocialSnapshot;
    error?: string;
  }>('/api/gifs/favorite', { gif, mode }, true);
  return {
    ok: res.ok,
    isFavorited: res.data?.isFavorited,
    snapshot: res.data?.snapshot,
    error: res.error,
  };
}

export async function apiAddCommunityGifs(
  items: Array<{
    uploadId: string;
    title: string;
    tags: string[];
    playbackSpeed?: number;
    durationSec?: number;
    width?: number;
    height?: number;
  }>,
): Promise<{ ok: boolean; added?: GifItem[]; total?: number; error?: string }> {
  const res = await postJson<{
    ok?: boolean;
    added?: GifItem[];
    total?: number;
    error?: string;
  }>('/api/gifs/add', { items }, true);
  return {
    ok: res.ok,
    added: res.data?.added,
    total: res.data?.total,
    error: res.error,
  };
}

export async function apiRemoveCommunityGif(
  id: string,
): Promise<{ ok: boolean; total?: number; error?: string }> {
  const res = await postJson<{ ok?: boolean; total?: number; error?: string }>(
    '/api/gifs/remove',
    { id },
    true,
  );
  return {
    ok: res.ok,
    total: res.data?.total,
    error: res.error,
  };
}

export async function apiSearchGifs(
  query: string,
): Promise<{ ok: boolean; total: number; results: GifItem[] }> {
  try {
    if (!sessionToken) {
      return { ok: false, total: 0, results: [] };
    }
    const res = await fetchWithTunnelRecovery(`/api/gifs/search?q=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const data = (await res.json()) as {
      ok?: boolean;
      total?: number;
      results?: GifItem[];
    };
    if (!res.ok || !data.ok) {
      return { ok: false, total: 0, results: [] };
    }
    const results = Array.isArray(data.results) ? data.results : [];
    return {
      ok: true,
      total: typeof data.total === 'number' ? data.total : results.length,
      results,
    };
  } catch {
    return { ok: false, total: 0, results: [] };
  }
}

const cachedGifShareUrls = new Map<string, string>();

/** Returns an immediate deterministic Redshift /gif/<code> URL when possible (community or uploaded GIFs). */
export function getDeterministicGifShareUrl(gif: GifItem): string | null {
  if (!gif || !gif.url || gif.url.startsWith('blob:')) {
    return null;
  }
  const cached = cachedGifShareUrls.get(gif.url);
  if (cached) {
    return cached;
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (gif.id) {
    const shareUrl = `${origin}/gif/${encodeURIComponent(gif.id)}`;
    cachedGifShareUrls.set(gif.url, shareUrl);
    return shareUrl;
  }
  if (gif.url.startsWith('/api/uploads/')) {
    const uploadId = gif.url.slice('/api/uploads/'.length).split('/')[0];
    if (uploadId) {
      const shareUrl = `${origin}/gif/${encodeURIComponent(`u_${uploadId}`)}`;
      cachedGifShareUrls.set(gif.url, shareUrl);
      return shareUrl;
    }
  }
  return null;
}

/** Extracts a Redshift share code if text is a standalone /gif/<code> URL or path. */
export function extractGifShareCodeFromText(rawText: string): string | null {
  const match = rawText.trim().match(/^(?:https?:\/\/[^\s/]+)?\/gif\/([A-Za-z0-9_.-]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Ensures a unique persistent /gif/<code> shareable link exists for any GIF item. */
export async function apiGetGifShareLink(
  gif: GifItem,
): Promise<{ ok: boolean; code?: string; url?: string; gif?: GifItem; error?: string }> {
  const res = await postJson<{
    ok?: boolean;
    code?: string;
    path?: string;
    gif?: GifItem;
    error?: string;
  }>('/api/gifs/link', { gif }, true);
  if (!res.ok || !res.data?.code || !res.data?.path) {
    return { ok: false, error: res.error ?? 'Error: Could not generate GIF link' };
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const fullUrl = `${origin}${res.data.path}`;
  if (gif.url) {
    cachedGifShareUrls.set(gif.url, fullUrl);
  }
  return { ok: true, code: res.data.code, url: fullUrl, gif: res.data.gif };
}

/** Resolves a copied Redshift /gif/<code> share code back into full GIF media metadata. */
export async function apiResolveGifLink(
  code: string,
): Promise<{ ok: boolean; gif?: GifItem; error?: string }> {
  try {
    if (!sessionToken) {
      return { ok: false };
    }
    const res = await fetchWithTunnelRecovery(`/api/gifs/resolve?code=${encodeURIComponent(code)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const data = (await res.json()) as { ok?: boolean; gif?: GifItem; error?: string };
    if (!res.ok || !data.ok || !data.gif) {
      return { ok: false, error: data.error };
    }
    return { ok: true, gif: data.gif };
  } catch {
    return { ok: false };
  }
}

/** Mutes or unmutes notifications for a DM ("dm:<peer>") or Group ("group:<id>"). */
export async function apiMuteThread(
  threadKey: string,
  muteUntil: number | null,
): Promise<{ ok: boolean; snapshot?: SocialSnapshot; error?: string }> {
  const res = await postJson<{ ok?: boolean; snapshot?: SocialSnapshot; error?: string }>(
    '/api/threads/mute',
    { threadKey, muteUntil },
    true,
  );
  return { ok: res.ok, snapshot: res.data?.snapshot, error: res.error };
}

/** Hides or reveals a DM ("dm:<peer>") or Group ("group:<id>") in the sidebar until new notifications. */
export async function apiHideThread(
  threadKey: string,
  hidden = true,
): Promise<{ ok: boolean; snapshot?: SocialSnapshot; error?: string }> {
  const res = await postJson<{ ok?: boolean; snapshot?: SocialSnapshot; error?: string }>(
    '/api/threads/hide',
    { threadKey, hidden },
    true,
  );
  return { ok: res.ok, snapshot: res.data?.snapshot, error: res.error };
}

export async function apiOpenDm(
  peerUsername: string,
): Promise<{ ok: boolean; peer?: PublicProfile; snapshot?: SocialSnapshot; error?: string }> {
  const res = await postJson<{
    ok?: boolean;
    peer?: PublicProfile;
    snapshot?: SocialSnapshot;
    error?: string;
  }>('/api/dms/open', { peerUsername }, true);
  return {
    ok: res.ok,
    peer: res.data?.peer,
    snapshot: res.data?.snapshot,
    error: res.error,
  };
}

export async function apiCloseDm(
  peerUsername: string,
): Promise<{ ok: boolean; snapshot?: SocialSnapshot }> {
  const res = await postJson<{ ok?: boolean; snapshot?: SocialSnapshot }>(
    '/api/dms/close',
    { peerUsername },
    true,
  );
  return { ok: res.ok, snapshot: res.data?.snapshot };
}

export async function apiMarkDmRead(
  target: ThreadTarget,
): Promise<{ ok: boolean; snapshot?: SocialSnapshot }> {
  const norm = normalizeThreadTarget(target);
  const res = await postJson<{ ok?: boolean; snapshot?: SocialSnapshot }>(
    '/api/dms/read',
    norm,
    true,
  );
  return { ok: res.ok, snapshot: res.data?.snapshot };
}

export async function apiEditDmMessage(
  target: ThreadTarget,
  messageId: string,
  content: string,
): Promise<{ ok: boolean; message?: ChatMessage; error?: string }> {
  const norm = normalizeThreadTarget(target);
  const res = await postJson<{ ok?: boolean; message?: ChatMessage; error?: string }>(
    '/api/dms/edit',
    { ...norm, messageId, content },
    true,
  );
  if (!res.ok || !res.data?.message) {
    return { ok: false, error: res.error ?? 'Error: Could not edit message' };
  }
  return { ok: true, message: res.data.message };
}

export async function apiDeleteDmMessage(
  target: ThreadTarget,
  messageId: string,
): Promise<{ ok: boolean; error?: string }> {
  const norm = normalizeThreadTarget(target);
  const res = await postJson<{ ok?: boolean; error?: string }>(
    '/api/dms/delete',
    { ...norm, messageId },
    true,
  );
  return { ok: res.ok, error: res.error };
}

export async function apiTogglePinMessage(
  target: ThreadTarget,
  messageId: string,
  pinned?: boolean,
): Promise<{ ok: boolean; message?: ChatMessage; error?: string }> {
  const norm = normalizeThreadTarget(target);
  const res = await postJson<{ ok?: boolean; message?: ChatMessage; error?: string }>(
    '/api/dms/pin',
    { ...norm, messageId, pinned },
    true,
  );
  if (!res.ok || !res.data?.message) {
    return { ok: false, error: res.error ?? 'Error: Could not update pin state' };
  }
  return { ok: true, message: res.data.message };
}

export async function apiToggleDmReaction(
  target: ThreadTarget,
  messageId: string,
  emoji: string,
): Promise<{ ok: boolean; reactions?: MessageReaction[]; error?: string }> {
  const norm = normalizeThreadTarget(target);
  const res = await postJson<{ ok?: boolean; reactions?: MessageReaction[]; error?: string }>(
    '/api/dms/react',
    { ...norm, messageId, emoji },
    true,
  );
  if (!res.ok || !res.data?.reactions) {
    return { ok: false, error: res.error ?? 'Error: Could not update reaction' };
  }
  return { ok: true, reactions: res.data.reactions };
}

export async function apiCreateGroupDm(payload: {
  memberUsernames: string[];
  name?: string;
  iconDataUrl?: string;
}): Promise<{ ok: boolean; group?: GroupDmInfo; snapshot?: SocialSnapshot; error?: string }> {
  const res = await postJson<{
    ok?: boolean;
    group?: GroupDmInfo;
    snapshot?: SocialSnapshot;
    error?: string;
  }>('/api/groups/create', payload, true);
  return {
    ok: res.ok,
    group: res.data?.group,
    snapshot: res.data?.snapshot,
    error: res.error,
  };
}

export async function apiUpdateGroupDm(payload: {
  groupId: string;
  name?: string;
  iconDataUrl?: string | null;
}): Promise<{ ok: boolean; group?: GroupDmInfo; snapshot?: SocialSnapshot; error?: string }> {
  const res = await postJson<{
    ok?: boolean;
    group?: GroupDmInfo;
    snapshot?: SocialSnapshot;
    error?: string;
  }>('/api/groups/update', payload, true);
  return {
    ok: res.ok,
    group: res.data?.group,
    snapshot: res.data?.snapshot,
    error: res.error,
  };
}

export async function apiAddGroupMembers(
  groupId: string,
  usernames: string[],
): Promise<{ ok: boolean; group?: GroupDmInfo; snapshot?: SocialSnapshot; error?: string }> {
  const res = await postJson<{
    ok?: boolean;
    group?: GroupDmInfo;
    snapshot?: SocialSnapshot;
    error?: string;
  }>('/api/groups/add-members', { groupId, usernames }, true);
  return {
    ok: res.ok,
    group: res.data?.group,
    snapshot: res.data?.snapshot,
    error: res.error,
  };
}

export async function apiLeaveGroupDm(
  groupId: string,
): Promise<{ ok: boolean; snapshot?: SocialSnapshot; error?: string }> {
  const res = await postJson<{
    ok?: boolean;
    snapshot?: SocialSnapshot;
    error?: string;
  }>('/api/groups/leave', { groupId }, true);
  return {
    ok: res.ok,
    snapshot: res.data?.snapshot,
    error: res.error,
  };
}

export async function apiKickGroupMember(
  groupId: string,
  targetUsername: string,
): Promise<{ ok: boolean; group?: GroupDmInfo; snapshot?: SocialSnapshot; error?: string }> {
  const res = await postJson<{
    ok?: boolean;
    group?: GroupDmInfo;
    snapshot?: SocialSnapshot;
    error?: string;
  }>('/api/groups/kick', { groupId, targetUsername }, true);
  return {
    ok: res.ok,
    group: res.data?.group,
    snapshot: res.data?.snapshot,
    error: res.error,
  };
}

export async function apiTransferGroupOwner(
  groupId: string,
  targetUsername: string,
): Promise<{ ok: boolean; group?: GroupDmInfo; snapshot?: SocialSnapshot; error?: string }> {
  const res = await postJson<{
    ok?: boolean;
    group?: GroupDmInfo;
    snapshot?: SocialSnapshot;
    error?: string;
  }>('/api/groups/transfer-owner', { groupId, targetUsername }, true);
  return {
    ok: res.ok,
    group: res.data?.group,
    snapshot: res.data?.snapshot,
    error: res.error,
  };
}

export async function apiChangePassword(payload: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ ok: boolean; message?: string; error?: string }> {
  const res = await postJson<{ ok?: boolean; message?: string; error?: string }>(
    '/api/account/change-password',
    payload,
    true,
  );
  return { ok: res.ok, message: res.data?.message, error: res.error };
}

export async function apiChangeEmail(payload: {
  currentPassword: string;
  email: string;
}): Promise<{ ok: boolean; snapshot?: SocialSnapshot; error?: string }> {
  const res = await postJson<{ ok?: boolean; snapshot?: SocialSnapshot; error?: string }>(
    '/api/account/change-email',
    payload,
    true,
  );
  return { ok: res.ok, snapshot: res.data?.snapshot, error: res.error };
}

export async function apiUpdatePrivacy(payload: {
  allowFriendRequests?: boolean;
  allowNonFriendDms?: boolean;
  privateProfile?: boolean;
  showReadReceipts?: boolean;
}): Promise<{ ok: boolean; snapshot?: SocialSnapshot; error?: string }> {
  const res = await postJson<{ ok?: boolean; snapshot?: SocialSnapshot; error?: string }>(
    '/api/account/privacy',
    payload,
    true,
  );
  return { ok: res.ok, snapshot: res.data?.snapshot, error: res.error };
}

export interface MutualGroupSummary {
  id: string;
  name: string;
  iconDataUrl?: string;
  memberCount: number;
}

export async function apiFetchMutualProfile(username: string): Promise<{
  ok: boolean;
  mutualFriends: PublicProfile[];
  mutualGroups: MutualGroupSummary[];
}> {
  try {
    if (!sessionToken) {
      return { ok: false, mutualFriends: [], mutualGroups: [] };
    }
    const res = await fetchWithTunnelRecovery(
      `/api/friends/mutual?username=${encodeURIComponent(username.trim())}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${sessionToken}` },
      },
    );
    const data = (await res.json()) as {
      ok?: boolean;
      mutualFriends?: PublicProfile[];
      mutualGroups?: MutualGroupSummary[];
    };
    if (!res.ok || !data.ok) {
      return { ok: false, mutualFriends: [], mutualGroups: [] };
    }
    return {
      ok: true,
      mutualFriends: Array.isArray(data.mutualFriends) ? data.mutualFriends : [],
      mutualGroups: Array.isArray(data.mutualGroups) ? data.mutualGroups : [],
    };
  } catch {
    return { ok: false, mutualFriends: [], mutualGroups: [] };
  }
}

export async function apiSignOutOtherSessions(): Promise<{
  ok: boolean;
  revokedCount?: number;
  error?: string;
}> {
  const res = await postJson<{ ok?: boolean; revokedCount?: number; error?: string }>(
    '/api/account/signout-others',
    {},
    true,
  );
  return { ok: res.ok, revokedCount: res.data?.revokedCount, error: res.error };
}

export interface SocialSocketHandle {
  sendTyping: (toUsername: string, isTyping: boolean, groupId?: string) => void;
  sendVcJoin: (target: ThreadTarget, muted: boolean, deafened: boolean, ring?: boolean) => void;
  sendVcDecline: (threadKey: string) => void;
  sendVcLeave: (threadKey: string) => void;
  sendVcVoiceState: (
    threadKey: string,
    muted: boolean,
    deafened: boolean,
    extra?: {
      cameraOn?: boolean;
      screenSharing?: boolean;
      screenPaused?: boolean;
      cameraStreamId?: string;
      screenStreamId?: string;
    },
  ) => void;
  sendVcSpeaking: (threadKey: string, speaking: boolean) => void;
  sendVcSignal: (threadKey: string, toUsername: string, signal: VcSignalData) => void;
  disconnect: () => void;
}

export function connectSocialSocket(handlers: {
  onOpen?: () => void;
  onClose?: () => void;
  onSnapshot: (snapshot: SocialSnapshot) => void;
  onSocialNotify?: (payload: SocialNotifyEventPayload) => void;
  onGifsUpdated?: () => void;
  onDmMessage: (payload: DmMessageEventPayload) => void;
  onDmEdit: (payload: DmEditEventPayload) => void;
  onDmDelete: (payload: DmDeleteEventPayload) => void;
  onDmPin?: (payload: DmPinEventPayload) => void;
  onDmReact: (payload: DmReactEventPayload) => void;
  onDmRead?: (payload: DmReadEventPayload) => void;
  onTyping: (payload: TypingEventPayload) => void;
  onVcState?: (payload: VcStateEventPayload) => void;
  onVcIncoming?: (payload: VcIncomingCallPayload) => void;
  onVcIncomingClear?: (threadKey: string) => void;
  onVcSignal?: (payload: VcSignalEventPayload) => void;
  onVcSpeaking?: (payload: VcSpeakingEventPayload) => void;
  onVcError?: (error: string) => void;
}): SocialSocketHandle {
  let closedByCaller = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let keepaliveTimer: number | null = null;
  let consecutiveFailures = 0;

  const stopKeepalive = () => {
    if (keepaliveTimer !== null) {
      window.clearInterval(keepaliveTimer);
      keepaliveTimer = null;
    }
  };

  const sendFrame = (payload: Record<string, unknown>) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  };

  const connect = () => {
    if (closedByCaller || !sessionToken) {
      return;
    }

    stopKeepalive();
    const wsUrl = resolveWsUrl(`/ws?token=${encodeURIComponent(sessionToken)}`);
    socket = new WebSocket(wsUrl);

    socket.addEventListener('open', () => {
      consecutiveFailures = 0;
      stopKeepalive();
      keepaliveTimer = window.setInterval(() => {
        sendFrame({ type: 'ping' });
      }, 15000);
      handlers.onOpen?.();
    });

    socket.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as Record<string, unknown>;
        if (msg.type === 'social:sync' && msg.snapshot) {
          handlers.onSnapshot(msg.snapshot as SocialSnapshot);
        } else if (msg.type === 'social:notify' && msg.event) {
          handlers.onSocialNotify?.(msg.event as SocialNotifyEventPayload);
        } else if (msg.type === 'gifs:updated') {
          handlers.onGifsUpdated?.();
        } else if (
          msg.type === 'dm:message' &&
          (msg.threadUsers || msg.groupId) &&
          msg.message
        ) {
          handlers.onDmMessage({
            threadUsers: msg.threadUsers as [string, string] | undefined,
            groupId: msg.groupId as string | undefined,
            message: msg.message as ChatMessage,
          });
        } else if (msg.type === 'dm:edit' && (msg.threadUsers || msg.groupId) && msg.message) {
          handlers.onDmEdit({
            threadUsers: msg.threadUsers as [string, string] | undefined,
            groupId: msg.groupId as string | undefined,
            message: msg.message as ChatMessage,
          });
        } else if (msg.type === 'dm:pin' && (msg.threadUsers || msg.groupId) && msg.message) {
          handlers.onDmPin?.({
            threadUsers: msg.threadUsers as [string, string] | undefined,
            groupId: msg.groupId as string | undefined,
            message: msg.message as ChatMessage,
          });
        } else if (
          msg.type === 'dm:delete' &&
          (msg.threadUsers || msg.groupId) &&
          typeof msg.messageId === 'string'
        ) {
          handlers.onDmDelete({
            threadUsers: msg.threadUsers as [string, string] | undefined,
            groupId: msg.groupId as string | undefined,
            messageId: msg.messageId,
          });
        } else if (
          msg.type === 'dm:react' &&
          (msg.threadUsers || msg.groupId) &&
          typeof msg.messageId === 'string' &&
          Array.isArray(msg.reactions)
        ) {
          handlers.onDmReact({
            threadUsers: msg.threadUsers as [string, string] | undefined,
            groupId: msg.groupId as string | undefined,
            messageId: msg.messageId,
            reactions: msg.reactions as MessageReaction[],
          });
        } else if (
          msg.type === 'dm:read' &&
          (msg.threadUsers || msg.groupId) &&
          msg.receipt
        ) {
          handlers.onDmRead?.({
            threadUsers: msg.threadUsers as [string, string] | undefined,
            groupId: msg.groupId as string | undefined,
            receipt: msg.receipt as DmReadReceipt,
          });
        } else if (
          msg.type === 'dm:typing' &&
          typeof msg.fromUsername === 'string' &&
          typeof msg.displayName === 'string'
        ) {
          handlers.onTyping({
            fromUsername: msg.fromUsername,
            displayName: msg.displayName,
            isTyping: Boolean(msg.isTyping),
            groupId: typeof msg.groupId === 'string' ? msg.groupId : undefined,
          });
        } else if (msg.type === 'vc:state' && typeof msg.threadKey === 'string') {
          handlers.onVcState?.(msg as unknown as VcStateEventPayload);
        } else if (msg.type === 'vc:incoming' && typeof msg.threadKey === 'string' && msg.caller) {
          handlers.onVcIncoming?.(msg as unknown as VcIncomingCallPayload);
        } else if (msg.type === 'vc:incoming-clear' && typeof msg.threadKey === 'string') {
          handlers.onVcIncomingClear?.(msg.threadKey);
        } else if (
          msg.type === 'vc:signal' &&
          typeof msg.threadKey === 'string' &&
          typeof msg.fromUsername === 'string' &&
          msg.signal
        ) {
          handlers.onVcSignal?.(msg as unknown as VcSignalEventPayload);
        } else if (
          msg.type === 'vc:speaking' &&
          typeof msg.threadKey === 'string' &&
          typeof msg.username === 'string'
        ) {
          handlers.onVcSpeaking?.({
            threadKey: msg.threadKey,
            username: msg.username,
            speaking: Boolean(msg.speaking),
          });
        } else if (msg.type === 'vc:error' && typeof msg.error === 'string') {
          handlers.onVcError?.(msg.error);
        }
      } catch {
        // Ignore malformed websocket frames.
      }
    });

    socket.addEventListener('close', () => {
      stopKeepalive();
      socket = null;
      consecutiveFailures += 1;
      handlers.onClose?.();
      if (!closedByCaller && sessionToken) {
        if (consecutiveFailures >= 1 && isAutoDiscoverableRemoteUrl(apiServerBaseUrl)) {
          void tryRediscoverDeadTunnel(apiServerBaseUrl).finally(() => {
            if (!closedByCaller && sessionToken) {
              reconnectTimer = window.setTimeout(connect, 1000);
            }
          });
          return;
        }
        reconnectTimer = window.setTimeout(connect, 1500);
      }
    });
  };

  connect();

  return {
    sendTyping: (toUsername: string, isTyping: boolean, groupId?: string) => {
      sendFrame(
        groupId
          ? { type: 'dm:typing', groupId, isTyping }
          : { type: 'dm:typing', toUsername, isTyping },
      );
    },
    sendVcJoin: (target: ThreadTarget, muted: boolean, deafened: boolean, ring = true) => {
      const norm = normalizeThreadTarget(target);
      sendFrame({ type: 'vc:join', ...norm, muted, deafened, ring });
    },
    sendVcDecline: (threadKey: string) => {
      sendFrame({ type: 'vc:decline', threadKey });
    },
    sendVcLeave: (threadKey: string) => {
      sendFrame({ type: 'vc:leave', threadKey });
    },
    sendVcVoiceState: (
      threadKey: string,
      muted: boolean,
      deafened: boolean,
      extra?: {
        cameraOn?: boolean;
        screenSharing?: boolean;
        screenPaused?: boolean;
        cameraStreamId?: string;
        screenStreamId?: string;
      },
    ) => {
      sendFrame({
        type: 'vc:voice-state',
        threadKey,
        muted,
        deafened,
        cameraOn: Boolean(extra?.cameraOn),
        screenSharing: Boolean(extra?.screenSharing),
        screenPaused: Boolean(extra?.screenPaused),
        cameraStreamId: extra?.cameraStreamId || '',
        screenStreamId: extra?.screenStreamId || '',
      });
    },
    sendVcSpeaking: (threadKey: string, speaking: boolean) => {
      sendFrame({ type: 'vc:speaking', threadKey, speaking });
    },
    sendVcSignal: (threadKey: string, toUsername: string, signal: VcSignalData) => {
      sendFrame({ type: 'vc:signal', threadKey, toUsername, signal });
    },
    disconnect: () => {
      closedByCaller = true;
      stopKeepalive();
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (socket) {
        socket.close();
        socket = null;
      }
    },
  };
}
