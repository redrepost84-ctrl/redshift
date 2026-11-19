import {
  apiChangeEmail,
  apiChangePassword,
  apiCheckServerHealth,
  apiSignOutOtherSessions,
  apiUnblockUser,
  apiUpdatePrivacy,
  setApiServerBaseUrl,
} from './apiClient';
import { createCloseIconSvg, playNotificationChime } from './chatUi';
import { getDesktopBridge, type DesktopUpdateInfo } from './desktopBridge';
import { isModalConfirmShortcut, isTopmostModal } from './modalShortcuts';
import {
  ensureNotificationPermissionOnGesture,
  sendDesktopNotification,
  showInAppToast,
} from './notifications';
import {
  DEFAULT_VOICE_CUSTOM_SETTINGS,
  getUserPreferences,
  resetUserPreferences,
  updateUserPreferences,
} from './settingsStore';
import type {
  MessageDensity,
  SelfProfile,
  SocialSnapshot,
  ThemeMode,
  VoiceCustomAudioSettings,
  VoiceInputMode,
  VoiceModifierMode,
} from './types';
import {
  listAudioDevices,
  startMicSelfTest,
  type MicSelfTestSession,
} from './voiceAudio';
import { formatKeyCodeLabel } from './voiceManager';

type SettingsSection =
  | 'security'
  | 'privacy'
  | 'appearance'
  | 'voice'
  | 'notifications'
  | 'chat'
  | 'blocked'
  | 'desktop';

export interface UserSettingsOverlayOptions {
  initialSection?: SettingsSection;
  getSnapshot: () => SocialSnapshot;
  resolveAvatar: (profile: { avatarPreset: number | null; avatarDataUrl?: string }) => string;
  onSnapshotUpdated: (snapshot: SocialSnapshot) => void;
  onOpenEditProfile: () => void;
  onSignOut: () => void;
  onPreferencesChanged?: () => void;
  onMicTestChange?: (testing: boolean) => void;
}

function createToggleSwitch(options: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'settings-toggle-row';

  const copy = document.createElement('div');
  copy.className = 'settings-toggle-copy';
  const titleEl = document.createElement('div');
  titleEl.className = 'settings-toggle-label';
  titleEl.textContent = options.label;
  const descEl = document.createElement('div');
  descEl.className = 'settings-toggle-desc';
  descEl.textContent = options.description;
  copy.appendChild(titleEl);
  copy.appendChild(descEl);

  const label = document.createElement('label');
  label.className = 'settings-switch';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = options.checked;
  input.disabled = Boolean(options.disabled);
  input.addEventListener('change', () => {
    options.onChange(input.checked);
  });

  const slider = document.createElement('span');
  slider.className = 'settings-switch-slider';

  label.appendChild(input);
  label.appendChild(slider);

  row.appendChild(copy);
  row.appendChild(label);
  return row;
}

