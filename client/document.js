const themeKey = 'artifacts-theme';
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
const themeControl = document.querySelector('#theme-preference');
let preference = 'system';
try {
  const saved = localStorage.getItem(themeKey);
  if (saved === 'light' || saved === 'dark') preference = saved;
} catch { /* Preferences still work for this page when storage is unavailable. */ }

let redraw = () => {};
function applyTheme() {
  const theme = preference === 'system' ? (systemTheme.matches ? 'dark' : 'light') : preference;
  const changed = document.documentElement.dataset.theme !== theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  if (themeControl) themeControl.value = preference;
  if (changed) redraw();
}
applyTheme();
themeControl?.addEventListener('change', () => {
  preference = ['light', 'dark'].includes(themeControl.value) ? themeControl.value : 'system';
  try {
    if (preference === 'system') localStorage.removeItem(themeKey);
    else localStorage.setItem(themeKey, preference);
  } catch { /* Keep the in-memory preference. */ }
  applyTheme();
});
systemTheme.addEventListener('change', () => { if (preference === 'system') applyTheme(); });
window.addEventListener('storage', event => {
  if (event.key !== themeKey && event.key !== null) return;
  try { if (event.storageArea && event.storageArea !== localStorage) return; } catch { return; }
  preference = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : 'system';
  applyTheme();
});

// Ordinary documents don't download the diagram renderer.
const diagrams = [...document.querySelectorAll('pre.mermaid')].map(node => ({
  node, source: node.textContent, figure: null, observer: null, note: null,
}));
if (diagrams.length) {
  const { default: mermaid } = await import('mermaid');
  let requested = 0;
  let running = false;
  redraw = async () => {
    requested++;
    if (running) return;
    running = true;
    try {
      let rendered = 0;
      while (rendered !== requested) {
        const revision = requested;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          suppressErrorRendering: true,
          maxTextSize: 50000,
          theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'neutral',
          themeVariables: { fontFamily: 'system-ui, sans-serif' },
          flowchart: { htmlLabels: false },
        });
        for (const diagram of diagrams) {
          if (revision !== requested) break;
          try {
            const { svg } = await mermaid.render('diagram-' + crypto.randomUUID(), diagram.source);
            if (revision !== requested) break;
            if (!diagram.figure) {
              const figure = document.createElement('figure');
              figure.className = 'diagram';
              figure.setAttribute('aria-label', 'Diagram');
              const canvas = document.createElement('div');
              canvas.className = 'diagram-canvas';
              canvas.tabIndex = 0;
              canvas.setAttribute('role', 'region');
              canvas.setAttribute('aria-label', 'Diagram; scroll sideways if needed');
              const hint = document.createElement('p');
              hint.className = 'diagram-hint';
              hint.textContent = 'Scroll sideways to see the full diagram.';
              hint.hidden = true;
              const details = document.createElement('details');
              const summary = document.createElement('summary');
              summary.textContent = 'Diagram source';
              const pre = document.createElement('pre');
              pre.textContent = diagram.source;
              details.append(summary, pre);
              figure.append(canvas, hint, details);
              diagram.node.replaceWith(figure);
              diagram.note?.remove();
              Object.assign(diagram, { figure, canvas, hint });
              // One observer per persistent canvas, not one per theme change.
              diagram.observer = new ResizeObserver(() => {
                hint.hidden = canvas.scrollWidth <= canvas.clientWidth + 1;
              });
              diagram.observer.observe(canvas);
            }
            diagram.canvas.innerHTML = svg; // Mermaid strict mode sanitizes its SVG output.
            const drawing = diagram.canvas.querySelector('svg');
            const width = drawing?.viewBox.baseVal.width;
            if (width > 0) {
              drawing.style.width = width + 'px';
              drawing.style.maxWidth = 'none';
              drawing.style.height = 'auto';
            }
            diagram.hint.hidden = diagram.canvas.scrollWidth <= diagram.canvas.clientWidth + 1;
          } catch {
            if (!diagram.figure && !diagram.note) {
              diagram.note = document.createElement('p');
              diagram.note.className = 'diagram-error';
              diagram.note.textContent = 'This diagram could not be drawn. Its source is shown below.';
              diagram.node.before(diagram.note);
              diagram.node.textContent = diagram.source;
              diagram.node.classList.remove('mermaid');
            }
          }
        }
        rendered = revision;
      }
    } finally { running = false; }
  };
  void redraw();
}
