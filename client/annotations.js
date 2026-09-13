// Comments live outside saved content. Ownership keys stay in memory/storage and request headers.
const excluded = 'script,style,textarea,iframe,svg,.mermaid,.diagram,[data-diagram]';
const make = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
function textIndex(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.parentElement.closest(excluded) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const nodes = [];
  let text = '', node;
  while ((node = walker.nextNode())) {
    nodes.push({ node, start: text.length, end: text.length + node.length });
    text += node.data;
  }
  return { text, nodes };
}
function locate(index, comment) {
  const { quote, prefix = '', suffix = '' } = comment;
  if (!quote || quote.length > 3000) return null;
  let found = -1, from = 0;
  while (from <= index.text.length) {
    const at = index.text.indexOf(quote, from);
    if (at < 0) break;
    if (index.text.slice(Math.max(0, at - prefix.length), at) === prefix &&
        index.text.slice(at + quote.length, at + quote.length + suffix.length) === suffix) {
      if (found !== -1) return null;
      found = at;
    }
    from = at + 1;
  }
  if (found < 0) return null;
  const start = index.nodes.find(n => n.start <= found && n.end > found);
  const end = index.nodes.find(n => n.start < found + quote.length && n.end >= found + quote.length);
  if (!start || !end) return null;
  const range = document.createRange();
  range.setStart(start.node, found - start.start);
  range.setEnd(end.node, found + quote.length - end.start);
  // Never bridge excluded content (including a rendered diagram).
  if (range.toString() !== quote) return null;
  return range;
}
function initialize(article, number) {
  const api = new URL(article.dataset.commentsUrl, location.href);
  const markdown = new URL(article.dataset.commentsMarkdown, location.href);
  if (api.origin !== location.origin || markdown.origin !== location.origin) return;
  const content = article.querySelector('.document-content');
  const enabled = article.dataset.highlightEnabled === 'true' && content;
  const sourceHash = article.dataset.sourceHash;
  let key, ephemeral = false;
  try { key = localStorage.getItem('artifacts-comment-key'); } catch { ephemeral = true; }
  if (!/^[a-f0-9]{64}$/.test(key || '')) {
    key = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem('artifacts-comment-key', key); } catch { ephemeral = true; }
  }
  const section = make('section', undefined, 'annotations');
  const heading = make('h2', 'Comments');
  heading.id = `comments-heading-${number}`;
  section.setAttribute('aria-labelledby', heading.id);
  section.append(heading, make('p', 'Visible to anyone with this link. Author shown as user.', 'annotations-help'));
  if (ephemeral) section.append(make('p', 'Browser storage is unavailable. Your ability to edit or delete your comments may not persist after leaving this page.', 'annotations-warning'));
  const links = make('p');
  const link = make('a', 'Comments-only Markdown for agents');
  link.href = markdown.href;
  links.append(link);
  section.append(links);
  const instructions = make('p', enabled
    ? 'Select text to highlight it, or add a page note below. Notes on highlights are optional.'
    : 'Add a note about this page below. Text highlights are not available for HTML pages.', 'annotations-help');
  section.append(instructions);
  const selectionButton = make('button', 'Highlight / add note');
  selectionButton.type = 'button';
  selectionButton.disabled = true;
  selectionButton.hidden = true;
  selectionButton.className = 'annotations-selection-action';
  // Keep the selection intact until the click handler captures its quote.
  selectionButton.addEventListener('pointerdown', event => event.preventDefault());
  if (enabled) section.append(selectionButton);
  const form = make('form');
  const selectedQuote = make('blockquote');
  selectedQuote.hidden = true;
  const clear = make('button', 'Use page note instead');
  clear.type = 'button';
  clear.hidden = true;
  const label = make('label', 'Page note');
  const input = make('textarea');
  input.id = `comment-note-${number}`;
  input.rows = 4;
  input.required = true;
  label.htmlFor = input.id;
  const add = make('button', 'Add comment');
  add.type = 'submit';
  form.append(selectedQuote, clear, label, input, add);
  const status = make('p', 'Loading comments…', 'annotations-status');
  status.setAttribute('role', 'status');
  const retry = make('button', 'Reload comments', 'annotations-refresh');
  retry.type = 'button';
  const list = make('ol', undefined, 'annotations-list');
  section.append(form, status, retry, list);
  article.append(section);
  let comments = [], candidate = null, anchor = null, busy = false;
  const say = (message, error = false) => {
    status.textContent = message;
    status.classList.toggle('annotations-warning', error);
  };
  async function request(url, method = 'GET', body) {
    const response = await fetch(url, {
      method, credentials: 'omit', cache: 'no-store',
      headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const error = new Error('Request failed');
      if ([400, 409, 413, 422].includes(response.status)) {
        try {
          const payload = await response.json();
          const message = typeof payload.error === 'string' ? payload.error : payload.error?.message;
          if (typeof message === 'string' && message.length <= 500) error.publicMessage = message;
        } catch { /* Non-JSON errors use the generic message. */ }
      }
      throw error;
    }
    return method === 'GET' ? response.json() : null;
  }
  function drawHighlights() {
    const ranges = [];
    const index = enabled ? textIndex(content) : null;
    for (const comment of comments) {
      comment.matched = false;
      if (!index || comment.outdated || comment.sourceHash !== sourceHash) continue;
      const range = locate(index, comment);
      if (range) { ranges.push(range); comment.matched = true; }
    }
    if (globalThis.CSS?.highlights && globalThis.Highlight) {
      // The shared name allows one stylesheet rule for all document instances.
      const all = [...document.querySelectorAll('article.document')].flatMap(a => a === article ? ranges : (a._commentRanges || []));
      article._commentRanges = ranges;
      CSS.highlights.set('artifact-comments', new Highlight(...all));
    }
  }
  function render() {
    drawHighlights();
    heading.textContent = `Comments (${comments.length})`;
    list.replaceChildren();
    for (const comment of comments) {
      const item = make('li');
      const date = new Date(comment.createdAt);
      item.append(make('p', `user${Number.isNaN(date.getTime()) ? '' : ` · ${date.toLocaleString()}`}`, 'annotations-meta'));
      if (comment.quote) item.append(make('blockquote', comment.quote));
      if (comment.outdated || comment.sourceHash !== sourceHash) item.append(make('p', 'This comment refers to an older version of the page.', 'annotations-warning'));
      else if (comment.quote && !comment.matched) item.append(make('p', 'This quote could not be matched uniquely in the document.', 'annotations-help'));
      item.append(make('p', comment.note, 'annotations-note'));
      if (comment.canEdit) {
        const edit = make('button', 'Edit');
        const remove = make('button', 'Delete');
        edit.type = remove.type = 'button';
        edit.disabled = remove.disabled = busy;
        edit.addEventListener('click', () => {
          const editor = make('form');
          const field = make('textarea');
          field.value = comment.note;
          field.required = !comment.quote;
          field.setAttribute('aria-label', 'Edit your comment');
          const save = make('button', 'Save');
          save.type = 'submit';
          const cancel = make('button', 'Cancel');
          cancel.type = 'button';
          cancel.addEventListener('click', render);
          editor.append(field, save, cancel);
          edit.disabled = true;
          item.append(editor);
          field.focus();
          editor.addEventListener('submit', async event => {
            event.preventDefault();
            if ((!field.value.trim() && !comment.quote) || busy) return;
            save.disabled = cancel.disabled = field.disabled = true;
            await mutate(`${api.href}/${encodeURIComponent(comment.id)}`, 'PATCH', { note: field.value.trim() });
            save.disabled = cancel.disabled = field.disabled = false;
          });
        });
        remove.addEventListener('click', () => {
          if (!busy && window.confirm('Delete this comment?')) void mutate(`${api.href}/${encodeURIComponent(comment.id)}`, 'DELETE');
        });
        item.append(edit, remove);
      }
      list.append(item);
    }
  }
  async function load() {
    retry.disabled = true;
    try {
      const result = await request(api);
      if (!Array.isArray(result.comments)) throw new Error('Invalid response');
      comments = result.comments;
      render();
      say(comments.length ? '' : 'No comments yet.');
      return true;
    } catch (error) { say(error.publicMessage || 'Could not load comments. Use Reload comments to try again.', true); return false; }
    finally { retry.disabled = false; }
  }
  async function mutate(url, method, body, onSuccess) {
    if (busy) return;
    busy = true;
    add.disabled = true;
    section.querySelectorAll('.annotations-list button').forEach(button => { button.disabled = true; });
    say('Saving…');
    try {
      await request(url, method, body);
      onSuccess?.();
      busy = false;
      if (!await load()) say('Change saved, but comments could not reload. Reload comments; do not submit again.', true);
    } catch (error) {
      say(error.publicMessage || 'Could not confirm the change. Reload comments before trying again to avoid duplicates.', true);
    } finally {
      busy = false;
      add.disabled = false;
      section.querySelectorAll('.annotations-list button').forEach(button => { button.disabled = false; });
    }
  }
  function resetAnchor() {
    anchor = null;
    selectedQuote.hidden = clear.hidden = true;
    selectedQuote.textContent = '';
    label.textContent = 'Page note';
    input.required = true;
  }
  clear.addEventListener('click', resetAnchor);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (busy || (!input.value.trim() && !anchor?.quote)) return;
    void mutate(api, 'POST', { note: input.value.trim(), quote: anchor?.quote || '', prefix: anchor?.prefix || '', suffix: anchor?.suffix || '', sourceHash }, () => {
      input.value = '';
      resetAnchor();
    });
  });
  retry.addEventListener('click', () => { if (!busy) void load(); });
  if (enabled) {
    document.addEventListener('selectionchange', () => {
      try {
        const selection = window.getSelection();
        if ((!selection || selection.isCollapsed) && document.activeElement === selectionButton) return;
        candidate = null;
        selectionButton.disabled = true;
        selectionButton.hidden = true;
        if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return;
        const range = selection.getRangeAt(0);
        if (!content.contains(range.startContainer) || !content.contains(range.endContainer)) return;
        const quote = range.toString();
        if (!quote.trim() || quote.length > 3000) return;
        const index = textIndex(content);
        const parts = index.nodes.filter(n => range.intersectsNode(n.node));
        if (!parts.length) return;
        const first = parts[0];
        const start = first.start + (range.startContainer === first.node ? range.startOffset : 0);
        if (index.text.slice(start, start + quote.length) !== quote) return;
        candidate = { quote, prefix: index.text.slice(Math.max(0, start - 80), start), suffix: index.text.slice(start + quote.length, start + quote.length + 80) };
        selectionButton.disabled = false;
        selectionButton.hidden = false;
      } catch { candidate = null; selectionButton.disabled = true; selectionButton.hidden = true; }
    });
    selectionButton.addEventListener('click', () => {
      if (!candidate) return;
      anchor = { ...candidate };
      selectedQuote.textContent = anchor.quote;
      selectedQuote.hidden = clear.hidden = false;
      label.textContent = 'Note about selected text (optional)';
      input.required = false;
      candidate = null;
      selectionButton.hidden = true;
      selectionButton.disabled = true;
      window.getSelection()?.removeAllRanges();
      form.scrollIntoView({ block: 'center' });
      input.focus({ preventScroll: true });
    });
    // Mermaid may replace its source after this module initializes.
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => { scheduled = false; try { drawHighlights(); } catch { say('Could not restore text highlights.', true); } });
    }).observe(content, { childList: true, subtree: true, characterData: true });
  }
  void load();
}
for (const [number, article] of [...document.querySelectorAll('article.document[data-comments-url][data-comments-markdown][data-source-hash]')].entries()) {
  try { initialize(article, number); }
  catch {
    const message = make('p', 'Comments are unavailable in this browser.', 'annotations annotations-warning');
    article.append(message);
  }
}
