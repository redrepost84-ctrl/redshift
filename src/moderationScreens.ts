import {
  apiModFetchUserMessages,
  apiModModerateUser,
  apiSubmitAppeal,
  apiSubmitReport,
  apiVerifyModeratedAccount,
  resolveMediaUrl,
} from './apiClient';
import { openConfirmPopup } from './chatUi';
import { setDisplayNameWithRoleBadge } from './profileBadges';
import type {
  AccountRole,
  ChatMessage,
  ModeratedAccountPayload,
  ModerationEvidenceItem,
} from './types';

export const REPORT_REASON_OPTIONS = [
  'Harassment or Bullying',
  'Doxxing or Sharing Personal Information',
  'CSAM / Illegal NSFW Content',
  'Underage User (Under 12 Years Old)',
  'Malware, Phishing, or IP Grabbing',
  'Hacking, Exploits, or Account Compromise',
  'Threats of Violence or Self-Harm',
  'Hate Speech or Discrimination',
  'Spam, Scams, or Impersonation',
  'Other Terms of Service Violation',
] as const;

export interface SuspensionDurationPreset {
  id: string;
  label: string;
  ms: number | null; // null => custom
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const SUSPENSION_DURATION_PRESETS: SuspensionDurationPreset[] = [
  { id: '12h', label: '12 Hours', ms: 12 * HOUR_MS },
  { id: '1d', label: '1 Day', ms: 1 * DAY_MS },
  { id: '3d', label: '3 Days', ms: 3 * DAY_MS },
  { id: '5d', label: '5 Days', ms: 5 * DAY_MS },
  { id: '7d', label: '7 Days', ms: 7 * DAY_MS },
  { id: '14d', label: '14 Days', ms: 14 * DAY_MS },
  { id: '31d', label: '31 Days', ms: 31 * DAY_MS },
  { id: '62d', label: '62 Days', ms: 62 * DAY_MS },
  { id: '124d', label: '124 Days (4 Months)', ms: 124 * DAY_MS },
  { id: '248d', label: '248 Days (8 Months)', ms: 248 * DAY_MS },
  { id: '365d', label: '365 Days (1 Year)', ms: 365 * DAY_MS },
  { id: 'custom', label: 'Custom (Enter Days)', ms: null },
];

const REDSHIFT_TOS_REMINDER =
  'Redshift does not tolerate breaking our Terms of Service or Community Standards. Harassment, bullying, doxxing, sharing illegal NSFW content, being under 12 years of age, distributing malware or IP grabbers, hacking, threats of harm, or bypassing moderation undermines the safety of everyone on Redshift. Please review our rules carefully before returning—repeated or severe violations will result in extended suspensions or permanent account termination.';

const MODERATED_ACCOUNTS_STORAGE_KEY = 'redshift.moderated_accounts.v1';

export function saveModeratedAccountForAppeal(payload: ModeratedAccountPayload): void {
  try {
    const raw = localStorage.getItem(MODERATED_ACCOUNTS_STORAGE_KEY);
    const list: ModeratedAccountPayload[] = raw ? JSON.parse(raw) : [];
    const clean = Array.isArray(list)
      ? list.filter(
          (item) =>
            item &&
            item.account &&
            item.account.username.toLowerCase() !== payload.account.username.toLowerCase(),
        )
      : [];
    clean.unshift(payload);
    if (clean.length > 10) clean.length = 10;
    localStorage.setItem(MODERATED_ACCOUNTS_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Ignore storage failures
  }
}

export function getSavedModeratedAccounts(): ModeratedAccountPayload[] {
  try {
    const raw = localStorage.getItem(MODERATED_ACCOUNTS_STORAGE_KEY);
    const list: ModeratedAccountPayload[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    const now = Date.now();
    return list.filter((item) => {
      if (!item || !item.account?.username || !item.moderation || !item.appealToken) return false;
      if (
        item.moderation.status === 'suspended' &&
        typeof item.moderation.expiresAt === 'number' &&
        now >= item.moderation.expiresAt
      ) {
        return false;
      }
      return true;
    });
  } catch {
    return [];
  }
}

function formatModerationDateTime(ts: number): string {
  const d = new Date(ts);
  const datePart = d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const timePart = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${datePart} at ${timePart}`;
}

function buildEvidenceItemFromMessage(
  msg: ChatMessage,
  threadKey?: string,
  threadLabel?: string,
): ModerationEvidenceItem {
  const atts: Array<{ name: string; kind: string; url?: string }> = [];
  for (const a of msg.attachments ?? []) {
    atts.push({ name: a.name, kind: a.kind, url: a.url });
  }
  const legacyImgs = msg.imageDataUrls ?? (msg.imageDataUrl ? [msg.imageDataUrl] : []);
  if (legacyImgs.length > 0 && atts.length === 0) {
    legacyImgs.forEach((_, idx) => {
      atts.push({ name: `Image #${idx + 1}`, kind: 'image' });
    });
  }
  return {
    messageId: msg.id,
    threadKey,
    threadLabel,
    authorUsername: msg.authorUsername,
    content: msg.content || '',
    timestamp: msg.timestamp,
    attachments: atts.length > 0 ? atts : undefined,
    gifUrl: msg.gif?.url,
    gifTitle: msg.gif?.title,
  };
}

let activeFullscreenOverlay: HTMLDivElement | null = null;

