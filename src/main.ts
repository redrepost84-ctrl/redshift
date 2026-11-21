import '@exis9/jdecked-twemoji/twemoji.min.css';
import './style.css';

import picture1Url from '../Textures/Profiles/Picture1.png';
import picture2Url from '../Textures/Profiles/Picture2.png';
import picture3Url from '../Textures/Profiles/Picture3.png';
import picture4Url from '../Textures/Profiles/Picture4.png';
import {
  apiAcceptFriendRequest,
  apiCancelFriendRequest,
  apiCloseDm,
  autoDiscoverWorldwideServer,
  apiDeclineFriendRequest,
  apiHideThread,
  apiLeaveGroupDm,
  apiResolveGifLink,
  apiSendFriendRequest,
  apiUnblockUser,
  extractGifShareCodeFromText,
  apiCompleteReset,
  apiDeleteDmMessage,
  apiEditDmMessage,
  apiFetchDmHistory,
  apiForgotPassword,
  apiMarkDmRead,
  apiOpenDm,
  apiResumeSession,
  apiSendDmMessage,
  apiSignIn,
  apiSignOut,
  apiSignUp,
  apiToggleAttachmentSpoiler,
  apiToggleDmReaction,
  apiToggleFavoriteGif,
  apiTogglePinMessage,
  apiUploadAttachment,
  apiVerifyResetCode,
  type ThreadTarget,
  classifyFileKind,
  clearSessionToken,
  connectSocialSocket,
  formatFileSize,
  getEstimatedServerNow,
  hasStoredSessionToken,
  isEmailFormat,
  MAX_UPLOAD_BYTES,
  resolveMediaUrl,
  setApiServerBaseUrl,
  type SocialSocketHandle,
  validateAvatarFile,
  validatePasswordPair,
  validateResetCodeFormat,
  validateSignInInputs,
  validateSignUpAccountInputs,
} from './apiClient';
import {
  attachImageDropZone,
  confirmFriendRelationAction,
  createAudioIconSvg,
  createChatMessageElement,
  createCloseIconSvg,
  createDateDivider,
  createEmojiIconSvg,
  createFileIconSvg,
  createGifIconSvg,
  createImageDropOverlay,
  createMembersIconSvg,
  createMoreVerticalSvg,
  createNewMessagesDivider,
  createPinIconSvg,
  createPlusIconSvg,
  createSendIconSvg,
  createSettingsGearSvg,
  createVideoIconSvg,
  insertTextAtCursor,
  openConfirmPopup,
  playNotificationChime,
} from './chatUi';
import {
  closeChangelogModal,
  createHeaderUpdateAvailableButton,
  maybeShowPostUpdateChangelog,
  notifyHeaderUpdateAvailable,
} from './changelogModal';
import { formatCustomStatusLine, openSetCustomStatusModal } from './customStatusModal';
import { getDesktopBridge } from './desktopBridge';
import {
  createMobileBackArrowSvg,
  createMobileBottomNav,
  createMobileYouView,
  type MobileHubTab,
} from './mobileNav';
import {
  attachPushNotificationNavigation,
  registerRedshiftServiceWorker,
  syncExistingPushSubscriptionIfPermitted,
} from './pushNotifications';
import {
  createDmProfilePanel,
  createProfilePanelToggleIconSvg,
  openPublicProfileModal,
  syncOpenPublicProfileModals,
} from './dmProfilePanel';
import { attachEmojiAutocomplete } from './emojiAutocomplete';
import { replaceEmojiShortcodeBeforeCursor } from './emojiCatalog';
import {
  createGroupMembersPanel,
  openAddFriendsToGroupModal,
  openCreateGroupDmModal,
  openGroupSettingsModal,
  resolveGroupAvatar,
} from './groupDmModals';
import {
  dispatchRedshiftNotification,
  ensureNotificationPermissionOnGesture,
  isAppWindowFocused,
  truncateNotificationText,
} from './notifications';
import {
  closeActivePinnedPopover,
  isPinnedPopoverOpenFor,
  openPinnedMessagesPopover,
} from './pinnedMessagesPopover';
import {
  closeActiveSearchPopover,
  isSearchPopoverOpenFor,
  openDmSearchPopover,
} from './dmSearchPopover';
import { setTwemojiText } from './twemojiHelper';
import {
  createFriendsIconSvg,
  renderFriendsPanel,
  type FriendsPanelHandle,
} from './friendsView';
import {
  createProfileDrawerController,
  createStatusGlyph,
  getLockedOptimisticSelfCustomStatus,
  getLockedOptimisticSelfStatus,
  openSelfProfileModal,
  type SelfProfileModalHandle,
} from './profileDrawer';
import { getUserPreferences, subscribeUserPreferences } from './settingsStore';
import {
  createHeadphonesIconSvg,
  createMicIconSvg,
  createPhoneCallIconSvg,
  createSearchIconSvg,
} from './voiceAudio';
import { createVoiceManager } from './voiceManager';
import {
  attachGlobalEditableContextMenu,
  buildMuteMenuEntries,
  type ContextMenuItem,
  copyToClipboard,
  createMenuIconSvg,
  openContextMenu,
} from './contextMenu';
import {
  formatMuteRemaining,
  getThreadMuteUntil,
  getThreadNotificationMode,
  shouldNotifyForThreadMessage,
} from './muteUtils';
import { containsSelfMention } from './markdownRenderer';
import { attachMentionAutocomplete } from './mentionAutocomplete';
import type { VoiceNoteRecorderSession } from './voiceNoteRecorder';

// Lazy-loaded heavy overlay & picker module caches for bundle code-splitting
type EmojiPickerModule = typeof import('./emojiPicker');
type GifPickerModule = typeof import('./gifPicker');
let cachedEmojiPickerMod: EmojiPickerModule | null = null;
let cachedGifPickerMod: GifPickerModule | null = null;

function closeActiveEmojiPicker(): void {
  cachedEmojiPickerMod?.closeActiveEmojiPicker();
}
function isEmojiPickerOpenFor(el: HTMLElement): boolean {
  return cachedEmojiPickerMod ? cachedEmojiPickerMod.isEmojiPickerOpenFor(el) : false;
}
function openEmojiPickerLazy(opts: Parameters<EmojiPickerModule['openEmojiPicker']>[0]): void {
  void import('./emojiPicker').then((mod) => {
    cachedEmojiPickerMod = mod;
    mod.openEmojiPicker(opts);
  });
}

function closeActiveGifPicker(): void {
  cachedGifPickerMod?.closeActiveGifPicker();
}
function isGifPickerOpenFor(el: HTMLElement): boolean {
  return cachedGifPickerMod ? cachedGifPickerMod.isGifPickerOpenFor(el) : false;
}
function openGifPickerLazy(opts: Parameters<GifPickerModule['openGifPicker']>[0]): void {
  void import('./gifPicker').then((mod) => {
    cachedGifPickerMod = mod;
    mod.openGifPicker(opts);
  });
}
import type {
  AttachmentKind,
  AuthScreen,
  ChatMessage,
  CustomStatusData,
  DmAttachment,
  DmReadReceipt,
  EffectiveStatus,
  FriendsTab,
  GifItem,
  GroupDmInfo,
  MainWorkspaceView,
  MessageReaction,
  MessageReplyRef,
  PublicProfile,
  ResetSession,
  SignUpDraft,
  SocialSnapshot,
  StatusReplyRef,
  UserStatus,
  VcStateEventPayload,
  VoiceNoteMeta,
} from './types';

const PRESET_AVATARS = [picture1Url, picture2Url, picture3Url, picture4Url];
const RESEND_COOLDOWN_SECONDS = 25;

interface AppState {
  screen: AuthScreen;
  snapshot: SocialSnapshot | null;
  mainView: MainWorkspaceView;
  friendsTab: FriendsTab;
  activeDmUsername: string | null;
  activeGroupId: string | null;
  showDmProfilePanel: boolean;
  showGroupMembersPanel: boolean;
  isBusy: boolean;
  loginIdentifier: string;
  loginPassword: string;
  loginRememberMe: boolean;
  loginError: string | null;
  loginSuccess: string | null;
  signupDraft: SignUpDraft;
  signupError: string | null;
  forgotEmailDraft: string;
  forgotCodeDraft: string;
  forgotNewPassword: string;
  forgotConfirmPassword: string;
  forgotError: string | null;
  forgotSuccess: string | null;
  resetSession: ResetSession | null;
}

function createInitialDraft(): SignUpDraft {
  return {
    username: '',
    email: '',
    confirmEmail: '',
    password: '',
    confirmPassword: '',
    selectedPresetIndex: 0,
    avatarUrl: PRESET_AVATARS[0],
  };
}

const state: AppState = {
  screen: 'login',
  snapshot: null,
  mainView: 'friends',
  friendsTab: 'online',
  activeDmUsername: null,
  activeGroupId: null,
  showDmProfilePanel: true,
  showGroupMembersPanel: true,
  isBusy: false,
  loginIdentifier: '',
  loginPassword: '',
  loginRememberMe: true,
  loginError: null,
  loginSuccess: null,
  signupDraft: createInitialDraft(),
  signupError: null,
  forgotEmailDraft: '',
  forgotCodeDraft: '',
  forgotNewPassword: '',
  forgotConfirmPassword: '',
  forgotError: null,
  forgotSuccess: null,
  resetSession: null,
};

let resendIntervalId: number | null = null;
let activeResendButton: HTMLButtonElement | null = null;
let activeWorkspaceCleanup: (() => void) | null = null;
let resetRequestSeq = 0;

function stopResendTimer(): void {
  if (resendIntervalId !== null) {
    window.clearInterval(resendIntervalId);
    resendIntervalId = null;
  }
  activeResendButton = null;
}

function startResendTimer(): void {
  stopResendTimer();
  if (!state.resetSession) {
    return;
  }

  resendIntervalId = window.setInterval(() => {
    if (!state.resetSession) {
      stopResendTimer();
      return;
    }

    if (state.resetSession.resendSecondsRemaining > 0) {
      state.resetSession.resendSecondsRemaining -= 1;
      syncResendButton();
    }

    if (state.resetSession.resendSecondsRemaining <= 0) {
      stopResendTimer();
    }
  }, 1000);
}

function syncResendButton(): void {
  if (!activeResendButton || !state.resetSession) {
    return;
  }
  const remaining = state.resetSession.resendSecondsRemaining;
  if (state.isBusy) {
    activeResendButton.disabled = true;
    activeResendButton.textContent =
      remaining > 0 ? `Resend Email (${remaining}s)` : 'Resend Email';
    return;
  }
  if (remaining > 0) {
    activeResendButton.textContent = `Resend Email (${remaining}s)`;
    activeResendButton.disabled = true;
  } else {
    activeResendButton.textContent = 'Resend Email';
    activeResendButton.disabled = false;
  }
}

function createSvgIcon(paths: string[], viewBox = '0 0 24 24', size = 20): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  for (const d of paths) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }

  return svg;
}

function createBackButton(onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'back-btn';
  btn.setAttribute('aria-label', 'Go back');
  btn.appendChild(createSvgIcon(['M19 12H5', 'M12 19l-7-7 7-7']));
  const label = document.createElement('span');
  label.className = 'back-btn-label';
  label.textContent = 'Back';
  btn.appendChild(label);
  btn.addEventListener('click', onClick);
  return btn;
}

function appendAuthBackFooter(shell: HTMLElement, text: string, onClick: () => void): void {
  const row = document.createElement('div');
  row.className = 'link-row auth-back-row';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'text-link-btn auth-back-inline-btn';
  btn.textContent = `← ${text}`;
  btn.addEventListener('click', onClick);
  row.appendChild(btn);
  shell.appendChild(row);
}

function createHeader(subtitle: string): DocumentFragment {
  const frag = document.createDocumentFragment();

  const title = document.createElement('h1');
  title.className = 'brand-title';
  title.textContent = 'Redshift';
  frag.appendChild(title);

  if (subtitle) {
    const sub = document.createElement('p');
    sub.className = 'auth-subtitle';
    sub.textContent = subtitle;
    frag.appendChild(sub);
  }

  return frag;
}

function createInput(options: {
  type?: string;
  placeholder: string;
  value: string;
  autocomplete?: string;
  hasError?: boolean;
  extraClass?: string;
  onInput: (val: string) => void;
}): { wrapper: HTMLDivElement; input: HTMLInputElement } {
  const wrapper = document.createElement('div');
  wrapper.className = 'field-group';

  const input = document.createElement('input');
  input.type = options.type ?? 'text';
  input.className = 'auth-input';
  if (options.hasError) {
    input.classList.add('auth-input--error');
  }
  if (options.extraClass) {
    input.classList.add(options.extraClass);
  }
  input.placeholder = options.placeholder;
  input.value = options.value;
  if (options.autocomplete) {
    input.autocomplete = options.autocomplete as AutoFill;
  }

  input.addEventListener('input', () => options.onInput(input.value));
  wrapper.appendChild(input);

  if (options.type === 'password') {
    input.classList.add('auth-input--with-toggle');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'password-toggle';
    toggle.setAttribute('aria-label', 'Show password');
    toggle.tabIndex = -1;

    const renderEye = (visible: boolean) => {
      toggle.replaceChildren(
        visible
          ? createSvgIcon(
              [
                'M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.77 21.77 0 0 1 5.06-6.94',
                'M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-2.16 3.19',
                'M1 1l22 22',
              ],
              '0 0 24 24',
              17,
            )
          : createSvgIcon(
              [
                'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z',
                'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
              ],
              '0 0 24 24',
              17,
            ),
      );
    };

    renderEye(false);
    toggle.addEventListener('click', () => {
      const nextVisible = input.type === 'password';
      input.type = nextVisible ? 'text' : 'password';
      toggle.setAttribute('aria-label', nextVisible ? 'Hide password' : 'Show password');
      renderEye(nextVisible);
    });

    wrapper.appendChild(toggle);
  }

  return { wrapper, input };
}

function createFeedbackBanner(message: string, kind: 'error' | 'success'): HTMLDivElement {
  const banner = document.createElement('div');
  banner.className = `feedback-banner feedback-banner--${kind}`;
  banner.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  banner.textContent = message;
  return banner;
}

function createFeedbackSlot(error: string | null, success: string | null = null): HTMLDivElement {
  const slot = document.createElement('div');
  slot.dataset.feedbackSlot = 'true';
  if (error) {
    slot.appendChild(createFeedbackBanner(error, 'error'));
  } else if (success) {
    slot.appendChild(createFeedbackBanner(success, 'success'));
  }
  return slot;
}

function createPrimaryButton(label: string, type: 'submit' | 'button' = 'submit'): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = type;
  btn.className = 'btn-primary';
  btn.textContent = label;
  return btn;
}

function syncInlineFeedback(container: HTMLElement): void {
  const slot = container.querySelector('[data-feedback-slot="true"]');
  if (slot) {
    slot.replaceChildren();
  }
  const erroredInputs = container.querySelectorAll('.auth-input--error');
  erroredInputs.forEach((el) => el.classList.remove('auth-input--error'));
}

function navigate(nextScreen: AuthScreen): void {
  if (nextScreen !== 'forgot-code') {
    stopResendTimer();
  }
  if (nextScreen === 'app') {
    state.mainView = 'friends';
    state.friendsTab = 'online';
    state.activeDmUsername = null;
  } else {
    clearSessionToken();
    state.snapshot = null;
  }
  state.isBusy = false;
  state.screen = nextScreen;
  render();
}

async function startResetFlow(email: string): Promise<void> {
  const seq = ++resetRequestSeq;
  state.isBusy = true;
  state.forgotError = null;
  state.forgotSuccess = null;
  render();

  const res = await apiForgotPassword(email);
  if (seq !== resetRequestSeq) {
    return;
  }

  state.isBusy = false;
  if (!res.ok) {
    state.forgotEmailDraft = email;
    state.forgotError = res.error ?? 'Error: Could not send verification email';
    navigate('forgot-email');
    return;
  }

  state.resetSession = {
    email,
    resendSecondsRemaining: res.cooldownSeconds ?? RESEND_COOLDOWN_SECONDS,
  };
  state.forgotCodeDraft = '';
  state.forgotNewPassword = '';
  state.forgotConfirmPassword = '';
  state.forgotError = null;
  state.forgotSuccess = null;
  navigate('forgot-code');
  startResendTimer();
}

function renderLoginScreen(shell: HTMLElement): void {
  shell.appendChild(createHeader('Sign in'));

  const form = document.createElement('form');
  form.className = 'auth-form';
  form.noValidate = true;

  const identifierField = createInput({
    placeholder: 'Username or email',
    value: state.loginIdentifier,
    autocomplete: 'username',
    hasError: Boolean(state.loginError),
    onInput: (val) => {
      state.loginIdentifier = val;
      if (state.loginError || state.loginSuccess) {
        state.loginError = null;
        state.loginSuccess = null;
        syncInlineFeedback(form);
      }
    },
  });

  const passwordField = createInput({
    type: 'password',
    placeholder: 'Password',
    value: state.loginPassword,
    autocomplete: 'current-password',
    hasError: Boolean(state.loginError),
    onInput: (val) => {
      state.loginPassword = val;
      if (state.loginError || state.loginSuccess) {
        state.loginError = null;
        state.loginSuccess = null;
        syncInlineFeedback(form);
      }
    },
  });

  form.appendChild(identifierField.wrapper);
  form.appendChild(passwordField.wrapper);

  const rememberRow = document.createElement('label');
  rememberRow.className = 'auth-remember-row';
  const rememberCheck = document.createElement('input');
  rememberCheck.type = 'checkbox';
  rememberCheck.className = 'auth-remember-check';
  rememberCheck.checked = state.loginRememberMe;
  rememberCheck.addEventListener('change', () => {
    state.loginRememberMe = rememberCheck.checked;
  });
  const rememberText = document.createElement('span');
  rememberText.textContent = 'Keep me signed in';
  rememberRow.appendChild(rememberCheck);
  rememberRow.appendChild(rememberText);
  form.appendChild(rememberRow);

  form.appendChild(createFeedbackSlot(state.loginError, state.loginSuccess));

  const submitBtn = createPrimaryButton(state.isBusy ? 'Signing in...' : 'Sign in');
  submitBtn.disabled = state.isBusy;
  form.appendChild(submitBtn);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.isBusy) {
      return;
    }

    const localCheck = validateSignInInputs(state.loginIdentifier, state.loginPassword);
    if (!localCheck.ok) {
      state.loginError = localCheck.error ?? 'Error: Could not sign in';
      state.loginSuccess = null;
      render();
      return;
    }

    state.isBusy = true;
    state.loginError = null;
    state.loginSuccess = null;
    render();

    const res = await apiSignIn(
      state.loginIdentifier,
      state.loginPassword,
      state.loginRememberMe,
    );
    state.isBusy = false;

    if (!res.ok || !res.snapshot) {
      state.loginError = res.error ?? 'Error: Could not sign in';
      state.loginSuccess = null;
      render();
      return;
    }

    state.snapshot = res.snapshot;
    state.loginPassword = '';
    state.loginError = null;
    state.loginSuccess = null;
    navigate('app');
  });

  shell.appendChild(form);

  const linkRow = document.createElement('div');
  linkRow.className = 'link-row';

  const forgotBtn = document.createElement('button');
  forgotBtn.type = 'button';
  forgotBtn.className = 'text-link-btn';
  forgotBtn.disabled = state.isBusy;
  forgotBtn.textContent = state.isBusy ? 'Sending email...' : 'Forgot password?';
  forgotBtn.addEventListener('click', () => {
    if (state.isBusy) {
      return;
    }
    state.loginError = null;
    state.loginSuccess = null;
    const raw = state.loginIdentifier.trim();

    if (raw) {
      if (raw.includes('@') && isEmailFormat(raw)) {
        state.forgotEmailDraft = raw;
        void startResetFlow(raw);
        return;
      }

      state.forgotEmailDraft = raw;
      if (raw.includes('@')) {
        state.forgotError = 'Error: Invalid email format';
      } else {
        state.forgotError = 'Error: Enter the email associated with your account';
      }
    } else {
      state.forgotEmailDraft = '';
      state.forgotError = null;
    }

    state.forgotSuccess = null;
    navigate('forgot-email');
  });

  const signUpBtn = document.createElement('button');
  signUpBtn.type = 'button';
  signUpBtn.className = 'text-link-btn';
  signUpBtn.textContent = 'Sign up';
  signUpBtn.addEventListener('click', () => {
    state.loginError = null;
    state.loginSuccess = null;
    state.signupDraft = createInitialDraft();
    state.signupError = null;
    navigate('signup-account');
  });

  linkRow.appendChild(forgotBtn);
  linkRow.appendChild(signUpBtn);
  shell.appendChild(linkRow);
}

function renderSignUpAccountScreen(root: HTMLElement, shell: HTMLElement): void {
  root.appendChild(
    createBackButton(() => {
      state.signupError = null;
      navigate('login');
    }),
  );

  shell.appendChild(createHeader('Create an account'));

  const form = document.createElement('form');
  form.className = 'auth-form';
  form.noValidate = true;

  const usernameField = createInput({
    placeholder: 'Username',
    value: state.signupDraft.username,
    autocomplete: 'username',
    hasError: Boolean(state.signupError),
    onInput: (val) => {
      state.signupDraft.username = val;
      if (state.signupError) {
        state.signupError = null;
        syncInlineFeedback(form);
      }
    },
  });

  const emailField = createInput({
    type: 'email',
    placeholder: 'Email',
    value: state.signupDraft.email,
    autocomplete: 'email',
    hasError: Boolean(state.signupError),
    onInput: (val) => {
      state.signupDraft.email = val;
      if (state.signupError) {
        state.signupError = null;
        syncInlineFeedback(form);
      }
    },
  });

  const confirmEmailField = createInput({
    type: 'email',
    placeholder: 'Confirm Email',
    value: state.signupDraft.confirmEmail,
    autocomplete: 'email',
    hasError: Boolean(state.signupError),
    onInput: (val) => {
      state.signupDraft.confirmEmail = val;
      if (state.signupError) {
        state.signupError = null;
        syncInlineFeedback(form);
      }
    },
  });

  form.appendChild(usernameField.wrapper);
  form.appendChild(emailField.wrapper);
  form.appendChild(confirmEmailField.wrapper);
  form.appendChild(createFeedbackSlot(state.signupError));
  form.appendChild(createPrimaryButton('Proceed'));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const result = validateSignUpAccountInputs(
      state.signupDraft.username,
      state.signupDraft.email,
      state.signupDraft.confirmEmail,
    );
    if (!result.ok) {
      state.signupError = result.error ?? 'Error: Invalid account details';
      render();
      return;
    }

    state.signupError = null;
    navigate('signup-password');
  });

  shell.appendChild(form);
  appendAuthBackFooter(shell, 'Back to sign in', () => {
    state.signupError = null;
    navigate('login');
  });
}

function renderSignUpPasswordScreen(root: HTMLElement, shell: HTMLElement): void {
  root.appendChild(
    createBackButton(() => {
      state.signupError = null;
      navigate('signup-account');
    }),
  );

  shell.appendChild(createHeader('Create a password'));

  const form = document.createElement('form');
  form.className = 'auth-form';
  form.noValidate = true;

  const passwordField = createInput({
    type: 'password',
    placeholder: 'Password',
    value: state.signupDraft.password,
    autocomplete: 'new-password',
    hasError: Boolean(state.signupError),
    onInput: (val) => {
      state.signupDraft.password = val;
      if (state.signupError) {
        state.signupError = null;
        syncInlineFeedback(form);
      }
    },
  });

  const confirmPasswordField = createInput({
    type: 'password',
    placeholder: 'Confirm password',
    value: state.signupDraft.confirmPassword,
    autocomplete: 'new-password',
    hasError: Boolean(state.signupError),
    onInput: (val) => {
      state.signupDraft.confirmPassword = val;
      if (state.signupError) {
        state.signupError = null;
        syncInlineFeedback(form);
      }
    },
  });

  form.appendChild(passwordField.wrapper);
  form.appendChild(confirmPasswordField.wrapper);
  form.appendChild(createFeedbackSlot(state.signupError));
  form.appendChild(createPrimaryButton('Proceed'));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const result = validatePasswordPair(
      state.signupDraft.password,
      state.signupDraft.confirmPassword,
    );
    if (!result.ok) {
      state.signupError = result.error ?? 'Error: Invalid password';
      render();
      return;
    }

    state.signupError = null;
    navigate('signup-avatar');
  });

  shell.appendChild(form);
  appendAuthBackFooter(shell, 'Back', () => {
    state.signupError = null;
    navigate('signup-account');
  });
}

function resizeAvatarImage(img: HTMLImageElement, size = 256): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  const minSide = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
  if (minSide <= 0) {
    return null;
  }

  const sx = ((img.naturalWidth || img.width) - minSide) / 2;
  const sy = ((img.naturalHeight || img.height) - minSide) / 2;
  ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
  return canvas.toDataURL('image/png');
}

function resolveProfileAvatar(profile: {
  avatarPreset: number | null;
  avatarDataUrl?: string;
}): string {
  if (profile.avatarDataUrl) {
    return resolveMediaUrl(profile.avatarDataUrl);
  }
  const index = profile.avatarPreset ?? 0;
  return PRESET_AVATARS[index] ?? PRESET_AVATARS[0];
}

function renderSignUpAvatarScreen(root: HTMLElement, shell: HTMLElement): void {
  root.appendChild(
    createBackButton(() => {
      state.signupError = null;
      navigate('signup-password');
    }),
  );

  shell.appendChild(createHeader(''));

  const heading = document.createElement('p');
  heading.className = 'avatar-heading';
  heading.textContent = 'Choose a profile picture';
  shell.appendChild(heading);

  const previewWrap = document.createElement('div');
  previewWrap.className = 'avatar-preview-wrap';

  const previewCircle = document.createElement('div');
  previewCircle.className = 'avatar-preview-circle';

  const previewImg = document.createElement('img');
  previewImg.className = 'avatar-preview-img';
  previewImg.src = state.signupDraft.avatarUrl;
  previewImg.alt = 'Selected profile picture';
  previewCircle.appendChild(previewImg);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.hidden = true;

  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.className = 'avatar-upload-btn';
  uploadBtn.setAttribute('aria-label', 'Upload custom profile picture');
  uploadBtn.textContent = '+';
  uploadBtn.addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });

  previewWrap.appendChild(previewCircle);
  previewWrap.appendChild(uploadBtn);
  previewWrap.appendChild(fileInput);
  shell.appendChild(previewWrap);

  const presetsGrid = document.createElement('div');
  presetsGrid.className = 'avatar-presets-grid';

  const presetButtons: HTMLButtonElement[] = [];

  PRESET_AVATARS.forEach((url, index) => {
    const presetBtn = document.createElement('button');
    presetBtn.type = 'button';
    presetBtn.className = 'avatar-preset-btn';
    if (state.signupDraft.selectedPresetIndex === index) {
      presetBtn.classList.add('avatar-preset-btn--active');
    }
    presetBtn.setAttribute('aria-label', `Profile picture ${index + 1}`);

    const img = document.createElement('img');
    img.className = 'avatar-preset-img';
    img.src = url;
    img.alt = `Profile preset ${index + 1}`;
    presetBtn.appendChild(img);

    presetBtn.addEventListener('click', () => {
      state.signupDraft.selectedPresetIndex = index;
      state.signupDraft.avatarUrl = url;
      state.signupError = null;
      previewImg.src = url;
      presetButtons.forEach((b, idx) => {
        b.classList.toggle('avatar-preset-btn--active', idx === index);
      });
      syncInlineFeedback(finishWrap);
    });

    presetButtons.push(presetBtn);
    presetsGrid.appendChild(presetBtn);
  });

  shell.appendChild(presetsGrid);

  const finishWrap = document.createElement('div');
  finishWrap.className = 'avatar-finish-wrap';
  finishWrap.appendChild(createFeedbackSlot(state.signupError));

  const handleSignUpAvatarFile = (file: File) => {
    const validation = validateAvatarFile(file);
    if (!validation.ok) {
      state.signupError = validation.error ?? 'Error: Invalid image file';
      render();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) {
        state.signupError = 'Error: Could not read selected image';
        render();
        return;
      }

      const probe = new Image();
      probe.onload = () => {
        const compactUrl = resizeAvatarImage(probe) ?? dataUrl;
        state.signupDraft.selectedPresetIndex = null;
        state.signupDraft.avatarUrl = compactUrl;
        state.signupError = null;
        previewImg.src = compactUrl;
        presetButtons.forEach((b) => b.classList.remove('avatar-preset-btn--active'));
        syncInlineFeedback(finishWrap);
      };
      probe.onerror = () => {
        state.signupError = 'Error: Selected file is not a valid image';
        render();
      };
      probe.src = dataUrl;
    };
    reader.onerror = () => {
      state.signupError = 'Error: Could not read selected image';
      render();
    };
    reader.readAsDataURL(file);
  };

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) {
      handleSignUpAvatarFile(file);
    }
  });

  const signupDropOverlay = createImageDropOverlay('Drop image to set avatar');
  shell.appendChild(signupDropOverlay);
  attachImageDropZone(shell, {
    overlayEl: signupDropOverlay,
    activeClass: 'auth-card--dragover',
    onFiles: (files) => {
      if (files[0]) {
        handleSignUpAvatarFile(files[0]);
      }
    },
  });

  const finishBtn = createPrimaryButton(
    state.isBusy ? 'Creating account...' : 'Finish Signing up',
    'button',
  );
  finishBtn.disabled = state.isBusy;
  finishBtn.addEventListener('click', async () => {
    if (state.isBusy) {
      return;
    }

    state.isBusy = true;
    state.signupError = null;
    render();

    const res = await apiSignUp({
      username: state.signupDraft.username,
      email: state.signupDraft.email,
      confirmEmail: state.signupDraft.confirmEmail,
      password: state.signupDraft.password,
      confirmPassword: state.signupDraft.confirmPassword,
      avatarPreset: state.signupDraft.selectedPresetIndex,
      avatarDataUrl:
        state.signupDraft.selectedPresetIndex === null ? state.signupDraft.avatarUrl : undefined,
    });

    state.isBusy = false;
    if (!res.ok || !res.snapshot) {
      state.signupError = res.error ?? 'Error: Could not complete sign up';
      render();
      return;
    }

    state.snapshot = res.snapshot;
    state.signupError = null;
    state.signupDraft = createInitialDraft();
    navigate('app');
  });
  finishWrap.appendChild(finishBtn);

  shell.appendChild(finishWrap);
  appendAuthBackFooter(shell, 'Back', () => {
    state.signupError = null;
    navigate('signup-password');
  });
}

