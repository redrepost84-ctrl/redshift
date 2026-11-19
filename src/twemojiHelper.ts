import twemoji from '@twemoji/api';

const TWEMOJI_OPTIONS = {
  folder: 'svg',
  ext: '.svg',
  className: 'twemoji-svg',
};

/**
 * Safely sets plain text inside `el` and upgrades any Unicode emojis to Twemoji SVGs.
 * Uses @twemoji/api DOM fragment construction (no innerHTML), falling back cleanly
 * to the bundled "Jdecked Twemoji" webfont if offline.
 */
export function setTwemojiText(el: HTMLElement, text: string): void {
  el.textContent = text;
  if (text && twemoji.test(text)) {
    twemoji.parse(el, TWEMOJI_OPTIONS);
  }
}

export function applyTwemojiToElement(el: HTMLElement): void {
  if (el.textContent && twemoji.test(el.textContent)) {
    twemoji.parse(el, TWEMOJI_OPTIONS);
  }
}

export function isEmojiOnlyMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  let emojiCount = 0;
  const leftover = twemoji.replace(trimmed, (raw) => {
    const stripped = raw.replace(/\uFE0F/g, '');
    if (!stripped) {
      return raw;
    }
    emojiCount += 1;
    return '';
  });

  return emojiCount >= 1 && emojiCount <= 27 && leftover.trim().length === 0;
}
