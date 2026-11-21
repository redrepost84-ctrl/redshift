import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { createSqliteStore } from './dbStore.js';
import { fetchSafeLinkPreview } from './linkPreviewService.js';
import { createRateLimiter, getRequestClientIp } from './rateLimiter.js';
import {
  consumeResetProof,
  issueResetEmailForAddress,
  readJsonBody,
  sendJson,
  verifyResetCodeForAddress,
} from './resetService.js';
import { createLocalScreenCaptureService } from './screenCaptureService.js';

const REDSHIFT_SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const REDSHIFT_UPDATES_DIR = process.env.REDSHIFT_UPDATES_DIR
  ? path.resolve(process.env.REDSHIFT_UPDATES_DIR)
  : path.resolve(REDSHIFT_SERVER_DIR, '..', 'publishedbuilds');

const screenCaptureService = createLocalScreenCaptureService();
process.once('exit', () => {
  screenCaptureService.shutdown();
});

function isLoopbackAddress(addr) {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function isLoopbackRequest(req) {
  const remote = String(req?.socket?.remoteAddress ?? '');
  if (!isLoopbackAddress(remote)) {
    return false;
  }
  const fwd = req?.headers?.['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    const first = fwd.split(',')[0].trim();
    return isLoopbackAddress(first);
  }
  return true;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_.-]+$/;
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const VALID_STATUSES = new Set(['online', 'idle', 'dnd', 'invisible']);
const MAX_JSON_BYTES = 18 * 1024 * 1024; // Up to 10 compressed images per message + banners/avatars.
const MAX_MESSAGE_IMAGE_CHARS = 3 * 1024 * 1024;
const MAX_DM_IMAGES_PER_MESSAGE = 10;
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024; // 1 GB max per uploaded file.
const MAX_BANNER_IMAGE_CHARS = 2_400_000;

const rateLimiter = createRateLimiter();
const AUTH_RATE_LIMIT = Math.max(5, Number(process.env.REDSHIFT_AUTH_RATE_LIMIT) || 25);
const MSG_RATE_LIMIT = Math.max(10, Number(process.env.REDSHIFT_MSG_RATE_LIMIT) || 60);

/**
 * @typedef {'online' | 'idle' | 'dnd' | 'invisible'} UserStatus
 * @typedef {UserStatus | 'offline'} EffectiveStatus
 * @typedef {{
 *   username: string;
 *   displayName: string;
 *   email: string;
 *   passwordHash: string;
 *   bio: string;
 *   createdAt: number;
 *   status: UserStatus;
 *   avatarPreset: number | null;
 *   avatarDataUrl?: string;
 *   bannerColor?: string;
 *   bannerDataUrl?: string;
 *   customStatus?: { text: string; emoji?: string; expiresAt: number | null } | null;
 *   privacy?: {
 *     allowFriendRequests?: boolean;
 *     allowNonFriendDms?: boolean;
 *     privateProfile?: boolean;
 *     showReadReceipts?: boolean;
 *   };
 * }} StoredAccount
 * @typedef {{ from: string; to: string; createdAt: number }} FriendRequestEntry
 * @typedef {{
 *   messageId: string;
 *   authorUsername: string;
 *   content: string;
 *   hasImage?: boolean;
 *   hasAttachment?: boolean;
 * }} StoredReplyRef
 * @typedef {{
 *   id: string;
 *   diskName: string;
 *   name: string;
 *   mime: string;
 *   size: number;
 *   kind: 'image' | 'video' | 'audio' | 'file';
 *   uploadedBy: string;
 *   createdAt: number;
 * }} StoredUploadMeta
 * @typedef {{
 *   id?: string;
 *   url: string;
 *   previewUrl?: string;
 *   title: string;
 *   width?: number;
 *   height?: number;
 *   tags?: string[];
 *   uploadedBy?: string;
 *   createdAt?: number;
 * }} StoredGifItem
 * @typedef {{
 *   id: string;
 *   uploadId: string;
 *   url: string;
 *   title: string;
 *   width?: number;
 *   height?: number;
 *   tags: string[];
 *   uploadedBy: string;
 *   createdAt: number;
 * }} StoredCommunityGif
 * @typedef {{
 *   threadKey: string;
 *   kind: 'dm' | 'group';
 *   status: 'ringing' | 'active' | 'missed' | 'ended';
 *   callerUsername: string;
 *   startedAt: number;
 *   answeredAt?: number;
 *   endedAt?: number;
 *   durationMs?: number;
 *   participantUsernames: string[];
 * }} StoredCallLog
 * @typedef {{
 *   id: string;
 *   authorUsername: string;
 *   content: string;
 *   imageDataUrl?: string;
 *   imageDataUrls?: string[];
 *   attachmentIds?: string[];
 *   gif?: StoredGifItem;
 *   replyTo?: StoredReplyRef;
 *   callLog?: StoredCallLog;
 *   voiceNote?: { durationSec: number; waveform: number[] };
 *   timestamp: number;
 *   editedAt?: number;
 *   pinned?: boolean;
 *   pinnedAt?: number;
 *   pinnedBy?: string;
 *   reactions?: Record<string, string[]>;
 * }} StoredMessage
 * @typedef {{
 *   id: string;
 *   name: string;
 *   iconDataUrl?: string;
 *   ownerUsername: string;
 *   members: string[];
 *   createdAt: number;
 * }} StoredGroupDm
 * @typedef {{
 *   accounts: StoredAccount[];
 *   friendships: Record<string, string[]>;
 *   blocks: Record<string, string[]>;
 *   friendRequests: FriendRequestEntry[];
 *   dms: Record<string, StoredMessage[]>;
 *   openDms: Record<string, string[]>;
 *   groupDms: Record<string, StoredGroupDm>;
 *   uploads: Record<string, StoredUploadMeta>;
 *   favoriteGifs: Record<string, StoredGifItem[]>;
 *   communityGifs: StoredCommunityGif[];
 *   sessions: Record<string, string>;
 *   unreadDms: Record<string, Record<string, number>>;
 *   unreadGroups: Record<string, Record<string, number>>;
 *   dmReadReceipts: Record<string, Record<string, { readerUsername: string; lastReadMessageId?: string; readAt: number }>>;
 *   mutedThreads: Record<string, Record<string, number>>;
 *   hiddenThreads: Record<string, Record<string, true>>;
 *   threadActivity: Record<string, Record<string, number>>;
 *   gifLinks: Record<string, StoredGifItem>;
 * }} RedshiftDb
 */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  const parts = storedHash.split(':');
  if (parts.length !== 2) {
    return false;
  }
  const [salt, expectedHex] = parts;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/** @returns {RedshiftDb} */
function createSeedDb() {
  return {
    accounts: [
      {
        username: 'demo',
        displayName: 'Demo',
        email: 'demo@redshift.gg',
        passwordHash: hashPassword('password123'),
        bio: '',
        createdAt: Date.UTC(2025, 4, 15),
        status: 'online',
        avatarPreset: 0,
      },
    ],
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
    pushSubscriptions: {},
  };
}

const sqliteStore = createSqliteStore(createSeedDb);
const { dataDir: DATA_DIR, uploadsDir: UPLOADS_DIR } = sqliteStore.paths;

/** @returns {RedshiftDb} */
function loadDb() {
  return sqliteStore.loadDb();
}

/** @param {RedshiftDb} targetDb */
function saveDb(targetDb) {
  sqliteStore.saveCollections(targetDb);
}

/** @type {RedshiftDb} */
const db = loadDb();

/** Lowercase username -> active WebSockets */
/** @type {Map<string, Set<WebSocket>>} */
const onlineSockets = new Map();
const socketMeta = new WeakMap();

/** Lowercase username -> last authenticated HTTP/WS activity timestamp (ms) */
/** @type {Map<string, number>} */
const lastSeenByUser = new Map();

/** "from::to" -> auto-clear typing timer */
/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const typingTimers = new Map();

function dmThreadKey(userA, userB) {
  return [userA.trim().toLowerCase(), userB.trim().toLowerCase()].sort().join('::');
}

/** @param {string} groupId */
function groupThreadKey(groupId) {
  return `group:${groupId.trim()}`;
}

/**
 * Resolves 1-on-1 DM or Group DM thread access for an active user.
 * @param {string} selfKey
 * @param {{ peerUsername?: string | null; groupId?: string | null }} target
 * @param {{ mode?: 'read' | 'write' }} [options]
 */
function resolveThreadContext(selfKey, target, options = {}) {
  const mode = options.mode === 'read' ? 'read' : 'write';
  const cleanGroupId = typeof target.groupId === 'string' ? target.groupId.trim() : '';
  if (cleanGroupId) {
    const group = db.groupDms[cleanGroupId];
    if (!group || !group.members.some((m) => m.toLowerCase() === selfKey)) {
      return {
        ok: false,
        status: 403,
        error: 'Error: You are not a member of this group chat',
      };
    }
    return {
      ok: true,
      kind: /** @type {const} */ ('group'),
      groupId: cleanGroupId,
      group,
      threadKey: groupThreadKey(cleanGroupId),
      participants: [...group.members],
    };
  }

  const peerKey = typeof target.peerUsername === 'string' ? target.peerUsername.trim().toLowerCase() : '';
  const peerAccount = peerKey ? findAccountByUsername(peerKey) : undefined;
  if (!peerKey || !peerAccount) {
    return { ok: false, status: 404, error: 'Error: Recipient not found' };
  }
  if (peerKey === selfKey) {
    return { ok: false, status: 400, error: 'Error: You cannot direct message yourself' };
  }

  if (mode === 'write') {
    if (hasAnyBlockBetween(selfKey, peerKey)) {
      return {
        ok: false,
        status: 403,
        error: 'Error: Direct messages are disabled because one of you has blocked the other',
      };
    }
    if (!areFriends(selfKey, peerKey) && peerAccount.privacy?.allowNonFriendDms === false) {
      return {
        ok: false,
        status: 403,
        error: 'Error: This user is not accepting direct messages from non-friends',
      };
    }
  }

  return {
    ok: true,
    kind: /** @type {const} */ ('dm'),
    peerKey,
    threadKey: dmThreadKey(selfKey, peerKey),
    participants: [selfKey, peerKey],
  };
}

/**
 * Records a 1-on-1 DM peer in owner's persisted opened-DMs list.
 * @param {string} ownerUsername
 * @param {string} peerUsername
 * @returns {boolean} True when newly added or promoted.
 */
function recordOpenDmPeer(ownerUsername, peerUsername) {
  const ownerKey = ownerUsername.trim().toLowerCase();
  const peerKey = peerUsername.trim().toLowerCase();
  if (!ownerKey || !peerKey || ownerKey === peerKey) {
    return false;
  }
  const existing = Array.isArray(db.openDms[ownerKey]) ? db.openDms[ownerKey] : [];
  if (existing.some((u) => u.toLowerCase() === peerKey)) {
    return false;
  }
  db.openDms[ownerKey] = [peerKey, ...existing.filter((u) => u.toLowerCase() !== peerKey)];
  return true;
}

/**
 * Lists all lowercase non-friend peer usernames with whom the user has message history or opened DMs.
 * @param {string} selfKey
 * @returns {string[]}
 */
function getDmPeerKeys(selfKey) {
  const cleanSelf = selfKey.trim().toLowerCase();
  const friendSet = new Set((db.friendships[cleanSelf] ?? []).map((u) => u.toLowerCase()));
  /** @type {Map<string, number>} */
  const peerActivity = new Map();

  for (const [threadKey, list] of Object.entries(db.dms)) {
    if (threadKey.startsWith('group:') || !Array.isArray(list) || list.length === 0) {
      continue;
    }
    const [u1, u2] = threadKey.split('::');
    if (!u1 || !u2) {
      continue;
    }
    let peer = '';
    if (u1.toLowerCase() === cleanSelf) {
      peer = u2.toLowerCase();
    } else if (u2.toLowerCase() === cleanSelf) {
      peer = u1.toLowerCase();
    }
    if (!peer || peer === cleanSelf || friendSet.has(peer) || !findAccountByUsername(peer)) {
      continue;
    }
    const latestTs = list[list.length - 1]?.timestamp ?? 0;
    peerActivity.set(peer, Math.max(peerActivity.get(peer) ?? 0, latestTs));
  }

  const openList = Array.isArray(db.openDms[cleanSelf]) ? db.openDms[cleanSelf] : [];
  openList.forEach((rawPeer, idx) => {
    const peer = String(rawPeer).trim().toLowerCase();
    if (!peer || peer === cleanSelf || friendSet.has(peer) || !findAccountByUsername(peer)) {
      return;
    }
    if (!peerActivity.has(peer)) {
      // Preserve explicit open order above zero when no messages exist yet.
      peerActivity.set(peer, openList.length - idx);
    }
  });

  return Array.from(peerActivity.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([peer]) => peer);
}

function isBlockedBy(blocker, target) {
  const b = blocker.trim().toLowerCase();
  const t = target.trim().toLowerCase();
  return (db.blocks[b] ?? []).includes(t);
}

function hasAnyBlockBetween(userA, userB) {
  return isBlockedBy(userA, userB) || isBlockedBy(userB, userA);
}

function areFriends(userA, userB) {
  const a = userA.trim().toLowerCase();
  const b = userB.trim().toLowerCase();
  if (hasAnyBlockBetween(a, b)) {
    return false;
  }
  return (db.friendships[a] ?? []).includes(b);
}

function removeFriendshipBetween(userA, userB) {
  const a = userA.trim().toLowerCase();
  const b = userB.trim().toLowerCase();
  if (Array.isArray(db.friendships[a])) {
    db.friendships[a] = db.friendships[a].filter((u) => u.toLowerCase() !== b);
  }
  if (Array.isArray(db.friendships[b])) {
    db.friendships[b] = db.friendships[b].filter((u) => u.toLowerCase() !== a);
  }
}

function clearRequestsBetween(userA, userB) {
  const a = userA.trim().toLowerCase();
  const b = userB.trim().toLowerCase();
  db.friendRequests = db.friendRequests.filter(
    (r) =>
      !(
        (r.from.toLowerCase() === a && r.to.toLowerCase() === b) ||
        (r.from.toLowerCase() === b && r.to.toLowerCase() === a)
      ),
  );
}

function clearUnreadBetween(userA, userB) {
  const a = userA.trim().toLowerCase();
  const b = userB.trim().toLowerCase();
  if (db.unreadDms[a]) {
    delete db.unreadDms[a][b];
  }
  if (db.unreadDms[b]) {
    delete db.unreadDms[b][a];
  }
  if (db.unreadMentions?.[a]) {
    delete db.unreadMentions[a][b];
  }
  if (db.unreadMentions?.[b]) {
    delete db.unreadMentions[b][a];
  }
}

/**
 * Validates and canonicalizes a per-user thread key ("dm:<peer>" or "group:<groupId>").
 * @param {string} rawKey
 * @returns {string | null}
 */
function normalizeUserThreadKey(rawKey) {
  if (typeof rawKey !== 'string') {
    return null;
  }
  const trimmed = rawKey.trim();
  if (trimmed.startsWith('dm:')) {
    const peer = trimmed.slice(3).trim().toLowerCase();
    return peer ? `dm:${peer}` : null;
  }
  if (trimmed.startsWith('group:')) {
    const groupId = trimmed.slice(6).trim();
    return groupId ? `group:${groupId}` : null;
  }
  return null;
}

/**
 * Removes expired timed mutes for a user while keeping indefinite (-1) mutes intact.
 * @param {string} userKey
 * @returns {boolean} True when any expired mute entry was pruned.
 */
function pruneExpiredMutesForUser(userKey) {
  const map = db.mutedThreads[userKey];
  if (!map || typeof map !== 'object') {
    return false;
  }
  const now = Date.now();
  let changed = false;
  for (const [k, until] of Object.entries(map)) {
    if (typeof until !== 'number' || (until !== -1 && until !== -2 && until <= now)) {
      delete map[k];
      changed = true;
    }
  }
  if (Object.keys(map).length === 0) {
    delete db.mutedThreads[userKey];
  }
  return changed;
}

/** Extracts lowercase @mention usernames from message content. */
function extractMentionUsernames(content) {
  if (typeof content !== 'string' || !content.includes('@')) {
    return [];
  }
  const found = new Set();
  const re = /(?:^|[\s(>*_~])@([a-zA-Z0-9_.-]{2,32})(?![a-zA-Z0-9_.-])/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    found.add(m[1].toLowerCase());
  }
  return Array.from(found);
}

/** Checks whether `msg` matches a search query's `has:` filter token. */
function serverMessageMatchesHasFilter(msg, token) {
  const atts = Array.isArray(msg.attachmentIds)
    ? msg.attachmentIds.map((id) => db.uploads[id]).filter(Boolean)
    : [];
  const legacyImgs =
    (Array.isArray(msg.imageDataUrls) ? msg.imageDataUrls.length : 0) +
    (msg.imageDataUrl ? 1 : 0);
  switch (token) {
    case 'image':
    case 'images':
    case 'img':
      return legacyImgs > 0 || atts.some((a) => a.kind === 'image');
    case 'video':
    case 'videos':
      return atts.some((a) => a.kind === 'video');
    case 'audio':
    case 'voice':
      return Boolean(msg.voiceNote) || atts.some((a) => a.kind === 'audio');
    case 'file':
    case 'files':
    case 'attachment':
      return atts.length > 0 || legacyImgs > 0;
    case 'gif':
    case 'gifs':
      return Boolean(msg.gif) || atts.some((a) => a.mime === 'image/gif');
    case 'pin':
    case 'pinned':
      return Boolean(msg.pinned);
    case 'link':
    case 'url':
      return /https?:\/\/\S+/i.test(String(msg.content || ''));
    case 'call':
      return Boolean(msg.callLog);
    default:
      return true;
  }
}

/** Builds configured WebRTC ICE servers including optional TURN relays from env. */
function getConfiguredIceServers() {
  /** @type {Array<{ urls: string | string[]; username?: string; credential?: string }>} */
  const servers = [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun.cloudflare.com:3478',
      ],
    },
  ];
  const rawTurn = String(process.env.REDSHIFT_TURN_URLS || '').trim();
  if (rawTurn) {
    const turnUrls = rawTurn
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (turnUrls.length > 0) {
      const entry = { urls: turnUrls };
      if (process.env.REDSHIFT_TURN_USERNAME) {
        entry.username = String(process.env.REDSHIFT_TURN_USERNAME);
      }
      if (process.env.REDSHIFT_TURN_CREDENTIAL) {
        entry.credential = String(process.env.REDSHIFT_TURN_CREDENTIAL);
      }
      servers.push(entry);
    }
  }
  return servers;
}

/**
 * Updates recent activity timestamp for a user's DM/group thread and optionally unhides it.
 * @param {string} userKey
 * @param {string} threadKey
 * @param {number} [timestamp]
 * @param {{ unhide?: boolean }} [opts]
 */
function touchThreadActivityForUser(userKey, threadKey, timestamp = Date.now(), opts = {}) {
  const cleanUser = userKey.trim().toLowerCase();
  const normThread = normalizeUserThreadKey(threadKey);
  if (!cleanUser || !normThread) {
    return;
  }
  if (!db.threadActivity[cleanUser] || typeof db.threadActivity[cleanUser] !== 'object') {
    db.threadActivity[cleanUser] = {};
  }
  const prev = db.threadActivity[cleanUser][normThread] ?? 0;
  if (timestamp > prev) {
    db.threadActivity[cleanUser][normThread] = timestamp;
  }
  if (opts.unhide && db.hiddenThreads[cleanUser]?.[normThread]) {
    delete db.hiddenThreads[cleanUser][normThread];
    if (Object.keys(db.hiddenThreads[cleanUser]).length === 0) {
      delete db.hiddenThreads[cleanUser];
    }
  }
}

/**
 * Builds the combined recent-activity timestamp map ("dm:<peer>" / "group:<id>") for a user.
 * @param {string} userKey
 * @returns {Record<string, number>}
 */
function getThreadActivityForUser(userKey) {
  const cleanSelf = userKey.trim().toLowerCase();
  /** @type {Record<string, number>} */
  const result = {};

  for (const [rawThreadKey, list] of Object.entries(db.dms)) {
    if (!Array.isArray(list) || list.length === 0) {
      continue;
    }
    const lastTs = list[list.length - 1]?.timestamp ?? 0;
    if (!lastTs) {
      continue;
    }
    if (rawThreadKey.startsWith('group:')) {
      const gid = rawThreadKey.slice('group:'.length);
      const grp = db.groupDms[gid];
      if (grp && Array.isArray(grp.members) && grp.members.some((m) => m.toLowerCase() === cleanSelf)) {
        result[rawThreadKey] = Math.max(result[rawThreadKey] ?? 0, lastTs);
      }
      continue;
    }
    const [u1, u2] = rawThreadKey.split('::');
    if (!u1 || !u2) {
      continue;
    }
    let peer = '';
    if (u1.toLowerCase() === cleanSelf) {
      peer = u2.toLowerCase();
    } else if (u2.toLowerCase() === cleanSelf) {
      peer = u1.toLowerCase();
    }
    if (peer && peer !== cleanSelf) {
      const k = `dm:${peer}`;
      result[k] = Math.max(result[k] ?? 0, lastTs);
    }
  }

  for (const group of Object.values(db.groupDms)) {
    if (group && Array.isArray(group.members) && group.members.some((m) => m.toLowerCase() === cleanSelf)) {
      const k = `group:${group.id}`;
      result[k] = Math.max(result[k] ?? 0, group.createdAt ?? 0);
    }
  }

  const stored = db.threadActivity[cleanSelf];
  if (stored && typeof stored === 'object') {
    for (const [k, ts] of Object.entries(stored)) {
      if (typeof ts === 'number' && Number.isFinite(ts) && ts > (result[k] ?? 0)) {
        result[k] = ts;
      }
    }
  }

  return result;
}

/** @param {Record<string, string[]> | undefined} rawReactions */
function hydrateReactions(rawReactions) {
  if (!rawReactions || typeof rawReactions !== 'object') {
    return [];
  }
  const result = [];
  for (const [emoji, users] of Object.entries(rawReactions)) {
    if (!Array.isArray(users) || users.length === 0) {
      continue;
    }
    result.push({
      emoji,
      count: users.length,
      users: [...users],
    });
  }
  return result;
}

/** @type {Map<string, { mime: string; buf: Buffer; hash: string }>} */
const decodedMediaCache = new Map();
let lastKnownPublicOrigin = '';

function extractPublicOriginFromReq(req) {
  const host = String(req?.headers?.host || '').trim();
  if (!host) return '';
  const hostOnly = host.split(':')[0].toLowerCase();
  if (hostOnly === 'localhost' || hostOnly === '127.0.0.1' || hostOnly === '::1' || hostOnly === '[::1]') {
    return '';
  }
  const protoHeader = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const proto = protoHeader === 'http' || protoHeader === 'https' ? protoHeader : 'https';
  const origin = `${proto}://${host}`;
  lastKnownPublicOrigin = origin;
  return origin;
}

function hashMediaDataUrl(dataUrl) {
  return crypto.createHash('sha1').update(dataUrl).digest('hex').slice(0, 12);
}

function parseImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return null;
  }
  const hash = hashMediaDataUrl(dataUrl);
  const cached = decodedMediaCache.get(hash);
  if (cached) {
    return cached;
  }
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx <= 0) return null;
  const header = dataUrl.slice(5, commaIdx);
  const isBase64 = /;base64$/i.test(header);
  const mime = header.replace(/;base64$/i, '').split(';')[0].trim().toLowerCase() || 'image/png';
  if (!mime.startsWith('image/') || mime === 'image/svg+xml') {
    return null;
  }
  const rawPayload = dataUrl.slice(commaIdx + 1);
  const buf = isBase64
    ? Buffer.from(rawPayload, 'base64')
    : Buffer.from(decodeURIComponent(rawPayload), 'utf8');
  const entry = { mime, buf, hash };
  if (decodedMediaCache.size > 300) {
    decodedMediaCache.clear();
  }
  decodedMediaCache.set(hash, entry);
  return entry;
}

function toCachedMediaUrl(kind, id, dataUrl, originPrefix = lastKnownPublicOrigin) {
  if (typeof dataUrl !== 'string' || !dataUrl.trim()) {
    return undefined;
  }
  if (!dataUrl.startsWith('data:image/')) {
    return dataUrl;
  }
  const hash = hashMediaDataUrl(dataUrl);
  const rel = `/api/media/${kind}/${encodeURIComponent(id)}?v=${hash}`;
  return originPrefix ? `${originPrefix}${rel}` : rel;
}

function getAccountAvatarUrl(account, originPrefix = lastKnownPublicOrigin) {
  if (!account || account.avatarPreset !== null || !account.avatarDataUrl) {
    return undefined;
  }
  return toCachedMediaUrl('avatar', account.username.toLowerCase(), account.avatarDataUrl, originPrefix);
}

function getAccountBannerUrl(account, originPrefix = lastKnownPublicOrigin) {
  if (!account || !account.bannerDataUrl) {
    return undefined;
  }
  return toCachedMediaUrl('banner', account.username.toLowerCase(), account.bannerDataUrl, originPrefix);
}

function getGroupIconUrl(group, originPrefix = lastKnownPublicOrigin) {
  if (!group || !group.iconDataUrl) {
    return undefined;
  }
  return toCachedMediaUrl('group-icon', group.id, group.iconDataUrl, originPrefix);
}

/** @param {StoredUploadMeta} meta */
function toClientAttachment(meta) {
  return {
    id: meta.id,
    url: `/api/uploads/${meta.id}`,
    name: meta.name,
    mime: meta.mime,
    size: meta.size,
    kind: meta.kind,
  };
}

/**
 * @param {StoredMessage} msg
 * @param {StoredMessage[] | undefined} threadList
 */
function hydrateMessage(msg, threadList) {
  const author = findAccountByUsername(msg.authorUsername);
  const rawImages = Array.isArray(msg.imageDataUrls) && msg.imageDataUrls.length > 0
    ? msg.imageDataUrls
    : msg.imageDataUrl
      ? [msg.imageDataUrl]
      : [];
  const imageDataUrls = rawImages.filter(
    (src) => typeof src === 'string' && src.startsWith('data:image/'),
  );
  const spoilerSet = new Set(
    Array.isArray(msg.spoilerAttachmentIds)
      ? msg.spoilerAttachmentIds.filter((id) => typeof id === 'string')
      : [],
  );
  const attachments = [];
  if (Array.isArray(msg.attachmentIds)) {
    for (const attId of msg.attachmentIds) {
      const meta = typeof attId === 'string' ? db.uploads[attId] : undefined;
      if (meta) {
        const clientAtt = toClientAttachment(meta);
        if (spoilerSet.has(attId)) {
          clientAtt.spoiler = true;
        }
        attachments.push(clientAtt);
      }
    }
  }

  let hydratedReply;
  if (msg.replyTo && typeof msg.replyTo === 'object') {
    const refTarget = Array.isArray(threadList)
      ? threadList.find((item) => item.id === msg.replyTo.messageId)
      : undefined;
    const replyAuthorUsername =
      refTarget?.authorUsername ?? msg.replyTo.authorUsername;
    const replyAuthor = findAccountByUsername(replyAuthorUsername);
    const missing = Array.isArray(threadList) ? !refTarget : false;
    const targetImages = refTarget
      ? (Array.isArray(refTarget.imageDataUrls) && refTarget.imageDataUrls.length > 0
          ? refTarget.imageDataUrls
          : refTarget.imageDataUrl
            ? [refTarget.imageDataUrl]
            : [])
      : [];
    const targetAttachments = refTarget && Array.isArray(refTarget.attachmentIds)
      ? refTarget.attachmentIds.filter((id) => Boolean(db.uploads[id]))
      : [];

    hydratedReply = {
      messageId: msg.replyTo.messageId,
      authorUsername: replyAuthor?.username ?? replyAuthorUsername,
      authorName: replyAuthor?.displayName ?? replyAuthorUsername,
      authorAvatarPreset: replyAuthor ? replyAuthor.avatarPreset : 0,
      authorAvatarDataUrl: getAccountAvatarUrl(replyAuthor),
      content: refTarget ? refTarget.content : missing ? '' : (msg.replyTo.content ?? ''),
      hasImage: refTarget
        ? targetImages.length > 0
        : missing
          ? false
          : Boolean(msg.replyTo.hasImage),
      hasAttachment: refTarget
        ? targetImages.length > 0 || targetAttachments.length > 0 || Boolean(refTarget.gif)
        : missing
          ? false
          : Boolean(msg.replyTo.hasAttachment || msg.replyTo.hasImage),
      missing,
    };
  }

  let hydratedCallLog;
  if (msg.callLog && typeof msg.callLog === 'object') {
    const callerAcc = findAccountByUsername(msg.callLog.callerUsername);
    hydratedCallLog = {
      threadKey: msg.callLog.threadKey,
      kind: msg.callLog.kind === 'group' ? 'group' : 'dm',
      status: msg.callLog.status,
      callerUsername: callerAcc?.username ?? msg.callLog.callerUsername,
      callerDisplayName: callerAcc?.displayName ?? msg.callLog.callerUsername,
      startedAt: msg.callLog.startedAt,
      answeredAt: msg.callLog.answeredAt,
      endedAt: msg.callLog.endedAt,
      durationMs: msg.callLog.durationMs,
      participantUsernames: Array.isArray(msg.callLog.participantUsernames)
        ? [...msg.callLog.participantUsernames]
        : [],
    };
  }

  let hydratedSystemEvent;
  if (msg.systemEvent && typeof msg.systemEvent === 'object') {
    const actorAcc = findAccountByUsername(msg.systemEvent.actorUsername);
    const targetAcc = msg.systemEvent.targetUsername
      ? findAccountByUsername(msg.systemEvent.targetUsername)
      : undefined;
    const rawTargets = Array.isArray(msg.systemEvent.targetUsernames)
      ? msg.systemEvent.targetUsernames
      : undefined;
    const targetDisplayNames = rawTargets
      ? rawTargets.map((u) => findAccountByUsername(u)?.displayName ?? u)
      : undefined;
    hydratedSystemEvent = {
      kind: msg.systemEvent.kind,
      actorUsername: actorAcc?.username ?? msg.systemEvent.actorUsername,
      actorDisplayName: actorAcc?.displayName ?? msg.systemEvent.actorDisplayName ?? msg.systemEvent.actorUsername,
      targetUsername: msg.systemEvent.targetUsername
        ? targetAcc?.username ?? msg.systemEvent.targetUsername
        : undefined,
      targetDisplayName: msg.systemEvent.targetUsername
        ? targetAcc?.displayName ?? msg.systemEvent.targetDisplayName ?? msg.systemEvent.targetUsername
        : undefined,
      targetUsernames: rawTargets,
      targetDisplayNames,
      pinnedMessageId: msg.systemEvent.pinnedMessageId,
    };
  }

  let hydratedForwarded;
  if (msg.forwarded && typeof msg.forwarded === 'object') {
    const origAcc = msg.forwarded.originalAuthorUsername
      ? findAccountByUsername(msg.forwarded.originalAuthorUsername)
      : undefined;
    hydratedForwarded = {
      originalAuthorUsername:
        origAcc?.username ?? msg.forwarded.originalAuthorUsername,
      originalAuthorName:
        origAcc?.displayName ??
        msg.forwarded.originalAuthorName ??
        msg.forwarded.originalAuthorUsername,
      originalTimestamp: msg.forwarded.originalTimestamp,
      sourceKind: msg.forwarded.sourceKind,
    };
  }

  return {
    id: msg.id,
    authorUsername: author?.username ?? msg.authorUsername,
    authorName: author?.displayName ?? msg.authorUsername,
    authorAvatarPreset: author ? author.avatarPreset : 0,
    authorAvatarDataUrl: getAccountAvatarUrl(author),
    content: msg.content,
    imageDataUrl: imageDataUrls[0],
    imageDataUrls: imageDataUrls.length > 0 ? imageDataUrls : undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
    gif: msg.gif,
    replyTo: hydratedReply,
    statusReply:
      msg.statusReply && typeof msg.statusReply === 'object'
        ? {
            authorUsername:
              findAccountByUsername(msg.statusReply.authorUsername)?.username ??
              msg.statusReply.authorUsername,
            authorName:
              findAccountByUsername(msg.statusReply.authorUsername)?.displayName ??
              msg.statusReply.authorName ??
              msg.statusReply.authorUsername,
            emoji: msg.statusReply.emoji || undefined,
            text: msg.statusReply.text || undefined,
          }
        : undefined,
    forwarded: hydratedForwarded,
    callLog: hydratedCallLog,
    systemEvent: hydratedSystemEvent,
    voiceNote: msg.voiceNote,
    timestamp: msg.timestamp,
    editedAt: msg.editedAt,
    pinned: msg.pinned ? true : undefined,
    pinnedAt: msg.pinned ? msg.pinnedAt : undefined,
    pinnedBy: msg.pinned ? msg.pinnedBy : undefined,
    reactions: hydrateReactions(msg.reactions),
  };
}