function renderForgotEmailScreen(root: HTMLElement, shell: HTMLElement): void {
  root.appendChild(
    createBackButton(() => {
      resetRequestSeq += 1;
      state.forgotError = null;
      state.forgotSuccess = null;
      navigate('login');
    }),
  );

  shell.appendChild(createHeader('Reset password'));

  const desc = document.createElement('p');
  desc.className = 'auth-description';
  desc.textContent = 'Enter your account email to receive a 6-character reset code.';
  shell.appendChild(desc);

  const form = document.createElement('form');
  form.className = 'auth-form';
  form.noValidate = true;

  const emailField = createInput({
    type: 'email',
    placeholder: 'Email',
    value: state.forgotEmailDraft,
    autocomplete: 'email',
    hasError: Boolean(state.forgotError),
    onInput: (val) => {
      state.forgotEmailDraft = val;
      if (state.forgotError) {
        state.forgotError = null;
        syncInlineFeedback(form);
      }
    },
  });
  form.appendChild(emailField.wrapper);
  form.appendChild(createFeedbackSlot(state.forgotError));

  const sendBtn = createPrimaryButton(state.isBusy ? 'Sending...' : 'Send Code');
  sendBtn.disabled = state.isBusy;
  form.appendChild(sendBtn);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.isBusy) {
      return;
    }

    const trimmed = state.forgotEmailDraft.trim();
    if (!trimmed) {
      state.forgotError = 'Error: Email is required';
      render();
      return;
    }
    if (!isEmailFormat(trimmed)) {
      state.forgotError = 'Error: Invalid email format';
      render();
      return;
    }

    void startResetFlow(trimmed);
  });

  shell.appendChild(form);
  appendAuthBackFooter(shell, 'Back to sign in', () => {
    resetRequestSeq += 1;
    state.forgotError = null;
    state.forgotSuccess = null;
    navigate('login');
  });
}

function renderForgotCodeScreen(root: HTMLElement, shell: HTMLElement): void {
  if (!state.resetSession) {
    navigate('forgot-email');
    return;
  }

  const session = state.resetSession;

  root.appendChild(
    createBackButton(() => {
      resetRequestSeq += 1;
      state.forgotError = null;
      state.forgotSuccess = null;
      state.resetSession = null;
      navigate('login');
    }),
  );

  shell.appendChild(createHeader('Reset password'));

  const desc = document.createElement('p');
  desc.className = 'auth-description';
  desc.append('We sent an email to ');
  const emailSpan = document.createElement('strong');
  emailSpan.textContent = session.email;
  desc.appendChild(emailSpan);
  desc.append('. Please enter the 6 Number-Letter code combination (e.g., e7j39d).');
  shell.appendChild(desc);

  const form = document.createElement('form');
  form.className = 'auth-form';
  form.noValidate = true;

  const codeField = createInput({
    placeholder: '6-character code',
    value: state.forgotCodeDraft,
    extraClass: 'auth-input--code',
    hasError: Boolean(state.forgotError),
    onInput: (val) => {
      state.forgotCodeDraft = val;
      if (state.forgotError || state.forgotSuccess) {
        state.forgotError = null;
        state.forgotSuccess = null;
        syncInlineFeedback(form);
      }
    },
  });
  codeField.input.maxLength = 24;
  form.appendChild(codeField.wrapper);
  form.appendChild(createFeedbackSlot(state.forgotError, state.forgotSuccess));

  const buttonRow = document.createElement('div');
  buttonRow.className = 'button-row';

  const resendBtn = document.createElement('button');
  resendBtn.type = 'button';
  resendBtn.className = 'btn-secondary';
  activeResendButton = resendBtn;
  syncResendButton();

  resendBtn.addEventListener('click', async () => {
    if (!state.resetSession || state.resetSession.resendSecondsRemaining > 0 || state.isBusy) {
      return;
    }

    const seq = ++resetRequestSeq;
    const targetEmail = state.resetSession.email;
    state.isBusy = true;
    state.forgotError = null;
    state.forgotSuccess = null;
    render();

    const res = await apiForgotPassword(targetEmail);
    if (seq !== resetRequestSeq || !state.resetSession) {
      return;
    }

    state.isBusy = false;
    if (!res.ok) {
      if (typeof res.cooldownSeconds === 'number' && res.cooldownSeconds > 0) {
        state.resetSession.resendSecondsRemaining = res.cooldownSeconds;
        startResendTimer();
      }
      state.forgotError = res.error ?? 'Error: Could not resend email';
      render();
      return;
    }

    state.resetSession.resendSecondsRemaining = res.cooldownSeconds ?? RESEND_COOLDOWN_SECONDS;
    state.forgotCodeDraft = '';
    state.forgotError = null;
    state.forgotSuccess = `Sent a new verification code to ${targetEmail}.`;
    startResendTimer();
    render();
  });

  const confirmBtn = createPrimaryButton(state.isBusy ? 'Confirming...' : 'Confirm');
  confirmBtn.disabled = state.isBusy;

  buttonRow.appendChild(resendBtn);
  buttonRow.appendChild(confirmBtn);
  form.appendChild(buttonRow);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.resetSession || state.isBusy) {
      return;
    }

    const formatCheck = validateResetCodeFormat(state.forgotCodeDraft);
    if (!formatCheck.ok) {
      state.forgotError = formatCheck.error ?? 'Error: Invalid verification code';
      state.forgotSuccess = null;
      render();
      return;
    }

    const seq = ++resetRequestSeq;
    const targetEmail = state.resetSession.email;
    const candidateCode = state.forgotCodeDraft;
    state.isBusy = true;
    state.forgotError = null;
    state.forgotSuccess = null;
    render();

    const result = await apiVerifyResetCode(targetEmail, candidateCode);
    if (seq !== resetRequestSeq || !state.resetSession) {
      return;
    }

    state.isBusy = false;
    if (!result.ok || !result.resetProofToken) {
      state.forgotError = result.error ?? 'Error: Invalid verification code';
      state.forgotSuccess = null;
      render();
      return;
    }

    state.resetSession.resetProofToken = result.resetProofToken;
    state.forgotError = null;
    state.forgotSuccess = null;
    navigate('forgot-reset');
  });

  shell.appendChild(form);
  appendAuthBackFooter(shell, 'Back to sign in', () => {
    resetRequestSeq += 1;
    state.forgotError = null;
    state.forgotSuccess = null;
    state.resetSession = null;
    navigate('login');
  });
}

function renderForgotResetScreen(root: HTMLElement, shell: HTMLElement): void {
  if (!state.resetSession || !state.resetSession.resetProofToken) {
    navigate('login');
    return;
  }

  const { email, resetProofToken } = state.resetSession;

  root.appendChild(
    createBackButton(() => {
      resetRequestSeq += 1;
      state.forgotError = null;
      state.resetSession = null;
      navigate('login');
    }),
  );

  shell.appendChild(createHeader('Set new password'));

  const form = document.createElement('form');
  form.className = 'auth-form';
  form.noValidate = true;

  const newPassField = createInput({
    type: 'password',
    placeholder: 'New password',
    value: state.forgotNewPassword,
    autocomplete: 'new-password',
    hasError: Boolean(state.forgotError),
    onInput: (val) => {
      state.forgotNewPassword = val;
      if (state.forgotError) {
        state.forgotError = null;
        syncInlineFeedback(form);
      }
    },
  });

  const confirmPassField = createInput({
    type: 'password',
    placeholder: 'Confirm new password',
    value: state.forgotConfirmPassword,
    autocomplete: 'new-password',
    hasError: Boolean(state.forgotError),
    onInput: (val) => {
      state.forgotConfirmPassword = val;
      if (state.forgotError) {
        state.forgotError = null;
        syncInlineFeedback(form);
      }
    },
  });

  form.appendChild(newPassField.wrapper);
  form.appendChild(confirmPassField.wrapper);
  form.appendChild(createFeedbackSlot(state.forgotError));

  const submitReset = async (withNewPassword: boolean) => {
    if (state.isBusy) {
      return;
    }

    if (withNewPassword) {
      const validation = validatePasswordPair(
        state.forgotNewPassword,
        state.forgotConfirmPassword,
      );
      if (!validation.ok) {
        state.forgotError = validation.error ?? 'Error: Invalid password';
        render();
        return;
      }
    }

    state.isBusy = true;
    state.forgotError = null;
    render();

    const res = await apiCompleteReset({
      email,
      resetProofToken,
      ...(withNewPassword
        ? {
            newPassword: state.forgotNewPassword,
            confirmPassword: state.forgotConfirmPassword,
          }
        : {}),
    });

    state.isBusy = false;
    if (!res.ok || !res.snapshot) {
      state.forgotError = res.error ?? 'Error: Could not sign in';
      render();
      return;
    }

    state.forgotError = null;
    state.forgotSuccess = null;
    state.forgotNewPassword = '';
    state.forgotConfirmPassword = '';
    state.resetSession = null;
    state.loginIdentifier = email;
    state.loginPassword = '';
    state.loginError = null;
    state.loginSuccess = null;
    state.snapshot = res.snapshot;
    navigate('app');
  };

  const buttonRow = document.createElement('div');
  buttonRow.className = 'button-row';

  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'btn-secondary';
  skipBtn.textContent = 'Skip';
  skipBtn.disabled = state.isBusy;
  skipBtn.addEventListener('click', () => {
    void submitReset(false);
  });

  const resetBtn = createPrimaryButton(state.isBusy ? 'Saving...' : 'Reset Password');
  resetBtn.disabled = state.isBusy;

  buttonRow.appendChild(skipBtn);
  buttonRow.appendChild(resetBtn);
  form.appendChild(buttonRow);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void submitReset(true);
  });

  shell.appendChild(form);
  appendAuthBackFooter(shell, 'Back to sign in', () => {
    resetRequestSeq += 1;
    state.forgotError = null;
    state.resetSession = null;
    navigate('login');
  });
}

function formatMessageTime(timestamp: number): string {
  const prefs = getUserPreferences();
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: !prefs.use24HourTime,
  });
}

