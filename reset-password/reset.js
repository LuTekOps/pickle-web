// Pickle password reset page.
//
// The recovery email links here with `?token_hash=…&type=recovery` (see supabase/templates/recovery.html).
// The token is only redeemed when the user submits the form, so link scanners and mail previews that
// open the URL cannot burn the one-time token. Then:
//   POST /auth/v1/verify {token_hash, type: "recovery"}  -> short-lived session (= supabase.auth.verifyOtp)
//   PUT  /auth/v1/user   {password}                      -> new password       (= supabase.auth.updateUser)
//   POST /auth/v1/logout?scope=local                     -> ends this session  (= supabase.auth.signOut({scope:"local"}))
// Plain fetch instead of supabase-js: no third-party script on a password page and nothing is persisted
// in the browser (the session only lives in memory). Works on any device, independent of PKCE: a token
// hash requested with PKCE ("pkce_…") is accepted by /verify just the same.
(() => {
  'use strict';

  // Public by design (the same anon key ships in the app); access control lives in RLS.
  const SUPABASE_URL = 'https://glebczptvyoojznohtsc.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsZWJjenB0dnlvb2p6bm9odHNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MzIwMjQsImV4cCI6MjEwNDIwODAyNH0.BGpBfEiayPSc5xAj8LYw-cqEZcRqIB4GFLYE6vGGS90';
  const MIN_PASSWORD_LENGTH = 8; // = PasswordRules.MIN_LENGTH in the app

  const STRINGS = {
    en: {
      title: 'Pickle · Reset password',
      formTitle: 'Set a new password',
      formBody: "Pick something you'll remember this time.",
      newPassword: 'New password',
      repeatPassword: 'Repeat new password',
      minLength: 'At least 8 characters',
      showPassword: 'Show password',
      hidePassword: 'Hide password',
      save: 'Save new password',
      errorTooShort: 'At least 8 characters',
      errorMismatch: "The passwords don't match",
      errorWeak: 'Please choose a stronger password.',
      errorSame: 'Your new password must be different from the old one.',
      errorNetwork: 'No connection. Check your internet and try again.',
      errorRateLimit: 'Too many attempts. Please wait a moment and try again.',
      errorUnknown: 'Something went wrong. Please try again.',
      doneTitle: 'Password changed!',
      doneBody: 'You can now log in to the app with your new password.',
      doneClose: 'You can close this page.',
      invalidTitle: "This link doesn't work anymore",
      invalidBody: 'Reset links can only be used once and expire after one hour. No worries, just request a new one:',
      step1: 'Open the Pickle app.',
      step2: 'Tap “Sign in”, then “Forgot password?”.',
      step3: 'Enter your email and open the new link from the email.',
      footer: 'Pickle · Password reset',
    },
    de: {
      title: 'Pickle · Passwort zurücksetzen',
      formTitle: 'Neues Passwort festlegen',
      formBody: 'Nimm diesmal eins, das du dir merken kannst.',
      newPassword: 'Neues Passwort',
      repeatPassword: 'Neues Passwort wiederholen',
      minLength: 'Mindestens 8 Zeichen',
      showPassword: 'Passwort anzeigen',
      hidePassword: 'Passwort verbergen',
      save: 'Neues Passwort speichern',
      errorTooShort: 'Mindestens 8 Zeichen',
      errorMismatch: 'Die Passwörter stimmen nicht überein',
      errorWeak: 'Bitte wähl ein sichereres Passwort.',
      errorSame: 'Dein neues Passwort muss sich vom alten unterscheiden.',
      errorNetwork: 'Keine Verbindung. Prüf dein Internet und versuch es nochmal.',
      errorRateLimit: 'Zu viele Versuche. Warte kurz und versuch es dann nochmal.',
      errorUnknown: 'Da ist etwas schiefgelaufen. Versuch es bitte nochmal.',
      doneTitle: 'Passwort geändert!',
      doneBody: 'Du kannst dich jetzt mit deinem neuen Passwort in der App anmelden.',
      doneClose: 'Du kannst diese Seite jetzt schließen.',
      invalidTitle: 'Dieser Link funktioniert nicht mehr',
      invalidBody: 'Links zum Zurücksetzen gelten nur einmal und laufen nach einer Stunde ab. Kein Problem, fordere einfach einen neuen an:',
      step1: 'Öffne die Pickle-App.',
      step2: 'Tippe auf „Anmelden“ und dann auf „Passwort vergessen?“.',
      step3: 'Gib deine E-Mail ein und öffne den neuen Link aus der E-Mail.',
      footer: 'Pickle · Passwort zurücksetzen',
    },
  };

  // ---- Language: ?lang=de|en overrides the browser language (handy for support and tests).
  const query = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  const requested = (query.get('lang') || navigator.language || 'en').toLowerCase();
  const lang = requested.startsWith('de') ? 'de' : 'en';
  const t = STRINGS[lang];
  document.documentElement.lang = lang;
  document.title = t.title;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t[el.dataset.i18n]; });

  // ---- Read the one-time token, then drop it from the address bar (history, screenshots, sharing).
  const tokenHash = query.get('token_hash');
  const type = query.get('type') || 'recovery';
  const linkError = query.get('error_code') || query.get('error') || fragment.get('error_code') || fragment.get('error');
  if (tokenHash || location.hash) {
    const clean = new URL(location.href);
    clean.searchParams.delete('token_hash');
    clean.searchParams.delete('type');
    clean.hash = '';
    history.replaceState(null, '', clean.pathname + clean.search);
  }

  const $ = (id) => document.getElementById(id);
  const views = ['view-form', 'view-done', 'view-invalid'];
  function show(view) {
    views.forEach((v) => { $(v).hidden = v !== view; });
    const mascot = $('mascot');
    mascot.classList.toggle('sad', view === 'view-invalid');
    $('mouth-happy').toggleAttribute('hidden', view === 'view-invalid');
    $('mouth-sad').toggleAttribute('hidden', view !== 'view-invalid');
    $('badge').toggleAttribute('hidden', view !== 'view-done');
    const heading = $(view).querySelector('h1');
    if (heading && view !== 'view-form') { heading.tabIndex = -1; heading.focus(); }
  }

  if (!tokenHash || type !== 'recovery' || linkError) {
    show('view-invalid');
    return;
  }
  show('view-form');

  // ---- Password visibility toggles
  const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 5C6.5 5 2.7 9.1 1.5 12c1.2 2.9 5 7 10.5 7s9.3-4.1 10.5-7C21.3 9.1 17.5 5 12 5zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-2.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.3 2.3 2 3.6l3.1 3.1C3.4 8.1 2.1 10 1.5 12c1.2 2.9 5 7 10.5 7 1.9 0 3.6-.5 5-1.2l3.4 3.4 1.3-1.3L3.3 2.3zM12 16.5a4.5 4.5 0 0 1-4.3-5.8l1.6 1.6a2.7 2.7 0 0 0 2.6 2.6l1.6 1.6c-.5.1-1 .2-1.5.2zm0-11.5c5.5 0 9.3 4.1 10.5 7-.5 1.3-1.5 2.8-2.9 4.1l-3.2-3.2A4.5 4.5 0 0 0 10.6 7.6L8.5 5.5C9.6 5.2 10.8 5 12 5z"/></svg>';
  document.querySelectorAll('.toggle').forEach((btn) => {
    const input = $(btn.dataset.target);
    const render = () => {
      const visible = input.type === 'text';
      btn.innerHTML = visible ? EYE_OFF : EYE;
      btn.setAttribute('aria-label', visible ? t.hidePassword : t.showPassword);
      btn.setAttribute('aria-pressed', String(visible));
    };
    btn.addEventListener('click', () => { input.type = input.type === 'password' ? 'text' : 'password'; render(); });
    render();
  });

  // ---- Validation (same rules as the app's NewPassword screen)
  const password = $('password');
  const confirm = $('confirm');
  function setFieldError(field, hintId, message, fallback) {
    $(field).classList.toggle('invalid', Boolean(message));
    const hint = $(hintId);
    hint.textContent = message || fallback || '';
    hint.hidden = !message && !fallback;
    $(field).querySelector('input').setAttribute('aria-invalid', String(Boolean(message)));
  }
  function setFormError(message) {
    $('form-error').textContent = message || '';
    $('form-error').hidden = !message;
  }
  password.addEventListener('input', () => { setFieldError('field-password', 'password-hint', null, t.minLength); setFieldError('field-confirm', 'confirm-hint', null); setFormError(null); });
  confirm.addEventListener('input', () => { setFieldError('field-confirm', 'confirm-hint', null); setFormError(null); });

  // ---- Auth API
  let accessToken = null; // recovery session, memory only
  let tokenUsed = false;

  async function api(path, { method = 'POST', body, token } = {}) {
    let res;
    try {
      res = await fetch(SUPABASE_URL + '/auth/v1' + path, {
        method,
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + (token || SUPABASE_ANON_KEY),
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
      });
    } catch (e) {
      return { ok: false, network: true };
    }
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty body */ }
    return { ok: res.ok, status: res.status, code: (json && (json.error_code || json.code)) || '', json };
  }

  function setBusy(busy) {
    const btn = $('submit');
    btn.disabled = busy;
    btn.querySelector('.spinner').hidden = !busy;
    password.readOnly = busy;
    confirm.readOnly = busy;
  }

  $('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    setFormError(null);
    const pw = password.value;
    if (pw.length < MIN_PASSWORD_LENGTH) {
      setFieldError('field-password', 'password-hint', t.errorTooShort);
      password.focus();
      return;
    }
    if (confirm.value !== pw) {
      setFieldError('field-confirm', 'confirm-hint', t.errorMismatch);
      confirm.focus();
      return;
    }
    setBusy(true);
    try {
      // 1. Redeem the one-time token (only once; kept in memory for retries after e.g. a weak password).
      if (!accessToken) {
        if (tokenUsed) { show('view-invalid'); return; }
        const verified = await api('/verify', { body: { token_hash: tokenHash, type: 'recovery' } });
        if (verified.network) { setFormError(t.errorNetwork); return; }
        if (verified.status === 429) { setFormError(t.errorRateLimit); return; }
        tokenUsed = true;
        if (!verified.ok || !verified.json || !verified.json.access_token) { show('view-invalid'); return; }
        accessToken = verified.json.access_token;
      }
      // 2. Set the new password.
      const updated = await api('/user', { method: 'PUT', body: { password: pw }, token: accessToken });
      if (updated.network) { setFormError(t.errorNetwork); return; }
      if (!updated.ok) {
        const msg = String((updated.json && (updated.json.msg || updated.json.message)) || '').toLowerCase();
        if (updated.code === 'same_password' || msg.includes('different from the old')) {
          setFieldError('field-password', 'password-hint', t.errorSame);
        } else if (updated.code === 'weak_password' || msg.includes('password should')) {
          setFieldError('field-password', 'password-hint', t.errorWeak);
        } else if (updated.status === 429) {
          setFormError(t.errorRateLimit);
        } else if (updated.status === 401 || updated.status === 403) {
          show('view-invalid'); // recovery session expired
        } else {
          setFormError(t.errorUnknown);
        }
        return;
      }
      // 3. End the recovery session; the user signs in with the new password in the app.
      await api('/logout?scope=local', { token: accessToken });
      accessToken = null;
      password.value = '';
      confirm.value = '';
      show('view-done');
    } finally {
      setBusy(false);
    }
  });
})();
