import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const KV_KEYS = [
  'accounts',
  'friendships',
  'blocks',
  'friendRequests',
  'openDms',
  'groupDms',
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

export function resolveDataPaths() {
  const dataDir = process.env.REDSHIFT_DATA_DIR
    ? path.resolve(process.env.REDSHIFT_DATA_DIR)
    : path.resolve(process.cwd(), 'server', 'data');
  return {
    dataDir,
    uploadsDir: path.join(dataDir, 'uploads'),
    legacyJsonPath: path.join(dataDir, 'redshift-db.json'),
    sqlitePath: path.join(dataDir, 'redshift.sqlite'),
  };
}

/**
 * Normalizes an incoming raw JSON DB backup or parsed object using provided seed defaults
 * and strips dangling active/ringing call statuses across server restarts.
 */
function cleanCallStatuses(dmsMap) {
  const bootNow = Date.now();
  for (const threadMsgs of Object.values(dmsMap)) {
    if (!Array.isArray(threadMsgs)) {
      continue;
    }
    for (const msg of threadMsgs) {
      if (
        msg &&
        typeof msg === 'object' &&
        msg.callLog &&
        typeof msg.callLog === 'object' &&
        (msg.callLog.status === 'ringing' || msg.callLog.status === 'active')
      ) {
        if (msg.callLog.status === 'active' || msg.callLog.answeredAt) {
          const answeredAt =
            typeof msg.callLog.answeredAt === 'number'
              ? msg.callLog.answeredAt
              : (msg.callLog.startedAt ?? msg.timestamp ?? bootNow);
          const endedAt = typeof msg.callLog.endedAt === 'number' ? msg.callLog.endedAt : bootNow;
          msg.callLog.status = 'ended';
          msg.callLog.endedAt = endedAt;
          msg.callLog.durationMs = Math.max(0, endedAt - answeredAt);
        } else {
          msg.callLog.status = 'missed';
          msg.callLog.endedAt =
            typeof msg.callLog.endedAt === 'number' ? msg.callLog.endedAt : bootNow;
        }
      }
    }
  }
}

export function createSqliteStore(createSeedDb) {
  const paths = resolveDataPaths();
  fs.mkdirSync(paths.dataDir, { recursive: true });
  fs.mkdirSync(paths.uploadsDir, { recursive: true });

  const sqlite = new DatabaseSync(paths.sqlitePath);
  try {
    const existingCols = sqlite.prepare('PRAGMA table_info(messages)').all();
    if (existingCols.length > 0 && !existingCols.some((c) => c.name === 'seq')) {
      sqlite.exec('DROP TABLE IF EXISTS messages;');
    }
  } catch {
    // Table does not exist yet.
  }
  sqlite.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS kv_collections (
      key TEXT PRIMARY KEY,
      json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT UNIQUE NOT NULL,
      thread_key TEXT NOT NULL,
      author_username TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      data_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_thread_order
      ON messages(thread_key, timestamp DESC, seq DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_thread_asc
      ON messages(thread_key, seq ASC);

    CREATE TABLE IF NOT EXISTS link_cache (
      url TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );
  `);

  const stmtGetKv = sqlite.prepare('SELECT json FROM kv_collections WHERE key = ?');
  const stmtSetKv = sqlite.prepare(
    'INSERT INTO kv_collections (key, json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json',
  );
  const stmtInsertMsg = sqlite.prepare(
    'INSERT INTO messages (id, thread_key, author_username, timestamp, content, data_json) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const stmtUpdateMsg = sqlite.prepare(
    'UPDATE messages SET content = ?, data_json = ? WHERE id = ?',
  );
  const stmtDeleteMsg = sqlite.prepare('DELETE FROM messages WHERE id = ?');
  const stmtDeleteThreadMsgs = sqlite.prepare('DELETE FROM messages WHERE thread_key = ?');
  const stmtGetMsgOrder = sqlite.prepare(
    'SELECT seq, timestamp FROM messages WHERE thread_key = ? AND id = ?',
  );

  const runInTransaction = (fn) => {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const res = fn();
      sqlite.exec('COMMIT');
      return res;
    } catch (err) {
      try {
        sqlite.exec('ROLLBACK');
      } catch {
        // Ignore rollback failure.
      }
      throw err;
    }
  };

  const saveCollections = (dbObj) => {
    runInTransaction(() => {
      for (const key of KV_KEYS) {
        const val = dbObj[key];
        stmtSetKv.run(key, JSON.stringify(val ?? {}));
      }
    });
  };

  const insertMessage = (threadKey, storedMsg) => {
    stmtInsertMsg.run(
      storedMsg.id,
      threadKey,
      String(storedMsg.authorUsername || '').toLowerCase(),
      Number(storedMsg.timestamp) || Date.now(),
      String(storedMsg.content || ''),
      JSON.stringify(storedMsg),
    );
  };

  const updateMessage = (storedMsg) => {
    stmtUpdateMsg.run(
      String(storedMsg.content || ''),
      JSON.stringify(storedMsg),
      storedMsg.id,
    );
  };

  const deleteMessage = (messageId) => {
    stmtDeleteMsg.run(messageId);
  };

  const deleteThreadMessages = (threadKey) => {
    stmtDeleteThreadMsgs.run(threadKey);
  };

  const importLegacyJson = (parsed, seed) => {
    const cleanedFavorites = {};
    if (parsed.favoriteGifs && typeof parsed.favoriteGifs === 'object') {
      for (const [owner, list] of Object.entries(parsed.favoriteGifs)) {
        if (!Array.isArray(list)) {
          continue;
        }
        cleanedFavorites[owner] = list.filter(
          (g) => g && typeof g === 'object' && typeof g.url === 'string' && !g.url.startsWith('/gifs/'),
        );
      }
    }
    const loadedCommunityGifs = Array.isArray(parsed.communityGifs)
      ? parsed.communityGifs.filter(
          (g) =>
            g &&
            typeof g === 'object' &&
            typeof g.id === 'string' &&
            typeof g.url === 'string' &&
            typeof g.title === 'string' &&
            !g.url.startsWith('/gifs/'),
        )
      : [];

    const loadedDms = parsed.dms && typeof parsed.dms === 'object' ? parsed.dms : {};
    cleanCallStatuses(loadedDms);

    const dbObj = {
      ...seed,
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : seed.accounts,
      friendships:
        parsed.friendships && typeof parsed.friendships === 'object' ? parsed.friendships : {},
      blocks: parsed.blocks && typeof parsed.blocks === 'object' ? parsed.blocks : {},
      friendRequests: Array.isArray(parsed.friendRequests) ? parsed.friendRequests : [],
      openDms: parsed.openDms && typeof parsed.openDms === 'object' ? parsed.openDms : {},
      groupDms: parsed.groupDms && typeof parsed.groupDms === 'object' ? parsed.groupDms : {},
      uploads: parsed.uploads && typeof parsed.uploads === 'object' ? parsed.uploads : {},
      favoriteGifs: cleanedFavorites,
      communityGifs: loadedCommunityGifs,
      sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
      unreadDms: parsed.unreadDms && typeof parsed.unreadDms === 'object' ? parsed.unreadDms : {},
      unreadGroups:
        parsed.unreadGroups && typeof parsed.unreadGroups === 'object' ? parsed.unreadGroups : {},
      unreadMentions:
        parsed.unreadMentions && typeof parsed.unreadMentions === 'object'
          ? parsed.unreadMentions
          : {},
      groupUnreadMentions:
        parsed.groupUnreadMentions && typeof parsed.groupUnreadMentions === 'object'
          ? parsed.groupUnreadMentions
          : {},
      dmReadReceipts:
        parsed.dmReadReceipts && typeof parsed.dmReadReceipts === 'object'
          ? parsed.dmReadReceipts
          : {},
      mutedThreads:
        parsed.mutedThreads && typeof parsed.mutedThreads === 'object' ? parsed.mutedThreads : {},
      hiddenThreads:
        parsed.hiddenThreads && typeof parsed.hiddenThreads === 'object' ? parsed.hiddenThreads : {},
      threadActivity:
        parsed.threadActivity && typeof parsed.threadActivity === 'object'
          ? parsed.threadActivity
          : {},
      gifLinks: parsed.gifLinks && typeof parsed.gifLinks === 'object' ? parsed.gifLinks : {},
      dms: loadedDms,
    };

    runInTransaction(() => {
      for (const key of KV_KEYS) {
        stmtSetKv.run(key, JSON.stringify(dbObj[key] ?? {}));
      }
      for (const [threadKey, list] of Object.entries(loadedDms)) {
        if (!Array.isArray(list)) {
          continue;
        }
        for (const msg of list) {
          if (msg && typeof msg === 'object' && typeof msg.id === 'string') {
            insertMessage(threadKey, msg);
          }
        }
      }
      stmtSetKv.run('migrated_v1', JSON.stringify(true));
    });

    return dbObj;
  };

  const loadDb = () => {
    const seed = createSeedDb();
    const migratedRow = stmtGetKv.get('migrated_v1');

    if (!migratedRow) {
      if (fs.existsSync(paths.legacyJsonPath)) {
        try {
          const raw = fs.readFileSync(paths.legacyJsonPath, 'utf8');
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object' && Array.isArray(parsed.accounts)) {
            const migrated = importLegacyJson(parsed, seed);
            const backupPath = `${paths.legacyJsonPath}.bak`;
            if (!fs.existsSync(backupPath)) {
              try {
                fs.copyFileSync(paths.legacyJsonPath, backupPath);
              } catch {
                // Non-fatal if backup copy cannot be written.
              }
            }
            console.log('[Redshift] Migrated legacy JSON database into SQLite (redshift.sqlite)');
            return migrated;
          }
        } catch (err) {
          console.error('[Redshift] Failed JSON->SQLite migration, using seed:', err);
        }
      }

      runInTransaction(() => {
        for (const key of KV_KEYS) {
          stmtSetKv.run(key, JSON.stringify(seed[key] ?? {}));
        }
        stmtSetKv.run('migrated_v1', JSON.stringify(true));
      });
      return seed;
    }

    const dbObj = { ...seed, dms: {} };
    for (const key of KV_KEYS) {
      const row = stmtGetKv.get(key);
      if (row && typeof row.json === 'string') {
        try {
          dbObj[key] = JSON.parse(row.json);
        } catch {
          dbObj[key] = seed[key];
        }
      }
    }

    const allRows = sqlite
      .prepare('SELECT thread_key, data_json FROM messages ORDER BY seq ASC')
      .all();
    for (const row of allRows) {
      try {
        const msg = JSON.parse(row.data_json);
        if (!Array.isArray(dbObj.dms[row.thread_key])) {
          dbObj.dms[row.thread_key] = [];
        }
        dbObj.dms[row.thread_key].push(msg);
      } catch {
        // Ignore corrupt message JSON rows gracefully.
      }
    }
    cleanCallStatuses(dbObj.dms);
    return dbObj;
  };

  /**
   * Cursor-based chronological page query for DM/Group messages.
   * Returns messages ordered oldest -> newest within the requested page window.
   */
  const getMessagesPage = (threadKey, { beforeId = '', limit = 50 } = {}) => {
    const cleanLimit = Math.min(100, Math.max(1, Number(limit) || 50));
    const fetchCount = cleanLimit + 1;

    let descRows;
    if (beforeId) {
      const anchor = stmtGetMsgOrder.get(threadKey, beforeId);
      if (!anchor) {
        return { items: [], hasMore: false };
      }
      descRows = sqlite
        .prepare(
          `SELECT data_json FROM messages
           WHERE thread_key = ? AND (timestamp < ? OR (timestamp = ? AND seq < ?))
           ORDER BY timestamp DESC, seq DESC
           LIMIT ?`,
        )
        .all(threadKey, anchor.timestamp, anchor.timestamp, anchor.seq, fetchCount);
    } else {
      descRows = sqlite
        .prepare(
          `SELECT data_json FROM messages
           WHERE thread_key = ?
           ORDER BY timestamp DESC, seq DESC
           LIMIT ?`,
        )
        .all(threadKey, fetchCount);
    }

    const hasMore = descRows.length > cleanLimit;
    const sliced = hasMore ? descRows.slice(0, cleanLimit) : descRows;
    const items = [];
    for (let i = sliced.length - 1; i >= 0; i -= 1) {
      try {
        items.push(JSON.parse(sliced[i].data_json));
      } catch {
        // Skip corrupt row.
      }
    }
    return { items, hasMore };
  };

  /**
   * Loads messages from targetId through the latest message (or a surrounding context slice if deep).
   */
  const getMessagesFromId = (threadKey, targetId, maxCount = 200) => {
    const anchor = stmtGetMsgOrder.get(threadKey, targetId);
    if (!anchor) {
      return null;
    }
    const totalAbove =
      sqlite
        .prepare(
          `SELECT COUNT(*) AS cnt FROM messages
           WHERE thread_key = ? AND (timestamp < ? OR (timestamp = ? AND seq < ?))`,
        )
        .get(threadKey, anchor.timestamp, anchor.timestamp, anchor.seq)?.cnt ?? 0;

    // Include up to 10 context messages before the target + messages up to latest (capped).
    const beforeRows = sqlite
      .prepare(
        `SELECT data_json FROM messages
         WHERE thread_key = ? AND (timestamp < ? OR (timestamp = ? AND seq < ?))
         ORDER BY timestamp DESC, seq DESC
         LIMIT 10`,
      )
      .all(threadKey, anchor.timestamp, anchor.timestamp, anchor.seq);

    const atAndAfterRows = sqlite
      .prepare(
        `SELECT data_json FROM messages
         WHERE thread_key = ? AND (timestamp > ? OR (timestamp = ? AND seq >= ?))
         ORDER BY timestamp ASC, seq ASC
         LIMIT ?`,
      )
      .all(threadKey, anchor.timestamp, anchor.timestamp, anchor.seq, Math.max(20, maxCount));

    const items = [];
    for (let i = beforeRows.length - 1; i >= 0; i -= 1) {
      try {
        items.push(JSON.parse(beforeRows[i].data_json));
      } catch {}
    }
    for (const row of atAndAfterRows) {
      try {
        items.push(JSON.parse(row.data_json));
      } catch {}
    }
    return {
      items,
      hasMore: Number(totalAbove) > beforeRows.length,
    };
  };

  /**
   * Searches SQLite messages across allowed threads by text terms / from filters.
   */
  const searchAllowedMessages = (threadKeys, { fromFilters = [], textTerms = [], limit = 160 } = {}) => {
    if (!Array.isArray(threadKeys) || threadKeys.length === 0) {
      return [];
    }
    const cleanLimit = Math.min(250, Math.max(1, Number(limit) || 160));
    const placeholders = threadKeys.map(() => '?').join(', ');
    const whereClauses = [`thread_key IN (${placeholders})`];
    const params = [...threadKeys];

    for (const term of textTerms) {
      whereClauses.push(`LOWER(data_json) LIKE ?`);
      params.push(`%${String(term).toLowerCase()}%`);
    }

    if (fromFilters.length === 1) {
      whereClauses.push(`author_username LIKE ?`);
      params.push(`%${fromFilters[0].toLowerCase()}%`);
    }

    params.push(cleanLimit);
    const rows = sqlite
      .prepare(
        `SELECT thread_key, data_json FROM messages
         WHERE ${whereClauses.join(' AND ')}
         ORDER BY timestamp DESC, seq DESC
         LIMIT ?`,
      )
      .all(...params);

    const out = [];
    for (const row of rows) {
      try {
        out.push({ threadKey: row.thread_key, msg: JSON.parse(row.data_json) });
      } catch {
        // Ignore corrupt row.
      }
    }
    return out;
  };

  const getCachedLinkPreview = (url, maxAgeMs = 60 * 60 * 1000) => {
    const row = sqlite
      .prepare('SELECT payload_json, fetched_at FROM link_cache WHERE url = ?')
      .get(url);
    if (!row) {
      return null;
    }
    if (Date.now() - Number(row.fetched_at) > maxAgeMs) {
      return null;
    }
    try {
      return JSON.parse(row.payload_json);
    } catch {
      return null;
    }
  };

  const saveCachedLinkPreview = (url, payload) => {
    sqlite
      .prepare(
        'INSERT INTO link_cache (url, payload_json, fetched_at) VALUES (?, ?, ?) ON CONFLICT(url) DO UPDATE SET payload_json = excluded.payload_json, fetched_at = excluded.fetched_at',
      )
      .run(url, JSON.stringify(payload), Date.now());
  };

  const close = () => {
    try {
      sqlite.close();
    } catch {
      // Ignore close error.
    }
  };

  return {
    paths,
    loadDb,
    saveCollections,
    insertMessage,
    updateMessage,
    deleteMessage,
    deleteThreadMessages,
    getMessagesPage,
    getMessagesFromId,
    searchAllowedMessages,
    getCachedLinkPreview,
    saveCachedLinkPreview,
    close,
  };
}