function renderWorkspaceScreen(root: HTMLElement): void {
  if (!state.snapshot) {
    navigate('login');
    return;
  }

  const leftColumn = document.createElement('aside');
  leftColumn.className = 'workspace-left';

  const sidebarNavTop = document.createElement('div');
  sidebarNavTop.className = 'sidebar-nav-top';

  let triggerQuickSwitcher: (() => void) | null = null;
  let triggerGlobalSearch: (() => void) | null = null;

  const sidebarSearchRow = document.createElement('div');
  sidebarSearchRow.className = 'sidebar-search-row';

  const quickSwitchBtn = document.createElement('button');
  quickSwitchBtn.type = 'button';
  quickSwitchBtn.className = 'sidebar-quick-switch-btn';
  quickSwitchBtn.title = 'Quick Switcher (Ctrl+K)';
  quickSwitchBtn.setAttribute('aria-label', 'Find or start a conversation');

  const quickSwitchLabel = document.createElement('span');
  quickSwitchLabel.className = 'sidebar-quick-switch-label';
  quickSwitchLabel.textContent = 'Find or start a chat';

  const quickSwitchKbd = document.createElement('kbd');
  quickSwitchKbd.className = 'sidebar-quick-kbd';
  quickSwitchKbd.textContent = 'Ctrl+K';

  quickSwitchBtn.appendChild(quickSwitchLabel);
  quickSwitchBtn.appendChild(quickSwitchKbd);
  quickSwitchBtn.addEventListener('click', () => triggerQuickSwitcher?.());

  const globalSearchBtn = document.createElement('button');
  globalSearchBtn.type = 'button';
  globalSearchBtn.className = 'sidebar-global-search-btn';
  globalSearchBtn.title = 'Search All Messages (Ctrl+Shift+F)';
  globalSearchBtn.setAttribute('aria-label', 'Search all messages');
  globalSearchBtn.appendChild(createSearchIconSvg(15));
  globalSearchBtn.addEventListener('click', () => triggerGlobalSearch?.());

  sidebarSearchRow.appendChild(quickSwitchBtn);
  sidebarSearchRow.appendChild(globalSearchBtn);
  sidebarNavTop.appendChild(sidebarSearchRow);

  const friendsNavBtn = document.createElement('button');
  friendsNavBtn.type = 'button';
  friendsNavBtn.className = 'sidebar-friends-btn';
  friendsNavBtn.appendChild(createFriendsIconSvg(20));

  const friendsLabel = document.createElement('span');
  friendsLabel.className = 'sidebar-friends-label';
  friendsLabel.textContent = 'Friends';
  friendsNavBtn.appendChild(friendsLabel);

  const friendsNavBadge = document.createElement('span');
  friendsNavBadge.className = 'sidebar-friends-badge';
  friendsNavBadge.hidden = true;
  friendsNavBtn.appendChild(friendsNavBadge);

  sidebarNavTop.appendChild(friendsNavBtn);
  leftColumn.appendChild(sidebarNavTop);

  const dmSectionHeader = document.createElement('div');
  dmSectionHeader.className = 'sidebar-section-header';

  const dmSectionTitle = document.createElement('span');
  dmSectionTitle.className = 'sidebar-section-title';
  dmSectionTitle.textContent = 'Direct Messages';
  dmSectionHeader.appendChild(dmSectionTitle);

  const createGroupBtn = document.createElement('button');
  createGroupBtn.type = 'button';
  createGroupBtn.className = 'sidebar-create-dm-btn';
  createGroupBtn.title = 'Create Group DM';
  createGroupBtn.setAttribute('aria-label', 'Create Group DM');
  createGroupBtn.appendChild(createPlusIconSvg(15));
  createGroupBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const snap = state.snapshot;
    if (!snap) {
      return;
    }
    openCreateGroupDmModal({
      friends: snap.friends,
      resolveAvatar: resolveProfileAvatar,
      onCreated: (group, updatedSnap) => {
        applyLiveSnapshot(updatedSnap);
        state.mainView = 'group';
        state.activeGroupId = group.id;
        state.activeDmUsername = null;
        mobileInChat = true;
        mobileHubTab = 'chats';
        renderMainArea();
        syncMobileChrome();
      },
    });
  });
  dmSectionHeader.appendChild(createGroupBtn);
  leftColumn.appendChild(dmSectionHeader);

  const dmListEl = document.createElement('div');
  dmListEl.className = 'sidebar-dm-list';
  leftColumn.appendChild(dmListEl);

  const userDock = document.createElement('div');
  userDock.className = 'user-dock';

  const dockMain = document.createElement('button');
  dockMain.type = 'button';
  dockMain.className = 'user-dock-trigger';
  dockMain.setAttribute('aria-label', 'Open profile');

  const avatarWrap = document.createElement('span');
  avatarWrap.className = 'user-dock-avatar-wrap';

  const avatarImg = document.createElement('img');
  avatarImg.className = 'user-dock-avatar';
  avatarWrap.appendChild(avatarImg);

  const dockStatusBadge = document.createElement('span');
  dockStatusBadge.className = 'user-dock-status-badge';
  avatarWrap.appendChild(dockStatusBadge);

  dockMain.appendChild(avatarWrap);

  const userMeta = document.createElement('div');
  userMeta.className = 'user-dock-meta';

  const displayNameEl = document.createElement('div');
  displayNameEl.className = 'user-dock-display';
  userMeta.appendChild(displayNameEl);

  const usernameEl = document.createElement('div');
  usernameEl.className = 'user-dock-username';
  userMeta.appendChild(usernameEl);

  dockMain.appendChild(userMeta);

  const chevronWrap = document.createElement('span');
  chevronWrap.className = 'user-dock-chevron';
  chevronWrap.appendChild(createSvgIcon(['M6 9l6 6 6-6'], '0 0 24 24', 16));
  dockMain.appendChild(chevronWrap);

  const dockActions = document.createElement('div');
  dockActions.className = 'user-dock-actions';

  const dockMuteBtn = document.createElement('button');
  dockMuteBtn.type = 'button';
  dockMuteBtn.className = 'user-dock-settings-btn';

  const dockDeafenBtn = document.createElement('button');
  dockDeafenBtn.type = 'button';
  dockDeafenBtn.className = 'user-dock-settings-btn';

  const settingsGearBtn = document.createElement('button');
  settingsGearBtn.type = 'button';
  settingsGearBtn.className = 'user-dock-settings-btn';
  settingsGearBtn.title = 'User Settings';
  settingsGearBtn.setAttribute('aria-label', 'Open User Settings');
  settingsGearBtn.appendChild(createSettingsGearSvg(17));

  dockActions.appendChild(dockMuteBtn);
  dockActions.appendChild(dockDeafenBtn);
  dockActions.appendChild(settingsGearBtn);

  // Only the DM / Group Chat / Friends header "Update Available" button is shown (no duplicate sidebar banner).
  const desktopBridge = getDesktopBridge();
  let unsubscribeDesktopUpdate: (() => void) | null = null;
  if (desktopBridge) {
    const onDetectedUpdate = (info: import('./desktopBridge').DesktopUpdateInfo) => {
      if (info && info.updateAvailable && info.asarUrl) {
        notifyHeaderUpdateAvailable(info);
      }
    };
    unsubscribeDesktopUpdate = desktopBridge.onBackgroundUpdateAvailable(onDetectedUpdate);
    void desktopBridge.checkForUpdates().then((info) => {
      if (info && info.updateAvailable && info.asarUrl) {
        onDetectedUpdate(info);
      }
    }).catch(() => {});
  }

  const vcSidebarStatusHost = document.createElement('div');
  vcSidebarStatusHost.className = 'vc-sidebar-status-host';
  vcSidebarStatusHost.hidden = true;
  leftColumn.appendChild(vcSidebarStatusHost);

  userDock.appendChild(dockMain);
  userDock.appendChild(dockActions);
  leftColumn.appendChild(userDock);

  const chatArea = document.createElement('main');
  chatArea.className = 'workspace-chat';

  let mobileHubTab: MobileHubTab = 'chats';
  let mobileInChat = state.mainView === 'dm' || state.mainView === 'group';
  let mobileBackBadgeSyncer: (() => void) | null = null;
  let syncMobileChromeRef: (() => void) | null = null;
  const syncMobileChrome = () => {
    root.dataset.mobileView = mobileInChat ? 'chat' : 'hub';
    root.dataset.mobileTab = mobileHubTab;
    syncMobileChromeRef?.();
    mobileBackBadgeSyncer?.();
  };
  syncMobileChrome();

  const SEEN_PINS_STORAGE_KEY = 'redshift.seenPins.v1';
  const seenPinsByThread = new Map<string, Set<string>>();
  try {
    const rawPins = window.localStorage.getItem(SEEN_PINS_STORAGE_KEY);
    if (rawPins) {
      const parsedPins = JSON.parse(rawPins) as Record<string, string[]>;
      if (parsedPins && typeof parsedPins === 'object') {
        for (const [k, list] of Object.entries(parsedPins)) {
          if (Array.isArray(list)) {
            seenPinsByThread.set(k, new Set(list.filter((x) => typeof x === 'string')));
          }
        }
      }
    }
  } catch {
    // Ignore storage read errors.
  }

  const persistSeenPins = () => {
    try {
      const out: Record<string, string[]> = {};
      for (const [k, set] of seenPinsByThread.entries()) {
        if (set.size > 0) {
          out[k] = Array.from(set).slice(-200);
        }
      }
      window.localStorage.setItem(SEEN_PINS_STORAGE_KEY, JSON.stringify(out));
    } catch {
      // Ignore storage write errors.
    }
  };

  const getPinScopeKey = (cacheKey: string) =>
    `${state.snapshot?.user.username.toLowerCase() ?? ''}|${cacheKey}`;

  const markThreadPinsSeen = (cacheKey: string, messages: ChatMessage[]) => {
    const scopeKey = getPinScopeKey(cacheKey);
    const set = new Set<string>(seenPinsByThread.get(scopeKey) ?? []);
    for (const m of messages) {
      if (m.pinned) {
        set.add(m.id);
      }
    }
    seenPinsByThread.set(scopeKey, set);
    persistSeenPins();
  };

  const markSinglePinSeen = (cacheKey: string, messageId: string) => {
    const scopeKey = getPinScopeKey(cacheKey);
    const set = seenPinsByThread.get(scopeKey) ?? new Set<string>();
    set.add(messageId);
    seenPinsByThread.set(scopeKey, set);
    persistSeenPins();
  };

  const syncSeenPinsOnThreadList = (cacheKey: string, messages: ChatMessage[], historyReady: boolean) => {
    if (!historyReady) {
      return;
    }
    const scopeKey = getPinScopeKey(cacheKey);
    const set = seenPinsByThread.get(scopeKey);
    if (!set || set.size === 0) {
      return;
    }
    const currentPinnedIds = new Set(messages.filter((m) => Boolean(m.pinned)).map((m) => m.id));
    let changed = false;
    for (const id of Array.from(set)) {
      if (!currentPinnedIds.has(id)) {
        set.delete(id);
        changed = true;
      }
    }
    if (changed) {
      persistSeenPins();
    }
  };

  const countUnseenPins = (cacheKey: string, messages: ChatMessage[]): number => {
    const scopeKey = getPinScopeKey(cacheKey);
    const seen = seenPinsByThread.get(scopeKey);
    let unseen = 0;
    for (const m of messages) {
      if (m.pinned && (!seen || !seen.has(m.id))) {
        unseen += 1;
      }
    }
    return unseen;
  };

  const syncDock = () => {
    const active = state.snapshot?.user;
    if (!active) {
      return;
    }
    avatarImg.src = resolveProfileAvatar(active);
    avatarImg.alt = `${active.displayName} profile picture`;
    displayNameEl.textContent = active.displayName;
    usernameEl.textContent = active.username;
    dockStatusBadge.replaceChildren(createStatusGlyph(active.status, 10));
  };

  let activeDmSyncer: (() => void) | null = null;
  let activeVcBarSyncer: (() => void) | null = null;
  let activeDmCleanup: (() => void) | null = null;
  let activeTypingSyncer: (() => void) | null = null;
  let activeDmErrorReporter: ((msg: string | null) => void) | null = null;
  let activeDmNotifyPeerMessage:
    | ((msg: ChatMessage, wasVisible: boolean) => void)
    | null = null;
  let activeDmIsAtBottom: (() => boolean) | null = null;
  let activeFriendsHandle: FriendsPanelHandle | null = null;
  let dmLoadSeq = 0;

  const dmDraftByThread = new Map<string, string>();
  const dmScrollStateByThread = new Map<string, { atBottom: boolean; scrollTop: number }>();

  const fastDataUrlHash = (str?: string): string => {
    if (!str) return '';
    let h = 2166136261;
    const step = Math.max(1, Math.floor(str.length / 64));
    for (let i = 0; i < str.length; i += step) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `${str.length}:${h >>> 0}`;
  };

  interface StagedAttachmentItem {
    file: File;
    kind: AttachmentKind;
    name: string;
    size: number;
    previewUrl?: string;
    spoiler?: boolean;
    uploaded?: DmAttachment;
  }

  const dmThreadCacheKey = (peerUsername: string) => `dm:${peerUsername.toLowerCase()}`;
  const groupThreadCacheKey = (groupId: string) => `group:${groupId}`;

  const isThreadCurrentlyViewed = (cacheKey: string): boolean => {
    if (state.mainView === 'dm' && state.activeDmUsername) {
      return dmThreadCacheKey(state.activeDmUsername) === cacheKey;
    }
    if (state.mainView === 'group' && state.activeGroupId) {
      return groupThreadCacheKey(state.activeGroupId) === cacheKey;
    }
    return false;
  };

  interface QueuedDmItem {
    clientTempId: string;
    cacheKey: string;
    target: ThreadTarget;
    content: string;
    files?: StagedAttachmentItem[];
    gif?: GifItem;
    voiceNote?: VoiceNoteMeta;
    replyToMessageId?: string;
    statusReply?: StatusReplyRef;
    localMessage: ChatMessage;
    bufferingTimerId: number | null;
  }

  const revokeStagedAttachmentUrls = (items?: StagedAttachmentItem[]) => {
    if (!items) {
      return;
    }
    for (const item of items) {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
        item.previewUrl = undefined;
      }
    }
  };

  const outboundQueue: QueuedDmItem[] = [];
  let queueWorkerRunning = false;
  let queueRetryTimerId: number | null = null;
  let socketConnected = false;

  const dmMessagesByThread = new Map<string, ChatMessage[]>();
  const dmHasMoreByThread = new Map<string, boolean>();
  const dmHistoryHydratedAt = new Map<string, number>();
  const inflightThreadPrefetches = new Map<string, Promise<void>>();
  let workspaceDestroyed = false;
  let pendingGlobalJump: { cacheKey: string; messageId: string } | null = null;
  const dmReceiptsByThread = new Map<string, DmReadReceipt>();
  const typingByThread = new Map<
    string,
    Map<string, { displayName: string; timerId: number }>
  >();
  const suppressedUnreadByThread = new Map<string, number>();
  const pendingMarkReadInFlight = new Map<string, number>();
  const lastAutoMarkReadAt = new Map<string, number>();

  const isThreadUnreadSuppressed = (cacheKey: string, now = Date.now()): boolean => {
    if ((pendingMarkReadInFlight.get(cacheKey) ?? 0) > 0) {
      return true;
    }
    const until = suppressedUnreadByThread.get(cacheKey);
    if (until !== undefined) {
      if (now < until) {
        return true;
      }
      suppressedUnreadByThread.delete(cacheKey);
    }
    return false;
  };

  const compareThreadMessages = (a: ChatMessage, b: ChatMessage): number => {
    const aLocalPending = Boolean(a.clientTempId && a.id === a.clientTempId);
    const bLocalPending = Boolean(b.clientTempId && b.id === b.clientTempId);
    if (aLocalPending !== bLocalPending) {
      return aLocalPending ? 1 : -1;
    }
    return a.timestamp - b.timestamp;
  };

  const upsertDmMessage = (cacheKey: string, msg: ChatMessage) => {
    const list = dmMessagesByThread.get(cacheKey) ?? [];
    const existingIdx = list.findIndex((existing) => existing.id === msg.id);
    if (existingIdx !== -1) {
      list[existingIdx] = msg;
      list.sort(compareThreadMessages);
      dmMessagesByThread.set(cacheKey, list);
      return;
    }
    list.push(msg);
    list.sort(compareThreadMessages);
    dmMessagesByThread.set(cacheKey, list);
  };

  const finalizePendingDmMessage = (
    cacheKey: string,
    clientTempId: string,
    confirmed: ChatMessage,
  ) => {
    const list = dmMessagesByThread.get(cacheKey) ?? [];
    const cleaned = list.filter((m) => m.id !== clientTempId && m.id !== confirmed.id);
    cleaned.push(confirmed);
    cleaned.sort(compareThreadMessages);
    dmMessagesByThread.set(cacheKey, cleaned);
  };

  const replaceDmMessage = (cacheKey: string, updated: ChatMessage) => {
    upsertDmMessage(cacheKey, updated);
  };

  const removeDmMessage = (cacheKey: string, messageId: string) => {
    const list = dmMessagesByThread.get(cacheKey);
    if (!list) {
      return;
    }
    const next = list
      .filter((m) => m.id !== messageId)
      .map((m) =>
        m.replyTo && m.replyTo.messageId === messageId
          ? { ...m, replyTo: { ...m.replyTo, missing: true, content: '', hasImage: false } }
          : m,
      );
    dmMessagesByThread.set(cacheKey, next);
  };

  const markQueuedPeersPending = () => {
    for (const item of outboundQueue) {
      item.localMessage.isPending = true;
    }
    if (state.mainView === 'dm' || state.mainView === 'group') {
      activeDmSyncer?.();
    }
  };

  const scheduleQueueRetry = (delayMs = 2500) => {
    if (queueRetryTimerId !== null) {
      return;
    }
    queueRetryTimerId = window.setTimeout(() => {
      queueRetryTimerId = null;
      void flushOutboundQueue();
    }, delayMs);
  };

  const flushOutboundQueue = async (): Promise<void> => {
    if (queueWorkerRunning || outboundQueue.length === 0) {
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      markQueuedPeersPending();
      scheduleQueueRetry(3000);
      return;
    }

    queueWorkerRunning = true;
    try {
      while (outboundQueue.length > 0) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          markQueuedPeersPending();
          scheduleQueueRetry(3000);
          break;
        }

        const head = outboundQueue[0];
        const queuedFiles = head.files ?? [];
        let uploadFailedNetwork = false;
        let uploadFatalError: string | null = null;

        for (let i = 0; i < queuedFiles.length; i += 1) {
          const entry = queuedFiles[i];
          if (entry.uploaded) {
            continue;
          }
          if (head.bufferingTimerId !== null) {
            window.clearTimeout(head.bufferingTimerId);
            head.bufferingTimerId = null;
          }
          head.localMessage.isPending = true;
          head.localMessage.uploadStatusText = `Uploading ${entry.name} (${i + 1}/${queuedFiles.length}) — 0%`;
          head.localMessage.uploadProgress = 0;
          if (isThreadCurrentlyViewed(head.cacheKey)) {
            activeDmSyncer?.();
          }

          let lastSyncAt = 0;
          const upRes = await apiUploadAttachment(entry.file, (pct) => {
            head.localMessage.uploadProgress = pct;
            head.localMessage.uploadStatusText = `Uploading ${entry.name} (${i + 1}/${queuedFiles.length}) — ${pct}%`;
            const now = Date.now();
            if (now - lastSyncAt >= 120 || pct === 100) {
              lastSyncAt = now;
              if (isThreadCurrentlyViewed(head.cacheKey)) {
                activeDmSyncer?.();
              }
            }
          });

          if (!upRes.ok || !upRes.attachment) {
            if (upRes.isNetworkError) {
              uploadFailedNetwork = true;
              head.localMessage.uploadStatusText = `Paused ${entry.name} — waiting for network`;
              break;
            }
            uploadFatalError = upRes.error ?? `Error: Failed to upload ${entry.name}`;
            break;
          }
          entry.uploaded = upRes.attachment;
        }

        if (uploadFailedNetwork) {
          markQueuedPeersPending();
          scheduleQueueRetry(2500);
          break;
        }

        if (uploadFatalError) {
          outboundQueue.shift();
          revokeStagedAttachmentUrls(head.files);
          removeDmMessage(head.cacheKey, head.clientTempId);
          if (isThreadCurrentlyViewed(head.cacheKey)) {
            activeDmSyncer?.();
            activeDmErrorReporter?.(uploadFatalError);
          }
          continue;
        }

        if (queuedFiles.length > 0) {
          head.localMessage.uploadStatusText = 'Sending...';
          head.localMessage.uploadProgress = 100;
        }

        const attachmentIds = queuedFiles
          .map((f) => f.uploaded?.id)
          .filter((id): id is string => Boolean(id));
        const spoilerAttachmentIds = queuedFiles
          .filter((f) => Boolean(f.spoiler) && Boolean(f.uploaded?.id))
          .map((f) => f.uploaded!.id);

        const res = await apiSendDmMessage(head.target, head.content, {
          attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
          spoilerAttachmentIds:
            spoilerAttachmentIds.length > 0 ? spoilerAttachmentIds : undefined,
          gif: head.gif,
          voiceNote: head.voiceNote,
          replyToMessageId: head.replyToMessageId,
          statusReply: head.statusReply,
        });

        if (head.bufferingTimerId !== null) {
          window.clearTimeout(head.bufferingTimerId);
          head.bufferingTimerId = null;
        }

        if (res.ok && res.message) {
          outboundQueue.shift();
          revokeStagedAttachmentUrls(head.files);
          finalizePendingDmMessage(head.cacheKey, head.clientTempId, res.message);
          if (isThreadCurrentlyViewed(head.cacheKey)) {
            activeDmSyncer?.();
          }
          continue;
        }

        if (res.isNetworkError) {
          markQueuedPeersPending();
          scheduleQueueRetry(2500);
          break;
        }

        outboundQueue.shift();
        revokeStagedAttachmentUrls(head.files);
        removeDmMessage(head.cacheKey, head.clientTempId);
        if (isThreadCurrentlyViewed(head.cacheKey)) {
          activeDmSyncer?.();
          activeDmErrorReporter?.(res.error ?? 'Error: Could not send message');
        }
      }
    } finally {
      queueWorkerRunning = false;
    }
  };

  const enqueueOutboundDm = (opts: {
    cacheKey: string;
    target: ThreadTarget;
    content: string;
    files?: StagedAttachmentItem[];
    gif?: GifItem;
    voiceNote?: VoiceNoteMeta;
    replyTo?: MessageReplyRef;
    statusReply?: StatusReplyRef;
  }) => {
    const current = state.snapshot?.user;
    if (!current) {
      revokeStagedAttachmentUrls(opts.files);
      return;
    }
    const clientTempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const hasFiles = Boolean(opts.files && opts.files.length > 0);
    const isOfflineOrQueued =
      outboundQueue.length > 0 ||
      hasFiles ||
      (typeof navigator !== 'undefined' && navigator.onLine === false) ||
      !socketConnected;

    const localAttachments: DmAttachment[] | undefined =
      opts.files && opts.files.length > 0
        ? opts.files.map((item, idx) => ({
            id: `local-${clientTempId}-${idx}`,
            url: item.previewUrl ?? '',
            name: item.name,
            mime: item.file.type || 'application/octet-stream',
            size: item.size,
            kind: item.kind,
            spoiler: item.spoiler ? true : undefined,
          }))
        : undefined;

    const existingThread = dmMessagesByThread.get(opts.cacheKey) ?? [];
    let maxExistingTs = 0;
    for (const m of existingThread) {
      if (m.timestamp > maxExistingTs) {
        maxExistingTs = m.timestamp;
      }
    }
    const optimisticTimestamp = Math.max(getEstimatedServerNow(), maxExistingTs + 1);

    const localMessage: ChatMessage = {
      id: clientTempId,
      clientTempId,
      authorUsername: current.username,
      authorName: current.displayName,
      authorAvatarPreset: current.avatarPreset,
      authorAvatarDataUrl: current.avatarDataUrl,
      content: opts.content,
      attachments: localAttachments,
      gif: opts.gif,
      voiceNote: opts.voiceNote,
      replyTo: opts.replyTo,
      statusReply: opts.statusReply,
      timestamp: optimisticTimestamp,
      reactions: [],
      isPending: isOfflineOrQueued,
    };

    upsertDmMessage(opts.cacheKey, localMessage);

    const item: QueuedDmItem = {
      clientTempId,
      cacheKey: opts.cacheKey,
      target: opts.target,
      content: opts.content,
      files: opts.files,
      gif: opts.gif,
      voiceNote: opts.voiceNote,
      replyToMessageId: opts.replyTo?.messageId,
      statusReply: opts.statusReply,
      localMessage,
      bufferingTimerId: null,
    };

    if (!isOfflineOrQueued) {
      item.bufferingTimerId = window.setTimeout(() => {
        item.bufferingTimerId = null;
        if (outboundQueue.includes(item)) {
          item.localMessage.isPending = true;
          if (isThreadCurrentlyViewed(item.cacheKey)) {
            activeDmSyncer?.();
          }
        }
      }, 220);
    }

    outboundQueue.push(item);

    if (isThreadCurrentlyViewed(opts.cacheKey)) {
      activeDmSyncer?.();
    }

    if (!isOfflineOrQueued || !navigator || navigator.onLine !== false) {
      void flushOutboundQueue();
    } else {
      scheduleQueueRetry(3000);
    }
  };

  const updateDmMessageReactions = (
    cacheKey: string,
    messageId: string,
    reactions: MessageReaction[],
  ) => {
    const list = dmMessagesByThread.get(cacheKey);
    if (!list) {
      return;
    }
    const target = list.find((m) => m.id === messageId);
    if (target) {
      target.reactions = reactions;
    }
  };

  const mergeDmHistory = (cacheKey: string, serverMessages: ChatMessage[]) => {
    const byId = new Map<string, ChatMessage>();
    for (const msg of dmMessagesByThread.get(cacheKey) ?? []) {
      byId.set(msg.id, msg);
    }
    for (const msg of serverMessages) {
      byId.set(msg.id, msg);
    }
    const merged = Array.from(byId.values()).sort((a, b) => a.timestamp - b.timestamp);
    dmMessagesByThread.set(cacheKey, merged);
  };

  /** Silently captures a DM or Group Chat's recent messages in the background so switching to it is instantaneous. */
  const prefetchThreadHistory = (target: ThreadTarget, cacheKey: string): Promise<void> => {
    const existing = inflightThreadPrefetches.get(cacheKey);
    if (existing) {
      return existing;
    }
    const job = apiFetchDmHistory(target, { limit: 50 })
      .then((res) => {
        if (workspaceDestroyed || state.screen !== 'app') {
          return;
        }
        if (res.ok && res.messages) {
          mergeDmHistory(cacheKey, res.messages);
          dmHistoryHydratedAt.set(cacheKey, Date.now());
          if (res.hasMore !== undefined) {
            dmHasMoreByThread.set(cacheKey, Boolean(res.hasMore));
          }
          if (!cacheKey.startsWith('group:') && res.peerReceipt) {
            dmReceiptsByThread.set(cacheKey, res.peerReceipt);
          }
          if (isThreadCurrentlyViewed(cacheKey)) {
            activeDmSyncer?.();
          }
        }
      })
      .catch(() => {
        // Ignore silent background prefetch errors.
      })
      .finally(() => {
        inflightThreadPrefetches.delete(cacheKey);
      });
    inflightThreadPrefetches.set(cacheKey, job);
    return job;
  };

  /** Pre-warms recent active/unread DM & Group threads on startup so opening any conversation has zero delay. */
  const prewarmRecentThreads = (snap: SocialSnapshot | null) => {
    if (!snap || workspaceDestroyed) {
      return;
    }
    const hiddenSet = new Set(snap.hiddenThreads ?? []);
    const candidates: Array<{ target: ThreadTarget; cacheKey: string; score: number }> = [];
    const act = snap.threadActivity ?? {};

    for (const grp of snap.groups ?? []) {
      const ck = groupThreadCacheKey(grp.id);
      if (hiddenSet.has(ck) || dmHistoryHydratedAt.has(ck)) continue;
      const unread = snap.groupUnreadCounts?.[grp.id] ?? 0;
      candidates.push({
        target: { groupId: grp.id },
        cacheKey: ck,
        score: (unread > 0 ? 1e15 : 0) + (act[ck] ?? grp.createdAt ?? 0),
      });
    }

    const dmPeerKeys = new Set<string>();
    for (const f of snap.friends) dmPeerKeys.add(f.username.toLowerCase());
    for (const p of snap.dmPeers ?? []) dmPeerKeys.add(p.username.toLowerCase());
    for (const pk of dmPeerKeys) {
      const ck = dmThreadCacheKey(pk);
      if (hiddenSet.has(ck) || dmHistoryHydratedAt.has(ck)) continue;
      const unread = snap.unreadCounts?.[pk] ?? 0;
      const lastAct = act[ck] ?? 0;
      if (unread > 0 || lastAct > 0) {
        candidates.push({
          target: { peerUsername: pk },
          cacheKey: ck,
          score: (unread > 0 ? 1e15 : 0) + lastAct,
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const batch = candidates.slice(0, 8);
    if (batch.length === 0) return;

    let idx = 0;
    const pump = async () => {
      while (idx < batch.length && !workspaceDestroyed && state.screen === 'app') {
        const next = batch[idx++];
        if (!dmHistoryHydratedAt.has(next.cacheKey)) {
          await prefetchThreadHistory(next.target, next.cacheKey);
        }
      }
    };
    void pump();
    void pump();
  };

  const clearThreadTyping = (cacheKey: string, senderUsername?: string) => {
    const threadMap = typingByThread.get(cacheKey);
    if (!threadMap) {
      return;
    }
    if (senderUsername) {
      const sKey = senderUsername.toLowerCase();
      const existing = threadMap.get(sKey);
      if (existing) {
        window.clearTimeout(existing.timerId);
        threadMap.delete(sKey);
      }
      return;
    }
    for (const entry of threadMap.values()) {
      window.clearTimeout(entry.timerId);
    }
    typingByThread.delete(cacheKey);
  };

  const syncDocumentTitle = () => {
    const snap = state.snapshot;
    if (!snap) {
      document.title = 'Redshift';
      getDesktopBridge()?.setUnreadCount(0);
      return;
    }
    let unreadDms = 0;
    for (const count of Object.values(snap.unreadCounts ?? {})) {
      if (count > 0) {
        unreadDms += count;
      }
    }
    for (const count of Object.values(snap.groupUnreadCounts ?? {})) {
      if (count > 0) {
        unreadDms += count;
      }
    }
    const alertTotal = unreadDms + snap.incomingRequests.length;
    document.title = alertTotal > 0 ? `(${alertTotal}) Redshift` : 'Redshift';
    getDesktopBridge()?.setUnreadCount(alertTotal);
    syncMobileChrome();
  };

  const markThreadAsRead = (
    target: { kind: 'dm'; id: string } | { kind: 'group'; id: string },
    retryAttempt = 0,
  ) => {
    const cleanId = target.kind === 'dm' ? target.id.toLowerCase() : target.id;
    const snap = state.snapshot;
    if (!snap) {
      return;
    }
    const cacheKey =
      target.kind === 'group' ? groupThreadCacheKey(cleanId) : dmThreadCacheKey(cleanId);
    const now = Date.now();
    suppressedUnreadByThread.set(cacheKey, now + 4500);
    pendingMarkReadInFlight.set(cacheKey, (pendingMarkReadInFlight.get(cacheKey) ?? 0) + 1);
    lastAutoMarkReadAt.set(cacheKey, now);

    const finalizeInFlight = (ok: boolean) => {
      const nextCount = Math.max(0, (pendingMarkReadInFlight.get(cacheKey) ?? 1) - 1);
      if (nextCount === 0) {
        pendingMarkReadInFlight.delete(cacheKey);
      } else {
        pendingMarkReadInFlight.set(cacheKey, nextCount);
      }
      if (ok) {
        // Keep short post-ACK grace window so an already-in-flight 5s snapshot poll cannot resurrect this badge.
        const currentUntil = suppressedUnreadByThread.get(cacheKey) ?? 0;
        suppressedUnreadByThread.set(cacheKey, Math.max(currentUntil, Date.now() + 2500));
      } else if (retryAttempt < 1 && !workspaceDestroyed) {
        window.setTimeout(() => {
          if (!workspaceDestroyed && state.snapshot) {
            markThreadAsRead(target, retryAttempt + 1);
          }
        }, 1200);
      }
    };

    if (target.kind === 'group') {
      let clearedAny = false;
      if (snap.groupUnreadCounts && snap.groupUnreadCounts[cleanId]) {
        delete snap.groupUnreadCounts[cleanId];
        clearedAny = true;
      }
      if (snap.groupUnreadMentions && snap.groupUnreadMentions[cleanId]) {
        delete snap.groupUnreadMentions[cleanId];
        clearedAny = true;
      }
      if (clearedAny) {
        syncSidebarNavAndDms();
      }
      void apiMarkDmRead({ groupId: cleanId }).then((res) => {
        finalizeInFlight(res.ok);
        if (res.ok && state.snapshot) {
          let changed = false;
          if (state.snapshot.groupUnreadCounts?.[cleanId]) {
            delete state.snapshot.groupUnreadCounts[cleanId];
            changed = true;
          }
          if (state.snapshot.groupUnreadMentions?.[cleanId]) {
            delete state.snapshot.groupUnreadMentions[cleanId];
            changed = true;
          }
          if (changed) {
            syncSidebarNavAndDms();
          }
        }
      });
    } else {
      let clearedAny = false;
      if (snap.unreadCounts && snap.unreadCounts[cleanId]) {
        delete snap.unreadCounts[cleanId];
        clearedAny = true;
      }
      if (snap.unreadMentions && snap.unreadMentions[cleanId]) {
        delete snap.unreadMentions[cleanId];
        clearedAny = true;
      }
      if (clearedAny) {
        syncSidebarNavAndDms();
      }
      void apiMarkDmRead({ peerUsername: cleanId }).then((res) => {
        finalizeInFlight(res.ok);
        if (res.ok && state.snapshot) {
          let changed = false;
          if (state.snapshot.unreadCounts?.[cleanId]) {
            delete state.snapshot.unreadCounts[cleanId];
            changed = true;
          }
          if (state.snapshot.unreadMentions?.[cleanId]) {
            delete state.snapshot.unreadMentions[cleanId];
            changed = true;
          }
          if (changed) {
            syncSidebarNavAndDms();
          }
        }
      });
    }
  };

  const findKnownDmPeer = (snap: SocialSnapshot, username: string): PublicProfile | undefined => {
    const targetKey = username.toLowerCase();
    return (
      snap.friends.find((f) => f.username.toLowerCase() === targetKey) ??
      (snap.dmPeers ?? []).find((p) => p.username.toLowerCase() === targetKey) ??
      snap.incomingRequests.find((r) => r.user.username.toLowerCase() === targetKey)?.user ??
      snap.outgoingRequests.find((r) => r.user.username.toLowerCase() === targetKey)?.user ??
      snap.groups?.flatMap((g) => g.members).find((m) => m.username.toLowerCase() === targetKey) ??
      (snap.blockedUsers ?? []).find((b) => b.username.toLowerCase() === targetKey)
    );
  };

  const openGroupChatById = (gid: string) => {
    const gKey = `group:${gid}`;
    if (state.snapshot?.hiddenThreads?.includes(gKey)) {
      state.snapshot = {
        ...state.snapshot,
        hiddenThreads: state.snapshot.hiddenThreads.filter((k) => k !== gKey),
      };
      void apiHideThread(gKey, false).then((res) => {
        if (res.ok && res.snapshot) {
          applyLiveSnapshot(res.snapshot);
        }
      });
    }
    state.mainView = 'group';
    state.activeGroupId = gid;
    state.activeDmUsername = null;
    mobileInChat = true;
    mobileHubTab = 'chats';
    renderMainArea();
    syncMobileChrome();
  };

  const openDirectMessageWithUser = (username: string) => {
    const clean = username.trim();
    const snap = state.snapshot;
    if (!clean || !snap) {
      return;
    }
    const targetKey = clean.toLowerCase();
    const dmHideKey = `dm:${targetKey}`;
    const alreadyInSidebar =
      snap.friends.some((f) => f.username.toLowerCase() === targetKey) ||
      (snap.dmPeers ?? []).some((p) => p.username.toLowerCase() === targetKey);
    let nextSnap = snap;
    if (!alreadyInSidebar) {
      const known = findKnownDmPeer(snap, clean);
      if (known) {
        nextSnap = {
          ...nextSnap,
          dmPeers: [known, ...(nextSnap.dmPeers ?? [])],
        };
      }
    }
    if (nextSnap.hiddenThreads?.includes(dmHideKey)) {
      nextSnap = {
        ...nextSnap,
        hiddenThreads: nextSnap.hiddenThreads.filter((k) => k !== dmHideKey),
      };
    }
    state.snapshot = nextSnap;
    state.mainView = 'dm';
    state.activeDmUsername = clean;
    state.activeGroupId = null;
    mobileInChat = true;
    mobileHubTab = 'chats';
    renderMainArea();
    syncMobileChrome();

    void apiOpenDm(clean).then((res) => {
      if (res.ok && res.snapshot) {
        applyLiveSnapshot(res.snapshot);
      }
    });
  };

  let socketHandle: SocialSocketHandle | null = null;
  let lastSyncedVoiceCallKey: string | null = null;

  const syncDockVoiceControls = () => {
    const muted = voiceManager.isMuted();
    const deafened = voiceManager.isDeafened();
    const micTesting = voiceManager.isMicTesting();

    dockMuteBtn.replaceChildren(createMicIconSvg(muted, 16));
    dockMuteBtn.classList.toggle('user-dock-settings-btn--danger', muted);
    dockMuteBtn.title = micTesting
      ? 'Mic test active'
      : muted
        ? 'Unmute Microphone'
        : 'Mute Microphone';
    dockMuteBtn.setAttribute('aria-label', dockMuteBtn.title);

    dockDeafenBtn.replaceChildren(createHeadphonesIconSvg(deafened, 16));
    dockDeafenBtn.classList.toggle('user-dock-settings-btn--danger', deafened);
    dockDeafenBtn.title = micTesting
      ? 'Deafened during mic test'
      : deafened
        ? 'Undeafen Audio'
        : 'Deafen Audio';
    dockDeafenBtn.setAttribute('aria-label', dockDeafenBtn.title);

    voiceManager.renderSidebarStatusBar(vcSidebarStatusHost);
    activeVcBarSyncer?.();

    const curCallKey = voiceManager.getActiveCallThreadKey();
    if (curCallKey !== lastSyncedVoiceCallKey) {
      lastSyncedVoiceCallKey = curCallKey;
      if (state.mainView === 'dm' || state.mainView === 'group') {
        activeDmSyncer?.();
      }
    }
  };

  let triggerVoiceSettingsModal: (() => void) | null = null;
  let triggerSelfProfileModal: ((initialEdit?: boolean) => void) | null = null;

  const handleReplyToCustomStatus = (
    targetUser: PublicProfile,
    status: CustomStatusData,
    replyText: string,
    fromModal: boolean,
  ) => {
    const trimmed = replyText.trim();
    if (!trimmed) {
      return;
    }
    const peerKey = targetUser.username.toLowerCase();
    const cacheKey = dmThreadCacheKey(peerKey);
    const statusReply: StatusReplyRef = {
      authorUsername: targetUser.username,
      authorName: targetUser.displayName,
      emoji: status.emoji?.trim() || undefined,
      text: status.text?.trim() || undefined,
    };
    enqueueOutboundDm({
      cacheKey,
      target: { peerUsername: targetUser.username },
      content: trimmed,
      statusReply,
    });
    if (fromModal || !isThreadCurrentlyViewed(cacheKey)) {
      openDirectMessageWithUser(targetUser.username);
    }
  };

  const resolvePublicProfileForUsername = (
    username: string,
    fallback?: { displayName?: string; avatarPreset?: number | null; avatarDataUrl?: string },
  ): PublicProfile | null => {
    const snap = state.snapshot;
    const key = username.trim().toLowerCase();
    if (!snap || !key) {
      return null;
    }
    if (snap.user.username.toLowerCase() === key) {
      return {
        username: snap.user.username,
        displayName: snap.user.displayName,
        bio: snap.user.bio,
        avatarPreset: snap.user.avatarPreset,
        avatarDataUrl: snap.user.avatarDataUrl,
        bannerColor: snap.user.bannerColor,
        bannerDataUrl: snap.user.bannerDataUrl,
        createdAt: snap.user.createdAt,
        status: snap.user.status,
        customStatus: snap.user.customStatus ?? null,
      };
    }
    const direct =
      snap.friends.find((u) => u.username.toLowerCase() === key) ??
      snap.dmPeers?.find((u) => u.username.toLowerCase() === key) ??
      snap.incomingRequests.find((r) => r.user.username.toLowerCase() === key)?.user ??
      snap.outgoingRequests.find((r) => r.user.username.toLowerCase() === key)?.user ??
      snap.blockedUsers?.find((u) => u.username.toLowerCase() === key);
    if (direct) {
      return direct;
    }
    for (const grp of snap.groups ?? []) {
      const member = grp.members.find((m) => m.username.toLowerCase() === key);
      if (member) {
        return member;
      }
    }
    return {
      username,
      displayName: fallback?.displayName?.trim() || username,
      bio: '',
      avatarPreset: fallback?.avatarPreset ?? null,
      avatarDataUrl: fallback?.avatarDataUrl,
      createdAt: Date.now(),
      status: 'offline',
      customStatus: null,
    };
  };

  const openProfileModalForUser = (user: PublicProfile) => {
    if (!state.snapshot) {
      return;
    }
    if (user.username.toLowerCase() === state.snapshot.user.username.toLowerCase()) {
      triggerSelfProfileModal?.(false);
      return;
    }
    openPublicProfileModal({
      initialUser: user,
      getSnapshot: () => state.snapshot!,
      resolveAvatar: resolveProfileAvatar,
      onSnapshotUpdated: (nextSnapshot) => applyLiveSnapshot(nextSnapshot),
      onOpenDm: openDirectMessageWithUser,
      onOpenGroup: openGroupChatById,
      onReplyToStatus: handleReplyToCustomStatus,
    });
  };

  const voiceManager = createVoiceManager({
    getSnapshot: () => state.snapshot,
    getSocket: () => socketHandle,
    resolveAvatar: resolveProfileAvatar,
    onJumpToCallThread: (callState: VcStateEventPayload) => {
      if (callState.kind === 'group' && callState.groupId) {
        state.mainView = 'group';
        state.activeGroupId = callState.groupId;
        state.activeDmUsername = null;
        renderMainArea();
      } else {
        const selfKey = state.snapshot?.user.username.toLowerCase();
        const peer = callState.threadKey.split('::').find((u) => u !== selfKey);
        if (peer) {
          openDirectMessageWithUser(peer);
        }
      }
    },
    onStateChanged: () => {
      syncDockVoiceControls();
    },
    onErrorNotice: (msg) => {
      activeDmErrorReporter?.(msg);
    },
    onOpenDm: (username) => {
      openDirectMessageWithUser(username);
    },
    onViewProfile: (user) => {
      openProfileModalForUser(user);
    },
    onOpenVoiceSettings: () => {
      triggerVoiceSettingsModal?.();
    },
  });

  dockMuteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    voiceManager.toggleMute();
  });

  dockDeafenBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    voiceManager.toggleDeafen();
  });

  syncDockVoiceControls();

  let muteExpiryTimerId: number | null = null;

  const hideThreadFromSidebar = (threadKey: string) => {
    const cleanKey = threadKey.startsWith('dm:') ? threadKey.toLowerCase() : threadKey;
    if (
      state.snapshot &&
      !(state.snapshot.hiddenThreads ?? []).includes(cleanKey)
    ) {
      state.snapshot = {
        ...state.snapshot,
        hiddenThreads: [...(state.snapshot.hiddenThreads ?? []), cleanKey],
      };
    }
    if (
      (state.mainView === 'dm' &&
        state.activeDmUsername &&
        dmThreadCacheKey(state.activeDmUsername) === cleanKey) ||
      (state.mainView === 'group' &&
        state.activeGroupId &&
        groupThreadCacheKey(state.activeGroupId) === cleanKey)
    ) {
      state.mainView = 'friends';
      state.activeDmUsername = null;
      state.activeGroupId = null;
      renderMainArea();
    } else {
      syncSidebarNavAndDms();
    }
    void apiHideThread(cleanKey, true).then((res) => {
      if (res.ok && res.snapshot) {
        applyLiveSnapshot(res.snapshot);
      }
    });
  };

  const confirmAndLeaveGroup = async (group: GroupDmInfo) => {
    const confirmed = await openConfirmPopup({
      title: `Leave '${group.name}'?`,
      message:
        'You will stop receiving messages from this group chat unless someone invites you back.',
      confirmLabel: 'Leave Group',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    const res = await apiLeaveGroupDm(group.id);
    if (res.ok && res.snapshot) {
      if (state.activeGroupId === group.id) {
        state.mainView = 'friends';
        state.activeGroupId = null;
      }
      applyLiveSnapshot(res.snapshot);
      renderMainArea();
    }
  };

  const openGroupContextMenu = (
    group: GroupDmInfo,
    clientX: number,
    clientY: number,
    anchorEl?: HTMLElement,
  ) => {
    const snap = state.snapshot;
    if (!snap) {
      return;
    }
    const latestGroup = snap.groups?.find((g) => g.id === group.id) ?? group;
    const threadKey = groupThreadCacheKey(latestGroup.id);
    const isViewing = state.mainView === 'group' && state.activeGroupId === latestGroup.id;
    const unreadCount = snap.groupUnreadCounts?.[latestGroup.id] ?? 0;
    const inCall = voiceManager.getActiveCallThreadKey() === threadKey;
    const activeCall = Boolean(voiceManager.getCallStateForThread(threadKey)?.active);
    const existingMemberKeys = new Set(latestGroup.members.map((m) => m.username.toLowerCase()));
    const invitableCount = snap.friends.filter(
      (f) => !existingMemberKeys.has(f.username.toLowerCase()),
    ).length;

    const openSettingsForGroup = (focusInvite = false) => {
      openGroupSettingsModal({
        group: latestGroup,
        friends: state.snapshot?.friends ?? [],
        resolveAvatar: resolveProfileAvatar,
        onUpdated: (updatedSnap) => applyLiveSnapshot(updatedSnap),
        onLeftGroup: (leftId, updatedSnap) => {
          if (state.activeGroupId === leftId) {
            state.mainView = 'friends';
            state.activeGroupId = null;
          }
          applyLiveSnapshot(updatedSnap);
          renderMainArea();
        },
        focusInvite,
      });
    };

    const items: ContextMenuItem[] = [];
    if (!isViewing) {
      items.push({
        label: 'Open Group Chat',
        icon: 'message',
        onSelect: () => openGroupChatById(latestGroup.id),
      });
    }
    items.push({
      label: 'Group Settings',
      icon: 'settings',
      onSelect: () => openSettingsForGroup(false),
    });

    items.push({
      label: inCall
        ? 'Leave Voice Call'
        : activeCall
          ? 'Join Voice Call'
          : 'Start Group Voice Call',
      icon: inCall ? 'phone-off' : 'phone',
      onSelect: () => {
        if (inCall) {
          voiceManager.leaveCall();
        } else {
          voiceManager.startOrJoinCall({ groupId: latestGroup.id }, threadKey);
        }
      },
    });

    if (unreadCount > 0) {
      items.push({
        label: 'Mark as Read',
        icon: 'check-double',
        onSelect: () => markThreadAsRead({ kind: 'group', id: latestGroup.id }),
      });
    }

    items.push(
      {
        label: 'Add Friends',
        icon: 'user-plus',
        disabled: invitableCount === 0,
        hint: invitableCount === 0 ? 'Full' : undefined,
        onSelect: () => {
          openAddFriendsToGroupModal({
            group: latestGroup,
            friends: state.snapshot?.friends ?? [],
            resolveAvatar: resolveProfileAvatar,
            onUpdated: (updatedSnap) => applyLiveSnapshot(updatedSnap),
          });
        },
      },
      {
        label: 'Copy Group Name',
        icon: 'copy',
        onSelect: () => {
          void copyToClipboard(latestGroup.name);
        },
      },
    );

    const muteEntries = buildMuteMenuEntries(snap, threadKey, (updated) =>
      applyLiveSnapshot(updated),
    );
    muteEntries.forEach((entry, idx) => {
      items.push(idx === 0 ? { ...entry, dividerBefore: true } : entry);
    });

    items.push(
      {
        label: 'Hide Group Chat',
        icon: 'eye-off',
        onSelect: () => hideThreadFromSidebar(threadKey),
      },
      {
        label: 'Leave Group',
        icon: 'trash',
        danger: true,
        dividerBefore: true,
        onSelect: () => {
          void confirmAndLeaveGroup(latestGroup);
        },
      },
    );

    openContextMenu({
      anchorEl,
      clientX,
      clientY,
      minWidth: 214,
      items,
    });
  };

  const openDmContextMenu = (
    peer: PublicProfile,
    clientX: number,
    clientY: number,
    anchorEl?: HTMLElement,
  ) => {
    const snap = state.snapshot;
    if (!snap) {
      return;
    }
    const peerKey = peer.username.toLowerCase();
    const selfKey = snap.user.username.toLowerCase();
    const latestPeer = findKnownDmPeer(snap, peerKey) ?? peer;
    const threadKey = dmThreadCacheKey(peerKey);
    const vcThreadKey = [selfKey, peerKey].sort().join('::');
    const isViewing = state.mainView === 'dm' && state.activeDmUsername?.toLowerCase() === peerKey;
    const isFriend = snap.friends.some((f) => f.username.toLowerCase() === peerKey);
    const blockedBySelf = (snap.blockedUsers ?? []).some(
      (b) => b.username.toLowerCase() === peerKey,
    );
    const isBlockedRel = Boolean(latestPeer.isBlockedRelation || blockedBySelf);
    const incomingReq = snap.incomingRequests.find(
      (r) => r.user.username.toLowerCase() === peerKey,
    );
    const outgoingReq = snap.outgoingRequests.find(
      (r) => r.user.username.toLowerCase() === peerKey,
    );
    const unreadCount = snap.unreadCounts?.[peerKey] ?? 0;
    const hasHistory = (dmMessagesByThread.get(threadKey)?.length ?? 0) > 0;
    const inCall = voiceManager.getActiveCallThreadKey() === vcThreadKey;
    const activeCall = Boolean(voiceManager.getCallStateForThread(vcThreadKey)?.active);

    const items: ContextMenuItem[] = [];
    if (!isViewing) {
      items.push({
        label: 'Open DM',
        icon: 'message',
        onSelect: () => openDirectMessageWithUser(latestPeer.username),
      });
    }

    items.push({
      label: 'View Profile',
      icon: 'user',
      onSelect: () => {
        openProfileModalForUser(latestPeer);
      },
    });

    if (inCall || activeCall || !isBlockedRel) {
      items.push({
        label: inCall
          ? 'Leave Voice Call'
          : activeCall
            ? 'Join Active Call'
            : 'Start Voice Call',
        icon: inCall ? 'phone-off' : 'phone',
        onSelect: () => {
          if (inCall) {
            voiceManager.leaveCall();
          } else {
            voiceManager.startOrJoinCall({ peerUsername: latestPeer.username }, vcThreadKey);
          }
        },
      });
    }

    if (unreadCount > 0) {
      items.push({
        label: 'Mark as Read',
        icon: 'check-double',
        onSelect: () => markThreadAsRead({ kind: 'dm', id: latestPeer.username }),
      });
    }

    items.push({
      label: 'Copy Username',
      icon: 'copy',
      onSelect: () => {
        void copyToClipboard(latestPeer.username);
      },
    });

    const muteEntries = buildMuteMenuEntries(snap, threadKey, (updated) =>
      applyLiveSnapshot(updated),
    );
    muteEntries.forEach((entry, idx) => {
      items.push(idx === 0 ? { ...entry, dividerBefore: true } : entry);
    });

    items.push({
      label: 'Hide DM',
      icon: 'eye-off',
      onSelect: () => hideThreadFromSidebar(threadKey),
    });

    let needRelationDivider = true;
    const pushRelationItem = (entry: ContextMenuItem) => {
      items.push(needRelationDivider ? { ...entry, dividerBefore: true } : entry);
      needRelationDivider = false;
    };

    if (isFriend) {
      pushRelationItem({
        label: 'Remove Friend',
        icon: 'user-minus',
        danger: true,
        onSelect: () => {
          void confirmFriendRelationAction('remove', latestPeer, (updated) => {
            applyLiveSnapshot(updated);
          });
        },
      });
    } else if (incomingReq) {
      pushRelationItem({
        label: 'Accept Friend Request',
        icon: 'check',
        onSelect: () => {
          void apiAcceptFriendRequest(latestPeer.username).then((res) => {
            if (res.ok && res.snapshot) {
              applyLiveSnapshot(res.snapshot);
            }
          });
        },
      });
      pushRelationItem({
        label: 'Decline Friend Request',
        icon: 'trash',
        danger: true,
        onSelect: () => {
          void apiDeclineFriendRequest(latestPeer.username).then((res) => {
            if (res.ok && res.snapshot) {
              applyLiveSnapshot(res.snapshot);
            }
          });
        },
      });
    } else if (outgoingReq) {
      pushRelationItem({
        label: 'Cancel Friend Request',
        icon: 'user-minus',
        onSelect: () => {
          void apiCancelFriendRequest(latestPeer.username).then((res) => {
            if (res.ok && res.snapshot) {
              applyLiveSnapshot(res.snapshot);
            }
          });
        },
      });
    } else if (!isBlockedRel) {
      pushRelationItem({
        label: 'Add Friend',
        icon: 'user-plus',
        onSelect: () => {
          void apiSendFriendRequest(latestPeer.username).then((res) => {
            if (res.ok && res.snapshot) {
              applyLiveSnapshot(res.snapshot);
            }
          });
        },
      });
    }

    if (!isFriend && !hasHistory) {
      pushRelationItem({
        label: 'Close DM',
        icon: 'eye-off',
        onSelect: () => {
          if (state.mainView === 'dm' && state.activeDmUsername?.toLowerCase() === peerKey) {
            state.mainView = 'friends';
            state.activeDmUsername = null;
          }
          void apiCloseDm(latestPeer.username).then((res) => {
            if (res.ok && res.snapshot) {
              applyLiveSnapshot(res.snapshot);
            }
          });
        },
      });
    }

    if (blockedBySelf) {
      pushRelationItem({
        label: 'Unblock User',
        icon: 'check',
        onSelect: () => {
          void apiUnblockUser(latestPeer.username).then((res) => {
            if (res.ok && res.snapshot) {
              applyLiveSnapshot(res.snapshot);
            }
          });
        },
      });
    } else {
      pushRelationItem({
        label: 'Block',
        icon: 'block',
        danger: true,
        onSelect: () => {
          void confirmFriendRelationAction('block', latestPeer, (updated) => {
            applyLiveSnapshot(updated);
          });
        },
      });
    }

    openContextMenu({
      anchorEl,
      clientX,
      clientY,
      minWidth: 214,
      items,
    });
  };

  const syncSidebarNavAndDms = () => {
    const snap = state.snapshot;
    if (!snap) {
      return;
    }

    syncDocumentTitle();

    friendsNavBtn.classList.toggle('sidebar-friends-btn--active', state.mainView === 'friends');
    const pendingInCount = snap.incomingRequests.length;
    if (pendingInCount > 0) {
      friendsNavBadge.hidden = false;
      friendsNavBadge.textContent = pendingInCount > 99 ? '99+' : String(pendingInCount);
      friendsNavBadge.classList.toggle('sidebar-friends-badge--wide', pendingInCount > 9);
    } else {
      friendsNavBadge.hidden = true;
    }

    dmListEl.replaceChildren();

    const hiddenSet = new Set(
      (snap.hiddenThreads ?? []).map((k) => (k.startsWith('dm:') ? k.toLowerCase() : k)),
    );
    const activityMap = snap.threadActivity ?? {};
    const getSortTs = (threadKey: string, fallbackTs = 0): number => {
      const serverTs = activityMap[threadKey] ?? 0;
      const list = dmMessagesByThread.get(threadKey);
      const cachedTs = list && list.length > 0 ? list[list.length - 1].timestamp : 0;
      return Math.max(serverTs, cachedTs, fallbackTs);
    };

    type SidebarEntry =
      | { kind: 'group'; group: GroupDmInfo; sortTs: number }
      | { kind: 'dm'; peer: PublicProfile; isFriend: boolean; sortTs: number };

    const friendSet = new Set(snap.friends.map((f) => f.username.toLowerCase()));
    const blockedSet = new Set((snap.blockedUsers ?? []).map((b) => b.username.toLowerCase()));

    const entries: SidebarEntry[] = [];
    for (const group of snap.groups ?? []) {
      const gKey = groupThreadCacheKey(group.id);
      if (hiddenSet.has(gKey)) {
        continue;
      }
      entries.push({
        kind: 'group',
        group,
        sortTs: getSortTs(gKey, group.createdAt),
      });
    }
    for (const peer of snap.friends) {
      const dKey = dmThreadCacheKey(peer.username);
      if (hiddenSet.has(dKey)) {
        continue;
      }
      entries.push({
        kind: 'dm',
        peer,
        isFriend: true,
        sortTs: getSortTs(dKey, 0),
      });
    }
    for (const peer of snap.dmPeers ?? []) {
      const pKey = peer.username.toLowerCase();
      if (friendSet.has(pKey)) {
        continue;
      }
      const dKey = dmThreadCacheKey(pKey);
      if (hiddenSet.has(dKey)) {
        continue;
      }
      entries.push({
        kind: 'dm',
        peer,
        isFriend: false,
        sortTs: getSortTs(dKey, 0),
      });
    }

    entries.sort((a, b) => {
      if (b.sortTs !== a.sortTs) {
        return b.sortTs - a.sortTs;
      }
      const aName = a.kind === 'group' ? a.group.name : a.peer.displayName;
      const bName = b.kind === 'group' ? b.group.name : b.peer.displayName;
      return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
    });

    for (const entry of entries) {
      if (entry.kind === 'group') {
        const group = entry.group;
        const gKey = groupThreadCacheKey(group.id);
        const grpBtn = document.createElement('div');
        grpBtn.setAttribute('role', 'button');
        grpBtn.tabIndex = 0;
        grpBtn.className = 'sidebar-dm-item sidebar-dm-item--group';
        grpBtn.dataset.groupId = group.id;
        const isSelected = state.mainView === 'group' && state.activeGroupId === group.id;
        if (isSelected) {
          grpBtn.classList.add('sidebar-dm-item--active');
        }

        const notifMode = getThreadNotificationMode(snap, gKey);
        const isMuted = notifMode === 'muted';
        if (isMuted) {
          grpBtn.classList.add('sidebar-dm-item--muted');
        }

        const unreadCount = snap.groupUnreadCounts?.[group.id] ?? 0;
        const mentionCount = snap.groupUnreadMentions?.[group.id] ?? 0;
        if ((unreadCount > 0 || mentionCount > 0) && !isSelected) {
          grpBtn.classList.add('sidebar-dm-item--unread');
        }

        const avWrap = document.createElement('span');
        avWrap.className = 'sidebar-dm-avatar-wrap';
        const avImg = document.createElement('img');
        avImg.className = 'sidebar-dm-avatar';
        avImg.src = resolveGroupAvatar(group);
        avImg.alt = `${group.name} group icon`;
        avWrap.appendChild(avImg);
        grpBtn.appendChild(avWrap);

        const grpText = document.createElement('span');
        grpText.className = 'sidebar-dm-meta';
        const grpName = document.createElement('span');
        grpName.className = 'sidebar-dm-name';
        grpName.textContent = group.name;
        const grpSub = document.createElement('span');
        grpSub.className = 'sidebar-dm-sub';
        grpSub.textContent = `${group.members.length} Member${group.members.length === 1 ? '' : 's'}`;
        grpText.appendChild(grpName);
        grpText.appendChild(grpSub);
        grpBtn.appendChild(grpText);

        if (notifMode !== 'all') {
          const muteUntil = getThreadMuteUntil(snap, gKey);
          const mutedMark = document.createElement('span');
          mutedMark.className = 'sidebar-dm-muted-icon';
          mutedMark.title =
            notifMode === 'mentions'
              ? 'Only @mentions'
              : `Muted (${formatMuteRemaining(muteUntil ?? -1)})`;
          mutedMark.appendChild(createMenuIconSvg('bell-off', 13));
          grpBtn.appendChild(mutedMark);
        }

        if (mentionCount > 0 && !isSelected) {
          const mentionBadge = document.createElement('span');
          mentionBadge.className = 'sidebar-dm-unread sidebar-dm-unread--mention';
          const lbl = mentionCount > 99 ? '@99+' : `@${mentionCount}`;
          if (lbl.length > 2) {
            mentionBadge.classList.add('sidebar-dm-unread--wide');
          }
          mentionBadge.textContent = lbl;
          mentionBadge.setAttribute('aria-label', `${mentionCount} unread mentions`);
          grpBtn.appendChild(mentionBadge);
        } else if (unreadCount > 0 && !isSelected) {
          const unreadBadge = document.createElement('span');
          unreadBadge.className = isMuted
            ? 'sidebar-dm-unread sidebar-dm-unread--muted'
            : 'sidebar-dm-unread';
          if (unreadCount > 9) {
            unreadBadge.classList.add('sidebar-dm-unread--wide');
          }
          unreadBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
          unreadBadge.setAttribute('aria-label', `${unreadCount} unread messages`);
          grpBtn.appendChild(unreadBadge);
        }

        const leaveGroupBtn = document.createElement('button');
        leaveGroupBtn.type = 'button';
        leaveGroupBtn.className = 'sidebar-group-leave-btn';
        leaveGroupBtn.dataset.action = 'leave-group-x';
        leaveGroupBtn.title = `Leave ${group.name}`;
        leaveGroupBtn.setAttribute('aria-label', `Leave ${group.name}`);
        leaveGroupBtn.appendChild(createCloseIconSvg(13));
        leaveGroupBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          void confirmAndLeaveGroup(group);
        });
        grpBtn.appendChild(leaveGroupBtn);

        grpBtn.addEventListener('click', () => {
          openGroupChatById(group.id);
        });
        grpBtn.addEventListener('keydown', (e) => {
          if (e.target !== grpBtn) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openGroupChatById(group.id);
          }
        });
        grpBtn.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openGroupContextMenu(group, e.clientX, e.clientY);
        });

        dmListEl.appendChild(grpBtn);
        continue;
      }

      const { peer, isFriend } = entry;
      const friendKey = peer.username.toLowerCase();
      const dKey = dmThreadCacheKey(friendKey);
      const dmBtn = document.createElement('button');
      dmBtn.type = 'button';
      dmBtn.className = 'sidebar-dm-item';
      const isSelected =
        state.mainView === 'dm' &&
        state.activeDmUsername?.toLowerCase() === friendKey;
      if (isSelected) {
        dmBtn.classList.add('sidebar-dm-item--active');
      }

      const notifMode = getThreadNotificationMode(snap, dKey);
      const isMuted = notifMode === 'muted';
      if (isMuted) {
        dmBtn.classList.add('sidebar-dm-item--muted');
      }

      const unreadCount = snap.unreadCounts?.[friendKey] ?? 0;
      const mentionCount = snap.unreadMentions?.[friendKey] ?? 0;
      if ((unreadCount > 0 || mentionCount > 0) && !isSelected) {
        dmBtn.classList.add('sidebar-dm-item--unread');
      }

      const dmAvatarWrap = document.createElement('span');
      dmAvatarWrap.className = 'sidebar-dm-avatar-wrap';

      const dmAvatar = document.createElement('img');
      dmAvatar.className = 'sidebar-dm-avatar';
      dmAvatar.src = resolveProfileAvatar(peer);
      dmAvatar.alt = `${peer.displayName} profile picture`;
      dmAvatarWrap.appendChild(dmAvatar);

      if (!peer.isProfilePrivate) {
        const dmStatus = document.createElement('span');
        dmStatus.className = 'sidebar-dm-status';
        dmStatus.appendChild(createStatusGlyph(peer.status, 9));
        dmAvatarWrap.appendChild(dmStatus);
      }

      dmBtn.appendChild(dmAvatarWrap);

      const dmText = document.createElement('span');
      dmText.className = 'sidebar-dm-meta';

      const dmName = document.createElement('span');
      dmName.className = 'sidebar-dm-name';
      dmName.textContent = peer.displayName;
      dmText.appendChild(dmName);

      if (peer.isProfilePrivate) {
        const dmSub = document.createElement('span');
        dmSub.className = 'sidebar-dm-sub';
        dmSub.textContent = blockedSet.has(friendKey) ? 'Blocked' : 'Private Profile';
        dmText.appendChild(dmSub);
      } else {
        const customStatusLine = formatCustomStatusLine(peer);
        if (customStatusLine) {
          const dmSub = document.createElement('span');
          dmSub.className = 'sidebar-dm-sub';
          setTwemojiText(dmSub, customStatusLine);
          dmText.appendChild(dmSub);
        } else if (!isFriend) {
          const dmSub = document.createElement('span');
          dmSub.className = 'sidebar-dm-sub';
          dmSub.textContent = blockedSet.has(friendKey) ? 'Blocked' : 'Not Friends';
          dmText.appendChild(dmSub);
        }
      }

      dmBtn.appendChild(dmText);

      if (notifMode !== 'all') {
        const muteUntil = getThreadMuteUntil(snap, dKey);
        const mutedMark = document.createElement('span');
        mutedMark.className = 'sidebar-dm-muted-icon';
        mutedMark.title =
          notifMode === 'mentions'
            ? 'Only @mentions'
            : `Muted (${formatMuteRemaining(muteUntil ?? -1)})`;
        mutedMark.appendChild(createMenuIconSvg('bell-off', 13));
        dmBtn.appendChild(mutedMark);
      }

      if (mentionCount > 0 && !isSelected) {
        const mentionBadge = document.createElement('span');
        mentionBadge.className = 'sidebar-dm-unread sidebar-dm-unread--mention';
        const lbl = mentionCount > 99 ? '@99+' : `@${mentionCount}`;
        if (lbl.length > 2) {
          mentionBadge.classList.add('sidebar-dm-unread--wide');
        }
        mentionBadge.textContent = lbl;
        mentionBadge.setAttribute('aria-label', `${mentionCount} unread mentions`);
        dmBtn.appendChild(mentionBadge);
      } else if (unreadCount > 0 && !isSelected) {
        const unreadBadge = document.createElement('span');
        unreadBadge.className = isMuted
          ? 'sidebar-dm-unread sidebar-dm-unread--muted'
          : 'sidebar-dm-unread';
        if (unreadCount > 9) {
          unreadBadge.classList.add('sidebar-dm-unread--wide');
        }
        unreadBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
        unreadBadge.setAttribute('aria-label', `${unreadCount} unread messages`);
        dmBtn.appendChild(unreadBadge);
      }

      dmBtn.addEventListener('click', () => {
        openDirectMessageWithUser(peer.username);
      });

      dmBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openDmContextMenu(peer, e.clientX, e.clientY);
      });

      dmListEl.appendChild(dmBtn);
    }
  };

  type ConversationTarget =
    | { kind: 'dm'; friend: PublicProfile }
    | { kind: 'group'; group: GroupDmInfo };

  const renderDmView = (initialTarget: ConversationTarget) => {
    if (!state.snapshot) {
      return;
    }

    const isGroup = initialTarget.kind === 'group';
    const peerKey = initialTarget.kind === 'dm' ? initialTarget.friend.username.toLowerCase() : '';
    const groupId = initialTarget.kind === 'group' ? initialTarget.group.id : '';
    const cacheKey = isGroup ? groupThreadCacheKey(groupId) : dmThreadCacheKey(peerKey);
    const apiTarget: ThreadTarget = isGroup ? { groupId } : { peerUsername: peerKey };
    const readTarget = isGroup
      ? ({ kind: 'group', id: groupId } as const)
      : ({ kind: 'dm', id: peerKey } as const);

    chatArea.replaceChildren();

    const dmHeader = document.createElement('header');
    dmHeader.className = 'dm-header';

    const mobileBackBtn = document.createElement('button');
    mobileBackBtn.type = 'button';
    mobileBackBtn.className = 'dm-mobile-back-btn';
    mobileBackBtn.title = 'Back to Chats';
    mobileBackBtn.setAttribute('aria-label', 'Back to Chats');
    mobileBackBtn.appendChild(createMobileBackArrowSvg(20));

    const mobileBackBadge = document.createElement('span');
    mobileBackBadge.className = 'dm-mobile-back-badge';
    mobileBackBadge.hidden = true;
    mobileBackBtn.appendChild(mobileBackBadge);

    const syncMobileBackBadge = () => {
      const snap = state.snapshot;
      if (!snap) {
        mobileBackBadge.hidden = true;
        return;
      }
      let otherUnread = 0;
      for (const [k, cnt] of Object.entries(snap.unreadCounts ?? {})) {
        if (cnt > 0 && (isGroup || k.toLowerCase() !== peerKey)) {
          otherUnread += cnt;
        }
      }
      for (const [gid, cnt] of Object.entries(snap.groupUnreadCounts ?? {})) {
        if (cnt > 0 && (!isGroup || gid !== groupId)) {
          otherUnread += cnt;
        }
      }
      mobileBackBadge.hidden = otherUnread <= 0;
      if (otherUnread > 0) {
        mobileBackBadge.textContent = otherUnread > 99 ? '99+' : String(otherUnread);
      }
    };
    mobileBackBadgeSyncer = syncMobileBackBadge;
    syncMobileBackBadge();

    mobileBackBtn.addEventListener('click', () => {
      mobileInChat = false;
      mobileHubTab = 'chats';
      syncMobileChrome();
    });
    dmHeader.appendChild(mobileBackBtn);

    const headerAvatarWrap = document.createElement('span');
    headerAvatarWrap.className = 'dm-header-avatar-wrap';
    const headerAvatar = document.createElement('img');
    headerAvatar.className = 'dm-header-avatar';
    headerAvatarWrap.appendChild(headerAvatar);

    const headerStatus = document.createElement('span');
    headerStatus.className = 'dm-header-status';
    if (!isGroup) {
      headerAvatarWrap.appendChild(headerStatus);
    }
    dmHeader.appendChild(headerAvatarWrap);

    const headerName = document.createElement('span');
    headerName.className = 'dm-header-name';
    dmHeader.appendChild(headerName);

    const headerUsername = document.createElement('span');
    headerUsername.className = 'dm-header-username';
    dmHeader.appendChild(headerUsername);

    if (!isGroup && initialTarget.kind === 'dm') {
      const openDmHeaderPeerProfile = (e: Event) => {
        e.stopPropagation();
        const latest =
          resolvePublicProfileForUsername(peerKey, {
            displayName: initialTarget.friend.displayName,
            avatarPreset: initialTarget.friend.avatarPreset,
            avatarDataUrl: initialTarget.friend.avatarDataUrl,
          }) ?? initialTarget.friend;
        openProfileModalForUser(latest);
      };
      for (const triggerEl of [headerAvatarWrap, headerName, headerUsername]) {
        triggerEl.classList.add('dm-header-profile-trigger');
        triggerEl.setAttribute('role', 'button');
        triggerEl.tabIndex = 0;
        triggerEl.title = `View ${initialTarget.friend.displayName}'s profile`;
        triggerEl.setAttribute('aria-label', `View ${initialTarget.friend.displayName}'s profile`);
        triggerEl.addEventListener('click', openDmHeaderPeerProfile);
        triggerEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openDmHeaderPeerProfile(e);
          }
        });
      }
    }

    const dmBodySplit = document.createElement('div');
    dmBodySplit.className = 'dm-body-split';

    const dmThreadPane = document.createElement('div');
    dmThreadPane.className = 'dm-thread-pane';

    const dmProfilePanel =
      initialTarget.kind === 'dm'
        ? createDmProfilePanel({
            initialFriend: initialTarget.friend,
            resolveAvatar: resolveProfileAvatar,
            getSnapshot: () => state.snapshot!,
            onOpenDm: openDirectMessageWithUser,
            onOpenGroup: openGroupChatById,
            onReplyToStatus: handleReplyToCustomStatus,
            onSnapshotUpdated: (nextSnapshot) => {
              applyLiveSnapshot(nextSnapshot);
            },
          })
        : null;

    const groupMembersPanel =
      initialTarget.kind === 'group'
        ? createGroupMembersPanel({
            initialGroup: initialTarget.group,
            selfUsername: state.snapshot.user.username,
            getSnapshot: () => state.snapshot,
            resolveAvatar: resolveProfileAvatar,
            onOpenDmWithMember: (uname) => {
              openDirectMessageWithUser(uname);
            },
            onViewMemberProfile: (member) => {
              openProfileModalForUser(member);
            },
            onSnapshotUpdated: (nextSnapshot) => {
              applyLiveSnapshot(nextSnapshot);
            },
          })
        : null;

    const headerActions = document.createElement('div');
    headerActions.className = 'dm-header-actions';
    headerActions.appendChild(createHeaderUpdateAvailableButton());

    const vcThreadKey = isGroup
      ? `group:${groupId}`
      : [state.snapshot.user.username.toLowerCase(), peerKey].sort().join('::');

    const vcCallBtn = document.createElement('button');
    vcCallBtn.type = 'button';
    vcCallBtn.className = 'dm-header-icon-btn';
    vcCallBtn.appendChild(createPhoneCallIconSvg(18));
    headerActions.appendChild(vcCallBtn);

    const muteHeaderBtn = document.createElement('button');
    muteHeaderBtn.type = 'button';
    muteHeaderBtn.className = 'dm-header-icon-btn';
    const syncHeaderMuteButton = () => {
      const mode = getThreadNotificationMode(state.snapshot, cacheKey);
      const muted = mode === 'muted';
      const mentionsOnly = mode === 'mentions';
      const until = getThreadMuteUntil(state.snapshot, cacheKey);
      muteHeaderBtn.replaceChildren(
        createMenuIconSvg(muted || mentionsOnly ? 'bell-off' : 'bell', 18),
      );
      muteHeaderBtn.classList.toggle('dm-header-icon-btn--muted', muted);
      muteHeaderBtn.title = muted
        ? `Notifications Muted (${formatMuteRemaining(until ?? -1)})`
        : mentionsOnly
          ? 'Only @mentions'
          : 'Mute Notifications';
      muteHeaderBtn.setAttribute('aria-label', muteHeaderBtn.title);
    };
    muteHeaderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openContextMenu({
        anchorEl: muteHeaderBtn,
        minWidth: 214,
        items: buildMuteMenuEntries(state.snapshot, cacheKey, (updated) =>
          applyLiveSnapshot(updated),
        ),
      });
    });
    syncHeaderMuteButton();
    headerActions.appendChild(muteHeaderBtn);

    dmHeader.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!state.snapshot) {
        return;
      }
      if (initialTarget.kind === 'group') {
        const latestGroup =
          state.snapshot.groups?.find((g) => g.id === groupId) ?? initialTarget.group;
        openGroupContextMenu(latestGroup, e.clientX, e.clientY);
      } else {
        const latestPeer = findKnownDmPeer(state.snapshot, peerKey) ?? initialTarget.friend;
        openDmContextMenu(latestPeer, e.clientX, e.clientY);
      }
    });

    const pinHeaderBtn = document.createElement('button');
    pinHeaderBtn.type = 'button';
    pinHeaderBtn.className = 'dm-header-icon-btn';
    pinHeaderBtn.title = 'Pinned Messages';
    pinHeaderBtn.setAttribute('aria-label', 'Pinned Messages');
    pinHeaderBtn.appendChild(createPinIconSvg(18, false));

    const pinDot = document.createElement('span');
    pinDot.className = 'dm-header-pin-dot';
    pinDot.hidden = true;
    pinHeaderBtn.appendChild(pinDot);
    headerActions.appendChild(pinHeaderBtn);

    const searchHeaderBtn = document.createElement('button');
    searchHeaderBtn.type = 'button';
    searchHeaderBtn.className = 'dm-header-icon-btn';
    searchHeaderBtn.title = 'Search Messages';
    searchHeaderBtn.setAttribute('aria-label', 'Search Messages');
    searchHeaderBtn.appendChild(createSearchIconSvg(18));
    searchHeaderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isSearchPopoverOpenFor(searchHeaderBtn)) {
        closeActiveSearchPopover();
        return;
      }
      closeActivePinnedPopover();
      const latestTitle =
        initialTarget.kind === 'group'
          ? state.snapshot?.groups?.find((g) => g.id === groupId)?.name ?? initialTarget.group.name
          : (findKnownDmPeer(state.snapshot!, peerKey) ?? initialTarget.friend).displayName;
      searchHeaderBtn.classList.add('dm-header-icon-btn--active');
      openDmSearchPopover({
        anchorEl: searchHeaderBtn,
        threadTitle: latestTitle,
        getMessages: () => dmMessagesByThread.get(cacheKey) ?? [],
        resolveAvatar: resolveProfileAvatar,
        formatTime: formatMessageTime,
        onJumpToMessage: jumpToMessageById,
        onClose: () => {
          searchHeaderBtn.classList.remove('dm-header-icon-btn--active');
        },
      });
    });
    headerActions.appendChild(searchHeaderBtn);

    const syncPinHeaderBadge = () => {
      const list = dmMessagesByThread.get(cacheKey) ?? [];
      syncSeenPinsOnThreadList(cacheKey, list, historyLoaded);
      if (isPinnedPopoverOpenFor(pinHeaderBtn)) {
        markThreadPinsSeen(cacheKey, list);
      }
      const totalPinned = list.filter((m) => Boolean(m.pinned)).length;
      const unseenCount = countUnseenPins(cacheKey, list);
      pinDot.hidden = unseenCount === 0;
      pinHeaderBtn.title =
        totalPinned > 0
          ? unseenCount > 0
            ? `Pinned Messages (${unseenCount} new)`
            : `Pinned Messages (${totalPinned})`
          : 'Pinned Messages';
    };

    let groupSettingsBtn: HTMLButtonElement | null = null;
    if (initialTarget.kind === 'group') {
      const addFriendsBtn = document.createElement('button');
      addFriendsBtn.type = 'button';
      addFriendsBtn.className = 'dm-header-icon-btn';
      addFriendsBtn.dataset.action = 'group-add-friends';
      addFriendsBtn.title = 'Add Friends to Group';
      addFriendsBtn.setAttribute('aria-label', 'Add Friends to Group');
      addFriendsBtn.appendChild(createMenuIconSvg('user-plus', 18));
      addFriendsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const latestGroup =
          state.snapshot?.groups?.find((g) => g.id === groupId) ?? initialTarget.group;
        openAddFriendsToGroupModal({
          group: latestGroup,
          friends: state.snapshot?.friends ?? [],
          resolveAvatar: resolveProfileAvatar,
          onUpdated: (updatedSnap) => applyLiveSnapshot(updatedSnap),
        });
      });
      headerActions.appendChild(addFriendsBtn);

      const kebabBtn = document.createElement('button');
      kebabBtn.type = 'button';
      kebabBtn.className = 'dm-header-icon-btn';
      kebabBtn.title = 'Group Settings';
      kebabBtn.setAttribute('aria-label', 'Group Settings');
      kebabBtn.appendChild(createMoreVerticalSvg(18));
      kebabBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const latestGroup =
          state.snapshot?.groups?.find((g) => g.id === groupId) ?? initialTarget.group;
        openGroupSettingsModal({
          group: latestGroup,
          friends: state.snapshot?.friends ?? [],
          resolveAvatar: resolveProfileAvatar,
          onUpdated: (updatedSnap) => applyLiveSnapshot(updatedSnap),
          onLeftGroup: (leftId, updatedSnap) => {
            if (state.activeGroupId === leftId) {
              state.mainView = 'friends';
              state.activeGroupId = null;
            }
            applyLiveSnapshot(updatedSnap);
            renderMainArea();
          },
        });
      });
      groupSettingsBtn = kebabBtn;
      headerActions.appendChild(kebabBtn);
    }

    const panelToggleBtn = document.createElement('button');
    panelToggleBtn.type = 'button';
    panelToggleBtn.className = 'dm-header-icon-btn';
    panelToggleBtn.appendChild(
      isGroup ? createMembersIconSvg(18) : createProfilePanelToggleIconSvg(18),
    );

    let mobileSideSheetOpen = false;
    const isMobileViewport = () => window.innerWidth <= 768;

    const mobileSheetBackdrop = document.createElement('div');
    mobileSheetBackdrop.className = 'dm-mobile-sheet-backdrop';
    mobileSheetBackdrop.hidden = true;
    mobileSheetBackdrop.addEventListener('click', () => {
      mobileSideSheetOpen = false;
      syncSidePanelToggleState();
    });

    const syncSidePanelToggleState = () => {
      const mobile = isMobileViewport();
      const shown = mobile
        ? mobileSideSheetOpen
        : isGroup
          ? state.showGroupMembersPanel
          : state.showDmProfilePanel;
      panelToggleBtn.classList.toggle('dm-header-icon-btn--active', shown);
      const label = isGroup
        ? shown
          ? 'Hide Member List'
          : 'Show Member List'
        : shown
          ? 'Hide User Profile'
          : 'Show User Profile';
      panelToggleBtn.title = label;
      panelToggleBtn.setAttribute('aria-label', label);
      panelToggleBtn.setAttribute('aria-pressed', String(shown));
      dmBodySplit.classList.toggle('dm-body-split--mobile-sheet-open', mobile && shown);
      mobileSheetBackdrop.hidden = !(mobile && shown);
      if (dmProfilePanel) {
        dmProfilePanel.element.hidden = !shown;
      }
      if (groupMembersPanel) {
        groupMembersPanel.element.hidden = !shown;
      }
    };

    panelToggleBtn.addEventListener('click', () => {
      if (isMobileViewport()) {
        mobileSideSheetOpen = !mobileSideSheetOpen;
      } else if (isGroup) {
        state.showGroupMembersPanel = !state.showGroupMembersPanel;
      } else {
        state.showDmProfilePanel = !state.showDmProfilePanel;
      }
      syncSidePanelToggleState();
    });
    syncSidePanelToggleState();
    headerActions.appendChild(panelToggleBtn);

    dmHeader.appendChild(headerActions);
    chatArea.appendChild(dmHeader);

    const dmMessagesHost = document.createElement('div');
    dmMessagesHost.className = 'dm-messages-host';

    const chatMessages = document.createElement('div');
    chatMessages.className = 'chat-messages';

    const historyTopBanner = document.createElement('div');
    historyTopBanner.className = 'dm-history-banner';
    historyTopBanner.hidden = true;

    const messageList = document.createElement('div');
    messageList.className = 'chat-messages-list';

    const jumpBar = document.createElement('div');
    jumpBar.className = 'dm-jump-bar';
    jumpBar.hidden = true;

    const jumpBarLabel = document.createElement('span');
    jumpBarLabel.className = 'dm-jump-label';

    const jumpLatestBtn = document.createElement('button');
    jumpLatestBtn.type = 'button';
    jumpLatestBtn.className = 'dm-jump-btn';
    jumpLatestBtn.textContent = 'Jump to Latest ↓';

    jumpBar.appendChild(jumpBarLabel);
    jumpBar.appendChild(jumpLatestBtn);

    let editingMessageId: string | null = null;
    let replyingTo: ChatMessage | null = null;
    const GROUP_WINDOW_MS = 5 * 60 * 1000;
    const MAX_ATTACHMENTS = 10;

    let initialUnreadRemaining = isGroup
      ? state.snapshot.groupUnreadCounts?.[groupId] ?? 0
      : state.snapshot.unreadCounts?.[peerKey] ?? 0;
    let unreadMarkerMessageId: string | null = null;
    const preHydrated = dmHistoryHydratedAt.has(cacheKey);
    let historyLoaded = preHydrated;
    let initialScrollApplied = false;
    let scrolledUpNewCount = 0;
    let loadingOlderMessages = false;
    let skipBottomScrollOnce = false;
    const savedThreadScroll = dmScrollStateByThread.get(cacheKey);
    let pinnedToBottom = savedThreadScroll ? savedThreadScroll.atBottom : true;
    let programmaticScrollUntil = 0;

    const isAtBottomNow = (): boolean => {
      if (!chatMessages.isConnected || chatMessages.clientHeight <= 0) {
        return pinnedToBottom;
      }
      return chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight <= 64;
    };

    const hasUnreadOnThisThread = (): boolean => {
      const snap = state.snapshot;
      if (!snap) return false;
      if (isGroup) {
        return (
          (snap.groupUnreadCounts?.[groupId] ?? 0) > 0 ||
          (snap.groupUnreadMentions?.[groupId] ?? 0) > 0
        );
      }
      return (
        (snap.unreadCounts?.[peerKey] ?? 0) > 0 || (snap.unreadMentions?.[peerKey] ?? 0) > 0
      );
    };

    const scrollToBottomPinned = () => {
      pinnedToBottom = true;
      if (chatMessages.isConnected && chatMessages.clientHeight > 0) {
        const gap = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight;
        if (gap > 1) {
          programmaticScrollUntil = Date.now() + 80;
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        dmScrollStateByThread.set(cacheKey, { atBottom: true, scrollTop: chatMessages.scrollTop });
      } else {
        dmScrollStateByThread.set(cacheKey, { atBottom: true, scrollTop: 0 });
      }
    };

    activeDmIsAtBottom = () => pinnedToBottom || isAtBottomNow();

    const applyInitialScrollPosition = () => {
      if (!chatMessages.isConnected || chatMessages.clientHeight <= 0) {
        return;
      }
      initialScrollApplied = true;
      const dividerEl = messageList.querySelector('.dm-unread-divider') as HTMLElement | null;
      if (dividerEl) {
        pinnedToBottom = false;
        programmaticScrollUntil = Date.now() + 100;
        const maxTop = Math.max(0, chatMessages.scrollHeight - chatMessages.clientHeight);
        const targetTop = Math.max(0, Math.min(maxTop, dividerEl.offsetTop - 96));
        chatMessages.scrollTop = targetTop;
        const atBot =
          chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight <= 64;
        pinnedToBottom = atBot;
        dmScrollStateByThread.set(cacheKey, { atBottom: atBot, scrollTop: chatMessages.scrollTop });
      } else if (savedThreadScroll && !savedThreadScroll.atBottom) {
        pinnedToBottom = false;
        programmaticScrollUntil = Date.now() + 100;
        const maxTop = Math.max(0, chatMessages.scrollHeight - chatMessages.clientHeight);
        const targetTop = Math.max(0, Math.min(maxTop, savedThreadScroll.scrollTop));
        chatMessages.scrollTop = targetTop;
        const atBot =
          chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight <= 64;
        pinnedToBottom = atBot;
        dmScrollStateByThread.set(cacheKey, { atBottom: atBot, scrollTop: chatMessages.scrollTop });
      } else {
        scrollToBottomPinned();
      }
    };

    const syncHistoryBanner = () => {
      if (!historyLoaded) {
        historyTopBanner.hidden = true;
        return;
      }
      if (loadingOlderMessages) {
        historyTopBanner.hidden = false;
        historyTopBanner.textContent = 'Loading older messages...';
        return;
      }
      if (dmHasMoreByThread.get(cacheKey)) {
        historyTopBanner.hidden = false;
        historyTopBanner.textContent = 'Scroll up to load older messages';
        return;
      }
      const hasAny = (dmMessagesByThread.get(cacheKey)?.length ?? 0) > 0;
      if (hasAny) {
        historyTopBanner.hidden = false;
        historyTopBanner.textContent = isGroup
          ? 'This is the beginning of the group chat history'
          : 'This is the beginning of your direct message history';
      } else {
        historyTopBanner.hidden = true;
      }
    };

    const flashMessageEl = (targetEl: HTMLElement) => {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetEl.classList.remove('chat-message--jump-flash');
      void targetEl.offsetWidth;
      targetEl.classList.add('chat-message--jump-flash');
      window.setTimeout(() => {
        targetEl.classList.remove('chat-message--jump-flash');
      }, 1300);
    };

    const jumpToMessageById = (targetId: string) => {
      const findMounted = () =>
        Array.from(messageList.children).find(
          (node) => node instanceof HTMLElement && node.dataset.msgId === targetId,
        ) as HTMLElement | undefined;

      const mounted = findMounted();
      if (mounted) {
        flashMessageEl(mounted);
        return;
      }

      void apiFetchDmHistory(apiTarget, { around: targetId }).then((res) => {
        if (!res.ok || !res.messages || !isThreadCurrentlyViewed(cacheKey)) {
          return;
        }
        mergeDmHistory(cacheKey, res.messages);
        if (res.hasMore !== undefined) {
          dmHasMoreByThread.set(cacheKey, Boolean(res.hasMore));
        }
        skipBottomScrollOnce = true;
        syncDmThread();
        requestAnimationFrame(() => {
          const el = findMounted();
          if (el) {
            flashMessageEl(el);
          }
        });
      });
    };

    const toggleMessagePin = async (targetMsg: ChatMessage) => {
      showComposerError(null);
      const res = await apiTogglePinMessage(apiTarget, targetMsg.id, !targetMsg.pinned);
      if (!res.ok || !res.message) {
        showComposerError(res.error ?? 'Error: Could not update pin status');
        return;
      }
      if (res.message.pinned) {
        markSinglePinSeen(cacheKey, res.message.id);
      }
      replaceDmMessage(cacheKey, res.message);
      syncDmThread();
      window.dispatchEvent(new CustomEvent('redshift:pinned-updated'));
    };

    const openPinnedPopoverFromHeader = () => {
      closeActiveSearchPopover();
      markThreadPinsSeen(cacheKey, dmMessagesByThread.get(cacheKey) ?? []);
      syncPinHeaderBadge();
      pinHeaderBtn.classList.add('dm-header-icon-btn--active');
      openPinnedMessagesPopover({
        anchorEl: pinHeaderBtn,
        getMessages: () => dmMessagesByThread.get(cacheKey) ?? [],
        resolveAvatar: resolveProfileAvatar,
        formatTime: formatMessageTime,
        onJumpToMessage: jumpToMessageById,
        onUnpin: async (targetMsg) => {
          await toggleMessagePin(targetMsg);
        },
        onClose: () => {
          pinHeaderBtn.classList.remove('dm-header-icon-btn--active');
        },
      });
    };

    pinHeaderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isPinnedPopoverOpenFor(pinHeaderBtn)) {
        closeActivePinnedPopover();
        return;
      }
      openPinnedPopoverFromHeader();
    });

    const OLDER_MESSAGES_SCROLL_THRESHOLD = 100;
    const syncJumpBar = () => {
      const distanceFromBottom =
        chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight;
      if (distanceFromBottom <= 24) {
        scrolledUpNewCount = 0;
      }
      if (scrolledUpNewCount > 0 && distanceFromBottom > 140) {
        jumpBar.hidden = false;
        jumpBarLabel.textContent = `${scrolledUpNewCount} new ${scrolledUpNewCount === 1 ? 'message' : 'messages'} below`;
        return;
      }
      if (distanceFromBottom <= 140) {
        jumpBar.hidden = true;
        return;
      }
      const renderedMessages = messageList.querySelectorAll('.chat-message');
      if (renderedMessages.length < OLDER_MESSAGES_SCROLL_THRESHOLD) {
        jumpBar.hidden = true;
        return;
      }
      const pivotEl =
        renderedMessages[renderedMessages.length - OLDER_MESSAGES_SCROLL_THRESHOLD];
      const containerBottom = chatMessages.getBoundingClientRect().bottom;
      const scrolledPast100Plus =
        pivotEl instanceof HTMLElement &&
        pivotEl.getBoundingClientRect().top > containerBottom - 8;
      if (!scrolledPast100Plus) {
        jumpBar.hidden = true;
        return;
      }
      jumpBar.hidden = false;
      jumpBarLabel.textContent = "You're viewing older messages";
    };

    const loadOlderMessagesPage = async () => {
      if (loadingOlderMessages || !historyLoaded || !dmHasMoreByThread.get(cacheKey)) {
        return;
      }
      const list = dmMessagesByThread.get(cacheKey) ?? [];
      const oldestMsg = list.find((m) => !m.isPending);
      if (!oldestMsg) {
        dmHasMoreByThread.set(cacheKey, false);
        syncHistoryBanner();
        return;
      }
      loadingOlderMessages = true;
      syncHistoryBanner();
      const prevHeight = chatMessages.scrollHeight;
      const prevTop = chatMessages.scrollTop;

      const res = await apiFetchDmHistory(apiTarget, { before: oldestMsg.id, limit: 50 });
      loadingOlderMessages = false;
      if (!isThreadCurrentlyViewed(cacheKey)) {
        return;
      }
      if (res.ok && res.messages) {
        mergeDmHistory(cacheKey, res.messages);
        dmHasMoreByThread.set(cacheKey, Boolean(res.hasMore));
      } else {
        dmHasMoreByThread.set(cacheKey, false);
      }
      skipBottomScrollOnce = true;
      syncDmThread();
      syncHistoryBanner();
      const deltaHeight = chatMessages.scrollHeight - prevHeight;
      chatMessages.scrollTop = Math.max(0, prevTop + deltaHeight);
    };

    const handleChatScroll = () => {
      syncJumpBar();
      if (initialScrollApplied && !loadingOlderMessages && Date.now() > programmaticScrollUntil) {
        const distFromBottom =
          chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight;
        pinnedToBottom = distFromBottom <= 64;
        dmScrollStateByThread.set(cacheKey, {
          atBottom: pinnedToBottom,
          scrollTop: chatMessages.scrollTop,
        });
        if (pinnedToBottom && hasUnreadOnThisThread()) {
          markThreadAsRead(readTarget);
        }
      }
      if (chatMessages.scrollTop <= 96 && historyLoaded && dmHasMoreByThread.get(cacheKey)) {
        void loadOlderMessagesPage();
      }
    };

    chatMessages.addEventListener('scroll', handleChatScroll, { passive: true });
    jumpLatestBtn.addEventListener('click', () => {
      scrolledUpNewCount = 0;
      pinnedToBottom = true;
      dmScrollStateByThread.set(cacheKey, { atBottom: true, scrollTop: chatMessages.scrollHeight });
      programmaticScrollUntil = Date.now() + 350;
      chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
      if (hasUnreadOnThisThread()) {
        markThreadAsRead(readTarget);
      }
      syncJumpBar();
      chatInput.focus();
    });

    const keepBottomOnMediaOrResize = () => {
      if (pinnedToBottom && !loadingOlderMessages && !editingMessageId) {
        const gap = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight;
        if (gap > 1) {
          programmaticScrollUntil = Date.now() + 60;
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
      }
    };
    const onMessageListMediaLoad = (ev: Event) => {
      const t = ev.target;
      if (t instanceof HTMLImageElement || t instanceof HTMLVideoElement) {
        keepBottomOnMediaOrResize();
      }
    };
    messageList.addEventListener('load', onMessageListMediaLoad, true);
    messageList.addEventListener('loadedmetadata', onMessageListMediaLoad, true);
    let messageListObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      messageListObserver = new ResizeObserver(() => {
        keepBottomOnMediaOrResize();
      });
      messageListObserver.observe(messageList);
    }

    activeDmNotifyPeerMessage = (incomingMsg, wasVisible) => {
      const atBottom =
        chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight <= 48;
      if (!wasVisible || !atBottom) {
        if (!unreadMarkerMessageId) {
          unreadMarkerMessageId = incomingMsg.id;
        }
      }
      if (!atBottom) {
        scrolledUpNewCount += 1;
      }
    };

    const composerErrorSlot = document.createElement('div');
    composerErrorSlot.className = 'composer-error-slot';

    const showComposerError = (msg: string | null) => {
      composerErrorSlot.replaceChildren();
      if (msg) {
        composerErrorSlot.appendChild(createFeedbackBanner(msg, 'error'));
      }
    };
    activeDmErrorReporter = showComposerError;

    const replyBar = document.createElement('div');
    replyBar.className = 'composer-reply-bar';
    replyBar.hidden = true;

    const syncReplyBar = () => {
      replyBar.replaceChildren();
      if (!replyingTo) {
        replyBar.hidden = true;
        return;
      }
      replyBar.hidden = false;

      const labelWrap = document.createElement('div');
      labelWrap.className = 'composer-reply-info';

      const prefix = document.createElement('span');
      prefix.textContent = 'Replying to ';
      labelWrap.appendChild(prefix);

      const authorStrong = document.createElement('strong');
      authorStrong.textContent = replyingTo.authorName;
      labelWrap.appendChild(authorStrong);

      const compactPreview = replyingTo.content.replace(/\s+/g, ' ').trim();
      if (compactPreview) {
        const snip = document.createElement('span');
        snip.className = 'composer-reply-preview';
        setTwemojiText(snip, ` — ${truncateNotificationText(compactPreview, 96)}`);
        snip.title = compactPreview;
        labelWrap.appendChild(snip);
      } else if (
        (replyingTo.imageDataUrls && replyingTo.imageDataUrls.length > 0) ||
        replyingTo.imageDataUrl ||
        (replyingTo.attachments && replyingTo.attachments.length > 0)
      ) {
        const snip = document.createElement('span');
        snip.className = 'composer-reply-preview composer-reply-preview--italic';
        snip.textContent = ' — Attachment';
        labelWrap.appendChild(snip);
      }

      const cancelReplyBtn = document.createElement('button');
      cancelReplyBtn.type = 'button';
      cancelReplyBtn.className = 'composer-reply-cancel';
      cancelReplyBtn.title = 'Cancel reply';
      cancelReplyBtn.setAttribute('aria-label', 'Cancel reply');
      cancelReplyBtn.appendChild(createCloseIconSvg(13));
      cancelReplyBtn.addEventListener('click', () => {
        replyingTo = null;
        syncReplyBar();
        chatInput.focus();
      });

      replyBar.appendChild(labelWrap);
      replyBar.appendChild(cancelReplyBtn);
    };

    const renderedRowCache = new Map<string, { sig: string; el: HTMLElement }>();
    const cachedDateDividers = new Map<string, HTMLElement>();
    let cachedUnreadDivider: { beforeId: string; el: HTMLElement } | null = null;
    let lastHeaderSig = '';
    let syncComposerAccess: (() => void) | null = null;

    const getDmWriteBlockReason = (): string | null => {
      if (isGroup || !state.snapshot) {
        return null;
      }
      const snap = state.snapshot;
      if ((snap.blockedUsers ?? []).some((b) => b.username.toLowerCase() === peerKey)) {
        return 'You blocked this user. Unblock them to send direct messages.';
      }
      const isFriend = snap.friends.some((f) => f.username.toLowerCase() === peerKey);
      const latestPeer = findKnownDmPeer(snap, peerKey) ?? initialTarget.friend;
      if (!isFriend && latestPeer.acceptsNonFriendDms === false) {
        return `${latestPeer.displayName} does not accept direct messages from non-friends.`;
      }
      return null;
    };

    const syncDmThread = () => {
      const snap = state.snapshot;
      if (!snap) {
        return;
      }
      const selfKey = snap.user.username.toLowerCase();

      if (initialTarget.kind === 'group') {
        const latestGroup =
          snap.groups?.find((g) => g.id === groupId) ?? initialTarget.group;
        const avatarUrl = resolveGroupAvatar(latestGroup);
        const memberSig = latestGroup.members
          .map(
            (m) =>
              `${m.username}:${m.status}:${m.displayName}:${m.avatarPreset ?? 'c'}:${fastDataUrlHash(m.avatarDataUrl)}:${m.customStatus?.emoji ?? ''}:${m.customStatus?.text ?? ''}:${m.isProfilePrivate ? 'P' : 'O'}`,
          )
          .join(',');
        const headerSig = `${latestGroup.name}|${latestGroup.ownerUsername}|${avatarUrl}|${memberSig}`;
        if (headerSig !== lastHeaderSig) {
          lastHeaderSig = headerSig;
          headerAvatar.src = avatarUrl;
          headerAvatar.alt = `${latestGroup.name} group icon`;
          headerName.textContent = latestGroup.name;
          headerUsername.textContent = `${latestGroup.members.length} Member${latestGroup.members.length === 1 ? '' : 's'}`;
          groupMembersPanel?.update(latestGroup);
        }
      } else {
        const latestPeer = findKnownDmPeer(snap, peerKey) ?? initialTarget.friend;
        const isFriendNow = snap.friends.some((f) => f.username.toLowerCase() === peerKey);
        const isBlockedNow = (snap.blockedUsers ?? []).some(
          (b) => b.username.toLowerCase() === peerKey,
        );
        const headerAvatarUrl = resolveProfileAvatar(latestPeer);
        const headerSig = [
          latestPeer.displayName,
          latestPeer.username,
          latestPeer.status,
          headerAvatarUrl,
          latestPeer.bio,
          latestPeer.bannerColor ?? '',
          fastDataUrlHash(latestPeer.bannerDataUrl),
          latestPeer.customStatus?.text ?? '',
          latestPeer.customStatus?.emoji ?? '',
          latestPeer.isProfilePrivate ? 'PR1' : 'PR0',
          latestPeer.acceptsNonFriendDms === false ? 'ND0' : 'ND1',
          isFriendNow ? 'F1' : 'F0',
          isBlockedNow ? 'B1' : 'B0',
        ].join('|');
        if (headerSig !== lastHeaderSig) {
          lastHeaderSig = headerSig;
          headerAvatar.src = headerAvatarUrl;
          headerAvatar.alt = `${latestPeer.displayName} profile picture`;
          headerName.textContent = latestPeer.displayName;
          headerUsername.textContent = latestPeer.isProfilePrivate
            ? `${latestPeer.username} • Private Profile`
            : latestPeer.username;
          headerStatus.hidden = Boolean(latestPeer.isProfilePrivate);
          if (!latestPeer.isProfilePrivate) {
            headerStatus.replaceChildren(createStatusGlyph(latestPeer.status, 10));
          }
          dmProfilePanel?.update(latestPeer);
        }
      }
      syncComposerAccess?.();
      syncHeaderMuteButton();

      const wasAtBottom =
        chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 24;
      const msgs = dmMessagesByThread.get(cacheKey) ?? [];
      if (editingMessageId && !msgs.some((m) => m.id === editingMessageId)) {
        editingMessageId = null;
      }
      syncPinHeaderBadge();

      if (historyLoaded && initialUnreadRemaining > 0 && !unreadMarkerMessageId && msgs.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg && lastMsg.authorUsername.toLowerCase() === selfKey) {
          // If our own message (e.g. a forwarded message) is the latest message, never jump back to an old unread divider.
          initialUnreadRemaining = 0;
        } else {
          let remaining = initialUnreadRemaining;
          for (let i = msgs.length - 1; i >= 0; i -= 1) {
            if (msgs[i].authorUsername.toLowerCase() !== selfKey) {
              remaining -= 1;
              if (remaining <= 0) {
                unreadMarkerMessageId = msgs[i].id;
                break;
              }
            }
          }
          if (!unreadMarkerMessageId) {
            unreadMarkerMessageId = msgs[0].id;
          }
          initialUnreadRemaining = 0;
        }
      }

      const prefs = getUserPreferences();
      const prefsSig = `${prefs.use24HourTime ? '24' : '12'}:${prefs.inlineMedia ? 'M1' : 'M0'}`;
      const favUrlSet = new Set((snap.favoriteGifs ?? []).map((g) => g.url));
      const isJoinedToThisCall = voiceManager.getActiveCallThreadKey() === vcThreadKey;
      const readReceiptsEnabled = !isGroup && Boolean(snap.user.privacy?.showReadReceipts);
      const threadReceipt = readReceiptsEnabled ? dmReceiptsByThread.get(cacheKey) : undefined;
      let latestOwnSentId: string | null = null;
      if (readReceiptsEnabled) {
        for (let i = msgs.length - 1; i >= 0; i -= 1) {
          const candidate = msgs[i];
          if (
            !candidate.callLog &&
            !candidate.systemEvent &&
            !candidate.isPending &&
            candidate.authorUsername.toLowerCase() === selfKey
          ) {
            latestOwnSentId = candidate.id;
            break;
          }
        }
      }
      const activeIds = new Set<string>();
      const renderedNodes: HTMLElement[] = [];
      const toLocalDayKey = (ts: number): string => {
        const d = new Date(ts);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      };
      let lastDayKey = '';

      msgs.forEach((msg, index) => {
        activeIds.add(msg.id);
        const curDayKey = toLocalDayKey(msg.timestamp);
        const isNewDay = Boolean(curDayKey && curDayKey !== lastDayKey);
        if (isNewDay) {
          let dateEl = cachedDateDividers.get(curDayKey);
          if (!dateEl) {
            dateEl = createDateDivider(msg.timestamp);
            cachedDateDividers.set(curDayKey, dateEl);
          }
          renderedNodes.push(dateEl);
          lastDayKey = curDayKey;
        }
        const isUnreadStart = Boolean(unreadMarkerMessageId && msg.id === unreadMarkerMessageId);
        if (isUnreadStart) {
          if (!cachedUnreadDivider || cachedUnreadDivider.beforeId !== msg.id) {
            cachedUnreadDivider = { beforeId: msg.id, el: createNewMessagesDivider() };
          }
          renderedNodes.push(cachedUnreadDivider.el);
        }

        const prev = index > 0 ? msgs[index - 1] : null;
        const isGrouped = Boolean(
          prev &&
            !isNewDay &&
            !msg.callLog &&
            !prev.callLog &&
            !msg.systemEvent &&
            !prev.systemEvent &&
            !isUnreadStart &&
            !msg.replyTo &&
            !msg.statusReply &&
            prev.authorUsername.toLowerCase() === msg.authorUsername.toLowerCase() &&
            msg.timestamp - prev.timestamp <= GROUP_WINDOW_MS &&
            msg.timestamp >= prev.timestamp,
        );
        const isGroupStart = !isGrouped && !isUnreadStart && index > 0;
        const isEditing = msg.id === editingMessageId;

        const gifFavFlag =
          msg.gif && favUrlSet.has(msg.gif.url)
            ? '1'
            : (msg.attachments ?? []).some((a) => a.kind === 'image' && favUrlSet.has(a.url))
              ? '1'
              : '0';

        const callSig = msg.callLog
          ? [
              msg.callLog.status,
              msg.callLog.callerDisplayName ?? msg.callLog.callerUsername,
              msg.callLog.startedAt,
              msg.callLog.endedAt ?? 0,
              msg.callLog.durationMs ?? 0,
              isJoinedToThisCall ? 'IN' : 'OUT',
              (msg.callLog.participantUsernames ?? []).join(','),
            ].join(':')
          : '';

        let receiptStatus: { kind: 'delivered' | 'seen'; label: string } | null = null;
        if (readReceiptsEnabled && latestOwnSentId && msg.id === latestOwnSentId) {
          const isSeen = Boolean(
            threadReceipt &&
              (threadReceipt.lastReadMessageId === msg.id ||
                threadReceipt.readAt >= msg.timestamp),
          );
          receiptStatus = isSeen
            ? { kind: 'seen', label: `Seen · ${formatMessageTime(threadReceipt!.readAt)}` }
            : { kind: 'delivered', label: 'Delivered' };
        }
        const receiptSig = receiptStatus ? `${receiptStatus.kind}:${receiptStatus.label}` : '';
        const voiceNoteSig = msg.voiceNote
          ? `${msg.voiceNote.durationSec}:${msg.voiceNote.waveform.length}`
          : '';
        const systemSig = msg.systemEvent
          ? [
              msg.systemEvent.kind,
              msg.systemEvent.actorDisplayName ?? msg.systemEvent.actorUsername,
              msg.systemEvent.targetDisplayName ?? msg.systemEvent.targetUsername ?? '',
              (msg.systemEvent.targetDisplayNames ?? msg.systemEvent.targetUsernames ?? []).join(','),
              msg.systemEvent.pinnedMessageId ?? '',
            ].join(':')
          : '';

        const sig = [
          prefsSig,
          callSig,
          systemSig,
          voiceNoteSig,
          receiptSig,
          msg.content,
          msg.editedAt ?? 0,
          msg.pinned ? 'PIN1' : 'PIN0',
          msg.isPending ? 'P' : 'S',
          msg.isPending && msg.uploadStatusText ? 'U1' : 'U0',
          isGrouped ? 'G' : 'F',
          isGroupStart ? '1' : '0',
          isEditing ? 'E' : 'V',
          msg.authorName,
          msg.authorAvatarPreset ?? 'c',
          fastDataUrlHash(msg.authorAvatarDataUrl),
          msg.gif?.url ?? '',
          gifFavFlag,
          (msg.imageDataUrls ?? (msg.imageDataUrl ? [msg.imageDataUrl] : [])).length,
          (msg.attachments ?? []).map((a) => `${a.id}:${a.url}:${a.spoiler ? 'S1' : 'S0'}`).join(','),
          msg.forwarded ? 'FWD1' : 'FWD0',
          msg.replyTo
            ? `${msg.replyTo.missing ? 'M' : 'R'}:${msg.replyTo.authorName}:${msg.replyTo.content}`
            : '',
          msg.statusReply
            ? `SR:${msg.statusReply.authorName}:${msg.statusReply.emoji ?? ''}:${msg.statusReply.text ?? ''}`
            : '',
          (msg.reactions ?? []).map((r) => `${r.emoji}:${r.count}:${r.users.join(',')}`).join('|'),
        ].join('\x1f');

        const cached = renderedRowCache.get(msg.id);
        if (cached && cached.sig === sig) {
          if (msg.isPending && msg.uploadStatusText) {
            const textEl = cached.el.querySelector('.msg-upload-status-text');
            if (textEl) {
              textEl.textContent = msg.uploadStatusText;
            }
            const fillEl = cached.el.querySelector('.msg-upload-fill') as HTMLElement | null;
            if (fillEl && typeof msg.uploadProgress === 'number') {
              fillEl.style.width = `${Math.min(100, Math.max(0, msg.uploadProgress))}%`;
            }
          }
          renderedNodes.push(cached.el);
          return;
        }

        const row = createChatMessageElement({
          message: msg,
          isGrouped,
          isOwn: msg.authorUsername.toLowerCase() === selfKey,
          selfUsernameLower: selfKey,
          isEditing,
          receiptStatus,
          resolveAvatar: resolveProfileAvatar,
          formatFullTime: formatMessageTime,
          onReply: (targetMsg) => {
            closeActiveEmojiPicker();
            replyingTo = targetMsg;
            syncReplyBar();
            chatInput.focus();
          },
          onForward: (targetMsg) => {
            if (!state.snapshot) {
              return;
            }
            closeActiveEmojiPicker();
            closeActiveGifPicker();
            void import('./forwardModal').then(({ openForwardMessageModal }) => {
              if (!state.snapshot) {
                return;
              }
              openForwardMessageModal({
                message: targetMsg,
                sourceTarget: apiTarget,
                snapshot: state.snapshot,
                resolveAvatar: resolveProfileAvatar,
                onForwarded: (nextSnap) => {
                  applyLiveSnapshot(nextSnap);
                },
              });
            });
          },
          onToggleSpoiler: async (targetMsg, attachmentId, nextSpoiler) => {
            showComposerError(null);
            const res = await apiToggleAttachmentSpoiler(
              apiTarget,
              targetMsg.id,
              attachmentId,
              nextSpoiler,
            );
            if (!res.ok || !res.message) {
              showComposerError(res.error ?? 'Error: Could not update spoiler status');
              return;
            }
            replaceDmMessage(cacheKey, res.message);
            syncDmThread();
          },
          onJumpToMessage: jumpToMessageById,
          onOpenPinnedMessages: openPinnedPopoverFromHeader,
          onOpenProfile: (username, fallback) => {
            const profile = resolvePublicProfileForUsername(username, fallback);
            if (profile) {
              openProfileModalForUser(profile);
            }
          },
          isCallJoined: isJoinedToThisCall,
          onJoinCall: isJoinedToThisCall
            ? undefined
            : () => {
                if (voiceManager.getActiveCallThreadKey() !== vcThreadKey) {
                  voiceManager.startOrJoinCall(apiTarget, vcThreadKey);
                }
              },
          onStartEdit: (targetMsg) => {
            closeActiveEmojiPicker();
            editingMessageId = targetMsg.id;
            syncDmThread();
          },
          onCancelEdit: () => {
            closeActiveEmojiPicker();
            editingMessageId = null;
            syncDmThread();
          },
          onSaveEdit: async (targetMsg, nextContent) => {
            showComposerError(null);
            const res = await apiEditDmMessage(apiTarget, targetMsg.id, nextContent);
            if (!res.ok || !res.message) {
              showComposerError(res.error ?? 'Error: Could not edit message');
              return;
            }
            editingMessageId = null;
            replaceDmMessage(cacheKey, res.message);
            syncDmThread();
          },
          onDelete: async (targetMsg) => {
            closeActiveEmojiPicker();
            showComposerError(null);
            const res = await apiDeleteDmMessage(apiTarget, targetMsg.id);
            if (!res.ok) {
              showComposerError(res.error ?? 'Error: Could not delete message');
              return;
            }
            if (editingMessageId === targetMsg.id) {
              editingMessageId = null;
            }
            removeDmMessage(cacheKey, targetMsg.id);
            syncDmThread();
            window.dispatchEvent(new CustomEvent('redshift:pinned-updated'));
          },
          onTogglePin: toggleMessagePin,
          onToggleReaction: async (targetMsg, emoji) => {
            showComposerError(null);
            const res = await apiToggleDmReaction(apiTarget, targetMsg.id, emoji);
            if (!res.ok) {
              showComposerError(res.error ?? 'Error: Could not update reaction');
              return;
            }
            if (res.reactions) {
              updateDmMessageReactions(cacheKey, targetMsg.id, res.reactions);
              syncDmThread();
            }
          },
          isGifFavorited: (url) => favUrlSet.has(url),
          onToggleFavoriteGif: (gif) => {
            void apiToggleFavoriteGif(gif, 'toggle').then((res) => {
              if (res.ok && res.snapshot) {
                applyLiveSnapshot(res.snapshot);
              }
            });
          },
        });

        if (isGroupStart) {
          row.classList.add('chat-message-group-start');
        }
        if (msg.callLog) {
          row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const activeCallNow = voiceManager.getActiveCallThreadKey() === vcThreadKey;
            const liveCall = voiceManager.getCallStateForThread(vcThreadKey);
            const isRingingOrLive = Boolean(liveCall?.active);
            const blockReason = getDmWriteBlockReason();
            const callItems: ContextMenuItem[] = [];
            if (activeCallNow) {
              callItems.push({
                label: 'Leave Voice Call',
                icon: 'phone-off',
                danger: true,
                onSelect: () => voiceManager.leaveCall(),
              });
            } else if (!blockReason) {
              callItems.push({
                label: isRingingOrLive ? 'Join Call' : 'Call Back',
                icon: 'phone',
                onSelect: () => voiceManager.startOrJoinCall(apiTarget, vcThreadKey),
              });
            }
            callItems.push(
              {
                label: 'Copy Call Time',
                icon: 'copy',
                dividerBefore: callItems.length > 0,
                onSelect: () => {
                  void copyToClipboard(new Date(msg.timestamp).toLocaleString());
                },
              },
              {
                label: 'Copy Message ID',
                icon: 'copy',
                onSelect: () => {
                  void copyToClipboard(msg.id);
                },
              },
            );
            openContextMenu({
              clientX: e.clientX,
              clientY: e.clientY,
              minWidth: 196,
              items: callItems,
            });
          });
        }
        renderedRowCache.set(msg.id, { sig, el: row });
        renderedNodes.push(row);
      });

      for (const cachedId of renderedRowCache.keys()) {
        if (!activeIds.has(cachedId)) {
          renderedRowCache.delete(cachedId);
        }
      }

      const existingChildren = messageList.children;
      let orderMatches = existingChildren.length === renderedNodes.length;
      if (orderMatches) {
        for (let i = 0; i < renderedNodes.length; i += 1) {
          if (existingChildren[i] !== renderedNodes[i]) {
            orderMatches = false;
            break;
          }
        }
      }
      if (!orderMatches) {
        const mountedEditEl = editingMessageId
          ? renderedRowCache.get(editingMessageId)?.el
          : undefined;
        if (mountedEditEl && mountedEditEl.parentElement === messageList) {
          const editIdx = renderedNodes.indexOf(mountedEditEl);
          if (editIdx !== -1) {
            for (const child of Array.from(messageList.children)) {
              if (child !== mountedEditEl) {
                child.remove();
              }
            }
            for (let i = 0; i < editIdx; i += 1) {
              messageList.insertBefore(renderedNodes[i], mountedEditEl);
            }
            for (let i = editIdx + 1; i < renderedNodes.length; i += 1) {
              messageList.appendChild(renderedNodes[i]);
            }
          } else {
            messageList.replaceChildren(...renderedNodes);
          }
        } else {
          messageList.replaceChildren(...renderedNodes);
        }
      }

      if (historyLoaded && !initialScrollApplied && chatMessages.isConnected && chatMessages.clientHeight > 0) {
        applyInitialScrollPosition();
      } else if (!skipBottomScrollOnce && (wasAtBottom || pinnedToBottom) && !editingMessageId && chatMessages.isConnected) {
        scrollToBottomPinned();
      }
      skipBottomScrollOnce = false;
      syncHistoryBanner();
      syncJumpBar();
    };

    activeDmSyncer = syncDmThread;
    syncDmThread();

    const vcTopBarHost = document.createElement('div');
    vcTopBarHost.className = 'vc-top-bar-host';
    vcTopBarHost.hidden = true;

    const syncVcHeaderButton = () => {
      const blockReason = getDmWriteBlockReason();
      const inThisCall = voiceManager.getActiveCallThreadKey() === vcThreadKey;
      const hasActiveCall = Boolean(voiceManager.getCallStateForThread(vcThreadKey)?.active);
      vcCallBtn.disabled = Boolean(blockReason) && !inThisCall;
      vcCallBtn.classList.toggle('dm-header-icon-btn--vc-active', inThisCall || hasActiveCall);
      vcCallBtn.title = inThisCall
        ? 'Leave Voice Call'
        : hasActiveCall
          ? 'Join Voice Call'
          : 'Start Voice Call';
      vcCallBtn.setAttribute('aria-label', vcCallBtn.title);
    };

    vcCallBtn.addEventListener('click', () => {
      if (voiceManager.getActiveCallThreadKey() === vcThreadKey) {
        voiceManager.leaveCall();
        return;
      }
      const blockReason = getDmWriteBlockReason();
      if (blockReason) {
        showComposerError(blockReason);
        return;
      }
      voiceManager.startOrJoinCall(apiTarget, vcThreadKey);
    });

    activeVcBarSyncer = () => {
      voiceManager.renderCallTopBar(vcTopBarHost, vcThreadKey);
      syncVcHeaderButton();
    };
    activeVcBarSyncer();

    chatMessages.appendChild(historyTopBanner);
    chatMessages.appendChild(messageList);
    dmMessagesHost.appendChild(chatMessages);
    dmMessagesHost.appendChild(jumpBar);
    dmThreadPane.appendChild(vcTopBarHost);
    dmThreadPane.appendChild(dmMessagesHost);

    if (initialUnreadRemaining > 0) {
      markThreadAsRead(readTarget);
    }

    const composerForm = document.createElement('form');
    composerForm.className = 'chat-composer';
    composerForm.noValidate = true;

    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'typing-indicator';
    typingIndicator.setAttribute('aria-live', 'polite');

    const typingLabel = document.createElement('span');
    typingLabel.className = 'typing-label';

    const typingDots = document.createElement('span');
    typingDots.className = 'typing-dots';
    typingDots.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i += 1) {
      typingDots.appendChild(document.createElement('span')).textContent = '.';
    }

    typingIndicator.appendChild(typingLabel);
    typingIndicator.appendChild(typingDots);
    composerForm.appendChild(typingIndicator);

    const syncTypingBanner = () => {
      const typersMap = typingByThread.get(cacheKey);
      const activeTypers = typersMap ? Array.from(typersMap.values()) : [];
      if (activeTypers.length === 1) {
        typingLabel.textContent = `${activeTypers[0].displayName} is typing`;
        typingIndicator.classList.add('typing-indicator--active');
      } else if (activeTypers.length === 2) {
        typingLabel.textContent = `${activeTypers[0].displayName} and ${activeTypers[1].displayName} are typing`;
        typingIndicator.classList.add('typing-indicator--active');
      } else if (activeTypers.length > 2) {
        typingLabel.textContent = 'Several people are typing';
        typingIndicator.classList.add('typing-indicator--active');
      } else {
        typingIndicator.classList.remove('typing-indicator--active');
      }
    };

    activeTypingSyncer = syncTypingBanner;
    syncTypingBanner();
    void groupSettingsBtn;

    composerForm.appendChild(composerErrorSlot);

    const composerAnchor = document.createElement('div');
    composerAnchor.className = 'composer-anchor';

    const composerBox = document.createElement('div');
    composerBox.className = 'composer-box';
    composerBox.appendChild(replyBar);

    const attachmentsStrip = document.createElement('div');
    attachmentsStrip.className = 'composer-attachments';
    attachmentsStrip.hidden = true;
    composerBox.appendChild(attachmentsStrip);

    let pendingAttachments: StagedAttachmentItem[] = [];
    let syncComposerSendState: () => void = () => {};

    const syncAttachmentsStrip = () => {
      attachmentsStrip.replaceChildren();
      if (pendingAttachments.length === 0) {
        attachmentsStrip.hidden = true;
        syncComposerSendState();
        return;
      }
      attachmentsStrip.hidden = false;

      pendingAttachments.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = item.spoiler
          ? 'composer-attachment-card composer-attachment-card--spoiler'
          : 'composer-attachment-card';

        if (item.kind === 'image' && item.previewUrl) {
          const thumbWrap = document.createElement('div');
          thumbWrap.className = 'composer-attachment-media-box';
          const thumb = document.createElement('img');
          thumb.className = 'composer-attachment-thumb';
          thumb.src = item.previewUrl;
          thumb.alt = item.name;
          thumbWrap.appendChild(thumb);
          if (item.spoiler) {
            const spBadge = document.createElement('span');
            spBadge.className = 'composer-attachment-spoiler-badge';
            spBadge.textContent = 'SPOILER';
            thumbWrap.appendChild(spBadge);
          }
          card.appendChild(thumbWrap);
        } else if (item.kind === 'video' && item.previewUrl) {
          const vidWrap = document.createElement('div');
          vidWrap.className = 'composer-attachment-media-box';
          const videoThumb = document.createElement('video');
          videoThumb.className = 'composer-attachment-thumb';
          videoThumb.src = item.previewUrl;
          videoThumb.muted = true;
          videoThumb.playsInline = true;
          videoThumb.preload = 'metadata';
          vidWrap.appendChild(videoThumb);
          const badge = document.createElement('span');
          badge.className = 'composer-attachment-kind-pill';
          badge.appendChild(createVideoIconSvg(12));
          vidWrap.appendChild(badge);
          if (item.spoiler) {
            const spBadge = document.createElement('span');
            spBadge.className = 'composer-attachment-spoiler-badge';
            spBadge.textContent = 'SPOILER';
            vidWrap.appendChild(spBadge);
          }
          card.appendChild(vidWrap);
        } else {
          const fileTile = document.createElement('div');
          fileTile.className = 'composer-attachment-file-tile';
          const iconCircle = document.createElement('span');
          iconCircle.className = 'composer-attachment-file-icon';
          iconCircle.appendChild(
            item.kind === 'audio' ? createAudioIconSvg(20) : createFileIconSvg(20),
          );
          fileTile.appendChild(iconCircle);
          const ext = item.name.includes('.')
            ? item.name.split('.').pop()?.toUpperCase().slice(0, 6)
            : '';
          const typeTag = document.createElement('span');
          typeTag.className = 'composer-attachment-file-tag';
          typeTag.textContent = item.kind === 'audio' ? (ext || 'AUDIO') : (ext || 'FILE');
          fileTile.appendChild(typeTag);
          card.appendChild(fileTile);
        }

        if (item.kind === 'image' || item.kind === 'video') {
          const spoilerBtn = document.createElement('button');
          spoilerBtn.type = 'button';
          spoilerBtn.className = item.spoiler
            ? 'composer-attachment-spoiler-btn composer-attachment-spoiler-btn--active'
            : 'composer-attachment-spoiler-btn';
          spoilerBtn.dataset.action = 'stage-spoiler';
          spoilerBtn.title = item.spoiler ? 'Remove Spoiler Blur' : 'Mark as Spoiler';
          spoilerBtn.setAttribute('aria-label', spoilerBtn.title);
          spoilerBtn.setAttribute('aria-pressed', String(Boolean(item.spoiler)));
          spoilerBtn.appendChild(createMenuIconSvg(item.spoiler ? 'eye-off' : 'eye', 12));
          spoilerBtn.addEventListener('click', () => {
            item.spoiler = !item.spoiler;
            syncAttachmentsStrip();
          });
          card.appendChild(spoilerBtn);
        }

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'composer-attachment-remove';
        removeBtn.title = 'Remove attachment';
        removeBtn.setAttribute('aria-label', `Remove ${item.name}`);
        removeBtn.appendChild(createCloseIconSvg(12));
        removeBtn.addEventListener('click', () => {
          const [removed] = pendingAttachments.splice(idx, 1);
          if (removed?.previewUrl) {
            URL.revokeObjectURL(removed.previewUrl);
          }
          showComposerError(null);
          syncAttachmentsStrip();
          chatInput.focus();
        });
        card.appendChild(removeBtn);

        const nameLabel = document.createElement('div');
        nameLabel.className = 'composer-attachment-name';
        nameLabel.textContent = item.name;
        nameLabel.title = item.name;
        card.appendChild(nameLabel);

        const sizeLabel = document.createElement('div');
        sizeLabel.className = 'composer-attachment-size';
        sizeLabel.textContent = formatFileSize(item.size);
        card.appendChild(sizeLabel);

        attachmentsStrip.appendChild(card);
      });
      syncComposerSendState();
    };

    const composerRow = document.createElement('div');
    composerRow.className = 'composer-row';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.hidden = true;

    const attachBtn = document.createElement('button');
    attachBtn.type = 'button';
    attachBtn.className = 'composer-icon-btn composer-attach-btn';
    attachBtn.title = 'Attach files (up to 10, max 1 GB each)';
    attachBtn.setAttribute('aria-label', 'Attach files');
    attachBtn.appendChild(createPlusIconSvg(18));
    attachBtn.addEventListener('click', () => {
      fileInput.value = '';
      fileInput.click();
    });

    const stageAttachmentFiles = (files: File[]) => {
      showComposerError(null);
      const blockReason = getDmWriteBlockReason();
      if (blockReason) {
        showComposerError(blockReason);
        return;
      }
      if (pendingAttachments.length >= MAX_ATTACHMENTS) {
        showComposerError(`Error: You can attach at most ${MAX_ATTACHMENTS} files per message`);
        return;
      }

      let hitLimit = false;
      for (const file of files) {
        if (pendingAttachments.length >= MAX_ATTACHMENTS) {
          hitLimit = true;
          break;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          showComposerError(`Error: "${file.name}" exceeds the 1 GB attachment limit`);
          continue;
        }
        const kind = classifyFileKind(file);
        const previewUrl =
          kind === 'image' || kind === 'video' ? URL.createObjectURL(file) : undefined;
        pendingAttachments.push({
          file,
          kind,
          name: file.name || `attachment-${pendingAttachments.length + 1}`,
          size: file.size,
          previewUrl,
        });
      }

      if (hitLimit) {
        showComposerError(`Error: Maximum ${MAX_ATTACHMENTS} files allowed per message`);
      }
      syncAttachmentsStrip();
      if (window.innerWidth > 768) {
        chatInput.focus();
      }
    };

    fileInput.addEventListener('change', () => {
      const files = fileInput.files ? Array.from(fileInput.files) : [];
      if (files.length > 0) {
        stageAttachmentFiles(files);
      }
    });

    const chatInput = document.createElement('textarea');
    chatInput.className = 'chat-input';
    chatInput.rows = 1;
    chatInput.enterKeyHint = 'send';
    chatInput.placeholder = 'Send a message';
    chatInput.setAttribute('aria-label', 'Send a message');

    const gifBtn = document.createElement('button');
    gifBtn.type = 'button';
    gifBtn.className = 'composer-icon-btn composer-gif-btn';
    gifBtn.title = 'Open GIF picker';
    gifBtn.setAttribute('aria-label', 'Open GIF picker');
    gifBtn.appendChild(createGifIconSvg(20));

    const emojiBtn = document.createElement('button');
    emojiBtn.type = 'button';
    emojiBtn.className = 'composer-icon-btn composer-emoji-btn';
    emojiBtn.title = 'Insert emoji';
    emojiBtn.setAttribute('aria-label', 'Insert emoji');
    emojiBtn.appendChild(createEmojiIconSvg(20));

    const voiceNoteBtn = document.createElement('button');
    voiceNoteBtn.type = 'button';
    voiceNoteBtn.className = 'composer-icon-btn composer-voice-btn';
    voiceNoteBtn.title = 'Record Voice Message';
    voiceNoteBtn.setAttribute('aria-label', 'Record Voice Message');
    voiceNoteBtn.appendChild(createMicIconSvg(false, 19));

    const voiceRecBar = document.createElement('div');
    voiceRecBar.className = 'composer-voice-bar';
    voiceRecBar.hidden = true;

    const voiceRecDot = document.createElement('span');
    voiceRecDot.className = 'composer-voice-dot';

    const voiceRecTimer = document.createElement('span');
    voiceRecTimer.className = 'composer-voice-timer';
    voiceRecTimer.textContent = '0:00';

    const voiceRecMeter = document.createElement('div');
    voiceRecMeter.className = 'composer-voice-meter';
    const meterBars: HTMLSpanElement[] = [];
    for (let i = 0; i < 18; i += 1) {
      const b = document.createElement('span');
      b.className = 'composer-voice-meter-bar';
      b.style.height = '24%';
      voiceRecMeter.appendChild(b);
      meterBars.push(b);
    }

    const voiceRecCancelBtn = document.createElement('button');
    voiceRecCancelBtn.type = 'button';
    voiceRecCancelBtn.className = 'composer-voice-cancel';
    voiceRecCancelBtn.textContent = 'Cancel';

    const voiceRecSendBtn = document.createElement('button');
    voiceRecSendBtn.type = 'button';
    voiceRecSendBtn.className = 'composer-voice-send';
    voiceRecSendBtn.textContent = 'Send Voice';

    voiceRecBar.appendChild(voiceRecDot);
    voiceRecBar.appendChild(voiceRecTimer);
    voiceRecBar.appendChild(voiceRecMeter);
    voiceRecBar.appendChild(voiceRecCancelBtn);
    voiceRecBar.appendChild(voiceRecSendBtn);

    let activeVoiceSession: VoiceNoteRecorderSession | null = null;
    let voiceRecBusy = false;

    const resetVoiceRecUi = () => {
      voiceRecBar.hidden = true;
      composerRow.hidden = false;
      voiceRecTimer.textContent = '0:00';
      voiceRecSendBtn.disabled = false;
      meterBars.forEach((b) => {
        b.style.height = '24%';
      });
    };

    const cancelActiveVoiceRecording = () => {
      if (activeVoiceSession) {
        activeVoiceSession.cancel();
        activeVoiceSession = null;
      }
      resetVoiceRecUi();
    };

    const finishAndSendVoiceRecording = async () => {
      if (!activeVoiceSession || voiceRecBusy) {
        return;
      }
      const session = activeVoiceSession;
      activeVoiceSession = null;
      voiceRecBusy = true;
      voiceRecSendBtn.disabled = true;
      try {
        const result = await session.stopAndSave();
        resetVoiceRecUi();
        if (!result) {
          return;
        }
        const blockReason = getDmWriteBlockReason();
        if (blockReason) {
          showComposerError(blockReason);
          return;
        }
        const replyRef = consumeReplyRef();
        showComposerError(null);
        stopOutboundTyping();
        unreadMarkerMessageId = null;
        initialUnreadRemaining = 0;
        scrolledUpNewCount = 0;
        enqueueOutboundDm({
          cacheKey,
          target: apiTarget,
          content: '',
          files: [
            {
              file: result.file,
              kind: 'audio',
              name: result.file.name,
              size: result.file.size,
              previewUrl: URL.createObjectURL(result.file),
            },
          ],
          voiceNote: result.meta,
          replyTo: replyRef,
        });
        scrollToBottomPinned();
        syncJumpBar();
      } finally {
        voiceRecBusy = false;
      }
    };

    voiceNoteBtn.addEventListener('click', () => {
      if (activeVoiceSession || voiceRecBusy) {
        return;
      }
      const blockReason = getDmWriteBlockReason();
      if (blockReason) {
        showComposerError(blockReason);
        return;
      }
      closeActiveGifPicker();
      closeActiveEmojiPicker();
      showComposerError(null);

      composerRow.hidden = true;
      voiceRecBar.hidden = false;
      voiceRecTimer.textContent = '0:00';

      void import('./voiceNoteRecorder')
        .then(({ startVoiceNoteRecorder }) =>
          startVoiceNoteRecorder({
            onProgress: (elapsedSec, liveLevel) => {
              const whole = Math.floor(elapsedSec);
              const mins = Math.floor(whole / 60);
              const secs = whole % 60;
              voiceRecTimer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
              meterBars.forEach((b, idx) => {
                const wave = Math.sin(elapsedSec * 7 + idx * 0.55) * 0.14;
                const amp = Math.min(
                  1,
                  Math.max(0.14, liveLevel * (0.65 + (idx % 4) * 0.15) + wave),
                );
                b.style.height = `${Math.round(amp * 100)}%`;
              });
            },
          }),
        )
        .then((session) => {
          if (voiceRecBar.hidden) {
            session.cancel();
            return;
          }
          activeVoiceSession = session;
        })
        .catch((err) => {
          resetVoiceRecUi();
          showComposerError(
            err instanceof Error ? `Error: ${err.message}` : 'Error: Could not access microphone',
          );
        });
    });

    voiceRecCancelBtn.addEventListener('click', () => {
      cancelActiveVoiceRecording();
      chatInput.focus();
    });

    voiceRecSendBtn.addEventListener('click', () => {
      void finishAndSendVoiceRecording();
    });

    const openComposerGifPicker = () => {
      openGifPickerLazy({
        anchorEl: gifBtn,
        currentUsername: state.snapshot?.user.username,
        getFavorites: () => state.snapshot?.favoriteGifs ?? [],
        onFavoritesUpdated: (nextSnap) => {
          applyLiveSnapshot(nextSnap);
        },
        onSelect: (gif) => {
          sendGifMessage(gif);
        },
        onSwitchToEmoji: () => {
          openComposerEmojiPicker();
        },
      });
    };

    const openComposerEmojiPicker = () => {
      openEmojiPickerLazy({
        anchorEl: emojiBtn,
        onSelect: (emoji) => {
          insertTextAtCursor(chatInput, emoji);
        },
        onSwitchToGif: () => {
          openComposerGifPicker();
        },
      });
    };

    gifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isGifPickerOpenFor(gifBtn)) {
        closeActiveGifPicker();
        return;
      }
      openComposerGifPicker();
    });

    emojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isEmojiPickerOpenFor(emojiBtn)) {
        closeActiveEmojiPicker();
        return;
      }
      openComposerEmojiPicker();
    });

    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.className = 'composer-icon-btn composer-send-btn';
    sendBtn.dataset.action = 'send-message';
    sendBtn.title = 'Send message';
    sendBtn.setAttribute('aria-label', 'Send message');
    sendBtn.hidden = true;
    sendBtn.appendChild(createSendIconSvg(17));
    sendBtn.addEventListener('mousedown', (e) => {
      // Keep keyboard focus smooth on mobile/desktop without blurring before send.
      e.preventDefault();
    });

    composerRow.appendChild(fileInput);
    composerRow.appendChild(attachBtn);
    composerRow.appendChild(chatInput);
    composerRow.appendChild(voiceNoteBtn);
    composerRow.appendChild(gifBtn);
    composerRow.appendChild(emojiBtn);
    composerRow.appendChild(sendBtn);
    composerBox.appendChild(composerRow);
    composerBox.appendChild(voiceRecBar);

    syncComposerSendState = () => {
      const locked = Boolean(getDmWriteBlockReason());
      const hasInput = chatInput.value.trim().length > 0 || pendingAttachments.length > 0;
      const canSend = !locked && hasInput;
      sendBtn.hidden = !hasInput;
      sendBtn.disabled = !canSend;
      composerBox.classList.toggle('composer-box--has-content', hasInput);
      composerBox.classList.toggle('composer-box--has-attachments', pendingAttachments.length > 0);
    };

    const MIN_COMPOSER_HEIGHT = 24;
    const MAX_COMPOSER_HEIGHT = 200;

    const resizeComposer = () => {
      const nearBottom =
        chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 24;
      chatInput.style.height = 'auto';
      const contentHeight = chatInput.scrollHeight;
      const clamped = Math.min(Math.max(contentHeight, MIN_COMPOSER_HEIGHT), MAX_COMPOSER_HEIGHT);
      chatInput.style.height = `${clamped}px`;
      chatInput.style.overflowY = contentHeight > MAX_COMPOSER_HEIGHT ? 'auto' : 'hidden';
      if (nearBottom) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    };

    let outboundTypingActive = false;
    let lastTypingPingAt = 0;
    let outboundTypingTimer: number | null = null;

    const stopOutboundTyping = () => {
      if (outboundTypingTimer !== null) {
        window.clearTimeout(outboundTypingTimer);
        outboundTypingTimer = null;
      }
      if (outboundTypingActive) {
        outboundTypingActive = false;
        socketHandle?.sendTyping(peerKey, false, isGroup ? groupId : undefined);
      }
    };

    const handleTypingActivity = () => {
      if (
        getDmWriteBlockReason() ||
        !getUserPreferences().sendTypingIndicators ||
        chatInput.value.length === 0
      ) {
        stopOutboundTyping();
        return;
      }

      if (outboundTypingTimer !== null) {
        window.clearTimeout(outboundTypingTimer);
      }

      const now = Date.now();
      if (!outboundTypingActive || now - lastTypingPingAt >= 600) {
        outboundTypingActive = true;
        lastTypingPingAt = now;
        socketHandle?.sendTyping(peerKey, true, isGroup ? groupId : undefined);
      }

      outboundTypingTimer = window.setTimeout(() => {
        outboundTypingTimer = null;
        if (outboundTypingActive) {
          outboundTypingActive = false;
          socketHandle?.sendTyping(peerKey, false, isGroup ? groupId : undefined);
        }
      }, 1200);
    };

    const consumeReplyRef = (): MessageReplyRef | undefined => {
      if (!replyingTo) {
        return undefined;
      }
      const replyHasAtt = Boolean(
        (replyingTo.imageDataUrls && replyingTo.imageDataUrls.length > 0) ||
          replyingTo.imageDataUrl ||
          (replyingTo.attachments && replyingTo.attachments.length > 0) ||
          replyingTo.gif,
      );
      const ref: MessageReplyRef = {
        messageId: replyingTo.id,
        authorUsername: replyingTo.authorUsername,
        authorName: replyingTo.authorName,
        authorAvatarPreset: replyingTo.authorAvatarPreset,
        authorAvatarDataUrl: replyingTo.authorAvatarDataUrl,
        content: replyingTo.content,
        hasImage: replyHasAtt,
        hasAttachment: replyHasAtt,
      };
      replyingTo = null;
      syncReplyBar();
      return ref;
    };

    syncComposerAccess = () => {
      const blockReason = getDmWriteBlockReason();
      const locked = Boolean(blockReason);
      chatInput.disabled = locked;
      attachBtn.disabled = locked;
      voiceNoteBtn.disabled = locked;
      gifBtn.disabled = locked;
      emojiBtn.disabled = locked;
      composerBox.classList.toggle('composer-box--disabled', locked);
      chatInput.placeholder = blockReason ?? 'Send a message';
      chatInput.setAttribute('aria-label', blockReason ?? 'Send a message');
      if (locked) {
        stopOutboundTyping();
        cancelActiveVoiceRecording();
      }
      syncComposerSendState();
      activeVcBarSyncer?.();
    };
    syncComposerAccess();

    const sendGifMessage = (gif: GifItem) => {
      if (!state.snapshot?.user) {
        return;
      }
      const blockReason = getDmWriteBlockReason();
      if (blockReason) {
        showComposerError(blockReason);
        return;
      }
      showComposerError(null);
      stopOutboundTyping();
      const replyRef = consumeReplyRef();
      unreadMarkerMessageId = null;
      initialUnreadRemaining = 0;
      scrolledUpNewCount = 0;

      enqueueOutboundDm({
        cacheKey,
        target: apiTarget,
        content: '',
        gif,
        replyTo: replyRef,
      });
      scrollToBottomPinned();
      syncJumpBar();
      chatInput.focus();
    };

    const sendMessage = () => {
      const current = state.snapshot?.user;
      const trimmed = chatInput.value.trim();
      const blockReason = getDmWriteBlockReason();
      if (blockReason) {
        showComposerError(blockReason);
        return;
      }
      if ((!trimmed && pendingAttachments.length === 0) || !current) {
        return;
      }

      const draftText = trimmed;
      const draftFiles = pendingAttachments;
      const replyRef = consumeReplyRef();

      showComposerError(null);
      stopOutboundTyping();
      chatInput.value = '';
      dmDraftByThread.delete(cacheKey);
      pendingAttachments = [];
      unreadMarkerMessageId = null;
      initialUnreadRemaining = 0;
      scrolledUpNewCount = 0;
      syncAttachmentsStrip();
      resizeComposer();

      const dispatchTextOrMedia = async () => {
        const shareCode =
          draftFiles.length === 0 ? extractGifShareCodeFromText(draftText) : null;
        if (shareCode) {
          const resolved = await apiResolveGifLink(shareCode);
          if (resolved.ok && resolved.gif) {
            enqueueOutboundDm({
              cacheKey,
              target: apiTarget,
              content: '',
              gif: resolved.gif,
              replyTo: replyRef,
            });
            scrollToBottomPinned();
            syncJumpBar();
            return;
          }
        }
        enqueueOutboundDm({
          cacheKey,
          target: apiTarget,
          content: draftText,
          files: draftFiles.length > 0 ? draftFiles : undefined,
          replyTo: replyRef,
        });
        scrollToBottomPinned();
        syncJumpBar();
      };

      void dispatchTextOrMedia();
    };

    sendBtn.addEventListener('click', () => {
      sendMessage();
    });

    const savedDraft = dmDraftByThread.get(cacheKey);
    if (savedDraft) {
      chatInput.value = savedDraft;
      requestAnimationFrame(() => resizeComposer());
    }
    syncComposerSendState();

    chatInput.addEventListener('input', () => {
      replaceEmojiShortcodeBeforeCursor(chatInput);
      if (chatInput.value) {
        dmDraftByThread.set(cacheKey, chatInput.value);
      } else {
        dmDraftByThread.delete(cacheKey);
      }
      showComposerError(null);
      syncComposerSendState();
      resizeComposer();
      handleTypingActivity();
    });

    chatInput.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) {
        return;
      }
      const pastedFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const pastedFile = item.getAsFile();
          if (pastedFile) {
            pastedFiles.push(pastedFile);
          }
        }
      }
      if (pastedFiles.length > 0) {
        e.preventDefault();
        stageAttachmentFiles(pastedFiles);
      }
    });

    chatInput.addEventListener('redshift:paste-file', (e) => {
      const detail = (e as CustomEvent<{ file?: File }>).detail;
      if (detail?.file) {
        stageAttachmentFiles([detail.file]);
      }
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && replyingTo) {
        e.preventDefault();
        replyingTo = null;
        syncReplyBar();
        return;
      }
      if (e.key === 'Enter' && !e.isComposing) {
        const enterSends = getUserPreferences().enterToSend;
        if (enterSends ? !e.shiftKey : e.ctrlKey || e.metaKey) {
          e.preventDefault();
          sendMessage();
        }
      }
    });

    composerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendMessage();
    });

    let lastComposerWidth = 0;
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        if (chatInput.clientWidth !== lastComposerWidth) {
          lastComposerWidth = chatInput.clientWidth;
          resizeComposer();
        }
      });
      observer.observe(composerForm);
    }

    const emojiAutocomplete = attachEmojiAutocomplete({
      inputEl: chatInput,
      anchorContainer: composerAnchor,
      onApplied: () => {
        resizeComposer();
        handleTypingActivity();
      },
    });

    const getMentionCandidates = (): PublicProfile[] => {
      const snap = state.snapshot;
      if (!snap) {
        return [];
      }
      const selfKey = snap.user.username.toLowerCase();
      if (isGroup) {
        const latestGroup = snap.groups?.find((g) => g.id === groupId) ?? initialTarget.group;
        return latestGroup.members.filter((m) => m.username.toLowerCase() !== selfKey);
      }
      const latestPeer = findKnownDmPeer(snap, peerKey) ?? initialTarget.friend;
      return latestPeer ? [latestPeer] : [];
    };

    const mentionAutocomplete = attachMentionAutocomplete({
      inputEl: chatInput,
      anchorContainer: composerAnchor,
      getCandidates: getMentionCandidates,
      resolveAvatar: resolveProfileAvatar,
      onApplied: () => {
        resizeComposer();
        handleTypingActivity();
      },
    });

    const dmDropOverlay = createImageDropOverlay(
      'Drop files to attach',
      `Up to ${MAX_ATTACHMENTS} files (images, video, audio, files — up to 1 GB)`,
    );
    dmThreadPane.appendChild(dmDropOverlay);
    const detachDmDropZone = attachImageDropZone(dmThreadPane, {
      overlayEl: dmDropOverlay,
      activeClass: 'dm-thread-pane--dragover',
      onFiles: (files) => {
        stageAttachmentFiles(files);
      },
    });

    activeDmCleanup = () => {
      if (chatMessages.isConnected && chatMessages.clientHeight > 0 && initialScrollApplied) {
        const atBot = pinnedToBottom || isAtBottomNow();
        dmScrollStateByThread.set(cacheKey, {
          atBottom: atBot,
          scrollTop: chatMessages.scrollTop,
        });
        if (atBot && hasUnreadOnThisThread()) {
          markThreadAsRead(readTarget);
        }
      }
      cancelActiveVoiceRecording();
      detachDmDropZone();
      revokeStagedAttachmentUrls(pendingAttachments);
      pendingAttachments = [];
      closeActivePinnedPopover();
      closeActiveSearchPopover();
      closeActiveGifPicker();
      closeActiveEmojiPicker();
      emojiAutocomplete.destroy();
      mentionAutocomplete.destroy();
      dmProfilePanel?.destroy();
      stopOutboundTyping();
      observer?.disconnect();
      messageListObserver?.disconnect();
      messageList.removeEventListener('load', onMessageListMediaLoad, true);
      messageList.removeEventListener('loadedmetadata', onMessageListMediaLoad, true);
      activeVcBarSyncer = null;
      activeDmErrorReporter = null;
      activeDmNotifyPeerMessage = null;
      activeDmIsAtBottom = null;
    };

    composerAnchor.appendChild(composerBox);
    composerForm.appendChild(composerAnchor);
    dmThreadPane.appendChild(composerForm);
    dmBodySplit.appendChild(dmThreadPane);
    dmBodySplit.appendChild(mobileSheetBackdrop);
    if (dmProfilePanel) {
      dmBodySplit.appendChild(dmProfilePanel.element);
    }
    if (groupMembersPanel) {
      dmBodySplit.appendChild(groupMembersPanel.element);
    }
    chatArea.appendChild(dmBodySplit);

    const seq = ++dmLoadSeq;
    const jumpForThisThread =
      pendingGlobalJump && pendingGlobalJump.cacheKey === cacheKey
        ? pendingGlobalJump.messageId
        : null;
    if (jumpForThisThread) {
      pendingGlobalJump = null;
    }

    if (historyLoaded && !jumpForThisThread) {
      applyInitialScrollPosition();
      syncJumpBar();
    }

    const hydratedAgeMs = Date.now() - (dmHistoryHydratedAt.get(cacheKey) ?? 0);
    const shouldReconcileHistory =
      Boolean(jumpForThisThread) || !preHydrated || !socketConnected || hydratedAgeMs > 45_000;

    if (shouldReconcileHistory) {
      void apiFetchDmHistory(
        apiTarget,
        jumpForThisThread ? { around: jumpForThisThread } : { limit: 50 },
      ).then((res) => {
        if (seq !== dmLoadSeq || state.screen !== 'app' || !isThreadCurrentlyViewed(cacheKey)) {
          return;
        }
        historyLoaded = true;
        if (res.ok && res.messages) {
          mergeDmHistory(cacheKey, res.messages);
          dmHistoryHydratedAt.set(cacheKey, Date.now());
          if (res.hasMore !== undefined) {
            dmHasMoreByThread.set(cacheKey, Boolean(res.hasMore));
          }
        }
        if (!isGroup && res.ok) {
          if (res.peerReceipt) {
            dmReceiptsByThread.set(cacheKey, res.peerReceipt);
          } else {
            dmReceiptsByThread.delete(cacheKey);
          }
        }
        syncDmThread();
        if (jumpForThisThread) {
          initialScrollApplied = true;
          requestAnimationFrame(() => jumpToMessageById(jumpForThisThread));
        }
      });
    }

    requestAnimationFrame(() => {
      resizeComposer();
      if (!jumpForThisThread && historyLoaded) {
        applyInitialScrollPosition();
      }
      syncJumpBar();
      chatInput.focus();
    });
  };

  const renderMainArea = () => {
    closeActivePinnedPopover();
    closeActiveSearchPopover();
    closeActiveGifPicker();
    closeActiveEmojiPicker();
    if (activeDmCleanup) {
      activeDmCleanup();
      activeDmCleanup = null;
    }
    activeDmSyncer = null;
    activeVcBarSyncer = null;
    activeTypingSyncer = null;
    activeFriendsHandle = null;
    mobileBackBadgeSyncer = null;
    syncSidebarNavAndDms();

    const snap = state.snapshot;
    if (!snap) {
      voiceManager.setViewedThreadKey(null);
      return;
    }

    if (state.mainView === 'group' && state.activeGroupId) {
      const group = (snap.groups ?? []).find((g) => g.id === state.activeGroupId);
      if (group) {
        voiceManager.setViewedThreadKey(`group:${group.id}`);
        renderDmView({ kind: 'group', group });
        return;
      }
      state.mainView = 'friends';
      state.activeGroupId = null;
      syncSidebarNavAndDms();
    }

    if (state.mainView === 'dm' && state.activeDmUsername) {
      const dmPeer = findKnownDmPeer(snap, state.activeDmUsername);
      if (dmPeer) {
        const selfKey = snap.user.username.toLowerCase();
        const dmVcKey = [selfKey, dmPeer.username.toLowerCase()].sort().join('::');
        voiceManager.setViewedThreadKey(dmVcKey);
        renderDmView({ kind: 'dm', friend: dmPeer });
        return;
      }
      state.mainView = 'friends';
      state.activeDmUsername = null;
      syncSidebarNavAndDms();
    }

    voiceManager.setViewedThreadKey(null);
    activeFriendsHandle = renderFriendsPanel(chatArea, {
      getSnapshot: () => state.snapshot!,
      resolveAvatar: resolveProfileAvatar,
      activeTab: state.friendsTab,
      onTabChange: (nextTab) => {
        state.friendsTab = nextTab;
        renderMainArea();
      },
      onOpenDm: (friendUsername) => {
        openDirectMessageWithUser(friendUsername);
      },
      onSnapshotUpdated: (nextSnapshot) => {
        applyLiveSnapshot(nextSnapshot);
      },
    });
  };

  const syncThreadMuteExpiryTimer = () => {
    if (muteExpiryTimerId !== null) {
      window.clearTimeout(muteExpiryTimerId);
      muteExpiryTimerId = null;
    }
    const mutes = state.snapshot?.mutedThreads;
    if (!mutes) {
      return;
    }
    const now = Date.now();
    let earliest: number | null = null;
    for (const until of Object.values(mutes)) {
      if (typeof until === 'number' && until > 0) {
        if (until <= now) {
          earliest = now;
          break;
        }
        if (earliest === null || until < earliest) {
          earliest = until;
        }
      }
    }
    if (earliest !== null) {
      const delay = Math.min(2_147_483_647, Math.max(250, earliest - now + 60));
      muteExpiryTimerId = window.setTimeout(() => {
        muteExpiryTimerId = null;
        syncSidebarNavAndDms();
        if (state.mainView === 'dm' || state.mainView === 'group') {
          activeDmSyncer?.();
        }
        syncThreadMuteExpiryTimer();
      }, delay);
    }
  };

  const recentFriendReqNotified = new Map<string, number>();

  const notifyIncomingFriendRequest = (
    sender: {
      username: string;
      displayName: string;
      avatarPreset: number | null;
      avatarDataUrl?: string;
    },
    userStatus?: SocialSnapshot['user']['status'],
  ) => {
    const key = sender.username.toLowerCase();
    const now = Date.now();
    const lastAt = recentFriendReqNotified.get(key) ?? 0;
    if (now - lastAt < 5000) {
      return;
    }
    recentFriendReqNotified.set(key, now);
    if (userStatus === 'dnd') {
      return;
    }
    const viewingPendingFocused =
      isAppWindowFocused() && state.mainView === 'friends' && state.friendsTab === 'pending';
    if (viewingPendingFocused) {
      return;
    }
    playNotificationChime();
    dispatchRedshiftNotification({
      title: sender.displayName,
      body: `@${sender.username} sent you a friend request`,
      icon: resolveProfileAvatar(sender),
      badge: 'Friend Request',
      tag: `redshift-fr-${key}`,
      userStatus,
      onClick: () => {
        if (state.screen === 'app') {
          state.mainView = 'friends';
          state.friendsTab = 'pending';
          renderMainArea();
        }
      },
    });
  };

  const applyLiveSnapshot = (nextSnapshot: SocialSnapshot, previousUsername?: string) => {
    const prevReceiptsEnabled = Boolean(state.snapshot?.user.privacy?.showReadReceipts);
    const nextReceiptsEnabled = Boolean(nextSnapshot.user.privacy?.showReadReceipts);
    const prevIncomingUsernames = new Set(
      (state.snapshot?.incomingRequests ?? []).map((r) => r.user.username.toLowerCase()),
    );

    if (previousUsername && previousUsername.toLowerCase() !== nextSnapshot.user.username.toLowerCase()) {
      const oldKey = previousUsername.toLowerCase();
      const newKey = nextSnapshot.user.username.toLowerCase();
      for (const list of dmMessagesByThread.values()) {
        for (const msg of list) {
          if (msg.authorUsername.toLowerCase() === oldKey) {
            msg.authorUsername = newKey;
          }
          if (msg.pinnedBy && msg.pinnedBy.toLowerCase() === oldKey) {
            msg.pinnedBy = newKey;
          }
        }
      }
    }

    const snapNow = Date.now();
    // Strip unread badges for any thread recently marked read (or with /api/dms/read still in-flight)
    // so an overlapping 5s snapshot poll or another thread's read ACK never resurrects already-seen badges.
    if (nextSnapshot.unreadCounts) {
      for (const peerId of Object.keys(nextSnapshot.unreadCounts)) {
        if (isThreadUnreadSuppressed(dmThreadCacheKey(peerId), snapNow)) {
          delete nextSnapshot.unreadCounts[peerId];
        }
      }
    }
    if (nextSnapshot.unreadMentions) {
      for (const peerId of Object.keys(nextSnapshot.unreadMentions)) {
        if (isThreadUnreadSuppressed(dmThreadCacheKey(peerId), snapNow)) {
          delete nextSnapshot.unreadMentions[peerId];
        }
      }
    }
    if (nextSnapshot.groupUnreadCounts) {
      for (const grpId of Object.keys(nextSnapshot.groupUnreadCounts)) {
        if (isThreadUnreadSuppressed(groupThreadCacheKey(grpId), snapNow)) {
          delete nextSnapshot.groupUnreadCounts[grpId];
        }
      }
    }
    if (nextSnapshot.groupUnreadMentions) {
      for (const grpId of Object.keys(nextSnapshot.groupUnreadMentions)) {
        if (isThreadUnreadSuppressed(groupThreadCacheKey(grpId), snapNow)) {
          delete nextSnapshot.groupUnreadMentions[grpId];
        }
      }
    }

    // If the user is actively viewing a thread at the bottom in a visible window, never allow
    // a hidden unread count to linger behind `!isSelected` and pop up when they switch chats.
    let autoMarkViewedTarget: { kind: 'dm'; id: string } | { kind: 'group'; id: string } | null = null;
    if (document.visibilityState !== 'hidden' && (activeDmIsAtBottom?.() ?? true)) {
      if (state.mainView === 'dm' && state.activeDmUsername) {
        const activePeer = state.activeDmUsername.toLowerCase();
        const activeKey = dmThreadCacheKey(activePeer);
        const hadUnread =
          (nextSnapshot.unreadCounts?.[activePeer] ?? 0) > 0 ||
          (nextSnapshot.unreadMentions?.[activePeer] ?? 0) > 0;
        if (hadUnread) {
          if (nextSnapshot.unreadCounts) delete nextSnapshot.unreadCounts[activePeer];
          if (nextSnapshot.unreadMentions) delete nextSnapshot.unreadMentions[activePeer];
          if (snapNow - (lastAutoMarkReadAt.get(activeKey) ?? 0) > 1500) {
            autoMarkViewedTarget = { kind: 'dm', id: activePeer };
          }
        }
      } else if (state.mainView === 'group' && state.activeGroupId) {
        const activeGrp = state.activeGroupId;
        const activeKey = groupThreadCacheKey(activeGrp);
        const hadUnread =
          (nextSnapshot.groupUnreadCounts?.[activeGrp] ?? 0) > 0 ||
          (nextSnapshot.groupUnreadMentions?.[activeGrp] ?? 0) > 0;
        if (hadUnread) {
          if (nextSnapshot.groupUnreadCounts) delete nextSnapshot.groupUnreadCounts[activeGrp];
          if (nextSnapshot.groupUnreadMentions) delete nextSnapshot.groupUnreadMentions[activeGrp];
          if (snapNow - (lastAutoMarkReadAt.get(activeKey) ?? 0) > 1500) {
            autoMarkViewedTarget = { kind: 'group', id: activeGrp };
          }
        }
      }
    }

    const prevThreadActivity = state.snapshot?.threadActivity ?? {};
    const prevUnreadDms = state.snapshot?.unreadCounts ?? {};
    const prevUnreadGroups = state.snapshot?.groupUnreadCounts ?? {};

    const lockedSelfStatus = getLockedOptimisticSelfStatus();
    const lockedSelfCustom = getLockedOptimisticSelfCustomStatus();
    if (lockedSelfStatus || lockedSelfCustom.locked) {
      const selfKeyLower = nextSnapshot.user.username.toLowerCase();
      const patchedUser = {
        ...nextSnapshot.user,
        ...(lockedSelfStatus ? { status: lockedSelfStatus } : {}),
        ...(lockedSelfCustom.locked ? { customStatus: lockedSelfCustom.customStatus } : {}),
      };
      const visibleSelfStatus: EffectiveStatus =
        patchedUser.status === 'invisible' ? 'offline' : patchedUser.status;
      nextSnapshot = {
        ...nextSnapshot,
        user: patchedUser,
        groups: (nextSnapshot.groups ?? []).map((grp) => ({
          ...grp,
          members: grp.members.map((m) =>
            m.username.toLowerCase() === selfKeyLower
              ? {
                  ...m,
                  status: visibleSelfStatus,
                  customStatus: patchedUser.customStatus ?? null,
                }
              : m,
          ),
        })),
      };
    }

    state.snapshot = nextSnapshot;
    if (autoMarkViewedTarget) {
      markThreadAsRead(autoMarkViewedTarget);
    }

    // Background message capture: if any inactive DM or Group Chat received newer activity or
    // unread messages (e.g. while browsing elsewhere or during a brief WS hiccup), prefetch it now.
    const nextAct = nextSnapshot.threadActivity ?? {};
    for (const grp of nextSnapshot.groups ?? []) {
      const ck = groupThreadCacheKey(grp.id);
      if (isThreadCurrentlyViewed(ck)) continue;
      const actAdvanced = (nextAct[ck] ?? 0) > (prevThreadActivity[ck] ?? 0);
      const unreadAdvanced =
        (nextSnapshot.groupUnreadCounts?.[grp.id] ?? 0) > (prevUnreadGroups[grp.id] ?? 0);
      if (actAdvanced || unreadAdvanced) {
        void prefetchThreadHistory({ groupId: grp.id }, ck);
      }
    }
    const nextUnreadDms = nextSnapshot.unreadCounts ?? {};
    for (const [k, ts] of Object.entries(nextAct)) {
      if (!k.startsWith('dm:')) continue;
      if (isThreadCurrentlyViewed(k)) continue;
      const peerU = k.slice('dm:'.length);
      if (
        (ts ?? 0) > (prevThreadActivity[k] ?? 0) ||
        (nextUnreadDms[peerU] ?? 0) > (prevUnreadDms[peerU] ?? 0)
      ) {
        void prefetchThreadHistory({ peerUsername: peerU }, k);
      }
    }

    const addedIncoming = nextSnapshot.incomingRequests.filter(
      (r) => !prevIncomingUsernames.has(r.user.username.toLowerCase()),
    );
    if (addedIncoming.length > 0) {
      notifyIncomingFriendRequest(addedIncoming[0].user, nextSnapshot.user.status);
    }

    const profilesByUsername = new Map<
      string,
      { displayName: string; avatarPreset: number | null; avatarDataUrl?: string }
    >();
    profilesByUsername.set(nextSnapshot.user.username.toLowerCase(), nextSnapshot.user);
    for (const friend of nextSnapshot.friends) {
      profilesByUsername.set(friend.username.toLowerCase(), friend);
    }
    for (const dmPeer of nextSnapshot.dmPeers ?? []) {
      profilesByUsername.set(dmPeer.username.toLowerCase(), dmPeer);
    }
    for (const req of nextSnapshot.incomingRequests) {
      profilesByUsername.set(req.user.username.toLowerCase(), req.user);
    }
    for (const req of nextSnapshot.outgoingRequests) {
      profilesByUsername.set(req.user.username.toLowerCase(), req.user);
    }
    for (const grp of nextSnapshot.groups ?? []) {
      for (const m of grp.members) {
        profilesByUsername.set(m.username.toLowerCase(), m);
      }
    }

    for (const list of dmMessagesByThread.values()) {
      for (const msg of list) {
        const latest = profilesByUsername.get(msg.authorUsername.toLowerCase());
        if (latest) {
          msg.authorName = latest.displayName;
          msg.authorAvatarPreset = latest.avatarPreset;
          msg.authorAvatarDataUrl = latest.avatarDataUrl;
        }
      }
    }

    if (!nextReceiptsEnabled) {
      dmReceiptsByThread.clear();
    } else if (!prevReceiptsEnabled && state.mainView === 'dm' && state.activeDmUsername) {
      const targetPeer = state.activeDmUsername;
      const targetCacheKey = dmThreadCacheKey(targetPeer);
      void apiFetchDmHistory({ peerUsername: targetPeer }).then((res) => {
        if (!res.ok || state.screen !== 'app' || !isThreadCurrentlyViewed(targetCacheKey)) {
          return;
        }
        if (res.peerReceipt) {
          dmReceiptsByThread.set(targetCacheKey, res.peerReceipt);
        }
        activeDmSyncer?.();
      });
    }

    syncDock();
    syncThreadMuteExpiryTimer();
    syncSidebarNavAndDms();
    drawerController.refresh();
    activeSelfProfileModal?.refresh();
    syncOpenPublicProfileModals(nextSnapshot);
    if (state.mainView === 'group') {
      const stillInGroup = state.activeGroupId
        ? (nextSnapshot.groups ?? []).some((g) => g.id === state.activeGroupId)
        : false;
      if (stillInGroup) {
        activeDmSyncer?.();
      } else {
        state.activeGroupId = null;
        state.mainView = 'friends';
        renderMainArea();
      }
    } else if (state.mainView === 'dm') {
      const dmStillAvailable = state.activeDmUsername
        ? Boolean(findKnownDmPeer(nextSnapshot, state.activeDmUsername))
        : false;
      if (dmStillAvailable) {
        activeDmSyncer?.();
      } else {
        renderMainArea();
      }
    } else {
      activeFriendsHandle?.syncLive();
    }
    syncCustomStatusExpiryTimer();
  };

  let statusExpiryTimerId: number | null = null;
  const syncCustomStatusExpiryTimer = () => {
    if (statusExpiryTimerId !== null) {
      window.clearTimeout(statusExpiryTimerId);
      statusExpiryTimerId = null;
    }
    if (muteExpiryTimerId !== null) {
      window.clearTimeout(muteExpiryTimerId);
      muteExpiryTimerId = null;
    }
    const snap = state.snapshot;
    if (!snap) {
      return;
    }
    const now = Date.now();
    let earliest = Infinity;
    const candidates = [snap.user.customStatus, ...snap.friends.map((f) => f.customStatus)];
    for (const cs of candidates) {
      if (cs && typeof cs.expiresAt === 'number' && cs.expiresAt > now) {
        earliest = Math.min(earliest, cs.expiresAt);
      }
    }
    if (Number.isFinite(earliest)) {
      const delay = Math.min(2_000_000_000, Math.max(250, earliest - now + 60));
      statusExpiryTimerId = window.setTimeout(() => {
        statusExpiryTimerId = null;
        if (state.snapshot) {
          applyLiveSnapshot(state.snapshot);
        }
      }, delay);
    }
  };

  friendsNavBtn.addEventListener('click', () => {
    state.mainView = 'friends';
    renderMainArea();
  });

  const handleSignOutAction = () => {
    voiceManager.leaveCall();
    voiceManager.destroy();
    drawerController.close();
    closeActiveSettings?.();
    void apiSignOut();
    state.snapshot = null;
    state.activeDmUsername = null;
    state.activeGroupId = null;
    state.mainView = 'friends';
    navigate('login');
  };

  let signOutConfirmOpen = false;
  const requestSignOutAction = () => {
    if (signOutConfirmOpen) {
      return;
    }
    signOutConfirmOpen = true;
    void openConfirmPopup({
      title: 'Log Out',
      message: 'Are you sure you want to log out of Redshift?',
      confirmLabel: 'Log Out',
      danger: true,
    }).then((confirmed) => {
      signOutConfirmOpen = false;
      if (confirmed) {
        handleSignOutAction();
      }
    });
  };

  let activeSelfProfileModal: SelfProfileModalHandle | null = null;
  let closeActiveSettings: (() => void) | null = null;
  let closeActiveQuickSwitcher: (() => void) | null = null;
  let closeActiveGlobalSearch: (() => void) | null = null;

  const applyOptimisticSelfPatch = (patch: {
    status?: UserStatus;
    customStatus?: CustomStatusData | null;
  }) => {
    const snap = state.snapshot;
    if (!snap) {
      return;
    }
    const selfKeyLower = snap.user.username.toLowerCase();
    const nextUser = {
      ...snap.user,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.customStatus !== undefined ? { customStatus: patch.customStatus } : {}),
    };
    const visibleSelfStatus: EffectiveStatus =
      nextUser.status === 'invisible' ? 'offline' : nextUser.status;
    state.snapshot = {
      ...snap,
      user: nextUser,
      groups: (snap.groups ?? []).map((grp) => ({
        ...grp,
        members: grp.members.map((m) =>
          m.username.toLowerCase() === selfKeyLower
            ? {
                ...m,
                status: visibleSelfStatus,
                customStatus: nextUser.customStatus ?? null,
              }
            : m,
        ),
      })),
    };
    syncDock();
    syncCustomStatusExpiryTimer();
    drawerController.refresh();
    activeSelfProfileModal?.refresh();
    syncOpenPublicProfileModals(state.snapshot);
    if (state.mainView === 'group' || state.mainView === 'dm') {
      activeDmSyncer?.();
    }
  };

  const drawerController = createProfileDrawerController({
    presetAvatars: PRESET_AVATARS,
    resolveAvatar: resolveProfileAvatar,
    getUser: () => state.snapshot!.user,
    onSnapshotUpdated: (nextSnapshot, previousUsername) => {
      applyLiveSnapshot(nextSnapshot, previousUsername);
    },
    onOptimisticSelfPatch: applyOptimisticSelfPatch,
    onSyncDock: syncDock,
    onSignOut: requestSignOutAction,
    onOpenFullProfile: () => triggerSelfProfileModal?.(false),
    onOpenSettings: () => triggerVoiceSettingsModal?.(),
  });

  const openUserSettingsModal = () => {
    drawerController.close();
    activeSelfProfileModal?.close();
    closeActiveSettings?.();
    let cancelled = false;
    closeActiveSettings = () => {
      cancelled = true;
    };
    void import('./userSettingsModal').then(({ openUserSettingsOverlay }) => {
      if (cancelled || state.screen !== 'app' || !state.snapshot) {
        return;
      }
      closeActiveSettings = openUserSettingsOverlay({
        getSnapshot: () => state.snapshot!,
        resolveAvatar: resolveProfileAvatar,
        onSnapshotUpdated: (nextSnapshot) => applyLiveSnapshot(nextSnapshot),
        onOpenEditProfile: () => {
          if (window.innerWidth <= 768) {
            triggerSelfProfileModal?.(true);
          } else {
            drawerController.openEdit();
          }
        },
        onSignOut: requestSignOutAction,
        onMicTestChange: (testing) => {
          voiceManager.setTestingMic(testing);
        },
        onPreferencesChanged: () => {
          if (state.mainView === 'dm' || state.mainView === 'group') {
            activeDmSyncer?.();
          }
          syncDockVoiceControls();
        },
      });
    });
  };
  triggerVoiceSettingsModal = openUserSettingsModal;

  triggerSelfProfileModal = (initialEdit = false) => {
    if (!state.snapshot) {
      return;
    }
    drawerController.close();
    activeSelfProfileModal?.close();
    activeSelfProfileModal = openSelfProfileModal({
      presetAvatars: PRESET_AVATARS,
      resolveAvatar: resolveProfileAvatar,
      getSnapshot: () => state.snapshot!,
      onSnapshotUpdated: (nextSnapshot, previousUsername) => {
        applyLiveSnapshot(nextSnapshot, previousUsername);
      },
      onOptimisticSelfPatch: applyOptimisticSelfPatch,
      onSyncDock: syncDock,
      onOpenSettings: openUserSettingsModal,
      onSignOut: requestSignOutAction,
      initialEdit,
      onClose: () => {
        activeSelfProfileModal = null;
      },
    });
  };

  dockMain.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const user = state.snapshot?.user;
    if (!user) {
      return;
    }
    openContextMenu({
      clientX: e.clientX,
      clientY: e.clientY,
      minWidth: 204,
      items: [
        {
          label: 'View Full Profile',
          icon: 'user',
          onSelect: () => triggerSelfProfileModal?.(false),
        },
        {
          label: 'Edit Profile',
          icon: 'edit',
          onSelect: () => triggerSelfProfileModal?.(true),
        },
        {
          label: 'User Settings',
          icon: 'settings',
          onSelect: openUserSettingsModal,
        },
        {
          label: 'Copy Username',
          icon: 'copy',
          dividerBefore: true,
          onSelect: () => {
            void copyToClipboard(user.username);
          },
        },
      ],
    });
  });

  settingsGearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openUserSettingsModal();
  });

  triggerQuickSwitcher = () => {
    if (!state.snapshot) {
      return;
    }
    if (closeActiveQuickSwitcher) {
      const closeFn = closeActiveQuickSwitcher;
      closeActiveQuickSwitcher = null;
      closeFn();
      return;
    }
    drawerController.close();
    closeActiveSearchPopover();
    closeActivePinnedPopover();
    let cancelled = false;
    closeActiveQuickSwitcher = () => {
      cancelled = true;
      closeActiveQuickSwitcher = null;
    };
    void import('./quickSwitcherModal').then(({ openQuickSwitcherModal }) => {
      if (cancelled || state.screen !== 'app' || !state.snapshot) {
        return;
      }
      closeActiveQuickSwitcher = openQuickSwitcherModal({
        getSnapshot: () => state.snapshot!,
        resolveAvatar: resolveProfileAvatar,
        onSelectDm: (uname) => {
          openDirectMessageWithUser(uname);
        },
        onSelectGroup: (gid) => {
          openGroupChatById(gid);
        },
        onOpenFriends: () => {
          state.mainView = 'friends';
          renderMainArea();
        },
        onOpenSettings: () => {
          openUserSettingsModal();
        },
        onOpenGlobalSearch: () => {
          triggerGlobalSearch?.();
        },
        onClose: () => {
          closeActiveQuickSwitcher = null;
        },
      });
    });
  };

  triggerGlobalSearch = () => {
    if (!state.snapshot) {
      return;
    }
    if (closeActiveGlobalSearch) {
      const closeFn = closeActiveGlobalSearch;
      closeActiveGlobalSearch = null;
      closeFn();
      return;
    }
    drawerController.close();
    closeActiveSearchPopover();
    closeActivePinnedPopover();
    let cancelled = false;
    closeActiveGlobalSearch = () => {
      cancelled = true;
      closeActiveGlobalSearch = null;
    };
    void import('./globalSearchModal').then(({ openGlobalSearchModal }) => {
      if (cancelled || state.screen !== 'app' || !state.snapshot) {
        return;
      }
      closeActiveGlobalSearch = openGlobalSearchModal({
        resolveAvatar: resolveProfileAvatar,
        formatTime: formatMessageTime,
        onSelectResult: (result) => {
          const targetCacheKey =
            result.kind === 'group' && result.groupId
              ? groupThreadCacheKey(result.groupId)
              : result.peerUsername
                ? dmThreadCacheKey(result.peerUsername)
                : '';
          if (!targetCacheKey) {
            return;
          }
          if (isThreadCurrentlyViewed(targetCacheKey)) {
            pendingGlobalJump = { cacheKey: targetCacheKey, messageId: result.message.id };
            renderMainArea();
            return;
          }
          pendingGlobalJump = { cacheKey: targetCacheKey, messageId: result.message.id };
          if (result.kind === 'group' && result.groupId) {
            openGroupChatById(result.groupId);
          } else if (result.peerUsername) {
            openDirectMessageWithUser(result.peerUsername);
          }
        },
        onClose: () => {
          closeActiveGlobalSearch = null;
        },
      });
    });
  };

  const handleGlobalKeydown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
      if (state.screen !== 'app' || !state.snapshot) {
        return;
      }
      e.preventDefault();
      triggerQuickSwitcher?.();
    } else if (
      (e.ctrlKey || e.metaKey) &&
      e.shiftKey &&
      !e.altKey &&
      e.key.toLowerCase() === 'f'
    ) {
      if (state.screen !== 'app' || !state.snapshot) {
        return;
      }
      e.preventDefault();
      triggerGlobalSearch?.();
    }
  };
  window.addEventListener('keydown', handleGlobalKeydown, true);

  const computeChatDisplaySig = (prefs: ReturnType<typeof getUserPreferences>) =>
    [
      prefs.use24HourTime ? 1 : 0,
      prefs.inlineMedia ? 1 : 0,
      prefs.alwaysRevealSpoilers ? 1 : 0,
      prefs.fontSize,
      prefs.messageDensity,
      prefs.theme,
    ].join('|');
  let lastChatDisplaySig = computeChatDisplaySig(getUserPreferences());
  const unsubscribePrefs = subscribeUserPreferences((nextPrefs) => {
    const nextSig = computeChatDisplaySig(nextPrefs);
    if (nextSig === lastChatDisplaySig) {
      return;
    }
    lastChatDisplaySig = nextSig;
    if (state.mainView === 'dm' || state.mainView === 'group') {
      activeDmSyncer?.();
    }
  });

  dockMain.addEventListener('click', () => drawerController.open());
  leftColumn.appendChild(drawerController.element);

  let liveSyncPollInFlight = false;
  let lastLiveSyncPollAt = 0;
  const triggerBackgroundSnapshotSync = (force = false) => {
    if (liveSyncPollInFlight || state.screen !== 'app' || !state.snapshot) {
      return;
    }
    const now = Date.now();
    if (!force && now - lastLiveSyncPollAt < 2500) {
      return;
    }
    liveSyncPollInFlight = true;
    lastLiveSyncPollAt = now;
    void apiResumeSession()
      .then((res) => {
        if (res.ok && res.snapshot && state.screen === 'app') {
          applyLiveSnapshot(res.snapshot);
        }
      })
      .finally(() => {
        liveSyncPollInFlight = false;
      });
  };

  const liveSnapshotPollTimer = window.setInterval(() => {
    if (document.visibilityState === 'hidden') {
      return;
    }
    // When WebSocket is connected, every change is pushed live; only run a low-frequency 45s safety reconciliation.
    const minIntervalMs = socketConnected ? 45_000 : 5_000;
    if (Date.now() - lastLiveSyncPollAt >= minIntervalMs) {
      triggerBackgroundSnapshotSync(false);
    }
  }, 5000);

  const handleWindowActive = () => {
    if (document.visibilityState === 'hidden') {
      return;
    }
    triggerBackgroundSnapshotSync(false);
    if (state.mainView === 'group' && state.activeGroupId) {
      if ((state.snapshot?.groupUnreadCounts?.[state.activeGroupId] ?? 0) > 0) {
        markThreadAsRead({ kind: 'group', id: state.activeGroupId });
      }
    } else if (state.mainView === 'dm' && state.activeDmUsername) {
      const peerKey = state.activeDmUsername.toLowerCase();
      if ((state.snapshot?.unreadCounts?.[peerKey] ?? 0) > 0) {
        markThreadAsRead({ kind: 'dm', id: peerKey });
      }
    }
  };
  window.addEventListener('focus', handleWindowActive);
  document.addEventListener('visibilitychange', handleWindowActive);

  const resolvePeerKey = (threadUsers?: [string, string]): string | null => {
    if (!threadUsers) {
      return null;
    }
    const selfKey = state.snapshot?.user.username.toLowerCase();
    if (!selfKey) {
      return null;
    }
    return threadUsers[0].toLowerCase() === selfKey
      ? threadUsers[1].toLowerCase()
      : threadUsers[0].toLowerCase();
  };

  const resolveEventCacheKey = (payload: {
    threadUsers?: [string, string];
    groupId?: string;
  }): string | null => {
    if (payload.groupId) {
      return groupThreadCacheKey(payload.groupId);
    }
    const peerKey = resolvePeerKey(payload.threadUsers);
    return peerKey ? dmThreadCacheKey(peerKey) : null;
  };

  const handleNetworkOnline = () => {
    void flushOutboundQueue();
  };
  const handleNetworkOffline = () => {
    socketConnected = false;
    markQueuedPeersPending();
  };
  window.addEventListener('online', handleNetworkOnline);
  window.addEventListener('offline', handleNetworkOffline);

  socketHandle = connectSocialSocket({
    onOpen: () => {
      socketConnected = true;
      void flushOutboundQueue();
      triggerBackgroundSnapshotSync(true);
    },
    onClose: () => {
      socketConnected = false;
    },
    onSnapshot: (nextSnapshot) => {
      applyLiveSnapshot(nextSnapshot);
    },
    onGifsUpdated: () => {
      window.dispatchEvent(new CustomEvent('redshift:gifs-updated'));
    },
    onVcState: (payload) => {
      voiceManager.handleVcState(payload);
    },
    onVcIncoming: (payload) => {
      voiceManager.handleVcIncoming(payload);
    },
    onVcIncomingClear: (threadKey) => {
      voiceManager.handleVcIncomingClear(threadKey);
    },
    onVcSignal: (payload) => {
      voiceManager.handleVcSignal(payload);
    },
    onVcSpeaking: (payload) => {
      voiceManager.handleVcSpeaking(payload);
    },
    onVcTransferred: (payload) => {
      voiceManager.handleVcTransferred(payload);
    },
    onVcError: (errMsg) => {
      activeDmErrorReporter?.(errMsg);
    },
    onActivityList: (payload) => {
      voiceManager.handleActivityList(payload);
    },
    onActivityLobbyUpdate: (payload) => {
      voiceManager.handleActivityLobbyUpdate(payload);
    },
    onActivityLobbyRemoved: (payload) => {
      voiceManager.handleActivityLobbyRemoved(payload);
    },
    onDmMessage: ({ threadUsers, groupId, message }) => {
      const cacheKey = resolveEventCacheKey({ threadUsers, groupId });
      const selfKey = state.snapshot?.user.username.toLowerCase();
      if (!cacheKey || !selfKey) {
        return;
      }

      const activeHead = outboundQueue[0];
      if (
        activeHead &&
        activeHead.cacheKey === cacheKey &&
        message.authorUsername.toLowerCase() === selfKey &&
        activeHead.content === message.content &&
        (activeHead.files?.length ?? 0) === (message.attachments?.length ?? 0) &&
        Boolean(activeHead.gif) === Boolean(message.gif)
      ) {
        return;
      }

      const alreadyHadMessage = (dmMessagesByThread.get(cacheKey) ?? []).some(
        (m) => m.id === message.id && !m.isPending,
      );
      upsertDmMessage(cacheKey, message);

      // Background message capture: if this thread hasn't loaded its preceding history yet,
      // silently hydrate it right now so clicking into it later shows every message immediately.
      if (!dmHistoryHydratedAt.has(cacheKey) && !isThreadCurrentlyViewed(cacheKey)) {
        const bgTarget: ThreadTarget | null = groupId
          ? { groupId }
          : (() => {
              const pk = resolvePeerKey(threadUsers);
              return pk ? { peerUsername: pk } : null;
            })();
        if (bgTarget) {
          void prefetchThreadHistory(bgTarget, cacheKey);
        }
      }

      if (state.snapshot) {
        const msgTs = message.timestamp || Date.now();
        const prevAct = state.snapshot.threadActivity ?? {};
        const wasHidden = (state.snapshot.hiddenThreads ?? []).includes(cacheKey);
        if (wasHidden || msgTs > (prevAct[cacheKey] ?? 0)) {
          state.snapshot = {
            ...state.snapshot,
            hiddenThreads: wasHidden
              ? (state.snapshot.hiddenThreads ?? []).filter((k) => k !== cacheKey)
              : state.snapshot.hiddenThreads,
            threadActivity: {
              ...prevAct,
              [cacheKey]: Math.max(prevAct[cacheKey] ?? 0, msgTs),
            },
          };
          syncSidebarNavAndDms();
        }
      }

      const isFromSelf = message.authorUsername.toLowerCase() === selfKey;
      if (isFromSelf) {
        dmScrollStateByThread.set(cacheKey, { atBottom: true, scrollTop: 0 });
      }
      const isActivelyViewing = isThreadCurrentlyViewed(cacheKey);
      const isVisibleHere = isActivelyViewing && document.visibilityState !== 'hidden';
      const isFocusedOnThread = isActivelyViewing && isAppWindowFocused();
      const selfPinged =
        !isFromSelf &&
        (message.replyTo?.authorUsername.toLowerCase() === selfKey ||
          containsSelfMention(message.content, selfKey));
      const allowNotify = shouldNotifyForThreadMessage(state.snapshot, cacheKey, selfPinged);

      if (!isFromSelf) {
        clearThreadTyping(cacheKey, message.authorUsername);
        const viewingAtBottom = isVisibleHere && (activeDmIsAtBottom?.() ?? true);
        if (!alreadyHadMessage && !viewingAtBottom) {
          // A genuinely new message arrived while the user isn't looking at the bottom of this thread;
          // lift any prior read-suppression window and paint the red unread badge IMMEDIATELY (0ms)
          // without waiting for a separate social:sync roundtrip.
          suppressedUnreadByThread.delete(cacheKey);
          if (state.snapshot && !message.callLog && !message.systemEvent) {
            if (groupId) {
              const prevGrpUnreads = state.snapshot.groupUnreadCounts ?? {};
              const nextGrpUnreads = {
                ...prevGrpUnreads,
                [groupId]: (prevGrpUnreads[groupId] ?? 0) + 1,
              };
              const prevGrpMentions = state.snapshot.groupUnreadMentions ?? {};
              const nextGrpMentions = selfPinged
                ? { ...prevGrpMentions, [groupId]: (prevGrpMentions[groupId] ?? 0) + 1 }
                : prevGrpMentions;
              state.snapshot = {
                ...state.snapshot,
                groupUnreadCounts: nextGrpUnreads,
                groupUnreadMentions: nextGrpMentions,
              };
            } else {
              const pKey = resolvePeerKey(threadUsers);
              if (pKey) {
                const prevUnreads = state.snapshot.unreadCounts ?? {};
                const nextUnreads = {
                  ...prevUnreads,
                  [pKey]: (prevUnreads[pKey] ?? 0) + 1,
                };
                const prevMentions = state.snapshot.unreadMentions ?? {};
                const nextMentions = selfPinged
                  ? { ...prevMentions, [pKey]: (prevMentions[pKey] ?? 0) + 1 }
                  : prevMentions;
                state.snapshot = {
                  ...state.snapshot,
                  unreadCounts: nextUnreads,
                  unreadMentions: nextMentions,
                };
              }
            }
            syncSidebarNavAndDms();
            syncDocumentTitle();
          }
        }
        if (isActivelyViewing) {
          activeDmNotifyPeerMessage?.(message, isVisibleHere);
        }
        if (viewingAtBottom) {
          if (groupId) {
            markThreadAsRead({ kind: 'group', id: groupId });
          } else {
            const pKey = resolvePeerKey(threadUsers);
            if (pKey) {
              markThreadAsRead({ kind: 'dm', id: pKey });
            }
          }
        }
        if (
          !alreadyHadMessage &&
          !isFocusedOnThread &&
          !message.callLog &&
          !message.systemEvent &&
          allowNotify &&
          state.snapshot?.user.status !== 'dnd'
        ) {
          playNotificationChime();
          const showPreview = getUserPreferences().notificationShowPreview;
          const groupInfo = groupId
            ? state.snapshot?.groups?.find((g) => g.id === groupId)
            : undefined;
          const peerKey = resolvePeerKey(threadUsers);
          const peerFriend =
            peerKey && state.snapshot ? findKnownDmPeer(state.snapshot, peerKey) : undefined;

          const trimmedContent = message.content.replace(/\s+/g, ' ').trim();
          const serverAtts = message.attachments ?? [];
          const legacyImgCount = message.imageDataUrls?.length ?? (message.imageDataUrl ? 1 : 0);
          const totalAtts = serverAtts.length + legacyImgCount;
          let previewBody = showPreview
            ? trimmedContent
              ? truncateNotificationText(trimmedContent, 120)
              : message.gif
                ? `Sent a GIF: ${message.gif.title || 'GIF'}`
                : message.voiceNote
                  ? 'Sent a voice message'
                  : 'Sent an attachment'
            : 'Sent a new message';

          if (showPreview && !trimmedContent && totalAtts > 0) {
            if (totalAtts > 1) {
              previewBody = `Sent ${totalAtts} attachments`;
            } else if (serverAtts[0]) {
              const first = serverAtts[0];
              previewBody =
                first.kind === 'video'
                  ? `Sent a video: ${first.name}`
                  : first.kind === 'audio'
                    ? `Sent audio: ${first.name}`
                    : first.kind === 'image'
                      ? 'Sent an image'
                      : `Sent a file: ${first.name}`;
            } else {
              previewBody = 'Sent an image';
            }
          }

          const messageAuthorAvatar = peerFriend
            ? resolveProfileAvatar(peerFriend)
            : resolveProfileAvatar({
                avatarPreset: message.authorAvatarPreset,
                avatarDataUrl: message.authorAvatarDataUrl,
              });

          dispatchRedshiftNotification({
            title: groupInfo
              ? groupInfo.name
              : peerFriend?.displayName ?? message.authorName,
            body: groupInfo ? `${message.authorName}: ${previewBody}` : previewBody,
            icon: groupInfo ? resolveGroupAvatar(groupInfo) : messageAuthorAvatar,
            badge: groupInfo ? 'Group' : undefined,
            tag: `redshift-${cacheKey}`,
            userStatus: state.snapshot?.user.status,
            suppressInAppToast: isFocusedOnThread,
            onClick: () => {
              if (state.screen === 'app') {
                if (groupId) {
                  openGroupChatById(groupId);
                } else {
                  openDirectMessageWithUser(peerFriend?.username ?? message.authorUsername);
                }
              }
            },
          });
        }
      }

      if (isActivelyViewing) {
        activeDmSyncer?.();
        activeTypingSyncer?.();
      }
    },
    onDmEdit: ({ threadUsers, groupId, message }) => {
      const cacheKey = resolveEventCacheKey({ threadUsers, groupId });
      if (!cacheKey) {
        return;
      }
      replaceDmMessage(cacheKey, message);
      if (isThreadCurrentlyViewed(cacheKey)) {
        activeDmSyncer?.();
        window.dispatchEvent(new CustomEvent('redshift:pinned-updated'));
      }
    },
    onDmPin: ({ threadUsers, groupId, message }) => {
      const cacheKey = resolveEventCacheKey({ threadUsers, groupId });
      if (!cacheKey) {
        return;
      }
      replaceDmMessage(cacheKey, message);
      if (isThreadCurrentlyViewed(cacheKey)) {
        activeDmSyncer?.();
        window.dispatchEvent(new CustomEvent('redshift:pinned-updated'));
      }
    },
    onDmDelete: ({ threadUsers, groupId, messageId }) => {
      const cacheKey = resolveEventCacheKey({ threadUsers, groupId });
      if (!cacheKey) {
        return;
      }
      removeDmMessage(cacheKey, messageId);
      if (isThreadCurrentlyViewed(cacheKey)) {
        activeDmSyncer?.();
        window.dispatchEvent(new CustomEvent('redshift:pinned-updated'));
      }
    },
    onDmReact: ({ threadUsers, groupId, messageId, reactions }) => {
      const cacheKey = resolveEventCacheKey({ threadUsers, groupId });
      if (!cacheKey) {
        return;
      }
      updateDmMessageReactions(cacheKey, messageId, reactions);
      if (isThreadCurrentlyViewed(cacheKey)) {
        activeDmSyncer?.();
      }
    },
    onDmRead: ({ threadUsers, groupId, receipt }) => {
      const cacheKey = resolveEventCacheKey({ threadUsers, groupId });
      if (!cacheKey || groupId) {
        return;
      }
      dmReceiptsByThread.set(cacheKey, receipt);
      if (isThreadCurrentlyViewed(cacheKey)) {
        activeDmSyncer?.();
      }
    },
    onTyping: ({ fromUsername, displayName, isTyping, groupId }) => {
      const cacheKey = groupId
        ? groupThreadCacheKey(groupId)
        : dmThreadCacheKey(fromUsername);
      const senderKey = fromUsername.toLowerCase();
      clearThreadTyping(cacheKey, senderKey);

      if (isTyping) {
        let threadMap = typingByThread.get(cacheKey);
        if (!threadMap) {
          threadMap = new Map();
          typingByThread.set(cacheKey, threadMap);
        }
        const timerId = window.setTimeout(() => {
          typingByThread.get(cacheKey)?.delete(senderKey);
          if (isThreadCurrentlyViewed(cacheKey)) {
            activeTypingSyncer?.();
          }
        }, 1600);
        threadMap.set(senderKey, { displayName, timerId });
      }

      if (isThreadCurrentlyViewed(cacheKey)) {
        activeTypingSyncer?.();
      }
    },
    onSocialNotify: (payload) => {
      const userStatus = state.snapshot?.user.status;
      if (userStatus === 'dnd') {
        return;
      }

      if (payload.kind === 'friend-request') {
        notifyIncomingFriendRequest(payload.actor, userStatus);
        return;
      }

      if (payload.kind === 'group-added') {
        const groupObj = payload.groupId
          ? state.snapshot?.groups?.find((g) => g.id === payload.groupId)
          : undefined;
        const icon = groupObj
          ? resolveGroupAvatar(groupObj)
          : resolveGroupAvatar({
              name: payload.groupName ?? 'Group Chat',
              iconDataUrl: payload.groupIconDataUrl,
            });
        playNotificationChime();
        dispatchRedshiftNotification({
          title: payload.groupName || groupObj?.name || 'Group Chat',
          body: `${payload.actor.displayName} added you to the group chat`,
          icon,
          badge: 'Group Chat',
          tag: `redshift-group-add-${payload.groupId ?? payload.timestamp}`,
          userStatus,
          onClick: () => {
            if (state.screen === 'app' && payload.groupId) {
              openGroupChatById(payload.groupId);
            }
          },
        });
        return;
      }

      if (
        payload.kind === 'group-removed' ||
        payload.kind === 'unfriended' ||
        payload.kind === 'blocked'
      ) {
        if (!getUserPreferences().notifyOnSocialRemovals) {
          return;
        }
        playNotificationChime();
        const actorAvatar = resolveProfileAvatar(payload.actor);
        if (payload.kind === 'group-removed') {
          const icon = resolveGroupAvatar({
            name: payload.groupName ?? 'Group Chat',
            iconDataUrl: payload.groupIconDataUrl,
          });
          dispatchRedshiftNotification({
            title: payload.groupName || 'Group Chat',
            body: `${payload.actor.displayName} removed you from the group`,
            icon,
            badge: 'Removed',
            danger: true,
            forceInAppToast: true,
            tag: `redshift-group-removed-${payload.groupId ?? payload.timestamp}`,
            userStatus,
          });
        } else if (payload.kind === 'unfriended') {
          dispatchRedshiftNotification({
            title: payload.actor.displayName,
            body: `${payload.actor.displayName} (@${payload.actor.username}) unfriended you`,
            icon: actorAvatar,
            badge: 'Unfriended',
            danger: true,
            forceInAppToast: true,
            tag: `redshift-unfriended-${payload.actor.username.toLowerCase()}`,
            userStatus,
          });
        } else {
          dispatchRedshiftNotification({
            title: payload.actor.displayName,
            body: `${payload.actor.displayName} (@${payload.actor.username}) blocked you`,
            icon: actorAvatar,
            badge: 'Blocked',
            danger: true,
            forceInAppToast: true,
            tag: `redshift-blocked-${payload.actor.username.toLowerCase()}`,
            userStatus,
          });
        }
      }
    },
  });

  syncDock();
  syncCustomStatusExpiryTimer();
  ensureNotificationPermissionOnGesture();
  renderMainArea();
  maybeShowPostUpdateChangelog();
  window.setTimeout(() => prewarmRecentThreads(state.snapshot), 350);

  activeWorkspaceCleanup = () => {
    workspaceDestroyed = true;
    window.clearInterval(liveSnapshotPollTimer);
    closeChangelogModal();
    unsubscribeDesktopUpdate?.();
    unsubscribeDesktopUpdate = null;
    unsubscribePrefs();
    activeSelfProfileModal?.close();
    closeActiveSettings?.();
    closeActiveQuickSwitcher?.();
    closeActiveGlobalSearch?.();
    closeActivePinnedPopover();
    closeActiveSearchPopover();
    window.removeEventListener('keydown', handleGlobalKeydown, true);
    if (statusExpiryTimerId !== null) {
      window.clearTimeout(statusExpiryTimerId);
      statusExpiryTimerId = null;
    }
    if (muteExpiryTimerId !== null) {
      window.clearTimeout(muteExpiryTimerId);
      muteExpiryTimerId = null;
    }
    if (queueRetryTimerId !== null) {
      window.clearTimeout(queueRetryTimerId);
      queueRetryTimerId = null;
    }
    for (const item of outboundQueue) {
      if (item.bufferingTimerId !== null) {
        window.clearTimeout(item.bufferingTimerId);
        item.bufferingTimerId = null;
      }
      revokeStagedAttachmentUrls(item.files);
    }
    outboundQueue.length = 0;
    window.removeEventListener('online', handleNetworkOnline);
    window.removeEventListener('offline', handleNetworkOffline);
    closeActiveGifPicker();
    closeActiveEmojiPicker();
    window.removeEventListener('focus', handleWindowActive);
    document.removeEventListener('visibilitychange', handleWindowActive);
    if (activeDmCleanup) {
      activeDmCleanup();
      activeDmCleanup = null;
    }
    for (const threadMap of typingByThread.values()) {
      for (const entry of threadMap.values()) {
        window.clearTimeout(entry.timerId);
      }
    }
    typingByThread.clear();
    voiceManager.destroy();
    socketHandle?.disconnect();
    drawerController.destroy();
    detachPushNavigation?.();
    chatArea.removeEventListener('touchstart', handleMobileEdgeTouchStart);
    chatArea.removeEventListener('touchend', handleMobileEdgeTouchEnd);
    delete root.dataset.mobileView;
    delete root.dataset.mobileTab;
  };

  const mobileYouView = createMobileYouView({
    resolveAvatar: resolveProfileAvatar,
    onOptimisticStatus: (nextSt) => {
      applyOptimisticSelfPatch({ status: nextSt });
    },
    onSnapshotUpdated: (nextSnap) => {
      applyLiveSnapshot(nextSnap);
    },
    onOpenEditProfile: () => triggerSelfProfileModal?.(true),
    onOpenCustomStatus: () => {
      const snap = state.snapshot;
      if (!snap) return;
      openSetCustomStatusModal({
        user: snap.user,
        resolveAvatar: resolveProfileAvatar,
        onOptimisticCustomStatus: (nextCs) => {
          applyOptimisticSelfPatch({ customStatus: nextCs });
        },
        onSnapshotUpdated: (nextSnap) => applyLiveSnapshot(nextSnap),
      });
    },
    onOpenSettings: () => triggerVoiceSettingsModal?.(),
    onSignOut: requestSignOutAction,
  });

  const mobileBottomNav = createMobileBottomNav((tab) => {
    mobileInChat = false;
    mobileHubTab = tab;
    if (tab === 'friends') {
      state.mainView = 'friends';
      renderMainArea();
    } else if (tab === 'you') {
      mobileYouView.refreshPushStatus();
    }
    syncMobileChrome();
  });

  syncMobileChromeRef = () => {
    const snap = state.snapshot;
    if (!snap) return;
    let unreadChats = 0;
    for (const c of Object.values(snap.unreadCounts ?? {})) {
      if (c > 0) unreadChats += c;
    }
    for (const c of Object.values(snap.groupUnreadCounts ?? {})) {
      if (c > 0) unreadChats += c;
    }
    mobileBottomNav.sync({
      activeTab: mobileHubTab,
      unreadChatsCount: unreadChats,
      pendingFriendsCount: snap.incomingRequests.length,
      user: snap.user,
      resolveAvatar: resolveProfileAvatar,
    });
    mobileYouView.sync(snap.user);
  };

  // Left-edge swipe-right gesture on mobile returns smoothly from a chat to the Chats list.
  let edgeSwipeStartX = -1;
  let edgeSwipeStartY = 0;
  const handleMobileEdgeTouchStart = (ev: TouchEvent) => {
    if (window.innerWidth > 768 || !mobileInChat || ev.touches.length !== 1) {
      edgeSwipeStartX = -1;
      return;
    }
    const t = ev.touches[0];
    if (t.clientX <= 28) {
      edgeSwipeStartX = t.clientX;
      edgeSwipeStartY = t.clientY;
    } else {
      edgeSwipeStartX = -1;
    }
  };
  const handleMobileEdgeTouchEnd = (ev: TouchEvent) => {
    if (edgeSwipeStartX < 0 || ev.changedTouches.length !== 1) return;
    const t = ev.changedTouches[0];
    const dx = t.clientX - edgeSwipeStartX;
    const dy = Math.abs(t.clientY - edgeSwipeStartY);
    edgeSwipeStartX = -1;
    if (dx >= 68 && dy < 52) {
      mobileInChat = false;
      mobileHubTab = 'chats';
      syncMobileChrome();
    }
  };
  chatArea.addEventListener('touchstart', handleMobileEdgeTouchStart, { passive: true });
  chatArea.addEventListener('touchend', handleMobileEdgeTouchEnd, { passive: true });

  const detachPushNavigation = attachPushNotificationNavigation((kind, id) => {
    if (kind === 'group') {
      openGroupChatById(id);
    } else if (kind === 'dm') {
      openDirectMessageWithUser(id);
    } else if (kind === 'friends') {
      state.mainView = 'friends';
      state.friendsTab = id === 'pending' ? 'pending' : 'online';
      mobileInChat = false;
      mobileHubTab = 'friends';
      renderMainArea();
      syncMobileChrome();
    }
  });
  void syncExistingPushSubscriptionIfPermitted();

  root.appendChild(leftColumn);
  root.appendChild(chatArea);
  root.appendChild(mobileYouView.element);
  root.appendChild(mobileBottomNav.element);
  syncMobileChrome();
}

