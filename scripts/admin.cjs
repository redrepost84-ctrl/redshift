const path = require('path');
const PORT = Number(process.env.PORT) || 8080;
const BASE_URL = process.env.REDSHIFT_ADMIN_URL || `http://127.0.0.1:${PORT}`;

const args = process.argv.slice(2);
const cmd = (args[0] || 'list').toLowerCase();

function getFlag(name) {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

async function loadDirectSqliteDb() {
  const { createSqliteStore } = await import('../server/dbStore.js');
  const store = createSqliteStore(() => ({
    accounts: [],
    friendships: {},
    blocks: {},
    friendRequests: [],
    dms: {},
    openDms: {},
    groupDms: {},
    uploads: {},
    favoriteGifs: {},
    communityGifs: [],
    sessions: {},
    unreadDms: {},
    unreadGroups: {},
    unreadMentions: {},
    groupUnreadMentions: {},
    dmReadReceipts: {},
    mutedThreads: {},
    hiddenThreads: {},
    threadActivity: {},
    gifLinks: {},
  }));
  return { store, db: store.loadDb() };
}

async function callAdmin(pathUrl, method = 'GET', body = undefined) {
  try {
    const res = await fetch(`${BASE_URL}${pathUrl}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status !== 404) {
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      return data;
    }
  } catch (err) {
    if (err && err.message && !err.message.includes('fetch failed') && !err.message.includes('HTTP 404')) {
      throw err;
    }
  }

  // Direct SQLite fallback if server was started before /api/admin routes were loaded
  const { store, db } = await loadDirectSqliteDb();
  try {
    if (pathUrl === '/api/admin/accounts') {
      const accounts = db.accounts.map((acc) => {
        const uKey = acc.username.toLowerCase();
        const activeSessions = Object.values(db.sessions || {}).filter((v) => v === uKey).length;
        return {
          username: acc.username,
          displayName: acc.displayName,
          email: acc.email,
          bio: acc.bio || '',
          status: acc.status || 'online',
          online: activeSessions > 0,
          createdAt: acc.createdAt,
          friends: db.friendships?.[uKey] ?? [],
          activeSessions,
        };
      });
      return { ok: true, total: accounts.length, accounts };
    }
    throw new Error('Restart host:online to apply live in-memory mutations');
  } finally {
    store.close();
  }
}

async function main() {
  if (cmd === 'list') {
    const data = await callAdmin('/api/admin/accounts');
    console.log(`\n=== Redshift Live Accounts (${data.total}) ===`);
    for (const acc of data.accounts) {
      const onlineTag = acc.online ? 'ONLINE ' : 'offline';
      console.log(
        `- @${acc.username} (${acc.displayName}) | ${acc.email} | [${onlineTag} / ${acc.status}] | friends: ${acc.friends.length} | sessions: ${acc.activeSessions}`,
      );
    }
    console.log('');
    return;
  }

  if (cmd === 'update') {
    const username = args[1];
    if (!username) {
      console.error('Usage: node scripts/admin.cjs update <username> [--displayName "..."] [--email "..."] [--password "..."] [--bio "..."] [--status online|idle|dnd|invisible]');
      process.exit(1);
    }
    const payload = {
      username,
      displayName: getFlag('--displayName'),
      email: getFlag('--email'),
      newPassword: getFlag('--password'),
      bio: getFlag('--bio'),
      status: getFlag('--status'),
    };
    const data = await callAdmin('/api/admin/accounts/update', 'POST', payload);
    console.log('[Admin] Updated account in real time:', data.account);
    return;
  }

  if (cmd === 'kick') {
    const username = args[1];
    if (!username) {
      console.error('Usage: node scripts/admin.cjs kick <username>');
      process.exit(1);
    }
    const data = await callAdmin('/api/admin/accounts/kick', 'POST', { username });
    console.log(`[Admin] Kicked @${data.username} (revoked ${data.revokedSessions} sessions, closed ${data.closedSockets} sockets)`);
    return;
  }

  if (cmd === 'delete') {
    const username = args[1];
    if (!username) {
      console.error('Usage: node scripts/admin.cjs delete <username>');
      process.exit(1);
    }
    const data = await callAdmin('/api/admin/accounts/delete', 'POST', { username });
    console.log(`[Admin] Deleted account @${data.deletedUsername} in real time.`);
    return;
  }

  console.log('Redshift Moderator CLI Commands:');
  console.log('  node scripts/admin.cjs list');
  console.log('  node scripts/admin.cjs update <username> [--displayName "..."] [--email "..."] [--password "..."] [--bio "..."] [--status online|idle|dnd|invisible]');
  console.log('  node scripts/admin.cjs kick <username>');
  console.log('  node scripts/admin.cjs delete <username>');
}

main().catch((err) => {
  console.error('[Admin Error]', err.message);
  process.exit(1);
});