function createImmersiveAuthShell(options: {
  onBeforeBack: () => Promise<boolean>;
  onDestroy?: () => void;
  wide?: boolean;
}): {
  overlay: HTMLDivElement;
  card: HTMLDivElement;
  closeNow: () => void;
} {
  if (activeFullscreenOverlay) {
    activeFullscreenOverlay.remove();
    activeFullscreenOverlay = null;
  }

  const overlay = document.createElement('div');
  overlay.className = 'mod-fullscreen-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const topBar = document.createElement('header');
  topBar.className = 'mod-fullscreen-topbar';

  const brand = document.createElement('h1');
  brand.className = 'brand-title mod-fullscreen-brand';
  brand.textContent = 'Redshift';
  topBar.appendChild(brand);

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'mod-fullscreen-back-btn';
  backBtn.textContent = '← Back';
  topBar.appendChild(backBtn);

  const scrollWrap = document.createElement('div');
  scrollWrap.className = 'mod-fullscreen-scroll';

  const card = document.createElement('div');
  card.className = options.wide
    ? 'mod-fullscreen-card mod-fullscreen-card--wide'
    : 'mod-fullscreen-card';
  scrollWrap.appendChild(card);

  overlay.appendChild(topBar);
  overlay.appendChild(scrollWrap);
  document.body.appendChild(overlay);
  activeFullscreenOverlay = overlay;

  let closed = false;
  const closeNow = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKeyDown, true);
    if (activeFullscreenOverlay === overlay) {
      activeFullscreenOverlay = null;
    }
    overlay.remove();
    options.onDestroy?.();
  };

  const attemptBack = async () => {
    const ok = await options.onBeforeBack();
    if (ok) {
      closeNow();
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      const topModal = document.querySelector('.modal-backdrop');
      if (topModal) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void attemptBack();
    }
  };

  backBtn.addEventListener('click', () => {
    void attemptBack();
  });
  window.addEventListener('keydown', onKeyDown, true);

  return { overlay, card, closeNow };
}

export function openReportUserScreen(options: {
  target: {
    username: string;
    displayName: string;
    role?: AccountRole;
    avatarUrl?: string;
  };
  reportedMessage?: ModerationEvidenceItem;
  setMiniPipSuppressed?: (suppressed: boolean) => void;
  onSubmitted?: (ticketId: string) => void;
}): void {
  options.setMiniPipSuppressed?.(true);

  const shell = createImmersiveAuthShell({
    onBeforeBack: async () =>
      openConfirmPopup({
        title: 'Leave Report Screen?',
        message: 'Are you sure you want to go back? Any information you typed will be lost.',
        confirmLabel: 'Discard & Go Back',
        danger: true,
      }),
    onDestroy: () => {
      options.setMiniPipSuppressed?.(false);
    },
  });

  const heading = document.createElement('h2');
  heading.className = 'mod-screen-heading';
  heading.textContent = 'Submit a Report';
  shell.card.appendChild(heading);

  const sub = document.createElement('p');
  sub.className = 'mod-screen-subtitle';
  sub.textContent =
    'Your report will be delivered securely to Redshift staff for review. If you are in a voice call, you remain connected while submitting.';
  shell.card.appendChild(sub);

  const form = document.createElement('form');
  form.className = 'mod-screen-form';
  form.noValidate = true;

  // 1) Non-editable "Who is being reported"
  const whoGroup = document.createElement('div');
  whoGroup.className = 'mod-field-group';
  const whoLabel = document.createElement('label');
  whoLabel.className = 'mod-field-label';
  whoLabel.textContent = 'Who is being reported';
  const whoInput = document.createElement('input');
  whoInput.type = 'text';
  whoInput.className = 'auth-input mod-readonly-input';
  whoInput.readOnly = true;
  whoInput.value = `${options.target.displayName} (@${options.target.username})`;
  whoGroup.appendChild(whoLabel);
  whoGroup.appendChild(whoInput);
  form.appendChild(whoGroup);

  if (options.reportedMessage) {
    const refBox = document.createElement('div');
    refBox.className = 'mod-evidence-preview-box';
    const refTitle = document.createElement('div');
    refTitle.className = 'mod-evidence-preview-title';
    refTitle.textContent = 'Attached Message Context';
    const refBody = document.createElement('div');
    refBody.className = 'mod-evidence-preview-text';
    refBody.textContent =
      options.reportedMessage.content ||
      (options.reportedMessage.gifTitle ? `[GIF: ${options.reportedMessage.gifTitle}]` : '[Media / Attachment]');
    refBox.appendChild(refTitle);
    refBox.appendChild(refBody);
    form.appendChild(refBox);
  }

  // 2) Dropdown "What are you reporting?"
  const reasonGroup = document.createElement('div');
  reasonGroup.className = 'mod-field-group';
  const reasonLabel = document.createElement('label');
  reasonLabel.className = 'mod-field-label';
  reasonLabel.textContent = 'What are you reporting?';
  const reasonSelect = document.createElement('select');
  reasonSelect.className = 'auth-input mod-select';
  const placeholderOpt = document.createElement('option');
  placeholderOpt.value = '';
  placeholderOpt.textContent = 'Select a Terms of Service violation...';
  placeholderOpt.disabled = true;
  placeholderOpt.selected = true;
  reasonSelect.appendChild(placeholderOpt);
  for (const r of REPORT_REASON_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = r;
    opt.textContent = r;
    reasonSelect.appendChild(opt);
  }
  reasonGroup.appendChild(reasonLabel);
  reasonGroup.appendChild(reasonSelect);
  form.appendChild(reasonGroup);

  // 3) Textbox "Tell us more about the situation"
  const detailsGroup = document.createElement('div');
  detailsGroup.className = 'mod-field-group';
  const detailsLabel = document.createElement('label');
  detailsLabel.className = 'mod-field-label';
  detailsLabel.textContent = 'Tell us more about the situation';
  const detailsInput = document.createElement('textarea');
  detailsInput.className = 'auth-input mod-textarea';
  detailsInput.rows = 5;
  detailsInput.maxLength = 3000;
  detailsInput.placeholder =
    'Describe what happened, where it occurred, and any additional details staff should review...';
  detailsGroup.appendChild(detailsLabel);
  detailsGroup.appendChild(detailsInput);
  form.appendChild(detailsGroup);

  const feedback = document.createElement('div');
  feedback.className = 'mod-form-feedback';
  feedback.hidden = true;
  form.appendChild(feedback);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn-primary mod-submit-btn';
  submitBtn.textContent = 'Submit Report';
  form.appendChild(submitBtn);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    feedback.hidden = true;
    const reason = reasonSelect.value.trim();
    const details = detailsInput.value.trim();
    if (!reason) {
      feedback.textContent = 'Please select what you are reporting from the dropdown.';
      feedback.className = 'mod-form-feedback mod-form-feedback--error';
      feedback.hidden = false;
      return;
    }
    if (!details) {
      feedback.textContent = 'Please tell us more about the situation before submitting.';
      feedback.className = 'mod-form-feedback mod-form-feedback--error';
      feedback.hidden = false;
      return;
    }
    const confirmed = await openConfirmPopup({
      title: 'Submit Report?',
      message: `Are you sure you want to submit this report against ${options.target.displayName} (@${options.target.username}) for "${reason}"?`,
      confirmLabel: 'Submit Report',
      danger: true,
    });
    if (!confirmed) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting Report...';
    const res = await apiSubmitReport({
      targetUsername: options.target.username,
      reason,
      details,
      reportedMessage: options.reportedMessage,
    });
    if (!res.ok) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Report';
      feedback.textContent = res.error ?? 'Error: Could not submit report.';
      feedback.className = 'mod-form-feedback mod-form-feedback--error';
      feedback.hidden = false;
      return;
    }
    options.onSubmitted?.(res.ticketId ?? '');
    shell.closeNow();
  });

  shell.card.appendChild(form);
}