function render(): void {
  const root = document.getElementById('app');
  if (!root) {
    throw new Error('Root element #app not found.');
  }

  if (activeWorkspaceCleanup) {
    activeWorkspaceCleanup();
    activeWorkspaceCleanup = null;
  }

  activeResendButton = null;
  root.replaceChildren();
  root.dataset.screen = state.screen;

  if (state.screen === 'app') {
    renderWorkspaceScreen(root);
    return;
  }

  document.title = 'Redshift';
  getDesktopBridge()?.setUnreadCount(0);
  const shell = document.createElement('main');
  shell.className = 'auth-shell';

  switch (state.screen) {
    case 'login':
      renderLoginScreen(shell);
      break;
    case 'signup-account':
      renderSignUpAccountScreen(root, shell);
      break;
    case 'signup-password':
      renderSignUpPasswordScreen(root, shell);
      break;
    case 'signup-avatar':
      renderSignUpAvatarScreen(root, shell);
      break;
    case 'forgot-email':
      renderForgotEmailScreen(root, shell);
      break;
    case 'forgot-code':
      renderForgotCodeScreen(root, shell);
      break;
    case 'forgot-reset':
      renderForgotResetScreen(root, shell);
      break;
  }

  root.appendChild(shell);
}

function attachMobileViewportSync(): void {
  const syncViewportHeight = () => {
    if (window.innerWidth > 768) {
      document.documentElement.style.removeProperty('--app-viewport-height');
      return;
    }
    const vv = window.visualViewport;
    const nextHeight = vv ? Math.round(vv.height) : window.innerHeight;
    if (nextHeight > 160) {
      document.documentElement.style.setProperty('--app-viewport-height', `${nextHeight}px`);
    }
    if (vv && vv.offsetTop > 0) {
      window.scrollTo(0, 0);
    }
  };
  syncViewportHeight();
  window.addEventListener('resize', syncViewportHeight);
  window.visualViewport?.addEventListener('resize', syncViewportHeight);
  window.visualViewport?.addEventListener('scroll', syncViewportHeight);
}

