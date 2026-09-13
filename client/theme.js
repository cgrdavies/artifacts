// Small synchronous boot script: apply a saved choice before the page is drawn.
(() => {
  let preference = 'system';
  try { preference = localStorage.getItem('artifacts-theme') || 'system'; } catch {}
  const theme = ['light', 'dark'].includes(preference) ? preference : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