function appendSystemEventMessage(ctx, systemEvent, fallbackContent) {
  if (!db.dms[ctx.threadKey]) {
    db.dms[ctx.threadKey] = [];
  }
  const list = db.dms[ctx.threadKey];
  const msg = {
    id: crypto.randomUUID(),
    authorUsername: systemEvent.actorUsername,
    content: fallbackContent,
    timestamp: Date.now(),
    systemEvent,
    reactions: {},
  };
  list.push(msg);
  sqliteStore.insertMessage(ctx.threadKey, msg);
  saveDb(db);

  const hydrated = hydrateMessage(msg, list);
  const wsEvent =
    ctx.kind === 'group'
      ? { type: 'dm:message', groupId: ctx.groupId, message: hydrated }
      : { type: 'dm:message', threadUsers: ctx.participants, message: hydrated };
  for (const participant of ctx.participants) {
    sendWsEventToUser(participant, wsEvent);
  }
  return hydrated;
}

function emitSocialNotify(recipientUsername, eventPayload) {
  if (!recipientUsername) {
    return;
  }
  sendWsEventToUser(recipientUsername, {
    type: 'social:notify',
    event: eventPayload,
  });
}

/**
 * Active voice calls keyed by threadKey ("alice::bob" or "group:<id>").
 * @typedef {{
 *   username: string;
 *   muted: boolean;
 *   deafened: boolean;
 *   cameraOn: boolean;
 *   screenSharing: boolean;
 *   screenPaused?: boolean;
 *   cameraStreamId?: string;
 *   screenStreamId?: string;
 *   joinedAt: number;
 * }} ActiveVcParticipant
 * @typedef {{ username: string; timeoutId: ReturnType<typeof setTimeout> }} ActiveVcRinging
 * @typedef {{
 *   threadKey: string;
 *   kind: 'dm' | 'group';
 *   groupId?: string;
 *   startedBy: string;
 *   startedAt: number;
 *   answeredAt: number | null;
 *   everHadAnswer: boolean;
 *   callMessageId: string | null;
 *   finalized: boolean;
 *   allowedUsers: string[];
 *   seenParticipants: Set<string>;
 *   participants: Map<string, ActiveVcParticipant>;
 *   ringing: Map<string, ActiveVcRinging>;
 * }} ActiveVoiceCall
 * @type {Map<string, ActiveVoiceCall>}
 */
const activeVoiceCalls = new Map();
const VC_RING_TIMEOUT_MS = 30_000;

/** @param {ActiveVoiceCall} call */
function getCallRecipients(call) {
  const recipients = new Set(call.allowedUsers);
  if (call.kind === 'group' && call.groupId) {
    const grp = db.groupDms[call.groupId];
    if (grp && Array.isArray(grp.members)) {
      for (const m of grp.members) {
        recipients.add(m.toLowerCase());
      }
    }
  }
  return recipients;
}

/**
 * @param {ActiveVoiceCall} call
 * @param {'dm:message' | 'dm:edit'} eventType
 * @param {StoredMessage} storedMsg
 * @param {StoredMessage[]} threadList
 */
function emitCallThreadEvent(call, eventType, storedMsg, threadList) {
  const hydrated = hydrateMessage(storedMsg, threadList);
  const wsEvent =
    call.kind === 'group'
      ? { type: eventType, groupId: call.groupId, message: hydrated }
      : {
          type: eventType,
          threadUsers: call.allowedUsers.slice(0, 2),
          message: hydrated,
        };
  const recipients = Array.from(getCallRecipients(call));
  // Deliver the call log message over WebSocket FIRST so clients see it instantaneously.
  for (const targetKey of recipients) {
    sendWsEventToUser(targetKey, wsEvent);
  }
  if (eventType === 'dm:message') {
    const callTs = storedMsg.timestamp || Date.now();
    for (const recipient of recipients) {
      const cleanRecipient = recipient.toLowerCase();
      if (call.kind === 'group' && call.groupId) {
        touchThreadActivityForUser(cleanRecipient, `group:${call.groupId}`, callTs, { unhide: true });
      } else {
        const peer = call.allowedUsers.find((u) => u.toLowerCase() !== cleanRecipient)?.toLowerCase();
        if (peer) {
          touchThreadActivityForUser(cleanRecipient, `dm:${peer}`, callTs, { unhide: true });
        }
      }
    }
    for (const recipient of recipients) {
      pushSnapshotToUser(recipient);
    }
    saveDb(db);
  }
}

/** @param {ActiveVoiceCall} call */
function createCallLogMessage(call) {
  if (!Array.isArray(db.dms[call.threadKey])) {
    db.dms[call.threadKey] = [];
  }
  const threadList = db.dms[call.threadKey];
  const msgId = crypto.randomUUID();
  /** @type {StoredMessage} */
  const stored = {
    id: msgId,
    authorUsername: call.startedBy,
    content: '',
    timestamp: call.startedAt,
    reactions: {},
    callLog: {
      threadKey: call.threadKey,
      kind: call.kind,
      status: 'ringing',
      callerUsername: call.startedBy,
      startedAt: call.startedAt,
      participantUsernames: Array.from(call.seenParticipants),
    },
  };
  threadList.push(stored);
  sqliteStore.insertMessage(call.threadKey, stored);
  call.callMessageId = msgId;

  if (call.kind === 'dm' && call.allowedUsers.length >= 2) {
    recordOpenDmPeer(call.allowedUsers[0], call.allowedUsers[1]);
    recordOpenDmPeer(call.allowedUsers[1], call.allowedUsers[0]);
  }
  emitCallThreadEvent(call, 'dm:message', stored, threadList);
}

/**
 * @param {ActiveVoiceCall} call
 * @param {'ringing' | 'active' | 'missed' | 'ended'} nextStatus
 * @param {boolean} [force]
 */
function syncCallLogMessage(call, nextStatus, force = false) {
  if (!call.callMessageId) {
    return;
  }
  const threadList = db.dms[call.threadKey];
  if (!Array.isArray(threadList)) {
    return;
  }
  const stored = threadList.find((m) => m.id === call.callMessageId);
  if (!stored || !stored.callLog) {
    return;
  }
  const nextParticipants = Array.from(call.seenParticipants);
  const prev = stored.callLog;
  const endedAt =
    nextStatus === 'ended' || nextStatus === 'missed' ? prev.endedAt ?? Date.now() : undefined;
  const answeredAt = call.answeredAt ?? prev.answeredAt;
  const durationMs =
    nextStatus === 'ended'
      ? Math.max(0, (endedAt ?? Date.now()) - (answeredAt ?? call.startedAt))
      : undefined;

  const changed =
    force ||
    prev.status !== nextStatus ||
    prev.answeredAt !== answeredAt ||
    prev.endedAt !== endedAt ||
    prev.durationMs !== durationMs ||
    prev.participantUsernames.length !== nextParticipants.length;

  if (!changed) {
    return;
  }

  stored.callLog = {
    threadKey: call.threadKey,
    kind: call.kind,
    status: nextStatus,
    callerUsername: call.startedBy,
    startedAt: call.startedAt,
    answeredAt,
    endedAt,
    durationMs,
    participantUsernames: nextParticipants,
  };
  sqliteStore.updateMessage(stored);
  saveDb(db);
  emitCallThreadEvent(call, 'dm:edit', stored, threadList);
}

/** @param {ActiveVoiceCall} call */
function finalizeCallIfDone(call) {
  if (call.finalized) {
    return false;
  }
  if (call.participants.size > 0 || call.ringing.size > 0) {
    return false;
  }
  call.finalized = true;
  activeVoiceCalls.delete(call.threadKey);
  syncCallLogMessage(call, call.everHadAnswer ? 'ended' : 'missed', true);
  return true;
}

/**
 * @param {ActiveVoiceCall} call
 * @param {string} viewerKey
 */
function buildVcStatePayload(call, viewerKey) {
  const participants = [];
  for (const entry of call.participants.values()) {
    const acc = findAccountByUsername(entry.username);
    if (!acc) {
      continue;
    }
    participants.push({
      user: toPublicProfile(acc, viewerKey),
      muted: Boolean(entry.muted),
      deafened: Boolean(entry.deafened),
      cameraOn: Boolean(entry.cameraOn),
      screenSharing: Boolean(entry.screenSharing),
      screenPaused: Boolean(entry.screenSharing && entry.screenPaused),
      cameraStreamId: entry.cameraStreamId || undefined,
      screenStreamId: entry.screenStreamId || undefined,
      connectionId: entry.connectionId || undefined,
      joinedAt: entry.joinedAt,
    });
  }
  participants.sort((a, b) => {
    const byName = a.user.displayName.localeCompare(b.user.displayName, undefined, {
      sensitivity: 'base',
    });
    return byName !== 0 ? byName : a.user.username.localeCompare(b.user.username);
  });

  const ringing = [];
  for (const entry of call.ringing.values()) {
    const acc = findAccountByUsername(entry.username);
    if (acc) {
      ringing.push(toPublicProfile(acc, viewerKey));
    }
  }
  ringing.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
  );

  return {
    type: 'vc:state',
    threadKey: call.threadKey,
    kind: call.kind,
    groupId: call.groupId,
    startedBy: call.startedBy,
    active: participants.length > 0 || ringing.length > 0,
    participants,
    ringing,
  };
}

/** @param {ActiveVoiceCall} call */
function broadcastVcState(call) {
  for (const targetKey of getCallRecipients(call)) {
    sendWsEventToUser(targetKey, buildVcStatePayload(call, targetKey));
  }
}

/**
 * @param {ActiveVoiceCall} call
 * @param {string} userKey
 */
function stopRingingUser(call, userKey) {
  const clean = userKey.toLowerCase();
  const ringEntry = call.ringing.get(clean);
  if (ringEntry) {
    clearTimeout(ringEntry.timeoutId);
    call.ringing.delete(clean);
    sendWsEventToUser(clean, { type: 'vc:incoming-clear', threadKey: call.threadKey });
    return true;
  }
  return false;
}

/** @param {ActiveVoiceCall} call */
function clearAllRingingInCall(call) {
  for (const [userKey, ringEntry] of call.ringing.entries()) {
    clearTimeout(ringEntry.timeoutId);
    sendWsEventToUser(userKey, { type: 'vc:incoming-clear', threadKey: call.threadKey });
  }
  call.ringing.clear();
}

/** @param {string} username */
function sendActiveVcSnapshotsToUser(username) {
  const cleanKey = username.toLowerCase();
  for (const call of activeVoiceCalls.values()) {
    const isAllowed =
      call.allowedUsers.includes(cleanKey) ||
      (call.kind === 'group' &&
        call.groupId &&
        db.groupDms[call.groupId]?.members?.some((m) => m.toLowerCase() === cleanKey));
    if (!isAllowed) {
      continue;
    }
    sendWsEventToUser(cleanKey, buildVcStatePayload(call, cleanKey));
    if (call.ringing.has(cleanKey)) {
      const callerAcc = findAccountByUsername(call.startedBy);
      const grp = call.groupId ? db.groupDms[call.groupId] : undefined;
      if (callerAcc) {
        sendWsEventToUser(cleanKey, {
          type: 'vc:incoming',
          threadKey: call.threadKey,
          kind: call.kind,
          groupId: call.groupId,
          groupName: grp?.name,
          groupIconDataUrl: getGroupIconUrl(grp),
          caller: toPublicProfile(callerAcc, cleanKey),
        });
      }
    }
  }
}

const VALID_ACTIVITY_GAMES = new Set([
  'chess',
  'checkers',
  'minesweeper',
  'vexilloguessr',
  'pool',
  'quoridor',
]);

/** @type {Map<string, any>} */
const activeActivityLobbies = new Map();

function pruneStaleActivityLobbies() {
  const cutoff = Date.now() - 45 * 60 * 1000;
  for (const [id, lobby] of activeActivityLobbies.entries()) {
    if ((lobby.updatedAt || lobby.createdAt || 0) < cutoff) {
      activeActivityLobbies.delete(id);
    }
  }
}

function buildActivityUserProfile(username) {
  const acc = findAccountByUsername(username);
  if (!acc) {
    return {
      username,
      displayName: username,
      avatarPreset: 0,
      avatarDataUrl: undefined,
    };
  }
  return {
    username: acc.username,
    displayName: acc.displayName,
    avatarPreset: acc.avatarPreset ?? null,
    avatarDataUrl: getAccountAvatarUrl(acc),
  };
}

function serializeActivityLobby(lobby) {
  return {
    id: lobby.id,
    gameId: lobby.gameId,
    threadKey: lobby.threadKey,
    isPublic: Boolean(lobby.isPublic),
    title: lobby.title,
    hostUsername: lobby.hostUsername,
    maxPlayers: lobby.maxPlayers,
    status: lobby.status,
    players: (lobby.players || []).map((p) => ({
      ...buildActivityUserProfile(p.username),
      seat: p.seat ?? 0,
      wins: p.wins ?? 0,
    })),
    spectators: (lobby.spectators || []).map((s) => ({
      ...buildActivityUserProfile(s.username),
    })),
    rematchVotes: Array.isArray(lobby.rematchVotes) ? lobby.rematchVotes : [],
    gameState: lobby.gameState ?? null,
    version: lobby.version ?? 1,
    createdAt: lobby.createdAt,
    updatedAt: lobby.updatedAt,
  };
}

function getActivityLobbyRecipients(lobby) {
  const recipients = new Set();
  for (const p of lobby.players || []) {
    if (p?.username) recipients.add(p.username.toLowerCase());
  }
  for (const s of lobby.spectators || []) {
    if (s?.username) recipients.add(s.username.toLowerCase());
  }
  if (lobby.threadKey) {
    const call = activeVoiceCalls.get(lobby.threadKey);
    if (call) {
      for (const u of getCallRecipients(call)) {
        recipients.add(u.toLowerCase());
      }
    } else if (lobby.threadKey.startsWith('group:')) {
      const gid = lobby.threadKey.slice('group:'.length);
      const grp = db.groupDms[gid];
      for (const m of grp?.members || []) {
        recipients.add(m.toLowerCase());
      }
    } else {
      for (const part of lobby.threadKey.split('::')) {
        if (part) recipients.add(part.toLowerCase());
      }
    }
  }
  if (lobby.isPublic) {
    for (const u of onlineSockets.keys()) {
      recipients.add(u.toLowerCase());
    }
  }
  return recipients;
}

function broadcastActivityLobby(lobby) {
  const payload = {
    type: 'activity:lobby-update',
    lobby: serializeActivityLobby(lobby),
  };
  for (const targetKey of getActivityLobbyRecipients(lobby)) {
    sendWsEventToUser(targetKey, payload);
  }
}

function sendActiveActivitiesToUser(username) {
  pruneStaleActivityLobbies();
  const cleanKey = username.toLowerCase();
  const list = [];
  for (const lobby of activeActivityLobbies.values()) {
    const rec = getActivityLobbyRecipients(lobby);
    if (lobby.isPublic || rec.has(cleanKey)) {
      list.push(serializeActivityLobby(lobby));
    }
  }
  sendWsEventToUser(cleanKey, {
    type: 'activity:list',
    lobbies: list,
  });
}

/** @param {string} username */
function cleanupUserFromVoiceCalls(username) {
  const cleanKey = username.toLowerCase();
  for (const call of Array.from(activeVoiceCalls.values())) {
    let changed = false;
    if (stopRingingUser(call, cleanKey)) {
      changed = true;
    }
    if (call.participants.delete(cleanKey)) {
      changed = true;
      if (cleanKey === call.startedBy || call.participants.size === 0) {
        clearAllRingingInCall(call);
      }
    }
    if (changed) {
      finalizeCallIfDone(call);
      broadcastVcState(call);
    }
  }
}

/**
 * Removes a user from any voice call currently owned by a specific disconnecting socket
 * without disturbing calls that have already been transferred to another device.
 * @param {string} username
 * @param {string} socketId
 */
function cleanupSocketFromVoiceCalls(username, socketId) {
  if (!socketId) return;
  const cleanKey = username.toLowerCase();
  for (const call of Array.from(activeVoiceCalls.values())) {
    const entry = call.participants.get(cleanKey);
    if (entry && entry.socketId && entry.socketId === socketId) {
      call.participants.delete(cleanKey);
      if (cleanKey === call.startedBy || call.participants.size === 0) {
        clearAllRingingInCall(call);
      }
      broadcastVcState(call);
      finalizeCallIfDone(call);
    }
  }
}

/**
 * @param {string} username
 * @param {Record<string, unknown>} payloadObj
 */
function sendWsEventToUser(username, payloadObj) {
  const key = username.toLowerCase();
  const sockets = onlineSockets.get(key);
  if (!sockets || sockets.size === 0) {
    return;
  }
  const encoded = JSON.stringify(payloadObj);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(encoded);
    }
  }
}

function sendWsEventToSocket(ws, payloadObj) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }
  try {
    ws.send(JSON.stringify(payloadObj));
  } catch {}
}

function findUserSocketById(username, socketId) {
  if (!socketId) return null;
  const sockets = onlineSockets.get(username.toLowerCase());
  if (!sockets) return null;
  for (const ws of sockets) {
    if (socketMeta.get(ws)?.socketId === socketId) {
      return ws;
    }
  }
  return null;
}

/**
 * @param {string} fromUsername
 * @param {string} toUsername
 * @param {boolean} isTyping
 */
function emitTypingState(fromUsername, toUsername, isTyping) {
  const fromKey = fromUsername.toLowerCase();
  const toKey = toUsername.toLowerCase();
  const timerKey = `${fromKey}::${toKey}`;

  const existing = typingTimers.get(timerKey);
  if (existing) {
    clearTimeout(existing);
    typingTimers.delete(timerKey);
  }

  const sender = findAccountByUsername(fromKey);
  const displayName = sender?.displayName ?? fromKey;

  sendWsEventToUser(toKey, {
    type: 'dm:typing',
    fromUsername: fromKey,
    displayName,
    isTyping,
  });

  if (isTyping) {
    const timer = setTimeout(() => {
      typingTimers.delete(timerKey);
      const latestSender = findAccountByUsername(fromKey);
      sendWsEventToUser(toKey, {
        type: 'dm:typing',
        fromUsername: fromKey,
        displayName: latestSender?.displayName ?? fromKey,
        isTyping: false,
      });
    }, 1500);
    typingTimers.set(timerKey, timer);
  }
}

/**
 * Emits typing indicators across all other participants in a Group DM.
 * @param {string} fromUsername
 * @param {string} groupId
 * @param {boolean} isTyping
 */
function emitGroupTypingState(fromUsername, groupId, isTyping) {
  const fromKey = fromUsername.toLowerCase();
  const group = db.groupDms[groupId];
  if (!group || !group.members.some((m) => m.toLowerCase() === fromKey)) {
    return;
  }

  const timerKey = `${fromKey}::group:${groupId}`;
  const existing = typingTimers.get(timerKey);
  if (existing) {
    clearTimeout(existing);
    typingTimers.delete(timerKey);
  }

  const sender = findAccountByUsername(fromKey);
  const displayName = sender?.displayName ?? fromKey;
  for (const member of group.members) {
    if (member.toLowerCase() !== fromKey) {
      sendWsEventToUser(member, {
        type: 'dm:typing',
        groupId,
        fromUsername: fromKey,
        displayName,
        isTyping,
      });
    }
  }

  if (isTyping) {
    const timer = setTimeout(() => {
      typingTimers.delete(timerKey);
      const latestGroup = db.groupDms[groupId];
      if (!latestGroup) {
        return;
      }
      const latestSender = findAccountByUsername(fromKey);
      for (const member of latestGroup.members) {
        if (member.toLowerCase() !== fromKey) {
          sendWsEventToUser(member, {
            type: 'dm:typing',
            groupId,
            fromUsername: fromKey,
            displayName: latestSender?.displayName ?? fromKey,
            isTyping: false,
          });
        }
      }
    }, 1500);
    typingTimers.set(timerKey, timer);
  }
}

function findAccountByUsername(username) {
  const key = username.trim().toLowerCase();
  return db.accounts.find((acc) => acc.username.toLowerCase() === key);
}

function findAccountByEmail(email) {
  const key = email.trim().toLowerCase();
  return db.accounts.find((acc) => acc.email.toLowerCase() === key);
}

function findAccountByIdentifier(identifier) {
  const key = identifier.trim().toLowerCase();
  return db.accounts.find(
    (acc) => acc.username.toLowerCase() === key || acc.email.toLowerCase() === key,
  );
}

function isUserSocketOnline(username) {
  const key = username.trim().toLowerCase();
  const sockets = onlineSockets.get(key);
  if (sockets && sockets.size > 0) {
    return true;
  }
  const lastSeen = lastSeenByUser.get(key) ?? 0;
  return Date.now() - lastSeen < 25000;
}

/**
 * @param {StoredAccount} account
 * @returns {EffectiveStatus}
 */
function getVisibleFriendStatus(account) {
  if (!isUserSocketOnline(account.username)) {
    return 'offline';
  }
  if (account.status === 'invisible') {
    return 'offline';
  }
  return account.status ?? 'online';
}

function sanitizeSingleEmoji(raw) {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    const first = segmenter.segment(trimmed)[Symbol.iterator]().next();
    return first.value?.segment || undefined;
  }
  return Array.from(trimmed)[0];
}

/** @param {StoredAccount} account */
function getActiveCustomStatus(account) {
  const raw = account.customStatus;
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  if (typeof raw.expiresAt === 'number' && Number.isFinite(raw.expiresAt) && raw.expiresAt <= Date.now()) {
    account.customStatus = undefined;
    return undefined;
  }
  const text = typeof raw.text === 'string' ? raw.text.trim().slice(0, 128) : '';
  const emoji = sanitizeSingleEmoji(raw.emoji);
  if (!text && !emoji) {
    return undefined;
  }
  return {
    text,
    emoji,
    expiresAt: typeof raw.expiresAt === 'number' && Number.isFinite(raw.expiresAt) ? raw.expiresAt : null,
  };
}

/**
 * @param {StoredAccount} account
 * @param {string} [viewerUsername]
 */
function toPublicProfile(account, viewerUsername) {
  const isPrivate = Boolean(account.privacy?.privateProfile);
  const acceptsNonFriendDms = account.privacy?.allowNonFriendDms !== false;
  const isBlocked = Boolean(
    viewerUsername && hasAnyBlockBetween(viewerUsername, account.username),
  );

  if (isPrivate || isBlocked) {
    return {
      username: account.username,
      displayName: account.displayName,
      bio: '',
      createdAt: isPrivate ? 0 : account.createdAt,
      status: 'offline',
      avatarPreset: account.avatarPreset,
      avatarDataUrl: getAccountAvatarUrl(account),
      bannerColor: undefined,
      bannerDataUrl: undefined,
      customStatus: null,
      isProfilePrivate: isPrivate,
      isBlockedRelation: isBlocked,
      acceptsNonFriendDms,
    };
  }

  return {
    username: account.username,
    displayName: account.displayName,
    bio: account.bio,
    createdAt: account.createdAt,
    status: getVisibleFriendStatus(account),
    avatarPreset: account.avatarPreset,
    avatarDataUrl: getAccountAvatarUrl(account),
    bannerColor: account.bannerColor || undefined,
    bannerDataUrl: getAccountBannerUrl(account),
    customStatus: getActiveCustomStatus(account),
    isProfilePrivate: false,
    isBlockedRelation: false,
    acceptsNonFriendDms,
  };
}

/** @param {StoredAccount} account */
function toSelfProfile(account) {
  return {
    username: account.username,
    displayName: account.displayName,
    email: account.email,
    bio: account.bio,
    createdAt: account.createdAt,
    status: account.status ?? 'online',
    avatarPreset: account.avatarPreset,
    avatarDataUrl: getAccountAvatarUrl(account),
    bannerColor: account.bannerColor || undefined,
    bannerDataUrl: getAccountBannerUrl(account),
    customStatus: getActiveCustomStatus(account),
    privacy: {
      allowFriendRequests: account.privacy?.allowFriendRequests !== false,
      allowNonFriendDms: account.privacy?.allowNonFriendDms !== false,
      privateProfile: Boolean(account.privacy?.privateProfile),
      showReadReceipts: Boolean(account.privacy?.showReadReceipts),
    },
  };
}

/**
 * @param {StoredGroupDm} group
 * @param {string} [viewerUsername]
 */
function toClientGroup(group, viewerUsername) {
  const members = [];
  for (const memberUsername of group.members ?? []) {
    const acc = findAccountByUsername(memberUsername);
    if (acc) {
      members.push(toPublicProfile(acc, viewerUsername));
    }
  }
  return {
    id: group.id,
    name: group.name,
    iconDataUrl: getGroupIconUrl(group),
    ownerUsername: group.ownerUsername,
    members,
    createdAt: group.createdAt,
  };
}

/** @param {string} username */
function buildSocialSnapshot(username) {
  const key = username.toLowerCase();
  const account = findAccountByUsername(key);
  if (!account) {
    return null;
  }

  const friendIds = db.friendships[key] ?? [];
  const friends = [];
  for (const id of friendIds) {
    const friend = findAccountByUsername(id);
    if (friend) {
      friends.push(toPublicProfile(friend, key));
    }
  }

  const incomingRequests = [];
  const outgoingRequests = [];
  for (const req of db.friendRequests) {
    if (req.to.toLowerCase() === key) {
      const sender = findAccountByUsername(req.from);
      if (sender) {
        incomingRequests.push({
          direction: 'incoming',
          user: toPublicProfile(sender, key),
          createdAt: req.createdAt,
        });
      }
    } else if (req.from.toLowerCase() === key) {
      const target = findAccountByUsername(req.to);
      if (target) {
        outgoingRequests.push({
          direction: 'outgoing',
          user: toPublicProfile(target, key),
          createdAt: req.createdAt,
        });
      }
    }
  }

  incomingRequests.sort((a, b) => b.createdAt - a.createdAt);
  outgoingRequests.sort((a, b) => b.createdAt - a.createdAt);

  const blockedUsers = [];
  for (const blockedId of db.blocks[key] ?? []) {
    const blockedAccount = findAccountByUsername(blockedId);
    if (blockedAccount) {
      blockedUsers.push(toPublicProfile(blockedAccount, key));
    }
  }

  const groups = [];
  for (const group of Object.values(db.groupDms)) {
    if (group && Array.isArray(group.members) && group.members.some((m) => m.toLowerCase() === key)) {
      groups.push(toClientGroup(group, key));
    }
  }
  groups.sort((a, b) => b.createdAt - a.createdAt);

  const dmPeers = [];
  for (const peerKey of getDmPeerKeys(key)) {
    const peerAccount = findAccountByUsername(peerKey);
    if (peerAccount) {
      dmPeers.push(toPublicProfile(peerAccount, key));
    }
  }

  if (pruneExpiredMutesForUser(key)) {
    saveDb(db);
  }

  return {
    user: toSelfProfile(account),
    friends,
    dmPeers,
    incomingRequests,
    outgoingRequests,
    blockedUsers,
    favoriteGifs: (db.favoriteGifs[key] ?? [])
      .filter((g) => isCommunityGifAssetIntact(g))
      .map((g) => ensureGifDimensions({ ...g })),
    groups,
    unreadCounts: { ...(db.unreadDms[key] ?? {}) },
    groupUnreadCounts: { ...(db.unreadGroups[key] ?? {}) },
    unreadMentions: { ...(db.unreadMentions?.[key] ?? {}) },
    groupUnreadMentions: { ...(db.groupUnreadMentions?.[key] ?? {}) },
    mutedThreads: { ...(db.mutedThreads[key] ?? {}) },
    hiddenThreads: Object.keys(db.hiddenThreads[key] ?? {}),
    threadActivity: getThreadActivityForUser(key),
  };
}

