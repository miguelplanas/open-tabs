// Tema claro/oscuro: sigue al sistema hasta que la persona pulsa un botón
// [data-theme-toggle]. Se carga en <head> sin defer para que no parpadee el
// otro tema. El clic va delegado en document, así sirve también para botones
// que se pintan después (vistas hechas con JS); el texto del botón lo pone
// base.css según el tema.
(() => {
  const root = document.documentElement;
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
  } catch {}

  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-theme-toggle]')) return;
    const dark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch {}
  });
})();
