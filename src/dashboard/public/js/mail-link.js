/**
 * Support mail links.
 *
 * A bare `mailto:` silently does nothing when the machine has no mail client
 * configured, which makes the "Support kontaktieren" button feel broken.
 * So every mailto link now also copies the address to the clipboard and
 * confirms it on screen – the mail client still opens if one is set up.
 */

(function () {
  const HINT_MS = 2800;

  function hint(text) {
    let el = document.getElementById('mail-copy-hint');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mail-copy-hint';
      el.className = 'mail-copy-hint';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(function () {
      el.classList.remove('show');
    }, HINT_MS);
  }

  // Clipboard API needs a secure context (https / localhost) – this is the
  // fallback for the plain-http setups.
  function legacyCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function copy(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { done(true); },
        function () { done(legacyCopy(text)); }
      );
    } else {
      done(legacyCopy(text));
    }
  }

  document.addEventListener('click', function (e) {
    const link = e.target && e.target.closest ? e.target.closest('a[href^="mailto:"]') : null;
    if (!link) return;

    const mail = link.getAttribute('href').replace(/^mailto:/i, '').split('?')[0];

    // Show something immediately – the clipboard promise can stay pending
    // (e.g. when the window is not focused), and a bare mailto shows nothing.
    hint('✉️ ' + mail);
    copy(mail, function (ok) {
      if (ok) hint('📋 Kopiert: ' + mail);
    });
  });
})();
