/* Applies the saved theme before first paint (the CSP forbids inline scripts). */
(function () {
  try {
    var theme = window.localStorage.getItem('tangent.theme');
    if (theme === 'rainbow' || theme === 'breadbin' || theme === 'broadcast' || theme === 'cassette' || theme === 'mono' || theme === 'stripe' || theme === 'paper' || theme === 'desk' || theme === 'silver' || theme === 'blue') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  } catch (error) {
    /* Storage can be blocked; the default theme is used. */
  }
})();
