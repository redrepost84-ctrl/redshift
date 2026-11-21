import { DurableObject } from 'cloudflare:workers';
import { connect } from 'cloudflare:sockets';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createDoStore, SMALL_KV_KEYS, UPLOAD_CHUNK_SIZE } from './doStore.js';
import { readGifDimensionsFromBytes, scaleGifBytesSpeed } from './gifSpeed.js';
import { fetchSafeLinkPreview } from './linkPreview.js';
import { sendWebPushMessage } from './webPush.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_.-]+$/;
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const VALID_STATUSES = new Set(['online', 'idle', 'dnd', 'invisible']);

const MAX_JSON_BYTES = 18 * 1024 * 1024;
const MAX_MESSAGE_IMAGE_CHARS = 3 * 1024 * 1024;
const MAX_DM_IMAGES_PER_MESSAGE = 10;
const MAX_UPLOAD_BYTES = 95 * 1024 * 1024; // 95 MB (safely inside Cloudflare Workers 100 MB request cap)
const MAX_BANNER_IMAGE_CHARS = 2_400_000;
const MAX_GIF_DURATION_SEC = 300;
const VC_RING_TIMEOUT_MS = 30_000;

const AUTH_RATE_LIMIT = 25;
const MSG_RATE_LIMIT = 60;

const CODE_LETTERS = 'abcdefghjkmnpqrstuvwxyz';
const CODE_DIGITS = '23456789';
const CODE_ALL = CODE_LETTERS + CODE_DIGITS;
const RESEND_COOLDOWN_MS = 25 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;
const PROOF_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