export function openUserSettingsOverlay(options: UserSettingsOverlayOptions): () => void {
  let closed = false;
  let activeSection: SettingsSection = options.initialSection ?? 'security';
  let revealEmail = false;

  const backdrop = document.createElement('div');
  backdrop.className = 'settings-overlay';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'User Settings');

  const container = document.createElement('div');
  container.className = 'settings-shell';

  // Left navigation sidebar
  const navRail = document.createElement('nav');
  navRail.className = 'settings-nav';
  navRail.setAttribute('aria-label', 'Settings categories');

  const navInner = document.createElement('div');
  navInner.className = 'settings-nav-inner';
  navRail.appendChild(navInner);

  // Right content area
  const contentArea = document.createElement('div');
  contentArea.className = 'settings-content-scroll';

  const contentInner = document.createElement('div');
  contentInner.className = 'settings-content-inner';
  contentArea.appendChild(contentInner);

  // Top-right ESC button column
  const closeCol = document.createElement('div');
  closeCol.className = 'settings-close-col';

  const escBtn = document.createElement('button');
  escBtn.type = 'button';
  escBtn.className = 'settings-esc-btn';
  escBtn.title = 'Close Settings (Esc)';
  escBtn.setAttribute('aria-label', 'Close settings');
  escBtn.appendChild(createCloseIconSvg(18));

  const escLabel = document.createElement('span');
  escLabel.className = 'settings-esc-hint';
  escLabel.textContent = 'ESC';

  closeCol.appendChild(escBtn);
  closeCol.appendChild(escLabel);

  container.appendChild(navRail);
  container.appendChild(contentArea);
  container.appendChild(closeCol);
  backdrop.appendChild(container);
  document.body.appendChild(backdrop);

  const maskEmail = (email: string): string => {
    const at = email.indexOf('@');
    if (at <= 1) {
      return email;
    }
    const domain = email.slice(at);
    return `${email[0]}${'*'.repeat(Math.min(6, Math.max(2, at - 1)))}${domain}`;
  };

  const renderNav = () => {
    navInner.replaceChildren();
    const groups: Array<{
      heading: string;
      items: Array<{ id: SettingsSection; label: string }>;
    }> = [
      {
        heading: 'User Settings',
        items: [
          { id: 'security', label: 'My Account & Security' },
          { id: 'privacy', label: 'Privacy & Safety' },
        ],
      },
      {
        heading: 'App Settings',
        items: [
          { id: 'appearance', label: 'Appearance' },
          { id: 'voice', label: 'Voice & Audio' },
          { id: 'notifications', label: 'Notifications' },
          { id: 'chat', label: 'Chat & Media' },
          { id: 'blocked', label: 'Blocked Users' },
          ...(getDesktopBridge() ? [{ id: 'desktop' as const, label: 'Desktop & Updates' }] : []),
        ],
      },
    ];

    for (const grp of groups) {
      const h = document.createElement('div');
      h.className = 'settings-nav-heading';
      h.textContent = grp.heading;
      navInner.appendChild(h);

      for (const item of grp.items) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'settings-nav-item';
        if (item.id === activeSection) {
          btn.classList.add('settings-nav-item--active');
        }
        btn.textContent = item.label;
        btn.addEventListener('click', () => {
          activeSection = item.id;
          renderNav();
          renderContent();
        });
        navInner.appendChild(btn);
      }

      const div = document.createElement('div');
      div.className = 'settings-nav-divider';
      navInner.appendChild(div);
    }

    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'settings-nav-item settings-nav-item--danger';
    logoutBtn.textContent = 'Log Out';
    logoutBtn.addEventListener('click', () => {
      options.onSignOut();
    });
    navInner.appendChild(logoutBtn);
  };

  const renderSecuritySection = (user: SelfProfile) => {
    const title = document.createElement('h1');
    title.className = 'settings-page-title';
    title.textContent = 'My Account & Security';
    contentInner.appendChild(title);

    // Account summary card
    const summaryCard = document.createElement('div');
    summaryCard.className = 'settings-account-card';

    const topRow = document.createElement('div');
    topRow.className = 'settings-account-top';

    const av = document.createElement('img');
    av.className = 'settings-account-avatar';
    av.src = options.resolveAvatar(user);
    av.alt = user.displayName;

    const idMeta = document.createElement('div');
    idMeta.className = 'settings-account-meta';
    const dName = document.createElement('div');
    dName.className = 'settings-account-display';
    dName.textContent = user.displayName;
    const uName = document.createElement('div');
    uName.className = 'settings-account-username';
    uName.textContent = `@${user.username}`;
    idMeta.appendChild(dName);
    idMeta.appendChild(uName);
    if (user.privacy?.privateProfile) {
      const privPill = document.createElement('span');
      privPill.className = 'settings-private-pill';
      privPill.textContent = 'Private Profile Active';
      idMeta.appendChild(privPill);
    }

    const editProfileBtn = document.createElement('button');
    editProfileBtn.type = 'button';
    editProfileBtn.className = 'btn-primary settings-sm-btn';
    editProfileBtn.textContent = 'Edit User Profile';
    editProfileBtn.addEventListener('click', () => {
      close();
      options.onOpenEditProfile();
    });

    topRow.appendChild(av);
    topRow.appendChild(idMeta);
    topRow.appendChild(editProfileBtn);
    summaryCard.appendChild(topRow);

    const infoBox = document.createElement('div');
    infoBox.className = 'settings-account-fields';

    const emailRow = document.createElement('div');
    emailRow.className = 'settings-account-field-row';
    const emailMeta = document.createElement('div');
    const emailLbl = document.createElement('div');
    emailLbl.className = 'settings-field-micro';
    emailLbl.textContent = 'EMAIL';
    const emailVal = document.createElement('div');
    emailVal.className = 'settings-field-value';
    emailVal.textContent = revealEmail ? user.email : maskEmail(user.email);
    emailMeta.appendChild(emailLbl);
    emailMeta.appendChild(emailVal);

    const revealBtn = document.createElement('button');
    revealBtn.type = 'button';
    revealBtn.className = 'btn-secondary settings-sm-btn';
    revealBtn.textContent = revealEmail ? 'Hide' : 'Reveal';
    revealBtn.addEventListener('click', () => {
      revealEmail = !revealEmail;
      emailVal.textContent = revealEmail ? user.email : maskEmail(user.email);
      revealBtn.textContent = revealEmail ? 'Hide' : 'Reveal';
    });

    emailRow.appendChild(emailMeta);
    emailRow.appendChild(revealBtn);
    infoBox.appendChild(emailRow);
    summaryCard.appendChild(infoBox);
    contentInner.appendChild(summaryCard);

    // Change Password Card
    const passCard = document.createElement('form');
    passCard.className = 'settings-card';
    const passTitle = document.createElement('h2');
    passTitle.className = 'settings-section-heading';
    passTitle.textContent = 'Change Password';
    const passSub = document.createElement('p');
    passSub.className = 'settings-section-sub';
    passSub.textContent = 'Update your account password. Requires at least 8 characters.';
    passCard.appendChild(passTitle);
    passCard.appendChild(passSub);

    const curPass = document.createElement('input');
    curPass.type = 'password';
    curPass.className = 'settings-input';
    curPass.placeholder = 'Current password';
    curPass.autocomplete = 'current-password';

    const newPass = document.createElement('input');
    newPass.type = 'password';
    newPass.className = 'settings-input';
    newPass.placeholder = 'New password';
    newPass.autocomplete = 'new-password';

    const confirmPass = document.createElement('input');
    confirmPass.type = 'password';
    confirmPass.className = 'settings-input';
    confirmPass.placeholder = 'Confirm new password';
    confirmPass.autocomplete = 'new-password';

    const passFeedback = document.createElement('div');
    passFeedback.className = 'settings-feedback';
    passFeedback.hidden = true;

    const passSubmit = document.createElement('button');
    passSubmit.type = 'submit';
    passSubmit.className = 'btn-primary settings-sm-btn';
    passSubmit.textContent = 'Update Password';

    passCard.appendChild(curPass);
    passCard.appendChild(newPass);
    passCard.appendChild(confirmPass);
    passCard.appendChild(passFeedback);
    passCard.appendChild(passSubmit);

    passCard.addEventListener('submit', async (e) => {
      e.preventDefault();
      passSubmit.disabled = true;
      passSubmit.textContent = 'Updating...';
      passFeedback.hidden = true;
      const res = await apiChangePassword({
        currentPassword: curPass.value,
        newPassword: newPass.value,
        confirmPassword: confirmPass.value,
      });
      if (closed) {
        return;
      }
      passSubmit.disabled = false;
      passSubmit.textContent = 'Update Password';
      passFeedback.hidden = false;
      passFeedback.classList.toggle('settings-feedback--success', res.ok);
      passFeedback.textContent = res.ok
        ? res.message ?? 'Password updated!'
        : res.error ?? 'Error: Could not update password';
      if (res.ok) {
        curPass.value = '';
        newPass.value = '';
        confirmPass.value = '';
      }
    });
    contentInner.appendChild(passCard);

    // Change Email Card
    const emailCard = document.createElement('form');
    emailCard.className = 'settings-card';
    const emailTitle = document.createElement('h2');
    emailTitle.className = 'settings-section-heading';
    emailTitle.textContent = 'Update Email Address';
    emailCard.appendChild(emailTitle);

    const nextEmailInput = document.createElement('input');
    nextEmailInput.type = 'email';
    nextEmailInput.className = 'settings-input';
    nextEmailInput.placeholder = 'New email address';

    const emailPassInput = document.createElement('input');
    emailPassInput.type = 'password';
    emailPassInput.className = 'settings-input';
    emailPassInput.placeholder = 'Confirm with current password';
    emailPassInput.autocomplete = 'current-password';

    const emailFeedback = document.createElement('div');
    emailFeedback.className = 'settings-feedback';
    emailFeedback.hidden = true;

    const emailSubmit = document.createElement('button');
    emailSubmit.type = 'submit';
    emailSubmit.className = 'btn-secondary settings-sm-btn';
    emailSubmit.textContent = 'Save New Email';

    emailCard.appendChild(nextEmailInput);
    emailCard.appendChild(emailPassInput);
    emailCard.appendChild(emailFeedback);
    emailCard.appendChild(emailSubmit);

    emailCard.addEventListener('submit', async (e) => {
      e.preventDefault();
      emailSubmit.disabled = true;
      emailFeedback.hidden = true;
      const res = await apiChangeEmail({
        currentPassword: emailPassInput.value,
        email: nextEmailInput.value,
      });
      if (closed) {
        return;
      }
      emailSubmit.disabled = false;
      emailFeedback.hidden = false;
      emailFeedback.classList.toggle('settings-feedback--success', res.ok);
      if (res.ok && res.snapshot) {
        options.onSnapshotUpdated(res.snapshot);
        emailVal.textContent = revealEmail
          ? res.snapshot.user.email
          : maskEmail(res.snapshot.user.email);
        nextEmailInput.value = '';
        emailPassInput.value = '';
        emailFeedback.textContent = 'Email updated successfully.';
      } else {
        emailFeedback.textContent = res.error ?? 'Error: Could not update email';
      }
    });
    contentInner.appendChild(emailCard);

    // Session Management Card
    const sessionCard = document.createElement('div');
    sessionCard.className = 'settings-card';
    const sessTitle = document.createElement('h2');
    sessTitle.className = 'settings-section-heading';
    sessTitle.textContent = 'Active Sessions';
    const sessSub = document.createElement('p');
    sessSub.className = 'settings-section-sub';
    sessSub.textContent =
      'Signed in on another window or device? Revoke all other session tokens while staying signed in here.';
    const sessFeedback = document.createElement('div');
    sessFeedback.className = 'settings-feedback settings-feedback--success';
    sessFeedback.hidden = true;

    const sessBtn = document.createElement('button');
    sessBtn.type = 'button';
    sessBtn.className = 'btn-danger settings-sm-btn';
    sessBtn.textContent = 'Sign Out All Other Sessions';
    sessBtn.addEventListener('click', async () => {
      sessBtn.disabled = true;
      const res = await apiSignOutOtherSessions();
      if (closed) {
        return;
      }
      sessBtn.disabled = false;
      sessFeedback.hidden = false;
      sessFeedback.classList.toggle('settings-feedback--success', res.ok);
      if (res.ok) {
        const n = res.revokedCount ?? 0;
        sessFeedback.textContent =
          n === 0 ? 'No other active sessions found.' : `Signed out ${n} other session${n === 1 ? '' : 's'}.`;
      } else {
        sessFeedback.textContent = res.error ?? 'Error: Could not revoke sessions';
      }
    });

    sessionCard.appendChild(sessTitle);
    sessionCard.appendChild(sessSub);
    sessionCard.appendChild(sessFeedback);
    sessionCard.appendChild(sessBtn);
    contentInner.appendChild(sessionCard);
  };

  const renderPrivacySection = (snap: SocialSnapshot) => {
    const title = document.createElement('h1');
    title.className = 'settings-page-title';
    title.textContent = 'Privacy & Safety';
    contentInner.appendChild(title);

    const dmCard = document.createElement('div');
    dmCard.className = 'settings-card';
    const dmHeading = document.createElement('h2');
    dmHeading.className = 'settings-section-heading';
    dmHeading.textContent = 'Account Privacy & Messaging';
    const dmSub = document.createElement('p');
    dmSub.className = 'settings-section-sub';
    dmSub.textContent = 'Control who can friend you, direct message you, or view your profile details.';
    dmCard.appendChild(dmHeading);
    dmCard.appendChild(dmSub);

    const allowReqs = snap.user.privacy?.allowFriendRequests !== false;
    dmCard.appendChild(
      createToggleSwitch({
        label: 'Allow Incoming Friend Requests',
        description:
          'When disabled, other users cannot send new friend requests to your username.',
        checked: allowReqs,
        onChange: async (next) => {
          const res = await apiUpdatePrivacy({ allowFriendRequests: next });
          if (res.ok && res.snapshot) {
            options.onSnapshotUpdated(res.snapshot);
          } else {
            renderContent();
          }
        },
      }),
    );

    const allowNonFriendDms = snap.user.privacy?.allowNonFriendDms !== false;
    dmCard.appendChild(
      createToggleSwitch({
        label: 'Allow Direct Messages from Non-Friends',
        description:
          'When disabled, users who are not on your friends list cannot send you direct messages.',
        checked: allowNonFriendDms,
        onChange: async (next) => {
          const res = await apiUpdatePrivacy({ allowNonFriendDms: next });
          if (res.ok && res.snapshot) {
            options.onSnapshotUpdated(res.snapshot);
          } else {
            renderContent();
          }
        },
      }),
    );

    const privateProfile = Boolean(snap.user.privacy?.privateProfile);
    dmCard.appendChild(
      createToggleSwitch({
        label: 'Private Profile',
        description:
          'Hide your bio, custom status, banner, online presence, and member date. Others will only see your username, display name, and avatar alongside a Private Profile notice.',
        checked: privateProfile,
        onChange: async (next) => {
          const res = await apiUpdatePrivacy({ privateProfile: next });
          if (res.ok && res.snapshot) {
            options.onSnapshotUpdated(res.snapshot);
          } else {
            renderContent();
          }
        },
      }),
    );

    const showReadReceipts = Boolean(snap.user.privacy?.showReadReceipts);
    dmCard.appendChild(
      createToggleSwitch({
        label: 'Read Receipts (Delivered & Seen)',
        description:
          'Show Delivered / Seen indicators on your latest 1-on-1 DM message and share when you read DMs. Both users must enable this to share Seen status.',
        checked: showReadReceipts,
        onChange: async (next) => {
          const res = await apiUpdatePrivacy({ showReadReceipts: next });
          if (res.ok && res.snapshot) {
            options.onSnapshotUpdated(res.snapshot);
          } else {
            renderContent();
          }
        },
      }),
    );
    contentInner.appendChild(dmCard);

    const reqCard = document.createElement('div');
    reqCard.className = 'settings-card';
    const activityHeading = document.createElement('h2');
    activityHeading.className = 'settings-section-heading';
    activityHeading.textContent = 'Activity & Previews';
    reqCard.appendChild(activityHeading);

    const prefs = getUserPreferences();
    reqCard.appendChild(
      createToggleSwitch({
        label: 'Show Typing Indicators',
        description: 'Let friends and group chat members see when you are typing a message.',
        checked: prefs.sendTypingIndicators,
        onChange: (next) => {
          updateUserPreferences({ sendTypingIndicators: next });
          options.onPreferencesChanged?.();
        },
      }),
    );

    reqCard.appendChild(
      createToggleSwitch({
        label: 'Show Message Content in Desktop Alerts',
        description: 'Hide message text in OS notification popups when privacy is preferred.',
        checked: prefs.notificationShowPreview,
        onChange: (next) => {
          updateUserPreferences({ notificationShowPreview: next });
          options.onPreferencesChanged?.();
        },
      }),
    );

    contentInner.appendChild(reqCard);
  };

  const renderAppearanceSection = () => {
    const prefs = getUserPreferences();
    const title = document.createElement('h1');
    title.className = 'settings-page-title';
    title.textContent = 'Appearance';
    contentInner.appendChild(title);

    // Theme Picker
    const themeCard = document.createElement('div');
    themeCard.className = 'settings-card';
    const themeHeading = document.createElement('h2');
    themeHeading.className = 'settings-section-heading';
    themeHeading.textContent = 'Theme';
    const themeSub = document.createElement('p');
    themeSub.className = 'settings-section-sub';
    themeSub.textContent = 'Pick the surface contrast and brightness for Redshift.';
    themeCard.appendChild(themeHeading);
    themeCard.appendChild(themeSub);

    const themeGrid = document.createElement('div');
    themeGrid.className = 'settings-theme-grid';

    const themes: Array<{ id: ThemeMode; label: string; desc: string }> = [
      { id: 'dark', label: 'Dark Mode', desc: 'Redshift charcoal slate' },
      { id: 'light', label: 'Light Mode', desc: 'Crisp bright surfaces' },
      { id: 'high-contrast', label: 'High Contrast Dark', desc: 'Pitch black + sharp borders' },
    ];

    for (const t of themes) {
      const cardBtn = document.createElement('button');
      cardBtn.type = 'button';
      cardBtn.className = `settings-theme-option settings-theme-option--${t.id}`;
      if (prefs.theme === t.id) {
        cardBtn.classList.add('settings-theme-option--active');
      }

      const swatch = document.createElement('span');
      swatch.className = `settings-theme-swatch settings-theme-swatch--${t.id}`;
      const swatchAccent = document.createElement('span');
      swatchAccent.className = 'settings-theme-swatch-accent';
      swatch.appendChild(swatchAccent);

      const labelEl = document.createElement('span');
      labelEl.className = 'settings-theme-name';
      labelEl.textContent = t.label;

      const subEl = document.createElement('span');
      subEl.className = 'settings-theme-sub';
      subEl.textContent = t.desc;

      cardBtn.appendChild(swatch);
      cardBtn.appendChild(labelEl);
      cardBtn.appendChild(subEl);
      cardBtn.addEventListener('click', () => {
        updateUserPreferences({ theme: t.id });
        options.onPreferencesChanged?.();
        renderContent();
      });
      themeGrid.appendChild(cardBtn);
    }
    themeCard.appendChild(themeGrid);
    contentInner.appendChild(themeCard);

    // Message Display Density & Typography
    const displayCard = document.createElement('div');
    displayCard.className = 'settings-card';
    const dispHeading = document.createElement('h2');
    dispHeading.className = 'settings-section-heading';
    dispHeading.textContent = 'Message Display';
    displayCard.appendChild(dispHeading);

    const densityRow = document.createElement('div');
    densityRow.className = 'settings-pill-group';
    const densities: Array<{ id: MessageDensity; label: string }> = [
      { id: 'cozy', label: 'Cozy (Avatars & breathing room)' },
      { id: 'compact', label: 'Compact (More messages on screen)' },
    ];
    for (const d of densities) {
      const pBtn = document.createElement('button');
      pBtn.type = 'button';
      pBtn.className = 'settings-choice-pill';
      if (prefs.messageDensity === d.id) {
        pBtn.classList.add('settings-choice-pill--active');
      }
      pBtn.textContent = d.label;
      pBtn.addEventListener('click', () => {
        updateUserPreferences({ messageDensity: d.id });
        options.onPreferencesChanged?.();
        renderContent();
      });
      densityRow.appendChild(pBtn);
    }
    displayCard.appendChild(densityRow);

    // Live Message Preview Box
    const previewBox = document.createElement('div');
    previewBox.className = 'settings-chat-preview';
    const sampleTime = prefs.use24HourTime ? '18:42' : '6:42 PM';
    if (prefs.messageDensity === 'compact') {
      previewBox.textContent = `[${sampleTime}] Demo: Redshift looks awesome in ${prefs.theme}!`;
    } else {
      previewBox.innerHTML = '';
      const pTop = document.createElement('div');
      pTop.className = 'settings-preview-cozy-head';
      const pName = document.createElement('strong');
      pName.textContent = 'Demo';
      const pTime = document.createElement('span');
      pTime.className = 'settings-preview-time';
      pTime.textContent = `Today at ${sampleTime}`;
      pTop.appendChild(pName);
      pTop.appendChild(pTime);
      const pMsg = document.createElement('div');
      pMsg.className = 'settings-preview-cozy-body';
      pMsg.textContent = 'Redshift themes, density, and font sizes update instantly!';
      previewBox.appendChild(pTop);
      previewBox.appendChild(pMsg);
    }
    displayCard.appendChild(previewBox);

    // Font Size Pills
    const fontLbl = document.createElement('div');
    fontLbl.className = 'settings-field-micro';
    fontLbl.textContent = 'CHAT FONT SIZE';
    displayCard.appendChild(fontLbl);

    const fontRow = document.createElement('div');
    fontRow.className = 'settings-pill-group';
    for (const size of [14, 15, 16, 18] as const) {
      const sBtn = document.createElement('button');
      sBtn.type = 'button';
      sBtn.className = 'settings-choice-pill';
      if (prefs.fontSize === size) {
        sBtn.classList.add('settings-choice-pill--active');
      }
      sBtn.textContent = `${size}px${size === 15 ? ' (Default)' : ''}`;
      sBtn.addEventListener('click', () => {
        updateUserPreferences({ fontSize: size });
        options.onPreferencesChanged?.();
        renderContent();
      });
      fontRow.appendChild(sBtn);
    }
    displayCard.appendChild(fontRow);

    displayCard.appendChild(
      createToggleSwitch({
        label: '24-Hour Timestamps',
        description: 'Display timestamps in 24-hour clock format (18:30 instead of 6:30 PM).',
        checked: prefs.use24HourTime,
        onChange: (next) => {
          updateUserPreferences({ use24HourTime: next });
          options.onPreferencesChanged?.();
          renderContent();
        },
      }),
    );

    displayCard.appendChild(
      createToggleSwitch({
        label: 'Reduced Motion & FPS Boost',
        description: 'Disables hover animations, blur transitions, and glow motion for crisp FPS.',
        checked: prefs.reducedMotion,
        onChange: (next) => {
          updateUserPreferences({ reducedMotion: next });
          options.onPreferencesChanged?.();
        },
      }),
    );

    contentInner.appendChild(displayCard);
  };

  let micTestSession: MicSelfTestSession | null = null;
  let sectionCleanup: (() => void) | null = null;

  const stopVoiceSectionActiveState = () => {
    if (micTestSession) {
      micTestSession.stop();
      micTestSession = null;
      options.onMicTestChange?.(false);
    }
    if (sectionCleanup) {
      sectionCleanup();
      sectionCleanup = null;
    }
  };

  const renderVoiceSection = () => {
    const prefs = getUserPreferences();
    const title = document.createElement('h1');
    title.className = 'settings-page-title';
    title.textContent = 'Voice & Audio';
    contentInner.appendChild(title);

    // Input & Output Device Selection
    const deviceCard = document.createElement('div');
    deviceCard.className = 'settings-card';
    const deviceHeadRow = document.createElement('div');
    deviceHeadRow.className = 'settings-voice-head-row';
    const deviceHeading = document.createElement('h2');
    deviceHeading.className = 'settings-section-heading';
    deviceHeading.textContent = 'Voice Devices';
    const refreshDevicesBtn = document.createElement('button');
    refreshDevicesBtn.type = 'button';
    refreshDevicesBtn.className = 'btn-secondary settings-sm-btn';
    refreshDevicesBtn.textContent = 'Refresh Devices';
    deviceHeadRow.appendChild(deviceHeading);
    deviceHeadRow.appendChild(refreshDevicesBtn);
    deviceCard.appendChild(deviceHeadRow);

    const devGrid = document.createElement('div');
    devGrid.className = 'settings-voice-grid';

    const inWrap = document.createElement('label');
    inWrap.className = 'settings-voice-field';
    const inLbl = document.createElement('span');
    inLbl.className = 'settings-field-micro';
    inLbl.textContent = 'INPUT DEVICE (MICROPHONE)';
    const inSelect = document.createElement('select');
    inSelect.className = 'settings-select';
    inWrap.appendChild(inLbl);
    inWrap.appendChild(inSelect);

    const outWrap = document.createElement('label');
    outWrap.className = 'settings-voice-field';
    const outLbl = document.createElement('span');
    outLbl.className = 'settings-field-micro';
    outLbl.textContent = 'OUTPUT DEVICE (SPEAKERS / HEADPHONES)';
    const outSelect = document.createElement('select');
    outSelect.className = 'settings-select';
    outWrap.appendChild(outLbl);
    outWrap.appendChild(outSelect);

    devGrid.appendChild(inWrap);
    devGrid.appendChild(outWrap);
    deviceCard.appendChild(devGrid);

    const deviceNote = document.createElement('p');
    deviceNote.className = 'settings-section-sub';
    deviceNote.textContent =
      'Uses your system Default device until you choose a specific microphone or output.';
    deviceCard.appendChild(deviceNote);

    const populateDevices = async () => {
      const latestPrefs = getUserPreferences();
      const { inputs, outputs } = await listAudioDevices();
      if (closed || activeSection !== 'voice') {
        return;
      }

      inSelect.replaceChildren();
      for (const dev of inputs) {
        const opt = document.createElement('option');
        opt.value = dev.deviceId;
        opt.textContent = dev.label;
        inSelect.appendChild(opt);
      }
      inSelect.value = inputs.some((d) => d.deviceId === latestPrefs.voiceInputDeviceId)
        ? latestPrefs.voiceInputDeviceId
        : 'default';

      outSelect.replaceChildren();
      for (const dev of outputs) {
        const opt = document.createElement('option');
        opt.value = dev.deviceId;
        opt.textContent = dev.label;
        outSelect.appendChild(opt);
      }
      outSelect.value = outputs.some((d) => d.deviceId === latestPrefs.voiceOutputDeviceId)
        ? latestPrefs.voiceOutputDeviceId
        : 'default';
    };

    inSelect.addEventListener('change', () => {
      updateUserPreferences({ voiceInputDeviceId: inSelect.value || 'default' });
      options.onPreferencesChanged?.();
      if (micTestSession) {
        void restartMicTest();
      }
    });

    outSelect.addEventListener('change', () => {
      const nextOut = outSelect.value || 'default';
      updateUserPreferences({ voiceOutputDeviceId: nextOut });
      options.onPreferencesChanged?.();
      micTestSession?.setOutputDevice(nextOut);
    });

    refreshDevicesBtn.addEventListener('click', () => {
      void populateDevices();
    });

    void populateDevices();
    const onDeviceChange = () => {
      void populateDevices();
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    contentInner.appendChild(deviceCard);

    // Microphone Test & Live Audio Visualizer
    const micCard = document.createElement('div');
    micCard.className = 'settings-card';
    const micTitle = document.createElement('h2');
    micTitle.className = 'settings-section-heading';
    micTitle.textContent = 'Microphone Test';
    const micSub = document.createElement('p');
    micSub.className = 'settings-section-sub';
    micSub.textContent =
      'Hear your own microphone playback and check levels in real time. Other voice call audio is deafened while testing.';
    micCard.appendChild(micTitle);
    micCard.appendChild(micSub);

    const micTestBar = document.createElement('div');
    micTestBar.className = 'settings-mic-test-row';

    const testBtn = document.createElement('button');
    testBtn.type = 'button';
    testBtn.className = 'btn-primary settings-sm-btn';
    testBtn.textContent = 'Test Microphone';

    const canvas = document.createElement('canvas');
    canvas.className = 'settings-mic-visualizer';
    canvas.width = 460;
    canvas.height = 46;
    canvas.setAttribute('aria-label', 'Live microphone input visualizer');

    micTestBar.appendChild(testBtn);
    micTestBar.appendChild(canvas);
    micCard.appendChild(micTestBar);

    const micStatus = document.createElement('div');
    micStatus.className = 'settings-mic-status';
    micStatus.textContent = 'Idle — click Test Microphone to start self-monitoring.';
    micCard.appendChild(micStatus);

    const drawVisualizer = (level: number, bands: number[]) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const barCount = 24;
      const gap = 5;
      const barW = Math.max(4, Math.floor((w - gap * (barCount - 1)) / barCount));
      const radius = 3;

      for (let i = 0; i < barCount; i += 1) {
        const amp = Math.max(bands[i] ?? 0, level * (0.45 + 0.55 * (1 - i / barCount)));
        const barH = Math.max(6, Math.round(amp * (h - 8)));
        const x = i * (barW + gap);
        const y = Math.round((h - barH) / 2);

        if (amp > 0.72) {
          ctx.fillStyle = '#e23b41';
        } else if (amp > 0.12) {
          ctx.fillStyle = '#23a55a';
        } else {
          ctx.fillStyle = '#383c4a';
        }

        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(x, y, barW, barH, radius);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, barW, barH);
        }
      }
    };
    drawVisualizer(0, new Array(24).fill(0));

    const stopMicTest = () => {
      if (micTestSession) {
        micTestSession.stop();
        micTestSession = null;
      }
      options.onMicTestChange?.(false);
      testBtn.textContent = 'Test Microphone';
      testBtn.className = 'btn-primary settings-sm-btn';
      micStatus.textContent = 'Stopped — normal call audio restored.';
      micStatus.classList.remove('settings-mic-status--active');
      drawVisualizer(0, new Array(24).fill(0));
    };

    let lastMicStatusText = '';
    const setMicStatusText = (next: string) => {
      if (lastMicStatusText !== next) {
        lastMicStatusText = next;
        micStatus.textContent = next;
      }
    };

    const restartMicTest = async () => {
      if (micTestSession) {
        micTestSession.stop();
        micTestSession = null;
      }
      const cur = getUserPreferences();
      testBtn.disabled = true;
      options.onMicTestChange?.(true);
      setMicStatusText('Starting microphone monitor (deafened)...');
      try {
        const session = await startMicSelfTest({
          inputDeviceId: cur.voiceInputDeviceId,
          outputDeviceId: cur.voiceOutputDeviceId,
          prefs: cur,
          onLevel: (level, bands, gateOpen) => {
            drawVisualizer(level, bands);
            if (!micTestSession || closed || activeSection !== 'voice') {
              return;
            }
            const activePrefs = getUserPreferences();
            const gateActive =
              activePrefs.voiceModifierMode === 'background-drowner' ||
              (activePrefs.voiceModifierMode === 'custom' &&
                activePrefs.voiceCustom.noiseGateThresholdDb > -75);
            if (gateActive && !gateOpen) {
              setMicStatusText(
                'Mic test active — drowning quiet background noise below gate threshold.',
              );
            } else if (activePrefs.voiceModifierMode === 'background-drowner') {
              setMicStatusText(
                'Mic test active (Background Drowner) — hearing isolated voice, call audio deafened.',
              );
            } else {
              setMicStatusText(
                'Mic test active — hearing your own voice, and other call audio is deafened.',
              );
            }
          },
        });
        if (closed || activeSection !== 'voice') {
          session.stop();
          options.onMicTestChange?.(false);
          return;
        }
        micTestSession = session;
        testBtn.disabled = false;
        testBtn.textContent = 'Stop Testing';
        testBtn.className = 'btn-danger settings-sm-btn';
        setMicStatusText(
          'Mic test active — hearing your own voice, and other call audio is deafened.',
        );
        micStatus.classList.add('settings-mic-status--active');
        void populateDevices();
      } catch (err) {
        options.onMicTestChange?.(false);
        testBtn.disabled = false;
        testBtn.textContent = 'Test Microphone';
        testBtn.className = 'btn-primary settings-sm-btn';
        micStatus.classList.remove('settings-mic-status--active');
        setMicStatusText(
          err instanceof Error && err.message.startsWith('Error:')
            ? err.message
            : 'Error: Could not access microphone. Check browser permissions.',
        );
      }
    };

    testBtn.addEventListener('click', () => {
      if (micTestSession) {
        stopMicTest();
      } else {
        void restartMicTest();
      }
    });
    contentInner.appendChild(micCard);

    // Voice Modifiers & Microphone Amplification (None / Background Drowner / Custom)
    const modCard = document.createElement('div');
    modCard.className = 'settings-card';
    const modHeading = document.createElement('h2');
    modHeading.className = 'settings-section-heading';
    modHeading.textContent = 'Voice Modifiers';
    const modSub = document.createElement('p');
    modSub.className = 'settings-section-sub';
    modSub.textContent = 'Choose your microphone amplification';
    modCard.appendChild(modHeading);
    modCard.appendChild(modSub);

    const createAudioSliderRow = (cfg: {
      label: string;
      hint?: string;
      min: number;
      max: number;
      step: number;
      value: number;
      formatValue: (v: number) => string;
      onInput: (nextVal: number) => void;
    }): { row: HTMLDivElement; syncValue: (nextVal: number) => void } => {
      const row = document.createElement('div');
      row.className = 'settings-voice-slider-row';

      const head = document.createElement('div');
      head.className = 'settings-voice-slider-head';
      const lbl = document.createElement('span');
      lbl.className = 'settings-toggle-label';
      lbl.textContent = cfg.label;
      const valBadge = document.createElement('span');
      valBadge.className = 'settings-voice-val-pill';
      valBadge.textContent = cfg.formatValue(cfg.value);
      head.appendChild(lbl);
      head.appendChild(valBadge);
      row.appendChild(head);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'settings-range';
      slider.min = String(cfg.min);
      slider.max = String(cfg.max);
      slider.step = String(cfg.step);
      slider.value = String(cfg.value);
      slider.addEventListener('input', () => {
        const nextVal = Number(slider.value);
        valBadge.textContent = cfg.formatValue(nextVal);
        cfg.onInput(nextVal);
      });
      row.appendChild(slider);

      if (cfg.hint) {
        const hintEl = document.createElement('div');
        hintEl.className = 'settings-toggle-desc';
        hintEl.textContent = cfg.hint;
        row.appendChild(hintEl);
      }

      return {
        row,
        syncValue(nextVal: number) {
          slider.value = String(nextVal);
          valBadge.textContent = cfg.formatValue(nextVal);
        },
      };
    };

    const pushVoiceDspUpdate = (nextPrefs: ReturnType<typeof getUserPreferences>) => {
      micTestSession?.updatePrefs(nextPrefs);
      options.onPreferencesChanged?.();
    };

    const ampWrap = document.createElement('div');
    ampWrap.className = 'settings-voice-amp-box';
    const ampControl = createAudioSliderRow({
      label: 'Microphone Amplification',
      hint: 'Boost or attenuate your raw microphone volume across voice modifiers (default 100%).',
      min: 50,
      max: 250,
      step: 5,
      value: prefs.voiceMicAmplification,
      formatValue: (v) => `${v}%`,
      onInput: (v) => {
        const updated = updateUserPreferences({ voiceMicAmplification: v });
        pushVoiceDspUpdate(updated);
      },
    });
    ampWrap.appendChild(ampControl.row);
    modCard.appendChild(ampWrap);

    const modGrid = document.createElement('div');
    modGrid.className = 'settings-modifier-grid';

    const modifierDefs: Array<{
      id: VoiceModifierMode;
      title: string;
      badge: string;
      desc: string;
    }> = [
      {
        id: 'none',
        title: 'None',
        badge: 'Raw Mic',
        desc: 'Natural unprocessed microphone tone without extra EQ or noise drowning.',
      },
      {
        id: 'background-drowner',
        title: 'Background Drowner',
        badge: 'Like Krisp',
        desc: 'Automatically drowns out fans, keyboard taps, hum, and room noise while clarifying your voice.',
      },
      {
        id: 'custom',
        title: 'Custom',
        badge: 'DSP Workbench',
        desc: 'Customize noise gate, rumble/hiss filters, vocal clarity EQ, compression & browser DSP.',
      },
    ];

    const modifierBtns = new Map<VoiceModifierMode, HTMLButtonElement>();
    const customPanel = document.createElement('div');
    customPanel.className = 'settings-voice-custom-panel';

    const buildCustomControls = () => {
      customPanel.replaceChildren();
      const latest = getUserPreferences();
      if (latest.voiceModifierMode !== 'custom') {
        customPanel.hidden = true;
        return;
      }
      customPanel.hidden = false;

      const patchCustom = (partial: Partial<VoiceCustomAudioSettings>) => {
        const cur = getUserPreferences();
        const updated = updateUserPreferences({
          voiceCustom: { ...cur.voiceCustom, ...partial },
        });
        pushVoiceDspUpdate(updated);
      };

      // Quick DSP starter presets inside Custom workbench
      const presetBar = document.createElement('div');
      presetBar.className = 'settings-voice-preset-bar';
      const presetLbl = document.createElement('span');
      presetLbl.className = 'settings-field-micro';
      presetLbl.textContent = 'QUICK AUDIO PRESETS';
      presetBar.appendChild(presetLbl);

      const presetBtnRow = document.createElement('div');
      presetBtnRow.className = 'settings-pill-group';

      const customPresets: Array<{
        label: string;
        amp?: number;
        values: VoiceCustomAudioSettings;
      }> = [
        {
          label: 'Default Custom',
          amp: 100,
          values: { ...DEFAULT_VOICE_CUSTOM_SETTINGS },
        },
        {
          label: 'Crisp Studio',
          amp: 115,
          values: {
            noiseGateThresholdDb: -56,
            highPassHz: 105,
            lowPassHz: 16500,
            voiceClarityDb: 4.5,
            warmthDb: 1.5,
            compressorAmount: 55,
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: false,
          },
        },
        {
          label: 'Max Noise Drowner',
          amp: 120,
          values: {
            noiseGateThresholdDb: -40,
            highPassHz: 155,
            lowPassHz: 9500,
            voiceClarityDb: 5.5,
            warmthDb: -3,
            compressorAmount: 65,
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true,
          },
        },
      ];

      for (const preset of customPresets) {
        const pBtn = document.createElement('button');
        pBtn.type = 'button';
        pBtn.className = 'btn-secondary settings-sm-btn';
        pBtn.textContent = preset.label;
        pBtn.addEventListener('click', () => {
          const next = updateUserPreferences({
            ...(preset.amp !== undefined ? { voiceMicAmplification: preset.amp } : {}),
            voiceCustom: { ...preset.values },
          });
          ampControl.syncValue(next.voiceMicAmplification);
          pushVoiceDspUpdate(next);
          buildCustomControls();
        });
        presetBtnRow.appendChild(pBtn);
      }
      presetBar.appendChild(presetBtnRow);
      customPanel.appendChild(presetBar);

      const slidersGrid = document.createElement('div');
      slidersGrid.className = 'settings-voice-sliders-grid';

      slidersGrid.appendChild(
        createAudioSliderRow({
          label: 'Noise Gate (Drown Background Noise)',
          hint: 'Silences room hum, keyboard clicks, and fans quieter than this threshold.',
          min: -75,
          max: -18,
          step: 1,
          value: latest.voiceCustom.noiseGateThresholdDb,
          formatValue: (v) => (v <= -75 ? 'Off' : `${v} dB`),
          onInput: (v) => patchCustom({ noiseGateThresholdDb: v }),
        }).row,
      );

      slidersGrid.appendChild(
        createAudioSliderRow({
          label: 'Low-End Rumble Cut (High-Pass Filter)',
          hint: 'Cuts AC units, desk thuds, and low PC fan drone below this frequency.',
          min: 20,
          max: 300,
          step: 5,
          value: latest.voiceCustom.highPassHz,
          formatValue: (v) => `${v} Hz`,
          onInput: (v) => patchCustom({ highPassHz: v }),
        }).row,
      );

      slidersGrid.appendChild(
        createAudioSliderRow({
          label: 'High-Freq Hiss Reduction (Low-Pass Filter)',
          hint: 'Trims harsh static, sibilance, and coil whine above this frequency.',
          min: 4000,
          max: 20000,
          step: 500,
          value: latest.voiceCustom.lowPassHz,
          formatValue: (v) => (v >= 19500 ? 'Full (20 kHz)' : `${(v / 1000).toFixed(1)} kHz`),
          onInput: (v) => patchCustom({ lowPassHz: v }),
        }).row,
      );

      slidersGrid.appendChild(
        createAudioSliderRow({
          label: 'Voice Clarity Boost (Presence EQ)',
          hint: 'Sharpens vocal consonants at 2.8 kHz so your speech cuts through clearly.',
          min: -6,
          max: 12,
          step: 0.5,
          value: latest.voiceCustom.voiceClarityDb,
          formatValue: (v) => `${v > 0 ? '+' : ''}${v} dB`,
          onInput: (v) => patchCustom({ voiceClarityDb: v }),
        }).row,
      );

      slidersGrid.appendChild(
        createAudioSliderRow({
          label: 'Warmth / Boom Trim (180 Hz)',
          hint: 'Reduce for boxy rooms, or boost slightly for deeper vocal body.',
          min: -8,
          max: 8,
          step: 0.5,
          value: latest.voiceCustom.warmthDb,
          formatValue: (v) => `${v > 0 ? '+' : ''}${v} dB`,
          onInput: (v) => patchCustom({ warmthDb: v }),
        }).row,
      );

      slidersGrid.appendChild(
        createAudioSliderRow({
          label: 'Speech Compressor (Volume Leveler)',
          hint: 'Evens out whispers and loud peaks for consistent voice volume.',
          min: 0,
          max: 100,
          step: 5,
          value: latest.voiceCustom.compressorAmount,
          formatValue: (v) => (v <= 0 ? 'Off' : `${v}%`),
          onInput: (v) => patchCustom({ compressorAmount: v }),
        }).row,
      );

      customPanel.appendChild(slidersGrid);

      const dspToggles = document.createElement('div');
      dspToggles.className = 'settings-voice-dsp-toggles';
      dspToggles.appendChild(
        createToggleSwitch({
          label: 'Browser Noise Suppression',
          description: 'Applies Chromium acoustic background noise suppression to raw mic input.',
          checked: latest.voiceCustom.noiseSuppression,
          onChange: (next) => patchCustom({ noiseSuppression: next }),
        }),
      );
      dspToggles.appendChild(
        createToggleSwitch({
          label: 'Echo Cancellation',
          description: 'Prevents speaker playback or game audio from echoing through your mic.',
          checked: latest.voiceCustom.echoCancellation,
          onChange: (next) => patchCustom({ echoCancellation: next }),
        }),
      );
      dspToggles.appendChild(
        createToggleSwitch({
          label: 'Auto Gain Control',
          description: 'Lets Chromium automatically raise very quiet microphone capture gain.',
          checked: latest.voiceCustom.autoGainControl,
          onChange: (next) => patchCustom({ autoGainControl: next }),
        }),
      );
      customPanel.appendChild(dspToggles);
    };

    const syncModifierButtonsUi = (activeMode: VoiceModifierMode) => {
      for (const [id, btn] of modifierBtns.entries()) {
        btn.classList.toggle('settings-modifier-option--active', id === activeMode);
        btn.setAttribute('aria-pressed', String(id === activeMode));
      }
      buildCustomControls();
    };

    for (const def of modifierDefs) {
      const cardBtn = document.createElement('button');
      cardBtn.type = 'button';
      cardBtn.className = 'settings-modifier-option';

      const head = document.createElement('div');
      head.className = 'settings-modifier-head';
      const nameEl = document.createElement('span');
      nameEl.className = 'settings-modifier-name';
      nameEl.textContent = def.title;
      const badgeEl = document.createElement('span');
      badgeEl.className = 'settings-modifier-badge';
      badgeEl.textContent = def.badge;
      head.appendChild(nameEl);
      head.appendChild(badgeEl);

      const descEl = document.createElement('div');
      descEl.className = 'settings-modifier-desc';
      descEl.textContent = def.desc;

      cardBtn.appendChild(head);
      cardBtn.appendChild(descEl);
      cardBtn.addEventListener('click', () => {
        const nextPrefs = updateUserPreferences({ voiceModifierMode: def.id });
        syncModifierButtonsUi(def.id);
        pushVoiceDspUpdate(nextPrefs);
      });

      modifierBtns.set(def.id, cardBtn);
      modGrid.appendChild(cardBtn);
    }

    modCard.appendChild(modGrid);
    modCard.appendChild(customPanel);
    syncModifierButtonsUi(prefs.voiceModifierMode);
    contentInner.appendChild(modCard);

    // Input Mode (Voice Activity Always On vs Push to Talk)
    const modeCard = document.createElement('div');
    modeCard.className = 'settings-card';
    const modeHeading = document.createElement('h2');
    modeHeading.className = 'settings-section-heading';
    modeHeading.textContent = 'Input Mode';
    const modeSub = document.createElement('p');
    modeSub.className = 'settings-section-sub';
    modeSub.textContent = 'Choose between always-on voice activity or hold-to-talk keybind.';
    modeCard.appendChild(modeHeading);
    modeCard.appendChild(modeSub);

    const modeGrid = document.createElement('div');
    modeGrid.className = 'settings-pill-group';
    const modes: Array<{ id: VoiceInputMode; label: string }> = [
      { id: 'always-on', label: 'Voice Activity (Always On)' },
      { id: 'push-to-talk', label: 'Push to Talk' },
    ];
    for (const m of modes) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'settings-choice-pill';
      if (prefs.voiceInputMode === m.id) {
        pill.classList.add('settings-choice-pill--active');
      }
      pill.textContent = m.label;
      pill.addEventListener('click', () => {
        updateUserPreferences({ voiceInputMode: m.id });
        options.onPreferencesChanged?.();
        renderContent();
      });
      modeGrid.appendChild(pill);
    }
    modeCard.appendChild(modeGrid);

    let capturingKey = false;
    let keyRecordHandler: ((e: KeyboardEvent) => void) | null = null;
    if (prefs.voiceInputMode === 'push-to-talk') {
      const pttBox = document.createElement('div');
      pttBox.className = 'settings-ptt-box';

      const keyRow = document.createElement('div');
      keyRow.className = 'settings-ptt-row';
      const keyMeta = document.createElement('div');
      const keyTitle = document.createElement('div');
      keyTitle.className = 'settings-toggle-label';
      keyTitle.textContent = 'Push-to-Talk Keybind';
      const keyDesc = document.createElement('div');
      keyDesc.className = 'settings-toggle-desc';
      keyDesc.textContent = 'Hold this key during a call to transmit your microphone.';
      keyMeta.appendChild(keyTitle);
      keyMeta.appendChild(keyDesc);

      const keyBtn = document.createElement('button');
      keyBtn.type = 'button';
      keyBtn.className = 'btn-secondary settings-sm-btn';
      keyBtn.textContent = `Key: ${formatKeyCodeLabel(prefs.voicePushToTalkKey)}`;

      keyBtn.addEventListener('click', () => {
        if (capturingKey) {
          capturingKey = false;
          keyBtn.textContent = `Key: ${formatKeyCodeLabel(getUserPreferences().voicePushToTalkKey)}`;
          if (keyRecordHandler) {
            window.removeEventListener('keydown', keyRecordHandler, true);
            keyRecordHandler = null;
          }
          return;
        }
        capturingKey = true;
        keyBtn.textContent = 'Press any key...';
        keyRecordHandler = (ev: KeyboardEvent) => {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          capturingKey = false;
          if (keyRecordHandler) {
            window.removeEventListener('keydown', keyRecordHandler, true);
            keyRecordHandler = null;
          }
          if (ev.code === 'Escape') {
            keyBtn.textContent = `Key: ${formatKeyCodeLabel(getUserPreferences().voicePushToTalkKey)}`;
            return;
          }
          updateUserPreferences({ voicePushToTalkKey: ev.code || 'KeyV' });
          keyBtn.textContent = `Key: ${formatKeyCodeLabel(ev.code || 'KeyV')}`;
          options.onPreferencesChanged?.();
        };
        window.addEventListener('keydown', keyRecordHandler, true);
      });

      keyRow.appendChild(keyMeta);
      keyRow.appendChild(keyBtn);
      pttBox.appendChild(keyRow);

      const delayRow = document.createElement('div');
      delayRow.className = 'settings-ptt-delay-row';
      const delayLabel = document.createElement('div');
      delayLabel.className = 'settings-toggle-label';
      delayLabel.textContent = `Push-to-Talk Release Delay (${prefs.voicePushToTalkReleaseDelayMs} ms)`;
      const delaySlider = document.createElement('input');
      delaySlider.type = 'range';
      delaySlider.min = '0';
      delaySlider.max = '600';
      delaySlider.step = '25';
      delaySlider.value = String(prefs.voicePushToTalkReleaseDelayMs);
      delaySlider.className = 'settings-range';
      delaySlider.addEventListener('input', () => {
        const ms = Number(delaySlider.value) || 0;
        delayLabel.textContent = `Push-to-Talk Release Delay (${ms} ms)`;
        updateUserPreferences({ voicePushToTalkReleaseDelayMs: ms });
        options.onPreferencesChanged?.();
      });
      delayRow.appendChild(delayLabel);
      delayRow.appendChild(delaySlider);
      pttBox.appendChild(delayRow);

      modeCard.appendChild(pttBox);
    }

    contentInner.appendChild(modeCard);

    sectionCleanup = () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
      if (keyRecordHandler) {
        window.removeEventListener('keydown', keyRecordHandler, true);
        keyRecordHandler = null;
      }
    };
  };

  const renderNotificationsSection = () => {
    const prefs = getUserPreferences();
    const title = document.createElement('h1');
    title.className = 'settings-page-title';
    title.textContent = 'Notifications';
    contentInner.appendChild(title);

    const card = document.createElement('div');
    card.className = 'settings-card';

    const perm =
      typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
    const permRow = document.createElement('div');
    permRow.className = 'settings-perm-bar';

    const permText = document.createElement('span');
    permText.textContent =
      perm === 'granted'
        ? 'Desktop Permission: Allowed'
        : perm === 'denied'
          ? 'Desktop Permission: Blocked in browser settings'
          : perm === 'default'
            ? 'Desktop Permission: Not requested yet'
            : 'Desktop notifications unsupported in this window';
    permRow.appendChild(permText);

    const testBtn = document.createElement('button');
    testBtn.type = 'button';
    testBtn.className = 'btn-secondary settings-sm-btn';
    testBtn.textContent = perm === 'default' ? 'Enable & Test' : 'Send Test Alert';
    testBtn.addEventListener('click', async () => {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        ensureNotificationPermissionOnGesture();
        try {
          await Notification.requestPermission();
        } catch {
          // Ignore denied prompt
        }
      }
      playNotificationChime(true);
      sendDesktopNotification({
        title: 'Redshift Notifications',
        body: 'Desktop notifications and chimes are active!',
        force: true,
        allowWhenFocused: true,
      });
      if (getUserPreferences().inAppNotifications) {
        showInAppToast({
          title: 'Redshift Notifications',
          body: 'Built-in slide-in notifications are active and ready!',
          badge: 'TEST',
        });
      }
      renderContent();
    });
    permRow.appendChild(testBtn);
    card.appendChild(permRow);

    card.appendChild(
      createToggleSwitch({
        label: 'Desktop Notifications',
        description:
          'Show OS popup alerts for messages, calls, group adds, and friend requests when Redshift is not focused.',
        checked: prefs.desktopNotifications,
        onChange: (next) => {
          updateUserPreferences({ desktopNotifications: next });
          options.onPreferencesChanged?.();
        },
      }),
    );

    card.appendChild(
      createToggleSwitch({
        label: 'Built-In Slide-In Notifications',
        description:
          'Show sleek slide-in popups in the bottom-right corner with avatar, name, and message preview (off by default).',
        checked: prefs.inAppNotifications,
        onChange: (next) => {
          updateUserPreferences({ inAppNotifications: next });
          if (next) {
            showInAppToast({
              title: 'Built-In Notifications Enabled',
              body: 'New messages, calls, friend requests, and group updates will slide in right here.',
              badge: 'ON',
            });
          }
          options.onPreferencesChanged?.();
        },
      }),
    );

    card.appendChild(
      createToggleSwitch({
        label: 'Notify on Group Removals, Unfriends & Blocks',
        description:
          'Off by default. Turn on to get alerted whenever someone removes you from a group chat, unfriends you, or blocks you.',
        checked: prefs.notifyOnSocialRemovals,
        onChange: (next) => {
          updateUserPreferences({ notifyOnSocialRemovals: next });
          options.onPreferencesChanged?.();
        },
      }),
    );

    card.appendChild(
      createToggleSwitch({
        label: 'Message Alert Ping',
        description: 'Play a crisp notification ping when incoming messages arrive.',
        checked: prefs.notificationSound,
        onChange: (next) => {
          updateUserPreferences({ notificationSound: next });
          if (next) {
            playNotificationChime(true);
          }
          options.onPreferencesChanged?.();
        },
      }),
    );

    card.appendChild(
      createToggleSwitch({
        label: 'Show Message Preview in Desktop Popups',
        description: 'Display sender message snippet inside notification banners.',
        checked: prefs.notificationShowPreview,
        onChange: (next) => {
          updateUserPreferences({ notificationShowPreview: next });
          options.onPreferencesChanged?.();
        },
      }),
    );

    contentInner.appendChild(card);
  };

  const renderChatSection = () => {
    const prefs = getUserPreferences();
    const title = document.createElement('h1');
    title.className = 'settings-page-title';
    title.textContent = 'Chat & Media';
    contentInner.appendChild(title);

    const card = document.createElement('div');
    card.className = 'settings-card';

    card.appendChild(
      createToggleSwitch({
        label: 'Press Enter to Send Messages',
        description:
          'When off, Enter adds a new line and Ctrl+Enter sends your message.',
        checked: prefs.enterToSend,
        onChange: (next) => {
          updateUserPreferences({ enterToSend: next });
          options.onPreferencesChanged?.();
        },
      }),
    );

    card.appendChild(
      createToggleSwitch({
        label: 'Always Reveal Spoiler Tags',
        description: 'Automatically show text inside ||spoiler|| blocks without clicking.',
        checked: prefs.alwaysRevealSpoilers,
        onChange: (next) => {
          updateUserPreferences({ alwaysRevealSpoilers: next });
          options.onPreferencesChanged?.();
        },
      }),
    );

    card.appendChild(
      createToggleSwitch({
        label: 'Auto-Display Inline Images & Video',
        description: 'Show uploaded images and media players automatically in conversations.',
        checked: prefs.inlineMedia,
        onChange: (next) => {
          updateUserPreferences({ inlineMedia: next });
          options.onPreferencesChanged?.();
        },
      }),
    );

    const resetRow = document.createElement('div');
    resetRow.className = 'settings-reset-row';
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn-secondary settings-sm-btn';
    resetBtn.textContent = 'Reset App Preferences to Defaults';
    resetBtn.addEventListener('click', () => {
      resetUserPreferences();
      options.onPreferencesChanged?.();
      renderContent();
    });
    resetRow.appendChild(resetBtn);
    card.appendChild(resetRow);

    contentInner.appendChild(card);
  };

  const renderBlockedSection = (snap: SocialSnapshot) => {
    const title = document.createElement('h1');
    title.className = 'settings-page-title';
    title.textContent = 'Blocked Users';
    contentInner.appendChild(title);

    const blocked = snap.blockedUsers ?? [];
    const card = document.createElement('div');
    card.className = 'settings-card';

    if (blocked.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'settings-section-sub';
      empty.textContent = 'You have not blocked any users.';
      card.appendChild(empty);
      contentInner.appendChild(card);
      return;
    }

    for (const user of blocked) {
      const row = document.createElement('div');
      row.className = 'settings-blocked-row';

      const left = document.createElement('div');
      left.className = 'settings-blocked-left';
      const av = document.createElement('img');
      av.className = 'settings-blocked-avatar';
      av.src = options.resolveAvatar(user);
      av.alt = user.displayName;
      const meta = document.createElement('div');
      const d = document.createElement('div');
      d.className = 'settings-toggle-label';
      d.textContent = user.displayName;
      const u = document.createElement('div');
      u.className = 'settings-toggle-desc';
      u.textContent = `@${user.username}`;
      meta.appendChild(d);
      meta.appendChild(u);
      left.appendChild(av);
      left.appendChild(meta);

      const unblockBtn = document.createElement('button');
      unblockBtn.type = 'button';
      unblockBtn.className = 'btn-secondary settings-sm-btn';
      unblockBtn.textContent = 'Unblock';
      unblockBtn.addEventListener('click', async () => {
        unblockBtn.disabled = true;
        const res = await apiUnblockUser(user.username);
        if (closed) {
          return;
        }
        if (res.ok && res.snapshot) {
          options.onSnapshotUpdated(res.snapshot);
          renderContent();
        } else {
          unblockBtn.disabled = false;
        }
      });

      row.appendChild(left);
      row.appendChild(unblockBtn);
      card.appendChild(row);
    }

    contentInner.appendChild(card);
  };

  const renderDesktopSection = () => {
    const bridge = getDesktopBridge();
    const title = document.createElement('h1');
    title.className = 'settings-page-title';
    title.textContent = 'Desktop & Updates';
    contentInner.appendChild(title);

    if (!bridge) {
      const card = document.createElement('div');
      card.className = 'settings-card';
      const p = document.createElement('p');
      p.className = 'settings-section-sub';
      p.textContent = 'Desktop updater and tray controls are only available inside the Redshift Windows Desktop App.';
      card.appendChild(p);
      contentInner.appendChild(card);
      return;
    }

    // 1. Version & Update Card
    const updateCard = document.createElement('div');
    updateCard.className = 'settings-card';

    const updateHeadRow = document.createElement('div');
    updateHeadRow.className = 'settings-desktop-head';

    const updateHeadCopy = document.createElement('div');
    const updateTitle = document.createElement('h2');
    updateTitle.className = 'settings-section-heading';
    updateTitle.textContent = 'Redshift Desktop Launcher & Updater';
    const updateSub = document.createElement('p');
    updateSub.className = 'settings-section-sub';
    updateSub.textContent =
      'Redshift checks for tiny delta patches on startup and in the background so you never have to re-download the whole app.';
    updateHeadCopy.appendChild(updateTitle);
    updateHeadCopy.appendChild(updateSub);

    const versionPill = document.createElement('span');
    versionPill.className = 'settings-desktop-version-pill';
    versionPill.textContent = `v${bridge.version}`;

    updateHeadRow.appendChild(updateHeadCopy);
    updateHeadRow.appendChild(versionPill);
    updateCard.appendChild(updateHeadRow);

    const metaGrid = document.createElement('div');
    metaGrid.className = 'settings-desktop-meta';

    const makeMetaRow = (label: string, initialVal: string) => {
      const row = document.createElement('div');
      row.className = 'settings-desktop-meta-row';
      const lbl = document.createElement('span');
      lbl.className = 'settings-field-micro';
      lbl.textContent = label;
      const val = document.createElement('code');
      val.className = 'settings-desktop-path';
      val.textContent = initialVal;
      row.appendChild(lbl);
      row.appendChild(val);
      metaGrid.appendChild(row);
      return val;
    };

    const modeVal = makeMetaRow('RUNTIME', 'Loading...');
    const installDirVal = makeMetaRow('INSTALL FOLDER', 'Loading...');
    const dataDirVal = makeMetaRow('DATA & UPLOADS (PERSISTENT)', 'Loading...');
    updateCard.appendChild(metaGrid);

    const updateActions = document.createElement('div');
    updateActions.className = 'settings-desktop-actions';

    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'btn-secondary settings-sm-btn';
    checkBtn.textContent = 'Check for Updates';

    const applyUpdateBtn = document.createElement('button');
    applyUpdateBtn.type = 'button';
    applyUpdateBtn.className = 'btn-primary settings-sm-btn settings-desktop-update-btn';
    applyUpdateBtn.textContent = 'Update & Restart';
    applyUpdateBtn.hidden = true;

    const updateFeedback = document.createElement('div');
    updateFeedback.className = 'settings-feedback';
    updateFeedback.hidden = true;

    const showUpdateResult = (info: DesktopUpdateInfo) => {
      updateFeedback.hidden = false;
      updateFeedback.classList.remove('settings-feedback--ok', 'settings-feedback--err');
      if (info.updateAvailable && info.asarUrl) {
        const sizeMb =
          typeof info.size === 'number' && info.size > 0
            ? ` (${(info.size / (1024 * 1024)).toFixed(1)} MB)`
            : '';
        const notes = info.changelog ? ` — ${info.changelog}` : '';
        updateFeedback.classList.add('settings-feedback--ok');
        updateFeedback.textContent = `Update v${info.latestVersion} is ready${sizeMb}${notes}`;
        applyUpdateBtn.hidden = false;
        applyUpdateBtn.textContent = `Update to v${info.latestVersion} & Restart`;
      } else if (info.source === 'unconfigured') {
        applyUpdateBtn.hidden = true;
        updateFeedback.textContent =
          'No update source configured yet. Add your GitHub Releases repo (owner/repo) or a Remote Redshift Server below.';
      } else if (info.source === 'unreachable') {
        applyUpdateBtn.hidden = true;
        updateFeedback.classList.add('settings-feedback--err');
        updateFeedback.textContent =
          'Could not reach the configured update source. Check your connection or repository settings.';
      } else {
        applyUpdateBtn.hidden = true;
        updateFeedback.classList.add('settings-feedback--ok');
        updateFeedback.textContent = `You are up to date on Redshift v${info.currentVersion}.`;
      }
    };

    checkBtn.addEventListener('click', async () => {
      checkBtn.disabled = true;
      checkBtn.textContent = 'Checking...';
      try {
        const info = await bridge.checkForUpdates();
        if (!closed) {
          showUpdateResult(info);
        }
      } catch {
        if (!closed) {
          updateFeedback.hidden = false;
          updateFeedback.classList.remove('settings-feedback--ok');
          updateFeedback.classList.add('settings-feedback--err');
          updateFeedback.textContent = 'Update check failed.';
        }
      } finally {
        if (!closed) {
          checkBtn.disabled = false;
          checkBtn.textContent = 'Check for Updates';
        }
      }
    });

    applyUpdateBtn.addEventListener('click', () => {
      applyUpdateBtn.disabled = true;
      applyUpdateBtn.textContent = 'Launching Updater...';
      bridge.initiateUpdate();
    });

    updateActions.appendChild(checkBtn);
    updateActions.appendChild(applyUpdateBtn);
    updateCard.appendChild(updateActions);
    updateCard.appendChild(updateFeedback);
    contentInner.appendChild(updateCard);

    // 2. Server & Update Source Configuration Form
    const configForm = document.createElement('form');
    configForm.className = 'settings-card';

    const cfgTitle = document.createElement('h2');
    cfgTitle.className = 'settings-section-heading';
    cfgTitle.textContent = 'Server & Update Sources';
    const cfgSub = document.createElement('p');
    cfgSub.className = 'settings-section-sub';
    cfgSub.textContent =
      'Connect to your own self-hosted Redshift server or leave blank to use the built-in local server. Updates pull from GitHub Releases or your Redshift server directly — no third-party web hosting required.';
    configForm.appendChild(cfgTitle);
    configForm.appendChild(cfgSub);

    const makeLabeledInput = (labelText: string, placeholder: string, hintText: string) => {
      const wrap = document.createElement('div');
      wrap.className = 'settings-desktop-field';
      const lbl = document.createElement('label');
      lbl.className = 'settings-field-micro';
      lbl.textContent = labelText;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'settings-input';
      input.placeholder = placeholder;
      input.spellcheck = false;
      const hint = document.createElement('div');
      hint.className = 'settings-desktop-hint';
      hint.textContent = hintText;
      wrap.appendChild(lbl);
      wrap.appendChild(input);
      wrap.appendChild(hint);
      configForm.appendChild(wrap);
      return input;
    };

    const serverUrlInput = makeLabeledInput(
      'REMOTE REDSHIFT SERVER URL (OPTIONAL)',
      'Leave blank for Built-in Local Server (e.g. https://chat.yourdomain.com)',
      'When blank, Redshift runs its own private local server automatically.',
    );
    const githubRepoInput = makeLabeledInput(
      'GITHUB RELEASES REPOSITORY',
      'owner/redshift',
      'Checks https://github.com/<owner>/<repo>/releases/latest/download/version.json',
    );
    const customManifestInput = makeLabeledInput(
      'CUSTOM UPDATE MANIFEST URL (OPTIONAL)',
      'https://your-server.example/api/desktop/version.json',
      'Overrides the default manifest lookup if set.',
    );

    const cfgFeedback = document.createElement('div');
    cfgFeedback.className = 'settings-feedback';
    cfgFeedback.hidden = true;

    const cfgBtnRow = document.createElement('div');
    cfgBtnRow.className = 'settings-desktop-actions';

    const saveCfgBtn = document.createElement('button');
    saveCfgBtn.type = 'submit';
    saveCfgBtn.className = 'btn-primary settings-sm-btn';
    saveCfgBtn.textContent = 'Save & Apply';

    const testServerBtn = document.createElement('button');
    testServerBtn.type = 'button';
    testServerBtn.className = 'btn-secondary settings-sm-btn';
    testServerBtn.textContent = 'Test Server';
    testServerBtn.addEventListener('click', async () => {
      const targetUrl = serverUrlInput.value.trim().replace(/\/+$/, '');
      if (targetUrl && !/^https?:\/\//i.test(targetUrl)) {
        cfgFeedback.hidden = false;
        cfgFeedback.classList.remove('settings-feedback--ok');
        cfgFeedback.classList.add('settings-feedback--err');
        cfgFeedback.textContent = 'Server URL must start with http:// or https:// (or be left blank).';
        return;
      }
      testServerBtn.disabled = true;
      testServerBtn.textContent = 'Testing...';
      const health = await apiCheckServerHealth(targetUrl);
      if (closed) return;
      testServerBtn.disabled = false;
      testServerBtn.textContent = 'Test Server';
      cfgFeedback.hidden = false;
      if (health.ok) {
        cfgFeedback.classList.remove('settings-feedback--err');
        cfgFeedback.classList.add('settings-feedback--ok');
        const onlineTxt =
          typeof health.onlineUsers === 'number' ? ` · ${health.onlineUsers} online` : '';
        cfgFeedback.textContent = `Connected! Redshift v${health.version || '0.1.0'} (${health.latencyMs}ms${onlineTxt})`;
      } else {
        cfgFeedback.classList.remove('settings-feedback--ok');
        cfgFeedback.classList.add('settings-feedback--err');
        cfgFeedback.textContent = health.error || 'Could not reach server.';
      }
    });

    const relaunchBtn = document.createElement('button');
    relaunchBtn.type = 'button';
    relaunchBtn.className = 'btn-secondary settings-sm-btn';
    relaunchBtn.textContent = 'Relaunch Redshift';
    relaunchBtn.addEventListener('click', () => {
      bridge.relaunchApp();
    });

    cfgBtnRow.appendChild(saveCfgBtn);
    cfgBtnRow.appendChild(testServerBtn);
    cfgBtnRow.appendChild(relaunchBtn);
    configForm.appendChild(cfgFeedback);
    configForm.appendChild(cfgBtnRow);

    let initialServerUrl = '';
    configForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      saveCfgBtn.disabled = true;
      saveCfgBtn.textContent = 'Saving...';
      cfgFeedback.hidden = true;
      try {
        const nextServerUrl = serverUrlInput.value.trim().replace(/\/+$/, '');
        if (nextServerUrl && !/^https?:\/\//i.test(nextServerUrl)) {
          cfgFeedback.hidden = false;
          cfgFeedback.classList.remove('settings-feedback--ok');
          cfgFeedback.classList.add('settings-feedback--err');
          cfgFeedback.textContent = 'Server URL must start with http:// or https:// (or be left blank).';
          return;
        }
        const saved = await bridge.saveDesktopConfig({
          serverUrl: nextServerUrl,
          githubRepo: githubRepoInput.value.trim(),
          customManifestUrl: customManifestInput.value.trim(),
        });
        if (closed) return;
        setApiServerBaseUrl(saved.serverUrl || '');
        const serverChanged = (saved.serverUrl || '') !== initialServerUrl;
        initialServerUrl = saved.serverUrl || '';
        cfgFeedback.hidden = false;
        cfgFeedback.classList.remove('settings-feedback--err');
        cfgFeedback.classList.add('settings-feedback--ok');
        cfgFeedback.textContent = serverChanged
          ? 'Saved! Click "Relaunch Redshift" to reconnect cleanly to the new server.'
          : 'Desktop settings saved.';
      } catch {
        if (!closed) {
          cfgFeedback.hidden = false;
          cfgFeedback.classList.remove('settings-feedback--ok');
          cfgFeedback.classList.add('settings-feedback--err');
          cfgFeedback.textContent = 'Could not save desktop configuration.';
        }
      } finally {
        if (!closed) {
          saveCfgBtn.disabled = false;
          saveCfgBtn.textContent = 'Save & Apply';
        }
      }
    });
    contentInner.appendChild(configForm);

    // 3. System Tray & Window Behavior Card
    const trayCard = document.createElement('div');
    trayCard.className = 'settings-card';
    const trayTitle = document.createElement('h2');
    trayTitle.className = 'settings-section-heading';
    trayTitle.textContent = 'System Tray & Window';
    trayCard.appendChild(trayTitle);

    const trayToggleSlot = document.createElement('div');
    trayCard.appendChild(trayToggleSlot);

    const quitRow = document.createElement('div');
    quitRow.className = 'settings-desktop-actions';
    quitRow.style.marginTop = '12px';
    const quitBtn = document.createElement('button');
    quitBtn.type = 'button';
    quitBtn.className = 'btn-secondary settings-sm-btn settings-danger-btn';
    quitBtn.textContent = 'Quit Redshift Completely';
    quitBtn.addEventListener('click', () => {
      bridge.quitApp();
    });
    quitRow.appendChild(quitBtn);
    trayCard.appendChild(quitRow);
    contentInner.appendChild(trayCard);

    // Populate live config asynchronously
    void bridge.getDesktopConfig().then((cfg) => {
      if (closed) return;
      versionPill.textContent = `v${cfg.version || bridge.version}`;
      modeVal.textContent = cfg.isPackaged ? 'Packaged Windows App' : 'Development Build';
      installDirVal.textContent = cfg.installDir || '—';
      dataDirVal.textContent = cfg.dataDir || '—';
      serverUrlInput.value = cfg.serverUrl || '';
      initialServerUrl = cfg.serverUrl || '';
      githubRepoInput.value = cfg.githubRepo || '';
      customManifestInput.value = cfg.customManifestUrl || '';

      trayToggleSlot.replaceChildren(
        createToggleSwitch({
          label: 'Minimize to System Tray on Close',
          description:
            'Keep Redshift running quietly in the Windows taskbar tray when you click the X button so calls and notifications still arrive.',
          checked: cfg.minimizeToTray !== false,
          onChange: (next) => {
            void bridge.saveDesktopConfig({ minimizeToTray: next });
          },
        }),
      );
    });
  };

  const renderContent = () => {
    stopVoiceSectionActiveState();
    contentInner.replaceChildren();
    const snap = options.getSnapshot();
    switch (activeSection) {
      case 'security':
        renderSecuritySection(snap.user);
        break;
      case 'privacy':
        renderPrivacySection(snap);
        break;
      case 'appearance':
        renderAppearanceSection();
        break;
      case 'voice':
        renderVoiceSection();
        break;
      case 'notifications':
        renderNotificationsSection();
        break;
      case 'chat':
        renderChatSection();
        break;
      case 'blocked':
        renderBlockedSection(snap);
        break;
      case 'desktop':
        renderDesktopSection();
        break;
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!isTopmostModal(backdrop)) {
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
      return;
    }
    if (isModalConfirmShortcut(e, backdrop, { allowCtrlS: true })) {
      const activeEl = (e.target instanceof HTMLElement ? e.target : document.activeElement) as
        | HTMLElement
        | null;
      const focusedForm = activeEl?.closest<HTMLFormElement>('form');
      if (focusedForm && backdrop.contains(focusedForm)) {
        const submitBtn = focusedForm.querySelector<HTMLButtonElement>(
          'button[type="submit"]:not(:disabled)',
        );
        if (submitBtn) {
          e.preventDefault();
          e.stopImmediatePropagation();
          focusedForm.requestSubmit();
        }
      }
    }
  };

  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    stopVoiceSectionActiveState();
    window.removeEventListener('keydown', onKeyDown, true);
    backdrop.classList.remove('settings-overlay--visible');
    window.setTimeout(() => backdrop.remove(), 170);
  };

  escBtn.addEventListener('click', close);
  window.addEventListener('keydown', onKeyDown, true);

  renderNav();
  renderContent();

  requestAnimationFrame(() => {
    if (!closed) {
      backdrop.classList.add('settings-overlay--visible');
    }
  });

  return close;
}
