/* Redshift PWA & Web Push Service Worker (iOS 16.4+ & Android) */

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Keep API, WebSocket, and app bundles strictly network-first so updates land immediately.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.includes('/api/') || url.pathname.endsWith('/ws')) {
    return;
  }
  // Pass through directly to network; service worker presence enables install + Web Push.
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Redshift',
    body: 'New activity in Redshift',
    tag: 'redshift-general',
    icon: '',
    presetAvatar: null,
    badge: './icon.png',
    threadKind: '',
    threadId: '',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        payload = {
          ...payload,
          ...parsed,
        };
      }
    } catch {
      try {
        const txt = event.data.text();
        if (txt) payload.body = txt;
      } catch {}
    }
  }

  let resolvedIcon = '';
  if (typeof payload.icon === 'string' && payload.icon.trim()) {
    try {
      resolvedIcon = new URL(payload.icon.trim(), self.registration.scope).toString();
    } catch {
      resolvedIcon = payload.icon.trim();
    }
  } else if (
    typeof payload.presetAvatar === 'number' &&
    Number.isInteger(payload.presetAvatar) &&
    payload.presetAvatar >= 0 &&
    payload.presetAvatar <= 3
  ) {
    resolvedIcon = new URL(
      `./preset-avatar-${payload.presetAvatar}.png`,
      self.registration.scope,
    ).toString();
  }
  if (!resolvedIcon) {
    resolvedIcon = new URL('./icon.png', self.registration.scope).toString();
  }

  let resolvedBadge = '';
  try {
    resolvedBadge = new URL(payload.badge || './icon.png', self.registration.scope).toString();
  } catch {
    resolvedBadge = payload.badge || './icon.png';
  }

  const options = {
    body: String(payload.body || ''),
    icon: resolvedIcon,
    badge: resolvedBadge,
    tag: payload.tag || 'redshift-general',
    renotify: true,
    data: {
      threadKind: payload.threadKind || '',
      threadId: payload.threadId || '',
      url: payload.url || './',
    },
  };

  event.waitUntil(self.registration.showNotification(String(payload.title || 'Redshift'), options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const threadKind = typeof data.threadKind === 'string' ? data.threadKind : '';
  const threadId = typeof data.threadId === 'string' ? data.threadId : '';

  const baseUrl = new URL('./', self.registration.scope);
  if (threadKind && threadId) {
    baseUrl.searchParams.set('openThread', `${threadKind}:${threadId}`);
  }
  const targetUrl = baseUrl.toString();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.postMessage({
            type: 'redshift:open-thread',
            threadKind,
            threadId,
          });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
