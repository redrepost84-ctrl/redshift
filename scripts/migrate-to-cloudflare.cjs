const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');

function loadEnvFile() {
  const envPath = path.join(ROOT, '.env');
  const map = {};
  if (!fs.existsSync(envPath)) return map;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    map[k] = v;
  }
  return map;
}

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : '';
}

const SMALL_KV_KEYS = [
  'friendships',
  'blocks',
  'friendRequests',
  'openDms',
  'uploads',
  'favoriteGifs',
  'communityGifs',
  'sessions',
  'unreadDms',
  'unreadGroups',
  'unreadMentions',
  'groupUnreadMentions',
  'dmReadReceipts',
  'mutedThreads',
  'hiddenThreads',
  'threadActivity',
  'gifLinks',
];

async function main() {
  const env = loadEnvFile();
  const targetUrl = (
    getArg('--url') ||
    process.env.REDSHIFT_SERVER_URL ||
    env.REDSHIFT_SERVER_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '');
  const adminSecret = (
    getArg('--secret') ||
    process.env.REDSHIFT_ADMIN_SECRET ||
    env.REDSHIFT_ADMIN_SECRET ||
    ''
  ).trim();

  if (!targetUrl) {
    console.error('Missing --url (or REDSHIFT_SERVER_URL in .env)');
    process.exit(1);
  }
  if (!adminSecret) {
    console.error('Missing --secret (or REDSHIFT_ADMIN_SECRET in .env)');
    process.exit(1);
  }

  const sqlitePath = path.join(ROOT, 'server', 'data', 'redshift.sqlite');
  const uploadsDir = path.join(ROOT, 'server', 'data', 'uploads');
  if (!fs.existsSync(sqlitePath)) {
    console.error(`Local SQLite database not found at ${sqlitePath}`);
    process.exit(1);
  }

  console.log(`[Migrate] Target Cloudflare Worker: ${targetUrl}`);
  const healthRes = await fetch(`${targetUrl}/api/health`);
  const health = await healthRes.json();
  if (!healthRes.ok || !health?.ok) {
    throw new Error(`Health check failed: HTTP ${healthRes.status}`);
  }
  console.log(`[Migrate] Target healthy (service=${health.service}, cloud=${health.cloud || 'local'})`);

  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
  const getKv = (key, fallback) => {
    const row = sqlite.prepare('SELECT json FROM kv_collections WHERE key = ?').get(key);
    if (!row || typeof row.json !== 'string') return fallback;
    try {
      return JSON.parse(row.json);
    } catch {
      return fallback;
    }
  };

  const accounts = getKv('accounts', []);
  const groupDms = getKv('groupDms', {});
  const kvPayload = {};
  for (const key of SMALL_KV_KEYS) {
    kvPayload[key] = getKv(key, key === 'friendRequests' || key === 'communityGifs' ? [] : {});
  }

  const rawMsgRows = sqlite
    .prepare('SELECT thread_key, data_json FROM messages ORDER BY seq ASC')
    .all();
  const messages = [];
  for (const row of rawMsgRows) {
    try {
      messages.push({ threadKey: row.thread_key, msg: JSON.parse(row.data_json) });
    } catch {}
  }
  sqlite.close();

  console.log(
    `[Migrate] Read local SQLite: ${accounts.length} accounts, ${Object.keys(groupDms).length} groups, ${messages.length} messages, ${Object.keys(kvPayload.uploads || {}).length} upload metas`,
  );

  // Batch import messages (200 per request) along with full collections on batch 0
  const BATCH_SIZE = 200;
  const firstBatch = messages.slice(0, BATCH_SIZE);
  const res0 = await fetch(`${targetUrl}/api/admin/import-state`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': adminSecret,
    },
    body: JSON.stringify({
      accounts,
      groupDms,
      ...kvPayload,
      replaceMessages: true,
      messages: firstBatch,
    }),
  });
  const data0 = await res0.json();
  if (!res0.ok || !data0?.ok) {
    throw new Error(`State import batch 0 failed: ${data0?.error || `HTTP ${res0.status}`}`);
  }
  console.log(`[Migrate] Imported state + ${firstBatch.length}/${messages.length} messages`);

  for (let offset = BATCH_SIZE; offset < messages.length; offset += BATCH_SIZE) {
    const batch = messages.slice(offset, offset + BATCH_SIZE);
    const resB = await fetch(`${targetUrl}/api/admin/import-state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Secret': adminSecret,
      },
      body: JSON.stringify({ messages: batch }),
    });
    const dataB = await resB.json();
    if (!resB.ok || !dataB?.ok) {
      throw new Error(`Message batch @${offset} failed: ${dataB?.error || `HTTP ${resB.status}`}`);
    }
    console.log(
      `[Migrate] Imported ${Math.min(offset + batch.length, messages.length)}/${messages.length} messages`,
    );
  }

  // Upload all intact binary files in server/data/uploads/
  const uploadMetas = kvPayload.uploads || {};
  let uploadedCount = 0;
  let uploadedBytes = 0;
  let missingCount = 0;

  for (const [uploadId, meta] of Object.entries(uploadMetas)) {
    if (!meta || !meta.diskName) continue;
    const diskPath = path.join(uploadsDir, meta.diskName);
    if (!fs.existsSync(diskPath)) {
      missingCount += 1;
      continue;
    }
    const buf = fs.readFileSync(diskPath);
    const upRes = await fetch(`${targetUrl}/api/admin/import-upload/${encodeURIComponent(uploadId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Admin-Secret': adminSecret,
      },
      body: buf,
    });
    const upData = await upRes.json();
    if (!upRes.ok || !upData?.ok) {
      throw new Error(
        `Upload blob ${uploadId} (${meta.name}) failed: ${upData?.error || `HTTP ${upRes.status}`}`,
      );
    }
    uploadedCount += 1;
    uploadedBytes += buf.length;
    console.log(`[Migrate] Uploaded blob ${uploadId} (${meta.name}, ${buf.length} bytes)`);
  }

  // Verify remote stats
  const statsRes = await fetch(`${targetUrl}/api/admin/stats`, {
    headers: { 'X-Admin-Secret': adminSecret },
  });
  const stats = await statsRes.json();
  if (!statsRes.ok || !stats?.ok) {
    throw new Error(`Stats verification failed: HTTP ${statsRes.status}`);
  }

  console.log('\n=== Migration Complete & Verified ===');
  console.log(`Accounts:       local=${accounts.length}  cloud=${stats.accounts}`);
  console.log(`Group Chats:    local=${Object.keys(groupDms).length}  cloud=${stats.groupDms}`);
  console.log(`Messages:       local=${messages.length}  cloud=${stats.messages}`);
  console.log(`Sessions:       local=${Object.keys(kvPayload.sessions || {}).length}  cloud=${stats.sessions}`);
  console.log(`Uploaded Blobs: uploaded=${uploadedCount} (${uploadedBytes} bytes), missingOnLocal=${missingCount}, cloudBlobs=${stats.uploadedBlobs}`);

  if (stats.accounts !== accounts.length || stats.messages !== messages.length) {
    throw new Error('Verification mismatch between local SQLite and Cloudflare Durable Object!');
  }
}

main().catch((err) => {
  console.error('[Migrate Error]', err.message);
  process.exit(1);
});
