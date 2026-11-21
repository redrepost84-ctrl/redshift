/**
 * Durable Object SQLite storage layer for Redshift 24/7 Cloud Backend.
 * Stores accounts and group DMs per-row to avoid any SQLite row-size limits,
 * stores messages with identical cursor/search semantics to server/dbStore.js,
 * and stores binary uploads in 512 KB BLOB chunks for low-RAM streaming & HTTP Range support.
 */

export const UPLOAD_CHUNK_SIZE = 512 * 1024; // 512 KB per SQLite BLOB row

export const SMALL_KV_KEYS = [
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
  'pushSubscriptions',
];

function cleanCallStatuses(dmsMap) {
  const bootNow = Date.now();
  for (const threadMsgs of Object.values(dmsMap)) {
    if (!Array.isArray(threadMsgs)) continue;
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

export function createDoStore(storage, createSeedDb) {
  const sql = storage.sql;

  const initSchema = () => {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS kv_collections (
        key TEXT PRIMARY KEY,
        json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS accounts (
        username TEXT PRIMARY KEY,
        json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS group_dms (
        id TEXT PRIMARY KEY,
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

      CREATE TABLE IF NOT EXISTS upload_sizes (
        upload_id TEXT PRIMARY KEY,
        total_bytes INTEGER NOT NULL,
        chunk_size INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS upload_chunks (
        upload_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        data BLOB NOT NULL,
        PRIMARY KEY (upload_id, chunk_index)
      );

      CREATE TABLE IF NOT EXISTS reset_codes (
        email TEXT PRIMARY KEY,
        code_hash_hex TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        last_sent_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS reset_proofs (
        email TEXT PRIMARY KEY,
        token TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `);
  };

  initSchema();

  const lastSavedKvJson = new Map();
  const lastSavedAccountsJson = new Map();
  const lastSavedGroupsJson = new Map();

  const getKvRow = (key) => {
    const rows = sql.exec('SELECT json FROM kv_collections WHERE key = ?', key).toArray();
    return rows.length > 0 ? rows[0] : null;
  };

  const setKvRow = (key, value) => {
    const serialized = JSON.stringify(value ?? {});
    if (lastSavedKvJson.get(key) === serialized) {
      return;
    }
    sql.exec(
      'INSERT INTO kv_collections (key, json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json',
      key,
      serialized,
    );
    lastSavedKvJson.set(key, serialized);
  };

  const saveAccounts = (accountsList) => {
    const keepSet = new Set();
    for (const acc of accountsList) {
      if (!acc || typeof acc.username !== 'string') continue;
      const uKey = acc.username.toLowerCase();
      keepSet.add(uKey);
      const serialized = JSON.stringify(acc);
      if (lastSavedAccountsJson.get(uKey) === serialized) {
        continue;
      }
      sql.exec(
        'INSERT INTO accounts (username, json) VALUES (?, ?) ON CONFLICT(username) DO UPDATE SET json = excluded.json',
        uKey,
        serialized,
      );
      lastSavedAccountsJson.set(uKey, serialized);
    }
    for (const existingKey of Array.from(lastSavedAccountsJson.keys())) {
      if (!keepSet.has(existingKey)) {
        sql.exec('DELETE FROM accounts WHERE username = ?', existingKey);
        lastSavedAccountsJson.delete(existingKey);
      }
    }
  };

  const saveGroupDms = (groupDmsMap) => {
    const keepSet = new Set();
    for (const [gid, grp] of Object.entries(groupDmsMap || {})) {
      if (!grp || typeof grp !== 'object') continue;
      keepSet.add(gid);
      const serialized = JSON.stringify(grp);
      if (lastSavedGroupsJson.get(gid) === serialized) {
        continue;
      }
      sql.exec(
        'INSERT INTO group_dms (id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json',
        gid,
        serialized,
      );
      lastSavedGroupsJson.set(gid, serialized);
    }
    for (const existingId of Array.from(lastSavedGroupsJson.keys())) {
      if (!keepSet.has(existingId)) {
        sql.exec('DELETE FROM group_dms WHERE id = ?', existingId);
        lastSavedGroupsJson.delete(existingId);
      }
    }
  };

  const saveCollections = (dbObj) => {
    storage.transactionSync(() => {
      saveAccounts(Array.isArray(dbObj.accounts) ? dbObj.accounts : []);
      saveGroupDms(dbObj.groupDms || {});
      for (const key of SMALL_KV_KEYS) {
        setKvRow(key, dbObj[key] ?? {});
      }
    });
  };

  const insertMessage = (threadKey, storedMsg) => {
    sql.exec(
      'INSERT OR REPLACE INTO messages (id, thread_key, author_username, timestamp, content, data_json) VALUES (?, ?, ?, ?, ?, ?)',
      storedMsg.id,
      threadKey,
      String(storedMsg.authorUsername || '').toLowerCase(),
      Number(storedMsg.timestamp) || Date.now(),
      String(storedMsg.content || ''),
      JSON.stringify(storedMsg),
    );
  };

  const updateMessage = (storedMsg) => {
    sql.exec(
      'UPDATE messages SET content = ?, data_json = ? WHERE id = ?',
      String(storedMsg.content || ''),
      JSON.stringify(storedMsg),
      storedMsg.id,
    );
  };

  const deleteMessage = (messageId) => {
    sql.exec('DELETE FROM messages WHERE id = ?', messageId);
  };

  const deleteThreadMessages = (threadKey) => {
    sql.exec('DELETE FROM messages WHERE thread_key = ?', threadKey);
  };

  const loadDb = (cleanStaleCalls = true) => {
    const seed = createSeedDb();
    const initialized = getKvRow('initialized_v1');

    if (!initialized) {
      storage.transactionSync(() => {
        saveAccounts(seed.accounts);
        saveGroupDms(seed.groupDms);
        for (const key of SMALL_KV_KEYS) {
          setKvRow(key, seed[key] ?? {});
        }
        setKvRow('initialized_v1', true);
      });
      return seed;
    }

    const dbObj = { ...seed, accounts: [], groupDms: {}, dms: {} };

    lastSavedAccountsJson.clear();
    const accountRows = sql.exec('SELECT username, json FROM accounts').toArray();
    for (const row of accountRows) {
      try {
        const parsedAcc = JSON.parse(row.json);
        dbObj.accounts.push(parsedAcc);
        lastSavedAccountsJson.set(String(row.username).toLowerCase(), row.json);
      } catch {}
    }

    lastSavedGroupsJson.clear();
    const groupRows = sql.exec('SELECT id, json FROM group_dms').toArray();
    for (const row of groupRows) {
      try {
        dbObj.groupDms[row.id] = JSON.parse(row.json);
        lastSavedGroupsJson.set(row.id, row.json);
      } catch {}
    }

    lastSavedKvJson.clear();
    for (const key of SMALL_KV_KEYS) {
      const row = getKvRow(key);
      if (row && typeof row.json === 'string') {
        try {
          dbObj[key] = JSON.parse(row.json);
          lastSavedKvJson.set(key, row.json);
        } catch {
          dbObj[key] = seed[key];
        }
      }
    }

    const allRows = sql
      .exec('SELECT thread_key, data_json FROM messages ORDER BY seq ASC')
      .toArray();
    for (const row of allRows) {
      try {
        const msg = JSON.parse(row.data_json);
        if (!Array.isArray(dbObj.dms[row.thread_key])) {
          dbObj.dms[row.thread_key] = [];
        }
        dbObj.dms[row.thread_key].push(msg);
      } catch {}
    }

    if (cleanStaleCalls) {
      cleanCallStatuses(dbObj.dms);
    }
    return dbObj;
  };

  const getMsgOrder = (threadKey, msgId) => {
    const rows = sql
      .exec('SELECT seq, timestamp FROM messages WHERE thread_key = ? AND id = ?', threadKey, msgId)
      .toArray();
    return rows.length > 0 ? rows[0] : null;
  };

  const getMessagesPage = (threadKey, { beforeId = '', limit = 50 } = {}) => {
    const cleanLimit = Math.min(100, Math.max(1, Number(limit) || 50));
    const fetchCount = cleanLimit + 1;

    let descRows;
    if (beforeId) {
      const anchor = getMsgOrder(threadKey, beforeId);
      if (!anchor) {
        return { items: [], hasMore: false };
      }
      descRows = sql
        .exec(
          `SELECT data_json FROM messages
           WHERE thread_key = ? AND (timestamp < ? OR (timestamp = ? AND seq < ?))
           ORDER BY timestamp DESC, seq DESC
           LIMIT ?`,
          threadKey,
          anchor.timestamp,
          anchor.timestamp,
          anchor.seq,
          fetchCount,
        )
        .toArray();
    } else {
      descRows = sql
        .exec(
          `SELECT data_json FROM messages
           WHERE thread_key = ?
           ORDER BY timestamp DESC, seq DESC
           LIMIT ?`,
          threadKey,
          fetchCount,
        )
        .toArray();
    }

    const hasMore = descRows.length > cleanLimit;
    const sliced = hasMore ? descRows.slice(0, cleanLimit) : descRows;
    const items = [];
    for (let i = sliced.length - 1; i >= 0; i -= 1) {
      try {
        items.push(JSON.parse(sliced[i].data_json));
      } catch {}
    }
    return { items, hasMore };
  };

  const getMessagesFromId = (threadKey, targetId, maxCount = 200) => {
    const anchor = getMsgOrder(threadKey, targetId);
    if (!anchor) {
      return null;
    }
    const countRows = sql
      .exec(
        `SELECT COUNT(*) AS cnt FROM messages
         WHERE thread_key = ? AND (timestamp < ? OR (timestamp = ? AND seq < ?))`,
        threadKey,
        anchor.timestamp,
        anchor.timestamp,
        anchor.seq,
      )
      .toArray();
    const totalAbove = Number(countRows[0]?.cnt ?? 0);

    const beforeRows = sql
      .exec(
        `SELECT data_json FROM messages
         WHERE thread_key = ? AND (timestamp < ? OR (timestamp = ? AND seq < ?))
         ORDER BY timestamp DESC, seq DESC
         LIMIT 10`,
        threadKey,
        anchor.timestamp,
        anchor.timestamp,
        anchor.seq,
      )
      .toArray();

    const atAndAfterRows = sql
      .exec(
        `SELECT data_json FROM messages
         WHERE thread_key = ? AND (timestamp > ? OR (timestamp = ? AND seq >= ?))
         ORDER BY timestamp ASC, seq ASC
         LIMIT ?`,
        threadKey,
        anchor.timestamp,
        anchor.timestamp,
        anchor.seq,
        Math.max(20, maxCount),
      )
      .toArray();

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
      hasMore: totalAbove > beforeRows.length,
    };
  };

  const searchAllowedMessages = (threadKeys, { fromFilters = [], textTerms = [], limit = 160 } = {}) => {
    if (!Array.isArray(threadKeys) || threadKeys.length === 0) {
      return [];
    }
    const cleanLimit = Math.min(250, Math.max(1, Number(limit) || 160));
    const placeholders = threadKeys.map(() => '?').join(', ');
    const whereClauses = [`thread_key IN (${placeholders})`];
    const params = [...threadKeys];

    for (const term of textTerms) {
      whereClauses.push('LOWER(data_json) LIKE ?');
      params.push(`%${String(term).toLowerCase()}%`);
    }

    if (fromFilters.length === 1) {
      whereClauses.push('author_username LIKE ?');
      params.push(`%${fromFilters[0].toLowerCase()}%`);
    }

    params.push(cleanLimit);
    const rows = sql
      .exec(
        `SELECT thread_key, data_json FROM messages
         WHERE ${whereClauses.join(' AND ')}
         ORDER BY timestamp DESC, seq DESC
         LIMIT ?`,
        ...params,
      )
      .toArray();

    const out = [];
    for (const row of rows) {
      try {
        out.push({ threadKey: row.thread_key, msg: JSON.parse(row.data_json) });
      } catch {}
    }
    return out;
  };

  const getCachedLinkPreview = (url, maxAgeMs = 60 * 60 * 1000) => {
    const rows = sql
      .exec('SELECT payload_json, fetched_at FROM link_cache WHERE url = ?', url)
      .toArray();
    if (rows.length === 0) return null;
    const row = rows[0];
    if (Date.now() - Number(row.fetched_at) > maxAgeMs) return null;
    try {
      return JSON.parse(row.payload_json);
    } catch {
      return null;
    }
  };

  const saveCachedLinkPreview = (url, payload) => {
    sql.exec(
      'INSERT INTO link_cache (url, payload_json, fetched_at) VALUES (?, ?, ?) ON CONFLICT(url) DO UPDATE SET payload_json = excluded.payload_json, fetched_at = excluded.fetched_at',
      url,
      JSON.stringify(payload),
      Date.now(),
    );
  };

  // --- Chunked Binary Upload Storage ---
  const putUploadChunk = (uploadId, chunkIndex, bytes) => {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    sql.exec(
      'INSERT INTO upload_chunks (upload_id, chunk_index, data) VALUES (?, ?, ?) ON CONFLICT(upload_id, chunk_index) DO UPDATE SET data = excluded.data',
      uploadId,
      chunkIndex,
      arr,
    );
  };

  const finalizeUploadSize = (uploadId, totalBytes, chunkSize = UPLOAD_CHUNK_SIZE) => {
    sql.exec(
      'INSERT INTO upload_sizes (upload_id, total_bytes, chunk_size) VALUES (?, ?, ?) ON CONFLICT(upload_id) DO UPDATE SET total_bytes = excluded.total_bytes, chunk_size = excluded.chunk_size',
      uploadId,
      totalBytes,
      chunkSize,
    );
  };

  const getUploadSizeInfo = (uploadId) => {
    const rows = sql
      .exec('SELECT total_bytes, chunk_size FROM upload_sizes WHERE upload_id = ?', uploadId)
      .toArray();
    if (rows.length === 0) return null;
    return {
      totalBytes: Number(rows[0].total_bytes),
      chunkSize: Number(rows[0].chunk_size) || UPLOAD_CHUNK_SIZE,
    };
  };

  const hasUploadData = (uploadId) => {
    return getUploadSizeInfo(uploadId) !== null;
  };

  const getUploadChunk = (uploadId, chunkIndex) => {
    const rows = sql
      .exec(
        'SELECT data FROM upload_chunks WHERE upload_id = ? AND chunk_index = ?',
        uploadId,
        chunkIndex,
      )
      .toArray();
    if (rows.length === 0 || !rows[0].data) return null;
    return rows[0].data instanceof Uint8Array ? rows[0].data : new Uint8Array(rows[0].data);
  };

  const readUploadHeaderBytes = (uploadId, maxLen = 16) => {
    const chunk0 = getUploadChunk(uploadId, 0);
    if (!chunk0) return null;
    return chunk0.subarray(0, Math.min(maxLen, chunk0.length));
  };

  const readUploadFullBytes = (uploadId, maxAllowedBytes = 25 * 1024 * 1024) => {
    const info = getUploadSizeInfo(uploadId);
    if (!info || info.totalBytes > maxAllowedBytes) return null;
    const out = new Uint8Array(info.totalBytes);
    const numChunks = Math.ceil(info.totalBytes / info.chunkSize);
    let offset = 0;
    for (let i = 0; i < numChunks; i += 1) {
      const chunk = getUploadChunk(uploadId, i);
      if (!chunk) return null;
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  };

  const writeUploadFullBytes = (uploadId, bytes) => {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    storage.transactionSync(() => {
      sql.exec('DELETE FROM upload_chunks WHERE upload_id = ?', uploadId);
      let idx = 0;
      for (let offset = 0; offset < arr.length; offset += UPLOAD_CHUNK_SIZE) {
        const slice = arr.subarray(offset, Math.min(arr.length, offset + UPLOAD_CHUNK_SIZE));
        putUploadChunk(uploadId, idx, slice);
        idx += 1;
      }
      finalizeUploadSize(uploadId, arr.length, UPLOAD_CHUNK_SIZE);
    });
  };

  const deleteUploadData = (uploadId) => {
    storage.transactionSync(() => {
      sql.exec('DELETE FROM upload_chunks WHERE upload_id = ?', uploadId);
      sql.exec('DELETE FROM upload_sizes WHERE upload_id = ?', uploadId);
    });
  };

  const listUploadedBlobIds = () => {
    return sql
      .exec('SELECT upload_id, total_bytes FROM upload_sizes')
      .toArray()
      .map((r) => ({ id: r.upload_id, totalBytes: Number(r.total_bytes) }));
  };

  const replaceAllMessages = (messagesList) => {
    storage.transactionSync(() => {
      sql.exec('DELETE FROM messages');
      for (const item of messagesList) {
        if (!item || !item.threadKey || !item.msg || !item.msg.id) continue;
        insertMessage(item.threadKey, item.msg);
      }
    });
  };

  const upsertMessagesBatch = (messagesList) => {
    storage.transactionSync(() => {
      for (const item of messagesList) {
        if (!item || !item.threadKey || !item.msg || !item.msg.id) continue;
        insertMessage(item.threadKey, item.msg);
      }
    });
  };

  // --- Password Reset Persistence ---
  const getResetCode = (emailKey) => {
    const rows = sql
      .exec(
        'SELECT code_hash_hex, expires_at, last_sent_at, attempts FROM reset_codes WHERE email = ?',
        emailKey,
      )
      .toArray();
    return rows.length > 0 ? rows[0] : null;
  };

  const setResetCode = (emailKey, { codeHashHex, expiresAt, lastSentAt, attempts }) => {
    sql.exec(
      'INSERT INTO reset_codes (email, code_hash_hex, expires_at, last_sent_at, attempts) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET code_hash_hex = excluded.code_hash_hex, expires_at = excluded.expires_at, last_sent_at = excluded.last_sent_at, attempts = excluded.attempts',
      emailKey,
      codeHashHex,
      expiresAt,
      lastSentAt,
      attempts,
    );
  };

  const deleteResetCode = (emailKey) => {
    sql.exec('DELETE FROM reset_codes WHERE email = ?', emailKey);
  };

  const getResetProof = (emailKey) => {
    const rows = sql
      .exec('SELECT token, expires_at FROM reset_proofs WHERE email = ?', emailKey)
      .toArray();
    return rows.length > 0 ? rows[0] : null;
  };

  const setResetProof = (emailKey, token, expiresAt) => {
    sql.exec(
      'INSERT INTO reset_proofs (email, token, expires_at) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at',
      emailKey,
      token,
      expiresAt,
    );
  };

  const deleteResetProof = (emailKey) => {
    sql.exec('DELETE FROM reset_proofs WHERE email = ?', emailKey);
  };

  return {
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
    putUploadChunk,
    finalizeUploadSize,
    getUploadSizeInfo,
    hasUploadData,
    getUploadChunk,
    readUploadHeaderBytes,
    readUploadFullBytes,
    writeUploadFullBytes,
    deleteUploadData,
    listUploadedBlobIds,
    replaceAllMessages,
    upsertMessagesBatch,
    getResetCode,
    setResetCode,
    deleteResetCode,
    getResetProof,
    setResetProof,
    deleteResetProof,
    getKvRow,
    setKvRow,
  };
}
