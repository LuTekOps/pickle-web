// Pickle password reset page.
//
// Two kinds of links arrive here:
// - Default Supabase email (free tier without custom SMTP, templates cannot be changed): the link goes
//   through /auth/v1/verify, which redeems the token and redirects here with `#access_token=…&type=recovery`.
//   The page then only needs the PUT /user and logout steps below.
// - Custom template (needs custom SMTP, see supabase/templates/recovery.html): `?token_hash=…&type=recovery`.
//   The token is only redeemed when the user submits the form, so link scanners and mail previews that
//   open the URL cannot burn the one-time token. Then:
//   POST /auth/v1/verify {token_hash, type: "recovery"}  -> short-lived session (= supabase.auth.verifyOtp)
//   PUT  /auth/v1/user   {password}                      -> new password       (= supabase.auth.updateUser)
//   POST /auth/v1/logout?scope=local                     -> ends this session  (= supabase.auth.signOut({scope:"local"}))
// Plain fetch instead of supabase-js: no third-party script on a password page and nothing is persisted
// in the browser (the session only lives in memory). Works on any device, independent of PKCE: a token
// hash requested with PKCE ("pkce_…") is accepted by /verify just the same.
(() => {
  'use strict';

  // Clickjacking guard: the page must never run inside another site's frame (a meta CSP cannot set
  // frame-ancestors, and GitHub Pages sends no X-Frame-Options). Hide everything and try to break out.
  if (window.top !== window.self) {
    document.documentElement.style.display = 'none';
    try {
      window.top.location = window.self.location.href;
    } catch (e) {
      // Sandboxed or cross-origin frame without navigation rights: the page simply stays hidden.
    }
    return;
  }

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
    fr: {
      title: "Pickle · Réinitialiser le mot de passe",
      formTitle: "Choisis un nouveau mot de passe",
      formBody: "Prends-en un dont tu te souviendras cette fois.",
      newPassword: "Nouveau mot de passe",
      repeatPassword: "Répète le nouveau mot de passe",
      minLength: "Au moins 8 caractères",
      showPassword: "Afficher le mot de passe",
      hidePassword: "Masquer le mot de passe",
      save: "Enregistrer le mot de passe",
      errorTooShort: "Au moins 8 caractères",
      errorMismatch: "Les mots de passe ne correspondent pas",
      errorWeak: "Choisis un mot de passe plus solide.",
      errorSame: "Ton nouveau mot de passe doit être différent de l’ancien.",
      errorNetwork: "Pas de connexion. Vérifie ton internet et réessaie.",
      errorRateLimit: "Trop de tentatives. Attends un instant et réessaie.",
      errorUnknown: "Un problème est survenu. Réessaie.",
      doneTitle: "Mot de passe changé !",
      doneBody: "Tu peux maintenant te connecter à l’app avec ton nouveau mot de passe.",
      doneClose: "Tu peux fermer cette page.",
      invalidTitle: "Ce lien ne fonctionne plus",
      invalidBody: "Les liens de réinitialisation ne servent qu’une fois et expirent au bout d’une heure. Pas de souci, demande-en un nouveau :",
      step1: "Ouvre l’app Pickle.",
      step2: "Appuie sur « Se connecter », puis sur « Mot de passe oublié ? ».",
      step3: "Saisis ton e-mail et ouvre le nouveau lien reçu.",
      footer: "Pickle · Réinitialiser le mot de passe",
    },
    it: {
      title: "Pickle · Reimposta password",
      formTitle: "Scegli una nuova password",
      formBody: "Stavolta prendine una che ti ricordi.",
      newPassword: "Nuova password",
      repeatPassword: "Ripeti la nuova password",
      minLength: "Almeno 8 caratteri",
      showPassword: "Mostra password",
      hidePassword: "Nascondi password",
      save: "Salva la nuova password",
      errorTooShort: "Almeno 8 caratteri",
      errorMismatch: "Le password non coincidono",
      errorWeak: "Scegli una password più sicura.",
      errorSame: "La nuova password deve essere diversa da quella vecchia.",
      errorNetwork: "Nessuna connessione. Controlla internet e riprova.",
      errorRateLimit: "Troppi tentativi. Aspetta un attimo e riprova.",
      errorUnknown: "Qualcosa è andato storto. Riprova.",
      doneTitle: "Password cambiata!",
      doneBody: "Ora puoi accedere all’app con la nuova password.",
      doneClose: "Puoi chiudere questa pagina.",
      invalidTitle: "Questo link non funziona più",
      invalidBody: "I link per reimpostare la password valgono una sola volta e scadono dopo un’ora. Nessun problema, richiedine uno nuovo:",
      step1: "Apri l’app Pickle.",
      step2: "Tocca “Accedi” e poi “Password dimenticata?”.",
      step3: "Inserisci la tua email e apri il nuovo link ricevuto.",
      footer: "Pickle · Reimposta password",
    },
    es: {
      title: "Pickle · Restablecer contraseña",
      formTitle: "Elige una contraseña nueva",
      formBody: "Esta vez elige una que puedas recordar.",
      newPassword: "Contraseña nueva",
      repeatPassword: "Repite la contraseña nueva",
      minLength: "Al menos 8 caracteres",
      showPassword: "Mostrar contraseña",
      hidePassword: "Ocultar contraseña",
      save: "Guardar contraseña nueva",
      errorTooShort: "Al menos 8 caracteres",
      errorMismatch: "Las contraseñas no coinciden",
      errorWeak: "Elige una contraseña más segura.",
      errorSame: "Tu contraseña nueva debe ser distinta de la anterior.",
      errorNetwork: "Sin conexión. Revisa tu internet e inténtalo de nuevo.",
      errorRateLimit: "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
      errorUnknown: "Algo salió mal. Inténtalo de nuevo.",
      doneTitle: "¡Contraseña cambiada!",
      doneBody: "Ya puedes iniciar sesión en la app con tu contraseña nueva.",
      doneClose: "Ya puedes cerrar esta página.",
      invalidTitle: "Este enlace ya no funciona",
      invalidBody: "Los enlaces para restablecer solo sirven una vez y caducan en una hora. Tranquilo, pide uno nuevo:",
      step1: "Abre la app de Pickle.",
      step2: "Toca “Iniciar sesión” y luego “¿Olvidaste tu contraseña?”.",
      step3: "Escribe tu correo y abre el nuevo enlace que recibas.",
      footer: "Pickle · Restablecer contraseña",
    },
    pt: {
      title: "Pickle · Redefinir senha",
      formTitle: "Defina uma nova senha",
      formBody: "Desta vez, escolha uma que você vá lembrar.",
      newPassword: "Nova senha",
      repeatPassword: "Repita a nova senha",
      minLength: "Pelo menos 8 caracteres",
      showPassword: "Mostrar senha",
      hidePassword: "Ocultar senha",
      save: "Salvar nova senha",
      errorTooShort: "Pelo menos 8 caracteres",
      errorMismatch: "As senhas não coincidem",
      errorWeak: "Escolha uma senha mais forte.",
      errorSame: "A nova senha precisa ser diferente da antiga.",
      errorNetwork: "Sem conexão. Verifique sua internet e tente de novo.",
      errorRateLimit: "Tentativas demais. Espere um pouco e tente de novo.",
      errorUnknown: "Algo deu errado. Tente de novo.",
      doneTitle: "Senha alterada!",
      doneBody: "Agora você pode entrar no app com a nova senha.",
      doneClose: "Você já pode fechar esta página.",
      invalidTitle: "Este link não funciona mais",
      invalidBody: "Links de redefinição só funcionam uma vez e expiram em uma hora. Sem problema, peça um novo:",
      step1: "Abra o app Pickle.",
      step2: "Toque em “Entrar” e depois em “Esqueceu a senha?”.",
      step3: "Digite seu e-mail e abra o novo link recebido.",
      footer: "Pickle · Redefinir senha",
    },
  };

  // ---- Language: ?lang=de|en|fr|it|es|pt overrides the browser language (handy for support and tests).
  const query = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  const requested = (query.get('lang') || navigator.language || 'en').toLowerCase();
  const lang = Object.keys(STRINGS).find((code) => requested.startsWith(code)) || 'en';
  const t = STRINGS[lang];
  document.documentElement.lang = lang;
  document.title = t.title;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t[el.dataset.i18n]; });

  // ---- Read the one-time token, then drop it from the address bar (history, screenshots, sharing).
  const tokenHash = query.get('token_hash');
  const type = query.get('type') || 'recovery';
  // Default Supabase template (free tier, no custom SMTP): /auth/v1/verify already redeemed the token and
  // redirected here with the recovery session in the fragment (#access_token=…&type=recovery).
  const fragmentToken = fragment.get('type') === 'recovery' ? fragment.get('access_token') : null;
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

  if ((!tokenHash && !fragmentToken) || type !== 'recovery' || linkError) {
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
  let accessToken = fragmentToken; // recovery session, memory only
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
