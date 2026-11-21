/**
 * Zero-dependency Web Push sender implementing:
 * - RFC 8292 (VAPID ES256 authentication)
 * - RFC 8291 (Message Encryption for Web Push, Content-Encoding: aes128gcm)
 * Works natively on Cloudflare Workers (Web Crypto API) & Node.js 20+.
 */

const textEncoder = new TextEncoder();

export function base64UrlEncode(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i += 1) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlDecode(str) {
  const clean = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = clean.length % 4 === 0 ? '' : '='.repeat(4 - (clean.length % 4));
  const binary = atob(clean + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function concatBytes(...chunks) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, dataBytes);
  return new Uint8Array(sig);
}

async function importVapidPrivateKey(vapidPublicKeyB64Url, vapidPrivateKeyB64Url) {
  const pubBytes = base64UrlDecode(vapidPublicKeyB64Url);
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    throw new Error('Invalid VAPID public key (expected 65-byte uncompressed P-256 point)');
  }
  const x = base64UrlEncode(pubBytes.subarray(1, 33));
  const y = base64UrlEncode(pubBytes.subarray(33, 65));
  const d = String(vapidPrivateKeyB64Url || '').trim();
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x,
      y,
      d,
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

async function buildVapidAuthHeader({ endpoint, subject, publicKey, privateKey }) {
  const origin = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const headerB64 = base64UrlEncode(textEncoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payloadB64 = base64UrlEncode(
    textEncoder.encode(JSON.stringify({ aud: origin, exp, sub: subject })),
  );
  const signingInput = `${headerB64}.${payloadB64}`;
  const signingKey = await importVapidPrivateKey(publicKey, privateKey);
  const rawSig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      signingKey,
      textEncoder.encode(signingInput),
    ),
  );
  const jwt = `${signingInput}.${base64UrlEncode(rawSig)}`;
  return `vapid t=${jwt}, k=${publicKey}`;
}

export async function encryptWebPushPayload(plaintextStr, p256dhB64Url, authB64Url) {
  const uaPublicBytes = base64UrlDecode(p256dhB64Url);
  const authSecret = base64UrlDecode(authB64Url);
  if (uaPublicBytes.length !== 65 || uaPublicBytes[0] !== 0x04) {
    throw new Error('Invalid subscription p256dh key');
  }
  if (authSecret.length < 16) {
    throw new Error('Invalid subscription auth secret');
  }

  const uaPublicKey = await crypto.subtle.importKey(
    'raw',
    uaPublicBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  const asKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const asPublicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey));
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaPublicKey },
      asKeyPair.privateKey,
      256,
    ),
  );

  // RFC 8291 Section 3.3 Key Derivation
  const prkKey = await hmacSha256(authSecret, sharedSecret);
  const keyInfo = concatBytes(
    textEncoder.encode('WebPush: info\0'),
    uaPublicBytes,
    asPublicBytes,
    new Uint8Array([0x01]),
  );
  const ikm = await hmacSha256(prkKey, keyInfo);

  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const prk = await hmacSha256(salt, ikm);
  const cekInfo = concatBytes(textEncoder.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([0x01]));
  const nonceInfo = concatBytes(textEncoder.encode('Content-Encoding: nonce\0'), new Uint8Array([0x01]));
  const cek = (await hmacSha256(prk, cekInfo)).subarray(0, 16);
  const nonce = (await hmacSha256(prk, nonceInfo)).subarray(0, 12);

  // Record plaintext = utf8(payload) || 0x02 (final delimiter)
  const payloadBytes = textEncoder.encode(plaintextStr);
  const paddedPlaintext = concatBytes(payloadBytes, new Uint8Array([0x02]));

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, paddedPlaintext),
  );

  // RFC 8188 aes128gcm header: salt(16) || rs(4) || idlen(1) || keyid(65)
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + asPublicBytes.length);
  header.set(salt, 0);
  header[16] = (rs >>> 24) & 0xff;
  header[17] = (rs >>> 16) & 0xff;
  header[18] = (rs >>> 8) & 0xff;
  header[19] = rs & 0xff;
  header[20] = asPublicBytes.length;
  header.set(asPublicBytes, 21);

  return concatBytes(header, ciphertext);
}

export async function sendWebPushMessage({
  subscription,
  payload,
  vapidPublicKey,
  vapidPrivateKey,
  vapidSubject,
  ttl = 86400,
  urgency = 'high',
}) {
  if (
    !subscription?.endpoint ||
    !subscription?.keys?.p256dh ||
    !subscription?.keys?.auth ||
    !vapidPublicKey ||
    !vapidPrivateKey
  ) {
    return { ok: false, status: 0, expired: false };
  }

  const bodyBytes = await encryptWebPushPayload(
    JSON.stringify(payload),
    subscription.keys.p256dh,
    subscription.keys.auth,
  );
  const authorization = await buildVapidAuthHeader({
    endpoint: subscription.endpoint,
    subject: vapidSubject || 'mailto:redrepost84@gmail.com',
    publicKey: vapidPublicKey,
    privateKey: vapidPrivateKey,
  });

  const resp = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: urgency,
    },
    body: bodyBytes,
  });

  return {
    ok: resp.ok,
    status: resp.status,
    expired: resp.status === 404 || resp.status === 410,
  };
}