/** @param {string} username */
function pushSnapshotToUser(username) {
  const key = username.toLowerCase();
  const sockets = onlineSockets.get(key);
  if (!sockets || sockets.size === 0) {
    return;
  }

  const snapshot = buildSocialSnapshot(key);
  if (!snapshot) {
    return;
  }

  const payload = JSON.stringify({ type: 'social:sync', snapshot });
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

/** Broadcasts a shared GIF library refresh signal to all online users. */
function broadcastGifsUpdated() {
  const payload = JSON.stringify({ type: 'gifs:updated' });
  for (const sockets of onlineSockets.values()) {
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }
}

/** @param {string} username */
function notifyRelatedPeers(username, includeSelf = true) {
  const key = username.toLowerCase();
  const affected = new Set();
  if (includeSelf) {
    affected.add(key);
  }

  for (const friendId of db.friendships[key] ?? []) {
    affected.add(friendId.toLowerCase());
  }

  for (const req of db.friendRequests) {
    if (req.from.toLowerCase() === key) {
      affected.add(req.to.toLowerCase());
    } else if (req.to.toLowerCase() === key) {
      affected.add(req.from.toLowerCase());
    }
  }

  for (const group of Object.values(db.groupDms)) {
    if (group && Array.isArray(group.members) && group.members.some((m) => m.toLowerCase() === key)) {
      for (const m of group.members) {
        if (includeSelf || m.toLowerCase() !== key) {
          affected.add(m.toLowerCase());
        }
      }
    }
  }

  for (const peerKey of getDmPeerKeys(key)) {
    affected.add(peerKey.toLowerCase());
  }

  for (const [owner, list] of Object.entries(db.openDms)) {
    if (Array.isArray(list) && list.some((u) => u.toLowerCase() === key)) {
      if (includeSelf || owner.toLowerCase() !== key) {
        affected.add(owner.toLowerCase());
      }
    }
  }

  for (const target of affected) {
    pushSnapshotToUser(target);
  }
}

/** @param {string} username */
function issueSessionToken(username) {
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = username.toLowerCase();
  saveDb(db);
  return token;
}

/** @param {import('node:http').IncomingMessage} req */
function extractBearerToken(req) {
  const authHeader = req.headers.authorization ?? '';
  const match = /^Bearer\s+([a-zA-Z0-9]+)$/i.exec(authHeader.trim());
  return match ? match[1] : null;
}

/** @param {import('node:http').IncomingMessage} req */
function authenticateRequest(req) {
  const token = extractBearerToken(req);
  if (!token) {
    return null;
  }
  const username = db.sessions[token];
  if (!username) {
    return null;
  }
  const acc = findAccountByUsername(username) ?? null;
  if (acc) {
    const uKey = acc.username.toLowerCase();
    const wasOnline = isUserSocketOnline(uKey);
    lastSeenByUser.set(uKey, Date.now());
    if (!wasOnline) {
      queueMicrotask(() => notifyRelatedPeers(uKey, false));
    }
  }
  return acc;
}

/**
 * @param {string} password
 * @param {string} confirmPassword
 */
function validatePasswordPair(password, confirmPassword) {
  if (!password) {
    return 'Error: Password is required';
  }
  if (!password.trim()) {
    return 'Error: Password cannot be only spaces';
  }
  if (password.length < 6) {
    return 'Error: Password must be at least 6 characters';
  }
  if (password.length > 128) {
    return 'Error: Password must be 128 characters or fewer';
  }
  if (!confirmPassword) {
    return 'Error: Please confirm your password';
  }
  if (password !== confirmPassword) {
    return 'Error: Passwords do not match';
  }
  return null;
}

/**
 * @param {string} oldUsername
 * @param {string} newUsername
 */
function migrateUsernameReferences(oldUsername, newUsername) {
  const oldKey = oldUsername.toLowerCase();
  const newKey = newUsername.toLowerCase();
  if (oldKey === newKey) {
    return;
  }

  /** @type {Record<string, string[]>} */
  const nextFriendships = {};
  for (const [owner, list] of Object.entries(db.friendships)) {
    const mappedOwner = owner.toLowerCase() === oldKey ? newKey : owner.toLowerCase();
    const mappedList = list.map((u) => (u.toLowerCase() === oldKey ? newKey : u.toLowerCase()));
    nextFriendships[mappedOwner] = Array.from(new Set(mappedList));
  }
  db.friendships = nextFriendships;

  /** @type {Record<string, string[]>} */
  const nextBlocks = {};
  for (const [owner, list] of Object.entries(db.blocks)) {
    const mappedOwner = owner.toLowerCase() === oldKey ? newKey : owner.toLowerCase();
    const mappedList = list.map((u) => (u.toLowerCase() === oldKey ? newKey : u.toLowerCase()));
    nextBlocks[mappedOwner] = Array.from(new Set(mappedList));
  }
  db.blocks = nextBlocks;

  db.friendRequests = db.friendRequests.map((req) => ({
    ...req,
    from: req.from.toLowerCase() === oldKey ? newKey : req.from.toLowerCase(),
    to: req.to.toLowerCase() === oldKey ? newKey : req.to.toLowerCase(),
  }));

  for (const [tok, owner] of Object.entries(db.sessions)) {
    if (owner.toLowerCase() === oldKey) {
      db.sessions[tok] = newKey;
    }
  }

  /** @type {Record<string, Record<string, number>>} */
  const nextUnread = {};
  for (const [owner, counts] of Object.entries(db.unreadDms)) {
    const mappedOwner = owner.toLowerCase() === oldKey ? newKey : owner.toLowerCase();
    /** @type {Record<string, number>} */
    const mappedCounts = {};
    for (const [peer, count] of Object.entries(counts ?? {})) {
      const mappedPeer = peer.toLowerCase() === oldKey ? newKey : peer.toLowerCase();
      mappedCounts[mappedPeer] = (mappedCounts[mappedPeer] ?? 0) + count;
    }
    nextUnread[mappedOwner] = mappedCounts;
  }
  db.unreadDms = nextUnread;

  const sockets = onlineSockets.get(oldKey);
  if (sockets) {
    onlineSockets.delete(oldKey);
    const existingNew = onlineSockets.get(newKey) ?? new Set();
    for (const s of sockets) {
      existingNew.add(s);
    }
    onlineSockets.set(newKey, existingNew);
  }

  /** @type {Record<string, StoredMessage[]>} */
  const nextDms = {};
  for (const [threadKey, list] of Object.entries(db.dms)) {
    let nextKey = threadKey;
    if (!threadKey.startsWith('group:')) {
      const [u1, u2] = threadKey.split('::');
      if (!u1 || !u2) {
        continue;
      }
      const nu1 = u1 === oldKey ? newKey : u1;
      const nu2 = u2 === oldKey ? newKey : u2;
      nextKey = dmThreadKey(nu1, nu2);
    }
    const mapped = (Array.isArray(list) ? list : []).map((msg) => {
      const nextReactions = {};
      if (msg.reactions && typeof msg.reactions === 'object') {
        for (const [emoji, users] of Object.entries(msg.reactions)) {
          nextReactions[emoji] = Array.from(
            new Set(users.map((u) => (u.toLowerCase() === oldKey ? newKey : u.toLowerCase()))),
          );
        }
      }
      return {
        ...msg,
        authorUsername: msg.authorUsername.toLowerCase() === oldKey ? newKey : msg.authorUsername,
        pinnedBy:
          msg.pinnedBy && msg.pinnedBy.toLowerCase() === oldKey ? newKey : msg.pinnedBy,
        replyTo: msg.replyTo
          ? {
              ...msg.replyTo,
              authorUsername:
                msg.replyTo.authorUsername.toLowerCase() === oldKey
                  ? newKey
                  : msg.replyTo.authorUsername,
            }
          : msg.replyTo,
        reactions: Object.keys(nextReactions).length > 0 ? nextReactions : msg.reactions,
      };
    });
    nextDms[nextKey] = [...(nextDms[nextKey] ?? []), ...mapped];
  }
  db.dms = nextDms;

  /** @type {Record<string, string[]>} */
  const nextOpenDms = {};
  for (const [owner, list] of Object.entries(db.openDms)) {
    const mappedOwner = owner.toLowerCase() === oldKey ? newKey : owner.toLowerCase();
    const mappedList = (Array.isArray(list) ? list : [])
      .map((u) => (u.toLowerCase() === oldKey ? newKey : u.toLowerCase()))
      .filter((u) => u !== mappedOwner);
    nextOpenDms[mappedOwner] = Array.from(new Set(mappedList));
  }
  db.openDms = nextOpenDms;

  for (const group of Object.values(db.groupDms)) {
    if (!group || !Array.isArray(group.members)) {
      continue;
    }
    group.members = Array.from(
      new Set(group.members.map((m) => (m.toLowerCase() === oldKey ? newKey : m.toLowerCase()))),
    );
    if (group.ownerUsername?.toLowerCase() === oldKey) {
      group.ownerUsername = newKey;
    }
  }

  if (db.unreadGroups[oldKey]) {
    db.unreadGroups[newKey] = {
      ...(db.unreadGroups[oldKey] ?? {}),
      ...(db.unreadGroups[newKey] ?? {}),
    };
    delete db.unreadGroups[oldKey];
  }

  for (const meta of Object.values(db.uploads)) {
    if (meta.uploadedBy.toLowerCase() === oldKey) {
      meta.uploadedBy = newKey;
    }
  }

  if (db.favoriteGifs[oldKey]) {
    const prevList = db.favoriteGifs[oldKey];
    const nextList = db.favoriteGifs[newKey] ?? [];
    const seen = new Set(nextList.map((g) => g.url));
    for (const item of prevList) {
      if (!seen.has(item.url)) {
        nextList.push(item);
        seen.add(item.url);
      }
    }
    delete db.favoriteGifs[oldKey];
    db.favoriteGifs[newKey] = nextList;
  }

  for (const entry of db.communityGifs) {
    if (entry.uploadedBy?.toLowerCase() === oldKey) {
      entry.uploadedBy = newKey;
    }
  }
}

/**
 * Normalizes a UGC GIF title safely.
 * @param {unknown} rawTitle
 * @param {string} [fallbackName]
 * @returns {string}
 */
function normalizeGifTitle(rawTitle, fallbackName = 'GIF') {
  const cleanedRaw =
    typeof rawTitle === 'string' ? rawTitle.replace(/\s+/g, ' ').trim() : '';
  if (cleanedRaw) {
    return cleanedRaw.slice(0, 80);
  }
  const fromFile = path
    .basename(String(fallbackName || 'GIF'), path.extname(String(fallbackName || '')))
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (fromFile || 'GIF').slice(0, 80);
}

/**
 * Parses comma- or space-separated tags into normalized lowercase tokens.
 * @param {unknown} rawTags
 * @returns {string[]}
 */
function normalizeGifTags(rawTags) {
  const parts = Array.isArray(rawTags)
    ? rawTags.map((t) => String(t ?? ''))
    : typeof rawTags === 'string'
      ? rawTags.split(/[\s,]+/)
      : [];
  const seen = new Set();
  /** @type {string[]} */
  const tags = [];
  for (const part of parts) {
    const clean = part.replace(/^#+/, '').trim().toLowerCase().slice(0, 30);
    if (!clean || seen.has(clean)) {
      continue;
    }
    seen.add(clean);
    tags.push(clean);
    if (tags.length >= 15) {
      break;
    }
  }
  return tags;
}

/**
 * Validates and normalizes a client-supplied GIF descriptor safely.
 * @param {unknown} raw
 * @returns {StoredGifItem | null}
 */
function sanitizeGifItem(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  const safeUrl =
    url.startsWith('/api/uploads/') || /^https:\/\/[^\s<>"']+$/i.test(url);
  if (!safeUrl || url.length > 500) {
    return null;
  }
  const title = normalizeGifTitle(raw.title);
  const previewRaw = typeof raw.previewUrl === 'string' ? raw.previewUrl.trim() : '';
  const previewUrl =
    previewRaw &&
    (previewRaw.startsWith('/api/uploads/') || /^https:\/\/[^\s<>"']+$/i.test(previewRaw)) &&
    previewRaw.length <= 500
      ? previewRaw
      : undefined;
  const id =
    typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 80) : undefined;
  const tags = raw.tags ? normalizeGifTags(raw.tags) : undefined;
  const uploadedBy =
    typeof raw.uploadedBy === 'string' && raw.uploadedBy.trim()
      ? raw.uploadedBy.trim().toLowerCase().slice(0, 40)
      : undefined;
  const createdAt =
    typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt)
      ? raw.createdAt
      : undefined;
  const width =
    typeof raw.width === 'number' && Number.isInteger(raw.width) && raw.width > 0 && raw.width <= 20000
      ? raw.width
      : undefined;
  const height =
    typeof raw.height === 'number' &&
    Number.isInteger(raw.height) &&
    raw.height > 0 &&
    raw.height <= 20000
      ? raw.height
      : undefined;
  const mediaKind =
    raw.mediaKind === 'video' || raw.mediaKind === 'gif' ? raw.mediaKind : undefined;
  const playbackSpeed =
    typeof raw.playbackSpeed === 'number' &&
    Number.isFinite(raw.playbackSpeed) &&
    raw.playbackSpeed >= 0.25 &&
    raw.playbackSpeed <= 4
      ? Math.round(raw.playbackSpeed * 100) / 100
      : undefined;
  const durationSec =
    typeof raw.durationSec === 'number' &&
    Number.isFinite(raw.durationSec) &&
    raw.durationSec >= 0 &&
    raw.durationSec <= 300
      ? Math.round(raw.durationSec * 10) / 10
      : undefined;
  return {
    id,
    url,
    previewUrl,
    title,
    width,
    height,
    tags,
    uploadedBy,
    createdAt,
    mediaKind,
    playbackSpeed,
    durationSec,
  };
}

/**
 * Reads exact pixel width & height from the 10-byte header of a GIF file.
 * @param {string} filePath
 * @returns {{ width: number; height: number } | null}
 */
function readGifDimensionsFromFile(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(10);
    const bytesRead = fs.readSync(fd, header, 0, 10, 0);
    if (bytesRead < 10) {
      return null;
    }
    const sig = header.toString('ascii', 0, 6);
    if (sig !== 'GIF87a' && sig !== 'GIF89a') {
      return null;
    }
    const width = header.readUInt16LE(6);
    const height = header.readUInt16LE(8);
    if (width < 1 || height < 1 || width > 20000 || height > 20000) {
      return null;
    }
    return { width, height };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // Ignore close error.
      }
    }
  }
}

/**
 * Populates width & height for uploaded GIF items if not already stored.
 * @template {StoredGifItem} T
 * @param {T} item
 * @returns {T}
 */
function ensureGifDimensions(item) {
  if (item.width && item.height) {
    return item;
  }
  const uploadId =
    'uploadId' in item && typeof item.uploadId === 'string' && item.uploadId
      ? item.uploadId
      : typeof item.url === 'string' && item.url.startsWith('/api/uploads/')
        ? item.url.slice('/api/uploads/'.length).split('/')[0]
        : '';
  if (!uploadId) {
    return item;
  }
  const meta = db.uploads[uploadId];
  if (!meta) {
    return item;
  }
  const dims = readGifDimensionsFromFile(path.join(UPLOADS_DIR, meta.diskName));
  if (dims) {
    item.width = dims.width;
    item.height = dims.height;
  }
  return item;
}

/**
 * Checks whether a community GIF's underlying upload file exists on disk (if it's an uploaded asset).
 * @param {StoredCommunityGif} entry
 */
function isCommunityGifAssetIntact(entry) {
  const uploadId =
    typeof entry.uploadId === 'string' && entry.uploadId
      ? entry.uploadId
      : typeof entry.url === 'string' && entry.url.startsWith('/api/uploads/')
        ? entry.url.slice('/api/uploads/'.length).split(/[/?#]/)[0]
        : '';
  if (!uploadId) {
    return Boolean(entry.url);
  }
  const meta = db.uploads[uploadId];
  if (!meta || !meta.diskName) {
    return false;
  }
  return fs.existsSync(path.join(UPLOADS_DIR, meta.diskName));
}

/**
 * Filters the Redshift UGC GIF database by search query, excluding any missing-file entries.
 * @param {string} query
 * @returns {StoredCommunityGif[]}
 */
function searchCommunityGifs(query) {
  const intact = db.communityGifs.filter((entry) => isCommunityGifAssetIntact(entry));
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list =
    tokens.length === 0
      ? intact.slice(0, 200)
      : intact
          .filter((entry) => {
            const haystack = `${entry.title} ${(entry.tags ?? []).join(' ')} ${entry.uploadedBy}`.toLowerCase();
            return tokens.every((tok) => haystack.includes(tok));
          })
          .slice(0, 200);
  return list.map((entry) => ensureGifDimensions(entry));
}

/**
 * Extracts a unique Redshift GIF share code from an embedded/pasted URL like
 * "http://localhost:5173/gif/<code>" or "/gif/<code>".
 * @param {string} rawText
 * @returns {string | null}
 */
function extractGifShareCode(rawText) {
  if (typeof rawText !== 'string') {
    return null;
  }
  const match = rawText.trim().match(/^(?:https?:\/\/[^\s/]+)?\/gif\/([A-Za-z0-9_.-]+)\/?$/);
  return match ? match[1] : null;
}

/**
 * Resolves a unique Redshift GIF share code back into a full StoredGifItem.
 * @param {string} rawCode
 * @returns {StoredGifItem | null}
 */
function resolveGifByCode(rawCode) {
  if (typeof rawCode !== 'string') {
    return null;
  }
  const code = rawCode.trim();
  if (!code || code.length > 120) {
    return null;
  }

  const fromCommunity = db.communityGifs.find((g) => g.id === code || g.uploadId === code);
  if (fromCommunity) {
    return ensureGifDimensions({ ...fromCommunity });
  }

  if (code.startsWith('u_')) {
    const uploadId = code.slice(2);
    const matchedComm = db.communityGifs.find((g) => g.uploadId === uploadId);
    if (matchedComm) {
      return ensureGifDimensions({ ...matchedComm, id: matchedComm.id || code });
    }
    const meta = db.uploads[uploadId];
    if (meta && meta.kind === 'image') {
      const dims = readGifDimensionsFromFile(path.join(UPLOADS_DIR, meta.diskName));
      return {
        id: code,
        url: `/api/uploads/${meta.id}`,
        title: normalizeGifTitle(undefined, meta.name),
        width: dims?.width,
        height: dims?.height,
        uploadedBy: meta.uploadedBy,
        createdAt: meta.createdAt,
      };
    }
  }

  const fromLinks = db.gifLinks[code];
  if (fromLinks) {
    return ensureGifDimensions({ ...fromLinks, id: code });
  }
  return null;
}

/**
 * Resolves an existing deterministic code for a GIF item or registers a persistent link entry.
 * @param {StoredGifItem} gifItem
 * @returns {{ code: string; gif: StoredGifItem; created: boolean }}
 */
function getOrMintGifShareCode(gifItem) {
  const byId = gifItem.id ? resolveGifByCode(gifItem.id) : null;
  if (byId && byId.url === gifItem.url) {
    return { code: gifItem.id, gif: byId, created: false };
  }

  const commByUrl = db.communityGifs.find((g) => g.url === gifItem.url);
  if (commByUrl) {
    return { code: commByUrl.id, gif: ensureGifDimensions({ ...commByUrl }), created: false };
  }

  if (gifItem.url.startsWith('/api/uploads/')) {
    const uploadId = gifItem.url.slice('/api/uploads/'.length).split('/')[0];
    if (uploadId && db.uploads[uploadId]) {
      const uCode = `u_${uploadId}`;
      const enriched = ensureGifDimensions({ ...gifItem, id: uCode });
      return { code: uCode, gif: enriched, created: false };
    }
  }

  const hash = crypto.createHash('sha256').update(gifItem.url).digest('hex').slice(0, 12);
  const gCode = `g_${hash}`;
  if (db.gifLinks[gCode]) {
    return { code: gCode, gif: ensureGifDimensions({ ...db.gifLinks[gCode], id: gCode }), created: false };
  }
  const stored = ensureGifDimensions({ ...gifItem, id: gCode });
  db.gifLinks[gCode] = stored;
  return { code: gCode, gif: stored, created: true };
}

/** @param {string} rawName */
function sanitizeUploadFileName(rawName) {
  const base = path.basename(String(rawName || 'attachment'))
    .replace(/[\x00-\x1f<>:"/\\|?*]+/g, '_')
    .trim();
  if (!base) {
    return 'attachment';
  }
  return base.slice(0, 180);
}

/**
 * @param {string} rawMime
 * @param {string} filename
 * @returns {{ mime: string; kind: 'image' | 'video' | 'audio' | 'file' }}
 */
function classifyUpload(rawMime, filename) {
  const ext = path.extname(filename).toLowerCase();
  const cleanMime = String(rawMime || '').split(';')[0].trim().toLowerCase();

  const imageExtMime = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.avif': 'image/avif',
  };
  if (imageExtMime[ext] || (cleanMime.startsWith('image/') && cleanMime !== 'image/svg+xml' && ext !== '.svg')) {
    return {
      mime: imageExtMime[ext] ?? (cleanMime || 'image/png'),
      kind: 'image',
    };
  }

  const audioExtMime = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/opus',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.weba': 'audio/webm',
  };
  if (audioExtMime[ext] || cleanMime.startsWith('audio/')) {
    return {
      mime: audioExtMime[ext] ?? (cleanMime || 'audio/mpeg'),
      kind: 'audio',
    };
  }

  const videoExtMime = {
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.webm': 'video/webm',
    '.ogv': 'video/ogg',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
  };
  if (videoExtMime[ext] || cleanMime.startsWith('video/')) {
    return {
      mime: videoExtMime[ext] ?? (cleanMime || 'video/mp4'),
      kind: 'video',
    };
  }

  return {
    mime: 'application/octet-stream',
    kind: 'file',
  };
}

/** @param {string[]} candidateIds */
function collectReferencedUploadIds() {
  const addUploadUrlRef = (url, set) => {
    if (typeof url === 'string' && url.startsWith('/api/uploads/')) {
      const id = url.slice('/api/uploads/'.length).split(/[/?#]/)[0];
      if (id) {
        set.add(id);
      }
    }
  };

  const stillReferenced = new Set();
  for (const threadList of Object.values(db.dms)) {
    if (!Array.isArray(threadList)) {
      continue;
    }
    for (const msg of threadList) {
      if (Array.isArray(msg.attachmentIds)) {
        for (const id of msg.attachmentIds) {
          stillReferenced.add(id);
        }
      }
      if (msg.gif?.url) {
        addUploadUrlRef(msg.gif.url, stillReferenced);
      }
    }
  }

  for (const entry of db.communityGifs) {
    if (entry.uploadId) {
      stillReferenced.add(entry.uploadId);
    }
    addUploadUrlRef(entry.url, stillReferenced);
  }

  for (const favList of Object.values(db.favoriteGifs)) {
    if (!Array.isArray(favList)) {
      continue;
    }
    for (const fav of favList) {
      addUploadUrlRef(fav?.url, stillReferenced);
    }
  }

  return stillReferenced;
}

function cleanupOrphanedUploads(candidateIds) {
  if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
    return false;
  }
  const stillReferenced = collectReferencedUploadIds();

  let changed = false;
  for (const id of candidateIds) {
    if (stillReferenced.has(id)) {
      continue;
    }
    const meta = db.uploads[id];
    if (!meta) {
      continue;
    }
    try {
      const targetPath = path.join(UPLOADS_DIR, meta.diskName);
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      const wavSidecarPath = `${targetPath}.pcm.wav`;
      if (fs.existsSync(wavSidecarPath)) {
        fs.unlinkSync(wavSidecarPath);
      }
    } catch {
      // Ignore missing files on disk cleanup.
    }
    delete db.uploads[id];
    changed = true;
  }
  return changed;
}

function sweepStaleOrphanedUploads(minAgeMs = 10 * 60 * 1000) {
  // Never blindly unlink unknown files on disk from a background interval: another local process
  // (such as a dev server or test runner) could have written uploads to UPLOADS_DIR after this
  // process booted. Only ever clean explicitly unreferenced DB entries via cleanupOrphanedUploads.
  const now = Date.now();
  const stillReferenced = collectReferencedUploadIds();
  const staleIds = [];
  for (const [id, meta] of Object.entries(db.uploads)) {
    if (stillReferenced.has(id)) {
      continue;
    }
    const createdAt = Number(meta?.createdAt) || 0;
    if (now - createdAt >= minAgeMs) {
      staleIds.push(id);
    }
  }
  let removed = 0;
  if (staleIds.length > 0 && cleanupOrphanedUploads(staleIds)) {
    removed += staleIds.length;
    saveDb(db);
  }
  return removed;
}

// Run a non-blocking stale-upload sweep on startup and once per hour.
setTimeout(() => {
  sweepStaleOrphanedUploads(10 * 60 * 1000);
}, 2000).unref();
setInterval(() => {
  sweepStaleOrphanedUploads(10 * 60 * 1000);
}, 60 * 60 * 1000).unref();

/**
 * Streams a raw binary upload up to MAX_UPLOAD_BYTES directly to disk.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {StoredAccount} activeUser
 */
function handleStreamingUpload(req, res, activeUser) {
  req.setTimeout?.(0);
  const declaredLength = Number(req.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
    req.resume();
    sendJson(res, 413, { ok: false, error: 'Error: File exceeds the 1 GB attachment limit' });
    return;
  }

  const rawHeaderName =
    typeof req.headers['x-file-name'] === 'string' ? req.headers['x-file-name'] : '';
  let decodedName = 'attachment';
  try {
    decodedName = rawHeaderName ? decodeURIComponent(rawHeaderName) : 'attachment';
  } catch {
    decodedName = rawHeaderName || 'attachment';
  }
  const safeName = sanitizeUploadFileName(decodedName);
  const rawHeaderMime =
    typeof req.headers['x-file-mime'] === 'string'
      ? req.headers['x-file-mime']
      : String(req.headers['content-type'] ?? '');
  const classified = classifyUpload(rawHeaderMime, safeName);

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const id = crypto.randomUUID();
  const safeExt = path.extname(safeName).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12);
  const diskName = `${id}${safeExt}`;
  const filePath = path.join(UPLOADS_DIR, diskName);

  const ws = fs.createWriteStream(filePath);
  let totalBytes = 0;
  let aborted = false;

  const abortWithCleanup = (statusCode, errorMsg) => {
    if (aborted) {
      return;
    }
    aborted = true;
    ws.destroy();
    fs.unlink(filePath, () => {});
    if (statusCode && !res.writableEnded) {
      sendJson(res, statusCode, { ok: false, error: errorMsg });
    }
  };

  req.on('aborted', () => abortWithCleanup(0, ''));
  req.on('error', () => abortWithCleanup(500, 'Error: Upload stream failed'));
  ws.on('error', () => abortWithCleanup(500, 'Error: Could not write uploaded file'));
  ws.on('drain', () => req.resume());

  req.on('data', (chunk) => {
    if (aborted) {
      return;
    }
    totalBytes += chunk.length;
    if (totalBytes > MAX_UPLOAD_BYTES) {
      req.pause();
      abortWithCleanup(413, 'Error: File exceeds the 1 GB attachment limit');
      return;
    }
    if (!ws.write(chunk)) {
      req.pause();
    }
  });

  req.on('end', () => {
    if (aborted) {
      return;
    }
    ws.end(() => {
      if (aborted) {
        return;
      }
      /** @type {StoredUploadMeta} */
      const meta = {
        id,
        diskName,
        name: safeName,
        mime: classified.mime,
        size: totalBytes,
        kind: classified.kind,
        uploadedBy: activeUser.username.toLowerCase(),
        createdAt: Date.now(),
      };
      db.uploads[id] = meta;
      saveDb(db);
      if (meta.kind === 'video' && meta.mime !== 'video/webm') {
        void ensureWebmVideoFallbackFile(id, filePath);
      }
      sendJson(res, 200, {
        ok: true,
        attachment: toClientAttachment(meta),
      });
    });
  });
}

/** @type {Map<string, Promise<string | null>>} */
const wavTranscodeJobs = new Map();

/** @type {Map<string, Promise<string | null>>} */
const webmVideoTranscodeJobs = new Map();

const MAX_GIF_DURATION_SEC = 300; // 5 minutes max for GIF media

/**
 * Probes media file duration and dimensions via ffprobe.
 * @param {string} filePath
 * @returns {Promise<{ durationSec: number | null; width?: number; height?: number; hasVideo: boolean; hasAudio: boolean }>}
 */
function probeMediaMeta(filePath) {
  return new Promise((resolve) => {
    execFile(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration:stream=codec_type,width,height',
        '-of',
        'json',
        filePath,
      ],
      { timeout: 15000 },
      (err, stdout) => {
        if (err || !stdout) {
          resolve({ durationSec: null, hasVideo: false, hasAudio: false });
          return;
        }
        try {
          const parsed = JSON.parse(String(stdout));
          const rawDurVal = parsed?.format?.duration;
          const rawDur =
            rawDurVal !== null && rawDurVal !== undefined && String(rawDurVal).trim() !== ''
              ? Number(rawDurVal)
              : NaN;
          const durationSec = Number.isFinite(rawDur) && rawDur > 0 ? rawDur : null;
          const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
          let hasVideo = false;
          let hasAudio = false;
          let width;
          let height;
          for (const st of streams) {
            if (st?.codec_type === 'video') {
              hasVideo = true;
              if (!width && Number.isInteger(st.width) && st.width > 0) width = st.width;
              if (!height && Number.isInteger(st.height) && st.height > 0) height = st.height;
            } else if (st?.codec_type === 'audio') {
              hasAudio = true;
            }
          }
          resolve({ durationSec, width, height, hasVideo, hasAudio });
        } catch {
          resolve({ durationSec: null, hasVideo: false, hasAudio: false });
        }
      },
    );
  });
}

/**
 * Losslessly scales frame delays in a GIF87a/GIF89a binary by `playbackSpeed`.
 * Walks blocks accurately so image data bytes are never corrupted.
 * @param {string} srcPath
 * @param {string} dstPath
 * @param {number} playbackSpeed
 * @returns {boolean}
 */
function scaleGifFileSpeed(srcPath, dstPath, playbackSpeed) {
  try {
    const raw = fs.readFileSync(srcPath);
    if (raw.length < 14) return false;
    const sig = raw.toString('ascii', 0, 6);
    if (sig !== 'GIF87a' && sig !== 'GIF89a') return false;
    const out = Buffer.from(raw);
    let pos = 10;
    const lsdPacked = out[pos];
    pos += 3;
    if (lsdPacked & 0x80) {
      const gctSize = 3 * (1 << ((lsdPacked & 0x07) + 1));
      pos += gctSize;
    }

    const skipSubBlocks = () => {
      while (pos < out.length) {
        const len = out[pos++];
        if (len === 0) break;
        pos += len;
      }
    };

    let patchedFrames = 0;
    while (pos < out.length) {
      const intro = out[pos++];
      if (intro === 0x3b) break; // GIF Trailer
      if (intro === 0x21) {
        if (pos >= out.length) break;
        const label = out[pos++];
        if (label === 0xf9 && pos + 5 < out.length && out[pos] === 0x04) {
          // Graphic Control Extension: [blockSize=4, packed, delayLo, delayHi, transIdx, 0x00]
          const delayPos = pos + 2;
          const origDelay = out.readUInt16LE(delayPos);
          const effectiveOrig = origDelay > 0 ? origDelay : 10;
          const scaled = Math.max(2, Math.min(65535, Math.round(effectiveOrig / playbackSpeed)));
          out.writeUInt16LE(scaled, delayPos);
          patchedFrames += 1;
          pos += 6;
        } else {
          skipSubBlocks();
        }
      } else if (intro === 0x2c) {
        // Image Descriptor (9 bytes after separator)
        if (pos + 9 >= out.length) break;
        const imgPacked = out[pos + 8];
        pos += 9;
        if (imgPacked & 0x80) {
          pos += 3 * (1 << ((imgPacked & 0x07) + 1));
        }
        pos += 1; // LZW minimum code size
        skipSubBlocks();
      } else {
        break;
      }
    }

    if (patchedFrames === 0) return false;
    fs.writeFileSync(dstPath, out);
    return true;
  } catch {
    return false;
  }
}

/**
 * Converts a video or audio file into an Electron-compatible looping VP8 WebM clip
 * for Redshift's GIF library (capped at 5 minutes, with playbackSpeed baked in).
 * @param {string} srcPath
 * @param {string} dstPath
 * @param {{ playbackSpeed: number; isAudioOnly: boolean }} opts
 * @returns {Promise<boolean>}
 */
function convertMediaToLoopingGifWebm(srcPath, dstPath, opts) {
  const speed = Math.min(4, Math.max(0.25, Number(opts.playbackSpeed) || 1));
  const ptsFactor = (1 / speed).toFixed(4);
  const tmpPath = `${dstPath}.tmp.webm`;
  const args = opts.isAudioOnly
    ? [
        '-y',
        '-t',
        String(MAX_GIF_DURATION_SEC),
        '-i',
        srcPath,
        '-filter_complex',
        `[0:a]showwaves=s=480x180:mode=line:rate=24,setpts=${ptsFactor}*PTS[v]`,
        '-map',
        '[v]',
        '-an',
        '-c:v',
        'libvpx',
        '-deadline',
        'realtime',
        '-cpu-used',
        '6',
        '-b:v',
        '900k',
        '-f',
        'webm',
        tmpPath,
      ]
    : [
        '-y',
        '-t',
        String(MAX_GIF_DURATION_SEC),
        '-i',
        srcPath,
        '-vf',
        `setpts=${ptsFactor}*PTS,scale='min(480,iw)':-2`,
        '-an',
        '-c:v',
        'libvpx',
        '-deadline',
        'realtime',
        '-cpu-used',
        '6',
        '-b:v',
        '1200k',
        '-f',
        'webm',
        tmpPath,
      ];

  return new Promise((resolve) => {
    execFile('ffmpeg', args, { timeout: 120000 }, (err) => {
      if (err) {
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {}
        resolve(false);
        return;
      }
      try {
        fs.renameSync(tmpPath, dstPath);
        resolve(true);
      } catch {
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {}
        resolve(false);
      }
    });
  });
}

/**
 * Lazily transcodes uploaded non-WebM videos (.mp4/.mov/.mkv/etc.) into a cached
 * VP8 + Opus WebM sidecar so Electron clients (which lack proprietary H.264/AAC
 * decoders) play every video embed smoothly without freezing or stalling.
 * @param {string} uploadId
 * @param {string} srcFilePath
 * @returns {Promise<string | null>}
 */
function ensureWebmVideoFallbackFile(uploadId, srcFilePath) {
  const webmPath = `${srcFilePath}.compat.webm`;
  if (fs.existsSync(webmPath)) {
    return Promise.resolve(webmPath);
  }
  const existing = webmVideoTranscodeJobs.get(uploadId);
  if (existing) {
    return existing;
  }
  const job = new Promise((resolve) => {
    const tmpPath = `${srcFilePath}.compat.tmp.webm`;
    execFile(
      'ffmpeg',
      [
        '-y',
        '-i',
        srcFilePath,
        '-vf',
        "scale='min(1280,iw)':-2",
        '-c:v',
        'libvpx',
        '-deadline',
        'realtime',
        '-cpu-used',
        '6',
        '-b:v',
        '2000k',
        '-c:a',
        'libopus',
        '-b:a',
        '128k',
        '-f',
        'webm',
        tmpPath,
      ],
      { timeout: 180000 },
      (err) => {
        if (err) {
          try {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
          } catch {}
          resolve(null);
          return;
        }
        try {
          fs.renameSync(tmpPath, webmPath);
          resolve(webmPath);
        } catch {
          try {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
          } catch {}
          resolve(null);
        }
      },
    );
  }).finally(() => {
    if (webmVideoTranscodeJobs.get(uploadId) === job) {
      webmVideoTranscodeJobs.delete(uploadId);
    }
  });
  webmVideoTranscodeJobs.set(uploadId, job);
  return job;
}

/**
 * Lazily transcodes non-WAV audio/webm uploads into a cached 24kHz mono PCM WAV sidecar
 * so browsers whose WebM/Opus decoder fails can still play legacy voice notes seamlessly.
 * @param {string} uploadId
 * @param {string} srcFilePath
 * @returns {Promise<string | null>}
 */
function ensureWavFallbackFile(uploadId, srcFilePath) {
  const wavPath = `${srcFilePath}.pcm.wav`;
  if (fs.existsSync(wavPath)) {
    return Promise.resolve(wavPath);
  }
  const existing = wavTranscodeJobs.get(uploadId);
  if (existing) {
    return existing;
  }
  const job = new Promise((resolve) => {
    const tmpPath = `${srcFilePath}.pcm.tmp.wav`;
    execFile(
      'ffmpeg',
      ['-y', '-i', srcFilePath, '-ar', '24000', '-ac', '1', '-f', 'wav', tmpPath],
      { timeout: 15000 },
      (err) => {
        if (err) {
          try {
            if (fs.existsSync(tmpPath)) {
              fs.unlinkSync(tmpPath);
            }
          } catch {
            // Ignore temp cleanup error.
          }
          resolve(null);
          return;
        }
        try {
          fs.renameSync(tmpPath, wavPath);
          resolve(wavPath);
        } catch {
          try {
            if (fs.existsSync(tmpPath)) {
              fs.unlinkSync(tmpPath);
            }
          } catch {
            // Ignore temp cleanup error.
          }
          resolve(null);
        }
      },
    );
  }).finally(() => {
    if (wavTranscodeJobs.get(uploadId) === job) {
      wavTranscodeJobs.delete(uploadId);
    }
  });
  wavTranscodeJobs.set(uploadId, job);
  return job;
}

/**
 * Serves uploaded attachments with HTTP Range support for video/audio seeking.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} reqPath
 */
async function handleServeUpload(req, res, reqPath) {
  const uploadId = reqPath.slice('/api/uploads/'.length).split('/')[0];
  if (!/^[0-9a-f-]{36}$/i.test(uploadId)) {
    sendJson(res, 404, { ok: false, error: 'Error: Attachment not found' });
    return;
  }

  const meta = db.uploads[uploadId];
  if (!meta) {
    sendJson(res, 404, { ok: false, error: 'Error: Attachment not found' });
    return;
  }

  let filePath = path.join(UPLOADS_DIR, meta.diskName);
  let serveMime = meta.mime;
  let serveName = meta.name;

  const parsedUrl = new URL(req.url ?? '/', 'http://localhost');
  const requestedFormat = parsedUrl.searchParams.get('format');
  const wantsWavFallback = requestedFormat === 'wav';
  const wantsWebmFallback = requestedFormat === 'webm';
  if (wantsWavFallback && (meta.kind === 'audio' || meta.kind === 'video') && meta.mime !== 'audio/wav') {
    const convertedPath = await ensureWavFallbackFile(uploadId, filePath);
    if (convertedPath) {
      filePath = convertedPath;
      serveMime = 'audio/wav';
      serveName = meta.name.replace(/\.[^.]+$/, '') + '.wav';
    }
  } else if (wantsWebmFallback && meta.kind === 'video' && meta.mime !== 'video/webm') {
    const convertedPath = await ensureWebmVideoFallbackFile(uploadId, filePath);
    if (convertedPath) {
      filePath = convertedPath;
      serveMime = 'video/webm';
      serveName = meta.name.replace(/\.[^.]+$/, '') + '.webm';
    }
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    sendJson(res, 404, { ok: false, error: 'Error: Attachment file missing' });
    return;
  }

  const forceDownload = parsedUrl.searchParams.get('download') === '1' || meta.kind === 'file';
  const safeAsciiName = serveName.replace(/["\\]/g, '_');
  const encodedName = encodeURIComponent(serveName);
  const disposition = forceDownload ? 'attachment' : 'inline';

  const baseHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
    'Content-Type': forceDownload ? 'application/octet-stream' : serveMime,
    'Content-Disposition': `${disposition}; filename="${safeAsciiName}"; filename*=UTF-8''${encodedName}`,
  };

  const fileSize = stat.size;
  const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : '';

  if (rangeHeader && fileSize > 0) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
    if (!match) {
      res.writeHead(416, { ...baseHeaders, 'Content-Range': `bytes */${fileSize}` });
      res.end();
      return;
    }

    const startRaw = match[1];
    const endRaw = match[2];
    let start = startRaw ? Number(startRaw) : 0;
    let end = endRaw ? Number(endRaw) : fileSize - 1;
    if (!startRaw && endRaw) {
      const suffixLen = Number(endRaw);
      start = Math.max(0, fileSize - suffixLen);
      end = fileSize - 1;
    }
    // Cap open-ended video/audio range requests to 2 MB chunks so reverse proxies (Cloudflare Tunnel)
    // stream smoothly without buffering/stalling entire large video files on a single request.
    if (!endRaw && (meta.kind === 'video' || meta.kind === 'audio')) {
      const STREAM_CHUNK_BYTES = 2 * 1024 * 1024;
      end = Math.min(fileSize - 1, start + STREAM_CHUNK_BYTES - 1);
    }
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      start >= fileSize ||
      end < start
    ) {
      res.writeHead(416, { ...baseHeaders, 'Content-Range': `bytes */${fileSize}` });
      res.end();
      return;
    }
    end = Math.min(end, fileSize - 1);

    res.writeHead(206, {
      ...baseHeaders,
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Length': String(end - start + 1),
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath, { start, end });
    res.on('close', () => stream.destroy());
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500);
      }
      res.end();
    });
    stream.pipe(res);
    return;
  }

  res.writeHead(200, {
    ...baseHeaders,
    'Content-Length': String(fileSize),
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const stream = fs.createReadStream(filePath);
  res.on('close', () => stream.destroy());
  stream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(500);
    }
    res.end();
  });
  stream.pipe(res);
}

