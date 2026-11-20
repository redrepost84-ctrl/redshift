/**
 * SSRF-guarded OpenGraph link preview fetcher for Cloudflare Workers.
 * Matches server/linkPreviewService.js output contract identically.
 */

const MAX_HTML_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 3500;
const BLOCKED_HOSTNAMES = new Set(['localhost', 'ip6-localhost', 'ip6-loopback']);

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isIpv4Literal(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function isPrivateHost(rawHost) {
  let host = String(rawHost || '').trim().toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }
  if (!host || BLOCKED_HOSTNAMES.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  if (isIpv4Literal(host)) {
    return isPrivateIpv4(host);
  }
  if (host.includes(':')) {
    if (host.startsWith('::ffff:')) {
      return isPrivateIpv4(host.slice('::ffff:'.length));
    }
    if (host === '::' || host === '::1') return true;
    if (host.startsWith('fc') || host.startsWith('fd')) return true;
    if (/^fe[89ab][0-9a-f]/i.test(host)) return true;
    if (host.startsWith('ff')) return true;
  }
  return false;
}

function parseSafePublicHttpUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  if (parsed.username || parsed.password) {
    return null;
  }
  if (isPrivateHost(parsed.hostname)) {
    return null;
  }
  return parsed;
}

function decodeBasicHtmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMetaTags(html, baseUrl) {
  const findMeta = (keys) => {
    for (const key of keys) {
      const re1 = new RegExp(
        `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["'][^>]*>`,
        'i',
      );
      const re2 = new RegExp(
        `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["'][^>]*>`,
        'i',
      );
      const m = html.match(re1) || html.match(re2);
      if (m && m[1]) {
        const cleaned = decodeBasicHtmlEntities(m[1]);
        if (cleaned) return cleaned;
      }
    }
    return '';
  };

  const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = (
    findMeta(['og:title', 'twitter:title']) || decodeBasicHtmlEntities(titleTagMatch?.[1] ?? '')
  ).slice(0, 160);
  const description = findMeta(['og:description', 'twitter:description', 'description']).slice(0, 280);
  const siteName = (findMeta(['og:site_name']) || baseUrl.hostname.replace(/^www\./, '')).slice(
    0,
    80,
  );

  let imageUrl = findMeta(['og:image', 'twitter:image']);
  if (imageUrl) {
    try {
      const resolved = new URL(imageUrl, baseUrl);
      imageUrl =
        resolved.protocol === 'https:' || resolved.protocol === 'http:' ? resolved.href : '';
    } catch {
      imageUrl = '';
    }
  }

  return {
    url: baseUrl.href,
    siteName,
    title: title || baseUrl.hostname,
    description,
    imageUrl: imageUrl || undefined,
  };
}

export async function fetchSafeLinkPreview(rawUrl) {
  let current = parseSafePublicHttpUrl(rawUrl);
  if (!current) {
    return { ok: false, error: 'Error: Invalid or restricted URL' };
  }

  for (let hop = 0; hop < 3; hop += 1) {
    let res;
    try {
      res = await fetch(current.href, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': 'RedshiftBot/1.0 (+link-preview)',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        },
      });
    } catch {
      return { ok: false, error: 'Error: Could not reach URL' };
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) {
        return { ok: false, error: 'Error: Redirect missing target' };
      }
      let nextUrl;
      try {
        nextUrl = new URL(loc, current).href;
      } catch {
        return { ok: false, error: 'Error: Invalid redirect target' };
      }
      current = parseSafePublicHttpUrl(nextUrl);
      if (!current) {
        return { ok: false, error: 'Error: Redirect blocked by security policy' };
      }
      continue;
    }

    if (!res.ok) {
      return { ok: false, error: 'Error: Page returned an error status' };
    }

    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    if (!ctype.includes('text/html') && !ctype.includes('application/xhtml+xml')) {
      return {
        ok: true,
        preview: {
          url: current.href,
          siteName: current.hostname.replace(/^www\./, ''),
          title: current.pathname.split('/').filter(Boolean).pop() || current.hostname,
          description: '',
        },
      };
    }

    const reader = res.body?.getReader();
    let html = '';
    if (reader) {
      const decoder = new TextDecoder('utf-8');
      let total = 0;
      while (total < MAX_HTML_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        html += decoder.decode(value, { stream: true });
      }
      try {
        await reader.cancel();
      } catch {}
    }

    return { ok: true, preview: extractMetaTags(html, current) };
  }

  return { ok: false, error: 'Error: Too many redirects' };
}