export function openModerationActionScreen(options: {
  target: {
    username: string;
    displayName: string;
    role?: AccountRole;
  };
  mode: 'suspend' | 'terminate';
  preselectedEvidence?: ModerationEvidenceItem[];
  setMiniPipSuppressed?: (suppressed: boolean) => void;
  onCompleted?: () => void;
}): void {
  options.setMiniPipSuppressed?.(true);
  const isTerminate = options.mode === 'terminate';

  const shell = createImmersiveAuthShell({
    wide: true,
    onBeforeBack: async () =>
      openConfirmPopup({
        title: isTerminate ? 'Cancel Account Termination?' : 'Cancel Account Suspension?',
        message: 'Are you sure you want to leave? Any moderation details you filled out will be lost.',
        confirmLabel: 'Discard & Go Back',
        danger: true,
      }),
    onDestroy: () => {
      options.setMiniPipSuppressed?.(false);
    },
  });

  const heading = document.createElement('h2');
  heading.className = 'mod-screen-heading';
  heading.textContent = isTerminate ? 'Terminate / Delete Account' : 'Suspend Account';
  shell.card.appendChild(heading);

  const sub = document.createElement('p');
  sub.className = 'mod-screen-subtitle';
  sub.textContent = isTerminate
    ? 'Terminating this account immediately logs the user out and shows the Account Terminated notice with selected evidence.'
    : 'Suspending this account immediately logs the user out and locks sign-in until the chosen reactivation date and time.';
  shell.card.appendChild(sub);

  const form = document.createElement('form');
  form.className = 'mod-screen-form';
  form.noValidate = true;

  // Target field
  const targetGroup = document.createElement('div');
  targetGroup.className = 'mod-field-group';
  const targetLabel = document.createElement('label');
  targetLabel.className = 'mod-field-label';
  targetLabel.textContent = 'Target Account';
  const targetInput = document.createElement('input');
  targetInput.type = 'text';
  targetInput.className = 'auth-input mod-readonly-input';
  targetInput.readOnly = true;
  targetInput.value = `${options.target.displayName} (@${options.target.username})`;
  targetGroup.appendChild(targetLabel);
  targetGroup.appendChild(targetInput);
  form.appendChild(targetGroup);

  // Reason dropdown
  const reasonGroup = document.createElement('div');
  reasonGroup.className = 'mod-field-group';
  const reasonLabel = document.createElement('label');
  reasonLabel.className = 'mod-field-label';
  reasonLabel.textContent = isTerminate
    ? 'Why is this account being terminated?'
    : 'Why is this account being suspended?';
  const reasonSelect = document.createElement('select');
  reasonSelect.className = 'auth-input mod-select';
  for (const r of REPORT_REASON_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = r;
    opt.textContent = r;
    reasonSelect.appendChild(opt);
  }
  reasonGroup.appendChild(reasonLabel);
  reasonGroup.appendChild(reasonSelect);
  form.appendChild(reasonGroup);

  // Duration dropdown for Suspend
  let durationSelect: HTMLSelectElement | null = null;
  let customDaysInput: HTMLInputElement | null = null;
  if (!isTerminate) {
    const durRow = document.createElement('div');
    durRow.className = 'mod-field-row';

    const durGroup = document.createElement('div');
    durGroup.className = 'mod-field-group';
    const durLabel = document.createElement('label');
    durLabel.className = 'mod-field-label';
    durLabel.textContent = 'Suspension Duration';
    durationSelect = document.createElement('select');
    durationSelect.className = 'auth-input mod-select';
    for (const preset of SUSPENSION_DURATION_PRESETS) {
      const opt = document.createElement('option');
      opt.value = preset.id;
      opt.textContent = preset.label;
      if (preset.id === '1d') opt.selected = true;
      durationSelect.appendChild(opt);
    }
    durGroup.appendChild(durLabel);
    durGroup.appendChild(durationSelect);
    durRow.appendChild(durGroup);

    const customGroup = document.createElement('div');
    customGroup.className = 'mod-field-group';
    customGroup.hidden = true;
    const customLabel = document.createElement('label');
    customLabel.className = 'mod-field-label';
    customLabel.textContent = 'Custom Number of Days';
    customDaysInput = document.createElement('input');
    customDaysInput.type = 'number';
    customDaysInput.min = '1';
    customDaysInput.max = '3650';
    customDaysInput.step = '1';
    customDaysInput.value = '10';
    customDaysInput.className = 'auth-input';
    customDaysInput.placeholder = 'Enter days (e.g. 45)';
    customGroup.appendChild(customLabel);
    customGroup.appendChild(customDaysInput);
    durRow.appendChild(customGroup);

    durationSelect.addEventListener('change', () => {
      customGroup.hidden = durationSelect?.value !== 'custom';
    });

    form.appendChild(durRow);
  }

  // Multi-select Offending Messages / Media / Links Evidence Picker
  const evGroup = document.createElement('div');
  evGroup.className = 'mod-field-group';
  const evHeader = document.createElement('div');
  evHeader.className = 'mod-evidence-picker-header';
  const evLabel = document.createElement('label');
  evLabel.className = 'mod-field-label';
  evLabel.textContent = 'Attach Offending Messages, Media, or Links (Select multiple)';
  const evCountPill = document.createElement('span');
  evCountPill.className = 'mod-evidence-count-pill';
  evHeader.appendChild(evLabel);
  evHeader.appendChild(evCountPill);
  evGroup.appendChild(evHeader);

  const evSearchRow = document.createElement('div');
  evSearchRow.className = 'mod-evidence-search-row';
  const evSearchInput = document.createElement('input');
  evSearchInput.type = 'search';
  evSearchInput.className = 'auth-input';
  evSearchInput.placeholder = `Filter messages sent by @${options.target.username}...`;
  evSearchRow.appendChild(evSearchInput);
  evGroup.appendChild(evSearchRow);

  const evList = document.createElement('div');
  evList.className = 'mod-evidence-picker-list';
  evList.textContent = 'Loading user messages...';
  evGroup.appendChild(evList);

  const customEvRow = document.createElement('div');
  customEvRow.className = 'mod-custom-evidence-row';
  const customEvInput = document.createElement('input');
  customEvInput.type = 'text';
  customEvInput.className = 'auth-input';
  customEvInput.placeholder = 'Or add a custom offending quote / link manually...';
  const customEvAddBtn = document.createElement('button');
  customEvAddBtn.type = 'button';
  customEvAddBtn.className = 'btn-secondary';
  customEvAddBtn.textContent = '+ Add Item';
  customEvRow.appendChild(customEvInput);
  customEvRow.appendChild(customEvAddBtn);
  evGroup.appendChild(customEvRow);

  form.appendChild(evGroup);

  const selectedEvidenceMap = new Map<string, ModerationEvidenceItem>();
  let customCounter = 0;
  for (const pre of options.preselectedEvidence ?? []) {
    const key = pre.messageId ? `msg:${pre.messageId}` : `pre:${++customCounter}`;
    selectedEvidenceMap.set(key, pre);
  }

  let loadedItems: Array<{ threadKey: string; threadLabel: string; message: ChatMessage }> = [];

  const syncEvidenceCount = () => {
    evCountPill.textContent = `${selectedEvidenceMap.size} selected`;
  };

  const renderEvidenceList = () => {
    syncEvidenceCount();
    const q = evSearchInput.value.trim().toLowerCase();
    evList.replaceChildren();

    // Render any manual/preselected items not in loadedItems at top
    const loadedIds = new Set(loadedItems.map((it) => `msg:${it.message.id}`));
    for (const [key, item] of selectedEvidenceMap.entries()) {
      if (loadedIds.has(key)) continue;
      const row = document.createElement('label');
      row.className = 'mod-evidence-item mod-evidence-item--selected';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.addEventListener('change', () => {
        if (!cb.checked) {
          selectedEvidenceMap.delete(key);
          renderEvidenceList();
        }
      });
      const body = document.createElement('div');
      body.className = 'mod-evidence-item-body';
      const meta = document.createElement('div');
      meta.className = 'mod-evidence-item-meta';
      meta.textContent = item.threadLabel || 'Attached Evidence';
      const txt = document.createElement('div');
      txt.className = 'mod-evidence-item-text';
      txt.textContent = item.content || (item.gifTitle ? `[GIF: ${item.gifTitle}]` : '[Media / Attachment]');
      body.appendChild(meta);
      body.appendChild(txt);
      row.appendChild(cb);
      row.appendChild(body);
      evList.appendChild(row);
    }

    const filtered = loadedItems.filter((it) => {
      if (!q) return true;
      return (
        (it.message.content || '').toLowerCase().includes(q) ||
        it.threadLabel.toLowerCase().includes(q) ||
        (it.message.attachments ?? []).some((a) => a.name.toLowerCase().includes(q)) ||
        (it.message.gif?.title || '').toLowerCase().includes(q)
      );
    });

    if (filtered.length === 0 && selectedEvidenceMap.size === 0) {
      const empty = document.createElement('div');
      empty.className = 'mod-evidence-empty';
      empty.textContent = 'No messages found from this user yet. You can still add manual evidence below.';
      evList.appendChild(empty);
      return;
    }

    for (const entry of filtered) {
      const key = `msg:${entry.message.id}`;
      const checked = selectedEvidenceMap.has(key);
      const row = document.createElement('label');
      row.className = checked ? 'mod-evidence-item mod-evidence-item--selected' : 'mod-evidence-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = checked;
      cb.addEventListener('change', () => {
        if (cb.checked) {
          selectedEvidenceMap.set(
            key,
            buildEvidenceItemFromMessage(entry.message, entry.threadKey, entry.threadLabel),
          );
          row.classList.add('mod-evidence-item--selected');
        } else {
          selectedEvidenceMap.delete(key);
          row.classList.remove('mod-evidence-item--selected');
        }
        syncEvidenceCount();
      });

      const body = document.createElement('div');
      body.className = 'mod-evidence-item-body';
      const meta = document.createElement('div');
      meta.className = 'mod-evidence-item-meta';
      meta.textContent = `${entry.threadLabel} · ${formatModerationDateTime(entry.message.timestamp)}`;
      const txt = document.createElement('div');
      txt.className = 'mod-evidence-item-text';
      const parts: string[] = [];
      if (entry.message.content) parts.push(entry.message.content);
      if (entry.message.gif) parts.push(`[GIF: ${entry.message.gif.title || entry.message.gif.url}]`);
      if (entry.message.attachments && entry.message.attachments.length > 0) {
        parts.push(
          entry.message.attachments.map((a) => `[${a.kind.toUpperCase()}: ${a.name}]`).join(' '),
        );
      }
      txt.textContent = parts.join(' ') || '[Empty message]';

      body.appendChild(meta);
      body.appendChild(txt);
      row.appendChild(cb);
      row.appendChild(body);
      evList.appendChild(row);
    }
  };

  customEvAddBtn.addEventListener('click', () => {
    const val = customEvInput.value.trim();
    if (!val) return;
    customEvInput.value = '';
    selectedEvidenceMap.set(`manual:${++customCounter}`, {
      authorUsername: options.target.username,
      threadLabel: 'Manual Evidence',
      content: val,
      timestamp: Date.now(),
    });
    renderEvidenceList();
  });

  evSearchInput.addEventListener('input', renderEvidenceList);

  void apiModFetchUserMessages({ username: options.target.username, limit: 150 }).then((res) => {
    if (res.ok && res.items) {
      loadedItems = res.items;
    }
    renderEvidenceList();
  });

  // Moderator Note
  const noteGroup = document.createElement('div');
  noteGroup.className = 'mod-field-group';
  const noteLabel = document.createElement('label');
  noteLabel.className = 'mod-field-label';
  noteLabel.textContent = 'Moderator note';
  const noteInput = document.createElement('textarea');
  noteInput.className = 'auth-input mod-textarea';
  noteInput.rows = 3;
  noteInput.maxLength = 1000;
  noteInput.placeholder = "e.g. Don't do that again.";
  noteGroup.appendChild(noteLabel);
  noteGroup.appendChild(noteInput);
  form.appendChild(noteGroup);

  const feedback = document.createElement('div');
  feedback.className = 'mod-form-feedback';
  feedback.hidden = true;
  form.appendChild(feedback);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn-danger mod-submit-btn';
  submitBtn.textContent = isTerminate ? 'Terminate / Delete Account' : 'Suspend Account';
  form.appendChild(submitBtn);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    feedback.hidden = true;
    const reason = reasonSelect.value.trim() || 'Terms of Service Violation';
    const moderatorNote = noteInput.value.trim();
    let durationLabel = 'Permanent';
    let durationMs: number | null = null;

    if (!isTerminate && durationSelect) {
      const preset = SUSPENSION_DURATION_PRESETS.find((p) => p.id === durationSelect!.value);
      if (preset && preset.ms !== null) {
        durationLabel = preset.label;
        durationMs = preset.ms;
      } else {
        const days = Math.floor(Number(customDaysInput?.value || 0));
        if (!Number.isFinite(days) || days < 1 || days > 3650) {
          feedback.textContent = 'Please enter a valid custom number of days between 1 and 3650.';
          feedback.className = 'mod-form-feedback mod-form-feedback--error';
          feedback.hidden = false;
          return;
        }
        durationLabel = days === 1 ? '1 Day' : `${days} Days`;
        durationMs = days * DAY_MS;
      }
    }

    const evidence = Array.from(selectedEvidenceMap.values());
    const confirmed = await openConfirmPopup({
      title: isTerminate
        ? `Confirm Account Termination (@${options.target.username})`
        : `Confirm Account Suspension (@${options.target.username})`,
      message: isTerminate
        ? `Are you absolutely sure you want to TERMINATE @${options.target.username} for "${reason}" with ${evidence.length} evidence item(s)? They will be logged out immediately.`
        : `Are you absolutely sure you want to SUSPEND @${options.target.username} for ${durationLabel} for "${reason}" with ${evidence.length} evidence item(s)? They will be logged out immediately.`,
      confirmLabel: isTerminate ? 'Confirm Termination' : 'Confirm Suspension',
      danger: true,
      confirmDelaySeconds: 5,
    });
    if (!confirmed) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Applying Moderation...';
    const res = await apiModModerateUser({
      targetUsername: options.target.username,
      action: isTerminate ? 'terminate' : 'suspend',
      reason,
      durationLabel,
      durationMs,
      moderatorNote,
      evidence,
    });
    if (!res.ok) {
      submitBtn.disabled = false;
      submitBtn.textContent = isTerminate ? 'Terminate / Delete Account' : 'Suspend Account';
      feedback.textContent = res.error ?? 'Error: Could not moderate account.';
      feedback.className = 'mod-form-feedback mod-form-feedback--error';
      feedback.hidden = false;
      return;
    }

    options.onCompleted?.();
    shell.closeNow();
  });

  shell.card.appendChild(form);
}

