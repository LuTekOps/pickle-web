// Pickle email confirmation page (redirect target of the sign-up email).
//
// Two kinds of links arrive here, like on the password reset page:
// - Default Supabase email (free tier without custom SMTP): the link goes through /auth/v1/verify, which
//   confirms the account and redirects here with `#access_token=…&type=signup`. The account is active
//   already; the page only ends that browser session and says so.
// - Custom template (needs custom SMTP, see supabase/templates/confirmation.html):
//   `?token_hash=…&type=email`. The token is only redeemed when the user taps the button, so link
//   scanners and mail previews cannot burn it:
//   POST /auth/v1/verify {token_hash, type: "email"} -> confirms, returns a session (= supabase.auth.verifyOtp)
// In both cases the session is ended at once (POST /auth/v1/logout?scope=local): the user signs in in the
// app, so nothing is kept in the browser.
(() => {
  'use strict';

  // Public by design (the same anon key ships in the app); access control lives in RLS.
  const SUPABASE_URL = 'https://glebczptvyoojznohtsc.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsZWJjenB0dnlvb2p6bm9odHNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MzIwMjQsImV4cCI6MjEwNDIwODAyNH0.BGpBfEiayPSc5xAj8LYw-cqEZcRqIB4GFLYE6vGGS90';
  const TOKEN_TYPES = ['email', 'signup'];

  const STRINGS = {
    en: {
      title: 'Pickle · Confirm email',
      confirmTitle: 'Almost there!',
      confirmBody: 'Tap the button to activate your Pickle account.',
      confirm: 'Activate my account',
      errorNetwork: 'No connection. Check your internet and try again.',
      errorRateLimit: 'Too many attempts. Please wait a moment and try again.',
      doneTitle: 'Your account is active!',
      doneBody: 'Go back to the Pickle app and sign in with your email and password. Polls, groups and karma are now unlocked.',
      doneClose: 'You can close this page.',
      invalidTitle: "This link doesn't work anymore",
      invalidBody: 'Confirmation links can only be used once and expire after one hour. If you already confirmed, just sign in. Otherwise request a new link:',
      step1: 'Open the Pickle app.',
      step2: 'Tap “Resend email” in the box on the start screen, or try to sign in.',
      step3: 'Open the new link from the email.',
      footer: 'Pickle · Confirm email',
    },
    de: {
      title: 'Pickle · E-Mail bestätigen',
      confirmTitle: 'Fast geschafft!',
      confirmBody: 'Tippe auf den Knopf, um dein Pickle-Konto zu aktivieren.',
      confirm: 'Konto aktivieren',
      errorNetwork: 'Keine Verbindung. Prüf dein Internet und versuch es nochmal.',
      errorRateLimit: 'Zu viele Versuche. Warte kurz und versuch es dann nochmal.',
      doneTitle: 'Dein Konto ist aktiv!',
      doneBody: 'Geh zurück in die Pickle-App und melde dich mit deiner E-Mail und deinem Passwort an. Umfragen, Gruppen und Karma sind jetzt freigeschaltet.',
      doneClose: 'Du kannst diese Seite jetzt schließen.',
      invalidTitle: 'Dieser Link funktioniert nicht mehr',
      invalidBody: 'Bestätigungslinks gelten nur einmal und laufen nach einer Stunde ab. Wenn du schon bestätigt hast, melde dich einfach an. Sonst fordere einen neuen Link an:',
      step1: 'Öffne die Pickle-App.',
      step2: 'Tippe im Kasten auf dem Startbildschirm auf „E-Mail erneut senden“ oder versuch dich anzumelden.',
      step3: 'Öffne den neuen Link aus der E-Mail.',
      footer: 'Pickle · E-Mail bestätigen',
    },
    fr: {
      title: "Pickle · Confirmer l’e-mail",
      confirmTitle: "Presque fini !",
      confirmBody: "Appuie sur le bouton pour activer ton compte Pickle.",
      confirm: "Activer mon compte",
      errorNetwork: "Pas de connexion. Vérifie ton internet et réessaie.",
      errorRateLimit: "Trop de tentatives. Attends un instant et réessaie.",
      doneTitle: "Ton compte est actif !",
      doneBody: "Retourne dans l’app Pickle et connecte-toi avec ton e-mail et ton mot de passe. Sondages, groupes et karma sont débloqués.",
      doneClose: "Tu peux fermer cette page.",
      invalidTitle: "Ce lien ne fonctionne plus",
      invalidBody: "Les liens de confirmation ne servent qu’une fois et expirent au bout d’une heure. Si tu as déjà confirmé, connecte-toi simplement. Sinon, demande un nouveau lien :",
      step1: "Ouvre l’app Pickle.",
      step2: "Appuie sur « Renvoyer l’e-mail » dans l’encadré de l’écran d’accueil, ou essaie de te connecter.",
      step3: "Ouvre le nouveau lien reçu par e-mail.",
      footer: "Pickle · Confirmer l’e-mail",
    },
    it: {
      title: "Pickle · Conferma email",
      confirmTitle: "Ci siamo quasi!",
      confirmBody: "Tocca il pulsante per attivare il tuo account Pickle.",
      confirm: "Attiva il mio account",
      errorNetwork: "Nessuna connessione. Controlla internet e riprova.",
      errorRateLimit: "Troppi tentativi. Aspetta un attimo e riprova.",
      doneTitle: "Il tuo account è attivo!",
      doneBody: "Torna nell’app Pickle e accedi con la tua email e la tua password. Sondaggi, gruppi e karma sono sbloccati.",
      doneClose: "Puoi chiudere questa pagina.",
      invalidTitle: "Questo link non funziona più",
      invalidBody: "I link di conferma valgono una sola volta e scadono dopo un’ora. Se hai già confermato, accedi e basta. Altrimenti richiedi un nuovo link:",
      step1: "Apri l’app Pickle.",
      step2: "Tocca “Invia di nuovo l’email” nel riquadro della schermata iniziale, oppure prova ad accedere.",
      step3: "Apri il nuovo link dell’email.",
      footer: "Pickle · Conferma email",
    },
    es: {
      title: "Pickle · Confirmar correo",
      confirmTitle: "¡Ya casi está!",
      confirmBody: "Toca el botón para activar tu cuenta de Pickle.",
      confirm: "Activar mi cuenta",
      errorNetwork: "Sin conexión. Revisa tu internet e inténtalo de nuevo.",
      errorRateLimit: "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
      doneTitle: "¡Tu cuenta está activa!",
      doneBody: "Vuelve a la app de Pickle e inicia sesión con tu correo y tu contraseña. Encuestas, grupos y karma ya están desbloqueados.",
      doneClose: "Ya puedes cerrar esta página.",
      invalidTitle: "Este enlace ya no funciona",
      invalidBody: "Los enlaces de confirmación solo sirven una vez y caducan en una hora. Si ya confirmaste, simplemente inicia sesión. Si no, pide un enlace nuevo:",
      step1: "Abre la app de Pickle.",
      step2: "Toca “Reenviar correo” en el recuadro de la pantalla de inicio, o intenta iniciar sesión.",
      step3: "Abre el nuevo enlace del correo.",
      footer: "Pickle · Confirmar correo",
    },
    pt: {
      title: "Pickle · Confirmar e-mail",
      confirmTitle: "Quase lá!",
      confirmBody: "Toque no botão para ativar sua conta Pickle.",
      confirm: "Ativar minha conta",
      errorNetwork: "Sem conexão. Verifique sua internet e tente de novo.",
      errorRateLimit: "Tentativas demais. Espere um pouco e tente de novo.",
      doneTitle: "Sua conta está ativa!",
      doneBody: "Volte ao app Pickle e entre com seu e-mail e sua senha. Enquetes, grupos e karma estão liberados.",
      doneClose: "Você já pode fechar esta página.",
      invalidTitle: "Este link não funciona mais",
      invalidBody: "Links de confirmação só funcionam uma vez e expiram em uma hora. Se você já confirmou, é só entrar. Senão, peça um link novo:",
      step1: "Abra o app Pickle.",
      step2: "Toque em “Reenviar e-mail” no quadro da tela inicial, ou tente entrar.",
      step3: "Abra o novo link do e-mail.",
      footer: "Pickle · Confirmar e-mail",
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
  const type = query.get('type') || 'email';
  const fragmentToken = TOKEN_TYPES.includes(fragment.get('type')) ? fragment.get('access_token') : null;
  const linkError = query.get('error_code') || query.get('error') || fragment.get('error_code') || fragment.get('error');
  if (tokenHash || location.hash) {
    const clean = new URL(location.href);
    clean.searchParams.delete('token_hash');
    clean.searchParams.delete('type');
    clean.hash = '';
    history.replaceState(null, '', clean.pathname + clean.search);
  }

  const $ = (id) => document.getElementById(id);
  const views = ['view-confirm', 'view-done', 'view-invalid'];
  function show(view) {
    views.forEach((v) => { $(v).hidden = v !== view; });
    $('mascot').classList.toggle('sad', view === 'view-invalid');
    $('mouth-happy').toggleAttribute('hidden', view === 'view-invalid');
    $('mouth-sad').toggleAttribute('hidden', view !== 'view-invalid');
    $('badge').toggleAttribute('hidden', view !== 'view-done');
    const heading = $(view).querySelector('h1');
    if (heading && view !== 'view-confirm') { heading.tabIndex = -1; heading.focus(); }
  }

  async function api(path, { body, token } = {}) {
    let res;
    try {
      res = await fetch(SUPABASE_URL + '/auth/v1' + path, {
        method: 'POST',
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
    return { ok: res.ok, status: res.status, json };
  }

  // The app signs in itself; the browser keeps nothing.
  async function done(accessToken) {
    await api('/logout?scope=local', { token: accessToken });
    show('view-done');
  }

  if (linkError || (!tokenHash && !fragmentToken) || (tokenHash && !TOKEN_TYPES.includes(type))) {
    show('view-invalid');
    return;
  }
  if (fragmentToken) {
    done(fragmentToken);
    return;
  }

  show('view-confirm');
  const button = $('submit');
  function setError(message) {
    $('form-error').textContent = message || '';
    $('form-error').hidden = !message;
  }
  button.addEventListener('click', async () => {
    setError(null);
    button.disabled = true;
    button.querySelector('.spinner').hidden = false;
    try {
      const verified = await api('/verify', { body: { token_hash: tokenHash, type } });
      if (verified.network) { setError(t.errorNetwork); return; }
      if (verified.status === 429) { setError(t.errorRateLimit); return; }
      if (!verified.ok || !verified.json || !verified.json.access_token) { show('view-invalid'); return; }
      await done(verified.json.access_token);
    } finally {
      button.disabled = false;
      button.querySelector('.spinner').hidden = true;
    }
  });
})();
