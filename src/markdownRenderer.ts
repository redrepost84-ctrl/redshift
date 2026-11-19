import { copyToClipboard } from './contextMenu';
import { setTwemojiText } from './twemojiHelper';

function trimUrlTrailingPunctuation(rawUrl: string): { url: string; trailing: string } {
  let url = rawUrl;
  let trailing = '';
  while (url.length > 0 && /[.,;:!?'"\]]$/.test(url)) {
    trailing = url[url.length - 1] + trailing;
    url = url.slice(0, -1);
  }
  while (url.endsWith(')')) {
    const opens = (url.match(/\(/g) ?? []).length;
    const closes = (url.match(/\)/g) ?? []).length;
    if (closes > opens) {
      trailing = ')' + trailing;
      url = url.slice(0, -1);
    } else {
      break;
    }
  }
  return { url, trailing };
}

function appendPlainWithTwemoji(parent: HTMLElement, text: string): void {
  if (!text) {
    return;
  }
  const span = document.createElement('span');
  setTwemojiText(span, text);
  parent.appendChild(span);
}

const INLINE_TOKEN_REGEX =
  /`([^`\n]+)`|\*\*\*([^\s*](?:[\s\S]*?[^\s*])?)\*\*\*|___([^\s_](?:[\s\S]*?[^\s_])?)___|\*\*([^\s*](?:[\s\S]*?[^\s*])?)\*\*|__([^\s_](?:[\s\S]*?[^\s_])?)__|\*([^\s*](?:[^*\n]*?[^\s*])?)\*|(?<![a-zA-Z0-9])_([^\s_](?:[^_\n]*?[^\s_])?)_(?![a-zA-Z0-9])|~~([^\s~](?:[\s\S]*?[^\s~])?)~~|\|\|([^\s|](?:[\s\S]*?[^\s|])?)\|\||(https?:\/\/[^\s<]+)|(?<![a-zA-Z0-9_.+-])@([a-zA-Z0-9_.-]{2,32})(?![a-zA-Z0-9_.-])/g;

/** True when `content` mentions `@username` (word/mention boundary). */
export function containsSelfMention(content: string, selfUsernameLower: string): boolean {
  if (!content || !selfUsernameLower || !content.includes('@')) {
    return false;
  }
  const cleanSelf = selfUsernameLower.trim().toLowerCase();
  const re = /(?:^|[\s(>*_~])@([a-zA-Z0-9_.-]{2,32})(?![a-zA-Z0-9_.-])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m[1].toLowerCase() === cleanSelf) {
      return true;
    }
  }
  return false;
}

/** Extracts the first external HTTP(S) URL suitable for a link embed preview card. */
export function extractFirstPreviewableUrl(content: string): string | null {
  if (!content || (!content.includes('http://') && !content.includes('https://'))) {
    return null;
  }
  const re = /https?:\/\/[^\s<>`]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const { url } = trimUrlTrailingPunctuation(m[0]);
    try {
      const parsed = new URL(url);
      if (parsed.pathname.startsWith('/gif/') || parsed.pathname.startsWith('/api/uploads/')) {
        continue;
      }
      return parsed.href;
    } catch {
      continue;
    }
  }
  return null;
}

function appendInlineMarkdown(
  parent: HTMLElement,
  text: string,
  depth = 0,
  selfUsernameLower = '',
): void {
  if (!text) {
    return;
  }
  if (depth > 4) {
    appendPlainWithTwemoji(parent, text);
    return;
  }

  const regex = new RegExp(INLINE_TOKEN_REGEX.source, 'g');
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > cursor) {
      appendPlainWithTwemoji(parent, text.slice(cursor, match.index));
    }

    if (match[1] !== undefined) {
      const code = document.createElement('code');
      code.className = 'md-inline-code';
      code.textContent = match[1];
      parent.appendChild(code);
    } else if (match[2] !== undefined || match[3] !== undefined) {
      const strong = document.createElement('strong');
      strong.className = 'md-bold';
      const em = document.createElement('em');
      em.className = 'md-italic';
      appendInlineMarkdown(em, match[2] ?? match[3], depth + 1, selfUsernameLower);
      strong.appendChild(em);
      parent.appendChild(strong);
    } else if (match[4] !== undefined || match[5] !== undefined) {
      const strong = document.createElement('strong');
      strong.className = 'md-bold';
      appendInlineMarkdown(strong, match[4] ?? match[5], depth + 1, selfUsernameLower);
      parent.appendChild(strong);
    } else if (match[6] !== undefined || match[7] !== undefined) {
      const em = document.createElement('em');
      em.className = 'md-italic';
      appendInlineMarkdown(em, match[6] ?? match[7], depth + 1, selfUsernameLower);
      parent.appendChild(em);
    } else if (match[8] !== undefined) {
      const del = document.createElement('del');
      del.className = 'md-strike';
      appendInlineMarkdown(del, match[8], depth + 1, selfUsernameLower);
      parent.appendChild(del);
    } else if (match[9] !== undefined) {
      const spoiler = document.createElement('button');
      spoiler.type = 'button';
      spoiler.className = 'md-spoiler';
      spoiler.title = 'Click to reveal spoiler';
      spoiler.setAttribute('aria-label', 'Hidden spoiler, click to reveal');
      appendInlineMarkdown(spoiler, match[9], depth + 1, selfUsernameLower);
      spoiler.addEventListener('click', (e) => {
        e.stopPropagation();
        spoiler.classList.add('md-spoiler--revealed');
      });
      parent.appendChild(spoiler);
    } else if (match[10] !== undefined) {
      const { url, trailing } = trimUrlTrailingPunctuation(match[10]);
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const a = document.createElement('a');
        a.className = 'md-link';
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = url;
        parent.appendChild(a);
        if (trailing) {
          appendPlainWithTwemoji(parent, trailing);
        }
      } else {
        appendPlainWithTwemoji(parent, match[10]);
      }
    } else if (match[11] !== undefined) {
      const handle = match[11];
      const mentionEl = document.createElement('span');
      const isSelf = Boolean(selfUsernameLower && handle.toLowerCase() === selfUsernameLower);
      mentionEl.className = isSelf ? 'md-mention md-mention--self' : 'md-mention';
      mentionEl.textContent = `@${handle}`;
      parent.appendChild(mentionEl);
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    appendPlainWithTwemoji(parent, text.slice(cursor));
  }
}

