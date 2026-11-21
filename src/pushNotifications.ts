import {
  apiFetchPushPublicKey,
  apiSubscribeWebPush,
  apiUnsubscribeWebPush,
} from './apiClient';
import { getDesktopBridge } from './desktopBridge';

export type WebPushStatus =
  | 'desktop-app'
  | 'ios-needs-homescreen'
  | 'unsupported'
  | 'denied'
  | 'enabled'
  | 'available';

export function isIosMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1)
  );
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true,
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + pad).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buf = new ArrayBuffer(rawData.length);
  const output = new Uint8Array(buf);
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerRedshiftServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (swRegistrationPromise) {
    return swRegistrationPromise;
  }
  swRegistrationPromise = (async () => {
    if (getDesktopBridge()) {
      return null;
    }
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return null;
    }
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return null;
    }
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      return reg;
    } catch {
      return null;
    }
  })();
  return swRegistrationPromise;
}

export async function getWebPushStatus(): Promise<WebPushStatus> {
  if (getDesktopBridge()) {
    return 'desktop-app';
  }
  if (isIosMobileDevice() && !isStandalonePwa()) {
    return 'ios-needs-homescreen';
  }
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    typeof Notification === 'undefined'
  ) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') {
    return 'denied';
  }
  const reg = await registerRedshiftServiceWorker();
  if (!reg) {
    return 'unsupported';
  }
  try {
    const existing = await reg.pushManager.getSubscription();
    if (existing && Notification.permission === 'granted') {
      return 'enabled';
    }
  } catch {
    return 'unsupported';
  }
  return 'available';
}

export async function enablePhonePushNotifications(): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (getDesktopBridge()) {
    return { ok: true };
  }
  if (isIosMobileDevice() && !isStandalonePwa()) {
    return {
      ok: false,
      error: 'On iPhone, tap Share → Add to Home Screen first to enable lock-screen notifications.',
    };
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
    return { ok: false, error: 'Push notifications are not supported in this browser.' };
  }

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      error: 'Notification permission was denied. Enable notifications for Redshift in your phone settings.',
    };
  }

  const reg = await registerRedshiftServiceWorker();
  if (!reg) {
    return { ok: false, error: 'Could not register service worker for push notifications.' };
  }

  const keyRes = await apiFetchPushPublicKey();
  if (!keyRes.ok || !keyRes.configured || !keyRes.publicKey) {
    return { ok: false, error: 'Push notification service is not configured on the server yet.' };
  }

  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey),
      });
    }
    const saveRes = await apiSubscribeWebPush(sub.toJSON());
    if (!saveRes.ok) {
      return { ok: false, error: saveRes.error || 'Could not register device for notifications.' };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not enable push notifications.',
    };
  }
}

export async function disablePhonePushNotifications(): Promise<{ ok: boolean }> {
  try {
    const reg = await registerRedshiftServiceWorker();
    const sub = await reg?.pushManager.getSubscription();
    const endpoint = sub?.endpoint;
    if (sub) {
      await sub.unsubscribe().catch(() => {});
    }
    await apiUnsubscribeWebPush(endpoint);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function syncExistingPushSubscriptionIfPermitted(): Promise<void> {
  if (getDesktopBridge()) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const reg = await registerRedshiftServiceWorker();
  if (!reg) return;
  try {
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await apiSubscribeWebPush(sub.toJSON());
    }
  } catch {
    // Ignore silent sync failures.
  }
}

export function attachPushNotificationNavigation(
  onNavigate: (threadKind: string, threadId: string) => void,
): () => void {
  const checkInitialUrl = () => {
    try {
      const url = new URL(window.location.href);
      const raw = url.searchParams.get('openThread');
      if (!raw) return;
      const idx = raw.indexOf(':');
      if (idx > 0) {
        const kind = raw.slice(0, idx);
        const id = raw.slice(idx + 1);
        if (kind && id) {
          onNavigate(kind, id);
        }
      }
      url.searchParams.delete('openThread');
      window.history.replaceState({}, '', url.toString());
    } catch {}
  };

  window.setTimeout(checkInitialUrl, 250);

  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {};
  }
  const onSwMessage = (event: MessageEvent) => {
    const data = event.data as { type?: string; threadKind?: string; threadId?: string } | null;
    if (data?.type === 'redshift:open-thread' && data.threadKind && data.threadId) {
      onNavigate(data.threadKind, data.threadId);
    }
  };
  navigator.serviceWorker.addEventListener('message', onSwMessage);
  return () => {
    navigator.serviceWorker.removeEventListener('message', onSwMessage);
  };
}
