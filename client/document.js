// Ordinary documents don't download the diagram renderer.
const diagrams = [...document.querySelectorAll('pre.mermaid')];
if (diagrams.length) {
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    maxTextSize: 50000,
    theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'neutral',
    themeVariables: { fontFamily: 'system-ui, sans-serif' },
    flowchart: { htmlLabels: false },
  });
  for (const diagram of diagrams) {
    const source = diagram.textContent;
    try {
      const { svg } = await mermaid.render('diagram-' + crypto.randomUUID(), source);
      const figure = document.createElement('figure');
      figure.className = 'diagram';
      figure.setAttribute('aria-label', 'Diagram');
      const canvas = document.createElement('div');
      canvas.className = 'diagram-canvas';
      canvas.tabIndex = 0;
      canvas.setAttribute('role', 'region');
      canvas.setAttribute('aria-label', 'Diagram; scroll sideways if needed');
      canvas.innerHTML = svg; // Mermaid strict mode sanitizes its SVG output.
      const drawing = canvas.querySelector('svg');
      const width = drawing?.viewBox.baseVal.width;
      if (width > 0) {
        drawing.style.width = width + 'px';
        drawing.style.maxWidth = 'none';
        drawing.style.height = 'auto';
      }
      const hint = document.createElement('p');
      hint.className = 'diagram-hint';
      hint.textContent = 'Scroll sideways to see the full diagram.';
      hint.hidden = true;
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'Diagram source';
      const pre = document.createElement('pre');
      pre.textContent = source;
      details.append(summary, pre);
      figure.append(canvas, hint, details);
      diagram.replaceWith(figure);
      new ResizeObserver(() => { hint.hidden = canvas.scrollWidth <= canvas.clientWidth + 1; }).observe(canvas);
    } catch {
      const note = document.createElement('p');
      note.className = 'diagram-error';
      note.textContent = 'This diagram could not be drawn. Its source is shown below.';
      diagram.before(note);
      diagram.textContent = source;
      diagram.classList.remove('mermaid');
    }
  }
}
