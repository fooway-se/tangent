/* Applies the saved theme before first paint (the CSP forbids inline scripts). */
(function () {
  try {
    var url = new URL(window.location.href);
    if (url.searchParams.has('password')) {
      url.searchParams.delete('password');
      url.searchParams.delete('email');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  } catch (error) {
    /* URL cleanup must not prevent the saved theme from applying. */
  }

  try {
    var theme = window.localStorage.getItem('tangent.theme');
    if (theme === 'rainbow' || theme === 'breadbin' || theme === 'broadcast' || theme === 'cassette' || theme === 'mono' || theme === 'stripe' || theme === 'paper' || theme === 'desk' || theme === 'silver' || theme === 'blue' || theme === 'cartridge' || theme === 'nordic' || theme === 'desktop' || theme === 'copper' || theme === 'altair' || theme === 'atari-st' || theme === 'x68000' || theme === 'clean' || theme === 'clean-dark') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  } catch (error) {
    /* Storage can be blocked; the default theme is used. */
  }
})();
