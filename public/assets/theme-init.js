/* Applies the saved theme before first paint (the CSP forbids inline scripts). */
(function () {
  try {
    var theme = window.localStorage.getItem('tangent.theme');
    if (theme === 'rainbow' || theme === 'breadbin') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  } catch (error) {
    /* Storage can be blocked; the default theme is used. */
  }
})();