function createRateLimiter() {
  const buckets = new Map();
  let opsSincePrune = 0;
  return {
    check(key, maxHits, windowMs) {
      const now = Date.now();
      const cutoff = now - windowMs;
      const prev = buckets.get(key) ?? [];
      const active = prev.filter((ts) => ts > cutoff);
      if (active.length >= maxHits) {
        const oldest = active[0] ?? now;
        const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
        buckets.set(key, active);
        return { ok: false, retryAfterSec };
      }
      active.push(now);
      buckets.set(key, active);
      opsSincePrune += 1;
      if (opsSincePrune >= 250) {
        opsSincePrune = 0;
        for (const [bKey, list] of buckets.entries()) {
          if (list.length === 0 || list[list.length - 1] <= now - 15 * 60_000) {
            buckets.delete(bKey);
          }
        }
      }
      return { ok: true, retryAfterSec: 0 };
    },
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string') return false;
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function timingSafeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

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

function dmThreadKey(userA, userB) {
  return [userA.trim().toLowerCase(), userB.trim().toLowerCase()].sort().join('::');
}

function groupThreadKey(groupId) {
  return `group:${groupId.trim()}`;
}

function normalizeUserThreadKey(rawKey) {
  if (typeof rawKey !== 'string') return null;
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

function extractMentionUsernames(content) {
  if (typeof content !== 'string' || !content.includes('@')) return [];
  const found = new Set();
  const re = /(?:^|[\s(>*_~])@([a-zA-Z0-9_.-]{2,32})(?![a-zA-Z0-9_.-])/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    found.add(m[1].toLowerCase());
  }
  return Array.from(found);
}

function sanitizeSingleEmoji(raw) {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    const first = segmenter.segment(trimmed)[Symbol.iterator]().next();
    return first.value?.segment || undefined;
  }
  return Array.from(trimmed)[0];
}

function validatePasswordPair(password, confirmPassword) {
  if (!password) return 'Error: Password is required';
  if (!password.trim()) return 'Error: Password cannot be only spaces';
  if (password.length < 6) return 'Error: Password must be at least 6 characters';
  if (password.length > 128) return 'Error: Password must be 128 characters or fewer';
  if (!confirmPassword) return 'Error: Please confirm your password';
  if (password !== confirmPassword) return 'Error: Passwords do not match';
  return null;
}

function getBaseName(filePathStr) {
  const s = String(filePathStr || '');
  const parts = s.split(/[\\/]/);
  return parts[parts.length - 1] || '';
}

function getExtName(filePathStr) {
  const base = getBaseName(filePathStr);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot);
}

function normalizeGifTitle(rawTitle, fallbackName = 'GIF') {
  const cleanedRaw = typeof rawTitle === 'string' ? rawTitle.replace(/\s+/g, ' ').trim() : '';
  if (cleanedRaw) return cleanedRaw.slice(0, 80);
  const base = getBaseName(fallbackName || 'GIF');
  const ext = getExtName(base);
  const withoutExt = ext ? base.slice(0, -ext.length) : base;
  const fromFile = withoutExt.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (fromFile || 'GIF').slice(0, 80);
}

function normalizeGifTags(rawTags) {
  const parts = Array.isArray(rawTags)
    ? rawTags.map((t) => String(t ?? ''))
    : typeof rawTags === 'string'
      ? rawTags.split(/[\s,]+/)
      : [];
  const seen = new Set();
  const tags = [];
  for (const part of parts) {
    const clean = part.replace(/^#+/, '').trim().toLowerCase().slice(0, 30);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    tags.push(clean);
    if (tags.length >= 15) break;
  }
  return tags;
}

function sanitizeGifItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  const safeUrl = url.startsWith('/api/uploads/') || /^https:\/\/[^\s<>"']+$/i.test(url);
  if (!safeUrl || url.length > 500) return null;
  const title = normalizeGifTitle(raw.title);
  const previewRaw = typeof raw.previewUrl === 'string' ? raw.previewUrl.trim() : '';
  const previewUrl =
    previewRaw &&
    (previewRaw.startsWith('/api/uploads/') || /^https:\/\/[^\s<>"']+$/i.test(previewRaw)) &&
    previewRaw.length <= 500
      ? previewRaw
      : undefined;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 80) : undefined;
  const tags = raw.tags ? normalizeGifTags(raw.tags) : undefined;
  const uploadedBy =
    typeof raw.uploadedBy === 'string' && raw.uploadedBy.trim()
      ? raw.uploadedBy.trim().toLowerCase().slice(0, 40)
      : undefined;
  const createdAt =
    typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : undefined;
  const width =
    typeof raw.width === 'number' && Number.isInteger(raw.width) && raw.width > 0 && raw.width <= 20000
      ? raw.width
      : undefined;
  const height =
    typeof raw.height === 'number' && Number.isInteger(raw.height) && raw.height > 0 && raw.height <= 20000
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

function extractGifShareCode(rawText) {
  if (typeof rawText !== 'string') return null;
  const match = rawText.trim().match(/^(?:https?:\/\/[^\s/]+)?\/gif\/([A-Za-z0-9_.-]+)\/?$/);
  return match ? match[1] : null;
}

function sanitizeUploadFileName(rawName) {
  const base = getBaseName(String(rawName || 'attachment'))
    .replace(/[\x00-\x1f<>:"/\\|?*]+/g, '_')
    .trim();
  if (!base) return 'attachment';
  return base.slice(0, 180);
}

function classifyUpload(rawMime, filename) {
  const ext = getExtName(filename).toLowerCase();
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
  if (
    imageExtMime[ext] ||
    (cleanMime.startsWith('image/') && cleanMime !== 'image/svg+xml' && ext !== '.svg')
  ) {
    return { mime: imageExtMime[ext] ?? (cleanMime || 'image/png'), kind: 'image' };
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
    return { mime: audioExtMime[ext] ?? (cleanMime || 'audio/mpeg'), kind: 'audio' };
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
    return { mime: videoExtMime[ext] ?? (cleanMime || 'video/mp4'), kind: 'video' };
  }

  return { mime: 'application/octet-stream', kind: 'file' };
}

function hydrateReactions(rawReactions) {
  if (!rawReactions || typeof rawReactions !== 'object') return [];
  const result = [];
  for (const [emoji, users] of Object.entries(rawReactions)) {
    if (!Array.isArray(users) || users.length === 0) continue;
    result.push({ emoji, count: users.length, users: [...users] });
  }
  return result;
}

const decodedMediaCache = new Map();

function extractPublicOriginFromUrl(urlObj) {
  const hostOnly = String(urlObj?.hostname || '').toLowerCase();
  if (
    !hostOnly ||
    hostOnly === 'localhost' ||
    hostOnly === '127.0.0.1' ||
    hostOnly === '::1' ||
    hostOnly === '[::1]'
  ) {
    return '';
  }
  return urlObj.origin;
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

function toCachedMediaUrl(kind, id, dataUrl, originPrefix = '') {
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

function buildCorsHeaders(request) {
  const reqOrigin = request.headers.get('Origin') || '';
  const headers = {
    'Access-Control-Allow-Origin': reqOrigin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
    'Access-Control-Allow-Headers':
      'Authorization, Content-Type, X-File-Name, X-File-Mime, X-Admin-Secret, Range',
    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, Date',
  };
  if (reqOrigin) {
    headers['Vary'] = 'Origin';
  }
  return headers;
}

function jsonResponse(request, status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...buildCorsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

function generateSecureResetCode() {
  const chars = [
    CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)],
    CODE_DIGITS[crypto.randomInt(CODE_DIGITS.length)],
    CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)],
    CODE_DIGITS[crypto.randomInt(CODE_DIGITS.length)],
    CODE_ALL[crypto.randomInt(CODE_ALL.length)],
    CODE_ALL[crypto.randomInt(CODE_ALL.length)],
  ];
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function hashResetCodeHex(code) {
  return crypto.createHash('sha256').update(code.trim().toLowerCase()).digest('hex');
}

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function wrapBase6476(text) {
  const b64 = Buffer.from(String(text || ''), 'utf8').toString('base64');
  const lines = [];
  for (let i = 0; i < b64.length; i += 76) {
    lines.push(b64.slice(i, i + 76));
  }
  return lines.join('\r\n');
}

async function sendEmailViaSmtps({ host, port, user, pass, to, subject, textBody, htmlBody }) {
  const cleanUser = String(user || '').replace(/[\r\n<>]/g, '').trim();
  const cleanTo = String(to || '').replace(/[\r\n<>]/g, '').trim();
  if (!cleanUser || !cleanTo || !pass) {
    throw new Error('Missing SMTP credentials or recipient');
  }

  const socket = connect(
    { hostname: host || 'smtp.gmail.com', port: Number(port) || 465 },
    { secureTransport: 'on', allowHalfOpen: false },
  );

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  let buffered = '';

  const readSmtpResponse = async (timeoutMs = 12_000) => {
    const deadline = Date.now() + timeoutMs;
    const lines = [];
    while (true) {
      let idx = buffered.indexOf('\r\n');
      while (idx === -1) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          throw new Error('SMTP read timeout');
        }
        const readResult = await Promise.race([
          reader.read(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP read timeout')), remaining)),
        ]);
        if (readResult.done) {
          throw new Error('SMTP connection closed unexpectedly');
        }
        buffered += decoder.decode(readResult.value, { stream: true });
        idx = buffered.indexOf('\r\n');
      }
      const line = buffered.slice(0, idx);
      buffered = buffered.slice(idx + 2);
      lines.push(line);
      if (/^\d{3}(?: |$)/.test(line)) {
        return { code: Number(line.slice(0, 3)), text: lines.join('\n') };
      }
    }
  };

  const sendCommand = async (cmd, expectedCodes) => {
    await writer.write(encoder.encode(`${cmd}\r\n`));
    const resp = await readSmtpResponse();
    if (!expectedCodes.includes(resp.code)) {
      throw new Error(`SMTP error ${resp.code}: ${resp.text}`);
    }
    return resp;
  };

  try {
    const greeting = await readSmtpResponse();
    if (greeting.code !== 220) {
      throw new Error(`SMTP greeting error ${greeting.code}: ${greeting.text}`);
    }
    await sendCommand('EHLO redshift.gg', [250]);
    await sendCommand('AUTH LOGIN', [334]);
    await sendCommand(Buffer.from(cleanUser, 'utf8').toString('base64'), [334]);
    await sendCommand(Buffer.from(pass, 'utf8').toString('base64'), [235]);
    await sendCommand(`MAIL FROM:<${cleanUser}>`, [250]);
    await sendCommand(`RCPT TO:<${cleanTo}>`, [250, 251]);
    await sendCommand('DATA', [354]);

    const boundary = `redshift_${crypto.randomBytes(12).toString('hex')}`;
    const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
    const msgId = `<${crypto.randomUUID()}@redshift.gg>`;
    const rawMime = [
      `From: "Redshift" <${cleanUser}>`,
      `To: <${cleanTo}>`,
      `Subject: ${encodedSubject}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: ${msgId}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase6476(textBody),
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase6476(htmlBody),
      '',
      `--${boundary}--`,
      '.',
      '',
    ].join('\r\n');

    await writer.write(encoder.encode(rawMime));
    const dataResp = await readSmtpResponse(15_000);
    if (dataResp.code !== 250) {
      throw new Error(`SMTP DATA rejected ${dataResp.code}: ${dataResp.text}`);
    }
    try {
      await writer.write(encoder.encode('QUIT\r\n'));
    } catch {}
  } finally {
    try {
      reader.releaseLock();
    } catch {}
    try {
      writer.releaseLock();
    } catch {}
    try {
      await socket.close();
    } catch {}
  }
}

export class RedshiftHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.bootedAt = Date.now();
    this.store = createDoStore(this.ctx.storage, createSeedDb);
    this.db = null;
    this.lastSeenByUser = new Map();
    this.typingTimers = new Map();
    this.activeVoiceCalls = new Map();
    this.activeActivityLobbies = new Map();
    this.rateLimiter = createRateLimiter();
    this.lastKnownPublicOrigin = '';

    // Answer {"type":"ping"} with {"type":"pong"} at the edge without even waking the Durable Object!
    try {
      this.ctx.setWebSocketAutoResponse(
        new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'),
      );
    } catch {
      // Ignore if environment does not support auto-response.
    }
  }

  ensureLoaded() {
    if (this.db) return;
    const hasOpenSockets = this.ctx.getWebSockets().length > 0;
    this.db = this.store.loadDb(!hasOpenSockets);
    this.restoreActiveVoiceCalls();
    this.restoreActiveActivityLobbies();
  }

  persistActiveActivityLobbies() {
    const cutoff = Date.now() - 45 * 60 * 1000;
    const list = [];
    for (const [id, lobby] of this.activeActivityLobbies.entries()) {
      if ((lobby.updatedAt || lobby.createdAt || 0) < cutoff) {
        this.activeActivityLobbies.delete(id);
        continue;
      }
      list.push(lobby);
    }
    this.store.setKvRow('_activeActivityLobbies', list);
  }

  restoreActiveActivityLobbies() {
    this.activeActivityLobbies.clear();
    const row = this.store.getKvRow('_activeActivityLobbies');
    if (!row || !row.json) return;
    try {
      const list = JSON.parse(row.json);
      if (!Array.isArray(list)) return;
      const cutoff = Date.now() - 45 * 60 * 1000;
      for (const lobby of list) {
        if (lobby && lobby.id && (lobby.updatedAt || lobby.createdAt || 0) >= cutoff) {
          this.activeActivityLobbies.set(lobby.id, lobby);
        }
      }
    } catch {
      // Ignore corrupt cached lobbies.
    }
  }

  saveDb() {
    this.store.saveCollections(this.db);
  }

  persistActiveVoiceCalls() {
    const serialized = [];
    for (const call of this.activeVoiceCalls.values()) {
      if (call.finalized) continue;
      serialized.push({
        threadKey: call.threadKey,
        kind: call.kind,
        groupId: call.groupId,
        startedBy: call.startedBy,
        startedAt: call.startedAt,
        answeredAt: call.answeredAt,
        everHadAnswer: call.everHadAnswer,
        callMessageId: call.callMessageId,
        finalized: call.finalized,
        allowedUsers: call.allowedUsers,
        seenParticipants: Array.from(call.seenParticipants),
        participants: Array.from(call.participants.values()),
        ringing: Array.from(call.ringing.values()),
      });
    }
    this.store.setKvRow('_activeVoiceCalls', serialized);
    void this.scheduleNextAlarm();
  }

  restoreActiveVoiceCalls() {
    this.activeVoiceCalls.clear();
    const row = this.store.getKvRow('_activeVoiceCalls');
    if (!row || !row.json) return;
    let list;
    try {
      list = JSON.parse(row.json);
    } catch {
      return;
    }
    if (!Array.isArray(list) || list.length === 0) return;

    const now = Date.now();
    const maxCallAgeMs = 12 * 60 * 60 * 1000;
    let changed = false;
    for (const raw of list) {
      if (!raw || !raw.threadKey) continue;
      if (typeof raw.startedAt === 'number' && now - raw.startedAt > maxCallAgeMs) {
        changed = true;
        continue;
      }
      // Preserve active call participants across Durable Object hibernation/restarts
      // instead of pruning against transient getWebSockets() before clients re-attach.
      const participants = new Map();
      for (const p of Array.isArray(raw.participants) ? raw.participants : []) {
        if (p && p.username) {
          participants.set(p.username.toLowerCase(), {
            ...p,
            watchingStreams: Array.isArray(p.watchingStreams) ? p.watchingStreams : [],
          });
        } else {
          changed = true;
        }
      }
      const ringing = new Map();
      for (const r of Array.isArray(raw.ringing) ? raw.ringing : []) {
        if (r && r.username && typeof r.expiresAt === 'number' && r.expiresAt > now) {
          ringing.set(r.username.toLowerCase(), r);
        } else {
          changed = true;
        }
      }
      const call = {
        threadKey: raw.threadKey,
        kind: raw.kind === 'group' ? 'group' : 'dm',
        groupId: raw.groupId,
        startedBy: raw.startedBy,
        startedAt: raw.startedAt,
        answeredAt: raw.answeredAt ?? null,
        everHadAnswer: Boolean(raw.everHadAnswer),
        callMessageId: raw.callMessageId ?? null,
        finalized: false,
        allowedUsers: Array.isArray(raw.allowedUsers) ? raw.allowedUsers : [],
        seenParticipants: new Set(Array.isArray(raw.seenParticipants) ? raw.seenParticipants : []),
        participants,
        ringing,
      };
      if (call.participants.size === 0 && call.ringing.size === 0) {
        this.syncCallLogMessage(call, call.everHadAnswer ? 'ended' : 'missed', true);
        changed = true;
      } else {
        this.activeVoiceCalls.set(call.threadKey, call);
      }
    }
    if (changed) {
      this.persistActiveVoiceCalls();
    }
  }

  async scheduleNextAlarm() {
    let nextAt = Infinity;
    const now = Date.now();

    for (const acc of this.db?.accounts ?? []) {
      const exp = acc.customStatus?.expiresAt;
      if (typeof exp === 'number' && Number.isFinite(exp) && exp > now) {
        if (exp < nextAt) nextAt = exp;
      }
    }
    for (const call of this.activeVoiceCalls.values()) {
      for (const ringEntry of call.ringing.values()) {
        if (typeof ringEntry.expiresAt === 'number' && ringEntry.expiresAt < nextAt) {
          nextAt = ringEntry.expiresAt;
        }
      }
    }

    if (Number.isFinite(nextAt)) {
      try {
        await this.ctx.storage.setAlarm(Math.max(now + 250, nextAt));
      } catch {}
    }
  }

  async alarm() {
    this.ensureLoaded();
    const now = Date.now();

    // 1. Expire custom statuses
    const expiredUsers = [];
    for (const acc of this.db.accounts) {
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
      this.saveDb();
      for (const username of expiredUsers) {
        this.notifyRelatedPeers(username, true);
      }
    }

    // 2. Expire ringing voice call invites
    let callsMutated = false;
    for (const call of Array.from(this.activeVoiceCalls.values())) {
      let changed = false;
      for (const [uKey, entry] of Array.from(call.ringing.entries())) {
        if (typeof entry.expiresAt === 'number' && entry.expiresAt <= now) {
          if (this.stopRingingUser(call, uKey)) {
            changed = true;
          }
        }
      }
      if (changed) {
        callsMutated = true;
        this.finalizeCallIfDone(call);
        this.broadcastVcState(call);
      }
    }
    if (callsMutated) {
      this.persistActiveVoiceCalls();
    }

    await this.scheduleNextAlarm();
  }

  // --- WebSocket Helpers (Hibernation-Safe) ---
  getUserSockets(username) {
    const key = username.trim().toLowerCase();
    const matched = [];
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (att && att.username === key) {
        matched.push(ws);
      }
    }
    return matched;
  }

  countOnlineUsers() {
    const set = new Set();
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (att && att.username) {
        set.add(att.username);
      }
    }
    return set.size;
  }

  isUserSocketOnline(username) {
    const key = username.trim().toLowerCase();
    if (this.getUserSockets(key).length > 0) {
      return true;
    }
    const lastSeen = this.lastSeenByUser.get(key) ?? 0;
    return Date.now() - lastSeen < 25000;
  }

  sendWsEventToUser(username, payloadObj) {
    const sockets = this.getUserSockets(username);
    if (sockets.length === 0) return;
    const encoded = JSON.stringify(payloadObj);
    for (const ws of sockets) {
      try {
        ws.send(encoded);
      } catch {}
    }
  }

  sendWsEventToSocket(ws, payloadObj) {
    if (!ws) return;
    try {
      ws.send(JSON.stringify(payloadObj));
    } catch {}
  }

  findUserSocketById(username, socketId) {
    if (!socketId) return null;
    for (const ws of this.getUserSockets(username)) {
      if (ws.deserializeAttachment()?.socketId === socketId) {
        return ws;
      }
    }
    return null;
  }

  pushSnapshotToUser(username) {
    const key = username.toLowerCase();
    const sockets = this.getUserSockets(key);
    if (sockets.length === 0) return;
    const snapshot = this.buildSocialSnapshot(key);
    if (!snapshot) return;
    const encoded = JSON.stringify({ type: 'social:sync', snapshot });
    for (const ws of sockets) {
      try {
        ws.send(encoded);
      } catch {}
    }
  }

  broadcastGifsUpdated() {
    const encoded = JSON.stringify({ type: 'gifs:updated' });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(encoded);
      } catch {}
    }
  }

  // --- Account & Social Helpers ---
  findAccountByUsername(username) {
    const key = username.trim().toLowerCase();
    return this.db.accounts.find((acc) => acc.username.toLowerCase() === key);
  }

  findAccountByEmail(email) {
    const key = email.trim().toLowerCase();
    return this.db.accounts.find((acc) => acc.email.toLowerCase() === key);
  }

  findAccountByIdentifier(identifier) {
    const key = identifier.trim().toLowerCase();
    return this.db.accounts.find(
      (acc) => acc.username.toLowerCase() === key || acc.email.toLowerCase() === key,
    );
  }

  isBlockedBy(blocker, target) {
    const b = blocker.trim().toLowerCase();
    const t = target.trim().toLowerCase();
    return (this.db.blocks[b] ?? []).includes(t);
  }

  hasAnyBlockBetween(userA, userB) {
    return this.isBlockedBy(userA, userB) || this.isBlockedBy(userB, userA);
  }

  areFriends(userA, userB) {
    const a = userA.trim().toLowerCase();
    const b = userB.trim().toLowerCase();
    if (this.hasAnyBlockBetween(a, b)) return false;
    return (this.db.friendships[a] ?? []).includes(b);
  }

  removeFriendshipBetween(userA, userB) {
    const a = userA.trim().toLowerCase();
    const b = userB.trim().toLowerCase();
    if (Array.isArray(this.db.friendships[a])) {
      this.db.friendships[a] = this.db.friendships[a].filter((u) => u.toLowerCase() !== b);
    }
    if (Array.isArray(this.db.friendships[b])) {
      this.db.friendships[b] = this.db.friendships[b].filter((u) => u.toLowerCase() !== a);
    }
  }

  clearRequestsBetween(userA, userB) {
    const a = userA.trim().toLowerCase();
    const b = userB.trim().toLowerCase();
    this.db.friendRequests = this.db.friendRequests.filter(
      (r) =>
        !(
          (r.from.toLowerCase() === a && r.to.toLowerCase() === b) ||
          (r.from.toLowerCase() === b && r.to.toLowerCase() === a)
        ),
    );
  }

  clearUnreadBetween(userA, userB) {
    const a = userA.trim().toLowerCase();
    const b = userB.trim().toLowerCase();
    if (this.db.unreadDms[a]) delete this.db.unreadDms[a][b];
    if (this.db.unreadDms[b]) delete this.db.unreadDms[b][a];
    if (this.db.unreadMentions?.[a]) delete this.db.unreadMentions[a][b];
    if (this.db.unreadMentions?.[b]) delete this.db.unreadMentions[b][a];
  }

  resolveThreadContext(selfKey, target, options = {}) {
    const mode = options.mode === 'read' ? 'read' : 'write';
    const cleanGroupId = typeof target.groupId === 'string' ? target.groupId.trim() : '';
    if (cleanGroupId) {
      const group = this.db.groupDms[cleanGroupId];
      if (!group || !group.members.some((m) => m.toLowerCase() === selfKey)) {
        return {
          ok: false,
          status: 403,
          error: 'Error: You are not a member of this group chat',
        };
      }
      return {
        ok: true,
        kind: 'group',
        groupId: cleanGroupId,
        group,
        threadKey: groupThreadKey(cleanGroupId),
        participants: [...group.members],
      };
    }

    const peerKey =
      typeof target.peerUsername === 'string' ? target.peerUsername.trim().toLowerCase() : '';
    const peerAccount = peerKey ? this.findAccountByUsername(peerKey) : undefined;
    if (!peerKey || !peerAccount) {
      return { ok: false, status: 404, error: 'Error: Recipient not found' };
    }
    if (peerKey === selfKey) {
      return { ok: false, status: 400, error: 'Error: You cannot direct message yourself' };
    }

    if (mode === 'write') {
      if (this.hasAnyBlockBetween(selfKey, peerKey)) {
        return {
          ok: false,
          status: 403,
          error: 'Error: Direct messages are disabled because one of you has blocked the other',
        };
      }
      if (!this.areFriends(selfKey, peerKey) && peerAccount.privacy?.allowNonFriendDms === false) {
        return {
          ok: false,
          status: 403,
          error: 'Error: This user is not accepting direct messages from non-friends',
        };
      }
    }

    return {
      ok: true,
      kind: 'dm',
      peerKey,
      threadKey: dmThreadKey(selfKey, peerKey),
      participants: [selfKey, peerKey],
    };
  }

  recordOpenDmPeer(ownerUsername, peerUsername) {
    const ownerKey = ownerUsername.trim().toLowerCase();
    const peerKey = peerUsername.trim().toLowerCase();
    if (!ownerKey || !peerKey || ownerKey === peerKey) return false;
    const existing = Array.isArray(this.db.openDms[ownerKey]) ? this.db.openDms[ownerKey] : [];
    if (existing.some((u) => u.toLowerCase() === peerKey)) return false;
    this.db.openDms[ownerKey] = [peerKey, ...existing.filter((u) => u.toLowerCase() !== peerKey)];
    return true;
  }

  getDmPeerKeys(selfKey) {
    const cleanSelf = selfKey.trim().toLowerCase();
    const friendSet = new Set((this.db.friendships[cleanSelf] ?? []).map((u) => u.toLowerCase()));
    const peerActivity = new Map();

    for (const [threadKey, list] of Object.entries(this.db.dms)) {
      if (threadKey.startsWith('group:') || !Array.isArray(list) || list.length === 0) continue;
      const [u1, u2] = threadKey.split('::');
      if (!u1 || !u2) continue;
      let peer = '';
      if (u1.toLowerCase() === cleanSelf) peer = u2.toLowerCase();
      else if (u2.toLowerCase() === cleanSelf) peer = u1.toLowerCase();
      if (!peer || peer === cleanSelf || friendSet.has(peer) || !this.findAccountByUsername(peer)) {
        continue;
      }
      const latestTs = list[list.length - 1]?.timestamp ?? 0;
      peerActivity.set(peer, Math.max(peerActivity.get(peer) ?? 0, latestTs));
    }

    const openList = Array.isArray(this.db.openDms[cleanSelf]) ? this.db.openDms[cleanSelf] : [];
    openList.forEach((rawPeer, idx) => {
      const peer = String(rawPeer).trim().toLowerCase();
      if (!peer || peer === cleanSelf || friendSet.has(peer) || !this.findAccountByUsername(peer)) {
        return;
      }
      if (!peerActivity.has(peer)) {
        peerActivity.set(peer, openList.length - idx);
      }
    });

    return Array.from(peerActivity.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([peer]) => peer);
  }

  pruneExpiredMutesForUser(userKey) {
    const map = this.db.mutedThreads[userKey];
    if (!map || typeof map !== 'object') return false;
    const now = Date.now();
    let changed = false;
    for (const [k, until] of Object.entries(map)) {
      if (typeof until !== 'number' || (until !== -1 && until !== -2 && until <= now)) {
        delete map[k];
        changed = true;
      }
    }
    if (Object.keys(map).length === 0) {
      delete this.db.mutedThreads[userKey];
    }
    return changed;
  }

  touchThreadActivityForUser(userKey, threadKey, timestamp = Date.now(), opts = {}) {
    const cleanUser = userKey.trim().toLowerCase();
    const normThread = normalizeUserThreadKey(threadKey);
    if (!cleanUser || !normThread) return;
    if (!this.db.threadActivity[cleanUser] || typeof this.db.threadActivity[cleanUser] !== 'object') {
      this.db.threadActivity[cleanUser] = {};
    }
    const prev = this.db.threadActivity[cleanUser][normThread] ?? 0;
    if (timestamp > prev) {
      this.db.threadActivity[cleanUser][normThread] = timestamp;
    }
    if (opts.unhide && this.db.hiddenThreads[cleanUser]?.[normThread]) {
      delete this.db.hiddenThreads[cleanUser][normThread];
      if (Object.keys(this.db.hiddenThreads[cleanUser]).length === 0) {
        delete this.db.hiddenThreads[cleanUser];
      }
    }
  }

  getThreadActivityForUser(userKey) {
    const cleanSelf = userKey.trim().toLowerCase();
    const result = {};

    for (const [rawThreadKey, list] of Object.entries(this.db.dms)) {
      if (!Array.isArray(list) || list.length === 0) continue;
      const lastTs = list[list.length - 1]?.timestamp ?? 0;
      if (!lastTs) continue;
      if (rawThreadKey.startsWith('group:')) {
        const gid = rawThreadKey.slice('group:'.length);
        const grp = this.db.groupDms[gid];
        if (grp && Array.isArray(grp.members) && grp.members.some((m) => m.toLowerCase() === cleanSelf)) {
          result[rawThreadKey] = Math.max(result[rawThreadKey] ?? 0, lastTs);
        }
        continue;
      }
      const [u1, u2] = rawThreadKey.split('::');
      if (!u1 || !u2) continue;
      let peer = '';
      if (u1.toLowerCase() === cleanSelf) peer = u2.toLowerCase();
      else if (u2.toLowerCase() === cleanSelf) peer = u1.toLowerCase();
      if (peer && peer !== cleanSelf) {
        const k = `dm:${peer}`;
        result[k] = Math.max(result[k] ?? 0, lastTs);
      }
    }

    for (const group of Object.values(this.db.groupDms)) {
      if (group && Array.isArray(group.members) && group.members.some((m) => m.toLowerCase() === cleanSelf)) {
        const k = `group:${group.id}`;
        result[k] = Math.max(result[k] ?? 0, group.createdAt ?? 0);
      }
    }

    const stored = this.db.threadActivity[cleanSelf];
    if (stored && typeof stored === 'object') {
      for (const [k, ts] of Object.entries(stored)) {
        if (typeof ts === 'number' && Number.isFinite(ts) && ts > (result[k] ?? 0)) {
          result[k] = ts;
        }
      }
    }
    return result;
  }

  serverMessageMatchesHasFilter(msg, token) {
    const atts = Array.isArray(msg.attachmentIds)
      ? msg.attachmentIds.map((id) => this.db.uploads[id]).filter(Boolean)
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

  getVisibleFriendStatus(account) {
    if (!this.isUserSocketOnline(account.username)) return 'offline';
    if (account.status === 'invisible') return 'offline';
    return account.status ?? 'online';
  }

  getActiveCustomStatus(account) {
    const raw = account.customStatus;
    if (!raw || typeof raw !== 'object') return undefined;
    if (typeof raw.expiresAt === 'number' && Number.isFinite(raw.expiresAt) && raw.expiresAt <= Date.now()) {
      account.customStatus = undefined;
      return undefined;
    }
    const text = typeof raw.text === 'string' ? raw.text.trim().slice(0, 128) : '';
    const emoji = sanitizeSingleEmoji(raw.emoji);
    if (!text && !emoji) return undefined;
    return {
      text,
      emoji,
      expiresAt: typeof raw.expiresAt === 'number' && Number.isFinite(raw.expiresAt) ? raw.expiresAt : null,
    };
  }

  getAccountAvatarUrl(account) {
    if (!account || account.avatarPreset !== null || !account.avatarDataUrl) {
      return undefined;
    }
    return toCachedMediaUrl(
      'avatar',
      account.username.toLowerCase(),
      account.avatarDataUrl,
      this.lastKnownPublicOrigin,
    );
  }

  /**
   * Builds sender avatar fields (`icon` URL or `presetAvatar` index) for Web Push payloads
   * so mobile/desktop notifications show the messenger's profile picture instead of the app icon.
   */
  getNotificationAvatarPayload(account) {
    if (!account) return {};
    const customUrl = account.avatarDataUrl
      ? account.avatarDataUrl.startsWith('data:image/')
        ? this.getAccountAvatarUrl(account)
        : account.avatarDataUrl
      : undefined;
    if (customUrl) {
      return { icon: customUrl };
    }
    const presetIdx =
      typeof account.avatarPreset === 'number' &&
      Number.isInteger(account.avatarPreset) &&
      account.avatarPreset >= 0 &&
      account.avatarPreset <= 3
        ? account.avatarPreset
        : 0;
    return { presetAvatar: presetIdx };
  }

  getAccountBannerUrl(account) {
    if (!account || !account.bannerDataUrl) {
      return undefined;
    }
    return toCachedMediaUrl(
      'banner',
      account.username.toLowerCase(),
      account.bannerDataUrl,
      this.lastKnownPublicOrigin,
    );
  }

  getGroupIconUrl(group) {
    if (!group || !group.iconDataUrl) {
      return undefined;
    }
    return toCachedMediaUrl(
      'group-icon',
      group.id,
      group.iconDataUrl,
      this.lastKnownPublicOrigin,
    );
  }

  toPublicProfile(account, viewerUsername) {
    const isPrivate = Boolean(account.privacy?.privateProfile);
    const acceptsNonFriendDms = account.privacy?.allowNonFriendDms !== false;
    const isBlocked = Boolean(
      viewerUsername && this.hasAnyBlockBetween(viewerUsername, account.username),
    );
    if (isPrivate || isBlocked) {
      return {
        username: account.username,
        displayName: account.displayName,
        bio: '',
        createdAt: isPrivate ? 0 : account.createdAt,
        status: 'offline',
        avatarPreset: account.avatarPreset,
        avatarDataUrl: this.getAccountAvatarUrl(account),
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
      status: this.getVisibleFriendStatus(account),
      avatarPreset: account.avatarPreset,
      avatarDataUrl: this.getAccountAvatarUrl(account),
      bannerColor: account.bannerColor || undefined,
      bannerDataUrl: this.getAccountBannerUrl(account),
      customStatus: this.getActiveCustomStatus(account),
      inVoiceCall: this.isUserInAnyVoiceCall(account.username),
      isProfilePrivate: false,
      isBlockedRelation: false,
      acceptsNonFriendDms,
    };
  }

  toSelfProfile(account) {
    return {
      username: account.username,
      displayName: account.displayName,
      email: account.email,
      bio: account.bio,
      createdAt: account.createdAt,
      status: account.status ?? 'online',
      avatarPreset: account.avatarPreset,
      avatarDataUrl: this.getAccountAvatarUrl(account),
      bannerColor: account.bannerColor || undefined,
      bannerDataUrl: this.getAccountBannerUrl(account),
      customStatus: this.getActiveCustomStatus(account),
      privacy: {
        allowFriendRequests: account.privacy?.allowFriendRequests !== false,
        allowNonFriendDms: account.privacy?.allowNonFriendDms !== false,
        privateProfile: Boolean(account.privacy?.privateProfile),
        showReadReceipts: account.privacy?.showReadReceipts !== false,
      },
      clientPreferences:
        account.clientPreferences && typeof account.clientPreferences === 'object'
          ? { ...account.clientPreferences }
          : undefined,
      voiceUserVolumes:
        account.voiceUserVolumes && typeof account.voiceUserVolumes === 'object'
          ? { ...account.voiceUserVolumes }
          : undefined,
    };
  }

  toClientGroup(group, viewerUsername) {
    const members = [];
    for (const memberUsername of group.members ?? []) {
      const acc = this.findAccountByUsername(memberUsername);
      if (acc) members.push(this.toPublicProfile(acc, viewerUsername));
    }
    return {
      id: group.id,
      name: group.name,
      iconDataUrl: this.getGroupIconUrl(group),
      ownerUsername: group.ownerUsername,
      members,
      createdAt: group.createdAt,
    };
  }

  // --- GIF & Upload Asset Helpers ---
  ensureGifDimensions(item) {
    if (item.width && item.height) return item;
    const uploadId =
      'uploadId' in item && typeof item.uploadId === 'string' && item.uploadId
        ? item.uploadId
        : typeof item.url === 'string' && item.url.startsWith('/api/uploads/')
          ? item.url.slice('/api/uploads/'.length).split(/[/?#]/)[0]
          : '';
    if (!uploadId) return item;
    const header = this.store.readUploadHeaderBytes(uploadId, 10);
    const dims = readGifDimensionsFromBytes(header);
    if (dims) {
      item.width = dims.width;
      item.height = dims.height;
    }
    return item;
  }

  isCommunityGifAssetIntact(entry) {
    const uploadId =
      typeof entry.uploadId === 'string' && entry.uploadId
        ? entry.uploadId
        : typeof entry.url === 'string' && entry.url.startsWith('/api/uploads/')
          ? entry.url.slice('/api/uploads/'.length).split(/[/?#]/)[0]
          : '';
    if (!uploadId) return Boolean(entry.url);
    const meta = this.db.uploads[uploadId];
    if (!meta) return false;
    return this.store.hasUploadData(uploadId);
  }

  searchCommunityGifs(query) {
    const intact = this.db.communityGifs.filter((entry) => this.isCommunityGifAssetIntact(entry));
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
    return list.map((entry) => this.ensureGifDimensions({ ...entry }));
  }

  resolveGifByCode(rawCode) {
    if (typeof rawCode !== 'string') return null;
    const code = rawCode.trim();
    if (!code || code.length > 120) return null;

    const fromCommunity = this.db.communityGifs.find((g) => g.id === code || g.uploadId === code);
    if (fromCommunity) return this.ensureGifDimensions({ ...fromCommunity });

    if (code.startsWith('u_')) {
      const uploadId = code.slice(2);
      const matchedComm = this.db.communityGifs.find((g) => g.uploadId === uploadId);
      if (matchedComm) {
        return this.ensureGifDimensions({ ...matchedComm, id: matchedComm.id || code });
      }
      const meta = this.db.uploads[uploadId];
      if (meta && meta.kind === 'image') {
        const dims = readGifDimensionsFromBytes(this.store.readUploadHeaderBytes(uploadId, 10));
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

    const fromLinks = this.db.gifLinks[code];
    if (fromLinks) return this.ensureGifDimensions({ ...fromLinks, id: code });
    return null;
  }

  getOrMintGifShareCode(gifItem) {
    const byId = gifItem.id ? this.resolveGifByCode(gifItem.id) : null;
    if (byId && byId.url === gifItem.url) {
      return { code: gifItem.id, gif: byId, created: false };
    }
    const commByUrl = this.db.communityGifs.find((g) => g.url === gifItem.url);
    if (commByUrl) {
      return { code: commByUrl.id, gif: this.ensureGifDimensions({ ...commByUrl }), created: false };
    }
    if (gifItem.url.startsWith('/api/uploads/')) {
      const uploadId = gifItem.url.slice('/api/uploads/'.length).split('/')[0];
      if (uploadId && this.db.uploads[uploadId]) {
        const uCode = `u_${uploadId}`;
        return { code: uCode, gif: this.ensureGifDimensions({ ...gifItem, id: uCode }), created: false };
      }
    }
    const hash = crypto.createHash('sha256').update(gifItem.url).digest('hex').slice(0, 12);
    const gCode = `g_${hash}`;
    if (this.db.gifLinks[gCode]) {
      return {
        code: gCode,
        gif: this.ensureGifDimensions({ ...this.db.gifLinks[gCode], id: gCode }),
        created: false,
      };
    }
    const stored = this.ensureGifDimensions({ ...gifItem, id: gCode });
    this.db.gifLinks[gCode] = stored;
    return { code: gCode, gif: stored, created: true };
  }

  collectReferencedUploadIds() {
    const addUploadUrlRef = (url, set) => {
      if (typeof url === 'string' && url.startsWith('/api/uploads/')) {
        const id = url.slice('/api/uploads/'.length).split(/[/?#]/)[0];
        if (id) set.add(id);
      }
    };
    const stillReferenced = new Set();
    for (const threadList of Object.values(this.db.dms)) {
      if (!Array.isArray(threadList)) continue;
      for (const msg of threadList) {
        if (Array.isArray(msg.attachmentIds)) {
          for (const id of msg.attachmentIds) stillReferenced.add(id);
        }
        if (msg.gif?.url) addUploadUrlRef(msg.gif.url, stillReferenced);
      }
    }
    for (const entry of this.db.communityGifs) {
      if (entry.uploadId) stillReferenced.add(entry.uploadId);
      addUploadUrlRef(entry.url, stillReferenced);
    }
    for (const favList of Object.values(this.db.favoriteGifs)) {
      if (!Array.isArray(favList)) continue;
      for (const fav of favList) addUploadUrlRef(fav?.url, stillReferenced);
    }
    return stillReferenced;
  }

  cleanupOrphanedUploads(candidateIds) {
    if (!Array.isArray(candidateIds) || candidateIds.length === 0) return false;
    const stillReferenced = this.collectReferencedUploadIds();
    let changed = false;
    for (const id of candidateIds) {
      if (stillReferenced.has(id)) continue;
      if (!this.db.uploads[id]) continue;
      this.store.deleteUploadData(id);
      delete this.db.uploads[id];
      changed = true;
    }
    return changed;
  }

  buildSocialSnapshot(username) {
    const key = username.toLowerCase();
    const account = this.findAccountByUsername(key);
    if (!account) return null;

    const friendIds = this.db.friendships[key] ?? [];
    const friends = [];
    for (const id of friendIds) {
      const friend = this.findAccountByUsername(id);
      if (friend) friends.push(this.toPublicProfile(friend, key));
    }

    const incomingRequests = [];
    const outgoingRequests = [];
    for (const req of this.db.friendRequests) {
      if (req.to.toLowerCase() === key) {
        const sender = this.findAccountByUsername(req.from);
        if (sender) {
          incomingRequests.push({
            direction: 'incoming',
            user: this.toPublicProfile(sender, key),
            createdAt: req.createdAt,
          });
        }
      } else if (req.from.toLowerCase() === key) {
        const target = this.findAccountByUsername(req.to);
        if (target) {
          outgoingRequests.push({
            direction: 'outgoing',
            user: this.toPublicProfile(target, key),
            createdAt: req.createdAt,
          });
        }
      }
    }
    incomingRequests.sort((a, b) => b.createdAt - a.createdAt);
    outgoingRequests.sort((a, b) => b.createdAt - a.createdAt);

    const blockedUsers = [];
    for (const blockedId of this.db.blocks[key] ?? []) {
      const blockedAccount = this.findAccountByUsername(blockedId);
      if (blockedAccount) blockedUsers.push(this.toPublicProfile(blockedAccount, key));
    }

    const groups = [];
    for (const group of Object.values(this.db.groupDms)) {
      if (group && Array.isArray(group.members) && group.members.some((m) => m.toLowerCase() === key)) {
        groups.push(this.toClientGroup(group, key));
      }
    }
    groups.sort((a, b) => b.createdAt - a.createdAt);

    const dmPeers = [];
    for (const peerKey of this.getDmPeerKeys(key)) {
      const peerAccount = this.findAccountByUsername(peerKey);
      if (peerAccount) dmPeers.push(this.toPublicProfile(peerAccount, key));
    }

    if (this.pruneExpiredMutesForUser(key)) {
      this.saveDb();
    }

    return {
      user: this.toSelfProfile(account),
      friends,
      dmPeers,
      incomingRequests,
      outgoingRequests,
      blockedUsers,
      favoriteGifs: (this.db.favoriteGifs[key] ?? [])
        .filter((g) => this.isCommunityGifAssetIntact(g))
        .map((g) => this.ensureGifDimensions({ ...g })),
      groups,
      unreadCounts: { ...(this.db.unreadDms[key] ?? {}) },
      groupUnreadCounts: { ...(this.db.unreadGroups[key] ?? {}) },
      unreadMentions: { ...(this.db.unreadMentions?.[key] ?? {}) },
      groupUnreadMentions: { ...(this.db.groupUnreadMentions?.[key] ?? {}) },
      mutedThreads: { ...(this.db.mutedThreads[key] ?? {}) },
      hiddenThreads: Object.keys(this.db.hiddenThreads[key] ?? {}),
      threadActivity: this.getThreadActivityForUser(key),
    };
  }

  notifyRelatedPeers(username, includeSelf = true) {
    const key = username.toLowerCase();
    const affected = new Set();
    if (includeSelf) affected.add(key);

    for (const friendId of this.db.friendships[key] ?? []) {
      affected.add(friendId.toLowerCase());
    }
    for (const req of this.db.friendRequests) {
      if (req.from.toLowerCase() === key) affected.add(req.to.toLowerCase());
      else if (req.to.toLowerCase() === key) affected.add(req.from.toLowerCase());
    }
    for (const group of Object.values(this.db.groupDms)) {
      if (group && Array.isArray(group.members) && group.members.some((m) => m.toLowerCase() === key)) {
        for (const m of group.members) {
          if (includeSelf || m.toLowerCase() !== key) affected.add(m.toLowerCase());
        }
      }
    }
    for (const peerKey of this.getDmPeerKeys(key)) {
      affected.add(peerKey.toLowerCase());
    }
    for (const [owner, list] of Object.entries(this.db.openDms)) {
      if (Array.isArray(list) && list.some((u) => u.toLowerCase() === key)) {
        if (includeSelf || owner.toLowerCase() !== key) affected.add(owner.toLowerCase());
      }
    }
    for (const target of affected) {
      this.pushSnapshotToUser(target);
    }
  }

  hydrateMessage(msg, threadList) {
    const author = this.findAccountByUsername(msg.authorUsername);
    const rawImages =
      Array.isArray(msg.imageDataUrls) && msg.imageDataUrls.length > 0
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
        const meta = typeof attId === 'string' ? this.db.uploads[attId] : undefined;
        if (meta) {
          const clientAtt = toClientAttachment(meta);
          if (spoilerSet.has(attId)) clientAtt.spoiler = true;
          attachments.push(clientAtt);
        }
      }
    }

    let hydratedReply;
    if (msg.replyTo && typeof msg.replyTo === 'object') {
      const refTarget = Array.isArray(threadList)
        ? threadList.find((item) => item.id === msg.replyTo.messageId)
        : undefined;
      const replyAuthorUsername = refTarget?.authorUsername ?? msg.replyTo.authorUsername;
      const replyAuthor = this.findAccountByUsername(replyAuthorUsername);
      const missing = Array.isArray(threadList) ? !refTarget : false;
      const targetImages = refTarget
        ? Array.isArray(refTarget.imageDataUrls) && refTarget.imageDataUrls.length > 0
          ? refTarget.imageDataUrls
          : refTarget.imageDataUrl
            ? [refTarget.imageDataUrl]
            : []
        : [];
      const targetAttachments =
        refTarget && Array.isArray(refTarget.attachmentIds)
          ? refTarget.attachmentIds.filter((id) => Boolean(this.db.uploads[id]))
          : [];
      hydratedReply = {
        messageId: msg.replyTo.messageId,
        authorUsername: replyAuthor?.username ?? replyAuthorUsername,
        authorName: replyAuthor?.displayName ?? replyAuthorUsername,
        authorAvatarPreset: replyAuthor ? replyAuthor.avatarPreset : 0,
        authorAvatarDataUrl: this.getAccountAvatarUrl(replyAuthor),
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
      const callerAcc = this.findAccountByUsername(msg.callLog.callerUsername);
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
      const actorAcc = this.findAccountByUsername(msg.systemEvent.actorUsername);
      const targetAcc = msg.systemEvent.targetUsername
        ? this.findAccountByUsername(msg.systemEvent.targetUsername)
        : undefined;
      const rawTargets = Array.isArray(msg.systemEvent.targetUsernames)
        ? msg.systemEvent.targetUsernames
        : undefined;
      const targetDisplayNames = rawTargets
        ? rawTargets.map((u) => this.findAccountByUsername(u)?.displayName ?? u)
        : undefined;
      hydratedSystemEvent = {
        kind: msg.systemEvent.kind,
        actorUsername: actorAcc?.username ?? msg.systemEvent.actorUsername,
        actorDisplayName:
          actorAcc?.displayName ?? msg.systemEvent.actorDisplayName ?? msg.systemEvent.actorUsername,
        targetUsername: msg.systemEvent.targetUsername
          ? (targetAcc?.username ?? msg.systemEvent.targetUsername)
          : undefined,
        targetDisplayName: msg.systemEvent.targetUsername
          ? (targetAcc?.displayName ??
            msg.systemEvent.targetDisplayName ??
            msg.systemEvent.targetUsername)
          : undefined,
        targetUsernames: rawTargets,
        targetDisplayNames,
        pinnedMessageId: msg.systemEvent.pinnedMessageId,
      };
    }

    let hydratedForwarded;
    if (msg.forwarded && typeof msg.forwarded === 'object') {
      const origAcc = msg.forwarded.originalAuthorUsername
        ? this.findAccountByUsername(msg.forwarded.originalAuthorUsername)
        : undefined;
      hydratedForwarded = {
        originalAuthorUsername: origAcc?.username ?? msg.forwarded.originalAuthorUsername,
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
      authorAvatarDataUrl: this.getAccountAvatarUrl(author),
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
                this.findAccountByUsername(msg.statusReply.authorUsername)?.username ??
                msg.statusReply.authorUsername,
              authorName:
                this.findAccountByUsername(msg.statusReply.authorUsername)?.displayName ??
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

  appendSystemEventMessage(ctx, systemEvent, fallbackContent) {
    if (!this.db.dms[ctx.threadKey]) this.db.dms[ctx.threadKey] = [];
    const list = this.db.dms[ctx.threadKey];
    const msg = {
      id: crypto.randomUUID(),
      authorUsername: systemEvent.actorUsername,
      content: fallbackContent,
      timestamp: Date.now(),
      systemEvent,
      reactions: {},
    };
    list.push(msg);
    this.store.insertMessage(ctx.threadKey, msg);
    this.saveDb();

    const hydrated = this.hydrateMessage(msg, list);
    const wsEvent =
      ctx.kind === 'group'
        ? { type: 'dm:message', groupId: ctx.groupId, message: hydrated }
        : { type: 'dm:message', threadUsers: ctx.participants, message: hydrated };
    for (const participant of ctx.participants) {
      this.sendWsEventToUser(participant, wsEvent);
    }
    return hydrated;
  }

  isThreadMutedForPush(recipientKey, userThreadKey, isMentionOrReply = false) {
    const cleanUser = recipientKey.toLowerCase();
    const map = this.db.mutedThreads?.[cleanUser];
    if (!map || typeof map !== 'object') return false;
    const raw = map[userThreadKey];
    if (!raw) return false;
    const now = Date.now();
    if (typeof raw === 'number') {
      return raw === -1 || raw > now;
    }
    if (typeof raw === 'object') {
      const until = typeof raw.until === 'number' ? raw.until : null;
      if (until !== null && (until === -1 || until > now)) {
        return true;
      }
      if (raw.mentionsOnly === true && !isMentionOrReply) {
        return true;
      }
    }
    return false;
  }

  sendPushToUser(recipientUsername, payload, options = {}) {
    if (!recipientUsername) return;
    const vapidPublicKey = String(this.env.VAPID_PUBLIC_KEY || '').trim();
    const vapidPrivateKey = String(this.env.VAPID_PRIVATE_KEY || '').trim();
    const vapidSubject = String(this.env.VAPID_SUBJECT || 'mailto:redrepost84@gmail.com').trim();
    if (!vapidPublicKey || !vapidPrivateKey) return;

    const cleanKey = recipientUsername.toLowerCase();
    const subs = this.db.pushSubscriptions?.[cleanKey];
    if (!Array.isArray(subs) || subs.length === 0) return;

    const snapshotSubs = subs.slice();
    const task = (async () => {
      const expiredEndpoints = new Set();
      for (const sub of snapshotSubs) {
        try {
          const res = await sendWebPushMessage({
            subscription: sub,
            payload,
            vapidPublicKey,
            vapidPrivateKey,
            vapidSubject,
            ttl: options.ttl ?? 86400,
            urgency: options.urgency ?? 'high',
          });
          if (res.expired && sub.endpoint) {
            expiredEndpoints.add(sub.endpoint);
          }
        } catch (err) {
          console.error('[Redshift Push] Send failed:', err?.message || err);
        }
      }
      if (expiredEndpoints.size > 0 && Array.isArray(this.db.pushSubscriptions?.[cleanKey])) {
        this.db.pushSubscriptions[cleanKey] = this.db.pushSubscriptions[cleanKey].filter(
          (s) => !expiredEndpoints.has(s.endpoint),
        );
        this.saveDb();
      }
    })();

    try {
      this.ctx.waitUntil(task);
    } catch {
      void task;
    }
  }

  emitSocialNotify(recipientUsername, eventPayload) {
    if (!recipientUsername) return;
    this.sendWsEventToUser(recipientUsername, {
      type: 'social:notify',
      event: eventPayload,
    });
    if (eventPayload && typeof eventPayload === 'object') {
      const actorName = eventPayload.actor?.displayName || eventPayload.actor?.username || 'Someone';
      const actorAvatarFields = this.getNotificationAvatarPayload(eventPayload.actor);
      if (eventPayload.kind === 'friend-request') {
        this.sendPushToUser(recipientUsername, {
          title: 'New Friend Request',
          body: `${actorName} sent you a friend request`,
          tag: `friend-req:${eventPayload.actor?.username || ''}`,
          threadKind: 'friends',
          threadId: 'pending',
          ...actorAvatarFields,
        });
      } else if (eventPayload.kind === 'group-added' && eventPayload.groupId) {
        this.sendPushToUser(recipientUsername, {
          title: eventPayload.groupName || 'Group Chat',
          body: `${actorName} added you to ${eventPayload.groupName || 'a group chat'}`,
          tag: `group-add:${eventPayload.groupId}`,
          threadKind: 'group',
          threadId: eventPayload.groupId,
          ...actorAvatarFields,
        });
      }
    }
  }

  // --- Voice Call Logic ---
  getCallRecipients(call) {
    const recipients = new Set(call.allowedUsers);
    if (call.kind === 'group' && call.groupId) {
      const grp = this.db.groupDms[call.groupId];
      if (grp && Array.isArray(grp.members)) {
        for (const m of grp.members) recipients.add(m.toLowerCase());
      }
    }
    return recipients;
  }

  emitCallThreadEvent(call, eventType, storedMsg, threadList) {
    const hydrated = this.hydrateMessage(storedMsg, threadList);
    const wsEvent =
      call.kind === 'group'
        ? { type: eventType, groupId: call.groupId, message: hydrated }
        : {
            type: eventType,
            threadUsers: call.allowedUsers.slice(0, 2),
            message: hydrated,
          };
    const recipients = Array.from(this.getCallRecipients(call));
    // Push call log message over WebSocket FIRST so clients see it instantaneously.
    for (const targetKey of recipients) {
      this.sendWsEventToUser(targetKey, wsEvent);
    }
    if (eventType === 'dm:message') {
      const callTs = storedMsg.timestamp || Date.now();
      for (const recipient of recipients) {
        const cleanRecipient = recipient.toLowerCase();
        if (call.kind === 'group' && call.groupId) {
          this.touchThreadActivityForUser(cleanRecipient, `group:${call.groupId}`, callTs, {
            unhide: true,
          });
        } else {
          const peer = call.allowedUsers
            .find((u) => u.toLowerCase() !== cleanRecipient)
            ?.toLowerCase();
          if (peer) {
            this.touchThreadActivityForUser(cleanRecipient, `dm:${peer}`, callTs, { unhide: true });
          }
        }
      }
      for (const recipient of recipients) {
        this.pushSnapshotToUser(recipient);
      }
      this.saveDb();
    }
  }

  createCallLogMessage(call) {
    if (!Array.isArray(this.db.dms[call.threadKey])) {
      this.db.dms[call.threadKey] = [];
    }
    const threadList = this.db.dms[call.threadKey];
    const msgId = crypto.randomUUID();
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
    this.store.insertMessage(call.threadKey, stored);
    call.callMessageId = msgId;

    if (call.kind === 'dm' && call.allowedUsers.length >= 2) {
      this.recordOpenDmPeer(call.allowedUsers[0], call.allowedUsers[1]);
      this.recordOpenDmPeer(call.allowedUsers[1], call.allowedUsers[0]);
    }
    this.emitCallThreadEvent(call, 'dm:message', stored, threadList);
  }

  syncCallLogMessage(call, nextStatus, force = false) {
    if (!call.callMessageId) return;
    const threadList = this.db.dms[call.threadKey];
    if (!Array.isArray(threadList)) return;
    const stored = threadList.find((m) => m.id === call.callMessageId);
    if (!stored || !stored.callLog) return;
    const nextParticipants = Array.from(call.seenParticipants);
    const prev = stored.callLog;
    const endedAt =
      nextStatus === 'ended' || nextStatus === 'missed' ? (prev.endedAt ?? Date.now()) : undefined;
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

    if (!changed) return;

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
    this.store.updateMessage(stored);
    this.saveDb();
    this.emitCallThreadEvent(call, 'dm:edit', stored, threadList);
  }

  finalizeCallIfDone(call) {
    if (call.finalized) return false;
    if (call.participants.size > 0 || call.ringing.size > 0) return false;
    call.finalized = true;
    this.activeVoiceCalls.delete(call.threadKey);
    this.syncCallLogMessage(call, call.everHadAnswer ? 'ended' : 'missed', true);
    return true;
  }

  buildVcStatePayload(call, viewerKey) {
    const participants = [];
    for (const entry of call.participants.values()) {
      const acc = this.findAccountByUsername(entry.username);
      if (!acc) continue;
      participants.push({
        user: this.toPublicProfile(acc, viewerKey),
        muted: Boolean(entry.muted),
        deafened: Boolean(entry.deafened),
        cameraOn: Boolean(entry.cameraOn),
        screenSharing: Boolean(entry.screenSharing),
        screenPaused: Boolean(entry.screenSharing && entry.screenPaused),
        cameraStreamId: entry.cameraStreamId || undefined,
        screenStreamId: entry.screenStreamId || undefined,
        watchingStreams: Array.isArray(entry.watchingStreams) ? entry.watchingStreams : [],
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
      const acc = this.findAccountByUsername(entry.username);
      if (acc) ringing.push(this.toPublicProfile(acc, viewerKey));
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

  broadcastVcState(call) {
    for (const targetKey of this.getCallRecipients(call)) {
      this.sendWsEventToUser(targetKey, this.buildVcStatePayload(call, targetKey));
    }
  }

  stopRingingUser(call, userKey) {
    const clean = userKey.toLowerCase();
    if (call.ringing.delete(clean)) {
      this.sendWsEventToUser(clean, { type: 'vc:incoming-clear', threadKey: call.threadKey });
      return true;
    }
    return false;
  }

  /**
   * Rings eligible non-connected thread participants for either initial `vc:join` or mid-call `vc:ring`
   * without resetting ongoing call state, participants, streams, or activities.
   */
  ringCallTargets(call, ctx, callerKey, requestedTargets = null, ongoingRing = false) {
    const callerAcc = this.findAccountByUsername(callerKey);
    const grp = ctx.groupId ? this.db.groupDms[ctx.groupId] : undefined;
    const now = Date.now();
    const targetSet =
      Array.isArray(requestedTargets) && requestedTargets.length > 0
        ? new Set(requestedTargets.map((u) => String(u).trim().toLowerCase()).filter(Boolean))
        : null;
    const callerAvatarFields = this.getNotificationAvatarPayload(callerAcc);
    let rangAny = false;

    for (const otherRaw of ctx.participants) {
      const otherKey = otherRaw.toLowerCase();
      if (targetSet && !targetSet.has(otherKey)) continue;
      if (otherKey === callerKey || call.participants.has(otherKey)) continue;
      if (this.hasAnyBlockBetween(callerKey, otherKey)) continue;
      const otherAcc = this.findAccountByUsername(otherKey);
      if (!otherAcc) continue;
      if (
        ctx.kind === 'dm' &&
        !this.areFriends(callerKey, otherKey) &&
        otherAcc.privacy?.allowNonFriendDms === false
      ) {
        continue;
      }
      call.ringing.set(otherKey, { username: otherKey, expiresAt: now + VC_RING_TIMEOUT_MS });
      rangAny = true;
      if (callerAcc) {
        this.sendWsEventToUser(otherKey, {
          type: 'vc:incoming',
          threadKey: call.threadKey,
          kind: call.kind,
          groupId: call.groupId,
          groupName: grp?.name,
          groupIconDataUrl: this.getGroupIconUrl(grp),
          caller: this.toPublicProfile(callerAcc, otherKey),
        });
        const callThreadMuteKey =
          call.kind === 'group' && call.groupId ? `group:${call.groupId}` : `dm:${callerKey}`;
        if (!this.isThreadMutedForPush(otherKey, callThreadMuteKey, true)) {
          this.sendPushToUser(
            otherKey,
            {
              title: call.kind === 'group' ? grp?.name || 'Group Call' : callerAcc.displayName,
              body:
                call.kind === 'group'
                  ? ongoingRing
                    ? `${callerAcc.displayName} is ringing you into the call`
                    : `${callerAcc.displayName} started a call`
                  : 'Incoming voice call...',
              tag: `vc:${call.threadKey}`,
              threadKind: call.kind === 'group' ? 'group' : 'dm',
              threadId: call.kind === 'group' ? call.groupId : callerKey,
              ...callerAvatarFields,
            },
            { ttl: 35, urgency: 'high' },
          );
        }
      }
    }
    return rangAny;
  }

  clearAllRingingInCall(call) {
    for (const userKey of call.ringing.keys()) {
      this.sendWsEventToUser(userKey, { type: 'vc:incoming-clear', threadKey: call.threadKey });
    }
    call.ringing.clear();
  }

  sendActiveVcSnapshotsToUser(username, specificWs = null) {
    const cleanKey = username.toLowerCase();
    const send = (obj) => {
      if (specificWs) {
        try {
          specificWs.send(JSON.stringify(obj));
        } catch {}
      } else {
        this.sendWsEventToUser(cleanKey, obj);
      }
    };
    for (const call of this.activeVoiceCalls.values()) {
      const isAllowed =
        call.allowedUsers.includes(cleanKey) ||
        (call.kind === 'group' &&
          call.groupId &&
          this.db.groupDms[call.groupId]?.members?.some((m) => m.toLowerCase() === cleanKey));
      if (!isAllowed) continue;
      send(this.buildVcStatePayload(call, cleanKey));
      if (call.ringing.has(cleanKey)) {
        const callerAcc = this.findAccountByUsername(call.startedBy);
        const grp = call.groupId ? this.db.groupDms[call.groupId] : undefined;
        if (callerAcc) {
          send({
            type: 'vc:incoming',
            threadKey: call.threadKey,
            kind: call.kind,
            groupId: call.groupId,
            groupName: grp?.name,
            groupIconDataUrl: this.getGroupIconUrl(grp),
            caller: this.toPublicProfile(callerAcc, cleanKey),
          });
        }
      }
    }
  }

  buildActivityUserProfile(username) {
    const acc = this.findAccountByUsername(username);
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
      avatarDataUrl: this.getAccountAvatarUrl(acc),
    };
  }

  serializeActivityLobby(lobby) {
    return {
      id: lobby.id,
      gameId: lobby.gameId,
      threadKey: lobby.threadKey,
      isPublic: Boolean(lobby.isPublic),
      title: lobby.title,
      hostUsername: lobby.hostUsername,
      maxPlayers: lobby.maxPlayers,
      gameMode: lobby.gameMode === 'blitz' ? 'blitz' : 'standard',
      status: lobby.status,
      players: (lobby.players || []).map((p) => ({
        ...this.buildActivityUserProfile(p.username),
        seat: p.seat ?? 0,
        wins: p.wins ?? 0,
      })),
      spectators: (lobby.spectators || []).map((s) => ({
        ...this.buildActivityUserProfile(s.username),
      })),
      rematchVotes: Array.isArray(lobby.rematchVotes) ? lobby.rematchVotes : [],
      gameState: lobby.gameState ?? null,
      version: lobby.version ?? 1,
      createdAt: lobby.createdAt,
      updatedAt: lobby.updatedAt,
    };
  }

  getActivityLobbyRecipients(lobby) {
    const recipients = new Set();
    for (const p of lobby.players || []) {
      if (p?.username) recipients.add(p.username.toLowerCase());
    }
    for (const s of lobby.spectators || []) {
      if (s?.username) recipients.add(s.username.toLowerCase());
    }
    if (lobby.threadKey) {
      const call = this.activeVoiceCalls.get(lobby.threadKey);
      if (call) {
        for (const u of this.getCallRecipients(call)) {
          recipients.add(u.toLowerCase());
        }
      } else if (lobby.threadKey.startsWith('group:')) {
        const gid = lobby.threadKey.slice('group:'.length);
        const grp = this.db.groupDms[gid];
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
      for (const ws of this.ctx.getWebSockets()) {
        const att = ws.deserializeAttachment();
        if (att?.username) {
          recipients.add(att.username.toLowerCase());
        }
      }
    }
    return recipients;
  }

  broadcastActivityLobby(lobby) {
    const payload = {
      type: 'activity:lobby-update',
      lobby: this.serializeActivityLobby(lobby),
    };
    for (const targetKey of this.getActivityLobbyRecipients(lobby)) {
      this.sendWsEventToUser(targetKey, payload);
    }
  }

  sendActiveActivitiesToUser(username, specificWs = null) {
    const cutoff = Date.now() - 45 * 60 * 1000;
    const cleanKey = username.toLowerCase();
    const list = [];
    for (const [id, lobby] of this.activeActivityLobbies.entries()) {
      if ((lobby.updatedAt || lobby.createdAt || 0) < cutoff) {
        this.activeActivityLobbies.delete(id);
        continue;
      }
      const rec = this.getActivityLobbyRecipients(lobby);
      if (lobby.isPublic || rec.has(cleanKey)) {
        list.push(this.serializeActivityLobby(lobby));
      }
    }
    const payload = {
      type: 'activity:list',
      lobbies: list,
    };
    if (specificWs) {
      try {
        specificWs.send(JSON.stringify(payload));
      } catch {}
    } else {
      this.sendWsEventToUser(cleanKey, payload);
    }
  }

  isUserInAnyVoiceCall(username) {
    const cleanKey = username.toLowerCase();
    for (const call of this.activeVoiceCalls.values()) {
      if (call.participants.has(cleanKey)) return true;
    }
    return false;
  }

  notifyPeersVoicePresence(username) {
    const key = username.toLowerCase();
    const inVoiceCall = this.isUserInAnyVoiceCall(key);
    const affected = new Set([key]);
    for (const friendId of this.db.friendships[key] ?? []) {
      affected.add(friendId.toLowerCase());
    }
    for (const group of Object.values(this.db.groupDms)) {
      if (group && Array.isArray(group.members) && group.members.some((m) => m.toLowerCase() === key)) {
        for (const m of group.members) affected.add(m.toLowerCase());
      }
    }
    for (const peerKey of this.getDmPeerKeys(key)) {
      affected.add(peerKey.toLowerCase());
    }
    for (const [owner, list] of Object.entries(this.db.openDms)) {
      if (Array.isArray(list) && list.some((u) => u.toLowerCase() === key)) {
        affected.add(owner.toLowerCase());
      }
    }
    const payload = { type: 'vc:presence', username: key, inVoiceCall };
    for (const target of affected) {
      this.sendWsEventToUser(target, payload);
    }
  }

  resolveMinesweeperLobbyOutcome(lobby) {
    if (!lobby || lobby.gameId !== 'minesweeper' || !lobby.gameState) return;
    const gs = lobby.gameState;
    const boards = gs.playerBoards || {};
    const players = lobby.players || [];

    const wonPlayer = players.find((p) => boards[p.username.toLowerCase()]?.status === 'won');
    if (wonPlayer) {
      gs.winnerUsername = wonPlayer.username;
      gs.winReason = `${wonPlayer.displayName} flagged/cleared all mines first and won!`;
      lobby.status = 'finished';
      return;
    }

    const alivePlayers = players.filter((p) => {
      const st = boards[p.username.toLowerCase()]?.status || 'playing';
      return st === 'playing';
    });

    if (alivePlayers.length >= 2) {
      gs.winnerUsername = null;
      gs.winReason = undefined;
      lobby.status = 'playing';
      return;
    }

    if (alivePlayers.length === 1 && players.length >= 2) {
      const survivor = alivePlayers[0];
      gs.winnerUsername = survivor.username;
      gs.winReason = `${survivor.displayName} is the last player standing and won Minesweeper!`;
      lobby.status = 'finished';
      return;
    }

    if (alivePlayers.length === 0 && players.length >= 2) {
      let lastDead = players[0];
      let bestTs = -1;
      for (const p of players) {
        const ts = Number(boards[p.username.toLowerCase()]?.eliminatedAt || 0);
        if (ts >= bestTs) {
          bestTs = ts;
          lastDead = p;
        }
      }
      gs.winnerUsername = lastDead.username;
      gs.winReason = `${lastDead.displayName} survived longest and won Minesweeper!`;
      lobby.status = 'finished';
    }
  }

  removeUserSeatedLobbies(userKey, onlyThreadKey = '', excludeLobbyId = '') {
    const cleanKey = userKey.toLowerCase();
    let mutated = false;
    for (const [id, lobby] of Array.from(this.activeActivityLobbies.entries())) {
      if (excludeLobbyId && id === excludeLobbyId) continue;
      if (onlyThreadKey && lobby.threadKey !== onlyThreadKey) continue;
      const isSeated = (lobby.players || []).some((p) => p.username.toLowerCase() === cleanKey);
      if (isSeated) {
        const recipients = this.getActivityLobbyRecipients(lobby);
        this.activeActivityLobbies.delete(id);
        mutated = true;
        const removePayload = {
          type: 'activity:lobby-removed',
          lobbyId: id,
          threadKey: lobby.threadKey,
        };
        for (const targetKey of recipients) {
          this.sendWsEventToUser(targetKey, removePayload);
        }
      } else {
        const prevLen = (lobby.spectators || []).length;
        lobby.spectators = (lobby.spectators || []).filter(
          (s) => s.username.toLowerCase() !== cleanKey,
        );
        if (lobby.spectators.length !== prevLen) {
          lobby.version = (lobby.version || 1) + 1;
          lobby.updatedAt = Date.now();
          mutated = true;
          this.broadcastActivityLobby(lobby);
        }
      }
    }
    if (mutated) {
      this.persistActiveActivityLobbies();
    }
  }

  cleanupUserFromVoiceCalls(username) {
    const cleanKey = username.toLowerCase();
    let anyChanged = false;
    let leftAny = false;
    for (const call of Array.from(this.activeVoiceCalls.values())) {
      let changed = false;
      if (this.stopRingingUser(call, cleanKey)) changed = true;
      if (call.participants.delete(cleanKey)) {
        changed = true;
        leftAny = true;
        this.removeUserSeatedLobbies(cleanKey, call.threadKey);
        if (call.participants.size === 0 || (cleanKey === call.startedBy && !call.everHadAnswer)) {
          this.clearAllRingingInCall(call);
        }
      }
      if (changed) {
        anyChanged = true;
        this.finalizeCallIfDone(call);
        this.broadcastVcState(call);
      }
    }
    if (anyChanged) {
      this.persistActiveVoiceCalls();
    }
    if (leftAny) {
      this.notifyPeersVoicePresence(cleanKey);
    }
  }

  cleanupSocketFromVoiceCalls(username, socketId) {
    if (!socketId) return;
    const cleanKey = username.toLowerCase();
    let anyChanged = false;
    let leftAny = false;
    for (const call of Array.from(this.activeVoiceCalls.values())) {
      const entry = call.participants.get(cleanKey);
      if (entry && entry.socketId && entry.socketId === socketId) {
        call.participants.delete(cleanKey);
        leftAny = true;
        this.removeUserSeatedLobbies(cleanKey, call.threadKey);
        if (call.participants.size === 0 || (cleanKey === call.startedBy && !call.everHadAnswer)) {
          this.clearAllRingingInCall(call);
        }
        anyChanged = true;
        this.broadcastVcState(call);
        this.finalizeCallIfDone(call);
      }
    }
    if (anyChanged) {
      this.persistActiveVoiceCalls();
    }
    if (leftAny) {
      this.notifyPeersVoicePresence(cleanKey);
    }
  }

  // --- Typing Indicators ---
  emitTypingState(fromUsername, toUsername, isTyping) {
    const fromKey = fromUsername.toLowerCase();
    const toKey = toUsername.toLowerCase();
    const timerKey = `${fromKey}::${toKey}`;

    const existing = this.typingTimers.get(timerKey);
    if (existing) {
      clearTimeout(existing);
      this.typingTimers.delete(timerKey);
    }

    const sender = this.findAccountByUsername(fromKey);
    const displayName = sender?.displayName ?? fromKey;

    this.sendWsEventToUser(toKey, {
      type: 'dm:typing',
      fromUsername: fromKey,
      displayName,
      isTyping,
    });

    if (isTyping) {
      const timer = setTimeout(() => {
        this.typingTimers.delete(timerKey);
        const latestSender = this.findAccountByUsername(fromKey);
        this.sendWsEventToUser(toKey, {
          type: 'dm:typing',
          fromUsername: fromKey,
          displayName: latestSender?.displayName ?? fromKey,
          isTyping: false,
        });
      }, 1500);
      this.typingTimers.set(timerKey, timer);
    }
  }

  emitGroupTypingState(fromUsername, groupId, isTyping) {
    const fromKey = fromUsername.toLowerCase();
    const group = this.db.groupDms[groupId];
    if (!group || !group.members.some((m) => m.toLowerCase() === fromKey)) return;

    const timerKey = `${fromKey}::group:${groupId}`;
    const existing = this.typingTimers.get(timerKey);
    if (existing) {
      clearTimeout(existing);
      this.typingTimers.delete(timerKey);
    }

    const sender = this.findAccountByUsername(fromKey);
    const displayName = sender?.displayName ?? fromKey;
    for (const member of group.members) {
      if (member.toLowerCase() !== fromKey) {
        this.sendWsEventToUser(member, {
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
        this.typingTimers.delete(timerKey);
        const latestGroup = this.db.groupDms[groupId];
        if (!latestGroup) return;
        const latestSender = this.findAccountByUsername(fromKey);
        for (const member of latestGroup.members) {
          if (member.toLowerCase() !== fromKey) {
            this.sendWsEventToUser(member, {
              type: 'dm:typing',
              groupId,
              fromUsername: fromKey,
              displayName: latestSender?.displayName ?? fromKey,
              isTyping: false,
            });
          }
        }
      }, 1500);
      this.typingTimers.set(timerKey, timer);
    }
  }

  // --- Sessions & Auth ---
  issueSessionToken(username) {
    const token = crypto.randomBytes(24).toString('hex');
    this.db.sessions[token] = username.toLowerCase();
    this.saveDb();
    return token;
  }

  extractBearerToken(request) {
    const authHeader = request.headers.get('Authorization') ?? '';
    const match = /^Bearer\s+([a-zA-Z0-9]+)$/i.exec(authHeader.trim());
    return match ? match[1] : null;
  }

  authenticateRequest(request) {
    const token = this.extractBearerToken(request);
    if (!token) return null;
    const username = this.db.sessions[token];
    if (!username) return null;
    const acc = this.findAccountByUsername(username) ?? null;
    if (acc) {
      const uKey = acc.username.toLowerCase();
      const wasOnline = this.isUserSocketOnline(uKey);
      this.lastSeenByUser.set(uKey, Date.now());
      if (!wasOnline) {
        queueMicrotask(() => this.notifyRelatedPeers(uKey, false));
      }
    }
    return acc;
  }

  isAuthorizedAdmin(request) {
    const configured = String(this.env.ADMIN_SECRET || this.env.REDSHIFT_ADMIN_SECRET || '').trim();
    if (!configured) return false;
    const supplied = (request.headers.get('X-Admin-Secret') || '').trim();
    return timingSafeStringEqual(supplied, configured);
  }

  getClientIp(request) {
    return (
      request.headers.get('CF-Connecting-IP') ||
      (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() ||
      'unknown'
    );
  }

  getConfiguredIceServers() {
    const servers = [
      {
        urls: [
          'stun:stun.l.google.com:19302',
          'stun:stun1.l.google.com:19302',
          'stun:stun.cloudflare.com:3478',
        ],
      },
    ];
    const rawTurn = String(this.env.REDSHIFT_TURN_URLS || '').trim();
    if (rawTurn) {
      const turnUrls = rawTurn
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (turnUrls.length > 0) {
        const entry = { urls: turnUrls };
        if (this.env.REDSHIFT_TURN_USERNAME) entry.username = String(this.env.REDSHIFT_TURN_USERNAME);
        if (this.env.REDSHIFT_TURN_CREDENTIAL)
          entry.credential = String(this.env.REDSHIFT_TURN_CREDENTIAL);
        servers.push(entry);
      }
    }
    return servers;
  }

  migrateUsernameReferences(oldUsername, newUsername) {
    const oldKey = oldUsername.toLowerCase();
    const newKey = newUsername.toLowerCase();
    if (oldKey === newKey) return;

    const nextFriendships = {};
    for (const [owner, list] of Object.entries(this.db.friendships)) {
      const mappedOwner = owner.toLowerCase() === oldKey ? newKey : owner.toLowerCase();
      const mappedList = list.map((u) => (u.toLowerCase() === oldKey ? newKey : u.toLowerCase()));
      nextFriendships[mappedOwner] = Array.from(new Set(mappedList));
    }
    this.db.friendships = nextFriendships;

    const nextBlocks = {};
    for (const [owner, list] of Object.entries(this.db.blocks)) {
      const mappedOwner = owner.toLowerCase() === oldKey ? newKey : owner.toLowerCase();
      const mappedList = list.map((u) => (u.toLowerCase() === oldKey ? newKey : u.toLowerCase()));
      nextBlocks[mappedOwner] = Array.from(new Set(mappedList));
    }
    this.db.blocks = nextBlocks;

    this.db.friendRequests = this.db.friendRequests.map((req) => ({
      ...req,
      from: req.from.toLowerCase() === oldKey ? newKey : req.from.toLowerCase(),
      to: req.to.toLowerCase() === oldKey ? newKey : req.to.toLowerCase(),
    }));

    for (const [tok, owner] of Object.entries(this.db.sessions)) {
      if (owner.toLowerCase() === oldKey) this.db.sessions[tok] = newKey;
    }

    const nextUnread = {};
    for (const [owner, counts] of Object.entries(this.db.unreadDms)) {
      const mappedOwner = owner.toLowerCase() === oldKey ? newKey : owner.toLowerCase();
      const mappedCounts = {};
      for (const [peer, count] of Object.entries(counts ?? {})) {
        const mappedPeer = peer.toLowerCase() === oldKey ? newKey : peer.toLowerCase();
        mappedCounts[mappedPeer] = (mappedCounts[mappedPeer] ?? 0) + count;
      }
      nextUnread[mappedOwner] = mappedCounts;
    }
    this.db.unreadDms = nextUnread;

    // Update live WebSocket attachments for the renamed user
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (att && att.username === oldKey) {
        ws.serializeAttachment({ ...att, username: newKey });
      }
    }

    const nextDms = {};
    const rewrittenMessages = [];
    for (const [threadKey, list] of Object.entries(this.db.dms)) {
      let nextKey = threadKey;
      if (!threadKey.startsWith('group:')) {
        const [u1, u2] = threadKey.split('::');
        if (!u1 || !u2) continue;
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
        const updated = {
          ...msg,
          authorUsername: msg.authorUsername.toLowerCase() === oldKey ? newKey : msg.authorUsername,
          pinnedBy: msg.pinnedBy && msg.pinnedBy.toLowerCase() === oldKey ? newKey : msg.pinnedBy,
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
        rewrittenMessages.push({ threadKey: nextKey, msg: updated });
        return updated;
      });
      nextDms[nextKey] = [...(nextDms[nextKey] ?? []), ...mapped];
    }
    this.db.dms = nextDms;
    this.store.replaceAllMessages(rewrittenMessages);

    const nextOpenDms = {};
    for (const [owner, list] of Object.entries(this.db.openDms)) {
      const mappedOwner = owner.toLowerCase() === oldKey ? newKey : owner.toLowerCase();
      const mappedList = (Array.isArray(list) ? list : [])
        .map((u) => (u.toLowerCase() === oldKey ? newKey : u.toLowerCase()))
        .filter((u) => u !== mappedOwner);
      nextOpenDms[mappedOwner] = Array.from(new Set(mappedList));
    }
    this.db.openDms = nextOpenDms;

    for (const group of Object.values(this.db.groupDms)) {
      if (!group || !Array.isArray(group.members)) continue;
      group.members = Array.from(
        new Set(group.members.map((m) => (m.toLowerCase() === oldKey ? newKey : m.toLowerCase()))),
      );
      if (group.ownerUsername?.toLowerCase() === oldKey) group.ownerUsername = newKey;
    }

    if (this.db.unreadGroups[oldKey]) {
      this.db.unreadGroups[newKey] = {
        ...(this.db.unreadGroups[oldKey] ?? {}),
        ...(this.db.unreadGroups[newKey] ?? {}),
      };
      delete this.db.unreadGroups[oldKey];
    }

    for (const meta of Object.values(this.db.uploads)) {
      if (meta.uploadedBy.toLowerCase() === oldKey) meta.uploadedBy = newKey;
    }

    if (this.db.favoriteGifs[oldKey]) {
      const prevList = this.db.favoriteGifs[oldKey];
      const nextList = this.db.favoriteGifs[newKey] ?? [];
      const seen = new Set(nextList.map((g) => g.url));
      for (const item of prevList) {
        if (!seen.has(item.url)) {
          nextList.push(item);
          seen.add(item.url);
        }
      }
      delete this.db.favoriteGifs[oldKey];
      this.db.favoriteGifs[newKey] = nextList;
    }

    for (const entry of this.db.communityGifs) {
      if (entry.uploadedBy?.toLowerCase() === oldKey) entry.uploadedBy = newKey;
    }
  }

  // --- Password Reset Helpers ---
  async issueResetEmail(toEmail) {
    const smtpUser = String(this.env.SMTP_USER || '').trim();
    const smtpPass = String(this.env.SMTP_PASS || '').replace(/\s+/g, '').trim();
    const smtpHost = String(this.env.SMTP_HOST || 'smtp.gmail.com').trim();
    const smtpPort = Number(this.env.SMTP_PORT || 465) || 465;
    const hasSmtp = Boolean(smtpUser && smtpPass && EMAIL_REGEX.test(smtpUser));

    const resendApiKey = String(this.env.RESEND_API_KEY || '').trim();
    const resendFrom = String(this.env.RESEND_FROM || 'Redshift <onboarding@resend.dev>').trim();

    if (!hasSmtp && !resendApiKey) {
      return {
        status: 503,
        payload: {
          ok: false,
          error: 'Error: Email reset service not configured on cloud server (ask an admin to reset password)',
        },
      };
    }

    const key = toEmail.toLowerCase();
    const existing = this.store.getResetCode(key);
    const now = Date.now();
    if (existing && now - Number(existing.last_sent_at) < RESEND_COOLDOWN_MS) {
      const remaining = Math.ceil((RESEND_COOLDOWN_MS - (now - Number(existing.last_sent_at))) / 1000);
      return {
        status: 429,
        payload: {
          ok: false,
          error: `Error: Please wait ${remaining}s before resending email`,
          cooldownSeconds: remaining,
        },
      };
    }

    const code = generateSecureResetCode();
    const safeEmail = escapeHtml(toEmail);
    const safeCode = escapeHtml(code);
    const subject = 'Redshift — Your Password Reset Code';
    const textBody = [
      'Redshift Password Reset',
      '',
      `We received a password reset request for ${toEmail}.`,
      `Your 6-character verification code is: ${code}`,
      '',
      'This code expires in 10 minutes. If you did not request this, you can safely ignore this email.',
    ].join('\n');
    const htmlBody = `<div style="background:#15161a;color:#f2f3f5;font-family:'Segoe UI',Arial,sans-serif;padding:32px 20px;"><div style="max-width:440px;margin:0 auto;background:#1b1d23;border:1px solid #2b2e38;border-radius:10px;padding:28px;"><div style="font-size:26px;font-weight:700;color:#eb4248;letter-spacing:-0.02em;">Redshift</div><p style="margin:14px 0 0;font-size:14px;line-height:1.5;color:#b5bac1;">We received a password reset request for <strong style="color:#ffffff;">${safeEmail}</strong>.</p><p style="margin:14px 0 8px;font-size:13px;color:#b5bac1;">Enter this 6-character verification code:</p><div style="background:#121318;border:1px solid #351a20;border-radius:8px;padding:14px;text-align:center;font-family:Consolas,monospace;font-size:26px;font-weight:700;letter-spacing:6px;color:#ffffff;">${safeCode}</div><p style="margin:16px 0 0;font-size:12px;color:#828691;line-height:1.45;">This code expires in 10 minutes. If you did not request a password reset, you can ignore this email.</p></div></div>`;

    try {
      if (hasSmtp) {
        await sendEmailViaSmtps({
          host: smtpHost,
          port: smtpPort,
          user: smtpUser,
          pass: smtpPass,
          to: toEmail,
          subject,
          textBody,
          htmlBody,
        });
      } else {
        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: resendFrom,
            to: [toEmail],
            subject,
            text: textBody,
            html: htmlBody,
          }),
        });
        if (!resp.ok) {
          return {
            status: 500,
            payload: { ok: false, error: 'Error: Could not send verification email. Please try again' },
          };
        }
      }
    } catch (err) {
      console.error('[Redshift Cloud] Failed to send reset email:', err?.message || err);
      return {
        status: 500,
        payload: { ok: false, error: 'Error: Could not send verification email. Please try again' },
      };
    }

    this.store.setResetCode(key, {
      codeHashHex: hashResetCodeHex(code),
      expiresAt: Date.now() + CODE_TTL_MS,
      lastSentAt: Date.now(),
      attempts: 0,
    });
    return { status: 200, payload: { ok: true, cooldownSeconds: 25 } };
  }

  verifyResetCode(email, code) {
    const key = email.toLowerCase();
    const session = this.store.getResetCode(key);
    if (!session) {
      return {
        status: 400,
        payload: {
          ok: false,
          error: 'Error: Verification code expired or not found. Please resend email',
        },
      };
    }
    if (Date.now() > Number(session.expires_at)) {
      this.store.deleteResetCode(key);
      return {
        status: 400,
        payload: { ok: false, error: 'Error: Verification code expired. Please resend email' },
      };
    }
    if (Number(session.attempts) >= MAX_VERIFY_ATTEMPTS) {
      return {
        status: 429,
        payload: { ok: false, error: 'Error: Too many failed attempts. Please resend email' },
      };
    }
    const candidateHex = hashResetCodeHex(code);
    if (!timingSafeStringEqual(candidateHex, String(session.code_hash_hex))) {
      this.store.setResetCode(key, {
        codeHashHex: String(session.code_hash_hex),
        expiresAt: Number(session.expires_at),
        lastSentAt: Number(session.last_sent_at),
        attempts: Number(session.attempts) + 1,
      });
      return { status: 400, payload: { ok: false, error: 'Error: Invalid verification code' } };
    }

    this.store.deleteResetCode(key);
    const resetProofToken = crypto.randomBytes(24).toString('hex');
    this.store.setResetProof(key, resetProofToken, Date.now() + PROOF_TTL_MS);
    return { status: 200, payload: { ok: true, resetProofToken } };
  }

  consumeResetProof(email, proofToken) {
    const key = email.toLowerCase();
    const entry = this.store.getResetProof(key);
    if (!entry || Date.now() > Number(entry.expires_at)) {
      this.store.deleteResetProof(key);
      return false;
    }
    if (!timingSafeStringEqual(String(entry.token), proofToken)) {
      return false;
    }
    this.store.deleteResetProof(key);
    return true;
  }

  // --- Streaming Binary Uploads & Range Downloads ---
  async streamBodyIntoUploadChunks(uploadId, request, maxBytes) {
    const declaredLen = Number(request.headers.get('Content-Length'));
    if (Number.isFinite(declaredLen) && declaredLen > maxBytes) {
      return { ok: false, status: 413, error: 'Error: File exceeds the 95 MB cloud attachment limit' };
    }

    const reader = request.body?.getReader();
    if (!reader) {
      this.store.finalizeUploadSize(uploadId, 0, UPLOAD_CHUNK_SIZE);
      return { ok: true, totalBytes: 0 };
    }

    let totalBytes = 0;
    let chunkIndex = 0;
    let staging = new Uint8Array(UPLOAD_CHUNK_SIZE);
    let stagingOffset = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value || value.byteLength === 0) continue;

        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          try {
            await reader.cancel();
          } catch {}
          this.store.deleteUploadData(uploadId);
          return {
            ok: false,
            status: 413,
            error: 'Error: File exceeds the 95 MB cloud attachment limit',
          };
        }

        let srcOffset = 0;
        while (srcOffset < value.byteLength) {
          const space = UPLOAD_CHUNK_SIZE - stagingOffset;
          const take = Math.min(space, value.byteLength - srcOffset);
          staging.set(value.subarray(srcOffset, srcOffset + take), stagingOffset);
          stagingOffset += take;
          srcOffset += take;

          if (stagingOffset === UPLOAD_CHUNK_SIZE) {
            this.store.putUploadChunk(uploadId, chunkIndex, staging);
            chunkIndex += 1;
            staging = new Uint8Array(UPLOAD_CHUNK_SIZE);
            stagingOffset = 0;
          }
        }
      }

      if (stagingOffset > 0) {
        this.store.putUploadChunk(uploadId, chunkIndex, staging.subarray(0, stagingOffset));
      }
      this.store.finalizeUploadSize(uploadId, totalBytes, UPLOAD_CHUNK_SIZE);
      return { ok: true, totalBytes };
    } catch {
      this.store.deleteUploadData(uploadId);
      return { ok: false, status: 500, error: 'Error: Upload stream failed' };
    }
  }

  async handleUploadPost(request, uploader) {
    const rawHeaderName = request.headers.get('X-File-Name') || '';
    let decodedName = 'attachment';
    try {
      decodedName = rawHeaderName ? decodeURIComponent(rawHeaderName) : 'attachment';
    } catch {
      decodedName = rawHeaderName || 'attachment';
    }
    const safeName = sanitizeUploadFileName(decodedName);
    const rawHeaderMime =
      request.headers.get('X-File-Mime') || request.headers.get('Content-Type') || '';
    const classified = classifyUpload(rawHeaderMime, safeName);

    const id = crypto.randomUUID();
    const safeExt = getExtName(safeName).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12);
    const diskName = `${id}${safeExt}`;

    const written = await this.streamBodyIntoUploadChunks(id, request, MAX_UPLOAD_BYTES);
    if (!written.ok) {
      return jsonResponse(request, written.status, { ok: false, error: written.error });
    }

    const meta = {
      id,
      diskName,
      name: safeName,
      mime: classified.mime,
      size: written.totalBytes,
      kind: classified.kind,
      uploadedBy: uploader.username.toLowerCase(),
      createdAt: Date.now(),
    };
    this.db.uploads[id] = meta;
    this.saveDb();
    return jsonResponse(request, 200, { ok: true, attachment: toClientAttachment(meta) });
  }

  handleServeUpload(request, urlObj) {
    const uploadId = urlObj.pathname.slice('/api/uploads/'.length).split('/')[0];
    if (!/^[0-9a-f-]{36}$/i.test(uploadId)) {
      return jsonResponse(request, 404, { ok: false, error: 'Error: Attachment not found' });
    }
    const meta = this.db.uploads[uploadId];
    if (!meta) {
      return jsonResponse(request, 404, { ok: false, error: 'Error: Attachment not found' });
    }

    const sizeInfo = this.store.getUploadSizeInfo(uploadId);
    if (!sizeInfo) {
      return jsonResponse(request, 404, { ok: false, error: 'Error: Attachment file missing' });
    }

    const fileSize = sizeInfo.totalBytes;
    const chunkSize = sizeInfo.chunkSize || UPLOAD_CHUNK_SIZE;
    const forceDownload = urlObj.searchParams.get('download') === '1' || meta.kind === 'file';
    const safeAsciiName = meta.name.replace(/["\\]/g, '_');
    const encodedName = encodeURIComponent(meta.name);
    const disposition = forceDownload ? 'attachment' : 'inline';

    const baseHeaders = {
      ...buildCorsHeaders(request),
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
      'Content-Type': forceDownload ? 'application/octet-stream' : meta.mime,
      'Content-Disposition': `${disposition}; filename="${safeAsciiName}"; filename*=UTF-8''${encodedName}`,
    };

    const makeRangeStream = (start, end) => {
      let currentPos = start;
      const store = this.store;
      return new ReadableStream({
        pull(controller) {
          if (currentPos > end) {
            controller.close();
            return;
          }
          const cIdx = Math.floor(currentPos / chunkSize);
          const chunk = store.getUploadChunk(uploadId, cIdx);
          if (!chunk) {
            controller.close();
            return;
          }
          const chunkStartOffset = currentPos - cIdx * chunkSize;
          const remainingInRange = end - currentPos + 1;
          const availableInChunk = chunk.length - chunkStartOffset;
          const take = Math.min(remainingInRange, availableInChunk);
          if (take <= 0) {
            controller.close();
            return;
          }
          controller.enqueue(chunk.slice(chunkStartOffset, chunkStartOffset + take));
          currentPos += take;
          if (currentPos > end) {
            controller.close();
          }
        },
      });
    };

    const rangeHeader = request.headers.get('Range') || '';
    if (rangeHeader && fileSize > 0) {
      const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
      if (!match) {
        return new Response(null, {
          status: 416,
          headers: { ...baseHeaders, 'Content-Range': `bytes */${fileSize}` },
        });
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
        return new Response(null, {
          status: 416,
          headers: { ...baseHeaders, 'Content-Range': `bytes */${fileSize}` },
        });
      }
      end = Math.min(end, fileSize - 1);
      const headers = {
        ...baseHeaders,
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': String(end - start + 1),
      };
      if (request.method === 'HEAD') {
        return new Response(null, { status: 206, headers });
      }
      return new Response(makeRangeStream(start, end), { status: 206, headers });
    }

    const headers = { ...baseHeaders, 'Content-Length': String(fileSize) };
    if (request.method === 'HEAD' || fileSize === 0) {
      return new Response(null, { status: 200, headers });
    }
    return new Response(makeRangeStream(0, fileSize - 1), { status: 200, headers });
  }

  async readJsonBody(request) {
    const contentLen = Number(request.headers.get('Content-Length'));
    if (Number.isFinite(contentLen) && contentLen > MAX_JSON_BYTES) {
      return { ok: false, status: 413, error: 'Error: Payload too large' };
    }
    try {
      const text = await request.text();
      if (text.length > MAX_JSON_BYTES) {
        return { ok: false, status: 413, error: 'Error: Payload too large' };
      }
      const parsed = text ? JSON.parse(text) : {};
      return { ok: true, body: parsed && typeof parsed === 'object' ? parsed : {} };
    } catch {
      return { ok: false, status: 400, error: 'Error: Invalid request body' };
    }
  }

  // --- Durable Object WebSocket Hibernation Handlers ---
  async handleWebSocketUpgrade(request, urlObj) {
    const token = urlObj.searchParams.get('token') ?? '';
    const username = this.db.sessions[token];
    if (!username || !this.findAccountByUsername(username)) {
      return new Response('Unauthorized', { status: 401 });
    }
    const key = username.toLowerCase();
    const wasOffline = this.getUserSockets(key).length === 0;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    const socketId = crypto.randomUUID();
    server.serializeAttachment({ username: key, token, socketId });
    this.lastSeenByUser.set(key, Date.now());

    // Push fresh snapshot and active VC state immediately to this socket
    const snapshot = this.buildSocialSnapshot(key);
    if (snapshot) {
      try {
        server.send(JSON.stringify({ type: 'social:sync', snapshot }));
      } catch {}
    }
    this.sendActiveVcSnapshotsToUser(key, server);
    this.sendActiveActivitiesToUser(key, server);
    if (wasOffline) {
      this.notifyRelatedPeers(key, false);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, rawData) {
    this.ensureLoaded();
    const att = ws.deserializeAttachment();
    const ownerKey = att?.username;
    const ownerSocketId = att?.socketId || '';
    if (!ownerKey) return;

    this.lastSeenByUser.set(ownerKey, Date.now());
    let msg;
    try {
      const str = typeof rawData === 'string' ? rawData : new TextDecoder().decode(rawData);
      msg = JSON.parse(str);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'ping') {
      try {
        ws.send(JSON.stringify({ type: 'pong' }));
      } catch {}
      return;
    }

    if (msg.type === 'dm:typing') {
      if (typeof msg.groupId === 'string' && msg.groupId.trim()) {
        this.emitGroupTypingState(ownerKey, msg.groupId.trim(), Boolean(msg.isTyping));
      } else if (typeof msg.toUsername === 'string') {
        const toKey = msg.toUsername.trim().toLowerCase();
        const recipient = toKey ? this.findAccountByUsername(toKey) : undefined;
        if (
          toKey &&
          recipient &&
          !this.hasAnyBlockBetween(ownerKey, toKey) &&
          (this.areFriends(ownerKey, toKey) || recipient.privacy?.allowNonFriendDms !== false)
        ) {
          this.emitTypingState(ownerKey, toKey, Boolean(msg.isTyping));
        }
      }
      return;
    }

    if (msg.type === 'vc:join') {
      const ctx = this.resolveThreadContext(
        ownerKey,
        {
          peerUsername: typeof msg.peerUsername === 'string' ? msg.peerUsername : '',
          groupId: typeof msg.groupId === 'string' ? msg.groupId : '',
        },
        { mode: 'write' },
      );
      if (!ctx.ok) {
        this.sendWsEventToUser(ownerKey, {
          type: 'vc:error',
          error: ctx.error ?? 'Error: Cannot start voice call',
        });
        return;
      }

      // Enforce single active call per account across all devices (desktop <-> mobile):
      // disconnect this user from any OTHER call and notify the previous device cleanly.
      for (const otherCall of Array.from(this.activeVoiceCalls.values())) {
        if (otherCall.threadKey === ctx.threadKey) continue;
        const prevEntry = otherCall.participants.get(ownerKey);
        if (!prevEntry) continue;
        otherCall.participants.delete(ownerKey);
        this.removeUserSeatedLobbies(ownerKey, otherCall.threadKey);
        if (
          otherCall.participants.size === 0 ||
          (ownerKey === otherCall.startedBy && !otherCall.everHadAnswer)
        ) {
          this.clearAllRingingInCall(otherCall);
        }
        if (prevEntry.socketId && prevEntry.socketId !== ownerSocketId) {
          const prevWs = this.findUserSocketById(ownerKey, prevEntry.socketId);
          this.sendWsEventToSocket(prevWs, {
            type: 'vc:transferred',
            threadKey: otherCall.threadKey,
            newThreadKey: ctx.threadKey,
            reason: 'Call moved to another device',
          });
        }
        this.broadcastVcState(otherCall);
        this.finalizeCallIfDone(otherCall);
      }

      let call = this.activeVoiceCalls.get(ctx.threadKey);
      const isNewCall = !call || (call.participants.size === 0 && call.ringing.size === 0);
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
        this.activeVoiceCalls.set(ctx.threadKey, call);
      } else {
        call.seenParticipants.add(ownerKey);
        if (ctx.kind === 'group') {
          call.allowedUsers = ctx.participants.map((u) => u.toLowerCase());
        }
      }

      this.stopRingingUser(call, ownerKey);
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
          watchingStreams: [],
          socketId: ownerSocketId,
          connectionId: crypto.randomUUID(),
          joinedAt: now,
        });
      } else {
        const existing = call.participants.get(ownerKey);
        if (existing) {
          if (existing.socketId && ownerSocketId && existing.socketId !== ownerSocketId) {
            const prevWs = this.findUserSocketById(ownerKey, existing.socketId);
            if (prevWs) {
              this.sendWsEventToSocket(prevWs, {
                type: 'vc:transferred',
                threadKey: call.threadKey,
                newThreadKey: call.threadKey,
                reason: 'Call moved to another device',
              });
            }
            existing.socketId = ownerSocketId;
            if (prevWs || !msg.reconnect) {
              existing.connectionId = crypto.randomUUID();
              existing.joinedAt = now;
            }
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
        if (!call.answeredAt) call.answeredAt = now;
      }

      const shouldRing = isNewCall && msg.ring !== false;
      if (shouldRing) {
        this.ringCallTargets(call, ctx, ownerKey, null, false);
      }

      // Broadcast live VC state IMMEDIATELY so joining/ringing UI updates in <10ms.
      this.broadcastVcState(call);
      this.notifyPeersVoicePresence(ownerKey);

      if (isNewCall) {
        this.createCallLogMessage(call);
      } else {
        this.syncCallLogMessage(call, call.everHadAnswer ? 'active' : 'ringing');
      }
      this.persistActiveVoiceCalls();
      return;
    }

    if (msg.type === 'vc:ring') {
      const threadKey = typeof msg.threadKey === 'string' ? msg.threadKey.trim() : '';
      const call = threadKey ? this.activeVoiceCalls.get(threadKey) : undefined;
      if (!call || call.finalized || !call.participants.has(ownerKey)) {
        return;
      }
      const targetUser =
        typeof msg.targetUsername === 'string' ? msg.targetUsername.trim().toLowerCase() : '';
      const peerForCtx =
        call.kind === 'dm'
          ? call.allowedUsers.find((u) => u.toLowerCase() !== ownerKey) || targetUser
          : '';
      const ctx = this.resolveThreadContext(
        ownerKey,
        call.kind === 'group' ? { groupId: call.groupId } : { peerUsername: peerForCtx },
      );
      if (!ctx.ok) {
        return;
      }
      if (ctx.kind === 'group') {
        call.allowedUsers = ctx.participants.map((u) => u.toLowerCase());
      }
      const rang = this.ringCallTargets(
        call,
        ctx,
        ownerKey,
        targetUser ? [targetUser] : null,
        true,
      );
      if (rang) {
        this.broadcastVcState(call);
        this.persistActiveVoiceCalls();
      }
      return;
    }

    if (msg.type === 'vc:decline') {
      const threadKey = typeof msg.threadKey === 'string' ? msg.threadKey.trim() : '';
      const call = threadKey ? this.activeVoiceCalls.get(threadKey) : undefined;
      if (call && this.stopRingingUser(call, ownerKey)) {
        this.finalizeCallIfDone(call);
        this.persistActiveVoiceCalls();
        this.broadcastVcState(call);
      }
      return;
    }

    if (msg.type === 'vc:leave') {
      const threadKey = typeof msg.threadKey === 'string' ? msg.threadKey.trim() : '';
      const call = threadKey ? this.activeVoiceCalls.get(threadKey) : undefined;
      if (call) {
        const currentEntry = call.participants.get(ownerKey);
        if (currentEntry?.socketId && ownerSocketId && currentEntry.socketId !== ownerSocketId) {
          // Ignore stale leave from a previously transferred device so the new device stays in the call.
          this.sendWsEventToSocket(ws, this.buildVcStatePayload(call, ownerKey));
          return;
        }
        const removed = call.participants.delete(ownerKey);
        const clearedRing = this.stopRingingUser(call, ownerKey);
        this.removeUserSeatedLobbies(ownerKey, call.threadKey);
        if (
          call.participants.size === 0 ||
          (ownerKey === call.startedBy && !call.everHadAnswer)
        ) {
          this.clearAllRingingInCall(call);
        }
        if (removed || clearedRing) {
          // Broadcast updated VC state FIRST so leaving user & peers see removal in <10ms.
          this.broadcastVcState(call);
          this.finalizeCallIfDone(call);
          this.persistActiveVoiceCalls();
          if (removed) {
            this.notifyPeersVoicePresence(ownerKey);
          }
        } else {
          this.sendWsEventToUser(ownerKey, this.buildVcStatePayload(call, ownerKey));
        }
      } else if (threadKey) {
        this.removeUserSeatedLobbies(ownerKey, threadKey);
        const isGroup = threadKey.startsWith('group:');
        this.sendWsEventToUser(ownerKey, {
          type: 'vc:state',
          threadKey,
          kind: isGroup ? 'group' : 'dm',
          groupId: isGroup ? threadKey.slice('group:'.length) : undefined,
          active: false,
          participants: [],
          ringing: [],
        });
      }
      return;
    }

    if (msg.type === 'vc:voice-state') {
      const threadKey = typeof msg.threadKey === 'string' ? msg.threadKey.trim() : '';
      const call = threadKey ? this.activeVoiceCalls.get(threadKey) : undefined;
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
        const nextWatching = Array.isArray(msg.watchingStreams)
          ? msg.watchingStreams
              .filter((s) => typeof s === 'string' && s.trim())
              .map((s) => s.trim().slice(0, 80))
              .slice(0, 20)
          : [];
        const prevWatchingSig = Array.isArray(entry.watchingStreams)
          ? entry.watchingStreams.join(',')
          : '';
        const nextWatchingSig = nextWatching.join(',');
        if (
          entry.muted !== nextMuted ||
          entry.deafened !== nextDeafened ||
          Boolean(entry.cameraOn) !== nextCameraOn ||
          Boolean(entry.screenSharing) !== nextScreenSharing ||
          Boolean(entry.screenPaused) !== nextScreenPaused ||
          entry.cameraStreamId !== nextCamId ||
          entry.screenStreamId !== nextScrId ||
          prevWatchingSig !== nextWatchingSig
        ) {
          entry.muted = nextMuted;
          entry.deafened = nextDeafened;
          entry.cameraOn = nextCameraOn;
          entry.screenSharing = nextScreenSharing;
          entry.screenPaused = nextScreenPaused;
          entry.cameraStreamId = nextCamId;
          entry.screenStreamId = nextScrId;
          entry.watchingStreams = nextWatching;
          this.persistActiveVoiceCalls();
          this.broadcastVcState(call);
        }
      }
      return;
    }

    if (msg.type === 'vc:speaking') {
      const threadKey = typeof msg.threadKey === 'string' ? msg.threadKey.trim() : '';
      const call = threadKey ? this.activeVoiceCalls.get(threadKey) : undefined;
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
            this.sendWsEventToUser(participantKey, payload);
          }
        }
      }
      return;
    }

    if (msg.type === 'vc:signal') {
      const threadKey = typeof msg.threadKey === 'string' ? msg.threadKey.trim() : '';
      const toKey = typeof msg.toUsername === 'string' ? msg.toUsername.trim().toLowerCase() : '';
      const call = threadKey ? this.activeVoiceCalls.get(threadKey) : undefined;
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
          ? this.findUserSocketById(toKey, targetEntry.socketId)
          : null;
        if (targetWs) {
          this.sendWsEventToSocket(targetWs, sigPayload);
        } else {
          this.sendWsEventToUser(toKey, sigPayload);
        }
      }
      return;
    }

    if (msg.type === 'activity:list') {
      this.sendActiveActivitiesToUser(ownerKey, ws);
      return;
    }

    if (msg.type === 'activity:create') {
      const validGames = new Set([
        'chess',
        'checkers',
        'minesweeper',
        'vexilloguessr',
        'pool',
        'quoridor',
      ]);
      const gameId = typeof msg.gameId === 'string' ? msg.gameId.trim().toLowerCase() : '';
      if (!validGames.has(gameId)) return;
      // Remove any previous lobby this player was seated in so switching games leaves no stale activity behind.
      this.removeUserSeatedLobbies(ownerKey);
      const threadKey = typeof msg.threadKey === 'string' ? msg.threadKey.trim() : '';
      const rawMax = Number(msg.maxPlayers) || 2;
      const maxPlayers =
        gameId === 'quoridor'
          ? Math.max(2, Math.min(4, Math.round(rawMax)))
          : gameId === 'minesweeper'
            ? Math.max(2, Math.min(6, Math.round(rawMax)))
            : 2;
      const gameMode =
        (gameId === 'chess' || gameId === 'checkers') && msg.gameMode === 'blitz'
          ? 'blitz'
          : 'standard';
      const isPublic = msg.isPublic !== false;
      const hostProfile = this.buildActivityUserProfile(ownerKey);
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
        gameMode,
        status: 'waiting',
        players: [{ username: hostProfile.username, seat: 0, wins: 0 }],
        spectators: [],
        gameState: msg.initialGameState ?? null,
        version: 1,
        createdAt: nowTs,
        updatedAt: nowTs,
      };
      this.activeActivityLobbies.set(lobby.id, lobby);
      this.persistActiveActivityLobbies();
      this.broadcastActivityLobby(lobby);
      return;
    }

    if (msg.type === 'activity:join') {
      const lobbyId = typeof msg.lobbyId === 'string' ? msg.lobbyId.trim() : '';
      const lobby = lobbyId ? this.activeActivityLobbies.get(lobbyId) : undefined;
      if (!lobby) return;
      const asSpectator = Boolean(msg.asSpectator);
      const userProf = this.buildActivityUserProfile(ownerKey);
      const existingPlayer = lobby.players.find((p) => p.username.toLowerCase() === ownerKey);
      const existingSpecIdx = lobby.spectators.findIndex(
        (s) => s.username.toLowerCase() === ownerKey,
      );
      if (
        !asSpectator &&
        !existingPlayer &&
        lobby.players.length < lobby.maxPlayers &&
        (lobby.status === 'waiting' || Boolean(msg.allowMidJoin))
      ) {
        this.removeUserSeatedLobbies(ownerKey, '', lobby.id);
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
      this.persistActiveActivityLobbies();
      this.broadcastActivityLobby(lobby);
      return;
    }

    if (msg.type === 'activity:unwatch') {
      const lobbyId = typeof msg.lobbyId === 'string' ? msg.lobbyId.trim() : '';
      const lobby = lobbyId ? this.activeActivityLobbies.get(lobbyId) : undefined;
      if (!lobby) return;
      const prevLen = (lobby.spectators || []).length;
      lobby.spectators = (lobby.spectators || []).filter(
        (s) => s.username.toLowerCase() !== ownerKey,
      );
      if (lobby.spectators.length !== prevLen) {
        lobby.version = (lobby.version || 1) + 1;
        lobby.updatedAt = Date.now();
        this.persistActiveActivityLobbies();
        this.broadcastActivityLobby(lobby);
      }
      return;
    }

    if (msg.type === 'activity:config') {
      const lobbyId = typeof msg.lobbyId === 'string' ? msg.lobbyId.trim() : '';
      const lobby = lobbyId ? this.activeActivityLobbies.get(lobbyId) : undefined;
      if (!lobby || lobby.hostUsername.toLowerCase() !== ownerKey || lobby.status !== 'waiting') {
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
      if (
        (lobby.gameId === 'chess' || lobby.gameId === 'checkers') &&
        (msg.gameMode === 'standard' || msg.gameMode === 'blitz')
      ) {
        lobby.gameMode = msg.gameMode;
      }
      if (typeof msg.isPublic === 'boolean') {
        lobby.isPublic = msg.isPublic;
      }
      lobby.version = (lobby.version || 1) + 1;
      lobby.updatedAt = Date.now();
      this.persistActiveActivityLobbies();
      this.broadcastActivityLobby(lobby);
      return;
    }

    if (msg.type === 'activity:leave') {
      const lobbyId = typeof msg.lobbyId === 'string' ? msg.lobbyId.trim() : '';
      const lobby = lobbyId ? this.activeActivityLobbies.get(lobbyId) : undefined;
      if (!lobby) return;
      const recipientsBefore = this.getActivityLobbyRecipients(lobby);
      const wasPlayer = lobby.players.some((p) => p.username.toLowerCase() === ownerKey);
      lobby.players = lobby.players.filter((p) => p.username.toLowerCase() !== ownerKey);
      lobby.spectators = lobby.spectators.filter((s) => s.username.toLowerCase() !== ownerKey);
      if (wasPlayer || lobby.players.length === 0) {
        this.activeActivityLobbies.delete(lobby.id);
        this.persistActiveActivityLobbies();
        const removePayload = {
          type: 'activity:lobby-removed',
          lobbyId: lobby.id,
          threadKey: lobby.threadKey,
        };
        for (const targetKey of recipientsBefore) {
          this.sendWsEventToUser(targetKey, removePayload);
        }
        return;
      }
      lobby.version = (lobby.version || 1) + 1;
      lobby.updatedAt = Date.now();
      this.persistActiveActivityLobbies();
      this.broadcastActivityLobby(lobby);
      return;
    }

    if (msg.type === 'activity:start') {
      const lobbyId = typeof msg.lobbyId === 'string' ? msg.lobbyId.trim() : '';
      const lobby = lobbyId ? this.activeActivityLobbies.get(lobbyId) : undefined;
      if (!lobby) return;
      const isPlayer = lobby.players.some((p) => p.username.toLowerCase() === ownerKey);
      if (!isPlayer) return;
      lobby.status = 'playing';
      lobby.rematchVotes = [];
      if (msg.gameState !== undefined) {
        lobby.gameState = msg.gameState;
      }
      lobby.version = (lobby.version || 1) + 1;
      lobby.updatedAt = Date.now();
      this.persistActiveActivityLobbies();
      this.broadcastActivityLobby(lobby);
      return;
    }

    if (msg.type === 'activity:rematch') {
      const lobbyId = typeof msg.lobbyId === 'string' ? msg.lobbyId.trim() : '';
      const lobby = lobbyId ? this.activeActivityLobbies.get(lobbyId) : undefined;
      if (!lobby) return;
      const isPlayer = lobby.players.some((p) => p.username.toLowerCase() === ownerKey);
      if (!isPlayer) return;
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
      this.persistActiveActivityLobbies();
      this.broadcastActivityLobby(lobby);
      return;
    }

    if (msg.type === 'activity:action') {
      const lobbyId = typeof msg.lobbyId === 'string' ? msg.lobbyId.trim() : '';
      const lobby = lobbyId ? this.activeActivityLobbies.get(lobbyId) : undefined;
      if (!lobby) return;
      const isPlayer = lobby.players.some((p) => p.username.toLowerCase() === ownerKey);
      if (!isPlayer) return;
      if (msg.playerBoardPatch && lobby.gameState && typeof lobby.gameState === 'object') {
        const patch =
          msg.playerBoardPatch.status === 'exploded' && !msg.playerBoardPatch.eliminatedAt
            ? { ...msg.playerBoardPatch, eliminatedAt: Date.now() }
            : msg.playerBoardPatch;
        lobby.gameState.playerBoards = {
          ...(lobby.gameState.playerBoards || {}),
          [ownerKey]: patch,
        };
        if (msg.gameStatePatch && typeof msg.gameStatePatch === 'object') {
          Object.assign(lobby.gameState, msg.gameStatePatch);
        }
      } else if (msg.gameState !== undefined) {
        lobby.gameState = msg.gameState;
      }
      if (lobby.gameId === 'minesweeper' && lobby.status === 'playing') {
        const prevStatus = lobby.status;
        this.resolveMinesweeperLobbyOutcome(lobby);
        if (lobby.status === 'finished' && prevStatus !== 'finished') {
          lobby.rematchVotes = [];
          const winUser = lobby.gameState?.winnerUsername;
          if (typeof winUser === 'string' && winUser.trim()) {
            const winKey = winUser.trim().toLowerCase();
            const winner = lobby.players.find((p) => p.username.toLowerCase() === winKey);
            if (winner) {
              winner.wins = (winner.wins || 0) + 1;
            }
          }
        }
      } else if (msg.status === 'finished' && lobby.status !== 'finished') {
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
      this.persistActiveActivityLobbies();
      this.broadcastActivityLobby(lobby);
    }
  }

  handleSocketDisconnect(ws) {
    this.ensureLoaded();
    const att = ws.deserializeAttachment();
    const ownerKey = att?.username;
    const closingSocketId = att?.socketId || '';
    if (!ownerKey) return;

    const remaining = this.ctx
      .getWebSockets()
      .filter((s) => s !== ws && s.deserializeAttachment()?.username === ownerKey);
    if (remaining.length === 0) {
      this.lastSeenByUser.delete(ownerKey);
      for (const timerKey of Array.from(this.typingTimers.keys())) {
        if (timerKey.startsWith(`${ownerKey}::group:`)) {
          const targetGroupId = timerKey.slice(ownerKey.length + '::group:'.length);
          this.emitGroupTypingState(ownerKey, targetGroupId, false);
        } else if (timerKey.startsWith(`${ownerKey}::`)) {
          const targetUser = timerKey.slice(ownerKey.length + 2);
          this.emitTypingState(ownerKey, targetUser, false);
        }
      }
      this.cleanupUserFromVoiceCalls(ownerKey);
      this.notifyRelatedPeers(ownerKey, false);
    } else {
      // Only disconnect calls owned by this specific closing device socket.
      this.cleanupSocketFromVoiceCalls(ownerKey, closingSocketId);
    }
  }

  async webSocketClose(ws) {
    try {
      ws.close();
    } catch {}
    this.handleSocketDisconnect(ws);
  }

  async webSocketError(ws) {
    try {
      ws.close();
    } catch {}
    this.handleSocketDisconnect(ws);
  }

  // --- Main HTTP Router ---
  async fetch(request) {
    this.ensureLoaded();
    const urlObj = new URL(request.url);
    const reqPath = urlObj.pathname;
    const method = request.method;
    const pubOrigin = extractPublicOriginFromUrl(urlObj);
    if (pubOrigin) {
      this.lastKnownPublicOrigin = pubOrigin;
    }

    // WebSocket Upgrade
    if (reqPath === '/ws' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      return this.handleWebSocketUpgrade(request, urlObj);
    }

    // CORS Preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: buildCorsHeaders(request) });
    }

    // Content-hashed cached binary endpoints for user avatars, banners, and group icons
    if ((method === 'GET' || method === 'HEAD') && reqPath.startsWith('/api/media/')) {
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
        const acc = this.findAccountByUsername(targetId);
        rawDataUrl = acc && acc.avatarPreset === null ? acc.avatarDataUrl : undefined;
      } else if (kind === 'banner' && targetId) {
        const acc = this.findAccountByUsername(targetId);
        rawDataUrl = acc?.bannerDataUrl;
      } else if (kind === 'group-icon' && targetId) {
        const grp = this.db.groupDms[targetId];
        rawDataUrl = grp?.iconDataUrl;
      }
      const parsed = rawDataUrl ? parseImageDataUrl(rawDataUrl) : null;
      if (!parsed) {
        return new Response(null, {
          status: 404,
          headers: { ...buildCorsHeaders(request), 'Cache-Control': 'no-store' },
        });
      }
      const headers = {
        ...buildCorsHeaders(request),
        'Content-Type': parsed.mime,
        'Content-Length': String(parsed.buf.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'X-Content-Type-Options': 'nosniff',
        ETag: `"${parsed.hash}"`,
      };
      return new Response(method === 'HEAD' ? null : parsed.buf, { status: 200, headers });
    }

    // Root Landing Status
    if ((method === 'GET' || method === 'HEAD') && (reqPath === '/' || reqPath === '')) {
      return jsonResponse(request, 200, {
        ok: true,
        service: 'redshift',
        mode: 'cloudflare-workers-24x7',
        version: String(this.env.REDSHIFT_VERSION || '0.1.10'),
        onlineUsers: this.countOnlineUsers(),
        website: 'https://redrepost84-ctrl.github.io/redshift/',
      });
    }

    // Public GIF Share Redirect
    if ((method === 'GET' || method === 'HEAD') && reqPath.startsWith('/gif/')) {
      const code = decodeURIComponent(reqPath.slice('/gif/'.length).replace(/\/+$/, ''));
      const resolved = code ? this.resolveGifByCode(code) : null;
      if (resolved && resolved.url) {
        const target = resolved.url.startsWith('/') ? `${urlObj.origin}${resolved.url}` : resolved.url;
        return Response.redirect(target, 302);
      }
      return jsonResponse(request, 404, { ok: false, error: 'Error: GIF link not found' });
    }

    // Health Check
    if ((method === 'GET' || method === 'HEAD') && reqPath === '/api/health') {
      return jsonResponse(request, 200, {
        ok: true,
        service: 'redshift',
        version: String(this.env.REDSHIFT_VERSION || '0.1.14'),
        onlineUsers: this.countOnlineUsers(),
        uptimeSec: Math.floor((Date.now() - this.bootedAt) / 1000),
        wsReady: true,
        cloud: 'cloudflare-workers',
        serverTime: Date.now(),
      });
    }

    // Public Web Push VAPID key (iPhone iOS 16.4+ & Android lock-screen notifications)
    if (method === 'GET' && reqPath === '/api/push/public-key') {
      const publicKey = String(this.env.VAPID_PUBLIC_KEY || '').trim();
      const privateKey = String(this.env.VAPID_PRIVATE_KEY || '').trim();
      return jsonResponse(request, 200, {
        ok: true,
        configured: Boolean(publicKey && privateKey),
        publicKey,
      });
    }

    // Desktop Auto-Updater Manifest / Patch Redirect to GitHub Releases
    if ((method === 'GET' || method === 'HEAD') && reqPath === '/api/desktop/version.json') {
      const repo = String(this.env.GITHUB_REPO || 'redrepost84-ctrl/redshift').trim();
      try {
        const gh = await fetch(`https://github.com/${repo}/releases/latest/download/version.json`, {
          redirect: 'follow',
        });
        if (gh.ok) {
          const text = await gh.text();
          return new Response(text, {
            status: 200,
            headers: {
              ...buildCorsHeaders(request),
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store',
            },
          });
        }
      } catch {}
      return jsonResponse(request, 404, { ok: false, error: 'Desktop update manifest unavailable' });
    }

    if ((method === 'GET' || method === 'HEAD') && reqPath === '/api/desktop/patch.asar') {
      const repo = String(this.env.GITHUB_REPO || 'redrepost84-ctrl/redshift').trim();
      return Response.redirect(
        `https://github.com/${repo}/releases/latest/download/Redshift-patch.asar`,
        302,
      );
    }

    // Admin & Data Migration Endpoints (X-Admin-Secret protected)
    if (reqPath.startsWith('/api/admin/')) {
      if (!this.isAuthorizedAdmin(request)) {
        return jsonResponse(request, 403, {
          ok: false,
          error: 'Forbidden: Missing or invalid X-Admin-Secret header',
        });
      }

      if (method === 'GET' && reqPath === '/api/admin/stats') {
        let totalMessages = 0;
        for (const list of Object.values(this.db.dms)) {
          if (Array.isArray(list)) totalMessages += list.length;
        }
        const blobs = this.store.listUploadedBlobIds();
        return jsonResponse(request, 200, {
          ok: true,
          accounts: this.db.accounts.length,
          groupDms: Object.keys(this.db.groupDms).length,
          threads: Object.keys(this.db.dms).length,
          messages: totalMessages,
          sessions: Object.keys(this.db.sessions).length,
          uploadMetas: Object.keys(this.db.uploads).length,
          uploadedBlobs: blobs.length,
          uploadedBlobBytes: blobs.reduce((sum, b) => sum + b.totalBytes, 0),
          communityGifs: this.db.communityGifs.length,
          onlineUsers: this.countOnlineUsers(),
          smtpConfigured: Boolean(
            String(this.env.SMTP_USER || '').trim() &&
              String(this.env.SMTP_PASS || '').replace(/\s+/g, '').trim(),
          ),
        });
      }

      if (method === 'GET' && reqPath === '/api/admin/accounts') {
        const accounts = this.db.accounts.map((acc) => {
          const uKey = acc.username.toLowerCase();
          const activeSessions = Object.values(this.db.sessions).filter((v) => v === uKey).length;
          return {
            username: acc.username,
            displayName: acc.displayName,
            email: acc.email,
            bio: acc.bio || '',
            status: acc.status || 'online',
            online: this.isUserSocketOnline(acc.username),
            createdAt: acc.createdAt,
            friends: this.db.friendships[uKey] ?? [],
            activeSessions,
          };
        });
        return jsonResponse(request, 200, { ok: true, total: accounts.length, accounts });
      }

      if (method === 'POST' && reqPath.startsWith('/api/admin/import-upload/')) {
        const uploadId = decodeURIComponent(reqPath.slice('/api/admin/import-upload/'.length)).trim();
        if (!uploadId || uploadId.includes('/')) {
          return jsonResponse(request, 400, { ok: false, error: 'Invalid uploadId' });
        }
        const written = await this.streamBodyIntoUploadChunks(uploadId, request, MAX_UPLOAD_BYTES);
        if (!written.ok) {
          return jsonResponse(request, written.status, { ok: false, error: written.error });
        }
        return jsonResponse(request, 200, { ok: true, uploadId, totalBytes: written.totalBytes });
      }

      const parsedAdminBody = await this.readJsonBody(request);
      if (!parsedAdminBody.ok) {
        return jsonResponse(request, parsedAdminBody.status, {
          ok: false,
          error: parsedAdminBody.error,
        });
      }
      const body = parsedAdminBody.body;

      if (method === 'POST' && reqPath === '/api/admin/import-state') {
        if (Array.isArray(body.accounts)) {
          this.db.accounts = body.accounts;
        }
        if (body.groupDms && typeof body.groupDms === 'object') {
          this.db.groupDms = body.groupDms;
        }
        for (const key of SMALL_KV_KEYS) {
          if (Object.prototype.hasOwnProperty.call(body, key)) {
            this.db[key] = body[key];
          }
        }
        if (body.replaceMessages === true && Array.isArray(body.messages)) {
          this.store.replaceAllMessages(body.messages);
          this.db.dms = {};
          for (const item of body.messages) {
            if (!item?.threadKey || !item?.msg?.id) continue;
            if (!Array.isArray(this.db.dms[item.threadKey])) this.db.dms[item.threadKey] = [];
            this.db.dms[item.threadKey].push(item.msg);
          }
        } else if (Array.isArray(body.messages) && body.messages.length > 0) {
          this.store.upsertMessagesBatch(body.messages);
          for (const item of body.messages) {
            if (!item?.threadKey || !item?.msg?.id) continue;
            if (!Array.isArray(this.db.dms[item.threadKey])) this.db.dms[item.threadKey] = [];
            const idx = this.db.dms[item.threadKey].findIndex((m) => m.id === item.msg.id);
            if (idx >= 0) this.db.dms[item.threadKey][idx] = item.msg;
            else this.db.dms[item.threadKey].push(item.msg);
          }
        }
        this.saveDb();
        return jsonResponse(request, 200, {
          ok: true,
          accounts: this.db.accounts.length,
          groupDms: Object.keys(this.db.groupDms).length,
          importedMessages: Array.isArray(body.messages) ? body.messages.length : 0,
        });
      }

      if (method === 'POST' && reqPath === '/api/admin/accounts/update') {
        const targetUsername = typeof body.username === 'string' ? body.username.trim() : '';
        const account = targetUsername ? this.findAccountByUsername(targetUsername) : undefined;
        if (!account) return jsonResponse(request, 404, { ok: false, error: 'Account not found' });
        if (typeof body.displayName === 'string' && body.displayName.trim()) {
          account.displayName = body.displayName.trim().slice(0, 32);
        }
        if (typeof body.email === 'string' && EMAIL_REGEX.test(body.email.trim())) {
          account.email = body.email.trim().toLowerCase();
        }
        if (typeof body.newPassword === 'string' && body.newPassword.length >= 6) {
          account.passwordHash = hashPassword(body.newPassword);
        }
        if (typeof body.bio === 'string') account.bio = body.bio.slice(0, 300);
        if (typeof body.status === 'string' && VALID_STATUSES.has(body.status)) {
          account.status = body.status;
        }
        if (typeof body.avatarPreset === 'number') {
          account.avatarPreset = body.avatarPreset;
          delete account.avatarDataUrl;
        }
        if (typeof body.bannerColor === 'string' && HEX_COLOR_REGEX.test(body.bannerColor)) {
          account.bannerColor = body.bannerColor;
        }
        this.saveDb();
        this.notifyRelatedPeers(account.username, true);
        return jsonResponse(request, 200, {
          ok: true,
          account: {
            username: account.username,
            displayName: account.displayName,
            email: account.email,
            bio: account.bio,
            status: account.status,
          },
        });
      }

      if (method === 'POST' && reqPath === '/api/admin/accounts/kick') {
        const targetUsername = typeof body.username === 'string' ? body.username.trim() : '';
        const uKey = targetUsername.toLowerCase();
        const account = uKey ? this.findAccountByUsername(uKey) : undefined;
        if (!account) return jsonResponse(request, 404, { ok: false, error: 'Account not found' });
        let revokedSessions = 0;
        for (const [tok, ownerKey] of Object.entries(this.db.sessions)) {
          if (ownerKey === uKey) {
            delete this.db.sessions[tok];
            revokedSessions += 1;
          }
        }
        this.saveDb();
        let closedSockets = 0;
        for (const ws of this.getUserSockets(uKey)) {
          try {
            ws.close(4001, 'Session terminated by moderator');
            closedSockets += 1;
          } catch {}
        }
        this.lastSeenByUser.delete(uKey);
        this.cleanupUserFromVoiceCalls(uKey);
        this.notifyRelatedPeers(uKey, false);
        return jsonResponse(request, 200, {
          ok: true,
          username: account.username,
          revokedSessions,
          closedSockets,
        });
      }

      if (method === 'POST' && reqPath === '/api/admin/accounts/delete') {
        const targetUsername = typeof body.username === 'string' ? body.username.trim() : '';
        const uKey = targetUsername.toLowerCase();
        const idx = this.db.accounts.findIndex((a) => a.username.toLowerCase() === uKey);
        if (idx === -1) return jsonResponse(request, 404, { ok: false, error: 'Account not found' });
        const [removedAcc] = this.db.accounts.splice(idx, 1);

        for (const [tok, ownerKey] of Object.entries(this.db.sessions)) {
          if (ownerKey === uKey) delete this.db.sessions[tok];
        }
        for (const ws of this.getUserSockets(uKey)) {
          try {
            ws.close(4002, 'Account deleted by moderator');
          } catch {}
        }
        this.lastSeenByUser.delete(uKey);
        this.cleanupUserFromVoiceCalls(uKey);

        delete this.db.friendships[uKey];
        for (const [k, list] of Object.entries(this.db.friendships)) {
          if (Array.isArray(list)) this.db.friendships[k] = list.filter((f) => f.toLowerCase() !== uKey);
        }
        delete this.db.blocks[uKey];
        for (const [k, list] of Object.entries(this.db.blocks)) {
          if (Array.isArray(list)) this.db.blocks[k] = list.filter((b) => b.toLowerCase() !== uKey);
        }
        this.db.friendRequests = this.db.friendRequests.filter(
          (r) => r.from.toLowerCase() !== uKey && r.to.toLowerCase() !== uKey,
        );
        delete this.db.openDms[uKey];
        for (const [k, list] of Object.entries(this.db.openDms)) {
          if (Array.isArray(list)) this.db.openDms[k] = list.filter((u) => u.toLowerCase() !== uKey);
        }
        for (const [gid, grp] of Object.entries(this.db.groupDms)) {
          if (grp && Array.isArray(grp.members)) {
            grp.members = grp.members.filter((m) => m.toLowerCase() !== uKey);
            if (grp.members.length === 0) {
              delete this.db.groupDms[gid];
            } else if (grp.ownerUsername && grp.ownerUsername.toLowerCase() === uKey) {
              grp.ownerUsername = grp.members[0];
            }
          }
        }
        this.saveDb();
        for (const other of this.db.accounts) {
          this.pushSnapshotToUser(other.username.toLowerCase());
        }
        return jsonResponse(request, 200, { ok: true, deletedUsername: removedAcc.username });
      }

      return jsonResponse(request, 404, { ok: false, error: 'Admin endpoint not found' });
    }

    // Streaming Binary Upload
    if (method === 'POST' && reqPath === '/api/uploads') {
      const uploader = this.authenticateRequest(request);
      if (!uploader) {
        return jsonResponse(request, 401, {
          ok: false,
          error: 'Error: Session expired — please sign in again',
        });
      }
      const upLimit = this.rateLimiter.check(`upload:${uploader.username.toLowerCase()}`, 60, 60_000);
      if (!upLimit.ok) {
        return jsonResponse(
          request,
          429,
          { ok: false, error: `Error: Upload rate limit reached. Try again in ${upLimit.retryAfterSec}s` },
          { 'Retry-After': String(upLimit.retryAfterSec) },
        );
      }
      return this.handleUploadPost(request, uploader);
    }

    // Serve Upload (GET/HEAD + Range 206)
    if ((method === 'GET' || method === 'HEAD') && reqPath.startsWith('/api/uploads/')) {
      return this.handleServeUpload(request, urlObj);
    }

    if (!reqPath.startsWith('/api/')) {
      return jsonResponse(request, 404, { ok: false, error: 'Not found' });
    }

    // Parse JSON for all POST API endpoints
    let body = {};
    if (method === 'POST') {
      const parsed = await this.readJsonBody(request);
      if (!parsed.ok) {
        return jsonResponse(request, parsed.status, { ok: false, error: parsed.error });
      }
      body = parsed.body;
    }

    // Rate limit public auth endpoints
    if (
      method === 'POST' &&
      (reqPath === '/api/auth/signin' ||
        reqPath === '/api/auth/signup' ||
        reqPath === '/api/forgot-password' ||
        reqPath === '/api/verify-reset-code')
    ) {
      const ip = this.getClientIp(request);
      const authLimit = this.rateLimiter.check(`auth:${reqPath}:${ip}`, AUTH_RATE_LIMIT, 60_000);
      if (!authLimit.ok) {
        return jsonResponse(
          request,
          429,
          {
            ok: false,
            error: `Error: Too many attempts. Please wait ${authLimit.retryAfterSec}s and try again`,
          },
          { 'Retry-After': String(authLimit.retryAfterSec) },
        );
      }
    }

    // Auth: Sign in
    if (method === 'POST' && reqPath === '/api/auth/signin') {
      const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      if (!identifier && !password) {
        return jsonResponse(request, 400, {
          ok: false,
          error: 'Error: Enter your username/email and password',
        });
      }
      if (!identifier) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Username or email is required' });
      }
      if (!password) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Password is required' });
      }
      const looksLikeEmail = identifier.includes('@');
      if (looksLikeEmail && !EMAIL_REGEX.test(identifier)) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Invalid email format' });
      }
      const account = this.findAccountByIdentifier(identifier);
      if (!account) {
        return jsonResponse(request, 404, {
          ok: false,
          error: looksLikeEmail ? 'Error: Nonexistent email' : 'Error: Nonexistent account',
        });
      }
      if (!verifyPassword(password, account.passwordHash)) {
        return jsonResponse(request, 401, { ok: false, error: 'Error: Wrong Password' });
      }
      const token = this.issueSessionToken(account.username);
      return jsonResponse(request, 200, {
        ok: true,
        token,
        snapshot: this.buildSocialSnapshot(account.username),
      });
    }

    // Auth: Sign up
    if (method === 'POST' && reqPath === '/api/auth/signup') {
      const rawUsername = typeof body.username === 'string' ? body.username.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      const confirmEmail = typeof body.confirmEmail === 'string' ? body.confirmEmail.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';

      if (!rawUsername) return jsonResponse(request, 400, { ok: false, error: 'Error: Username is required' });
      if (rawUsername.length < 2 || rawUsername.length > 32) {
        return jsonResponse(request, 400, {
          ok: false,
          error: 'Error: Username must be between 2 and 32 characters',
        });
      }
      if (!USERNAME_REGEX.test(rawUsername)) {
        return jsonResponse(request, 400, {
          ok: false,
          error: 'Error: Username can only use letters, numbers, underscores, periods, and hyphens',
        });
      }
      if (this.findAccountByUsername(rawUsername)) {
        return jsonResponse(request, 409, { ok: false, error: 'Error: Username is already taken' });
      }
      if (!email) return jsonResponse(request, 400, { ok: false, error: 'Error: Email is required' });
      if (!EMAIL_REGEX.test(email)) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Invalid email format' });
      }
      if (this.findAccountByEmail(email)) {
        return jsonResponse(request, 409, { ok: false, error: 'Error: Email is already registered' });
      }
      if (!confirmEmail) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Please confirm your email' });
      }
      if (email.toLowerCase() !== confirmEmail.toLowerCase()) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Emails do not match' });
      }
      const passErr = validatePasswordPair(password, confirmPassword);
      if (passErr) return jsonResponse(request, 400, { ok: false, error: passErr });

      const avatarPreset =
        typeof body.avatarPreset === 'number' && body.avatarPreset >= 0 && body.avatarPreset <= 3
          ? body.avatarPreset
          : null;
      const avatarDataUrl =
        avatarPreset === null &&
        typeof body.avatarDataUrl === 'string' &&
        body.avatarDataUrl.startsWith('data:image/')
          ? body.avatarDataUrl
          : undefined;

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
      this.db.accounts.push(newAccount);
      this.saveDb();
      const token = this.issueSessionToken(newAccount.username);
      return jsonResponse(request, 200, {
        ok: true,
        token,
        snapshot: this.buildSocialSnapshot(newAccount.username),
      });
    }

    // Auth: Forgot Password
    if (method === 'POST' && reqPath === '/api/forgot-password') {
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      if (!email) return jsonResponse(request, 400, { ok: false, error: 'Error: Email is required' });
      if (!EMAIL_REGEX.test(email)) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Invalid email format' });
      }
      const account = this.findAccountByEmail(email);
      if (!account) return jsonResponse(request, 404, { ok: false, error: 'Error: Nonexistent email' });
      const result = await this.issueResetEmail(account.email);
      return jsonResponse(request, result.status, result.payload);
    }

    if (method === 'POST' && reqPath === '/api/verify-reset-code') {
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      if (!email || !EMAIL_REGEX.test(email)) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Invalid email format' });
      }
      if (!code) return jsonResponse(request, 400, { ok: false, error: 'Error: Please enter the 6-character code' });
      if (!/^[a-zA-Z0-9]+$/.test(code)) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Code can only contain letters and numbers' });
      }
      if (code.length !== 6) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Code must be 6 letters and numbers' });
      }
      const account = this.findAccountByEmail(email);
      if (!account) return jsonResponse(request, 404, { ok: false, error: 'Error: Nonexistent email' });
      const result = this.verifyResetCode(account.email, code);
      return jsonResponse(request, result.status, result.payload);
    }

    if (method === 'POST' && reqPath === '/api/auth/complete-reset') {
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      const proofToken = typeof body.resetProofToken === 'string' ? body.resetProofToken : '';
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword : null;
      const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : null;

      const account = this.findAccountByEmail(email);
      if (!account) return jsonResponse(request, 404, { ok: false, error: 'Error: Nonexistent account' });
      if (newPassword !== null) {
        const passErr = validatePasswordPair(newPassword, confirmPassword ?? '');
        if (passErr) return jsonResponse(request, 400, { ok: false, error: passErr });
      }
      if (!proofToken || !this.consumeResetProof(account.email, proofToken)) {
        return jsonResponse(request, 401, {
          ok: false,
          error: 'Error: Verification session expired. Please request a new code',
        });
      }
      if (newPassword !== null) {
        account.passwordHash = hashPassword(newPassword);
        this.saveDb();
      }
      const token = this.issueSessionToken(account.username);
      return jsonResponse(request, 200, {
        ok: true,
        token,
        snapshot: this.buildSocialSnapshot(account.username),
      });
    }

    // --- Authenticated Routes ---
    const activeUser = this.authenticateRequest(request);
    if (!activeUser) {
      return jsonResponse(request, 401, { ok: false, error: 'Error: Not authenticated' });
    }
    const selfKey = activeUser.username.toLowerCase();

    if (method === 'GET' && (reqPath === '/api/social/snapshot' || reqPath === '/api/auth/session')) {
      return jsonResponse(request, 200, { ok: true, snapshot: this.buildSocialSnapshot(selfKey) });
    }

    if (method === 'POST' && reqPath === '/api/push/subscribe') {
      const sub = body.subscription;
      const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint.trim() : '';
      const p256dh = typeof sub?.keys?.p256dh === 'string' ? sub.keys.p256dh.trim() : '';
      const auth = typeof sub?.keys?.auth === 'string' ? sub.keys.auth.trim() : '';
      if (!endpoint || !/^https:\/\//i.test(endpoint) || endpoint.length > 2000 || !p256dh || !auth) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Invalid push subscription' });
      }
      if (!this.db.pushSubscriptions || typeof this.db.pushSubscriptions !== 'object') {
        this.db.pushSubscriptions = {};
      }
      const existing = Array.isArray(this.db.pushSubscriptions[selfKey])
        ? this.db.pushSubscriptions[selfKey].filter((s) => s && s.endpoint !== endpoint)
        : [];
      existing.push({
        endpoint,
        keys: { p256dh, auth },
        createdAt: Date.now(),
      });
      this.db.pushSubscriptions[selfKey] = existing.slice(-8);
      this.saveDb();
      return jsonResponse(request, 200, { ok: true, devices: this.db.pushSubscriptions[selfKey].length });
    }

    if (method === 'POST' && reqPath === '/api/push/unsubscribe') {
      const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : '';
      if (this.db.pushSubscriptions && Array.isArray(this.db.pushSubscriptions[selfKey])) {
        this.db.pushSubscriptions[selfKey] = endpoint
          ? this.db.pushSubscriptions[selfKey].filter((s) => s && s.endpoint !== endpoint)
          : [];
        this.saveDb();
      }
      return jsonResponse(request, 200, { ok: true });
    }

    if (method === 'POST' && reqPath === '/api/auth/signout') {
      const token = this.extractBearerToken(request);
      if (token && this.db.sessions[token]) {
        delete this.db.sessions[token];
        this.saveDb();
      }
      this.lastSeenByUser.delete(selfKey);
      this.notifyRelatedPeers(selfKey, false);
      return jsonResponse(request, 200, { ok: true });
    }

    if (method === 'POST' && reqPath === '/api/profile/status') {
      const nextStatus = typeof body.status === 'string' ? body.status : '';
      if (!VALID_STATUSES.has(nextStatus)) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Invalid status' });
      }
      activeUser.status = nextStatus;
      this.saveDb();
      this.notifyRelatedPeers(activeUser.username, true);
      return jsonResponse(request, 200, {
        ok: true,
        snapshot: this.buildSocialSnapshot(activeUser.username),
      });
    }

    if (method === 'POST' && reqPath === '/api/profile/custom-status') {
      if (body.clear === true) {
        activeUser.customStatus = undefined;
      } else {
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (text.length > 128) {
          return jsonResponse(request, 400, {
            ok: false,
            error: 'Error: Status text must be 128 characters or fewer',
          });
        }
        const emoji = sanitizeSingleEmoji(body.emoji);
        if (!text && !emoji) {
          activeUser.customStatus = undefined;
        } else {
          let expiresAt = null;
          if (typeof body.expiresAt === 'number' && Number.isFinite(body.expiresAt)) {
            if (body.expiresAt <= Date.now()) {
              return jsonResponse(request, 400, {
                ok: false,
                error: 'Error: Expiration must be in the future',
              });
            }
            expiresAt = body.expiresAt;
          }
          activeUser.customStatus = { text, emoji, expiresAt };
        }
      }
      this.saveDb();
      void this.scheduleNextAlarm();
      this.notifyRelatedPeers(activeUser.username, true);
      return jsonResponse(request, 200, {
        ok: true,
        snapshot: this.buildSocialSnapshot(activeUser.username),
      });
    }

    if (method === 'POST' && reqPath === '/api/profile/update') {
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
      const nextUsername =
        typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
      const bio = typeof body.bio === 'string' ? body.bio.trim() : '';

      if (!displayName) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Display name cannot be empty' });
      }
      if (displayName.length > 32) {
        return jsonResponse(request, 400, {
          ok: false,
          error: 'Error: Display name must be 32 characters or fewer',
        });
      }
      if (!nextUsername) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Username cannot be empty' });
      }
      if (nextUsername.length < 2 || nextUsername.length > 32) {
        return jsonResponse(request, 400, {
          ok: false,
          error: 'Error: Username must be between 2 and 32 characters',
        });
      }
      if (!USERNAME_REGEX.test(nextUsername)) {
        return jsonResponse(request, 400, {
          ok: false,
          error: 'Error: Username can only use letters, numbers, underscores, periods, and hyphens',
        });
      }
      if (bio.length > 190) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Bio must be 190 characters or fewer' });
      }

      const conflict = this.db.accounts.find(
        (acc) =>
          acc.email.toLowerCase() !== activeUser.email.toLowerCase() &&
          acc.username.toLowerCase() === nextUsername,
      );
      if (conflict) {
        return jsonResponse(request, 409, { ok: false, error: 'Error: Username is already taken' });
      }

      const previousUsername = activeUser.username;
      const avatarPreset =
        typeof body.avatarPreset === 'number' && body.avatarPreset >= 0 && body.avatarPreset <= 3
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
        } else if (typeof body.bannerColor === 'string' && HEX_COLOR_REGEX.test(body.bannerColor.trim())) {
          activeUser.bannerColor = body.bannerColor.trim().toLowerCase();
        } else {
          return jsonResponse(request, 400, { ok: false, error: 'Error: Invalid banner color' });
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
        } else if (typeof body.bannerDataUrl === 'string' && body.bannerDataUrl.startsWith('data:image/')) {
          if (body.bannerDataUrl.length > MAX_BANNER_IMAGE_CHARS) {
            return jsonResponse(request, 413, { ok: false, error: 'Error: Banner image is too large' });
          }
          activeUser.bannerDataUrl = body.bannerDataUrl;
        } else {
          return jsonResponse(request, 400, { ok: false, error: 'Error: Invalid banner image' });
        }
      }

      activeUser.displayName = displayName;
      activeUser.username = nextUsername;
      activeUser.bio = bio;
      activeUser.avatarPreset = avatarDataUrl ? null : (avatarPreset ?? 0);
      activeUser.avatarDataUrl = avatarDataUrl;

      if (previousUsername !== nextUsername) {
        this.migrateUsernameReferences(previousUsername, nextUsername);
      }

      this.saveDb();
      this.notifyRelatedPeers(activeUser.username, true);
      return jsonResponse(request, 200, {
        ok: true,
        previousUsername,
        snapshot: this.buildSocialSnapshot(activeUser.username),
      });
    }

    if (method === 'POST' && reqPath === '/api/account/change-password') {
      const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
      const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
      if (!currentPassword) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Enter your current password' });
      }
      if (!verifyPassword(currentPassword, activeUser.passwordHash)) {
        return jsonResponse(request, 403, { ok: false, error: 'Error: Current password is incorrect' });
      }
      const passErr = validatePasswordPair(newPassword, confirmPassword);
      if (passErr) return jsonResponse(request, 400, { ok: false, error: passErr });
      activeUser.passwordHash = hashPassword(newPassword);
      this.saveDb();
      return jsonResponse(request, 200, { ok: true, message: 'Password updated successfully.' });
    }

    if (method === 'POST' && reqPath === '/api/account/change-email') {
      const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
      const nextEmail = typeof body.email === 'string' ? body.email.trim() : '';
      if (!currentPassword || !verifyPassword(currentPassword, activeUser.passwordHash)) {
        return jsonResponse(request, 403, { ok: false, error: 'Error: Current password is incorrect' });
      }
      if (!nextEmail || !EMAIL_REGEX.test(nextEmail)) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Enter a valid email address' });
      }
      const conflict = this.findAccountByEmail(nextEmail);
      if (conflict && conflict.username.toLowerCase() !== selfKey) {
        return jsonResponse(request, 409, { ok: false, error: 'Error: That email is already in use' });
      }
      activeUser.email = nextEmail;
      this.saveDb();
      return jsonResponse(request, 200, {
        ok: true,
        snapshot: this.buildSocialSnapshot(activeUser.username),
      });
    }

    if (method === 'POST' && reqPath === '/api/account/privacy') {
      if (!activeUser.privacy || typeof activeUser.privacy !== 'object') activeUser.privacy = {};
      const wasReadReceiptsEnabled = activeUser.privacy.showReadReceipts !== false;
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
      this.saveDb();
      this.notifyRelatedPeers(activeUser.username, false);
      if (!wasReadReceiptsEnabled && activeUser.privacy.showReadReceipts !== false) {
        const prefix = `${selfKey}::`;
        const suffix = `::${selfKey}`;
        for (const [tKey, receiptsMap] of Object.entries(this.db.dmReadReceipts ?? {})) {
          if (!receiptsMap || typeof receiptsMap !== 'object') continue;
          const ownReceipt = receiptsMap[selfKey];
          if (!ownReceipt) continue;
          let otherKey = '';
          if (tKey.startsWith(prefix)) {
            otherKey = tKey.slice(prefix.length);
          } else if (tKey.endsWith(suffix)) {
            otherKey = tKey.slice(0, tKey.length - suffix.length);
          }
          if (!otherKey || otherKey.includes(':')) continue;
          const peerAcc = this.findAccountByUsername(otherKey);
          if (peerAcc?.privacy?.showReadReceipts !== false) {
            this.sendWsEventToUser(otherKey, {
              type: 'dm:read',
              threadUsers: [selfKey, otherKey],
              receipt: ownReceipt,
            });
          }
        }
      }
      return jsonResponse(request, 200, {
        ok: true,
        snapshot: this.buildSocialSnapshot(activeUser.username),
      });
    }

    if (method === 'POST' && reqPath === '/api/account/preferences') {
      if (body.preferences && typeof body.preferences === 'object' && !Array.isArray(body.preferences)) {
        const nextPrefs =
          activeUser.clientPreferences && typeof activeUser.clientPreferences === 'object'
            ? { ...activeUser.clientPreferences }
            : {};
        for (const [k, v] of Object.entries(body.preferences)) {
          if (k === 'voiceInputDeviceId' || k === 'voiceOutputDeviceId') continue;
          if (k === 'voiceCustom' && v && typeof v === 'object' && !Array.isArray(v)) {
            nextPrefs.voiceCustom = { ...v };
          } else if (
            typeof v === 'boolean' ||
            typeof v === 'number' ||
            (typeof v === 'string' && v.length <= 64)
          ) {
            nextPrefs[k] = v;
          }
        }
        activeUser.clientPreferences = nextPrefs;
      }
      if (
        body.voiceUserVolumes &&
        typeof body.voiceUserVolumes === 'object' &&
        !Array.isArray(body.voiceUserVolumes)
      ) {
        const nextVols = {};
        let count = 0;
        for (const [rawUser, rawVol] of Object.entries(body.voiceUserVolumes)) {
          if (count >= 250) break;
          if (!rawVol || typeof rawVol !== 'object') continue;
          const uKey = String(rawUser).trim().toLowerCase().slice(0, 48);
          if (!uKey) continue;
          const vol =
            typeof rawVol.volume === 'number' && Number.isFinite(rawVol.volume)
              ? Math.min(200, Math.max(0, Math.round(rawVol.volume)))
              : 100;
          const scrVol =
            typeof rawVol.screenVolume === 'number' && Number.isFinite(rawVol.screenVolume)
              ? Math.min(200, Math.max(0, Math.round(rawVol.screenVolume)))
              : 100;
          nextVols[uKey] = {
            volume: vol,
            muted: Boolean(rawVol.muted),
            screenVolume: scrVol,
            screenMuted: Boolean(rawVol.screenMuted),
          };
          count += 1;
        }
        activeUser.voiceUserVolumes = nextVols;
      }
      this.saveDb();
      this.pushSnapshotToUser(selfKey);
      return jsonResponse(request, 200, {
        ok: true,
        snapshot: this.buildSocialSnapshot(activeUser.username),
      });
    }

    if (method === 'POST' && reqPath === '/api/account/signout-others') {
      const currentToken = this.extractBearerToken(request);
      let revokedCount = 0;
      for (const [tokenKey, owner] of Object.entries(this.db.sessions)) {
        if (tokenKey !== currentToken && String(owner).toLowerCase() === selfKey) {
          delete this.db.sessions[tokenKey];
          revokedCount += 1;
        }
      }
      if (revokedCount > 0) this.saveDb();
      return jsonResponse(request, 200, { ok: true, revokedCount });
    }

    // Friends
    if (method === 'GET' && reqPath === '/api/friends/mutual') {
      const targetKey = (urlObj.searchParams.get('username') ?? '').trim().toLowerCase();
      const targetAcc = targetKey ? this.findAccountByUsername(targetKey) : undefined;
      if (!targetAcc) return jsonResponse(request, 404, { ok: false, error: 'Error: User not found' });
      if (targetAcc.privacy?.privateProfile || this.hasAnyBlockBetween(selfKey, targetKey)) {
        return jsonResponse(request, 200, { ok: true, mutualFriends: [], mutualGroups: [] });
      }
      const selfFriends = new Set((this.db.friendships[selfKey] ?? []).map((u) => u.toLowerCase()));
      const mutualFriends = [];
      for (const candidateRaw of this.db.friendships[targetKey] ?? []) {
        const candKey = candidateRaw.toLowerCase();
        if (candKey === selfKey || candKey === targetKey || !selfFriends.has(candKey)) continue;
        const candAcc = this.findAccountByUsername(candKey);
        if (candAcc) mutualFriends.push(this.toPublicProfile(candAcc, selfKey));
      }
      mutualFriends.sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
      );

      const mutualGroups = [];
      for (const grp of Object.values(this.db.groupDms)) {
        const lowerMembers = (grp.members ?? []).map((m) => m.toLowerCase());
        if (lowerMembers.includes(selfKey) && lowerMembers.includes(targetKey)) {
          mutualGroups.push({
            id: grp.id,
            name: grp.name,
            iconDataUrl: this.getGroupIconUrl(grp),
            memberCount: lowerMembers.length,
          });
        }
      }
      mutualGroups.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      return jsonResponse(request, 200, { ok: true, mutualFriends, mutualGroups });
    }

    if (method === 'POST' && reqPath === '/api/friends/request') {
      const targetRaw = typeof body.username === 'string' ? body.username.trim() : '';
      if (!targetRaw) return jsonResponse(request, 400, { ok: false, error: 'Error: Please enter a username' });
      const cleanedInput = targetRaw.startsWith('@') ? targetRaw.slice(1).trim() : targetRaw;
      if (!cleanedInput) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Please enter a username' });
      }
      if (cleanedInput.includes('@')) {
        return jsonResponse(request, 400, {
          ok: false,
          error: 'Error: Enter a username, not an email address',
        });
      }
      let target = !/\s/.test(cleanedInput) ? this.findAccountByUsername(cleanedInput) : undefined;
      if (!target) {
        const lowerDisplay = cleanedInput.toLowerCase();
        const displayMatches = this.db.accounts.filter(
          (acc) => acc.displayName.trim().toLowerCase() === lowerDisplay,
        );
        if (displayMatches.length === 1) {
          target = displayMatches[0];
        } else if (displayMatches.length > 1) {
          return jsonResponse(request, 409, {
            ok: false,
            error: `Error: Multiple users share the display name "${cleanedInput}" — enter their exact @username instead`,
          });
        }
      }
      if (!target && /\s/.test(cleanedInput)) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Usernames cannot contain spaces' });
      }
      if (!target) {
        return jsonResponse(request, 404, {
          ok: false,
          error: `Error: No user found with username "${cleanedInput}"`,
        });
      }
      const toKey = target.username.toLowerCase();
      if (toKey === selfKey) {
        return jsonResponse(request, 400, {
          ok: false,
          error: 'Error: You cannot send a friend request to yourself',
        });
      }
      if (this.isBlockedBy(selfKey, toKey)) {
        return jsonResponse(request, 403, {
          ok: false,
          error: `Error: You blocked ${target.username} — unblock them first`,
        });
      }
      if (this.isBlockedBy(toKey, selfKey) || target.privacy?.allowFriendRequests === false) {
        return jsonResponse(request, 403, {
          ok: false,
          error: 'Error: This user is not accepting friend requests',
        });
      }
      if ((this.db.friendships[selfKey] ?? []).includes(toKey)) {
        return jsonResponse(request, 409, {
          ok: false,
          error: `Error: You are already friends with ${target.displayName}`,
        });
      }
      if (this.db.friendRequests.some((r) => r.from === selfKey && r.to === toKey)) {
        return jsonResponse(request, 409, {
          ok: false,
          error: `Error: Friend request already sent to ${target.username}`,
        });
      }
      if (this.db.friendRequests.some((r) => r.from === toKey && r.to === selfKey)) {
        return jsonResponse(request, 409, {
          ok: false,
          error: `Error: ${target.displayName} already sent you a friend request — check Pending`,
        });
      }

      this.db.friendRequests.push({ from: selfKey, to: toKey, createdAt: Date.now() });
      this.saveDb();
      this.pushSnapshotToUser(selfKey);
      this.pushSnapshotToUser(toKey);
      this.emitSocialNotify(toKey, {
        kind: 'friend-request',
        actor: this.toPublicProfile(activeUser, toKey),
        timestamp: Date.now(),
      });
      return jsonResponse(request, 200, {
        ok: true,
        message: `Success! Your friend request to ${target.username} was sent.`,
        snapshot: this.buildSocialSnapshot(selfKey),
      });
    }

    if (method === 'POST' && reqPath === '/api/friends/cancel') {
      const targetKey =
        typeof body.targetUsername === 'string' ? body.targetUsername.trim().toLowerCase() : '';
      this.db.friendRequests = this.db.friendRequests.filter(
        (r) => !(r.from === selfKey && r.to === targetKey),
      );
      this.saveDb();
      this.pushSnapshotToUser(selfKey);
      if (targetKey) this.pushSnapshotToUser(targetKey);
      return jsonResponse(request, 200, { ok: true, snapshot: this.buildSocialSnapshot(selfKey) });
    }

    if (method === 'POST' && reqPath === '/api/friends/decline') {
      const fromKey =
        typeof body.fromUsername === 'string' ? body.fromUsername.trim().toLowerCase() : '';
      this.db.friendRequests = this.db.friendRequests.filter(
        (r) => !(r.from === fromKey && r.to === selfKey),
      );
      this.saveDb();
      this.pushSnapshotToUser(selfKey);
      if (fromKey) this.pushSnapshotToUser(fromKey);
      return jsonResponse(request, 200, { ok: true, snapshot: this.buildSocialSnapshot(selfKey) });
    }

    if (method === 'POST' && reqPath === '/api/friends/accept') {
      const fromKey =
        typeof body.fromUsername === 'string' ? body.fromUsername.trim().toLowerCase() : '';
      const hasRequest = this.db.friendRequests.some((r) => r.from === fromKey && r.to === selfKey);
      if (!hasRequest) {
        return jsonResponse(request, 404, { ok: false, error: 'Error: Friend request no longer exists' });
      }
      this.db.friendRequests = this.db.friendRequests.filter(
        (r) => !((r.from === fromKey && r.to === selfKey) || (r.from === selfKey && r.to === fromKey)),
      );
      const toSet = new Set(this.db.friendships[selfKey] ?? []);
      const fromSet = new Set(this.db.friendships[fromKey] ?? []);
      toSet.add(fromKey);
      fromSet.add(selfKey);
      this.db.friendships[selfKey] = Array.from(toSet);
      this.db.friendships[fromKey] = Array.from(fromSet);
      this.saveDb();
      this.pushSnapshotToUser(selfKey);
      this.pushSnapshotToUser(fromKey);
      return jsonResponse(request, 200, { ok: true, snapshot: this.buildSocialSnapshot(selfKey) });
    }

    if (method === 'POST' && reqPath === '/api/friends/remove') {
      const targetKey =
        typeof body.targetUsername === 'string' ? body.targetUsername.trim().toLowerCase() : '';
      if (!targetKey || !this.areFriends(selfKey, targetKey)) {
        return jsonResponse(request, 404, { ok: false, error: 'Error: User is not in your friends list' });
      }
      this.removeFriendshipBetween(selfKey, targetKey);
      this.clearUnreadBetween(selfKey, targetKey);
      this.saveDb();
      this.pushSnapshotToUser(selfKey);
      this.pushSnapshotToUser(targetKey);
      this.emitSocialNotify(targetKey, {
        kind: 'unfriended',
        actor: this.toPublicProfile(activeUser, targetKey),
        timestamp: Date.now(),
      });
      return jsonResponse(request, 200, { ok: true, snapshot: this.buildSocialSnapshot(selfKey) });
    }

    if (method === 'POST' && reqPath === '/api/friends/block') {
      const targetKey =
        typeof body.targetUsername === 'string' ? body.targetUsername.trim().toLowerCase() : '';
      if (!targetKey || !this.findAccountByUsername(targetKey)) {
        return jsonResponse(request, 404, { ok: false, error: 'Error: User not found' });
      }
      if (targetKey === selfKey) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: You cannot block yourself' });
      }
      const blockSet = new Set(this.db.blocks[selfKey] ?? []);
      blockSet.add(targetKey);
      this.db.blocks[selfKey] = Array.from(blockSet);

      this.removeFriendshipBetween(selfKey, targetKey);
      this.clearRequestsBetween(selfKey, targetKey);
      this.clearUnreadBetween(selfKey, targetKey);
      const dmVcKey = dmThreadKey(selfKey, targetKey);
      const activeDmVc = this.activeVoiceCalls.get(dmVcKey);
      if (activeDmVc) {
        activeDmVc.participants.clear();
        this.clearAllRingingInCall(activeDmVc);
        this.finalizeCallIfDone(activeDmVc);
        this.persistActiveVoiceCalls();
        this.broadcastVcState(activeDmVc);
      }
      this.saveDb();
      this.pushSnapshotToUser(selfKey);
      this.pushSnapshotToUser(targetKey);
      this.emitSocialNotify(targetKey, {
        kind: 'blocked',
        actor: this.toPublicProfile(activeUser, targetKey),
        timestamp: Date.now(),
      });
      this.notifyRelatedPeers(selfKey, false);
      return jsonResponse(request, 200, { ok: true, snapshot: this.buildSocialSnapshot(selfKey) });
    }

    if (method === 'POST' && reqPath === '/api/friends/unblock') {
      const targetKey =
        typeof body.targetUsername === 'string' ? body.targetUsername.trim().toLowerCase() : '';
      if (Array.isArray(this.db.blocks[selfKey])) {
        this.db.blocks[selfKey] = this.db.blocks[selfKey].filter((u) => u.toLowerCase() !== targetKey);
        this.saveDb();
      }
      this.pushSnapshotToUser(selfKey);
      if (targetKey) this.pushSnapshotToUser(targetKey);
      this.notifyRelatedPeers(selfKey, false);
      return jsonResponse(request, 200, { ok: true, snapshot: this.buildSocialSnapshot(selfKey) });
    }

    // Groups
    if (method === 'POST' && reqPath === '/api/groups/create') {
      const rawMembers = Array.isArray(body.memberUsernames) ? body.memberUsernames : [];
      const memberSet = new Set([selfKey]);
      const addedFriends = [];
      for (const item of rawMembers) {
        if (typeof item !== 'string') continue;
        const key = item.trim().toLowerCase();
        if (!key || key === selfKey || memberSet.has(key)) continue;
        const acc = this.findAccountByUsername(key);
        if (!acc || !this.areFriends(selfKey, key)) {
          return jsonResponse(request, 403, {
            ok: false,
            error: 'Error: All group members must be on your friends list',
          });
        }
        memberSet.add(key);
        addedFriends.push(acc);
        if (memberSet.size >= 25) break;
      }
      if (addedFriends.length === 0) {
        return jsonResponse(request, 400, {
          ok: false,
          error: 'Error: Select at least one friend to start a chat',
        });
      }
      const rawName = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
      const fallbackName = [activeUser.displayName, ...addedFriends.map((f) => f.displayName)]
        .join(', ')
        .slice(0, 64);
      const groupName = (rawName || fallbackName || 'Group Chat').slice(0, 64);

      let iconDataUrl;
      if (typeof body.iconDataUrl === 'string' && body.iconDataUrl.trim()) {
        if (!body.iconDataUrl.startsWith('data:image/')) {
          return jsonResponse(request, 400, { ok: false, error: 'Error: Invalid group icon image' });
        }
        if (body.iconDataUrl.length > MAX_BANNER_IMAGE_CHARS) {
          return jsonResponse(request, 413, { ok: false, error: 'Error: Group icon image is too large' });
        }
        iconDataUrl = body.iconDataUrl;
      }

      const id = crypto.randomUUID();
      const createdAt = Date.now();
      const created = {
        id,
        name: groupName,
        iconDataUrl,
        ownerUsername: selfKey,
        members: Array.from(memberSet),
        createdAt,
      };
      this.db.groupDms[id] = created;
      for (const m of created.members) {
        this.touchThreadActivityForUser(m, `group:${id}`, createdAt, { unhide: true });
      }
      this.saveDb();
      for (const m of created.members) {
        this.pushSnapshotToUser(m);
        if (m !== selfKey) {
          this.emitSocialNotify(m, {
            kind: 'group-added',
            actor: this.toPublicProfile(activeUser, m),
            groupId: id,
            groupName: created.name,
            groupIconDataUrl: this.getGroupIconUrl(created),
            timestamp: createdAt,
          });
        }
      }
      return jsonResponse(request, 200, {
        ok: true,
        group: this.toClientGroup(created, selfKey),
        snapshot: this.buildSocialSnapshot(selfKey),
      });
    }

    if (method === 'POST' && reqPath === '/api/groups/update') {
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const group = this.db.groupDms[groupId];
      if (!group || !group.members.some((m) => m.toLowerCase() === selfKey)) {
        return jsonResponse(request, 403, { ok: false, error: 'Error: Group chat not found' });
      }
      if (Object.prototype.hasOwnProperty.call(body, 'name')) {
        const nextName = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
        if (!nextName) {
          return jsonResponse(request, 400, { ok: false, error: 'Error: Group name cannot be empty' });
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
        } else if (typeof body.iconDataUrl === 'string' && body.iconDataUrl.startsWith('data:image/')) {
          if (body.iconDataUrl.length > MAX_BANNER_IMAGE_CHARS) {
            return jsonResponse(request, 413, { ok: false, error: 'Error: Group icon image is too large' });
          }
          group.iconDataUrl = body.iconDataUrl;
        } else {
          return jsonResponse(request, 400, { ok: false, error: 'Error: Invalid group icon image' });
        }
      }
      this.saveDb();
      for (const m of group.members) this.pushSnapshotToUser(m);
      return jsonResponse(request, 200, {
        ok: true,
        group: this.toClientGroup(group, selfKey),
        snapshot: this.buildSocialSnapshot(selfKey),
      });
    }

    if (method === 'POST' && reqPath === '/api/groups/add-members') {
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const group = this.db.groupDms[groupId];
      if (!group || !group.members.some((m) => m.toLowerCase() === selfKey)) {
        return jsonResponse(request, 403, { ok: false, error: 'Error: Group chat not found' });
      }
      const rawUsernames = Array.isArray(body.usernames) ? body.usernames : [];
      const memberSet = new Set(group.members.map((m) => m.toLowerCase()));
      const addedKeys = [];
      for (const item of rawUsernames) {
        if (typeof item !== 'string') continue;
        const key = item.trim().toLowerCase();
        if (!key || memberSet.has(key)) continue;
        if (!this.findAccountByUsername(key) || !this.areFriends(selfKey, key)) {
          return jsonResponse(request, 403, {
            ok: false,
            error: 'Error: You can only add friends to a group',
          });
        }
        if (memberSet.size >= 25) break;
        memberSet.add(key);
        addedKeys.push(key);
      }
      if (addedKeys.length > 0) {
        group.members = Array.from(memberSet);
        const now = Date.now();
        for (const m of group.members) {
          this.touchThreadActivityForUser(m, `group:${groupId}`, now, { unhide: true });
        }
        this.saveDb();
        for (const m of group.members) this.pushSnapshotToUser(m);
        const targetNames = addedKeys
          .map((u) => this.findAccountByUsername(u)?.displayName ?? u)
          .join(', ');
        this.appendSystemEventMessage(
          {
            kind: 'group',
            groupId,
            threadKey: groupThreadKey(groupId),
            participants: [...group.members],
          },
          { kind: 'group-add', actorUsername: selfKey, targetUsernames: addedKeys },
          `${activeUser.displayName} added ${targetNames} to the group.`,
        );
        for (const addedKey of addedKeys) {
          this.emitSocialNotify(addedKey, {
            kind: 'group-added',
            actor: this.toPublicProfile(activeUser, addedKey),
            groupId,
            groupName: group.name,
            groupIconDataUrl: this.getGroupIconUrl(group),
            timestamp: now,
          });
        }
      }
      return jsonResponse(request, 200, {
        ok: true,
        group: this.toClientGroup(group, selfKey),
        snapshot: this.buildSocialSnapshot(selfKey),
      });
    }

    if (method === 'POST' && reqPath === '/api/groups/kick') {
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const targetKey =
        typeof body.targetUsername === 'string' ? body.targetUsername.trim().toLowerCase() : '';
      const group = this.db.groupDms[groupId];
      if (!group || !group.members.some((m) => m.toLowerCase() === selfKey)) {
        return jsonResponse(request, 404, { ok: false, error: 'Error: Group chat not found' });
      }
      if (group.ownerUsername.toLowerCase() !== selfKey) {
        return jsonResponse(request, 403, {
          ok: false,
          error: 'Error: Only the group owner can remove members',
        });
      }
      if (!targetKey || targetKey === selfKey) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Invalid member to remove' });
      }
      if (!group.members.some((m) => m.toLowerCase() === targetKey)) {
        return jsonResponse(request, 404, { ok: false, error: 'Error: User is not in this group' });
      }

      group.members = group.members.filter((m) => m.toLowerCase() !== targetKey);
      if (this.db.unreadGroups[targetKey]) delete this.db.unreadGroups[targetKey][groupId];
      const gThread = `group:${groupId}`;
      if (this.db.hiddenThreads[targetKey]) delete this.db.hiddenThreads[targetKey][gThread];
      if (this.db.mutedThreads[targetKey]) delete this.db.mutedThreads[targetKey][gThread];
      if (this.db.threadActivity[targetKey]) delete this.db.threadActivity[targetKey][gThread];

      const activeGroupVc = this.activeVoiceCalls.get(gThread);
      if (activeGroupVc) {
        activeGroupVc.allowedUsers = [...group.members];
        const removedFromCall = activeGroupVc.participants.delete(targetKey);
        this.stopRingingUser(activeGroupVc, targetKey);
        if (removedFromCall) {
          this.finalizeCallIfDone(activeGroupVc);
          this.persistActiveVoiceCalls();
          this.broadcastVcState(activeGroupVc);
          this.sendWsEventToUser(targetKey, {
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

      this.saveDb();
      this.pushSnapshotToUser(targetKey);
      for (const m of group.members) this.pushSnapshotToUser(m);

      const targetAcc = this.findAccountByUsername(targetKey);
      this.appendSystemEventMessage(
        {
          kind: 'group',
          groupId,
          threadKey: groupThreadKey(groupId),
          participants: [...group.members],
        },
        { kind: 'group-remove', actorUsername: selfKey, targetUsername: targetKey },
        `${activeUser.displayName} removed ${targetAcc?.displayName ?? targetKey} from the group.`,
      );
      this.emitSocialNotify(targetKey, {
        kind: 'group-removed',
        actor: this.toPublicProfile(activeUser, targetKey),
        groupId,
        groupName: group.name,
        groupIconDataUrl: this.getGroupIconUrl(group),
        timestamp: Date.now(),
      });

      return jsonResponse(request, 200, {
        ok: true,
        group: this.toClientGroup(group, selfKey),
        snapshot: this.buildSocialSnapshot(selfKey),
      });
    }

    if (method === 'POST' && reqPath === '/api/groups/transfer-owner') {
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const targetKey =
        typeof body.targetUsername === 'string' ? body.targetUsername.trim().toLowerCase() : '';
      const group = this.db.groupDms[groupId];
      if (!group || !group.members.some((m) => m.toLowerCase() === selfKey)) {
        return jsonResponse(request, 404, { ok: false, error: 'Error: Group chat not found' });
      }
      if (group.ownerUsername.toLowerCase() !== selfKey) {
        return jsonResponse(request, 403, {
          ok: false,
          error: 'Error: Only the group owner can transfer ownership',
        });
      }
      if (!targetKey || targetKey === selfKey || !group.members.some((m) => m.toLowerCase() === targetKey)) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Select another member in this group' });
      }
      group.ownerUsername = targetKey;
      this.saveDb();
      for (const m of group.members) this.pushSnapshotToUser(m);
      const targetAcc = this.findAccountByUsername(targetKey);
      this.appendSystemEventMessage(
        {
          kind: 'group',
          groupId,
          threadKey: groupThreadKey(groupId),
          participants: [...group.members],
        },
        { kind: 'group-owner', actorUsername: selfKey, targetUsername: targetKey },
        `${activeUser.displayName} made ${targetAcc?.displayName ?? targetKey} the group owner.`,
      );
      return jsonResponse(request, 200, {
        ok: true,
        group: this.toClientGroup(group, selfKey),
        snapshot: this.buildSocialSnapshot(selfKey),
      });
    }

    if (method === 'POST' && reqPath === '/api/groups/leave') {
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const group = this.db.groupDms[groupId];
      if (!group || !group.members.some((m) => m.toLowerCase() === selfKey)) {
        return jsonResponse(request, 404, { ok: false, error: 'Error: Group chat not found' });
      }
      group.members = group.members.filter((m) => m.toLowerCase() !== selfKey);
      if (this.db.unreadGroups[selfKey]) delete this.db.unreadGroups[selfKey][groupId];
      const groupThread = `group:${groupId}`;
      if (this.db.hiddenThreads[selfKey]) delete this.db.hiddenThreads[selfKey][groupThread];
      if (this.db.mutedThreads[selfKey]) delete this.db.mutedThreads[selfKey][groupThread];
      if (this.db.threadActivity[selfKey]) delete this.db.threadActivity[selfKey][groupThread];

      if (group.members.length === 0) {
        const orphanIds = [];
        const threadKey = groupThreadKey(groupId);
        for (const msg of this.db.dms[threadKey] ?? []) {
          if (Array.isArray(msg.attachmentIds)) orphanIds.push(...msg.attachmentIds);
        }
        delete this.db.dms[threadKey];
        this.store.deleteThreadMessages(threadKey);
        delete this.db.groupDms[groupId];
        this.cleanupOrphanedUploads(orphanIds);
      } else if (group.ownerUsername.toLowerCase() === selfKey) {
        group.ownerUsername = group.members[0];
      }

      this.saveDb();
      this.pushSnapshotToUser(selfKey);
      for (const m of group.members) this.pushSnapshotToUser(m);

      if (group.members.length > 0) {
        this.appendSystemEventMessage(
          {
            kind: 'group',
            groupId,
            threadKey: groupThreadKey(groupId),
            participants: [...group.members],
          },
          { kind: 'group-leave', actorUsername: selfKey },
          `${activeUser.displayName} left the group.`,
        );
      }
      return jsonResponse(request, 200, { ok: true, snapshot: this.buildSocialSnapshot(selfKey) });
    }

    // DMs & Threads
    if (method === 'POST' && reqPath === '/api/dms/open') {
      const peerKey =
        typeof body.peerUsername === 'string' ? body.peerUsername.trim().toLowerCase() : '';
      const peerAccount = peerKey ? this.findAccountByUsername(peerKey) : undefined;
      if (!peerKey || !peerAccount || peerKey === selfKey) {
        return jsonResponse(request, 404, { ok: false, error: 'Error: User not found' });
      }
      let changed = this.recordOpenDmPeer(selfKey, peerKey);
      const dmKey = `dm:${peerKey}`;
      if (this.db.hiddenThreads[selfKey]?.[dmKey]) {
        delete this.db.hiddenThreads[selfKey][dmKey];
        changed = true;
      }
      if (changed) {
        this.saveDb();
        this.pushSnapshotToUser(selfKey);
      }
      return jsonResponse(request, 200, {
        ok: true,
        peer: this.toPublicProfile(peerAccount),
        snapshot: this.buildSocialSnapshot(selfKey),
      });
    }

    if (method === 'POST' && reqPath === '/api/dms/close') {
      const peerKey =
        typeof body.peerUsername === 'string' ? body.peerUsername.trim().toLowerCase() : '';
      if (peerKey && Array.isArray(this.db.openDms[selfKey])) {
        this.db.openDms[selfKey] = this.db.openDms[selfKey].filter(
          (u) => u.toLowerCase() !== peerKey,
        );
        this.saveDb();
      }
      return jsonResponse(request, 200, { ok: true, snapshot: this.buildSocialSnapshot(selfKey) });
    }

    if (method === 'GET' && reqPath === '/api/dms/history') {
      const peerKey = (urlObj.searchParams.get('peer') ?? '').trim().toLowerCase();
      const groupId = (urlObj.searchParams.get('groupId') ?? '').trim();
      const beforeId = (urlObj.searchParams.get('before') ?? '').trim();
      const aroundId = (urlObj.searchParams.get('around') ?? '').trim();
      const rawLimit = Number(urlObj.searchParams.get('limit'));
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(100, Math.floor(rawLimit)) : 50;

      const ctx = this.resolveThreadContext(selfKey, { peerUsername: peerKey, groupId }, { mode: 'read' });
      if (!ctx.ok) return jsonResponse(request, ctx.status ?? 403, { ok: false, error: ctx.error });

      const fullThreadList = this.db.dms[ctx.threadKey] ?? [];
      let page = null;
      if (aroundId) page = this.store.getMessagesFromId(ctx.threadKey, aroundId, 200);
      if (!page) page = this.store.getMessagesPage(ctx.threadKey, { beforeId, limit });

      let peerReceipt;
      if (ctx.kind === 'dm') {
        const peerAcc = this.findAccountByUsername(ctx.peerKey);
        if (
          activeUser.privacy?.showReadReceipts !== false &&
          peerAcc?.privacy?.showReadReceipts !== false
        ) {
          peerReceipt = this.db.dmReadReceipts[ctx.threadKey]?.[ctx.peerKey];
        }
      }
      return jsonResponse(request, 200, {
        ok: true,
        peer: ctx.kind === 'dm' ? ctx.peerKey : undefined,
        groupId: ctx.kind === 'group' ? ctx.groupId : undefined,
        messages: page.items.map((m) => this.hydrateMessage(m, fullThreadList)),
        hasMore: Boolean(page.hasMore),
        peerReceipt,
      });
    }

    if (method === 'GET' && reqPath === '/api/dms/search') {
      const rawQuery = (urlObj.searchParams.get('q') ?? '').trim();
      if (!rawQuery) return jsonResponse(request, 200, { ok: true, results: [] });

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

      const allowedMeta = new Map();
      for (const [gid, grp] of Object.entries(this.db.groupDms)) {
        if (grp && Array.isArray(grp.members) && grp.members.some((m) => m.toLowerCase() === selfKey)) {
          allowedMeta.set(groupThreadKey(gid), { kind: 'group', groupId: gid, groupName: grp.name });
        }
      }
      for (const tKey of Object.keys(this.db.dms)) {
        if (tKey.startsWith('group:')) continue;
        const [u1, u2] = tKey.split('::');
        if (!u1 || !u2) continue;
        let peerKey = '';
        if (u1.toLowerCase() === selfKey) peerKey = u2.toLowerCase();
        else if (u2.toLowerCase() === selfKey) peerKey = u1.toLowerCase();
        if (!peerKey || peerKey === selfKey || this.hasAnyBlockBetween(selfKey, peerKey)) continue;
        const peerAcc = this.findAccountByUsername(peerKey);
        if (!peerAcc) continue;
        allowedMeta.set(tKey, {
          kind: 'dm',
          peerUsername: peerAcc.username,
          peerDisplayName: peerAcc.displayName,
        });
      }

      const candidates = this.store.searchAllowedMessages(Array.from(allowedMeta.keys()), {
        fromFilters,
        textTerms,
        limit: 250,
      });

      const results = [];
      for (const hit of candidates) {
        const meta = allowedMeta.get(hit.threadKey);
        if (!meta) continue;
        const msg = hit.msg;
        if (hasFilters.length > 0 && !hasFilters.every((h) => this.serverMessageMatchesHasFilter(msg, h))) {
          continue;
        }
        const hydrated = this.hydrateMessage(msg, this.db.dms[hit.threadKey] ?? []);
        if (fromFilters.length > 0) {
          const uLow = hydrated.authorUsername.toLowerCase();
          const dLow = hydrated.authorName.toLowerCase();
          if (!fromFilters.every((f) => uLow.includes(f) || dLow.includes(f))) continue;
        }
        if (textTerms.length > 0) {
          const hay = [
            hydrated.content,
            hydrated.gif?.title ?? '',
            ...(hydrated.attachments ?? []).map((a) => a.name),
          ]
            .join(' ')
            .toLowerCase();
          if (!textTerms.every((t) => hay.includes(t))) continue;
        }
        results.push({ ...meta, message: hydrated });
        if (results.length >= 50) break;
      }
      return jsonResponse(request, 200, { ok: true, results });
    }

    if (method === 'GET' && reqPath === '/api/links/preview') {
      const rl = this.rateLimiter.check(`link-preview:${selfKey}`, 30, 60_000);
      if (!rl.ok) {
        return jsonResponse(
          request,
          429,
          { ok: false, error: 'Error: Link preview rate limit exceeded' },
          { 'Retry-After': String(rl.retryAfterSec) },
        );
      }
      const targetUrl = (urlObj.searchParams.get('url') ?? '').trim();
      if (!targetUrl || targetUrl.length > 1000) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Invalid URL' });
      }
      const cached = this.store.getCachedLinkPreview(targetUrl);
      if (cached) return jsonResponse(request, 200, { ok: true, preview: cached });
      const fetched = await fetchSafeLinkPreview(targetUrl);
      if (!fetched.ok || !fetched.preview) {
        return jsonResponse(request, 400, {
          ok: false,
          error: fetched.error ?? 'Error: Preview unavailable',
        });
      }
      this.store.saveCachedLinkPreview(targetUrl, fetched.preview);
      return jsonResponse(request, 200, { ok: true, preview: fetched.preview });
    }

    if (method === 'GET' && reqPath === '/api/vc/ice-servers') {
      return jsonResponse(request, 200, { ok: true, iceServers: this.getConfiguredIceServers() });
    }

    if (method === 'GET' && reqPath === '/api/vc/screen-sources') {
      return jsonResponse(request, 200, {
        ok: true,
        supported: false,
        reason: 'local_only',
        sources: [],
      });
    }

    if (method === 'POST' && reqPath === '/api/dms/read') {
      const peerKey =
        typeof body.peerUsername === 'string' ? body.peerUsername.trim().toLowerCase() : '';
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      let changed = false;

      if (groupId && this.db.unreadGroups[selfKey] && this.db.unreadGroups[selfKey][groupId]) {
        delete this.db.unreadGroups[selfKey][groupId];
        changed = true;
      } else if (peerKey && this.db.unreadDms[selfKey] && this.db.unreadDms[selfKey][peerKey]) {
        delete this.db.unreadDms[selfKey][peerKey];
        changed = true;
      }
      if (groupId && this.db.groupUnreadMentions?.[selfKey]?.[groupId]) {
        delete this.db.groupUnreadMentions[selfKey][groupId];
        changed = true;
      } else if (peerKey && this.db.unreadMentions?.[selfKey]?.[peerKey]) {
        delete this.db.unreadMentions[selfKey][peerKey];
        changed = true;
      }

      if (peerKey && activeUser.privacy?.showReadReceipts !== false) {
        const peerAcc = this.findAccountByUsername(peerKey);
        const threadKey = dmThreadKey(selfKey, peerKey);
        const threadList = this.db.dms[threadKey] ?? [];
        const lastMsg = threadList[threadList.length - 1];
        if (lastMsg) {
          if (!this.db.dmReadReceipts[threadKey] || typeof this.db.dmReadReceipts[threadKey] !== 'object') {
            this.db.dmReadReceipts[threadKey] = {};
          }
          const prev = this.db.dmReadReceipts[threadKey][selfKey];
          if (!prev || prev.lastReadMessageId !== lastMsg.id) {
            const receipt = {
              readerUsername: selfKey,
              lastReadMessageId: lastMsg.id,
              readAt: Date.now(),
            };
            this.db.dmReadReceipts[threadKey][selfKey] = receipt;
            changed = true;
            if (peerAcc?.privacy?.showReadReceipts !== false) {
              this.sendWsEventToUser(peerKey, {
                type: 'dm:read',
                threadUsers: [selfKey, peerKey],
                receipt,
              });
            }
          }
        }
      }

      if (changed) {
        this.saveDb();
        this.pushSnapshotToUser(selfKey);
      }
      return jsonResponse(request, 200, { ok: true, snapshot: this.buildSocialSnapshot(selfKey) });
    }

    // GIFs
    if (method === 'POST' && reqPath === '/api/gifs/favorite') {
      const gifItem = sanitizeGifItem(body.gif);
      if (!gifItem) return jsonResponse(request, 400, { ok: false, error: 'Error: Invalid GIF URL' });
      const mode = body.mode === 'add' ? 'add' : 'toggle';
      this.ensureGifDimensions(gifItem);
      const existing = this.db.favoriteGifs[selfKey] ?? [];
      const idx = existing.findIndex((g) => g.url === gifItem.url);
      let isFavorited = true;
      if (idx >= 0) {
        if (mode === 'toggle') {
          existing.splice(idx, 1);
          isFavorited = false;
        }
      } else {
        existing.unshift(gifItem);
        if (existing.length > 100) existing.length = 100;
      }
      this.db.favoriteGifs[selfKey] = existing;
      this.saveDb();
      this.pushSnapshotToUser(selfKey);
      return jsonResponse(request, 200, {
        ok: true,
        isFavorited,
        snapshot: this.buildSocialSnapshot(selfKey),
      });
    }

    if (method === 'GET' && reqPath === '/api/gifs/search') {
      const query = (urlObj.searchParams.get('q') ?? '').trim();
      const results = this.searchCommunityGifs(query);
      const totalIntact = query
        ? this.db.communityGifs.filter((entry) => this.isCommunityGifAssetIntact(entry)).length
        : results.length;
      return jsonResponse(request, 200, { ok: true, total: totalIntact, results });
    }

    if (method === 'POST' && reqPath === '/api/gifs/link') {
      const gifItem = sanitizeGifItem(body.gif);
      if (!gifItem) return jsonResponse(request, 400, { ok: false, error: 'Error: Invalid GIF item' });
      const { code, gif, created } = this.getOrMintGifShareCode(gifItem);
      if (created) this.saveDb();
      return jsonResponse(request, 200, {
        ok: true,
        code,
        path: `/gif/${encodeURIComponent(code)}`,
        gif,
      });
    }

    if (method === 'GET' && reqPath === '/api/gifs/resolve') {
      const rawCode = urlObj.searchParams.get('code') ?? '';
      const resolved = this.resolveGifByCode(rawCode);
      if (!resolved) return jsonResponse(request, 404, { ok: false, error: 'Error: GIF link not found' });
      return jsonResponse(request, 200, { ok: true, code: rawCode.trim(), gif: resolved });
    }

    if (method === 'POST' && reqPath === '/api/threads/mute') {
      const normThread = normalizeUserThreadKey(body.threadKey);
      if (!normThread) return jsonResponse(request, 400, { ok: false, error: 'Error: Invalid thread key' });
      if (normThread.startsWith('group:')) {
        const gid = normThread.slice('group:'.length);
        const grp = this.db.groupDms[gid];
        if (!grp || !grp.members.some((m) => m.toLowerCase() === selfKey)) {
          return jsonResponse(request, 404, { ok: false, error: 'Error: Group chat not found' });
        }
      } else {
        const peer = normThread.slice('dm:'.length);
        if (!this.findAccountByUsername(peer) || peer === selfKey) {
          return jsonResponse(request, 404, { ok: false, error: 'Error: User not found' });
        }
      }
      const muteUntil = body.muteUntil;
      if (!this.db.mutedThreads[selfKey] || typeof this.db.mutedThreads[selfKey] !== 'object') {
        this.db.mutedThreads[selfKey] = {};
      }
      if (muteUntil === null || muteUntil === 0 || muteUntil === false) {
        delete this.db.mutedThreads[selfKey][normThread];
      } else if (muteUntil === -1 || muteUntil === -2) {
        this.db.mutedThreads[selfKey][normThread] = muteUntil;
      } else if (typeof muteUntil === 'number' && Number.isFinite(muteUntil) && muteUntil > Date.now()) {
        this.db.mutedThreads[selfKey][normThread] = Math.floor(muteUntil);
      } else {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Invalid mute duration' });
      }
      this.saveDb();
      this.pushSnapshotToUser(selfKey);
      return jsonResponse(request, 200, { ok: true, snapshot: this.buildSocialSnapshot(selfKey) });
    }

    if (method === 'POST' && reqPath === '/api/threads/hide') {
      const normThread = normalizeUserThreadKey(body.threadKey);
      if (!normThread) return jsonResponse(request, 400, { ok: false, error: 'Error: Invalid thread key' });
      const hidden = body.hidden !== false;
      if (!this.db.hiddenThreads[selfKey] || typeof this.db.hiddenThreads[selfKey] !== 'object') {
        this.db.hiddenThreads[selfKey] = {};
      }
      if (hidden) this.db.hiddenThreads[selfKey][normThread] = true;
      else delete this.db.hiddenThreads[selfKey][normThread];
      this.saveDb();
      this.pushSnapshotToUser(selfKey);
      return jsonResponse(request, 200, { ok: true, snapshot: this.buildSocialSnapshot(selfKey) });
    }

    if (method === 'POST' && reqPath === '/api/gifs/add') {
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
        return jsonResponse(request, 400, {
          ok: false,
          error: 'Error: Select between 1 and 25 GIFs to import',
        });
      }

      const added = [];
      const now = Date.now();
      for (const rawItem of rawItems) {
        if (!rawItem || typeof rawItem !== 'object') {
          return jsonResponse(request, 400, { ok: false, error: 'Error: Invalid GIF submission item' });
        }
        const uploadId = typeof rawItem.uploadId === 'string' ? rawItem.uploadId.trim() : '';
        const meta = uploadId ? this.db.uploads[uploadId] : undefined;
        if (!meta || meta.uploadedBy.toLowerCase() !== selfKey) {
          return jsonResponse(request, 404, { ok: false, error: 'Error: Uploaded media not found' });
        }

        const isAllowedMedia =
          meta.kind === 'image' ||
          meta.kind === 'video' ||
          meta.kind === 'audio' ||
          /\.(gif|mp4|m4v|webm|mov|mkv|avi|ogv|wmv|flv|wav|mp3|ogg|flac|m4a|aac|weba|png|jpe?g|webp)$/i.test(
            meta.name || '',
          );
        if (!isAllowedMedia) {
          return jsonResponse(request, 400, {
            ok: false,
            error: 'Error: Unsupported file type for Redshift GIFs',
          });
        }

        const rawSpeed = Number(rawItem.playbackSpeed);
        const playbackSpeed =
          Number.isFinite(rawSpeed) && rawSpeed >= 0.25 && rawSpeed <= 4
            ? Math.round(rawSpeed * 100) / 100
            : 1;

        const isNativeGif = meta.mime === 'image/gif' || /\.gif$/i.test(meta.name || '');
        const isStaticImage = meta.kind === 'image' && !isNativeGif;
        const isAudioOrVideo = !isNativeGif && !isStaticImage;

        const clientDur =
          typeof rawItem.durationSec === 'number' && Number.isFinite(rawItem.durationSec)
            ? rawItem.durationSec
            : null;
        if (isAudioOrVideo && clientDur !== null && clientDur > MAX_GIF_DURATION_SEC + 0.5) {
          return jsonResponse(request, 400, {
            ok: false,
            error: `Error: "${meta.name}" is longer than the 5-minute (5:00) maximum for GIFs`,
          });
        }

        let finalUploadId = meta.id;
        let finalMediaKind = isAudioOrVideo ? 'video' : 'gif';
        let speedBakedIntoFile = false;
        let finalWidth =
          typeof rawItem.width === 'number' && Number.isInteger(rawItem.width) && rawItem.width > 0
            ? rawItem.width
            : undefined;
        let finalHeight =
          typeof rawItem.height === 'number' && Number.isInteger(rawItem.height) && rawItem.height > 0
            ? rawItem.height
            : undefined;

        if (isNativeGif) {
          const dims = readGifDimensionsFromBytes(this.store.readUploadHeaderBytes(meta.id, 10));
          if (dims) {
            finalWidth = dims.width;
            finalHeight = dims.height;
          }
          if (Math.abs(playbackSpeed - 1) >= 0.02) {
            const rawGifBytes = this.store.readUploadFullBytes(meta.id, 20 * 1024 * 1024);
            const scaled = rawGifBytes ? scaleGifBytesSpeed(rawGifBytes, playbackSpeed) : null;
            if (scaled) {
              const newId = crypto.randomUUID();
              this.store.writeUploadFullBytes(newId, scaled);
              this.db.uploads[newId] = {
                id: newId,
                diskName: `${newId}.gif`,
                name: meta.name,
                mime: 'image/gif',
                size: scaled.byteLength,
                kind: 'image',
                uploadedBy: selfKey,
                createdAt: now,
              };
              finalUploadId = newId;
              speedBakedIntoFile = true;
            }
          }
        }

        const effectiveDurationSec =
          clientDur !== null
            ? Math.min(MAX_GIF_DURATION_SEC, Math.round(clientDur * 10) / 10)
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

      this.db.communityGifs.unshift(...added);
      this.saveDb();
      this.broadcastGifsUpdated();
      return jsonResponse(request, 200, { ok: true, added, total: this.db.communityGifs.length });
    }

    if (method === 'POST' && reqPath === '/api/gifs/remove') {
      const gifId = typeof body.id === 'string' ? body.id.trim() : '';
      const idx = this.db.communityGifs.findIndex((g) => g.id === gifId);
      if (idx < 0) return jsonResponse(request, 404, { ok: false, error: 'Error: GIF not found' });
      const target = this.db.communityGifs[idx];
      if (target.uploadedBy.toLowerCase() !== selfKey) {
        return jsonResponse(request, 403, {
          ok: false,
          error: 'Error: You can only remove GIFs you submitted',
        });
      }
      this.db.communityGifs.splice(idx, 1);
      if (target.uploadId) this.cleanupOrphanedUploads([target.uploadId]);
      this.saveDb();
      this.broadcastGifsUpdated();
      return jsonResponse(request, 200, { ok: true, total: this.db.communityGifs.length });
    }

    // DMs & Groups: Send Message
    if (method === 'POST' && reqPath === '/api/dms/send') {
      const sendLimit = this.rateLimiter.check(`send:${selfKey}`, MSG_RATE_LIMIT, 15_000);
      if (!sendLimit.ok) {
        return jsonResponse(
          request,
          429,
          {
            ok: false,
            error: `Error: Slow down! Please wait ${sendLimit.retryAfterSec}s before sending more messages`,
          },
          { 'Retry-After': String(sendLimit.retryAfterSec) },
        );
      }
      const toKey = typeof body.toUsername === 'string' ? body.toUsername.trim().toLowerCase() : '';
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
        return jsonResponse(request, 400, {
          ok: false,
          error: `Error: You can attach at most ${MAX_DM_IMAGES_PER_MESSAGE} files per message`,
        });
      }

      const imageDataUrls = [];
      for (const item of rawArray) {
        if (typeof item === 'string' && item.trim().startsWith('data:image/')) {
          const clean = item.trim();
          if (clean.length > MAX_MESSAGE_IMAGE_CHARS) {
            return jsonResponse(request, 413, { ok: false, error: 'Error: Attached image is too large' });
          }
          imageDataUrls.push(clean);
        }
      }

      const validAttachmentIds = [];
      for (const attId of rawAttIds) {
        const meta = this.db.uploads[attId];
        if (!meta || meta.uploadedBy.toLowerCase() !== selfKey) {
          return jsonResponse(request, 400, { ok: false, error: 'Error: Uploaded attachment not found' });
        }
        validAttachmentIds.push(attId);
      }

      const gifItem = body.gif ? sanitizeGifItem(body.gif) : null;
      const ctx = this.resolveThreadContext(selfKey, { peerUsername: toKey, groupId });
      if (!ctx.ok) return jsonResponse(request, ctx.status ?? 403, { ok: false, error: ctx.error });

      if (!content && imageDataUrls.length === 0 && validAttachmentIds.length === 0 && !gifItem) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Message cannot be empty' });
      }
      if (content.length > 4000) {
        return jsonResponse(request, 400, {
          ok: false,
          error: 'Error: Message is too long (max 4000 chars)',
        });
      }

      if (!Array.isArray(this.db.dms[ctx.threadKey])) this.db.dms[ctx.threadKey] = [];
      const threadList = this.db.dms[ctx.threadKey];

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
        const srAcc = srUserRaw ? this.findAccountByUsername(srUserRaw) : undefined;
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
            waveform: rawWave.slice(0, 64).map((n) => Math.min(1, Math.max(0.05, Number(n) || 0.05))),
          };
        }
      }

      let finalContent = content;
      let finalGif = gifItem ?? undefined;
      if (!finalGif && finalContent) {
        const shareCode = extractGifShareCode(finalContent);
        const resolved = shareCode ? this.resolveGifByCode(shareCode) : null;
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
      const stored = {
        id: crypto.randomUUID(),
        authorUsername: selfKey,
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
      this.store.insertMessage(ctx.threadKey, stored);

      const mentionedUsers = new Set(extractMentionUsernames(finalContent));
      const replyTargetUser = storedReply?.authorUsername?.toLowerCase() ?? '';
      if (!this.db.unreadMentions || typeof this.db.unreadMentions !== 'object') {
        this.db.unreadMentions = {};
      }
      if (!this.db.groupUnreadMentions || typeof this.db.groupUnreadMentions !== 'object') {
        this.db.groupUnreadMentions = {};
      }

      let sendReceiptEvent = null;
      if (ctx.kind === 'group') {
        if (this.db.unreadGroups[selfKey]?.[ctx.groupId]) {
          delete this.db.unreadGroups[selfKey][ctx.groupId];
        }
        if (this.db.groupUnreadMentions?.[selfKey]?.[ctx.groupId]) {
          delete this.db.groupUnreadMentions[selfKey][ctx.groupId];
        }
        for (const member of ctx.participants) {
          const memberKey = member.toLowerCase();
          this.touchThreadActivityForUser(memberKey, `group:${ctx.groupId}`, msgNow, { unhide: true });
          if (memberKey === selfKey) continue;
          if (!this.db.unreadGroups[memberKey] || typeof this.db.unreadGroups[memberKey] !== 'object') {
            this.db.unreadGroups[memberKey] = {};
          }
          this.db.unreadGroups[memberKey][ctx.groupId] =
            (this.db.unreadGroups[memberKey][ctx.groupId] ?? 0) + 1;

          if (mentionedUsers.has(memberKey) || replyTargetUser === memberKey) {
            if (
              !this.db.groupUnreadMentions[memberKey] ||
              typeof this.db.groupUnreadMentions[memberKey] !== 'object'
            ) {
              this.db.groupUnreadMentions[memberKey] = {};
            }
            this.db.groupUnreadMentions[memberKey][ctx.groupId] =
              (this.db.groupUnreadMentions[memberKey][ctx.groupId] ?? 0) + 1;
          }
        }
      } else {
        if (this.db.unreadDms[selfKey]?.[ctx.peerKey]) {
          delete this.db.unreadDms[selfKey][ctx.peerKey];
        }
        if (this.db.unreadMentions?.[selfKey]?.[ctx.peerKey]) {
          delete this.db.unreadMentions[selfKey][ctx.peerKey];
        }
        if (activeUser.privacy?.showReadReceipts !== false) {
          const peerAcc = this.findAccountByUsername(ctx.peerKey);
          if (!this.db.dmReadReceipts[ctx.threadKey] || typeof this.db.dmReadReceipts[ctx.threadKey] !== 'object') {
            this.db.dmReadReceipts[ctx.threadKey] = {};
          }
          const sendReceipt = {
            readerUsername: selfKey,
            lastReadMessageId: stored.id,
            readAt: msgNow,
          };
          this.db.dmReadReceipts[ctx.threadKey][selfKey] = sendReceipt;
          if (peerAcc?.privacy?.showReadReceipts !== false) {
            sendReceiptEvent = {
              type: 'dm:read',
              threadUsers: [selfKey, ctx.peerKey],
              receipt: sendReceipt,
            };
          }
        }
        if (!this.db.unreadDms[ctx.peerKey] || typeof this.db.unreadDms[ctx.peerKey] !== 'object') {
          this.db.unreadDms[ctx.peerKey] = {};
        }
        this.db.unreadDms[ctx.peerKey][selfKey] = (this.db.unreadDms[ctx.peerKey][selfKey] ?? 0) + 1;
        if (mentionedUsers.has(ctx.peerKey) || replyTargetUser === ctx.peerKey) {
          if (
            !this.db.unreadMentions[ctx.peerKey] ||
            typeof this.db.unreadMentions[ctx.peerKey] !== 'object'
          ) {
            this.db.unreadMentions[ctx.peerKey] = {};
          }
          this.db.unreadMentions[ctx.peerKey][selfKey] =
            (this.db.unreadMentions[ctx.peerKey][selfKey] ?? 0) + 1;
        }
        this.recordOpenDmPeer(selfKey, ctx.peerKey);
        this.recordOpenDmPeer(ctx.peerKey, selfKey);
        this.touchThreadActivityForUser(selfKey, `dm:${ctx.peerKey}`, msgNow, { unhide: true });
        this.touchThreadActivityForUser(ctx.peerKey, `dm:${selfKey}`, msgNow, { unhide: true });
      }

      const hydrated = this.hydrateMessage(stored, threadList);
      const wsEvent =
        ctx.kind === 'group'
          ? { type: 'dm:message', groupId: ctx.groupId, message: hydrated }
          : { type: 'dm:message', threadUsers: [selfKey, ctx.peerKey], message: hydrated };

      // Push real-time DM event FIRST so recipients receive it & badge updates in <10ms.
      for (const participant of ctx.participants) {
        this.sendWsEventToUser(participant, wsEvent);
      }
      if (sendReceiptEvent) {
        this.sendWsEventToUser(ctx.peerKey, sendReceiptEvent);
      }

      if (ctx.kind === 'group') {
        this.emitGroupTypingState(selfKey, ctx.groupId, false);
      } else {
        this.emitTypingState(selfKey, ctx.peerKey, false);
      }

      for (const participant of ctx.participants) {
        this.pushSnapshotToUser(participant);
      }

      // Send native iOS / Android Web Push notifications to recipients (non-blocking via waitUntil).
      const pushPreview = finalContent
        ? finalContent.replace(/\s+/g, ' ').trim().slice(0, 140)
        : voiceNote
          ? 'Sent a voice message'
          : finalGif
            ? 'Sent a GIF'
            : validAttachmentIds.length > 0 || imageDataUrls.length > 0
              ? 'Sent an attachment'
              : 'Sent a message';
      const pushGroup = ctx.kind === 'group' ? this.db.groupDms[ctx.groupId] : undefined;
      for (const participant of ctx.participants) {
        const pKey = participant.toLowerCase();
        if (pKey === selfKey) continue;
        const userMuteKey = ctx.kind === 'group' ? `group:${ctx.groupId}` : `dm:${selfKey}`;
        const isPinged = mentionedUsers.has(pKey) || replyTargetUser === pKey;
        if (this.isThreadMutedForPush(pKey, userMuteKey, isPinged)) continue;
        const pushAvatarFields = this.getNotificationAvatarPayload(activeUser);
        this.sendPushToUser(pKey, {
          title:
            ctx.kind === 'group'
              ? `${activeUser.displayName} in ${pushGroup?.name || 'Group Chat'}`
              : activeUser.displayName,
          body: pushPreview,
          tag: userMuteKey,
          threadKind: ctx.kind === 'group' ? 'group' : 'dm',
          threadId: ctx.kind === 'group' ? ctx.groupId : selfKey,
          ...pushAvatarFields,
        });
      }

      this.saveDb();
      return jsonResponse(request, 200, { ok: true, message: hydrated });
    }

    if (method === 'POST' && reqPath === '/api/dms/edit') {
      const peerKey =
        typeof body.peerUsername === 'string' ? body.peerUsername.trim().toLowerCase() : '';
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : '';
      const content = typeof body.content === 'string' ? body.content.trim() : '';

      const ctx = this.resolveThreadContext(selfKey, { peerUsername: peerKey, groupId });
      if (!ctx.ok) return jsonResponse(request, ctx.status ?? 403, { ok: false, error: ctx.error });
      const list = this.db.dms[ctx.threadKey] ?? [];
      const target = list.find((m) => m.id === messageId);
      if (!target) return jsonResponse(request, 404, { ok: false, error: 'Error: Message not found' });
      if (target.callLog) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Call logs cannot be edited' });
      }
      if (target.authorUsername.toLowerCase() !== selfKey) {
        return jsonResponse(request, 403, { ok: false, error: 'Error: You can only edit your own messages' });
      }
      const hasStoredAttachments = Boolean(
        target.imageDataUrl ||
          (Array.isArray(target.imageDataUrls) && target.imageDataUrls.length > 0) ||
          (Array.isArray(target.attachmentIds) && target.attachmentIds.length > 0) ||
          target.gif,
      );
      if (!content && !hasStoredAttachments) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Message cannot be empty' });
      }
      if (content.length > 4000) {
        return jsonResponse(request, 400, {
          ok: false,
          error: 'Error: Message is too long (max 4000 chars)',
        });
      }
      target.content = content;
      target.editedAt = Date.now();
      this.store.updateMessage(target);
      this.saveDb();

      const hydrated = this.hydrateMessage(target, list);
      const wsEvent =
        ctx.kind === 'group'
          ? { type: 'dm:edit', groupId: ctx.groupId, message: hydrated }
          : { type: 'dm:edit', threadUsers: [selfKey, ctx.peerKey], message: hydrated };
      for (const participant of ctx.participants) this.sendWsEventToUser(participant, wsEvent);
      return jsonResponse(request, 200, { ok: true, message: hydrated });
    }

    if (method === 'POST' && reqPath === '/api/dms/spoiler') {
      const peerKey =
        typeof body.peerUsername === 'string' ? body.peerUsername.trim().toLowerCase() : '';
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : '';
      const attachmentId = typeof body.attachmentId === 'string' ? body.attachmentId.trim() : '';

      const ctx = this.resolveThreadContext(selfKey, { peerUsername: peerKey, groupId });
      if (!ctx.ok) return jsonResponse(request, ctx.status ?? 403, { ok: false, error: ctx.error });
      const list = this.db.dms[ctx.threadKey] ?? [];
      const target = list.find((m) => m.id === messageId);
      if (!target) return jsonResponse(request, 404, { ok: false, error: 'Error: Message not found' });
      if (target.authorUsername.toLowerCase() !== selfKey) {
        return jsonResponse(request, 403, {
          ok: false,
          error: 'Error: You can only toggle spoilers on your own messages',
        });
      }
      const attIds = Array.isArray(target.attachmentIds) ? target.attachmentIds : [];
      if (!attachmentId || !attIds.includes(attachmentId)) {
        return jsonResponse(request, 404, { ok: false, error: 'Error: Attachment not found on message' });
      }

      const nextSet = new Set(
        Array.isArray(target.spoilerAttachmentIds) ? target.spoilerAttachmentIds : [],
      );
      const nextSpoiler = typeof body.spoiler === 'boolean' ? body.spoiler : !nextSet.has(attachmentId);
      if (nextSpoiler) nextSet.add(attachmentId);
      else nextSet.delete(attachmentId);
      target.spoilerAttachmentIds = nextSet.size > 0 ? Array.from(nextSet) : undefined;
      this.store.updateMessage(target);
      this.saveDb();

      const hydrated = this.hydrateMessage(target, list);
      const wsEvent =
        ctx.kind === 'group'
          ? { type: 'dm:edit', groupId: ctx.groupId, message: hydrated }
          : { type: 'dm:edit', threadUsers: [selfKey, ctx.peerKey], message: hydrated };
      for (const participant of ctx.participants) this.sendWsEventToUser(participant, wsEvent);
      return jsonResponse(request, 200, { ok: true, message: hydrated });
    }

    if (method === 'POST' && reqPath === '/api/dms/forward') {
      const sendLimit = this.rateLimiter.check(`send:${selfKey}`, MSG_RATE_LIMIT, 15_000);
      if (!sendLimit.ok) {
        return jsonResponse(
          request,
          429,
          {
            ok: false,
            error: `Error: Slow down! Please wait ${sendLimit.retryAfterSec}s before forwarding`,
          },
          { 'Retry-After': String(sendLimit.retryAfterSec) },
        );
      }

      const sourcePeerKey =
        typeof body.sourcePeerUsername === 'string'
          ? body.sourcePeerUsername.trim().toLowerCase()
          : '';
      const sourceGroupId = typeof body.sourceGroupId === 'string' ? body.sourceGroupId.trim() : '';
      const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : '';
      const rawTargets = Array.isArray(body.targets) ? body.targets : [];
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '';

      if (!messageId || rawTargets.length === 0) {
        return jsonResponse(request, 400, {
          ok: false,
          error: 'Error: Select at least one chat to forward to',
        });
      }

      const dedupedTargets = [];
      const seenKeys = new Set();
      for (const t of rawTargets) {
        if (!t || typeof t !== 'object') continue;
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
        return jsonResponse(request, 400, { ok: false, error: 'Error: Select at least one valid chat' });
      }
      if (dedupedTargets.length > 10) {
        return jsonResponse(request, 400, {
          ok: false,
          error: 'Error: You can forward to at most 10 chats at a time',
        });
      }

      const sourceCtx = this.resolveThreadContext(selfKey, {
        peerUsername: sourcePeerKey,
        groupId: sourceGroupId,
      });
      if (!sourceCtx.ok) {
        return jsonResponse(request, sourceCtx.status ?? 403, { ok: false, error: sourceCtx.error });
      }
      const sourceList = this.db.dms[sourceCtx.threadKey] ?? [];
      const sourceMsg = sourceList.find((m) => m.id === messageId);
      if (!sourceMsg || sourceMsg.callLog || sourceMsg.systemEvent) {
        return jsonResponse(request, 404, { ok: false, error: 'Error: Message cannot be forwarded' });
      }

      const origAuthorAcc = this.findAccountByUsername(sourceMsg.authorUsername);
      const forwardedMeta = sourceMsg.forwarded
        ? { ...sourceMsg.forwarded }
        : {
            originalAuthorUsername: origAuthorAcc?.username ?? sourceMsg.authorUsername,
            originalAuthorName: origAuthorAcc?.displayName ?? sourceMsg.authorUsername,
            originalTimestamp: sourceMsg.timestamp,
            sourceKind: sourceCtx.kind,
          };

      const copiedAttachmentIds = Array.isArray(sourceMsg.attachmentIds)
        ? sourceMsg.attachmentIds.filter((id) => Boolean(this.db.uploads[id]))
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
        if (!Array.isArray(this.db.dms[targetCtx.threadKey])) this.db.dms[targetCtx.threadKey] = [];
        const tList = this.db.dms[targetCtx.threadKey];
        tList.push(storedObj);
        this.store.insertMessage(targetCtx.threadKey, storedObj);

        const mentionedUsers = new Set(extractMentionUsernames(storedObj.content || ''));
        if (!this.db.unreadMentions || typeof this.db.unreadMentions !== 'object') {
          this.db.unreadMentions = {};
        }
        if (!this.db.groupUnreadMentions || typeof this.db.groupUnreadMentions !== 'object') {
          this.db.groupUnreadMentions = {};
        }

        if (targetCtx.kind === 'group') {
          if (this.db.unreadGroups[selfKey]?.[targetCtx.groupId]) {
            delete this.db.unreadGroups[selfKey][targetCtx.groupId];
          }
          if (this.db.groupUnreadMentions?.[selfKey]?.[targetCtx.groupId]) {
            delete this.db.groupUnreadMentions[selfKey][targetCtx.groupId];
          }
          for (const member of targetCtx.participants) {
            const memberKey = member.toLowerCase();
            this.touchThreadActivityForUser(memberKey, `group:${targetCtx.groupId}`, storedObj.timestamp, {
              unhide: true,
            });
            pushedUsers.add(memberKey);
            if (memberKey === selfKey) continue;
            if (!this.db.unreadGroups[memberKey] || typeof this.db.unreadGroups[memberKey] !== 'object') {
              this.db.unreadGroups[memberKey] = {};
            }
            this.db.unreadGroups[memberKey][targetCtx.groupId] =
              (this.db.unreadGroups[memberKey][targetCtx.groupId] ?? 0) + 1;
            if (mentionedUsers.has(memberKey)) {
              if (
                !this.db.groupUnreadMentions[memberKey] ||
                typeof this.db.groupUnreadMentions[memberKey] !== 'object'
              ) {
                this.db.groupUnreadMentions[memberKey] = {};
              }
              this.db.groupUnreadMentions[memberKey][targetCtx.groupId] =
                (this.db.groupUnreadMentions[memberKey][targetCtx.groupId] ?? 0) + 1;
            }
          }
        } else {
          if (this.db.unreadDms[selfKey]?.[targetCtx.peerKey]) {
            delete this.db.unreadDms[selfKey][targetCtx.peerKey];
          }
          if (this.db.unreadMentions?.[selfKey]?.[targetCtx.peerKey]) {
            delete this.db.unreadMentions[selfKey][targetCtx.peerKey];
          }
          if (!this.db.unreadDms[targetCtx.peerKey] || typeof this.db.unreadDms[targetCtx.peerKey] !== 'object') {
            this.db.unreadDms[targetCtx.peerKey] = {};
          }
          this.db.unreadDms[targetCtx.peerKey][selfKey] =
            (this.db.unreadDms[targetCtx.peerKey][selfKey] ?? 0) + 1;
          if (mentionedUsers.has(targetCtx.peerKey)) {
            if (
              !this.db.unreadMentions[targetCtx.peerKey] ||
              typeof this.db.unreadMentions[targetCtx.peerKey] !== 'object'
            ) {
              this.db.unreadMentions[targetCtx.peerKey] = {};
            }
            this.db.unreadMentions[targetCtx.peerKey][selfKey] =
              (this.db.unreadMentions[targetCtx.peerKey][selfKey] ?? 0) + 1;
          }
          this.recordOpenDmPeer(selfKey, targetCtx.peerKey);
          this.recordOpenDmPeer(targetCtx.peerKey, selfKey);
          this.touchThreadActivityForUser(selfKey, `dm:${targetCtx.peerKey}`, storedObj.timestamp, {
            unhide: true,
          });
          this.touchThreadActivityForUser(targetCtx.peerKey, `dm:${selfKey}`, storedObj.timestamp, {
            unhide: true,
          });
          pushedUsers.add(selfKey);
          pushedUsers.add(targetCtx.peerKey);
        }

        const hydrated = this.hydrateMessage(storedObj, tList);
        const wsEvent =
          targetCtx.kind === 'group'
            ? { type: 'dm:message', groupId: targetCtx.groupId, message: hydrated }
            : { type: 'dm:message', threadUsers: [selfKey, targetCtx.peerKey], message: hydrated };
        for (const participant of targetCtx.participants) {
          this.sendWsEventToUser(participant, wsEvent);
        }
      };

      const baseNow = Date.now();
      for (const targetSpec of dedupedTargets) {
        const targetCtx = this.resolveThreadContext(
          selfKey,
          targetSpec.kind === 'group'
            ? { groupId: targetSpec.groupId }
            : { peerUsername: targetSpec.username },
        );
        if (!targetCtx.ok) continue;
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
          deliverMessageToTarget(targetCtx, {
            id: crypto.randomUUID(),
            authorUsername: selfKey,
            content: note,
            timestamp: baseNow + 1,
            reactions: {},
          });
        }
        forwardedCount += 1;
      }

      if (forwardedCount === 0) {
        return jsonResponse(request, 403, {
          ok: false,
          error: 'Error: Could not forward to the selected chats',
        });
      }
      this.saveDb();
      for (const u of pushedUsers) this.pushSnapshotToUser(u);
      return jsonResponse(request, 200, {
        ok: true,
        forwardedCount,
        snapshot: this.buildSocialSnapshot(selfKey),
      });
    }

    if (method === 'POST' && reqPath === '/api/dms/delete') {
      const peerKey =
        typeof body.peerUsername === 'string' ? body.peerUsername.trim().toLowerCase() : '';
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : '';

      const ctx = this.resolveThreadContext(selfKey, { peerUsername: peerKey, groupId });
      if (!ctx.ok) return jsonResponse(request, ctx.status ?? 403, { ok: false, error: ctx.error });
      const list = this.db.dms[ctx.threadKey] ?? [];
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) return jsonResponse(request, 404, { ok: false, error: 'Error: Message not found' });
      if (list[idx].authorUsername.toLowerCase() !== selfKey) {
        return jsonResponse(request, 403, {
          ok: false,
          error: 'Error: You can only delete your own messages',
        });
      }

      const [deletedMsg] = list.splice(idx, 1);
      this.store.deleteMessage(deletedMsg.id);
      const orphanCandidates = Array.isArray(deletedMsg?.attachmentIds)
        ? [...deletedMsg.attachmentIds]
        : [];
      if (typeof deletedMsg?.gif?.url === 'string' && deletedMsg.gif.url.startsWith('/api/uploads/')) {
        const gifAttId = deletedMsg.gif.url.slice('/api/uploads/'.length).split(/[/?#]/)[0];
        if (gifAttId) orphanCandidates.push(gifAttId);
      }
      if (orphanCandidates.length > 0) this.cleanupOrphanedUploads(orphanCandidates);
      this.saveDb();

      const wsEvent =
        ctx.kind === 'group'
          ? { type: 'dm:delete', groupId: ctx.groupId, messageId }
          : { type: 'dm:delete', threadUsers: [selfKey, ctx.peerKey], messageId };
      for (const participant of ctx.participants) this.sendWsEventToUser(participant, wsEvent);
      return jsonResponse(request, 200, { ok: true });
    }

    if (method === 'POST' && reqPath === '/api/dms/pin') {
      const peerKey =
        typeof body.peerUsername === 'string' ? body.peerUsername.trim().toLowerCase() : '';
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : '';

      const ctx = this.resolveThreadContext(selfKey, { peerUsername: peerKey, groupId });
      if (!ctx.ok) return jsonResponse(request, ctx.status ?? 403, { ok: false, error: ctx.error });
      const list = this.db.dms[ctx.threadKey] ?? [];
      const target = list.find((m) => m.id === messageId);
      if (!target) return jsonResponse(request, 404, { ok: false, error: 'Error: Message not found' });

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
      this.store.updateMessage(target);
      this.saveDb();

      const hydrated = this.hydrateMessage(target, list);
      const wsEvent =
        ctx.kind === 'group'
          ? { type: 'dm:pin', groupId: ctx.groupId, message: hydrated }
          : { type: 'dm:pin', threadUsers: [selfKey, ctx.peerKey], message: hydrated };
      for (const participant of ctx.participants) this.sendWsEventToUser(participant, wsEvent);

      if (nextPinned) {
        this.appendSystemEventMessage(
          ctx,
          { kind: 'pin', actorUsername: selfKey, pinnedMessageId: target.id },
          `${activeUser.displayName} pinned a message to this chat.`,
        );
      }
      return jsonResponse(request, 200, { ok: true, message: hydrated });
    }

    if (method === 'POST' && reqPath === '/api/dms/react') {
      const peerKey =
        typeof body.peerUsername === 'string' ? body.peerUsername.trim().toLowerCase() : '';
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : '';
      const emoji = typeof body.emoji === 'string' ? body.emoji.trim() : '';

      const ctx = this.resolveThreadContext(selfKey, { peerUsername: peerKey, groupId });
      if (!ctx.ok) return jsonResponse(request, ctx.status ?? 403, { ok: false, error: ctx.error });
      if (!emoji || emoji.length > 32) {
        return jsonResponse(request, 400, { ok: false, error: 'Error: Invalid emoji reaction' });
      }

      const list = this.db.dms[ctx.threadKey] ?? [];
      const target = list.find((m) => m.id === messageId);
      if (!target) return jsonResponse(request, 404, { ok: false, error: 'Error: Message not found' });
      if (!target.reactions || typeof target.reactions !== 'object') target.reactions = {};

      const currentUsers = Array.isArray(target.reactions[emoji]) ? [...target.reactions[emoji]] : [];
      const existingIdx = currentUsers.findIndex((u) => u.toLowerCase() === selfKey);
      if (existingIdx >= 0) currentUsers.splice(existingIdx, 1);
      else currentUsers.push(selfKey);
      if (currentUsers.length === 0) delete target.reactions[emoji];
      else target.reactions[emoji] = currentUsers;

      this.store.updateMessage(target);
      this.saveDb();

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
      for (const participant of ctx.participants) this.sendWsEventToUser(participant, wsEvent);
      return jsonResponse(request, 200, { ok: true, reactions: hydratedReactions });
    }

    return jsonResponse(request, 404, { ok: false, error: 'Error: Endpoint not found' });
  }
}

export default {
  async fetch(request, env) {
    const id = env.REDSHIFT_HUB.idFromName('global');
    const stub = env.REDSHIFT_HUB.get(id);
    return stub.fetch(request);
  },
};
