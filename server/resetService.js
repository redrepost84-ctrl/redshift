import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CODE_LETTERS = 'abcdefghjkmnpqrstuvwxyz';
const CODE_DIGITS = '23456789';
const CODE_ALL = CODE_LETTERS + CODE_DIGITS;

const RESEND_COOLDOWN_MS = 25 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;
const PROOF_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const DEFAULT_MAX_BODY_BYTES = 16 * 1024;

/**
 * @typedef {{ codeHash: Buffer; expiresAt: number; lastSentAt: number; attempts: number }} ResetEntry
 * @typedef {{ token: string; expiresAt: number }} ProofEntry
 */

/** @type {Map<string, ResetEntry>} */
const resetSessions = new Map();

/** @type {Map<string, ProofEntry>} */
const resetProofs = new Map();

function loadSmtpConfig() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
  }

  const user = (process.env.SMTP_USER ?? '').trim();
  const pass = (process.env.SMTP_PASS ?? '').replace(/\s+/g, '').trim();

  if (!user || !pass || !EMAIL_REGEX.test(user)) {
    return null;
  }

  return { user, pass };
}

function generateSecureCode() {
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

function hashCode(code) {
  return crypto.createHash('sha256').update(code.trim().toLowerCase()).digest();
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [maxBytes]
 */
export function readJsonBody(req, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      raw += chunk.toString('utf8');
    });

    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });

    req.on('error', (err) => reject(err));
  });
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} statusCode
 * @param {Record<string, unknown>} payload
 */
export function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function sendResetEmail(toEmail, code, smtp) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  const safeEmail = escapeHtml(toEmail);
  const safeCode = escapeHtml(code);

  await transporter.sendMail({
    from: `"Redshift" <${smtp.user}>`,
    to: toEmail,
    subject: 'Redshift — Your Password Reset Code',
    text: [
      'Redshift Password Reset',
      '',
      `We received a password reset request for ${toEmail}.`,
      `Your 6-character verification code is: ${code}`,
      '',
      'This code expires in 10 minutes. If you did not request this, you can safely ignore this email.',
    ].join('\n'),
    html: `
      <div style="background:#15161a;color:#f2f3f5;font-family:'Segoe UI',Arial,sans-serif;padding:32px 20px;">
        <div style="max-width:440px;margin:0 auto;background:#1b1d23;border:1px solid #2b2e38;border-radius:10px;padding:28px;">
          <div style="font-size:26px;font-weight:700;color:#eb4248;letter-spacing:-0.02em;">Redshift</div>
          <p style="margin:14px 0 0;font-size:14px;line-height:1.5;color:#b5bac1;">
            We received a password reset request for <strong style="color:#ffffff;">${safeEmail}</strong>.
          </p>
          <p style="margin:14px 0 8px;font-size:13px;color:#b5bac1;">
            Enter this 6-character verification code:
          </p>
          <div style="background:#121318;border:1px solid #351a20;border-radius:8px;padding:14px;text-align:center;font-family:Consolas,monospace;font-size:26px;font-weight:700;letter-spacing:6px;color:#ffffff;">
            ${safeCode}
          </div>
          <p style="margin:16px 0 0;font-size:12px;color:#828691;line-height:1.45;">
            This code expires in 10 minutes. If you did not request a password reset, you can ignore this email.
          </p>
        </div>
      </div>
    `,
  });
}

/**
 * @param {string} email
 * @returns {Promise<{ status: number; payload: Record<string, unknown> }>}
 */
export async function issueResetEmailForAddress(email) {
  const smtp = loadSmtpConfig();
  if (!smtp) {
    return {
      status: 503,
      payload: {
        ok: false,
        error: 'Error: Email service not configured (check SMTP_USER and SMTP_PASS in .env)',
      },
    };
  }

  const key = email.toLowerCase();
  const existing = resetSessions.get(key);
  const now = Date.now();
  if (existing && now - existing.lastSentAt < RESEND_COOLDOWN_MS) {
    const remaining = Math.ceil((RESEND_COOLDOWN_MS - (now - existing.lastSentAt)) / 1000);
    return {
      status: 429,
      payload: {
        ok: false,
        error: `Error: Please wait ${remaining}s before resending email`,
        cooldownSeconds: remaining,
      },
    };
  }

  const code = generateSecureCode();

  try {
    await sendResetEmail(email, code, smtp);
  } catch (err) {
    console.error('[Redshift] Failed to send reset email:', err);
    const message =
      err && typeof err === 'object' && 'code' in err && err.code === 'EAUTH'
        ? 'Error: Gmail login failed. Verify SMTP_USER and App Password in .env'
        : 'Error: Could not send verification email. Please try again';
    return { status: 500, payload: { ok: false, error: message } };
  }

  resetSessions.set(key, {
    codeHash: hashCode(code),
    expiresAt: Date.now() + CODE_TTL_MS,
    lastSentAt: Date.now(),
    attempts: 0,
  });

  return { status: 200, payload: { ok: true, cooldownSeconds: 25 } };
}

/**
 * @param {string} email
 * @param {string} code
 * @returns {{ status: number; payload: Record<string, unknown> }}
 */
export function verifyResetCodeForAddress(email, code) {
  const key = email.toLowerCase();
  const session = resetSessions.get(key);
  if (!session) {
    return {
      status: 400,
      payload: {
        ok: false,
        error: 'Error: Verification code expired or not found. Please resend email',
      },
    };
  }

  if (Date.now() > session.expiresAt) {
    resetSessions.delete(key);
    return {
      status: 400,
      payload: {
        ok: false,
        error: 'Error: Verification code expired. Please resend email',
      },
    };
  }

  if (session.attempts >= MAX_VERIFY_ATTEMPTS) {
    return {
      status: 429,
      payload: {
        ok: false,
        error: 'Error: Too many failed attempts. Please resend email',
      },
    };
  }

  const candidateHash = hashCode(code);
  const matches =
    candidateHash.length === session.codeHash.length &&
    crypto.timingSafeEqual(candidateHash, session.codeHash);

  if (!matches) {
    session.attempts += 1;
    return {
      status: 400,
      payload: { ok: false, error: 'Error: Invalid verification code' },
    };
  }

  resetSessions.delete(key);
  const resetProofToken = crypto.randomBytes(24).toString('hex');
  resetProofs.set(key, {
    token: resetProofToken,
    expiresAt: Date.now() + PROOF_TTL_MS,
  });

  return { status: 200, payload: { ok: true, resetProofToken } };
}

/**
 * @param {string} email
 * @param {string} proofToken
 */
export function consumeResetProof(email, proofToken) {
  const key = email.toLowerCase();
  const entry = resetProofs.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    resetProofs.delete(key);
    return false;
  }

  const expected = Buffer.from(entry.token, 'utf8');
  const candidate = Buffer.from(proofToken, 'utf8');
  const matches = expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
  if (!matches) {
    return false;
  }

  resetProofs.delete(key);
  return true;
}