export function createRedshiftServerMiddleware() {
  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {() => void} next
   */
  return async (req, res, next) => {
    const reqPath = (req.url ?? '').split('?')[0];
    if ((req.method === 'GET' || req.method === 'HEAD') && reqPath.startsWith('/gif/')) {
      const code = decodeURIComponent(reqPath.slice('/gif/'.length).replace(/\/+$/, ''));
      const resolved = code ? resolveGifByCode(code) : null;
      if (resolved && resolved.url) {
        res.writeHead(302, {
          Location: resolved.url,
          'Cache-Control': 'no-store',
        });
        res.end();
        return;
      }
    }
    if (!reqPath.startsWith('/api/')) {
      next();
      return;
    }

    extractPublicOriginFromReq(req);

    // Allow Electron desktop clients connecting to a remote self-hosted Redshift server.
    const reqOrigin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    res.setHeader('Access-Control-Allow-Origin', reqOrigin || '*');
    if (reqOrigin) {
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, X-File-Name, X-File-Mime',
    );
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Date');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Content-hashed cached binary endpoints for user avatars, banners, and group icons
    // (eliminates multi-MB inline base64 payloads from JSON snapshots and WebSocket frames).
    if ((req.method === 'GET' || req.method === 'HEAD') && reqPath.startsWith('/api/media/')) {
      const rest = reqPath.slice('/api/media/'.length);
      const slashIdx = rest.indexOf('/');
      const kind = slashIdx > 0 ? rest.slice(0, slashIdx) : '';
      const rawId = slashIdx > 0 ? rest.slice(slashIdx + 1).split('/')[0] : '';
      let targetId = '';
      try {
        targetId = decodeURIComponent(rawId);
      } catch {
        targetId = rawId;
      }
      let rawDataUrl;
      if (kind === 'avatar' && targetId) {
        const acc = findAccountByUsername(targetId);
        rawDataUrl = acc && acc.avatarPreset === null ? acc.avatarDataUrl : undefined;
      } else if (kind === 'banner' && targetId) {
        const acc = findAccountByUsername(targetId);
        rawDataUrl = acc?.bannerDataUrl;
      } else if (kind === 'group-icon' && targetId) {
        const grp = db.groupDms[targetId];
        rawDataUrl = grp?.iconDataUrl;
      }
      const parsed = rawDataUrl ? parseImageDataUrl(rawDataUrl) : null;
      if (!parsed) {
        res.writeHead(404, { 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': parsed.mime,
        'Content-Length': String(parsed.buf.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'X-Content-Type-Options': 'nosniff',
        ETag: `"${parsed.hash}"`,
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      res.end(parsed.buf);
      return;
    }

    // Server health & online status endpoint (used by Desktop client server switcher & cloud hosts)
    if ((req.method === 'GET' || req.method === 'HEAD') && reqPath === '/api/health') {
      let pkgVersion = '0.1.0';
      try {
        const pkgJson = JSON.parse(
          fs.readFileSync(path.resolve(REDSHIFT_SERVER_DIR, '..', 'package.json'), 'utf8'),
        );
        if (pkgJson && typeof pkgJson.version === 'string') {
          pkgVersion = pkgJson.version;
        }
      } catch {
        // Ignore version read errors.
      }
      sendJson(res, 200, {
        ok: true,
        service: 'redshift',
        version: pkgVersion,
        onlineUsers: onlineSockets.size,
        uptimeSec: Math.floor(process.uptime()),
        wsReady: true,
        serverTime: Date.now(),
      });
      return;
    }

    if (req.method === 'GET' && reqPath === '/api/push/public-key') {
      const publicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim();
      const privateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim();
      sendJson(res, 200, {
        ok: true,
        configured: Boolean(publicKey && privateKey),
        publicKey,
      });
      return;
    }

    // Loopback-Only Real-Time Moderator / Admin Authority Endpoints (127.0.0.1 only)
    if (reqPath.startsWith('/api/admin/')) {
      if (!isLoopbackRequest(req)) {
        sendJson(res, 403, {
          ok: false,
          error: 'Forbidden: Moderator endpoints are restricted to the host machine (127.0.0.1)',
        });
        return;
      }

      if (req.method === 'GET' && reqPath === '/api/admin/accounts') {
        const accounts = db.accounts.map((acc) => {
          const uKey = acc.username.toLowerCase();
          const activeSessions = Object.values(db.sessions).filter((v) => v === uKey).length;
          return {
            username: acc.username,
            displayName: acc.displayName,
            email: acc.email,
            bio: acc.bio || '',
            status: acc.status || 'online',
            online: isUserSocketOnline(acc.username),
            createdAt: acc.createdAt,
            friends: db.friendships[uKey] ?? [],
            activeSessions,
          };
        });
        sendJson(res, 200, { ok: true, total: accounts.length, accounts });
        return;
      }

      if (req.method === 'POST' && reqPath === '/api/admin/accounts/update') {
        const body = await readJsonBody(req, res);
        if (!body) return;
        const targetUsername = typeof body.username === 'string' ? body.username.trim() : '';
        const account = targetUsername ? findAccountByUsername(targetUsername) : undefined;
        if (!account) {
          sendJson(res, 404, { ok: false, error: 'Account not found' });
          return;
        }
        if (typeof body.displayName === 'string' && body.displayName.trim()) {
          account.displayName = body.displayName.trim().slice(0, 32);
        }
        if (typeof body.email === 'string' && EMAIL_REGEX.test(body.email.trim())) {
          account.email = body.email.trim().toLowerCase();
        }
        if (typeof body.newPassword === 'string' && body.newPassword.length >= 6) {
          account.passwordHash = hashPassword(body.newPassword);
        }
        if (typeof body.bio === 'string') {
          account.bio = body.bio.slice(0, 300);
        }
        if (typeof body.status === 'string' && VALID_STATUSES.has(body.status)) {
          account.status = /** @type {UserStatus} */ (body.status);
        }
        if (typeof body.avatarPreset === 'number') {
          account.avatarPreset = body.avatarPreset;
          delete account.avatarDataUrl;
        }
        if (typeof body.bannerColor === 'string' && HEX_COLOR_REGEX.test(body.bannerColor)) {
          account.bannerColor = body.bannerColor;
        }
        saveDb(db);
        notifyRelatedPeers(account.username, true);
        sendJson(res, 200, {
          ok: true,
          account: {
            username: account.username,
            displayName: account.displayName,
            email: account.email,
            bio: account.bio,
            status: account.status,
          },
        });
        return;
      }

      if (req.method === 'POST' && reqPath === '/api/admin/accounts/kick') {
        const body = await readJsonBody(req, res);
        if (!body) return;
        const targetUsername = typeof body.username === 'string' ? body.username.trim() : '';
        const uKey = targetUsername.toLowerCase();
        const account = uKey ? findAccountByUsername(uKey) : undefined;
        if (!account) {
          sendJson(res, 404, { ok: false, error: 'Account not found' });
          return;
        }
        let revokedSessions = 0;
        for (const [tok, ownerKey] of Object.entries(db.sessions)) {
          if (ownerKey === uKey) {
            delete db.sessions[tok];
            revokedSessions += 1;
          }
        }
        saveDb(db);
        const sockets = onlineSockets.get(uKey);
        let closedSockets = 0;
        if (sockets) {
          for (const ws of Array.from(sockets)) {
            try {
              ws.close(4001, 'Session terminated by moderator');
              closedSockets += 1;
            } catch {}
          }
          onlineSockets.delete(uKey);
        }
        lastSeenByUser.delete(uKey);
        notifyRelatedPeers(uKey, false);
        sendJson(res, 200, { ok: true, username: account.username, revokedSessions, closedSockets });
        return;
      }

      if (req.method === 'POST' && reqPath === '/api/admin/accounts/delete') {
        const body = await readJsonBody(req, res);
        if (!body) return;
        const targetUsername = typeof body.username === 'string' ? body.username.trim() : '';
        const uKey = targetUsername.toLowerCase();
        const idx = db.accounts.findIndex((a) => a.username.toLowerCase() === uKey);
        if (idx === -1) {
          sendJson(res, 404, { ok: false, error: 'Account not found' });
          return;
        }
        const [removedAcc] = db.accounts.splice(idx, 1);

        // Revoke all sessions
        for (const [tok, ownerKey] of Object.entries(db.sessions)) {
          if (ownerKey === uKey) {
            delete db.sessions[tok];
          }
        }

        // Disconnect live WebSockets
        const sockets = onlineSockets.get(uKey);
        if (sockets) {
          for (const ws of Array.from(sockets)) {
            try {
              ws.close(4002, 'Account deleted by moderator');
            } catch {}
          }
          onlineSockets.delete(uKey);
        }
        lastSeenByUser.delete(uKey);

        // Remove from friendships, blocks, requests, openDms, and groupDms
        delete db.friendships[uKey];
        for (const [k, list] of Object.entries(db.friendships)) {
          if (Array.isArray(list)) {
            db.friendships[k] = list.filter((f) => f.toLowerCase() !== uKey);
          }
        }
        delete db.blocks[uKey];
        for (const [k, list] of Object.entries(db.blocks)) {
          if (Array.isArray(list)) {
            db.blocks[k] = list.filter((b) => b.toLowerCase() !== uKey);
          }
        }
        db.friendRequests = db.friendRequests.filter(
          (r) => r.from.toLowerCase() !== uKey && r.to.toLowerCase() !== uKey,
        );
        delete db.openDms[uKey];
        for (const [k, list] of Object.entries(db.openDms)) {
          if (Array.isArray(list)) {
            db.openDms[k] = list.filter((u) => u.toLowerCase() !== uKey);
          }
        }
        for (const [gid, grp] of Object.entries(db.groupDms)) {
          if (grp && Array.isArray(grp.members)) {
            grp.members = grp.members.filter((m) => m.toLowerCase() !== uKey);
            if (grp.members.length === 0) {
              delete db.groupDms[gid];
            } else if (grp.ownerUsername && grp.ownerUsername.toLowerCase() === uKey) {
              grp.ownerUsername = grp.members[0];
            }
          }
        }

        saveDb(db);
        for (const other of db.accounts) {
          pushSnapshotToUser(other.username.toLowerCase());
        }
        sendJson(res, 200, { ok: true, deletedUsername: removedAcc.username });
        return;
      }
    }

    // Desktop Launcher Auto-Updater endpoints (fallback when GitHub Releases isn't configured)
    if ((req.method === 'GET' || req.method === 'HEAD') && reqPath === '/api/desktop/version.json') {
      const manifestPath = path.join(REDSHIFT_UPDATES_DIR, 'version.json');
      if (!fs.existsSync(manifestPath)) {
        sendJson(res, 404, { ok: false, error: 'No desktop update manifest published on this server' });
        return;
      }
      try {
        const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const payload = {
          ...parsed,
          asarUrl: fs.existsSync(path.join(REDSHIFT_UPDATES_DIR, 'Redshift-patch.asar'))
            ? '/api/desktop/patch.asar'
            : parsed.asarUrl,
        };
        sendJson(res, 200, payload);
      } catch {
        sendJson(res, 500, { ok: false, error: 'Invalid desktop update manifest' });
      }
      return;
    }

    if ((req.method === 'GET' || req.method === 'HEAD') && reqPath === '/api/desktop/patch.asar') {
      const patchPath = path.join(REDSHIFT_UPDATES_DIR, 'Redshift-patch.asar');
      if (!fs.existsSync(patchPath)) {
        sendJson(res, 404, { ok: false, error: 'Desktop patch package not found' });
        return;
      }
      const stat = fs.statSync(patchPath);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(stat.size),
        'Cache-Control': 'no-store',
        'Content-Disposition': 'attachment; filename="Redshift-patch.asar"',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      const stream = fs.createReadStream(patchPath);
      res.on('close', () => stream.destroy());
      stream.pipe(res);
      return;
    }

    // Stream binary uploads up to 1 GB before touching JSON body parser.
    if (req.method === 'POST' && reqPath === '/api/uploads') {
      const uploader = authenticateRequest(req);
      if (!uploader) {
        req.resume();
        sendJson(res, 401, { ok: false, error: 'Error: Session expired — please sign in again' });
        return;
      }
      const upLimit = rateLimiter.check(
        `upload:${uploader.username.toLowerCase()}`,
        60,
        60_000,
      );
      if (!upLimit.ok) {
        req.resume();
        res.setHeader('Retry-After', String(upLimit.retryAfterSec));
        sendJson(res, 429, {
          ok: false,
          error: `Error: Upload rate limit reached. Try again in ${upLimit.retryAfterSec}s`,
        });
        return;
      }
      handleStreamingUpload(req, res, uploader);
      return;
    }

    // Stream uploaded images/video/audio/files with Range request support.
    if ((req.method === 'GET' || req.method === 'HEAD') && reqPath.startsWith('/api/uploads/')) {
      await handleServeUpload(req, res, reqPath);
      return;
    }

    let body = {};
    if (req.method === 'POST') {
      try {
        body = await readJsonBody(req, MAX_JSON_BYTES);
      } catch (err) {
        if (err instanceof Error && err.message === 'PAYLOAD_TOO_LARGE') {
          sendJson(res, 413, { ok: false, error: 'Error: Payload too large' });
          return;
        }
        sendJson(res, 400, { ok: false, error: 'Error: Invalid request body' });
        return;
      }
    }

    if (
      req.method === 'POST' &&
      (reqPath === '/api/auth/signin' ||
        reqPath === '/api/auth/signup' ||
        reqPath === '/api/forgot-password' ||
        reqPath === '/api/verify-reset-code')
    ) {
      const ip = getRequestClientIp(req);
      const authLimit = rateLimiter.check(`auth:${reqPath}:${ip}`, AUTH_RATE_LIMIT, 60_000);
      if (!authLimit.ok) {
        res.setHeader('Retry-After', String(authLimit.retryAfterSec));
        sendJson(res, 429, {
          ok: false,
          error: `Error: Too many attempts. Please wait ${authLimit.retryAfterSec}s and try again`,
        });
        return;
      }
    }

    // Auth: Sign in
    if (req.method === 'POST' && reqPath === '/api/auth/signin') {
      const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';

      if (!identifier && !password) {
        sendJson(res, 400, { ok: false, error: 'Error: Enter your username/email and password' });
        return;
      }
      if (!identifier) {
        sendJson(res, 400, { ok: false, error: 'Error: Username or email is required' });
        return;
      }
      if (!password) {
        sendJson(res, 400, { ok: false, error: 'Error: Password is required' });
        return;
      }

      const looksLikeEmail = identifier.includes('@');
      if (looksLikeEmail && !EMAIL_REGEX.test(identifier)) {
        sendJson(res, 400, { ok: false, error: 'Error: Invalid email format' });
        return;
      }

      const account = findAccountByIdentifier(identifier);
      if (!account) {
        sendJson(res, 404, {
          ok: false,
          error: looksLikeEmail ? 'Error: Nonexistent email' : 'Error: Nonexistent account',
        });
        return;
      }

      if (!verifyPassword(password, account.passwordHash)) {
        sendJson(res, 401, { ok: false, error: 'Error: Wrong Password' });
        return;
      }

      const token = issueSessionToken(account.username);
      sendJson(res, 200, {
        ok: true,
        token,
        snapshot: buildSocialSnapshot(account.username),
      });
      return;
    }

    // Auth: Sign up
    if (req.method === 'POST' && reqPath === '/api/auth/signup') {
      const rawUsername = typeof body.username === 'string' ? body.username.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      const confirmEmail = typeof body.confirmEmail === 'string' ? body.confirmEmail.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';

      if (!rawUsername) {
        sendJson(res, 400, { ok: false, error: 'Error: Username is required' });
        return;
      }
      if (rawUsername.length < 2 || rawUsername.length > 32) {
        sendJson(res, 400, {
          ok: false,
          error: 'Error: Username must be between 2 and 32 characters',
        });
        return;
      }
      if (!USERNAME_REGEX.test(rawUsername)) {
        sendJson(res, 400, {
          ok: false,
          error: 'Error: Username can only use letters, numbers, underscores, periods, and hyphens',
        });
        return;
      }
      if (findAccountByUsername(rawUsername)) {
        sendJson(res, 409, { ok: false, error: 'Error: Username is already taken' });
        return;
      }
      if (!email) {
        sendJson(res, 400, { ok: false, error: 'Error: Email is required' });
        return;
      }
      if (!EMAIL_REGEX.test(email)) {
        sendJson(res, 400, { ok: false, error: 'Error: Invalid email format' });
        return;
      }
      if (findAccountByEmail(email)) {
        sendJson(res, 409, { ok: false, error: 'Error: Email is already registered' });
        return;
      }
      if (!confirmEmail) {
        sendJson(res, 400, { ok: false, error: 'Error: Please confirm your email' });
        return;
      }
      if (email.toLowerCase() !== confirmEmail.toLowerCase()) {
        sendJson(res, 400, { ok: false, error: 'Error: Emails do not match' });
        return;
      }

      const passErr = validatePasswordPair(password, confirmPassword);
      if (passErr) {
        sendJson(res, 400, { ok: false, error: passErr });
        return;
      }

      const avatarPreset =
        typeof body.avatarPreset === 'number' &&
        body.avatarPreset >= 0 &&
        body.avatarPreset <= 3
          ? body.avatarPreset
          : null;
      const avatarDataUrl =
        avatarPreset === null &&
        typeof body.avatarDataUrl === 'string' &&
        body.avatarDataUrl.startsWith('data:image/')
          ? body.avatarDataUrl
          : undefined;

      /** @type {StoredAccount} */
      const newAccount = {
        username: rawUsername.toLowerCase(),
        displayName: rawUsername,
        email,
        passwordHash: hashPassword(password),
        bio: '',
        createdAt: Date.now(),
        status: 'online',
        avatarPreset: avatarDataUrl ? null : (avatarPreset ?? 0),
        avatarDataUrl,
      };

      db.accounts.push(newAccount);
      saveDb(db);

      const token = issueSessionToken(newAccount.username);
      sendJson(res, 200, {
        ok: true,
        token,
        snapshot: buildSocialSnapshot(newAccount.username),
      });
      return;
    }

    // Auth: Forgot Password - Send Email
    if (req.method === 'POST' && reqPath === '/api/forgot-password') {
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      if (!email) {
        sendJson(res, 400, { ok: false, error: 'Error: Email is required' });
        return;
      }
      if (!EMAIL_REGEX.test(email)) {
        sendJson(res, 400, { ok: false, error: 'Error: Invalid email format' });
        return;
      }

      const account = findAccountByEmail(email);
      if (!account) {
        sendJson(res, 404, { ok: false, error: 'Error: Nonexistent email' });
        return;
      }

      const result = await issueResetEmailForAddress(account.email);
      sendJson(res, result.status, result.payload);
      return;
    }

    // Auth: Forgot Password - Verify 6-char Code
    if (req.method === 'POST' && reqPath === '/api/verify-reset-code') {
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      const code = typeof body.code === 'string' ? body.code.trim() : '';

      if (!email || !EMAIL_REGEX.test(email)) {
        sendJson(res, 400, { ok: false, error: 'Error: Invalid email format' });
        return;
      }
      if (!code) {
        sendJson(res, 400, { ok: false, error: 'Error: Please enter the 6-character code' });
        return;
      }
      if (!/^[a-zA-Z0-9]+$/.test(code)) {
        sendJson(res, 400, { ok: false, error: 'Error: Code can only contain letters and numbers' });
        return;
      }
      if (code.length !== 6) {
        sendJson(res, 400, { ok: false, error: 'Error: Code must be 6 letters and numbers' });
        return;
      }

      const account = findAccountByEmail(email);
      if (!account) {
        sendJson(res, 404, { ok: false, error: 'Error: Nonexistent email' });
        return;
      }

      const result = verifyResetCodeForAddress(account.email, code);
      sendJson(res, result.status, result.payload);
      return;
    }

    // Auth: Complete Forgot Password (Skip or Reset Password -> auto sign-in)
    if (req.method === 'POST' && reqPath === '/api/auth/complete-reset') {
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      const proofToken = typeof body.resetProofToken === 'string' ? body.resetProofToken : '';
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword : null;
      const confirmPassword =
        typeof body.confirmPassword === 'string' ? body.confirmPassword : null;

      const account = findAccountByEmail(email);
      if (!account) {
        sendJson(res, 404, { ok: false, error: 'Error: Nonexistent account' });
        return;
      }

      if (newPassword !== null) {
        const passErr = validatePasswordPair(newPassword, confirmPassword ?? '');
        if (passErr) {
          sendJson(res, 400, { ok: false, error: passErr });
          return;
        }
      }

      if (!proofToken || !consumeResetProof(account.email, proofToken)) {
        sendJson(res, 401, {
          ok: false,
          error: 'Error: Verification session expired. Please request a new code',
        });
        return;
      }

      if (newPassword !== null) {
        account.passwordHash = hashPassword(newPassword);
        saveDb(db);
      }

      const token = issueSessionToken(account.username);
      sendJson(res, 200, {
        ok: true,
        token,
        snapshot: buildSocialSnapshot(account.username),
      });
      return;
    }

    // Authenticated routes below
    const activeUser = authenticateRequest(req);
    if (!activeUser) {
      sendJson(res, 401, { ok: false, error: 'Error: Not authenticated' });
      return;
    }

    if (req.method === 'GET' && (reqPath === '/api/social/snapshot' || reqPath === '/api/auth/session')) {
      sendJson(res, 200, {
        ok: true,
        snapshot: buildSocialSnapshot(activeUser.username),
      });
      return;
    }

    if (req.method === 'POST' && reqPath === '/api/push/subscribe') {
      const selfKey = activeUser.username.toLowerCase();
      const sub = body.subscription;
      const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint.trim() : '';
      const p256dh = typeof sub?.keys?.p256dh === 'string' ? sub.keys.p256dh.trim() : '';
      const auth = typeof sub?.keys?.auth === 'string' ? sub.keys.auth.trim() : '';
      if (!endpoint || !/^https:\/\//i.test(endpoint) || endpoint.length > 2000 || !p256dh || !auth) {
        sendJson(res, 400, { ok: false, error: 'Error: Invalid push subscription' });
        return;
      }
      if (!db.pushSubscriptions || typeof db.pushSubscriptions !== 'object') {
        db.pushSubscriptions = {};
      }
      const existing = Array.isArray(db.pushSubscriptions[selfKey])
        ? db.pushSubscriptions[selfKey].filter((s) => s && s.endpoint !== endpoint)
        : [];
      existing.push({ endpoint, keys: { p256dh, auth }, createdAt: Date.now() });
      db.pushSubscriptions[selfKey] = existing.slice(-8);
      saveDb(db);
      sendJson(res, 200, { ok: true, devices: db.pushSubscriptions[selfKey].length });
      return;
    }

    if (req.method === 'POST' && reqPath === '/api/push/unsubscribe') {
      const selfKey = activeUser.username.toLowerCase();
      const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : '';
      if (db.pushSubscriptions && Array.isArray(db.pushSubscriptions[selfKey])) {
        db.pushSubscriptions[selfKey] = endpoint
          ? db.pushSubscriptions[selfKey].filter((s) => s && s.endpoint !== endpoint)
          : [];
        saveDb(db);
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && reqPath === '/api/auth/signout') {
      const token = extractBearerToken(req);
      const uKey = activeUser.username.toLowerCase();
      if (token && db.sessions[token]) {
        delete db.sessions[token];
        saveDb(db);
      }
      lastSeenByUser.delete(uKey);
      notifyRelatedPeers(uKey, false);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && reqPath === '/api/profile/status') {
      const nextStatus = typeof body.status === 'string' ? body.status : '';
      if (!VALID_STATUSES.has(nextStatus)) {
        sendJson(res, 400, { ok: false, error: 'Error: Invalid status' });
        return;
      }

      activeUser.status = /** @type {UserStatus} */ (nextStatus);
      // Push realtime updates and reply immediately before flushing SQLite so status switches feel instantaneous.
      notifyRelatedPeers(activeUser.username, true);
      sendJson(res, 200, {
        ok: true,
        snapshot: buildSocialSnapshot(activeUser.username),
      });
      saveDb(db);
      return;
    }

    if (req.method === 'POST' && reqPath === '/api/profile/custom-status') {
      if (body.clear === true) {
        activeUser.customStatus = undefined;
      } else {
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (text.length > 128) {
          sendJson(res, 400, {
            ok: false,
            error: 'Error: Status text must be 128 characters or fewer',
          });
          return;
        }
        const emoji = sanitizeSingleEmoji(body.emoji);
        if (!text && !emoji) {
          activeUser.customStatus = undefined;
        } else {
          let expiresAt = null;
          if (typeof body.expiresAt === 'number' && Number.isFinite(body.expiresAt)) {
            if (body.expiresAt <= Date.now()) {
              sendJson(res, 400, { ok: false, error: 'Error: Expiration must be in the future' });
              return;
            }
            expiresAt = body.expiresAt;
          }
          activeUser.customStatus = { text, emoji, expiresAt };
        }
      }

      notifyRelatedPeers(activeUser.username, true);
      sendJson(res, 200, {
        ok: true,
        snapshot: buildSocialSnapshot(activeUser.username),
      });
      saveDb(db);
      return;
    }

    if (req.method === 'POST' && reqPath === '/api/profile/update') {
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
      const nextUsername =
        typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
      const bio = typeof body.bio === 'string' ? body.bio.trim() : '';

      if (!displayName) {
        sendJson(res, 400, { ok: false, error: 'Error: Display name cannot be empty' });
        return;
      }
      if (displayName.length > 32) {
        sendJson(res, 400, {
          ok: false,
          error: 'Error: Display name must be 32 characters or fewer',
        });
        return;
      }
      if (!nextUsername) {
        sendJson(res, 400, { ok: false, error: 'Error: Username cannot be empty' });
        return;
      }
      if (nextUsername.length < 2 || nextUsername.length > 32) {
        sendJson(res, 400, {
          ok: false,
          error: 'Error: Username must be between 2 and 32 characters',
        });
        return;
      }
      if (!USERNAME_REGEX.test(nextUsername)) {
        sendJson(res, 400, {
          ok: false,
          error: 'Error: Username can only use letters, numbers, underscores, periods, and hyphens',
        });
        return;
      }
      if (bio.length > 190) {
        sendJson(res, 400, { ok: false, error: 'Error: Bio must be 190 characters or fewer' });
        return;
      }

      const conflict = db.accounts.find(
        (acc) =>
          acc.email.toLowerCase() !== activeUser.email.toLowerCase() &&
          acc.username.toLowerCase() === nextUsername,
      );
      if (conflict) {
        sendJson(res, 409, { ok: false, error: 'Error: Username is already taken' });
        return;
      }

      const previousUsername = activeUser.username;
      const avatarPreset =
        typeof body.avatarPreset === 'number' &&
        body.avatarPreset >= 0 &&
        body.avatarPreset <= 3
          ? body.avatarPreset
          : null;
      let avatarDataUrl;
      if (avatarPreset === null && typeof body.avatarDataUrl === 'string') {
        if (body.avatarDataUrl.startsWith('data:image/')) {
          avatarDataUrl = body.avatarDataUrl;
        } else if (body.avatarDataUrl.includes('/api/media/avatar/')) {
          avatarDataUrl = activeUser.avatarDataUrl;
        }
      }

      if (Object.prototype.hasOwnProperty.call(body, 'bannerColor')) {
        if (body.bannerColor === null || body.bannerColor === '') {
          activeUser.bannerColor = undefined;
        } else if (
          typeof body.bannerColor === 'string' &&
          HEX_COLOR_REGEX.test(body.bannerColor.trim())
        ) {
          activeUser.bannerColor = body.bannerColor.trim().toLowerCase();
        } else {
          sendJson(res, 400, { ok: false, error: 'Error: Invalid banner color' });
          return;
        }
      }

      if (Object.prototype.hasOwnProperty.call(body, 'bannerDataUrl')) {
        if (body.bannerDataUrl === null || body.bannerDataUrl === '') {
          activeUser.bannerDataUrl = undefined;
        } else if (
          typeof body.bannerDataUrl === 'string' &&
          body.bannerDataUrl.includes('/api/media/banner/')
        ) {
          // Keep existing stored banner unchanged.
        } else if (
          typeof body.bannerDataUrl === 'string' &&
          body.bannerDataUrl.startsWith('data:image/')
        ) {
          if (body.bannerDataUrl.length > MAX_BANNER_IMAGE_CHARS) {
            sendJson(res, 413, { ok: false, error: 'Error: Banner image is too large' });
            return;
          }
          activeUser.bannerDataUrl = body.bannerDataUrl;
        } else {
          sendJson(res, 400, { ok: false, error: 'Error: Invalid banner image' });
          return;
        }
      }

      activeUser.displayName = displayName;
      activeUser.username = nextUsername;
      activeUser.bio = bio;
      activeUser.avatarPreset = avatarDataUrl ? null : (avatarPreset ?? 0);
      activeUser.avatarDataUrl = avatarDataUrl;

      if (previousUsername !== nextUsername) {
        migrateUsernameReferences(previousUsername, nextUsername);
      }

      saveDb(db);
      notifyRelatedPeers(activeUser.username, true);
      sendJson(res, 200, {
        ok: true,
        previousUsername,
        snapshot: buildSocialSnapshot(activeUser.username),
      });
      return;
    }

    // Account Security: Change password
    if (req.method === 'POST' && reqPath === '/api/account/change-password') {
      const currentPassword =
        typeof body.currentPassword === 'string' ? body.currentPassword : '';
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
      const confirmPassword =
        typeof body.confirmPassword === 'string' ? body.confirmPassword : '';

      if (!currentPassword) {
        sendJson(res, 400, { ok: false, error: 'Error: Enter your current password' });
        return;
      }
      if (!verifyPassword(currentPassword, activeUser.passwordHash)) {
        sendJson(res, 403, { ok: false, error: 'Error: Current password is incorrect' });
        return;
      }
      const passErr = validatePasswordPair(newPassword, confirmPassword);
      if (passErr) {
        sendJson(res, 400, { ok: false, error: passErr });
        return;
      }

      activeUser.passwordHash = hashPassword(newPassword);
      saveDb(db);
      sendJson(res, 200, { ok: true, message: 'Password updated successfully.' });
      return;
    }

    // Account Security: Change email address
    if (req.method === 'POST' && reqPath === '/api/account/change-email') {
      const currentPassword =
        typeof body.currentPassword === 'string' ? body.currentPassword : '';
      const nextEmail = typeof body.email === 'string' ? body.email.trim() : '';

      if (!currentPassword || !verifyPassword(currentPassword, activeUser.passwordHash)) {
        sendJson(res, 403, { ok: false, error: 'Error: Current password is incorrect' });
        return;
      }
      if (!nextEmail || !EMAIL_REGEX.test(nextEmail)) {
        sendJson(res, 400, { ok: false, error: 'Error: Enter a valid email address' });
        return;
      }
      const conflict = findAccountByEmail(nextEmail);
      if (conflict && conflict.username.toLowerCase() !== activeUser.username.toLowerCase()) {
        sendJson(res, 409, { ok: false, error: 'Error: That email is already in use' });
        return;
      }

      activeUser.email = nextEmail;
      saveDb(db);
      sendJson(res, 200, {
        ok: true,
        snapshot: buildSocialSnapshot(activeUser.username),
      });
      return;
    }

    // Account Privacy: Update friend requests, non-friend DMs, and private profile toggles
    if (req.method === 'POST' && reqPath === '/api/account/privacy') {
      if (!activeUser.privacy || typeof activeUser.privacy !== 'object') {
        activeUser.privacy = {};
      }
      if (typeof body.allowFriendRequests === 'boolean') {
        activeUser.privacy.allowFriendRequests = body.allowFriendRequests;
      }
      if (typeof body.allowNonFriendDms === 'boolean') {
        activeUser.privacy.allowNonFriendDms = body.allowNonFriendDms;
      }
      if (typeof body.privateProfile === 'boolean') {
        activeUser.privacy.privateProfile = body.privateProfile;
      }
      if (typeof body.showReadReceipts === 'boolean') {
        activeUser.privacy.showReadReceipts = body.showReadReceipts;
      }
      saveDb(db);
      notifyRelatedPeers(activeUser.username, false);
      sendJson(res, 200, {
        ok: true,
        snapshot: buildSocialSnapshot(activeUser.username),
      });
      return;
    }

    // Account Security: Revoke all other active login sessions
    if (req.method === 'POST' && reqPath === '/api/account/signout-others') {
      const currentToken = extractBearerToken(req);
      const selfKey = activeUser.username.toLowerCase();
      let revokedCount = 0;
      for (const [tokenKey, owner] of Object.entries(db.sessions)) {
        if (tokenKey !== currentToken && String(owner).toLowerCase() === selfKey) {
          delete db.sessions[tokenKey];
          revokedCount += 1;
        }
      }
      if (revokedCount > 0) {
        saveDb(db);
      }
      sendJson(res, 200, { ok: true, revokedCount });
      return;
    }

    // Profile: Mutual friends & mutual groups for target user
    if (req.method === 'GET' && reqPath === '/api/friends/mutual') {
      const parsedUrl = new URL(req.url ?? '/', 'http://localhost');
      const targetKey = (parsedUrl.searchParams.get('username') ?? '').trim().toLowerCase();
      const selfKey = activeUser.username.toLowerCase();
      const targetAcc = targetKey ? findAccountByUsername(targetKey) : undefined;
      if (!targetAcc) {
        sendJson(res, 404, { ok: false, error: 'Error: User not found' });
        return;
      }

      if (targetAcc.privacy?.privateProfile || hasAnyBlockBetween(selfKey, targetKey)) {
        sendJson(res, 200, { ok: true, mutualFriends: [], mutualGroups: [] });
        return;
      }

      const selfFriends = new Set((db.friendships[selfKey] ?? []).map((u) => u.toLowerCase()));
      const mutualFriends = [];
      for (const candidateRaw of db.friendships[targetKey] ?? []) {
        const candKey = candidateRaw.toLowerCase();
        if (candKey === selfKey || candKey === targetKey || !selfFriends.has(candKey)) {
          continue;
        }
        const candAcc = findAccountByUsername(candKey);
        if (candAcc) {
          mutualFriends.push(toPublicProfile(candAcc, selfKey));
        }
      }
      mutualFriends.sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
      );

      const mutualGroups = [];
      for (const grp of Object.values(db.groupDms)) {
        const lowerMembers = (grp.members ?? []).map((m) => m.toLowerCase());
        if (lowerMembers.includes(selfKey) && lowerMembers.includes(targetKey)) {
          mutualGroups.push({
            id: grp.id,
            name: grp.name,
            iconDataUrl: getGroupIconUrl(grp),
            memberCount: lowerMembers.length,
          });
        }
      }
      mutualGroups.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

      sendJson(res, 200, {
        ok: true,
        mutualFriends,
        mutualGroups,
      });
      return;
    }

    // Friends: Send Request
    if (req.method === 'POST' && reqPath === '/api/friends/request') {
      const targetRaw = typeof body.username === 'string' ? body.username.trim() : '';
      if (!targetRaw) {
        sendJson(res, 400, { ok: false, error: 'Error: Please enter a username' });
        return;
      }
      const cleanedInput = targetRaw.startsWith('@') ? targetRaw.slice(1).trim() : targetRaw;
      if (!cleanedInput) {
        sendJson(res, 400, { ok: false, error: 'Error: Please enter a username' });
        return;
      }
      if (cleanedInput.includes('@')) {
        sendJson(res, 400, {
          ok: false,
          error: 'Error: Enter a username, not an email address',
        });
        return;
      }

      let target = !/\s/.test(cleanedInput) ? findAccountByUsername(cleanedInput) : undefined;
      if (!target) {
        const lowerDisplay = cleanedInput.toLowerCase();
        const displayMatches = db.accounts.filter(
          (acc) => acc.displayName.trim().toLowerCase() === lowerDisplay,
        );
        if (displayMatches.length === 1) {
          target = displayMatches[0];
        } else if (displayMatches.length > 1) {
          sendJson(res, 409, {
            ok: false,
            error: `Error: Multiple users share the display name "${cleanedInput}" — enter their exact @username instead`,
          });
          return;
        }
      }
      if (!target && /\s/.test(cleanedInput)) {
        sendJson(res, 400, { ok: false, error: 'Error: Usernames cannot contain spaces' });
        return;
      }
      if (!target) {
        sendJson(res, 404, {
          ok: false,
          error: `Error: No user found with username "${cleanedInput}"`,
        });
        return;
      }

      const fromKey = activeUser.username.toLowerCase();
      const toKey = target.username.toLowerCase();

      if (toKey === fromKey) {
        sendJson(res, 400, {
          ok: false,
          error: 'Error: You cannot send a friend request to yourself',
        });
        return;
      }

      if (isBlockedBy(fromKey, toKey)) {
        sendJson(res, 403, {
          ok: false,
          error: `Error: You blocked ${target.username} — unblock them first`,
        });
        return;
      }

      if (isBlockedBy(toKey, fromKey) || target.privacy?.allowFriendRequests === false) {
        sendJson(res, 403, {
          ok: false,
          error: 'Error: This user is not accepting friend requests',
        });
        return;
      }

      if ((db.friendships[fromKey] ?? []).includes(toKey)) {
        sendJson(res, 409, {
          ok: false,
          error: `Error: You are already friends with ${target.displayName}`,
        });
        return;
      }

      if (db.friendRequests.some((r) => r.from === fromKey && r.to === toKey)) {
        sendJson(res, 409, {
          ok: false,
          error: `Error: Friend request already sent to ${target.username}`,
        });
        return;
      }

      if (db.friendRequests.some((r) => r.from === toKey && r.to === fromKey)) {
        sendJson(res, 409, {
          ok: false,
          error: `Error: ${target.displayName} already sent you a friend request — check Pending`,
        });
        return;
      }

      db.friendRequests.push({
        from: fromKey,
        to: toKey,
        createdAt: Date.now(),
      });
      saveDb(db);

      pushSnapshotToUser(fromKey);
      pushSnapshotToUser(toKey);
      emitSocialNotify(toKey, {
        kind: 'friend-request',
        actor: toPublicProfile(activeUser, toKey),
        timestamp: Date.now(),
      });

      sendJson(res, 200, {
        ok: true,
        message: `Success! Your friend request to ${target.username} was sent.`,
        snapshot: buildSocialSnapshot(fromKey),
      });
      return;
    }

    // Friends: Cancel outgoing request
    if (req.method === 'POST' && reqPath === '/api/friends/cancel') {
      const targetKey =
        typeof body.targetUsername === 'string' ? body.targetUsername.trim().toLowerCase() : '';
      const fromKey = activeUser.username.toLowerCase();

      db.friendRequests = db.friendRequests.filter(
        (r) => !(r.from === fromKey && r.to === targetKey),
      );
      saveDb(db);

      pushSnapshotToUser(fromKey);
      if (targetKey) {
        pushSnapshotToUser(targetKey);
      }

      sendJson(res, 200, {
        ok: true,
        snapshot: buildSocialSnapshot(fromKey),
      });
      return;
    }

    // Friends: Decline incoming request
    if (req.method === 'POST' && reqPath === '/api/friends/decline') {
      const fromKey =
        typeof body.fromUsername === 'string' ? body.fromUsername.trim().toLowerCase() : '';
      const toKey = activeUser.username.toLowerCase();

      db.friendRequests = db.friendRequests.filter(
        (r) => !(r.from === fromKey && r.to === toKey),
      );
      saveDb(db);

      pushSnapshotToUser(toKey);
      if (fromKey) {
        pushSnapshotToUser(fromKey);
      }

      sendJson(res, 200, {
        ok: true,
        snapshot: buildSocialSnapshot(toKey),
      });
      return;
    }

    // Friends: Accept incoming request
    if (req.method === 'POST' && reqPath === '/api/friends/accept') {
      const fromKey =
        typeof body.fromUsername === 'string' ? body.fromUsername.trim().toLowerCase() : '';
      const toKey = activeUser.username.toLowerCase();

      const hasRequest = db.friendRequests.some((r) => r.from === fromKey && r.to === toKey);
      if (!hasRequest) {
        sendJson(res, 404, {
          ok: false,
          error: 'Error: Friend request no longer exists',
        });
        return;
      }

      db.friendRequests = db.friendRequests.filter(
        (r) => !((r.from === fromKey && r.to === toKey) || (r.from === toKey && r.to === fromKey)),
      );

      const toSet = new Set(db.friendships[toKey] ?? []);
      const fromSet = new Set(db.friendships[fromKey] ?? []);
      toSet.add(fromKey);
      fromSet.add(toKey);
      db.friendships[toKey] = Array.from(toSet);
      db.friendships[fromKey] = Array.from(fromSet);
      saveDb(db);

      pushSnapshotToUser(toKey);
      pushSnapshotToUser(fromKey);

      sendJson(res, 200, {
        ok: true,
        snapshot: buildSocialSnapshot(toKey),
      });
      return;
    }

    // Friends: Remove friend (unfriend)
    if (req.method === 'POST' && reqPath === '/api/friends/remove') {
      const targetKey =
        typeof body.targetUsername === 'string' ? body.targetUsername.trim().toLowerCase() : '';
      const selfKey = activeUser.username.toLowerCase();

      if (!targetKey || !areFriends(selfKey, targetKey)) {
        sendJson(res, 404, {
          ok: false,
          error: 'Error: User is not in your friends list',
        });
        return;
      }

      removeFriendshipBetween(selfKey, targetKey);
      clearUnreadBetween(selfKey, targetKey);
      saveDb(db);

      pushSnapshotToUser(selfKey);
      pushSnapshotToUser(targetKey);
      emitSocialNotify(targetKey, {
        kind: 'unfriended',
        actor: toPublicProfile(activeUser, targetKey),
        timestamp: Date.now(),
      });

      sendJson(res, 200, {
        ok: true,
        snapshot: buildSocialSnapshot(selfKey),
      });
      return;
    }

    // Friends: Block user
    if (req.method === 'POST' && reqPath === '/api/friends/block') {
      const targetKey =
        typeof body.targetUsername === 'string' ? body.targetUsername.trim().toLowerCase() : '';
      const selfKey = activeUser.username.toLowerCase();

      if (!targetKey || !findAccountByUsername(targetKey)) {
        sendJson(res, 404, { ok: false, error: 'Error: User not found' });
        return;
      }

      if (targetKey === selfKey) {
        sendJson(res, 400, { ok: false, error: 'Error: You cannot block yourself' });
        return;
      }

      const blockSet = new Set(db.blocks[selfKey] ?? []);
      blockSet.add(targetKey);
      db.blocks[selfKey] = Array.from(blockSet);

      removeFriendshipBetween(selfKey, targetKey);
      clearRequestsBetween(selfKey, targetKey);
      clearUnreadBetween(selfKey, targetKey);
      const dmVcKey = dmThreadKey(selfKey, targetKey);
      const activeDmVc = activeVoiceCalls.get(dmVcKey);
      if (activeDmVc) {
        activeDmVc.participants.clear();
        clearAllRingingInCall(activeDmVc);
        finalizeCallIfDone(activeDmVc);
        broadcastVcState(activeDmVc);
      }
      saveDb(db);

      pushSnapshotToUser(selfKey);
      pushSnapshotToUser(targetKey);
      emitSocialNotify(targetKey, {
        kind: 'blocked',
        actor: toPublicProfile(activeUser, targetKey),
        timestamp: Date.now(),
      });
      notifyRelatedPeers(selfKey, false);

      sendJson(res, 200, {
        ok: true,
        snapshot: buildSocialSnapshot(selfKey),
      });
      return;
    }

    // Friends: Unblock user
    if (req.method === 'POST' && reqPath === '/api/friends/unblock') {
      const targetKey =
        typeof body.targetUsername === 'string' ? body.targetUsername.trim().toLowerCase() : '';
      const selfKey = activeUser.username.toLowerCase();

      if (Array.isArray(db.blocks[selfKey])) {
        db.blocks[selfKey] = db.blocks[selfKey].filter((u) => u.toLowerCase() !== targetKey);
        saveDb(db);
      }

      pushSnapshotToUser(selfKey);
      if (targetKey) {
        pushSnapshotToUser(targetKey);
      }
      notifyRelatedPeers(selfKey, false);

      sendJson(res, 200, {
        ok: true,
        snapshot: buildSocialSnapshot(selfKey),
      });
      return;
    }

    // Groups: Create a new Group DM with friends
    if (req.method === 'POST' && reqPath === '/api/groups/create') {
      const selfKey = activeUser.username.toLowerCase();
      const rawMembers = Array.isArray(body.memberUsernames) ? body.memberUsernames : [];
      const memberSet = new Set([selfKey]);
      const addedFriends = [];

      for (const item of rawMembers) {
        if (typeof item !== 'string') {
          continue;
        }
        const key = item.trim().toLowerCase();
        if (!key || key === selfKey || memberSet.has(key)) {
          continue;
        }
        const acc = findAccountByUsername(key);
        if (!acc || !areFriends(selfKey, key)) {
          sendJson(res, 403, {
            ok: false,
            error: 'Error: All group members must be on your friends list',
          });
          return;
        }
        memberSet.add(key);
        addedFriends.push(acc);
        if (memberSet.size >= 25) {
          break;
        }
      }

      if (addedFriends.length === 0) {
        sendJson(res, 400, { ok: false, error: 'Error: Select at least one friend to start a chat' });
        return;
      }

      const rawName = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
      const fallbackName = [activeUser.displayName, ...addedFriends.map((f) => f.displayName)]
        .join(', ')
        .slice(0, 64);
      const groupName = (rawName || fallbackName || 'Group Chat').slice(0, 64);

      let iconDataUrl;
      if (typeof body.iconDataUrl === 'string' && body.iconDataUrl.trim()) {
        if (!body.iconDataUrl.startsWith('data:image/')) {
          sendJson(res, 400, { ok: false, error: 'Error: Invalid group icon image' });
          return;
        }
        if (body.iconDataUrl.length > MAX_BANNER_IMAGE_CHARS) {
          sendJson(res, 413, { ok: false, error: 'Error: Group icon image is too large' });
          return;
        }
        iconDataUrl = body.iconDataUrl;
      }

      const id = crypto.randomUUID();
      const createdAt = Date.now();
      /** @type {StoredGroupDm} */
      const created = {
        id,
        name: groupName,
        iconDataUrl,
        ownerUsername: selfKey,
        members: Array.from(memberSet),
        createdAt,
      };
      db.groupDms[id] = created;
      for (const m of created.members) {
        touchThreadActivityForUser(m, `group:${id}`, createdAt, { unhide: true });
      }
      saveDb(db);

      for (const m of created.members) {
        pushSnapshotToUser(m);
        if (m !== selfKey) {
          emitSocialNotify(m, {
            kind: 'group-added',
            actor: toPublicProfile(activeUser, m),
            groupId: id,
            groupName: created.name,
            groupIconDataUrl: getGroupIconUrl(created),
            timestamp: createdAt,
          });
        }
      }

      sendJson(res, 200, {
        ok: true,
        group: toClientGroup(created, selfKey),
        snapshot: buildSocialSnapshot(selfKey),
      });
      return;
    }

    // Groups: Update group name or profile picture (any member can update)
    if (req.method === 'POST' && reqPath === '/api/groups/update') {
      const selfKey = activeUser.username.toLowerCase();
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const group = db.groupDms[groupId];
      if (!group || !group.members.some((m) => m.toLowerCase() === selfKey)) {
        sendJson(res, 403, { ok: false, error: 'Error: Group chat not found' });
        return;
      }

      if (Object.prototype.hasOwnProperty.call(body, 'name')) {
        const nextName =
          typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
        if (!nextName) {
          sendJson(res, 400, { ok: false, error: 'Error: Group name cannot be empty' });
          return;
        }
        group.name = nextName.slice(0, 64);
      }

      if (Object.prototype.hasOwnProperty.call(body, 'iconDataUrl')) {
        if (body.iconDataUrl === null || body.iconDataUrl === '') {
          group.iconDataUrl = undefined;
        } else if (
          typeof body.iconDataUrl === 'string' &&
          body.iconDataUrl.includes('/api/media/group-icon/')
        ) {
          // Keep existing stored group icon unchanged.
        } else if (
          typeof body.iconDataUrl === 'string' &&
          body.iconDataUrl.startsWith('data:image/')
        ) {
          if (body.iconDataUrl.length > MAX_BANNER_IMAGE_CHARS) {
            sendJson(res, 413, { ok: false, error: 'Error: Group icon image is too large' });
            return;
          }
          group.iconDataUrl = body.iconDataUrl;
        } else {
          sendJson(res, 400, { ok: false, error: 'Error: Invalid group icon image' });
          return;
        }
      }

      saveDb(db);
      for (const m of group.members) {
        pushSnapshotToUser(m);
      }

      sendJson(res, 200, {
        ok: true,
        group: toClientGroup(group, selfKey),
        snapshot: buildSocialSnapshot(selfKey),
      });
      return;
    }

    // Groups: Add friends to an existing group DM
    if (req.method === 'POST' && reqPath === '/api/groups/add-members') {
      const selfKey = activeUser.username.toLowerCase();
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const group = db.groupDms[groupId];
      if (!group || !group.members.some((m) => m.toLowerCase() === selfKey)) {
        sendJson(res, 403, { ok: false, error: 'Error: Group chat not found' });
        return;
      }

      const rawUsernames = Array.isArray(body.usernames) ? body.usernames : [];
      const memberSet = new Set(group.members.map((m) => m.toLowerCase()));
      /** @type {string[]} */
      const addedKeys = [];
      for (const item of rawUsernames) {
        if (typeof item !== 'string') {
          continue;
        }
        const key = item.trim().toLowerCase();
        if (!key || memberSet.has(key)) {
          continue;
        }
        if (!findAccountByUsername(key) || !areFriends(selfKey, key)) {
          sendJson(res, 403, { ok: false, error: 'Error: You can only add friends to a group' });
          return;
        }
        if (memberSet.size >= 25) {
          break;
        }
        memberSet.add(key);
        addedKeys.push(key);
      }

      if (addedKeys.length > 0) {
        group.members = Array.from(memberSet);
        const now = Date.now();
        for (const m of group.members) {
          touchThreadActivityForUser(m, `group:${groupId}`, now, { unhide: true });
        }
        saveDb(db);
        for (const m of group.members) {
          pushSnapshotToUser(m);
        }
        const targetNames = addedKeys
          .map((u) => findAccountByUsername(u)?.displayName ?? u)
          .join(', ');
        appendSystemEventMessage(
          {
            kind: 'group',
            groupId,
            threadKey: groupThreadKey(groupId),
            participants: [...group.members],
          },
          {
            kind: 'group-add',
            actorUsername: selfKey,
            targetUsernames: addedKeys,
          },
          `${activeUser.displayName} added ${targetNames} to the group.`,
        );
        for (const addedKey of addedKeys) {
          emitSocialNotify(addedKey, {
            kind: 'group-added',
            actor: toPublicProfile(activeUser, addedKey),
            groupId,
            groupName: group.name,
            groupIconDataUrl: getGroupIconUrl(group),
            timestamp: now,
          });
        }
      }

      sendJson(res, 200, {
        ok: true,
        group: toClientGroup(group, selfKey),
        snapshot: buildSocialSnapshot(selfKey),
      });
      return;
    }

    // Groups: Kick/remove a member (Group Owner only)
    if (req.method === 'POST' && reqPath === '/api/groups/kick') {
      const selfKey = activeUser.username.toLowerCase();
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const targetKey =
        typeof body.targetUsername === 'string' ? body.targetUsername.trim().toLowerCase() : '';
      const group = db.groupDms[groupId];
      if (!group || !group.members.some((m) => m.toLowerCase() === selfKey)) {
        sendJson(res, 404, { ok: false, error: 'Error: Group chat not found' });
        return;
      }
      if (group.ownerUsername.toLowerCase() !== selfKey) {
        sendJson(res, 403, { ok: false, error: 'Error: Only the group owner can remove members' });
        return;
      }
      if (!targetKey || targetKey === selfKey) {
        sendJson(res, 400, { ok: false, error: 'Error: Invalid member to remove' });
        return;
      }
      if (!group.members.some((m) => m.toLowerCase() === targetKey)) {
        sendJson(res, 404, { ok: false, error: 'Error: User is not in this group' });
        return;
      }

      group.members = group.members.filter((m) => m.toLowerCase() !== targetKey);
      if (db.unreadGroups[targetKey]) {
        delete db.unreadGroups[targetKey][groupId];
      }
      const gThread = `group:${groupId}`;
      if (db.hiddenThreads[targetKey]) {
        delete db.hiddenThreads[targetKey][gThread];
      }
      if (db.mutedThreads[targetKey]) {
        delete db.mutedThreads[targetKey][gThread];
      }
      if (db.threadActivity[targetKey]) {
        delete db.threadActivity[targetKey][gThread];
      }
      const activeGroupVc = activeVoiceCalls.get(gThread);
      if (activeGroupVc) {
        activeGroupVc.allowedUsers = [...group.members];
        const removedFromCall = activeGroupVc.participants.delete(targetKey);
        stopRingingUser(activeGroupVc, targetKey);
        if (removedFromCall) {
          finalizeCallIfDone(activeGroupVc);
          broadcastVcState(activeGroupVc);
          sendWsEventToUser(targetKey, {
            type: 'vc:state',
            threadKey: gThread,
            kind: 'group',
            groupId,
            active: false,
            participants: [],
            ringing: [],
          });
        }
      }

      saveDb(db);
      pushSnapshotToUser(targetKey);
      for (const m of group.members) {
        pushSnapshotToUser(m);
      }

      const targetAcc = findAccountByUsername(targetKey);
      appendSystemEventMessage(
        {
          kind: 'group',
          groupId,
          threadKey: groupThreadKey(groupId),
          participants: [...group.members],
        },
        {
          kind: 'group-remove',
          actorUsername: selfKey,
          targetUsername: targetKey,
        },
        `${activeUser.displayName} removed ${targetAcc?.displayName ?? targetKey} from the group.`,
      );
      emitSocialNotify(targetKey, {
        kind: 'group-removed',
        actor: toPublicProfile(activeUser, targetKey),
        groupId,
        groupName: group.name,
        groupIconDataUrl: getGroupIconUrl(group),
        timestamp: Date.now(),
      });

      sendJson(res, 200, {
        ok: true,
        group: toClientGroup(group, selfKey),
        snapshot: buildSocialSnapshot(selfKey),
      });
      return;
    }

    // Groups: Transfer ownership to another member (Group Owner only)
    if (req.method === 'POST' && reqPath === '/api/groups/transfer-owner') {
      const selfKey = activeUser.username.toLowerCase();
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const targetKey =
        typeof body.targetUsername === 'string' ? body.targetUsername.trim().toLowerCase() : '';
      const group = db.groupDms[groupId];
      if (!group || !group.members.some((m) => m.toLowerCase() === selfKey)) {
        sendJson(res, 404, { ok: false, error: 'Error: Group chat not found' });
        return;
      }
      if (group.ownerUsername.toLowerCase() !== selfKey) {
        sendJson(res, 403, {
          ok: false,
          error: 'Error: Only the group owner can transfer ownership',
        });
        return;
      }
      if (!targetKey || targetKey === selfKey || !group.members.some((m) => m.toLowerCase() === targetKey)) {
        sendJson(res, 400, { ok: false, error: 'Error: Select another member in this group' });
        return;
      }

      group.ownerUsername = targetKey;
      saveDb(db);
      for (const m of group.members) {
        pushSnapshotToUser(m);
      }

      const targetAcc = findAccountByUsername(targetKey);
      appendSystemEventMessage(
        {
          kind: 'group',
          groupId,
          threadKey: groupThreadKey(groupId),
          participants: [...group.members],
        },
        {
          kind: 'group-owner',
          actorUsername: selfKey,
          targetUsername: targetKey,
        },
        `${activeUser.displayName} made ${targetAcc?.displayName ?? targetKey} the group owner.`,
      );

      sendJson(res, 200, {
        ok: true,
        group: toClientGroup(group, selfKey),
        snapshot: buildSocialSnapshot(selfKey),
      });
      return;
    }

    // Groups: Leave a Group DM
    if (req.method === 'POST' && reqPath === '/api/groups/leave') {
      const selfKey = activeUser.username.toLowerCase();
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const group = db.groupDms[groupId];
      if (!group || !group.members.some((m) => m.toLowerCase() === selfKey)) {
        sendJson(res, 404, { ok: false, error: 'Error: Group chat not found' });
        return;
      }

      group.members = group.members.filter((m) => m.toLowerCase() !== selfKey);
      if (db.unreadGroups[selfKey]) {
        delete db.unreadGroups[selfKey][groupId];
      }
      const groupThread = `group:${groupId}`;
      if (db.hiddenThreads[selfKey]) {
        delete db.hiddenThreads[selfKey][groupThread];
      }
      if (db.mutedThreads[selfKey]) {
        delete db.mutedThreads[selfKey][groupThread];
      }
      if (db.threadActivity[selfKey]) {
        delete db.threadActivity[selfKey][groupThread];
      }

      if (group.members.length === 0) {
        const orphanIds = [];
        const threadKey = groupThreadKey(groupId);
        for (const msg of db.dms[threadKey] ?? []) {
          if (Array.isArray(msg.attachmentIds)) {
            orphanIds.push(...msg.attachmentIds);
          }
        }
        delete db.dms[threadKey];
        sqliteStore.deleteThreadMessages(threadKey);
        delete db.groupDms[groupId];
        cleanupOrphanedUploads(orphanIds);
      } else if (group.ownerUsername.toLowerCase() === selfKey) {
        group.ownerUsername = group.members[0];
      }

      saveDb(db);
      pushSnapshotToUser(selfKey);
      for (const m of group.members) {
        pushSnapshotToUser(m);
      }

      if (group.members.length > 0) {
        appendSystemEventMessage(
          {
            kind: 'group',
            groupId,
            threadKey: groupThreadKey(groupId),
            participants: [...group.members],
          },
          {
            kind: 'group-leave',
            actorUsername: selfKey,
          },
          `${activeUser.displayName} left the group.`,
        );
      }

      sendJson(res, 200, {
        ok: true,
        snapshot: buildSocialSnapshot(selfKey),
      });
      return;
    }

    // DMs & Groups: Open / persist a 1-on-1 DM entry for the current user
    if (req.method === 'POST' && reqPath === '/api/dms/open') {
      const peerKey =
        typeof body.peerUsername === 'string' ? body.peerUsername.trim().toLowerCase() : '';
      const selfKey = activeUser.username.toLowerCase();
      const peerAccount = peerKey ? findAccountByUsername(peerKey) : undefined;
      if (!peerKey || !peerAccount || peerKey === selfKey) {
        sendJson(res, 404, { ok: false, error: 'Error: User not found' });
        return;
      }

      let changed = recordOpenDmPeer(selfKey, peerKey);
      const dmKey = `dm:${peerKey}`;
      if (db.hiddenThreads[selfKey]?.[dmKey]) {
        delete db.hiddenThreads[selfKey][dmKey];
        changed = true;
      }
      if (changed) {
        saveDb(db);
        pushSnapshotToUser(selfKey);
      }

      sendJson(res, 200, {
        ok: true,
        peer: toPublicProfile(peerAccount),
        snapshot: buildSocialSnapshot(selfKey),
      });
      return;
    }

    // DMs & Groups: Remove a non-history DM entry from the user's open list
    if (req.method === 'POST' && reqPath === '/api/dms/close') {
      const peerKey =
        typeof body.peerUsername === 'string' ? body.peerUsername.trim().toLowerCase() : '';
      const selfKey = activeUser.username.toLowerCase();
      if (peerKey && Array.isArray(db.openDms[selfKey])) {
        db.openDms[selfKey] = db.openDms[selfKey].filter((u) => u.toLowerCase() !== peerKey);
        saveDb(db);
      }
      sendJson(res, 200, {
        ok: true,
        snapshot: buildSocialSnapshot(selfKey),
      });
      return;
    }

    // DMs & Groups: Fetch paginated history (or surrounding context around a jumped message ID)
    if (req.method === 'GET' && reqPath === '/api/dms/history') {
      const parsedUrl = new URL(req.url ?? '/', 'http://localhost');
      const peerKey = (parsedUrl.searchParams.get('peer') ?? '').trim().toLowerCase();
      const groupId = (parsedUrl.searchParams.get('groupId') ?? '').trim();
      const beforeId = (parsedUrl.searchParams.get('before') ?? '').trim();
      const aroundId = (parsedUrl.searchParams.get('around') ?? '').trim();
      const rawLimit = Number(parsedUrl.searchParams.get('limit'));
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(100, Math.floor(rawLimit)) : 50;
      const selfKey = activeUser.username.toLowerCase();

      const ctx = resolveThreadContext(selfKey, { peerUsername: peerKey, groupId }, { mode: 'read' });
      if (!ctx.ok) {
        sendJson(res, ctx.status ?? 403, { ok: false, error: ctx.error });
        return;
      }

      const fullThreadList = db.dms[ctx.threadKey] ?? [];
      let page = null;
      if (aroundId) {
        page = sqliteStore.getMessagesFromId(ctx.threadKey, aroundId, 200);
      }
      if (!page) {
        page = sqliteStore.getMessagesPage(ctx.threadKey, { beforeId, limit });
      }

      let peerReceipt;
      if (ctx.kind === 'dm') {
        const peerAcc = findAccountByUsername(ctx.peerKey);
        if (
          activeUser.privacy?.showReadReceipts === true &&
          peerAcc?.privacy?.showReadReceipts === true
        ) {
          peerReceipt = db.dmReadReceipts[ctx.threadKey]?.[ctx.peerKey];
        }
      }
      sendJson(res, 200, {
        ok: true,
        peer: ctx.kind === 'dm' ? ctx.peerKey : undefined,
        groupId: ctx.kind === 'group' ? ctx.groupId : undefined,
        messages: page.items.map((m) => hydrateMessage(m, fullThreadList)),
        hasMore: Boolean(page.hasMore),
        peerReceipt,
      });
      return;
    }

    // DMs & Groups: Global search across all conversations the active user belongs to
    if (req.method === 'GET' && reqPath === '/api/dms/search') {
      const parsedUrl = new URL(req.url ?? '/', 'http://localhost');
      const rawQuery = (parsedUrl.searchParams.get('q') ?? '').trim();
      const selfKey = activeUser.username.toLowerCase();
      if (!rawQuery) {
        sendJson(res, 200, { ok: true, results: [] });
        return;
      }

      const tokens = rawQuery.split(/\s+/).filter(Boolean);
      const fromFilters = [];
      const hasFilters = [];
      const textTerms = [];
      for (const tok of tokens) {
        const lower = tok.toLowerCase();
        if (lower.startsWith('from:') && lower.length > 5) {
          fromFilters.push(lower.slice(5).replace(/^@/, ''));
        } else if (lower.startsWith('has:') && lower.length > 4) {
          hasFilters.push(lower.slice(4));
        } else {
          textTerms.push(lower);
        }
      }

      /** @type {Map<string, { kind: 'dm' | 'group'; peerUsername?: string; peerDisplayName?: string; groupId?: string; groupName?: string }>} */
      const allowedMeta = new Map();
      for (const [gid, grp] of Object.entries(db.groupDms)) {
        if (grp && Array.isArray(grp.members) && grp.members.some((m) => m.toLowerCase() === selfKey)) {
          allowedMeta.set(groupThreadKey(gid), {
            kind: 'group',
            groupId: gid,
            groupName: grp.name,
          });
        }
      }
      for (const tKey of Object.keys(db.dms)) {
        if (tKey.startsWith('group:')) {
          continue;
        }
        const [u1, u2] = tKey.split('::');
        if (!u1 || !u2) continue;
        let peerKey = '';
        if (u1.toLowerCase() === selfKey) peerKey = u2.toLowerCase();
        else if (u2.toLowerCase() === selfKey) peerKey = u1.toLowerCase();
        if (!peerKey || peerKey === selfKey || hasAnyBlockBetween(selfKey, peerKey)) {
          continue;
        }
        const peerAcc = findAccountByUsername(peerKey);
        if (!peerAcc) continue;
        allowedMeta.set(tKey, {
          kind: 'dm',
          peerUsername: peerAcc.username,
          peerDisplayName: peerAcc.displayName,
        });
      }

      const candidates = sqliteStore.searchAllowedMessages(Array.from(allowedMeta.keys()), {
        fromFilters,
        textTerms,
        limit: 250,
      });

      const results = [];
      for (const hit of candidates) {
        const meta = allowedMeta.get(hit.threadKey);
        if (!meta) continue;
        const msg = hit.msg;
        if (hasFilters.length > 0 && !hasFilters.every((h) => serverMessageMatchesHasFilter(msg, h))) {
          continue;
        }
        const hydrated = hydrateMessage(msg, db.dms[hit.threadKey] ?? []);
        if (fromFilters.length > 0) {
          const uLow = hydrated.authorUsername.toLowerCase();
          const dLow = hydrated.authorName.toLowerCase();
          if (!fromFilters.every((f) => uLow.includes(f) || dLow.includes(f))) {
            continue;
          }
        }
        if (textTerms.length > 0) {
          const hay = [
            hydrated.content,
            hydrated.gif?.title ?? '',
            ...(hydrated.attachments ?? []).map((a) => a.name),
          ]
            .join(' ')
            .toLowerCase();
          if (!textTerms.every((t) => hay.includes(t))) {
            continue;
          }
        }
        results.push({ ...meta, message: hydrated });
        if (results.length >= 50) {
          break;
        }
      }

      sendJson(res, 200, { ok: true, results });
      return;
    }

    // Links: Rich preview card fetcher (SSRF-guarded + SQLite cached)
    if (req.method === 'GET' && reqPath === '/api/links/preview') {
      const selfKey = activeUser.username.toLowerCase();
      const rl = rateLimiter.check(`link-preview:${selfKey}`, 30, 60_000);
      if (!rl.ok) {
        res.setHeader('Retry-After', String(rl.retryAfterSec));
        sendJson(res, 429, { ok: false, error: 'Error: Link preview rate limit exceeded' });
        return;
      }
      const parsedUrl = new URL(req.url ?? '/', 'http://localhost');
      const targetUrl = (parsedUrl.searchParams.get('url') ?? '').trim();
      if (!targetUrl || targetUrl.length > 1000) {
        sendJson(res, 400, { ok: false, error: 'Error: Invalid URL' });
        return;
      }
      const cached = sqliteStore.getCachedLinkPreview(targetUrl);
      if (cached) {
        sendJson(res, 200, { ok: true, preview: cached });
        return;
      }
      const fetched = await fetchSafeLinkPreview(targetUrl);
      if (!fetched.ok || !fetched.preview) {
        sendJson(res, 400, { ok: false, error: fetched.error ?? 'Error: Preview unavailable' });
        return;
      }
      sqliteStore.saveCachedLinkPreview(targetUrl, fetched.preview);
      sendJson(res, 200, { ok: true, preview: fetched.preview });
      return;
    }

    // Voice: Configured STUN / TURN ICE servers
    if (req.method === 'GET' && reqPath === '/api/vc/ice-servers') {
      sendJson(res, 200, {
        ok: true,
        iceServers: getConfiguredIceServers(),
      });
      return;
    }

    // Voice: Enumerate local desktop monitors & open windows for visual screen share previews (loopback only)
    if (req.method === 'GET' && reqPath === '/api/vc/screen-sources') {
      if (!isLoopbackRequest(req)) {
        sendJson(res, 200, { ok: true, supported: false, reason: 'local_only', sources: [] });
        return;
      }
      const listed = await screenCaptureService.listSources();
      sendJson(res, 200, {
        ok: true,
        supported: listed.supported,
        sources: listed.sources,
      });
      return;
    }

    // DMs & Groups: Mark conversation read
    if (req.method === 'POST' && reqPath === '/api/dms/read') {
      const peerKey =
        typeof body.peerUsername === 'string' ? body.peerUsername.trim().toLowerCase() : '';
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const selfKey = activeUser.username.toLowerCase();
      let changed = false;

      if (groupId && db.unreadGroups[selfKey] && db.unreadGroups[selfKey][groupId]) {
        delete db.unreadGroups[selfKey][groupId];
        changed = true;
      } else if (peerKey && db.unreadDms[selfKey] && db.unreadDms[selfKey][peerKey]) {
        delete db.unreadDms[selfKey][peerKey];
        changed = true;
      }
      if (groupId && db.groupUnreadMentions?.[selfKey]?.[groupId]) {
        delete db.groupUnreadMentions[selfKey][groupId];
        changed = true;
      } else if (peerKey && db.unreadMentions?.[selfKey]?.[peerKey]) {
        delete db.unreadMentions[selfKey][peerKey];
        changed = true;
      }

      if (peerKey && activeUser.privacy?.showReadReceipts === true) {
        const peerAcc = findAccountByUsername(peerKey);
        const threadKey = dmThreadKey(selfKey, peerKey);
        const threadList = db.dms[threadKey] ?? [];
        const lastMsg = threadList[threadList.length - 1];
        if (lastMsg) {
          if (!db.dmReadReceipts[threadKey] || typeof db.dmReadReceipts[threadKey] !== 'object') {
            db.dmReadReceipts[threadKey] = {};
          }
          const prev = db.dmReadReceipts[threadKey][selfKey];
          if (!prev || prev.lastReadMessageId !== lastMsg.id) {
            const receipt = {
              readerUsername: selfKey,
              lastReadMessageId: lastMsg.id,
              readAt: Date.now(),
            };
            db.dmReadReceipts[threadKey][selfKey] = receipt;
            changed = true;
            if (peerAcc?.privacy?.showReadReceipts === true) {
              sendWsEventToUser(peerKey, {
                type: 'dm:read',
                threadUsers: [selfKey, peerKey],
                receipt,
              });
            }
          }
        }
      }

      if (changed) {
        saveDb(db);
        pushSnapshotToUser(selfKey);
      }
      sendJson(res, 200, {
        ok: true,
        snapshot: buildSocialSnapshot(selfKey),
      });
      return;
    }

    // GIFs: Toggle or add favorite GIF for active user
    if (req.method === 'POST' && reqPath === '/api/gifs/favorite') {
      const gifItem = sanitizeGifItem(body.gif);
      if (!gifItem) {
        sendJson(res, 400, { ok: false, error: 'Error: Invalid GIF URL' });
        return;
      }

      const selfKey = activeUser.username.toLowerCase();
      const mode = body.mode === 'add' ? 'add' : 'toggle';
      ensureGifDimensions(gifItem);
      const existing = db.favoriteGifs[selfKey] ?? [];
      const idx = existing.findIndex((g) => g.url === gifItem.url);
      let isFavorited = true;

      if (idx >= 0) {
        if (mode === 'toggle') {
          existing.splice(idx, 1);
          isFavorited = false;
        }
      } else {
        existing.unshift(gifItem);
        if (existing.length > 100) {
          existing.length = 100;
        }
      }

      db.favoriteGifs[selfKey] = existing;
      saveDb(db);
      pushSnapshotToUser(selfKey);

      sendJson(res, 200, {
        ok: true,
        isFavorited,
        snapshot: buildSocialSnapshot(selfKey),
      });
      return;
    }

    // GIFs: Search / list UGC GIFs stored in Redshift's database
    if (req.method === 'GET' && reqPath === '/api/gifs/search') {
      const parsedUrl = new URL(req.url ?? '/', 'http://localhost');
      const query = (parsedUrl.searchParams.get('q') ?? '').trim();
      const results = searchCommunityGifs(query);
      const totalIntact = query
        ? db.communityGifs.filter((entry) => isCommunityGifAssetIntact(entry)).length
        : results.length;
      sendJson(res, 200, {
        ok: true,
        total: totalIntact,
        results,
      });
      return;
    }

    // GIFs: Ensure/mint a unique shareable /gif/<code> link for any GIF item
    if (req.method === 'POST' && reqPath === '/api/gifs/link') {
      const gifItem = sanitizeGifItem(body.gif);
      if (!gifItem) {
        sendJson(res, 400, { ok: false, error: 'Error: Invalid GIF item' });
        return;
      }
      const { code, gif, created } = getOrMintGifShareCode(gifItem);
      if (created) {
        saveDb(db);
      }
      sendJson(res, 200, {
        ok: true,
        code,
        path: `/gif/${encodeURIComponent(code)}`,
        gif,
      });
      return;
    }

    // GIFs: Resolve a /gif/<code> share code back into a full GifItem
    if (req.method === 'GET' && reqPath === '/api/gifs/resolve') {
      const parsedUrl = new URL(req.url ?? '/', 'http://localhost');
      const rawCode = parsedUrl.searchParams.get('code') ?? '';
      const resolved = resolveGifByCode(rawCode);
      if (!resolved) {
        sendJson(res, 404, { ok: false, error: 'Error: GIF link not found' });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        code: rawCode.trim(),
        gif: resolved,
      });
      return;
    }

    // Threads: Mute or unmute notifications for a DM ("dm:<peer>") or Group ("group:<id>")
    if (req.method === 'POST' && reqPath === '/api/threads/mute') {
      const selfKey = activeUser.username.toLowerCase();
      const normThread = normalizeUserThreadKey(body.threadKey);
      if (!normThread) {
        sendJson(res, 400, { ok: false, error: 'Error: Invalid thread key' });
        return;
      }
      if (normThread.startsWith('group:')) {
        const gid = normThread.slice('group:'.length);
        const grp = db.groupDms[gid];
        if (!grp || !grp.members.some((m) => m.toLowerCase() === selfKey)) {
          sendJson(res, 404, { ok: false, error: 'Error: Group chat not found' });
          return;
        }
      } else {
        const peer = normThread.slice('dm:'.length);
        if (!findAccountByUsername(peer) || peer === selfKey) {
          sendJson(res, 404, { ok: false, error: 'Error: User not found' });
          return;
        }
      }

      const muteUntil = body.muteUntil;
      if (!db.mutedThreads[selfKey] || typeof db.mutedThreads[selfKey] !== 'object') {
        db.mutedThreads[selfKey] = {};
      }
      if (muteUntil === null || muteUntil === 0 || muteUntil === false) {
        delete db.mutedThreads[selfKey][normThread];
      } else if (muteUntil === -1 || muteUntil === -2) {
        db.mutedThreads[selfKey][normThread] = muteUntil;
      } else if (
        typeof muteUntil === 'number' &&
        Number.isFinite(muteUntil) &&
        muteUntil > Date.now()
      ) {
        db.mutedThreads[selfKey][normThread] = Math.floor(muteUntil);
      } else {
        sendJson(res, 400, { ok: false, error: 'Error: Invalid mute duration' });
        return;
      }

      saveDb(db);
      pushSnapshotToUser(selfKey);
      sendJson(res, 200, {
        ok: true,
        snapshot: buildSocialSnapshot(selfKey),
      });
      return;
    }

    // Threads: Hide a DM ("dm:<peer>") or Group ("group:<id>") until a new notification arrives
    if (req.method === 'POST' && reqPath === '/api/threads/hide') {
      const selfKey = activeUser.username.toLowerCase();
      const normThread = normalizeUserThreadKey(body.threadKey);
      if (!normThread) {
        sendJson(res, 400, { ok: false, error: 'Error: Invalid thread key' });
        return;
      }
      const hidden = body.hidden !== false;
      if (!db.hiddenThreads[selfKey] || typeof db.hiddenThreads[selfKey] !== 'object') {
        db.hiddenThreads[selfKey] = {};
      }
      if (hidden) {
        db.hiddenThreads[selfKey][normThread] = true;
      } else {
        delete db.hiddenThreads[selfKey][normThread];
      }

      saveDb(db);
      pushSnapshotToUser(selfKey);
      sendJson(res, 200, {
        ok: true,
        snapshot: buildSocialSnapshot(selfKey),
      });
      return;
    }

    // GIFs: Add one or more uploaded GIFs / videos / audio clips into Redshift's shared UGC database
    if (req.method === 'POST' && reqPath === '/api/gifs/add') {
      const rawItems = Array.isArray(body.items)
        ? body.items
        : [
            {
              uploadId: body.uploadId,
              title: body.title,
              tags: body.tags,
              playbackSpeed: body.playbackSpeed,
              durationSec: body.durationSec,
              width: body.width,
              height: body.height,
            },
          ];

      if (rawItems.length === 0 || rawItems.length > 25) {
        sendJson(res, 400, { ok: false, error: 'Error: Select between 1 and 25 GIFs to import' });
        return;
      }

      const selfKey = activeUser.username.toLowerCase();
      /** @type {StoredCommunityGif[]} */
      const added = [];
      const now = Date.now();

      for (const rawItem of rawItems) {
        if (!rawItem || typeof rawItem !== 'object') {
          sendJson(res, 400, { ok: false, error: 'Error: Invalid GIF submission item' });
          return;
        }
        const uploadId = typeof rawItem.uploadId === 'string' ? rawItem.uploadId.trim() : '';
        const meta = uploadId ? db.uploads[uploadId] : undefined;
        if (!meta || meta.uploadedBy.toLowerCase() !== selfKey) {
          sendJson(res, 404, { ok: false, error: 'Error: Uploaded media not found' });
          return;
        }

        const isAllowedMedia =
          meta.kind === 'image' ||
          meta.kind === 'video' ||
          meta.kind === 'audio' ||
          /\.(gif|mp4|m4v|webm|mov|mkv|avi|ogv|wmv|flv|wav|mp3|ogg|flac|m4a|aac|weba|png|jpe?g|webp)$/i.test(
            meta.name || '',
          );
        if (!isAllowedMedia) {
          sendJson(res, 400, {
            ok: false,
            error: 'Error: Unsupported file type for Redshift GIFs',
          });
          return;
        }

        const rawSpeed = Number(rawItem.playbackSpeed);
        const playbackSpeed =
          Number.isFinite(rawSpeed) && rawSpeed >= 0.25 && rawSpeed <= 4
            ? Math.round(rawSpeed * 100) / 100
            : 1;

        const srcPath = path.join(UPLOADS_DIR, meta.diskName);
        const isNativeGif = meta.mime === 'image/gif' || /\.gif$/i.test(meta.name || '');
        const isStaticImage = meta.kind === 'image' && !isNativeGif;
        const isAudioOrVideo = !isNativeGif && !isStaticImage;

        let probed = { durationSec: null, width: undefined, height: undefined, hasVideo: false, hasAudio: false };
        const clientDur =
          typeof rawItem.durationSec === 'number' && Number.isFinite(rawItem.durationSec)
            ? rawItem.durationSec
            : null;
        if (isAudioOrVideo) {
          probed = await probeMediaMeta(srcPath);
          const effectiveDur =
            probed.durationSec !== null && clientDur !== null
              ? Math.max(probed.durationSec, clientDur)
              : (probed.durationSec ?? clientDur);
          if (effectiveDur !== null && effectiveDur > MAX_GIF_DURATION_SEC + 0.5) {
            sendJson(res, 400, {
              ok: false,
              error: `Error: "${meta.name}" is longer than the 5-minute (5:00) maximum for GIFs`,
            });
            return;
          }
        }

        let finalUploadId = meta.id;
        let finalMediaKind = isAudioOrVideo ? 'video' : 'gif';
        let speedBakedIntoFile = false;
        let finalWidth =
          probed.width ??
          (typeof rawItem.width === 'number' && Number.isInteger(rawItem.width) && rawItem.width > 0
            ? rawItem.width
            : undefined);
        let finalHeight =
          probed.height ??
          (typeof rawItem.height === 'number' && Number.isInteger(rawItem.height) && rawItem.height > 0
            ? rawItem.height
            : undefined);

        if (isNativeGif) {
          const dims = readGifDimensionsFromFile(srcPath);
          if (dims) {
            finalWidth = dims.width;
            finalHeight = dims.height;
          }
          if (Math.abs(playbackSpeed - 1) >= 0.02) {
            const newId = crypto.randomUUID();
            const newDisk = `${newId}.gif`;
            const dstPath = path.join(UPLOADS_DIR, newDisk);
            if (scaleGifFileSpeed(srcPath, dstPath, playbackSpeed)) {
              const st = fs.statSync(dstPath);
              db.uploads[newId] = {
                id: newId,
                diskName: newDisk,
                name: meta.name,
                mime: 'image/gif',
                size: st.size,
                kind: 'image',
                uploadedBy: selfKey,
                createdAt: now,
              };
              finalUploadId = newId;
              speedBakedIntoFile = true;
            }
          }
        } else if (isAudioOrVideo) {
          const isAudioOnly = meta.kind === 'audio' || (!probed.hasVideo && probed.hasAudio);
          const newId = crypto.randomUUID();
          const newDisk = `${newId}.webm`;
          const dstPath = path.join(UPLOADS_DIR, newDisk);
          const convertedOk = await convertMediaToLoopingGifWebm(srcPath, dstPath, {
            playbackSpeed,
            isAudioOnly,
          });
          if (convertedOk && fs.existsSync(dstPath)) {
            const st = fs.statSync(dstPath);
            const convProbe = await probeMediaMeta(dstPath);
            if (convProbe.width && convProbe.height) {
              finalWidth = convProbe.width;
              finalHeight = convProbe.height;
            } else if (isAudioOnly) {
              finalWidth = 480;
              finalHeight = 180;
            }
            db.uploads[newId] = {
              id: newId,
              diskName: newDisk,
              name: meta.name.replace(/\.[^.]+$/, '') + '.webm',
              mime: 'video/webm',
              size: st.size,
              kind: 'video',
              uploadedBy: selfKey,
              createdAt: now,
            };
            finalUploadId = newId;
            speedBakedIntoFile = true;
          }
          finalMediaKind = 'video';
        }

        const effectiveDurationSec =
          probed.durationSec !== null
            ? Math.min(MAX_GIF_DURATION_SEC, Math.round((probed.durationSec / playbackSpeed) * 10) / 10)
            : typeof rawItem.durationSec === 'number' && Number.isFinite(rawItem.durationSec)
              ? Math.min(MAX_GIF_DURATION_SEC, Math.round(rawItem.durationSec * 10) / 10)
              : undefined;

        const entry = {
          id: crypto.randomUUID(),
          uploadId: finalUploadId,
          url: `/api/uploads/${finalUploadId}`,
          title: normalizeGifTitle(rawItem.title, meta.name),
          width: finalWidth,
          height: finalHeight,
          mediaKind: finalMediaKind,
          playbackSpeed: !speedBakedIntoFile && playbackSpeed !== 1 ? playbackSpeed : undefined,
          durationSec: effectiveDurationSec,
          tags: normalizeGifTags(rawItem.tags),
          uploadedBy: selfKey,
          createdAt: now,
        };
        added.push(entry);
      }

      db.communityGifs.unshift(...added);
      saveDb(db);
      broadcastGifsUpdated();

      sendJson(res, 200, {
        ok: true,
        added,
        total: db.communityGifs.length,
      });
      return;
    }

    // GIFs: Remove a UGC GIF submitted by the active user
    if (req.method === 'POST' && reqPath === '/api/gifs/remove') {
      const gifId = typeof body.id === 'string' ? body.id.trim() : '';
      const selfKey = activeUser.username.toLowerCase();
      const idx = db.communityGifs.findIndex((g) => g.id === gifId);
      if (idx < 0) {
        sendJson(res, 404, { ok: false, error: 'Error: GIF not found' });
        return;
      }
      const target = db.communityGifs[idx];
      if (target.uploadedBy.toLowerCase() !== selfKey) {
        sendJson(res, 403, { ok: false, error: 'Error: You can only remove GIFs you submitted' });
        return;
      }

      db.communityGifs.splice(idx, 1);
      if (target.uploadId) {
        cleanupOrphanedUploads([target.uploadId]);
      }
      saveDb(db);
      broadcastGifsUpdated();

      sendJson(res, 200, {
        ok: true,
        total: db.communityGifs.length,
      });
      return;
    }

    // DMs & Groups: Send message (text, up to 10 attachments, GIF, and/or reply)
    if (req.method === 'POST' && reqPath === '/api/dms/send') {
      const senderRateKey = activeUser.username.toLowerCase();
      const sendLimit = rateLimiter.check(`send:${senderRateKey}`, MSG_RATE_LIMIT, 15_000);
      if (!sendLimit.ok) {
        res.setHeader('Retry-After', String(sendLimit.retryAfterSec));
        sendJson(res, 429, {
          ok: false,
          error: `Error: Slow down! Please wait ${sendLimit.retryAfterSec}s before sending more messages`,
        });
        return;
      }
      const toKey =
        typeof body.toUsername === 'string' ? body.toUsername.trim().toLowerCase() : '';
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const content = typeof body.content === 'string' ? body.content.trim() : '';
      const rawArray = Array.isArray(body.imageDataUrls)
        ? body.imageDataUrls
        : typeof body.imageDataUrl === 'string' && body.imageDataUrl.trim()
          ? [body.imageDataUrl]
          : [];
      const rawAttIds = Array.isArray(body.attachmentIds)
        ? body.attachmentIds.filter((id) => typeof id === 'string').map((id) => id.trim())
        : [];

      if (rawArray.length + rawAttIds.length > MAX_DM_IMAGES_PER_MESSAGE) {
        sendJson(res, 400, {
          ok: false,
          error: `Error: You can attach at most ${MAX_DM_IMAGES_PER_MESSAGE} files per message`,
        });
        return;
      }

      /** @type {string[]} */
      const imageDataUrls = [];
      for (const item of rawArray) {
        if (typeof item === 'string' && item.trim().startsWith('data:image/')) {
          const clean = item.trim();
          if (clean.length > MAX_MESSAGE_IMAGE_CHARS) {
            sendJson(res, 413, { ok: false, error: 'Error: Attached image is too large' });
            return;
          }
          imageDataUrls.push(clean);
        }
      }

      const senderKey = activeUser.username.toLowerCase();
      /** @type {string[]} */
      const validAttachmentIds = [];
      for (const attId of rawAttIds) {
        const meta = db.uploads[attId];
        if (!meta || meta.uploadedBy.toLowerCase() !== senderKey) {
          sendJson(res, 400, { ok: false, error: 'Error: Uploaded attachment not found' });
          return;
        }
        validAttachmentIds.push(attId);
      }

      const gifItem = body.gif ? sanitizeGifItem(body.gif) : null;

      const ctx = resolveThreadContext(senderKey, { peerUsername: toKey, groupId });
      if (!ctx.ok) {
        sendJson(res, ctx.status ?? 403, { ok: false, error: ctx.error });
        return;
      }

      if (!content && imageDataUrls.length === 0 && validAttachmentIds.length === 0 && !gifItem) {
        sendJson(res, 400, { ok: false, error: 'Error: Message cannot be empty' });
        return;
      }

      if (content.length > 4000) {
        sendJson(res, 400, { ok: false, error: 'Error: Message is too long (max 4000 chars)' });
        return;
      }

      if (!Array.isArray(db.dms[ctx.threadKey])) {
        db.dms[ctx.threadKey] = [];
      }
      const threadList = db.dms[ctx.threadKey];

      let storedReply;
      const replyToMessageId =
        typeof body.replyToMessageId === 'string' ? body.replyToMessageId.trim() : '';
      if (replyToMessageId) {
        const refMsg = threadList.find((m) => m.id === replyToMessageId);
        if (refMsg) {
          const refHasImg = Boolean(
            refMsg.imageDataUrl ||
              (Array.isArray(refMsg.imageDataUrls) && refMsg.imageDataUrls.length > 0),
          );
          const refHasAnyAtt =
            refHasImg ||
            (Array.isArray(refMsg.attachmentIds) && refMsg.attachmentIds.length > 0) ||
            Boolean(refMsg.gif);
          storedReply = {
            messageId: refMsg.id,
            authorUsername: refMsg.authorUsername,
            content: refMsg.content,
            hasImage: refHasImg,
            hasAttachment: refHasAnyAtt,
          };
        }
      }

      let storedStatusReply;
      if (body.statusReply && typeof body.statusReply === 'object') {
        const srUserRaw =
          typeof body.statusReply.authorUsername === 'string'
            ? body.statusReply.authorUsername.trim()
            : '';
        const srAcc = srUserRaw ? findAccountByUsername(srUserRaw) : undefined;
        const srEmoji = sanitizeSingleEmoji(body.statusReply.emoji);
        const srText =
          typeof body.statusReply.text === 'string'
            ? body.statusReply.text.replace(/\s+/g, ' ').trim().slice(0, 128)
            : '';
        if ((srAcc || srUserRaw) && (srEmoji || srText)) {
          storedStatusReply = {
            authorUsername: srAcc?.username ?? srUserRaw.slice(0, 40),
            authorName:
              srAcc?.displayName ??
              (typeof body.statusReply.authorName === 'string' && body.statusReply.authorName.trim()
                ? body.statusReply.authorName.trim().slice(0, 40)
                : srUserRaw.slice(0, 40)),
            emoji: srEmoji || undefined,
            text: srText || undefined,
          };
        }
      }

      let voiceNote;
      if (body.voiceNote && typeof body.voiceNote === 'object') {
        const dur = Number(body.voiceNote.durationSec);
        const rawWave = Array.isArray(body.voiceNote.waveform) ? body.voiceNote.waveform : [];
        if (Number.isFinite(dur) && dur >= 0 && dur <= 3600) {
          voiceNote = {
            durationSec: Math.round(dur * 10) / 10,
            waveform: rawWave
              .slice(0, 64)
              .map((n) => Math.min(1, Math.max(0.05, Number(n) || 0.05))),
          };
        }
      }

      let finalContent = content;
      let finalGif = gifItem ?? undefined;
      if (!finalGif && finalContent) {
        const shareCode = extractGifShareCode(finalContent);
        const resolved = shareCode ? resolveGifByCode(shareCode) : null;
        if (resolved) {
          finalGif = resolved;
          finalContent = '';
        }
      }

      const validAttSet = new Set(validAttachmentIds);
      const validSpoilerIds = Array.isArray(body.spoilerAttachmentIds)
        ? Array.from(
            new Set(
              body.spoilerAttachmentIds
                .filter((id) => typeof id === 'string')
                .map((id) => id.trim())
                .filter((id) => validAttSet.has(id)),
            ),
          )
        : [];

      const msgNow = Date.now();
      /** @type {StoredMessage} */
      const stored = {
        id: crypto.randomUUID(),
        authorUsername: senderKey,
        content: finalContent,
        imageDataUrls: imageDataUrls.length > 0 ? imageDataUrls : undefined,
        attachmentIds: validAttachmentIds.length > 0 ? validAttachmentIds : undefined,
        spoilerAttachmentIds: validSpoilerIds.length > 0 ? validSpoilerIds : undefined,
        gif: finalGif,
        replyTo: storedReply,
        statusReply: storedStatusReply,
        voiceNote,
        timestamp: msgNow,
        reactions: {},
      };

      threadList.push(stored);
      sqliteStore.insertMessage(ctx.threadKey, stored);
      const mentionedUsers = new Set(extractMentionUsernames(finalContent));
      const replyTargetUser = storedReply?.authorUsername?.toLowerCase() ?? '';
      if (!db.unreadMentions || typeof db.unreadMentions !== 'object') {
        db.unreadMentions = {};
      }
      if (!db.groupUnreadMentions || typeof db.groupUnreadMentions !== 'object') {
        db.groupUnreadMentions = {};
      }

      if (ctx.kind === 'group') {
        for (const member of ctx.participants) {
          const memberKey = member.toLowerCase();
          touchThreadActivityForUser(memberKey, `group:${ctx.groupId}`, msgNow, { unhide: true });
          if (memberKey === senderKey) {
            continue;
          }
          if (!db.unreadGroups[memberKey] || typeof db.unreadGroups[memberKey] !== 'object') {
            db.unreadGroups[memberKey] = {};
          }
          db.unreadGroups[memberKey][ctx.groupId] =
            (db.unreadGroups[memberKey][ctx.groupId] ?? 0) + 1;

          if (mentionedUsers.has(memberKey) || replyTargetUser === memberKey) {
            if (!db.groupUnreadMentions[memberKey] || typeof db.groupUnreadMentions[memberKey] !== 'object') {
              db.groupUnreadMentions[memberKey] = {};
            }
            db.groupUnreadMentions[memberKey][ctx.groupId] =
              (db.groupUnreadMentions[memberKey][ctx.groupId] ?? 0) + 1;
          }
        }
      } else {
        if (!db.unreadDms[ctx.peerKey] || typeof db.unreadDms[ctx.peerKey] !== 'object') {
          db.unreadDms[ctx.peerKey] = {};
        }
        db.unreadDms[ctx.peerKey][senderKey] = (db.unreadDms[ctx.peerKey][senderKey] ?? 0) + 1;
        if (mentionedUsers.has(ctx.peerKey) || replyTargetUser === ctx.peerKey) {
          if (!db.unreadMentions[ctx.peerKey] || typeof db.unreadMentions[ctx.peerKey] !== 'object') {
            db.unreadMentions[ctx.peerKey] = {};
          }
          db.unreadMentions[ctx.peerKey][senderKey] =
            (db.unreadMentions[ctx.peerKey][senderKey] ?? 0) + 1;
        }
        recordOpenDmPeer(senderKey, ctx.peerKey);
        recordOpenDmPeer(ctx.peerKey, senderKey);
        touchThreadActivityForUser(senderKey, `dm:${ctx.peerKey}`, msgNow, { unhide: true });
        touchThreadActivityForUser(ctx.peerKey, `dm:${senderKey}`, msgNow, { unhide: true });
      }

      const hydrated = hydrateMessage(stored, threadList);
      const wsEvent =
        ctx.kind === 'group'
          ? { type: 'dm:message', groupId: ctx.groupId, message: hydrated }
          : { type: 'dm:message', threadUsers: [senderKey, ctx.peerKey], message: hydrated };

      // Push real-time DM event FIRST so recipients receive it & badge updates in <10ms.
      for (const participant of ctx.participants) {
        sendWsEventToUser(participant, wsEvent);
      }

      if (ctx.kind === 'group') {
        emitGroupTypingState(senderKey, ctx.groupId, false);
      } else {
        emitTypingState(senderKey, ctx.peerKey, false);
      }

      for (const participant of ctx.participants) {
        pushSnapshotToUser(participant);
      }

      saveDb(db);

      sendJson(res, 200, {
        ok: true,
        message: hydrated,
      });
      return;
    }

    // DMs & Groups: Edit own message
    if (req.method === 'POST' && reqPath === '/api/dms/edit') {
      const peerKey =
        typeof body.peerUsername === 'string' ? body.peerUsername.trim().toLowerCase() : '';
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : '';
      const content = typeof body.content === 'string' ? body.content.trim() : '';
      const selfKey = activeUser.username.toLowerCase();

      const ctx = resolveThreadContext(selfKey, { peerUsername: peerKey, groupId });
      if (!ctx.ok) {
        sendJson(res, ctx.status ?? 403, { ok: false, error: ctx.error });
        return;
      }

      const list = db.dms[ctx.threadKey] ?? [];
      const target = list.find((m) => m.id === messageId);
      if (!target) {
        sendJson(res, 404, { ok: false, error: 'Error: Message not found' });
        return;
      }

      if (target.callLog) {
        sendJson(res, 400, { ok: false, error: 'Error: Call logs cannot be edited' });
        return;
      }

      if (target.authorUsername.toLowerCase() !== selfKey) {
        sendJson(res, 403, { ok: false, error: 'Error: You can only edit your own messages' });
        return;
      }

      const hasStoredAttachments = Boolean(
        target.imageDataUrl ||
          (Array.isArray(target.imageDataUrls) && target.imageDataUrls.length > 0) ||
          (Array.isArray(target.attachmentIds) && target.attachmentIds.length > 0) ||
          target.gif,
      );
      if (!content && !hasStoredAttachments) {
        sendJson(res, 400, { ok: false, error: 'Error: Message cannot be empty' });
        return;
      }

      if (content.length > 4000) {
        sendJson(res, 400, { ok: false, error: 'Error: Message is too long (max 4000 chars)' });
        return;
      }

      target.content = content;
      target.editedAt = Date.now();
      sqliteStore.updateMessage(target);
      saveDb(db);

      const hydrated = hydrateMessage(target, list);
      const wsEvent =
        ctx.kind === 'group'
          ? { type: 'dm:edit', groupId: ctx.groupId, message: hydrated }
          : { type: 'dm:edit', threadUsers: [selfKey, ctx.peerKey], message: hydrated };
      for (const participant of ctx.participants) {
        sendWsEventToUser(participant, wsEvent);
      }

      sendJson(res, 200, { ok: true, message: hydrated });
      return;
    }

    // DMs & Groups: Toggle spoiler blur on an attachment in own message
    if (req.method === 'POST' && reqPath === '/api/dms/spoiler') {
      const peerKey =
        typeof body.peerUsername === 'string' ? body.peerUsername.trim().toLowerCase() : '';
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : '';
      const attachmentId = typeof body.attachmentId === 'string' ? body.attachmentId.trim() : '';
      const selfKey = activeUser.username.toLowerCase();

      const ctx = resolveThreadContext(selfKey, { peerUsername: peerKey, groupId });
      if (!ctx.ok) {
        sendJson(res, ctx.status ?? 403, { ok: false, error: ctx.error });
        return;
      }

      const list = db.dms[ctx.threadKey] ?? [];
      const target = list.find((m) => m.id === messageId);
      if (!target) {
        sendJson(res, 404, { ok: false, error: 'Error: Message not found' });
        return;
      }
      if (target.authorUsername.toLowerCase() !== selfKey) {
        sendJson(res, 403, {
          ok: false,
          error: 'Error: You can only toggle spoilers on your own messages',
        });
        return;
      }
      const attIds = Array.isArray(target.attachmentIds) ? target.attachmentIds : [];
      if (!attachmentId || !attIds.includes(attachmentId)) {
        sendJson(res, 404, { ok: false, error: 'Error: Attachment not found on message' });
        return;
      }

      const nextSet = new Set(
        Array.isArray(target.spoilerAttachmentIds) ? target.spoilerAttachmentIds : [],
      );
      const nextSpoiler =
        typeof body.spoiler === 'boolean' ? body.spoiler : !nextSet.has(attachmentId);
      if (nextSpoiler) {
        nextSet.add(attachmentId);
      } else {
        nextSet.delete(attachmentId);
      }
      target.spoilerAttachmentIds = nextSet.size > 0 ? Array.from(nextSet) : undefined;
      sqliteStore.updateMessage(target);
      saveDb(db);

      const hydrated = hydrateMessage(target, list);
      const wsEvent =
        ctx.kind === 'group'
          ? { type: 'dm:edit', groupId: ctx.groupId, message: hydrated }
          : { type: 'dm:edit', threadUsers: [selfKey, ctx.peerKey], message: hydrated };
      for (const participant of ctx.participants) {
        sendWsEventToUser(participant, wsEvent);
      }

      sendJson(res, 200, { ok: true, message: hydrated });
      return;
    }

    // DMs & Groups: Forward a message to up to 10 DMs or Group Chats
    if (req.method === 'POST' && reqPath === '/api/dms/forward') {
      const selfKey = activeUser.username.toLowerCase();
      const sendLimit = rateLimiter.check(`send:${selfKey}`, MSG_RATE_LIMIT, 15_000);
      if (!sendLimit.ok) {
        res.setHeader('Retry-After', String(sendLimit.retryAfterSec));
        sendJson(res, 429, {
          ok: false,
          error: `Error: Slow down! Please wait ${sendLimit.retryAfterSec}s before forwarding`,
        });
        return;
      }

      const sourcePeerKey =
        typeof body.sourcePeerUsername === 'string'
          ? body.sourcePeerUsername.trim().toLowerCase()
          : '';
      const sourceGroupId =
        typeof body.sourceGroupId === 'string' ? body.sourceGroupId.trim() : '';
      const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : '';
      const rawTargets = Array.isArray(body.targets) ? body.targets : [];
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '';

      if (!messageId || rawTargets.length === 0) {
        sendJson(res, 400, { ok: false, error: 'Error: Select at least one chat to forward to' });
        return;
      }

      // Deduplicate targets and enforce max 10 recipients.
      const dedupedTargets = [];
      const seenKeys = new Set();
      for (const t of rawTargets) {
        if (!t || typeof t !== 'object') {
          continue;
        }
        if (t.kind === 'group' && typeof t.groupId === 'string' && t.groupId.trim()) {
          const gid = t.groupId.trim();
          const key = `group:${gid}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            dedupedTargets.push({ kind: 'group', groupId: gid });
          }
        } else if (t.kind === 'dm' && typeof t.username === 'string' && t.username.trim()) {
          const uname = t.username.trim().toLowerCase();
          const key = `dm:${uname}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            dedupedTargets.push({ kind: 'dm', username: uname });
          }
        }
      }

      if (dedupedTargets.length === 0) {
        sendJson(res, 400, { ok: false, error: 'Error: Select at least one valid chat' });
        return;
      }
      if (dedupedTargets.length > 10) {
        sendJson(res, 400, {
          ok: false,
          error: 'Error: You can forward to at most 10 chats at a time',
        });
        return;
      }

      const sourceCtx = resolveThreadContext(selfKey, {
        peerUsername: sourcePeerKey,
        groupId: sourceGroupId,
      });
      if (!sourceCtx.ok) {
        sendJson(res, sourceCtx.status ?? 403, { ok: false, error: sourceCtx.error });
        return;
      }

      const sourceList = db.dms[sourceCtx.threadKey] ?? [];
      const sourceMsg = sourceList.find((m) => m.id === messageId);
      if (!sourceMsg || sourceMsg.callLog || sourceMsg.systemEvent) {
        sendJson(res, 404, { ok: false, error: 'Error: Message cannot be forwarded' });
        return;
      }

      const origAuthorAcc = findAccountByUsername(sourceMsg.authorUsername);
      const forwardedMeta = sourceMsg.forwarded
        ? { ...sourceMsg.forwarded }
        : {
            originalAuthorUsername: origAuthorAcc?.username ?? sourceMsg.authorUsername,
            originalAuthorName: origAuthorAcc?.displayName ?? sourceMsg.authorUsername,
            originalTimestamp: sourceMsg.timestamp,
            sourceKind: sourceCtx.kind,
          };

      const copiedAttachmentIds = Array.isArray(sourceMsg.attachmentIds)
        ? sourceMsg.attachmentIds.filter((id) => Boolean(db.uploads[id]))
        : [];
      const copiedSpoilerIds = Array.isArray(sourceMsg.spoilerAttachmentIds)
        ? sourceMsg.spoilerAttachmentIds.filter((id) => copiedAttachmentIds.includes(id))
        : [];
      const copiedImages = Array.isArray(sourceMsg.imageDataUrls)
        ? [...sourceMsg.imageDataUrls]
        : sourceMsg.imageDataUrl
          ? [sourceMsg.imageDataUrl]
          : [];

      const pushedUsers = new Set();
      let forwardedCount = 0;

      const deliverMessageToTarget = (targetCtx, storedObj) => {
        if (!Array.isArray(db.dms[targetCtx.threadKey])) {
          db.dms[targetCtx.threadKey] = [];
        }
        const tList = db.dms[targetCtx.threadKey];
        tList.push(storedObj);
        sqliteStore.insertMessage(targetCtx.threadKey, storedObj);

        const mentionedUsers = new Set(extractMentionUsernames(storedObj.content || ''));
        if (!db.unreadMentions || typeof db.unreadMentions !== 'object') {
          db.unreadMentions = {};
        }
        if (!db.groupUnreadMentions || typeof db.groupUnreadMentions !== 'object') {
          db.groupUnreadMentions = {};
        }

        if (targetCtx.kind === 'group') {
          if (db.unreadGroups[selfKey]?.[targetCtx.groupId]) {
            delete db.unreadGroups[selfKey][targetCtx.groupId];
          }
          if (db.groupUnreadMentions?.[selfKey]?.[targetCtx.groupId]) {
            delete db.groupUnreadMentions[selfKey][targetCtx.groupId];
          }
          for (const member of targetCtx.participants) {
            const memberKey = member.toLowerCase();
            touchThreadActivityForUser(memberKey, `group:${targetCtx.groupId}`, storedObj.timestamp, {
              unhide: true,
            });
            pushedUsers.add(memberKey);
            if (memberKey === selfKey) {
              continue;
            }
            if (!db.unreadGroups[memberKey] || typeof db.unreadGroups[memberKey] !== 'object') {
              db.unreadGroups[memberKey] = {};
            }
            db.unreadGroups[memberKey][targetCtx.groupId] =
              (db.unreadGroups[memberKey][targetCtx.groupId] ?? 0) + 1;
            if (mentionedUsers.has(memberKey)) {
              if (
                !db.groupUnreadMentions[memberKey] ||
                typeof db.groupUnreadMentions[memberKey] !== 'object'
              ) {
                db.groupUnreadMentions[memberKey] = {};
              }
              db.groupUnreadMentions[memberKey][targetCtx.groupId] =
                (db.groupUnreadMentions[memberKey][targetCtx.groupId] ?? 0) + 1;
            }
          }
        } else {
          if (db.unreadDms[selfKey]?.[targetCtx.peerKey]) {
            delete db.unreadDms[selfKey][targetCtx.peerKey];
          }
          if (db.unreadMentions?.[selfKey]?.[targetCtx.peerKey]) {
            delete db.unreadMentions[selfKey][targetCtx.peerKey];
          }
          if (!db.unreadDms[targetCtx.peerKey] || typeof db.unreadDms[targetCtx.peerKey] !== 'object') {
            db.unreadDms[targetCtx.peerKey] = {};
          }
          db.unreadDms[targetCtx.peerKey][selfKey] =
            (db.unreadDms[targetCtx.peerKey][selfKey] ?? 0) + 1;
          if (mentionedUsers.has(targetCtx.peerKey)) {
            if (!db.unreadMentions[targetCtx.peerKey] || typeof db.unreadMentions[targetCtx.peerKey] !== 'object') {
              db.unreadMentions[targetCtx.peerKey] = {};
            }
            db.unreadMentions[targetCtx.peerKey][selfKey] =
              (db.unreadMentions[targetCtx.peerKey][selfKey] ?? 0) + 1;
          }
          recordOpenDmPeer(selfKey, targetCtx.peerKey);
          recordOpenDmPeer(targetCtx.peerKey, selfKey);
          touchThreadActivityForUser(selfKey, `dm:${targetCtx.peerKey}`, storedObj.timestamp, {
            unhide: true,
          });
          touchThreadActivityForUser(targetCtx.peerKey, `dm:${selfKey}`, storedObj.timestamp, {
            unhide: true,
          });
          pushedUsers.add(selfKey);
          pushedUsers.add(targetCtx.peerKey);
        }

        const hydrated = hydrateMessage(storedObj, tList);
        const wsEvent =
          targetCtx.kind === 'group'
            ? { type: 'dm:message', groupId: targetCtx.groupId, message: hydrated }
            : { type: 'dm:message', threadUsers: [selfKey, targetCtx.peerKey], message: hydrated };
        for (const participant of targetCtx.participants) {
          sendWsEventToUser(participant, wsEvent);
        }
      };

      const baseNow = Date.now();
      for (const targetSpec of dedupedTargets) {
        const targetCtx = resolveThreadContext(
          selfKey,
          targetSpec.kind === 'group'
            ? { groupId: targetSpec.groupId }
            : { peerUsername: targetSpec.username },
        );
        if (!targetCtx.ok) {
          continue;
        }
        const fwdMsg = {
          id: crypto.randomUUID(),
          authorUsername: selfKey,
          content: sourceMsg.content || '',
          imageDataUrls: copiedImages.length > 0 ? [...copiedImages] : undefined,
          attachmentIds: copiedAttachmentIds.length > 0 ? [...copiedAttachmentIds] : undefined,
          spoilerAttachmentIds: copiedSpoilerIds.length > 0 ? [...copiedSpoilerIds] : undefined,
          gif: sourceMsg.gif ? { ...sourceMsg.gif } : undefined,
          voiceNote: sourceMsg.voiceNote
            ? {
                durationSec: sourceMsg.voiceNote.durationSec,
                waveform: [...sourceMsg.voiceNote.waveform],
              }
            : undefined,
          forwarded: { ...forwardedMeta },
          timestamp: baseNow,
          reactions: {},
        };
        deliverMessageToTarget(targetCtx, fwdMsg);
        if (note) {
          const noteMsg = {
            id: crypto.randomUUID(),
            authorUsername: selfKey,
            content: note,
            timestamp: baseNow + 1,
            reactions: {},
          };
          deliverMessageToTarget(targetCtx, noteMsg);
        }
        forwardedCount += 1;
      }

      if (forwardedCount === 0) {
        sendJson(res, 403, { ok: false, error: 'Error: Could not forward to the selected chats' });
        return;
      }

      saveDb(db);
      for (const u of pushedUsers) {
        pushSnapshotToUser(u);
      }

      sendJson(res, 200, {
        ok: true,
        forwardedCount,
        snapshot: buildSocialSnapshot(selfKey),
      });
      return;
    }

    // DMs & Groups: Delete own message
    if (req.method === 'POST' && reqPath === '/api/dms/delete') {
      const peerKey =
        typeof body.peerUsername === 'string' ? body.peerUsername.trim().toLowerCase() : '';
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : '';
      const selfKey = activeUser.username.toLowerCase();

      const ctx = resolveThreadContext(selfKey, { peerUsername: peerKey, groupId });
      if (!ctx.ok) {
        sendJson(res, ctx.status ?? 403, { ok: false, error: ctx.error });
        return;
      }

      const list = db.dms[ctx.threadKey] ?? [];
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: 'Error: Message not found' });
        return;
      }

      if (list[idx].authorUsername.toLowerCase() !== selfKey) {
        sendJson(res, 403, { ok: false, error: 'Error: You can only delete your own messages' });
        return;
      }

      const [deletedMsg] = list.splice(idx, 1);
      sqliteStore.deleteMessage(deletedMsg.id);
      const orphanCandidates = Array.isArray(deletedMsg?.attachmentIds)
        ? [...deletedMsg.attachmentIds]
        : [];
      if (
        typeof deletedMsg?.gif?.url === 'string' &&
        deletedMsg.gif.url.startsWith('/api/uploads/')
      ) {
        const gifAttId = deletedMsg.gif.url.slice('/api/uploads/'.length).split(/[/?#]/)[0];
        if (gifAttId) {
          orphanCandidates.push(gifAttId);
        }
      }
      if (orphanCandidates.length > 0) {
        cleanupOrphanedUploads(orphanCandidates);
      }
      saveDb(db);

      const wsEvent =
        ctx.kind === 'group'
          ? { type: 'dm:delete', groupId: ctx.groupId, messageId }
          : { type: 'dm:delete', threadUsers: [selfKey, ctx.peerKey], messageId };
      for (const participant of ctx.participants) {
        sendWsEventToUser(participant, wsEvent);
      }

      sendJson(res, 200, { ok: true });
      return;
    }

    // DMs & Groups: Pin or unpin message
    if (req.method === 'POST' && reqPath === '/api/dms/pin') {
      const peerKey =
        typeof body.peerUsername === 'string' ? body.peerUsername.trim().toLowerCase() : '';
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : '';
      const selfKey = activeUser.username.toLowerCase();

      const ctx = resolveThreadContext(selfKey, { peerUsername: peerKey, groupId });
      if (!ctx.ok) {
        sendJson(res, ctx.status ?? 403, { ok: false, error: ctx.error });
        return;
      }

      const list = db.dms[ctx.threadKey] ?? [];
      const target = list.find((m) => m.id === messageId);
      if (!target) {
        sendJson(res, 404, { ok: false, error: 'Error: Message not found' });
        return;
      }

      const nextPinned = typeof body.pinned === 'boolean' ? body.pinned : !target.pinned;
      if (nextPinned) {
        target.pinned = true;
        target.pinnedAt = Date.now();
        target.pinnedBy = selfKey;
      } else {
        delete target.pinned;
        delete target.pinnedAt;
        delete target.pinnedBy;
      }
      sqliteStore.updateMessage(target);
      saveDb(db);

      const hydrated = hydrateMessage(target, list);
      const wsEvent =
        ctx.kind === 'group'
          ? { type: 'dm:pin', groupId: ctx.groupId, message: hydrated }
          : { type: 'dm:pin', threadUsers: [selfKey, ctx.peerKey], message: hydrated };
      for (const participant of ctx.participants) {
        sendWsEventToUser(participant, wsEvent);
      }

      if (nextPinned) {
        appendSystemEventMessage(
          ctx,
          {
            kind: 'pin',
            actorUsername: selfKey,
            pinnedMessageId: target.id,
          },
          `${activeUser.displayName} pinned a message to this chat.`,
        );
      }

      sendJson(res, 200, { ok: true, message: hydrated });
      return;
    }

    // DMs & Groups: Toggle emoji reaction on message
    if (req.method === 'POST' && reqPath === '/api/dms/react') {
      const peerKey =
        typeof body.peerUsername === 'string' ? body.peerUsername.trim().toLowerCase() : '';
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : '';
      const emoji = typeof body.emoji === 'string' ? body.emoji.trim() : '';
      const selfKey = activeUser.username.toLowerCase();

      const ctx = resolveThreadContext(selfKey, { peerUsername: peerKey, groupId });
      if (!ctx.ok) {
        sendJson(res, ctx.status ?? 403, { ok: false, error: ctx.error });
        return;
      }

      if (!emoji || emoji.length > 32) {
        sendJson(res, 400, { ok: false, error: 'Error: Invalid emoji reaction' });
        return;
      }

      const list = db.dms[ctx.threadKey] ?? [];
      const target = list.find((m) => m.id === messageId);
      if (!target) {
        sendJson(res, 404, { ok: false, error: 'Error: Message not found' });
        return;
      }

      if (!target.reactions || typeof target.reactions !== 'object') {
        target.reactions = {};
      }

      const currentUsers = Array.isArray(target.reactions[emoji])
        ? [...target.reactions[emoji]]
        : [];
      const existingIdx = currentUsers.findIndex((u) => u.toLowerCase() === selfKey);
      if (existingIdx >= 0) {
        currentUsers.splice(existingIdx, 1);
      } else {
        currentUsers.push(selfKey);
      }

      if (currentUsers.length === 0) {
        delete target.reactions[emoji];
      } else {
        target.reactions[emoji] = currentUsers;
      }

      sqliteStore.updateMessage(target);
      saveDb(db);

      const hydratedReactions = hydrateReactions(target.reactions);
      const wsEvent =
        ctx.kind === 'group'
          ? { type: 'dm:react', groupId: ctx.groupId, messageId, reactions: hydratedReactions }
          : {
              type: 'dm:react',
              threadUsers: [selfKey, ctx.peerKey],
              messageId,
              reactions: hydratedReactions,
            };
      for (const participant of ctx.participants) {
        sendWsEventToUser(participant, wsEvent);
      }

      sendJson(res, 200, { ok: true, reactions: hydratedReactions });
      return;
    }

    next();
  };
}

/** @param {import('node:http').Server} httpServer */
export function attachRedshiftWebSocket(httpServer) {
  const wss = new WebSocketServer({ noServer: true });
  const captureWss = new WebSocketServer({ noServer: true });

  captureWss.on('connection', (ws, _req, initCfg) => {
    const cfg = {
      sourceId: initCfg.sourceId,
      maxW: initCfg.maxW,
      maxH: initCfg.maxH,
      fps: initCfg.fps,
      quality: initCfg.quality,
      closed: false,
    };

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg && msg.type === 'config') {
          if (typeof msg.maxW === 'number' && Number.isFinite(msg.maxW)) {
            cfg.maxW = Math.max(0, Math.min(3840, Math.round(msg.maxW)));
          }
          if (typeof msg.maxH === 'number' && Number.isFinite(msg.maxH)) {
            cfg.maxH = Math.max(0, Math.min(2160, Math.round(msg.maxH)));
          }
          if (typeof msg.fps === 'number' && Number.isFinite(msg.fps)) {
            cfg.fps = msg.fps >= 45 ? 60 : 30;
          }
          if (typeof msg.quality === 'number' && Number.isFinite(msg.quality)) {
            cfg.quality = Math.max(40, Math.min(92, Math.round(msg.quality)));
          }
        }
      } catch {
        // Ignore malformed control payloads.
      }
    });

    ws.on('close', () => {
      cfg.closed = true;
    });

    const pumpFrame = async () => {
      let lastMinimized = false;
      while (!cfg.closed && ws.readyState === WebSocket.OPEN) {
        const start = Date.now();
        if (ws.bufferedAmount < 512_000) {
          const fr = await screenCaptureService.captureFrame(
            cfg.sourceId,
            cfg.maxW,
            cfg.maxH,
            cfg.quality,
          );
          if (cfg.closed || ws.readyState !== WebSocket.OPEN) {
            break;
          }
          if (fr?.closed) {
            ws.send(JSON.stringify({ type: 'closed', sourceId: cfg.sourceId }));
            ws.close();
            break;
          }
          const isMin = Boolean(fr?.minimized);
          if (isMin !== lastMinimized) {
            lastMinimized = isMin;
            ws.send(JSON.stringify({ type: 'paused', paused: isMin, sourceId: cfg.sourceId }));
          }
          if (fr?.ok && fr.jpegBuffer) {
            ws.send(fr.jpegBuffer, { binary: true });
          }
        }
        const intervalMs = Math.max(16, Math.round(1000 / (cfg.fps || 30)));
        const elapsed = Date.now() - start;
        const waitMs = Math.max(4, intervalMs - elapsed);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    };
    void pumpFrame().catch(() => {
      try {
        ws.close();
      } catch {}
    });
  });

  const pingInterval = setInterval(() => {
    for (const client of wss.clients) {
      const meta = socketMeta.get(client);
      if (!meta) {
        continue;
      }
      if (!meta.alive) {
        client.terminate();
        continue;
      }
      meta.alive = false;
      client.ping();
    }
  }, 25000);

  const statusSweepInterval = setInterval(() => {
    const now = Date.now();
    const expiredUsers = [];
    for (const acc of db.accounts) {
      if (
        acc.customStatus &&
        typeof acc.customStatus.expiresAt === 'number' &&
        Number.isFinite(acc.customStatus.expiresAt) &&
        acc.customStatus.expiresAt <= now
      ) {
        acc.customStatus = undefined;
        expiredUsers.push(acc.username);
      }
    }
    if (expiredUsers.length > 0) {
      saveDb(db);
      for (const username of expiredUsers) {
        notifyRelatedPeers(username, true);
      }
    }
  }, 15000);

  wss.on('close', () => {
    clearInterval(pingInterval);
    clearInterval(statusSweepInterval);
  });

  wss.on('connection', (ws, _req, username) => {
    const key = username.toLowerCase();
    const socketId = crypto.randomUUID();
    socketMeta.set(ws, { username: key, alive: true, socketId });

    let set = onlineSockets.get(key);
    const wasOffline = !set || set.size === 0;
    if (!set) {
      set = new Set();
      onlineSockets.set(key, set);
    }
    set.add(ws);

    ws.on('pong', () => {
      const meta = socketMeta.get(ws);
      if (meta) {
        meta.alive = true;
      }
    });

    ws.on('message', (rawData) => {
      try {
        const msg = JSON.parse(String(rawData));
        const meta = socketMeta.get(ws);
        const ownerKey = meta?.username ?? key;
        const ownerSocketId = meta?.socketId ?? socketId;
        if (meta) {
          meta.alive = true;
        }
        lastSeenByUser.set(ownerKey, Date.now());
        if (msg && msg.type === 'ping') {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
          return;
        }
        if (msg && msg.type === 'dm:typing') {
          if (typeof msg.groupId === 'string' && msg.groupId.trim()) {
            emitGroupTypingState(ownerKey, msg.groupId.trim(), Boolean(msg.isTyping));
          } else if (typeof msg.toUsername === 'string') {
            const toKey = msg.toUsername.trim().toLowerCase();
            const recipient = toKey ? findAccountByUsername(toKey) : undefined;
            if (
              toKey &&
              recipient &&
              !hasAnyBlockBetween(ownerKey, toKey) &&
              (areFriends(ownerKey, toKey) || recipient.privacy?.allowNonFriendDms !== false)
            ) {
              emitTypingState(ownerKey, toKey, Boolean(msg.isTyping));
            }
          }
        } else if (msg && msg.type === 'vc:join') {
          const ctx = resolveThreadContext(
            ownerKey,
            {
              peerUsername: typeof msg.peerUsername === 'string' ? msg.peerUsername : '',
              groupId: typeof msg.groupId === 'string' ? msg.groupId : '',
            },
            { mode: 'write' },
          );
          if (!ctx.ok) {
            sendWsEventToUser(ownerKey, {
              type: 'vc:error',
              error: ctx.error ?? 'Error: Cannot start voice call',
            });
            return;
          }

          // Enforce single active call per account across all devices (desktop <-> mobile):
          // if this user is currently in any OTHER call, disconnect them from that call first
          // and tell the previous device to tear down its local call cleanly.
          for (const otherCall of Array.from(activeVoiceCalls.values())) {
            if (otherCall.threadKey === ctx.threadKey) {
              continue;
            }
            const prevEntry = otherCall.participants.get(ownerKey);
            if (!prevEntry) {
              continue;
            }
            otherCall.participants.delete(ownerKey);
            if (ownerKey === otherCall.startedBy || otherCall.participants.size === 0) {
              clearAllRingingInCall(otherCall);
            }
            if (prevEntry.socketId && prevEntry.socketId !== ownerSocketId) {
              const prevWs = findUserSocketById(ownerKey, prevEntry.socketId);
              sendWsEventToSocket(prevWs, {
                type: 'vc:transferred',
                threadKey: otherCall.threadKey,
                newThreadKey: ctx.threadKey,
                reason: 'Call moved to another device',
              });
            }
            broadcastVcState(otherCall);
            finalizeCallIfDone(otherCall);
          }

          let call = activeVoiceCalls.get(ctx.threadKey);
          const isNewCall = !call;
          const now = Date.now();
          if (!call) {
            call = {
              threadKey: ctx.threadKey,
              kind: ctx.kind,
              groupId: ctx.groupId,
              startedBy: ownerKey,
              startedAt: now,
              answeredAt: null,
              everHadAnswer: false,
              callMessageId: null,
              finalized: false,
              allowedUsers: ctx.participants.map((u) => u.toLowerCase()),
              seenParticipants: new Set([ownerKey]),
              participants: new Map(),
              ringing: new Map(),
            };
            activeVoiceCalls.set(ctx.threadKey, call);
          } else {
            call.seenParticipants.add(ownerKey);
            if (ctx.kind === 'group') {
              call.allowedUsers = ctx.participants.map((u) => u.toLowerCase());
            }
          }

          stopRingingUser(call, ownerKey);
          const nextCameraStreamId =
            typeof msg.cameraStreamId === 'string' ? msg.cameraStreamId.trim().slice(0, 80) : '';
          const nextScreenStreamId =
            typeof msg.screenStreamId === 'string' ? msg.screenStreamId.trim().slice(0, 80) : '';
          if (!call.participants.has(ownerKey)) {
            call.participants.set(ownerKey, {
              username: ownerKey,
              muted: Boolean(msg.muted),
              deafened: Boolean(msg.deafened),
              cameraOn: Boolean(msg.cameraOn),
              screenSharing: Boolean(msg.screenSharing),
              screenPaused: Boolean(msg.screenSharing && msg.screenPaused),
              cameraStreamId: nextCameraStreamId || undefined,
              screenStreamId: nextScreenStreamId || undefined,
              socketId: ownerSocketId,
              connectionId: crypto.randomUUID(),
              joinedAt: now,
            });
          } else {
            const existing = call.participants.get(ownerKey);
            if (existing) {
              if (existing.socketId && ownerSocketId && existing.socketId !== ownerSocketId) {
                const prevWs = findUserSocketById(ownerKey, existing.socketId);
                sendWsEventToSocket(prevWs, {
                  type: 'vc:transferred',
                  threadKey: call.threadKey,
                  newThreadKey: call.threadKey,
                  reason: 'Call moved to another device',
                });
                existing.socketId = ownerSocketId;
                existing.connectionId = crypto.randomUUID();
                existing.joinedAt = now;
              } else if (!existing.socketId && ownerSocketId) {
                existing.socketId = ownerSocketId;
                if (!existing.connectionId) {
                  existing.connectionId = crypto.randomUUID();
                }
              }
              existing.muted = Boolean(msg.muted);
              existing.deafened = Boolean(msg.deafened);
              existing.cameraOn = Boolean(msg.cameraOn);
              existing.screenSharing = Boolean(msg.screenSharing);
              existing.screenPaused = Boolean(msg.screenSharing && msg.screenPaused);
              existing.cameraStreamId = nextCameraStreamId || undefined;
              existing.screenStreamId = nextScreenStreamId || undefined;
            }
          }

          if (
            !call.everHadAnswer &&
            (call.participants.size >= 2 ||
              call.seenParticipants.size >= 2 ||
              ownerKey !== call.startedBy)
          ) {
            call.everHadAnswer = true;
            if (!call.answeredAt) {
              call.answeredAt = now;
            }
          }

          const shouldRing = isNewCall && msg.ring !== false;
          if (shouldRing) {
            const callerAcc = findAccountByUsername(ownerKey);
            const grp = ctx.groupId ? db.groupDms[ctx.groupId] : undefined;
            for (const otherRaw of ctx.participants) {
              const otherKey = otherRaw.toLowerCase();
              if (otherKey === ownerKey || call.participants.has(otherKey)) {
                continue;
              }
              if (hasAnyBlockBetween(ownerKey, otherKey)) {
                continue;
              }
              const otherAcc = findAccountByUsername(otherKey);
              if (!otherAcc) {
                continue;
              }
              if (
                ctx.kind === 'dm' &&
                !areFriends(ownerKey, otherKey) &&
                otherAcc.privacy?.allowNonFriendDms === false
              ) {
                continue;
              }
              const targetCall = call;
              const timeoutId = setTimeout(() => {
                if (activeVoiceCalls.get(targetCall.threadKey) !== targetCall) {
                  return;
                }
                if (stopRingingUser(targetCall, otherKey)) {
                  finalizeCallIfDone(targetCall);
                  broadcastVcState(targetCall);
                }
              }, VC_RING_TIMEOUT_MS);

              call.ringing.set(otherKey, { username: otherKey, timeoutId });
              if (callerAcc) {
                sendWsEventToUser(otherKey, {
                  type: 'vc:incoming',
                  threadKey: call.threadKey,
                  kind: call.kind,
                  groupId: call.groupId,
                  groupName: grp?.name,
                  groupIconDataUrl: getGroupIconUrl(grp),
                  caller: toPublicProfile(callerAcc, otherKey),
                });
              }
            }
          }

          // Broadcast live VC state IMMEDIATELY so joining/ringing UI updates in <10ms
          // before persisting/creating call log messages.
          broadcastVcState(call);

          if (isNewCall) {
            createCallLogMessage(call);
          } else {
            syncCallLogMessage(call, call.everHadAnswer ? 'active' : 'ringing');
          }
        } else if (msg && msg.type === 'vc:decline') {
          const threadKey = typeof msg.threadKey === 'string' ? msg.threadKey.trim() : '';
          const call = threadKey ? activeVoiceCalls.get(threadKey) : undefined;
          if (call && stopRingingUser(call, ownerKey)) {
            finalizeCallIfDone(call);
            broadcastVcState(call);
          }
        } else if (msg && msg.type === 'vc:leave') {
          const threadKey = typeof msg.threadKey === 'string' ? msg.threadKey.trim() : '';
          const call = threadKey ? activeVoiceCalls.get(threadKey) : undefined;
          if (call) {
            const currentEntry = call.participants.get(ownerKey);
            if (currentEntry?.socketId && ownerSocketId && currentEntry.socketId !== ownerSocketId) {
              // Ignore stale leave frame from a previously transferred device so the new device stays connected.
              sendWsEventToSocket(ws, buildVcStatePayload(call, ownerKey));
              return;
            }
            const removed = call.participants.delete(ownerKey);
            const clearedRing = stopRingingUser(call, ownerKey);
            if (ownerKey === call.startedBy || call.participants.size === 0) {
              clearAllRingingInCall(call);
            }
            if (removed || clearedRing) {
              broadcastVcState(call);
              finalizeCallIfDone(call);
            } else {
              sendWsEventToUser(ownerKey, buildVcStatePayload(call, ownerKey));
            }
          } else if (threadKey) {
            const isGroup = threadKey.startsWith('group:');
            sendWsEventToUser(ownerKey, {
              type: 'vc:state',
              threadKey,
              kind: isGroup ? 'group' : 'dm',
              groupId: isGroup ? threadKey.slice('group:'.length) : undefined,
              active: false,
              participants: [],
              ringing: [],
            });
          }
        } else if (msg && msg.type === 'vc:voice-state') {
          const threadKey = typeof msg.threadKey === 'string' ? msg.threadKey.trim() : '';
          const call = threadKey ? activeVoiceCalls.get(threadKey) : undefined;
          const entry = call?.participants.get(ownerKey);
          if (call && entry && (!entry.socketId || !ownerSocketId || entry.socketId === ownerSocketId)) {
            const nextMuted = Boolean(msg.muted);
            const nextDeafened = Boolean(msg.deafened);
            const nextCameraOn = Boolean(msg.cameraOn);
            const nextScreenSharing = Boolean(msg.screenSharing);
            const nextScreenPaused = Boolean(nextScreenSharing && msg.screenPaused);
            const nextCamId =
              typeof msg.cameraStreamId === 'string' && msg.cameraStreamId.trim()
                ? msg.cameraStreamId.trim().slice(0, 80)
                : undefined;
            const nextScrId =
              typeof msg.screenStreamId === 'string' && msg.screenStreamId.trim()
                ? msg.screenStreamId.trim().slice(0, 80)
                : undefined;
            if (
              entry.muted !== nextMuted ||
              entry.deafened !== nextDeafened ||
              Boolean(entry.cameraOn) !== nextCameraOn ||
              Boolean(entry.screenSharing) !== nextScreenSharing ||
              Boolean(entry.screenPaused) !== nextScreenPaused ||
              entry.cameraStreamId !== nextCamId ||
              entry.screenStreamId !== nextScrId
            ) {
              entry.muted = nextMuted;
              entry.deafened = nextDeafened;
              entry.cameraOn = nextCameraOn;
              entry.screenSharing = nextScreenSharing;
              entry.screenPaused = nextScreenPaused;
              entry.cameraStreamId = nextCamId;
              entry.screenStreamId = nextScrId;
              broadcastVcState(call);
            }
          }
        } else if (msg && msg.type === 'vc:speaking') {
          const threadKey = typeof msg.threadKey === 'string' ? msg.threadKey.trim() : '';
          const call = threadKey ? activeVoiceCalls.get(threadKey) : undefined;
          const entry = call?.participants.get(ownerKey);
          if (call && entry && (!entry.socketId || !ownerSocketId || entry.socketId === ownerSocketId)) {
            const payload = {
              type: 'vc:speaking',
              threadKey,
              username: ownerKey,
              speaking: Boolean(msg.speaking),
            };
            for (const participantKey of call.participants.keys()) {
              if (participantKey !== ownerKey) {
                sendWsEventToUser(participantKey, payload);
              }
            }
          }
        } else if (msg && msg.type === 'vc:signal') {
          const threadKey = typeof msg.threadKey === 'string' ? msg.threadKey.trim() : '';
          const toKey = typeof msg.toUsername === 'string' ? msg.toUsername.trim().toLowerCase() : '';
          const call = threadKey ? activeVoiceCalls.get(threadKey) : undefined;
          const senderEntry = call?.participants.get(ownerKey);
          const targetEntry = toKey ? call?.participants.get(toKey) : undefined;
          if (
            call &&
            toKey &&
            toKey !== ownerKey &&
            senderEntry &&
            targetEntry &&
            (!senderEntry.socketId || !ownerSocketId || senderEntry.socketId === ownerSocketId) &&
            msg.signal &&
            typeof msg.signal === 'object'
          ) {
            const sigPayload = {
              type: 'vc:signal',
              threadKey,
              fromUsername: ownerKey,
              signal: msg.signal,
            };
            const targetWs = targetEntry.socketId
              ? findUserSocketById(toKey, targetEntry.socketId)
              : null;
            if (targetWs) {
              sendWsEventToSocket(targetWs, sigPayload);
            } else {
              sendWsEventToUser(toKey, sigPayload);
            }
          }
        } else if (msg && msg.type === 'activity:list') {
          sendActiveActivitiesToUser(ownerKey);
        } else if (msg && msg.type === 'activity:create') {
          pruneStaleActivityLobbies();
          const gameId = typeof msg.gameId === 'string' ? msg.gameId.trim().toLowerCase() : '';
          if (!VALID_ACTIVITY_GAMES.has(gameId)) {
            return;
          }
          const threadKey = typeof msg.threadKey === 'string' ? msg.threadKey.trim() : '';
          const rawMax = Number(msg.maxPlayers) || 2;
          const maxPlayers =
            gameId === 'quoridor'
              ? Math.max(2, Math.min(4, Math.round(rawMax)))
              : gameId === 'minesweeper'
                ? Math.max(2, Math.min(6, Math.round(rawMax)))
                : 2;
          const isPublic = msg.isPublic !== false;
          const hostProfile = buildActivityUserProfile(ownerKey);
          const nowTs = Date.now();
          const lobby = {
            id: crypto.randomUUID(),
            gameId,
            threadKey,
            isPublic,
            title:
              typeof msg.title === 'string' && msg.title.trim()
                ? msg.title.trim().slice(0, 60)
                : `${hostProfile.displayName}'s Lobby`,
            hostUsername: hostProfile.username,
            maxPlayers,
            status: 'waiting',
            players: [{ username: hostProfile.username, seat: 0, wins: 0 }],
            spectators: [],
            gameState: msg.initialGameState ?? null,
            version: 1,
            createdAt: nowTs,
            updatedAt: nowTs,
          };
          activeActivityLobbies.set(lobby.id, lobby);
          broadcastActivityLobby(lobby);
        } else if (msg && msg.type === 'activity:join') {
          const lobbyId = typeof msg.lobbyId === 'string' ? msg.lobbyId.trim() : '';
          const lobby = lobbyId ? activeActivityLobbies.get(lobbyId) : undefined;
          if (!lobby) {
            return;
          }
          const asSpectator = Boolean(msg.asSpectator);
          const userProf = buildActivityUserProfile(ownerKey);
          const existingPlayer = lobby.players.find(
            (p) => p.username.toLowerCase() === ownerKey,
          );
          const existingSpecIdx = lobby.spectators.findIndex(
            (s) => s.username.toLowerCase() === ownerKey,
          );
          if (
            !asSpectator &&
            !existingPlayer &&
            lobby.players.length < lobby.maxPlayers &&
            (lobby.status === 'waiting' || Boolean(msg.allowMidJoin))
          ) {
            if (existingSpecIdx >= 0) {
              lobby.spectators.splice(existingSpecIdx, 1);
            }
            const usedSeats = new Set(lobby.players.map((p) => p.seat));
            let seat = 0;
            while (usedSeats.has(seat) && seat < lobby.maxPlayers) {
              seat += 1;
            }
            lobby.players.push({ username: userProf.username, seat, wins: 0 });
            lobby.players.sort((a, b) => a.seat - b.seat);
          } else if (!existingPlayer && existingSpecIdx === -1) {
            lobby.spectators.push({ username: userProf.username });
          }
          if (msg.gameState !== undefined) {
            lobby.gameState = msg.gameState;
          }
          lobby.version = (lobby.version || 1) + 1;
          lobby.updatedAt = Date.now();
          broadcastActivityLobby(lobby);
        } else if (msg && msg.type === 'activity:config') {
          const lobbyId = typeof msg.lobbyId === 'string' ? msg.lobbyId.trim() : '';
          const lobby = lobbyId ? activeActivityLobbies.get(lobbyId) : undefined;
          if (
            !lobby ||
            lobby.hostUsername.toLowerCase() !== ownerKey ||
            lobby.status !== 'waiting'
          ) {
            return;
          }
          if (typeof msg.maxPlayers === 'number') {
            const nextMax =
              lobby.gameId === 'quoridor'
                ? Math.max(2, Math.min(4, Math.round(msg.maxPlayers)))
                : lobby.gameId === 'minesweeper'
                  ? Math.max(2, Math.min(6, Math.round(msg.maxPlayers)))
                  : 2;
            lobby.maxPlayers = Math.max(lobby.players.length, nextMax);
          }
          if (typeof msg.isPublic === 'boolean') {
            lobby.isPublic = msg.isPublic;
          }
          lobby.version = (lobby.version || 1) + 1;
          lobby.updatedAt = Date.now();
          broadcastActivityLobby(lobby);
        } else if (msg && msg.type === 'activity:leave') {
          const lobbyId = typeof msg.lobbyId === 'string' ? msg.lobbyId.trim() : '';
          const lobby = lobbyId ? activeActivityLobbies.get(lobbyId) : undefined;
          if (!lobby) {
            return;
          }
          const recipientsBefore = getActivityLobbyRecipients(lobby);
          const wasPlayer = lobby.players.some((p) => p.username.toLowerCase() === ownerKey);
          lobby.players = lobby.players.filter((p) => p.username.toLowerCase() !== ownerKey);
          lobby.spectators = lobby.spectators.filter((s) => s.username.toLowerCase() !== ownerKey);
          // When any seated player leaves the lobby, cancel the game entirely so nobody is stuck in a half-empty match.
          if (wasPlayer || lobby.players.length === 0) {
            activeActivityLobbies.delete(lobby.id);
            const removePayload = {
              type: 'activity:lobby-removed',
              lobbyId: lobby.id,
              threadKey: lobby.threadKey,
            };
            for (const targetKey of recipientsBefore) {
              sendWsEventToUser(targetKey, removePayload);
            }
            return;
          }
          lobby.version = (lobby.version || 1) + 1;
          lobby.updatedAt = Date.now();
          broadcastActivityLobby(lobby);
        } else if (msg && msg.type === 'activity:start') {
          const lobbyId = typeof msg.lobbyId === 'string' ? msg.lobbyId.trim() : '';
          const lobby = lobbyId ? activeActivityLobbies.get(lobbyId) : undefined;
          if (!lobby) {
            return;
          }
          const isPlayer = lobby.players.some((p) => p.username.toLowerCase() === ownerKey);
          if (!isPlayer) {
            return;
          }
          lobby.status = 'playing';
          lobby.rematchVotes = [];
          if (msg.gameState !== undefined) {
            lobby.gameState = msg.gameState;
          }
          lobby.version = (lobby.version || 1) + 1;
          lobby.updatedAt = Date.now();
          broadcastActivityLobby(lobby);
        } else if (msg && msg.type === 'activity:rematch') {
          const lobbyId = typeof msg.lobbyId === 'string' ? msg.lobbyId.trim() : '';
          const lobby = lobbyId ? activeActivityLobbies.get(lobbyId) : undefined;
          if (!lobby) {
            return;
          }
          const isPlayer = lobby.players.some((p) => p.username.toLowerCase() === ownerKey);
          if (!isPlayer) {
            return;
          }
          const votes = new Set(
            Array.isArray(lobby.rematchVotes)
              ? lobby.rematchVotes.map((u) => String(u).toLowerCase())
              : [],
          );
          if (votes.has(ownerKey)) {
            votes.delete(ownerKey);
          } else {
            votes.add(ownerKey);
          }
          const allPlayersVoted =
            lobby.players.length >= 2 &&
            lobby.players.every((p) => votes.has(p.username.toLowerCase()));
          if (allPlayersVoted) {
            lobby.rematchVotes = [];
            lobby.status = 'playing';
            if (msg.gameState !== undefined) {
              lobby.gameState = msg.gameState;
            }
          } else {
            lobby.rematchVotes = Array.from(votes);
          }
          lobby.version = (lobby.version || 1) + 1;
          lobby.updatedAt = Date.now();
          broadcastActivityLobby(lobby);
        } else if (msg && msg.type === 'activity:action') {
          const lobbyId = typeof msg.lobbyId === 'string' ? msg.lobbyId.trim() : '';
          const lobby = lobbyId ? activeActivityLobbies.get(lobbyId) : undefined;
          if (!lobby) {
            return;
          }
          const isPlayer = lobby.players.some((p) => p.username.toLowerCase() === ownerKey);
          if (!isPlayer) {
            return;
          }
          if (msg.playerBoardPatch && lobby.gameState && typeof lobby.gameState === 'object') {
            lobby.gameState.playerBoards = {
              ...(lobby.gameState.playerBoards || {}),
              [ownerKey]: msg.playerBoardPatch,
            };
            if (msg.gameStatePatch && typeof msg.gameStatePatch === 'object') {
              Object.assign(lobby.gameState, msg.gameStatePatch);
            }
          } else if (msg.gameState !== undefined) {
            lobby.gameState = msg.gameState;
          }
          if (msg.status === 'finished' && lobby.status !== 'finished') {
            lobby.status = 'finished';
            lobby.rematchVotes = [];
            if (typeof msg.winnerUsername === 'string' && msg.winnerUsername.trim()) {
              const winKey = msg.winnerUsername.trim().toLowerCase();
              const winner = lobby.players.find((p) => p.username.toLowerCase() === winKey);
              if (winner) {
                winner.wins = (winner.wins || 0) + 1;
              }
            }
          } else if (
            typeof msg.status === 'string' &&
            ['waiting', 'playing', 'finished'].includes(msg.status)
          ) {
            lobby.status = msg.status;
          }
          lobby.version = (lobby.version || 1) + 1;
          lobby.updatedAt = Date.now();
          broadcastActivityLobby(lobby);
        }
      } catch {
        // Ignore malformed client WS messages.
      }
    });

    // Always push an immediate fresh snapshot to the newly connected socket,
    // and inform friends if this user just transitioned offline -> online.
    pushSnapshotToUser(key);
    sendActiveVcSnapshotsToUser(key);
    sendActiveActivitiesToUser(key);
    if (wasOffline) {
      notifyRelatedPeers(key, false);
    }

    ws.on('close', () => {
      const meta = socketMeta.get(ws);
      const ownerKey = meta?.username ?? key;
      const closingSocketId = meta?.socketId ?? socketId;
      const activeSet = onlineSockets.get(ownerKey);
      if (activeSet) {
        activeSet.delete(ws);
        if (activeSet.size === 0) {
          onlineSockets.delete(ownerKey);
          lastSeenByUser.delete(ownerKey);
          for (const timerKey of Array.from(typingTimers.keys())) {
            if (timerKey.startsWith(`${ownerKey}::group:`)) {
              const targetGroupId = timerKey.slice(ownerKey.length + '::group:'.length);
              emitGroupTypingState(ownerKey, targetGroupId, false);
            } else if (timerKey.startsWith(`${ownerKey}::`)) {
              const targetUser = timerKey.slice(ownerKey.length + 2);
              emitTypingState(ownerKey, targetUser, false);
            }
          }
          cleanupUserFromVoiceCalls(ownerKey);
          notifyRelatedPeers(ownerKey, false);
        } else {
          // Only remove calls owned specifically by this disconnecting device socket.
          cleanupSocketFromVoiceCalls(ownerKey, closingSocketId);
        }
      }
    });
  });

  httpServer.on('upgrade', (req, socket, head) => {
    const rawUrl = req.url ?? '/';
    const parsedUrl = new URL(rawUrl, 'http://localhost');
    if (parsedUrl.pathname !== '/ws' && parsedUrl.pathname !== '/ws/screen-capture') {
      return;
    }

    extractPublicOriginFromReq(req);
    socket.setNoDelay?.(true);

    const token = parsedUrl.searchParams.get('token') ?? '';
    const username = db.sessions[token];
    if (!username || !findAccountByUsername(username)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    if (parsedUrl.pathname === '/ws/screen-capture') {
      if (!isLoopbackRequest(req)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      const sourceId = parsedUrl.searchParams.get('sourceId') ?? '';
      if (!sourceId) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }
      const maxW = Math.max(0, Math.min(3840, Number(parsedUrl.searchParams.get('maxW')) || 1920));
      const maxH = Math.max(0, Math.min(2160, Number(parsedUrl.searchParams.get('maxH')) || 1080));
      const fps = Number(parsedUrl.searchParams.get('fps')) >= 45 ? 60 : 30;
      const quality = Math.max(40, Math.min(92, Number(parsedUrl.searchParams.get('quality')) || 76));
      captureWss.handleUpgrade(req, socket, head, (ws) => {
        captureWss.emit('connection', ws, req, { sourceId, maxW, maxH, fps, quality });
      });
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, username);
    });
  });
}