/** Roblox-style Account Suspended / Account Terminated lockout modal. */
export function openAccountModeratedModal(options: {
  payload: ModeratedAccountPayload;
  onClose: () => void;
  onAppeal: (payload: ModeratedAccountPayload) => void;
}): () => void {
  saveModeratedAccountForAppeal(options.payload);
  const { account, moderation } = options.payload;
  const isTerminated = moderation.status === 'terminated';

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop modal-backdrop--deep modal-backdrop--top mod-ban-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');

  const card = document.createElement('div');
  card.className = 'mod-ban-card';

  const header = document.createElement('div');
  header.className = isTerminated
    ? 'mod-ban-header mod-ban-header--terminated'
    : 'mod-ban-header mod-ban-header--suspended';

  const title = document.createElement('h1');
  title.className = 'mod-ban-title';
  title.textContent = isTerminated ? 'Account Terminated' : 'Account Suspended';
  header.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'mod-ban-subtitle';
  if (isTerminated) {
    subtitle.textContent = `Account @${account.username} has been permanently terminated for violating Redshift Terms of Service.`;
  } else {
    const reactivateText = moderation.expiresAt
      ? formatModerationDateTime(moderation.expiresAt)
      : 'until reviewed by staff';
    subtitle.textContent = `Account @${account.username} is suspended for ${moderation.durationLabel || 'a temporary period'}. Your account will be reactivated on ${reactivateText}.`;
  }
  header.appendChild(subtitle);
  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'mod-ban-body';

  const metaGrid = document.createElement('div');
  metaGrid.className = 'mod-ban-meta-grid';

  const addMetaRow = (label: string, val: string) => {
    const row = document.createElement('div');
    row.className = 'mod-ban-meta-row';
    const k = document.createElement('span');
    k.className = 'mod-ban-meta-key';
    k.textContent = label;
    const v = document.createElement('span');
    v.className = 'mod-ban-meta-val';
    v.textContent = val;
    row.appendChild(k);
    row.appendChild(v);
    metaGrid.appendChild(row);
  };

  addMetaRow('Reviewed', formatModerationDateTime(moderation.issuedAt));
  addMetaRow('Reason', moderation.reason || 'Terms of Service Violation');
  if (!isTerminated && moderation.expiresAt) {
    addMetaRow('Duration', moderation.durationLabel || 'Temporary');
    addMetaRow('Reactivates On', formatModerationDateTime(moderation.expiresAt));
  }
  body.appendChild(metaGrid);

  if (moderation.moderatorNote) {
    const noteSection = document.createElement('div');
    noteSection.className = 'mod-ban-section';
    const noteTitle = document.createElement('div');
    noteTitle.className = 'mod-ban-section-title';
    noteTitle.textContent = 'Moderator Note';
    const noteBox = document.createElement('div');
    noteBox.className = 'mod-ban-note-box';
    noteBox.textContent = moderation.moderatorNote;
    noteSection.appendChild(noteTitle);
    noteSection.appendChild(noteBox);
    body.appendChild(noteSection);
  }

  const evidenceList = moderation.evidence ?? [];
  if (evidenceList.length > 0) {
    const evSection = document.createElement('div');
    evSection.className = 'mod-ban-section';
    const evTitle = document.createElement('div');
    evTitle.className = 'mod-ban-section-title';
    evTitle.textContent =
      evidenceList.length === 1 ? 'Offensive Item' : `Offensive Items (${evidenceList.length})`;
    evSection.appendChild(evTitle);

    const evScroll = document.createElement('div');
    evScroll.className = 'mod-ban-evidence-list';
    for (const item of evidenceList) {
      const evCard = document.createElement('div');
      evCard.className = 'mod-ban-evidence-card';
      if (item.timestamp || item.threadLabel) {
        const meta = document.createElement('div');
        meta.className = 'mod-ban-evidence-meta';
        meta.textContent = [
          item.threadLabel || 'Message',
          item.timestamp ? formatModerationDateTime(item.timestamp) : '',
        ]
          .filter(Boolean)
          .join(' · ');
        evCard.appendChild(meta);
      }
      if (item.content) {
        const contentEl = document.createElement('div');
        contentEl.className = 'mod-ban-evidence-content';
        contentEl.textContent = item.content;
        evCard.appendChild(contentEl);
      }
      if (item.gifUrl) {
        const gifWrap = document.createElement('div');
        gifWrap.className = 'mod-ban-evidence-media';
        const img = document.createElement('img');
        img.src = resolveMediaUrl(item.gifUrl);
        img.alt = item.gifTitle || 'Offensive GIF';
        img.className = 'mod-ban-evidence-img';
        gifWrap.appendChild(img);
        evCard.appendChild(gifWrap);
      }
      if (item.attachments && item.attachments.length > 0) {
        for (const att of item.attachments) {
          const attWrap = document.createElement('div');
          attWrap.className = 'mod-ban-evidence-media';
          if (att.kind === 'image' && att.url) {
            const img = document.createElement('img');
            img.src = resolveMediaUrl(att.url);
            img.alt = att.name;
            img.className = 'mod-ban-evidence-img';
            attWrap.appendChild(img);
          } else {
            const pill = document.createElement('span');
            pill.className = 'mod-ban-evidence-pill';
            pill.textContent = `${att.kind.toUpperCase()}: ${att.name}`;
            attWrap.appendChild(pill);
          }
          evCard.appendChild(attWrap);
        }
      }
      evScroll.appendChild(evCard);
    }
    evSection.appendChild(evScroll);
    body.appendChild(evSection);
  }

  const tosBox = document.createElement('p');
  tosBox.className = 'mod-ban-tos';
  tosBox.textContent = REDSHIFT_TOS_REMINDER;
  body.appendChild(tosBox);
  card.appendChild(body);

  const footer = document.createElement('div');
  footer.className = 'mod-ban-footer';

  let closed = false;
  const closeModal = () => {
    if (closed) return;
    closed = true;
    backdrop.classList.remove('modal-backdrop--visible');
    window.setTimeout(() => backdrop.remove(), 180);
  };

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn-secondary';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => {
    closeModal();
    options.onClose();
  });

  const appealBtn = document.createElement('button');
  appealBtn.type = 'button';
  appealBtn.className = 'btn-primary';
  appealBtn.textContent = 'Appeal';
  appealBtn.addEventListener('click', () => {
    closeModal();
    options.onAppeal(options.payload);
  });

  footer.appendChild(closeBtn);
  footer.appendChild(appealBtn);
  card.appendChild(footer);

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => {
    if (!closed) backdrop.classList.add('modal-backdrop--visible');
  });

  return closeModal;
}