async function bootstrapApp(): Promise<void> {
  attachGlobalEditableContextMenu();
  attachMobileViewportSync();
  void registerRedshiftServiceWorker();
  const desktopBridge = getDesktopBridge();
  let githubRepo = 'redrepost84-ctrl/redshift';
  if (desktopBridge) {
    try {
      const cfg = await desktopBridge.getDesktopConfig();
      if (cfg && typeof cfg.githubRepo === 'string' && cfg.githubRepo.trim()) {
        githubRepo = cfg.githubRepo.trim();
      }
      if (cfg && typeof cfg.serverUrl === 'string' && cfg.serverUrl.trim()) {
        setApiServerBaseUrl(cfg.serverUrl);
      }
    } catch {
      // Fall back to default server discovery.
    }
  }
  const currentPort = Number(window.location.port) || 0;
  const isAutomatedTestPort = currentPort >= 18000 && currentPort < 19000;
  if (desktopBridge || !isAutomatedTestPort) {
    const discovered = await autoDiscoverWorldwideServer(githubRepo);
    if (discovered && desktopBridge) {
      void desktopBridge.saveDesktopConfig({ serverUrl: discovered });
    }
  }
  if (hasStoredSessionToken()) {
    const res = await apiResumeSession();
    if (res.ok && res.snapshot) {
      state.snapshot = res.snapshot;
      state.screen = 'app';
    }
  }
  render();
}

const teardownWorkspace = () => {
  activeWorkspaceCleanup?.();
  activeWorkspaceCleanup = null;
};

window.addEventListener('beforeunload', teardownWorkspace);
(import.meta as unknown as { hot?: { dispose: (cb: () => void) => void } }).hot?.dispose(
  () => {
    window.removeEventListener('beforeunload', teardownWorkspace);
    teardownWorkspace();
  },
);

void bootstrapApp();