export function renderFormattedMessageContent(
  container: HTMLElement,
  rawText: string,
  editedTag?: HTMLElement,
  selfUsernameLower = '',
): void {
  container.replaceChildren();
  const normalized = rawText.replace(/\r\n?/g, '\n');

  const codeFenceRegex = /```(?:[a-zA-Z0-9_-]*\n)?([\s\S]*?)```/g;
  const blocks: Array<{ type: 'text' | 'codeblock'; value: string }> = [];
  let cursor = 0;
  let fenceMatch: RegExpExecArray | null;

  while ((fenceMatch = codeFenceRegex.exec(normalized)) !== null) {
    if (fenceMatch.index > cursor) {
      blocks.push({ type: 'text', value: normalized.slice(cursor, fenceMatch.index) });
    }
    blocks.push({ type: 'codeblock', value: fenceMatch[1].replace(/\n$/, '') });
    cursor = fenceMatch.index + fenceMatch[0].length;
  }
  if (cursor < normalized.length) {
    blocks.push({ type: 'text', value: normalized.slice(cursor) });
  }

  let lastInlineEl: HTMLElement | null = null;

  for (let bIdx = 0; bIdx < blocks.length; bIdx += 1) {
    const block = blocks[bIdx];
    if (block.type === 'codeblock') {
      const wrap = document.createElement('div');
      wrap.className = 'md-codeblock-wrap';
      const pre = document.createElement('pre');
      pre.className = 'md-codeblock';
      const code = document.createElement('code');
      code.textContent = block.value;
      pre.appendChild(code);

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'md-codeblock-copy-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.title = 'Copy code';
      copyBtn.setAttribute('aria-label', 'Copy code block');
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        void copyToClipboard(block.value).then((ok) => {
          if (!ok) {
            return;
          }
          copyBtn.textContent = 'Copied!';
          copyBtn.classList.add('md-codeblock-copy-btn--copied');
          window.setTimeout(() => {
            copyBtn.textContent = 'Copy';
            copyBtn.classList.remove('md-codeblock-copy-btn--copied');
          }, 1500);
        });
      });

      wrap.appendChild(pre);
      wrap.appendChild(copyBtn);
      container.appendChild(wrap);
      lastInlineEl = null;
      continue;
    }

    const lines = block.value.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line) {
        // Ignore trailing blank separator line created right next to a fenced codeblock boundary.
        if (
          (i === 0 && bIdx > 0) ||
          (i === lines.length - 1 && bIdx < blocks.length - 1)
        ) {
          continue;
        }
        const spacer = document.createElement('div');
        spacer.className = 'md-spacer';
        spacer.textContent = '\u00A0';
        container.appendChild(spacer);
        lastInlineEl = spacer;
        continue;
      }

      const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const hEl = document.createElement('div');
        hEl.className = `md-heading md-h${level}`;
        appendInlineMarkdown(hEl, headingMatch[2], 0, selfUsernameLower);
        container.appendChild(hEl);
        lastInlineEl = hEl;
        continue;
      }

      const quoteMatch = /^>\s+(.+)$/.exec(line);
      if (quoteMatch) {
        const qEl = document.createElement('div');
        qEl.className = 'md-quote';
        appendInlineMarkdown(qEl, quoteMatch[1], 0, selfUsernameLower);
        container.appendChild(qEl);
        lastInlineEl = qEl;
        continue;
      }

      const pLine = document.createElement('div');
      pLine.className = 'md-line';
      appendInlineMarkdown(pLine, line, 0, selfUsernameLower);
      container.appendChild(pLine);
      lastInlineEl = pLine;
    }
  }

  if (editedTag) {
    if (lastInlineEl) {
      lastInlineEl.appendChild(editedTag);
    } else {
      container.appendChild(editedTag);
    }
  }
}