export function openAppealScreen(options: {
  initialPayload?: ModeratedAccountPayload;
  onDone?: () => void;
}): void {
  if (options.initialPayload) {
    saveModeratedAccountForAppeal(options.initialPayload);
  }
  let accountsList = getSavedModeratedAccounts();
  let selectedUsername =
    options.initialPayload?.account.username.toLowerCase() ??
    accountsList[0]?.account.username.toLowerCase() ??
    '';

  const shell = createImmersiveAuthShell({
    onBeforeBack: async () =>
      openConfirmPopup({
        title: 'Leave Appeal Screen?',
        message: 'Are you sure you want to go back? Any appeal text you typed will be lost.',
        confirmLabel: 'Discard & Go Back',
        danger: true,
      }),
    onDestroy: () => {
      options.onDone?.();
    },
  });

  const heading = document.createElement('h2');
  heading.className = 'mod-screen-heading';
  heading.textContent = 'Appeal Account Moderation';
  shell.card.appendChild(heading);

  const sub = document.createElement('p');
  sub.className = 'mod-screen-subtitle';
  sub.textContent =
    'Select the suspended or terminated account you are appealing and explain why your moderation should be reconsidered.';
  shell.card.appendChild(sub);

  const form = document.createElement('form');
  form.className = 'mod-screen-form';
  form.noValidate = true;

  // Scrollable list of currently suspended accounts
  const pickerGroup = document.createElement('div');
  pickerGroup.className = 'mod-field-group';
  const pickerLabelRow = document.createElement('div');
  pickerLabelRow.className = 'mod-evidence-picker-header';
  const pickerLabel = document.createElement('label');
  pickerLabel.className = 'mod-field-label';
  pickerLabel.textContent = 'Select a Suspended / Terminated Account';
  const addOtherBtn = document.createElement('button');
  addOtherBtn.type = 'button';
  addOtherBtn.className = 'text-link-btn';
  addOtherBtn.textContent = '+ Add Another Account';
  pickerLabelRow.appendChild(pickerLabel);
  pickerLabelRow.appendChild(addOtherBtn);
  pickerGroup.appendChild(pickerLabelRow);

  const accountScroll = document.createElement('div');
  accountScroll.className = 'mod-appeal-account-list';
  pickerGroup.appendChild(accountScroll);

  const addOtherBox = document.createElement('div');
  addOtherBox.className = 'mod-appeal-add-box';
  addOtherBox.hidden = true;
  const addIdInput = document.createElement('input');
  addIdInput.type = 'text';
  addIdInput.className = 'auth-input';
  addIdInput.placeholder = 'Username or email';
  const addPwInput = document.createElement('input');
  addPwInput.type = 'password';
  addPwInput.className = 'auth-input';
  addPwInput.placeholder = 'Password';
  const addSubmitBtn = document.createElement('button');
  addSubmitBtn.type = 'button';
  addSubmitBtn.className = 'btn-secondary';
  addSubmitBtn.textContent = 'Verify Account';
  const addErr = document.createElement('div');
  addErr.className = 'mod-form-feedback mod-form-feedback--error';
  addErr.hidden = true;
  addOtherBox.appendChild(addIdInput);
  addOtherBox.appendChild(addPwInput);
  addOtherBox.appendChild(addSubmitBtn);
  addOtherBox.appendChild(addErr);
  pickerGroup.appendChild(addOtherBox);

  form.appendChild(pickerGroup);

  const renderAccountList = () => {
    accountScroll.replaceChildren();
    if (accountsList.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'mod-evidence-empty';
      empty.textContent = 'No suspended accounts found on this device. Click "+ Add Another Account" above to verify one.';
      accountScroll.appendChild(empty);
      return;
    }
    for (const entry of accountsList) {
      const uKey = entry.account.username.toLowerCase();
      const isSelected = uKey === selectedUsername;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = isSelected
        ? 'mod-appeal-account-row mod-appeal-account-row--active'
        : 'mod-appeal-account-row';

      const info = document.createElement('div');
      info.className = 'mod-appeal-account-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'mod-appeal-account-name';
      setDisplayNameWithRoleBadge(nameEl, entry.account.displayName, { username: entry.account.username });
      const metaEl = document.createElement('div');
      metaEl.className = 'mod-appeal-account-meta';
      const statusLabel =
        entry.moderation.status === 'terminated'
          ? 'Terminated'
          : `Suspended (${entry.moderation.durationLabel || 'Temporary'})`;
      metaEl.textContent = `@${entry.account.username} · ${statusLabel} · ${entry.moderation.reason}`;
      info.appendChild(nameEl);
      info.appendChild(metaEl);

      const pill = document.createElement('span');
      pill.className = isSelected ? 'mod-appeal-radio mod-appeal-radio--checked' : 'mod-appeal-radio';
      pill.textContent = isSelected ? 'Selected' : 'Select';

      btn.appendChild(info);
      btn.appendChild(pill);
      btn.addEventListener('click', () => {
        selectedUsername = uKey;
        renderAccountList();
      });
      accountScroll.appendChild(btn);
    }
  };
  renderAccountList();

  addOtherBtn.addEventListener('click', () => {
    addOtherBox.hidden = !addOtherBox.hidden;
    addErr.hidden = true;
  });

  addSubmitBtn.addEventListener('click', async () => {
    addErr.hidden = true;
    addSubmitBtn.disabled = true;
    addSubmitBtn.textContent = 'Verifying...';
    const res = await apiVerifyModeratedAccount(addIdInput.value.trim(), addPwInput.value);
    addSubmitBtn.disabled = false;
    addSubmitBtn.textContent = 'Verify Account';
    if (!res.ok || !res.payload) {
      addErr.textContent = res.error ?? 'Could not verify suspended account.';
      addErr.hidden = false;
      return;
    }
    saveModeratedAccountForAppeal(res.payload);
    accountsList = getSavedModeratedAccounts();
    selectedUsername = res.payload.account.username.toLowerCase();
    addIdInput.value = '';
    addPwInput.value = '';
    addOtherBox.hidden = true;
    renderAccountList();
  });

  // Details textarea
  const detailsGroup = document.createElement('div');
  detailsGroup.className = 'mod-field-group';
  const detailsLabel = document.createElement('label');
  detailsLabel.className = 'mod-field-label';
  detailsLabel.textContent = 'Give details about what you need to appeal to';
  const detailsInput = document.createElement('textarea');
  detailsInput.className = 'auth-input mod-textarea';
  detailsInput.rows = 6;
  detailsInput.maxLength = 3000;
  detailsInput.placeholder = 'Explain clearly why you believe this moderation decision should be reviewed...';
  detailsGroup.appendChild(detailsLabel);
  detailsGroup.appendChild(detailsInput);
  form.appendChild(detailsGroup);

  const feedback = document.createElement('div');
  feedback.className = 'mod-form-feedback';
  feedback.hidden = true;
  form.appendChild(feedback);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn-primary mod-submit-btn';
  submitBtn.textContent = 'Submit Appeal';
  form.appendChild(submitBtn);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    feedback.hidden = true;
    const chosen = accountsList.find((a) => a.account.username.toLowerCase() === selectedUsername);
    if (!chosen) {
      feedback.textContent = 'Please select a suspended or terminated account first.';
      feedback.className = 'mod-form-feedback mod-form-feedback--error';
      feedback.hidden = false;
      return;
    }
    const details = detailsInput.value.trim();
    if (details.length < 5) {
      feedback.textContent = 'Please provide details about your appeal before submitting.';
      feedback.className = 'mod-form-feedback mod-form-feedback--error';
      feedback.hidden = false;
      return;
    }
    const confirmed = await openConfirmPopup({
      title: 'Submit Appeal?',
      message: `Are you sure you want to submit this appeal for @${chosen.account.username}? Redshift staff will review your request.`,
      confirmLabel: 'Submit Appeal',
    });
    if (!confirmed) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting Appeal...';
    const res = await apiSubmitAppeal({
      username: chosen.account.username,
      appealToken: chosen.appealToken,
      details,
    });
    if (!res.ok) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Appeal';
      feedback.textContent = res.error ?? 'Error: Could not submit appeal.';
      feedback.className = 'mod-form-feedback mod-form-feedback--error';
      feedback.hidden = false;
      return;
    }
    feedback.textContent = `Appeal submitted (${res.ticketId || 'Sent'}). Staff will review it shortly.`;
    feedback.className = 'mod-form-feedback mod-form-feedback--ok';
    feedback.hidden = false;
    window.setTimeout(() => {
      shell.closeNow();
    }, 1100);
  });

  shell.card.appendChild(form);
}
