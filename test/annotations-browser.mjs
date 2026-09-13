// Real annotation browser checks. Parent builds dist first and runs this with Node 20.
// All writes stay in a temporary SQLite database and loopback app.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';

assert.equal(process.versions.node.split('.')[0], '20', 'Run with Node 20 (fnm exec --using 20.19.6)');
const require = createRequire(import.meta.url);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-annotations-browser-'));
const out = path.resolve('test-results');
fs.mkdirSync(out, {recursive: true});
process.env.DB_PATH = path.join(dir, 'db.sqlite');
let app, db, browser;
const server = http.createServer((req, res) => app ? app(req, res) : res.end());
const report = {checks: []};
let base;
async function json(endpoint, body) {
  const response = await fetch(base + endpoint, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
  assert.equal(response.status, 201, 'Fixture creation succeeds');
  return response.json();
}
async function text(url) {
  const response = await fetch(url);
  assert.equal(response.status, 200, new URL(url).pathname);
  return response.text();
}
async function selectText(page, quote) {
  await page.locator('.document-content').evaluate((root, quote) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const start = node.textContent.indexOf(quote);
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + quote.length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      root.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
      return;
    }
    throw Error('Fixture quote was not rendered');
  }, quote);
}
async function fits(page, filename) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No page-wide overflow');
  await page.screenshot({path: path.join(out, filename), fullPage: true});
}

try {
  server.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {server.once('listening', resolve); server.once('error', reject);});
  base = 'http://127.0.0.1:' + server.address().port;
  process.env.ARTIFACTS_URL = base;
  app = require('../dist/app.js').createApp();
  db = require('../dist/db.js').default;
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({headless: true, ...(fs.existsSync(chrome) ? {executablePath: chrome} : {})});
  const context = await browser.newContext({viewport: {width: 1200, height: 900}});
  await context.addInitScript(() => {
    window.__copiedComments = null;
    Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {async writeText(value) {window.__copiedComments = value;}}});
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const quote = 'A selected sentence survives refresh.';
  const source = '# Annotation fixture\n\n' + quote + '\n\nThe original source stays unchanged.\n';
  const artifact = await json('/api/artifacts', {type: 'markdown', content: source});
  const collection = await json('/api/collections', {title: 'Annotation collection', pages: [{key: 'start.md', title: 'Start', type: 'markdown', content: source}]});
  const html = await json('/api/artifacts', {type: 'html', content: '<!doctype html><html><body><p id="inside">Private iframe text</p><script>try { parent.document.body.dataset.frameEscaped = "yes"; } catch { document.body.dataset.isolated = "yes"; }</script></body></html>'});
  async function ready(url) {
    await page.goto(url);
    await page.locator('.annotations h2').filter({hasText: /^Comments \(\d+\)$/}).waitFor();
  }
  async function addNote(note, selected = false) {
    if (selected) {
      await selectText(page, quote);
      await page.getByRole('button', {name: 'Highlight / add note', exact: true}).click();
    }
    await page.getByLabel(selected ? 'Note about selected text (optional)' : 'Page note', {exact: true}).fill(note);
    await page.getByRole('button', {name: 'Add comment', exact: true}).click();
    await page.locator('.annotations-note').filter({hasText: note}).waitFor();
  }
  async function highlightCount(count) {
    await page.waitForFunction(count => CSS.highlights.get('artifact-comments')?.size === count, count);
  }
  // A separate fixture keeps highlight-only coverage independent of note counts below.
  const highlightOnly = await json('/api/artifacts', {type: 'markdown', content: source});
  await ready(highlightOnly.url);
  const selectionAction = page.locator('.annotations-selection-action');
  assert.equal(await selectionAction.isVisible(), false, 'Contextual action starts hidden');
  await selectText(page, quote);
  await selectionAction.waitFor({state: 'visible'});
  await selectionAction.focus();
  await page.keyboard.press('Enter');
  const optionalNote = page.getByLabel('Note about selected text (optional)', {exact: true});
  await optionalNote.waitFor();
  assert.equal(await optionalNote.evaluate(input => input === document.activeElement), true, 'Keyboard activation focuses the optional note');
  assert.equal(await optionalNote.evaluate(input => input.required), false);
  assert.equal(await optionalNote.inputValue(), '');
  assert.equal(await selectionAction.isVisible(), false, 'Capturing the selection hides the contextual action');
  await page.getByRole('button', {name: 'Add comment', exact: true}).click();
  await page.locator('.annotations h2').filter({hasText: 'Comments (1)'}).waitFor();
  await highlightCount(1);
  await ready(highlightOnly.url);
  await highlightCount(1);
  assert.equal(await page.locator('.annotations-list blockquote').textContent(), quote);
  assert.equal(await page.locator('.annotations-note').textContent(), '');
  const highlightAPI = await page.locator('article.document').getAttribute('data-comments-url');
  const savedHighlights = JSON.parse(await text(new URL(highlightAPI, base).href)).comments;
  assert.equal(savedHighlights.length, 1);
  assert.equal(savedHighlights[0].quote, quote);
  assert.equal(savedHighlights[0].note, '');
  assert.match(await text(highlightOnly.url + '/comments.md'), /Highlight only; no note added\./);
  report.checks.push('Contextual selection action supports keyboard Enter; an empty optional note saves a highlight and survives reload/API/export');

  const note = 'Please revisit this user note.';
  await ready(artifact.url);
  const renderedText = await page.locator('.document-content').textContent();
  await addNote(note, true);
  await highlightCount(1);
  await ready(artifact.url);
  await page.locator('.annotations-note').filter({hasText: note}).waitFor();
  await highlightCount(1);
  assert.equal(await page.locator('.document-content').textContent(), renderedText);
  assert.equal(await page.locator('.document-content mark').count(), 0, 'CSS highlights do not wrap or rewrite saved text');
  report.checks.push('Range selection, note save, reload persistence, and CSS highlight restoration');

  const hostileNote = '<img src=x onerror="window.__noteExecuted=1"><script>window.__noteExecuted=1</script> ' + 'longword'.repeat(60);
  await addNote(hostileNote);
  assert.equal(await page.locator('.annotations-note').last().textContent(), hostileNote);
  assert.equal(await page.locator('.annotations script, .annotations img').count(), 0);
  assert.equal(await page.evaluate(() => window.__noteExecuted), undefined);
  const ownerKey = await page.evaluate(() => localStorage.getItem('artifacts-comment-key'));
  assert.match(ownerKey, /^[a-f0-9]{64}$/);
  const apiURL = base + '/api/artifacts/' + new URL(artifact.url).pathname.slice(1) + '/comments';
  const publicJSON = await text(apiURL);
  const publicNotes = JSON.parse(publicJSON).comments;
  assert.equal(publicNotes.length, 2);
  assert.ok(publicNotes.every(comment => comment.author === 'user' && comment.canEdit === false));
  assert.ok(publicNotes.some(comment => comment.note === hostileNote));
  assert.ok(!publicJSON.includes(ownerKey));
  assert.doesNotMatch(publicJSON, /owner_token|ownerToken|editToken/);
  for (const suffix of ['/markdown', '/download', '/comments.md']) {
    const exported = await text(artifact.url + suffix);
    assert.ok(exported.includes(note), suffix + ' includes user notes');
    assert.ok(!exported.includes(ownerKey), suffix + ' does not disclose the browser key');
  }
  assert.equal(await text(artifact.url + '/content'), source);
  const commentsOnly = await text(artifact.url + '/comments.md');
  assert.ok(!commentsOnly.includes('The original source stays unchanged.'), 'Comments-only export omits the document body');
  assert.equal(await page.getByRole('link', {name: 'Comments-only Markdown for agents', exact: true}).getAttribute('href'), artifact.url + '/comments.md');
  await page.getByRole('button', {name: 'Copy page as Markdown', exact: true}).click();
  await page.waitForFunction(() => window.__copiedComments !== null);
  assert.equal(await page.evaluate(() => window.__copiedComments), await text(artifact.url + '/markdown'));
  report.checks.push('Notes remain inert text; public API and exports expose notes without ownership keys; original content unchanged; copy-page clipboard matches annotated Markdown; comments-only URL is correct');

  for (const viewport of [{width: 1200, height: 900}, {width: 390, height: 844}]) {
    await page.setViewportSize(viewport);
    await fits(page, `annotations-${viewport.width}.png`);
  }
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await other.goto(artifact.url);
  await other.locator('.annotations-note').filter({hasText: note}).waitFor();
  assert.equal(await other.locator('.annotations-list').getByRole('button', {name: 'Edit', exact: true}).count(), 0);
  assert.equal(await other.locator('.annotations-list').getByRole('button', {name: 'Delete', exact: true}).count(), 0);
  const forbidden = await other.evaluate(async ({url, id}) => {
    const response = await fetch(url + '/' + id, {method: 'PATCH', headers: {'content-type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('artifacts-comment-key')}, body: JSON.stringify({note: 'Not mine'})});
    return response.status;
  }, {url: apiURL, id: publicNotes[0].id});
  assert.equal(forbidden, 403);
  await otherContext.close();
  const ownItem = page.locator('.annotations-list > li').filter({has: page.locator('.annotations-note').filter({hasText: note})});
  await ownItem.getByRole('button', {name: 'Edit', exact: true}).click();
  const edited = 'Updated user note.';
  await ownItem.getByLabel('Edit your comment', {exact: true}).fill(edited);
  await ownItem.getByRole('button', {name: 'Save', exact: true}).click();
  await page.locator('.annotations-note').filter({hasText: edited}).waitFor();
  await ready(artifact.url);
  const editedItem = page.locator('.annotations-list > li').filter({has: page.locator('.annotations-note').filter({hasText: edited})});
  await editedItem.waitFor();
  page.once('dialog', dialog => dialog.accept());
  await editedItem.getByRole('button', {name: 'Delete', exact: true}).click();
  await editedItem.waitFor({state: 'detached'});
  await ready(artifact.url);
  assert.equal(await page.locator('.annotations-note').count(), 1);
  await highlightCount(0);
  report.checks.push('Desktop/mobile screenshots and overflow; second browser reads but cannot edit; owner edits/deletes persist');

  await ready(collection.pages[0].url);
  await addNote(note, true);
  await highlightCount(1);
  assert.ok((await text(collection.url + '/export.md')).includes(note));
  const changedSource = source + '\nA later source revision.\n';
  const replacement = await fetch(base + '/api/collections/' + collection.id, {method: 'PUT', headers: {'content-type': 'application/json', Authorization: 'Bearer ' + collection.editToken}, body: JSON.stringify({title: collection.title, pages: [{id: collection.pages[0].id, key: 'start.md', title: 'Start', type: 'markdown', content: changedSource}]})});
  assert.equal(replacement.status, 200);
  await ready(collection.pages[0].url);
  await page.locator('.annotations-note').filter({hasText: note}).waitFor();
  await page.getByText('This comment refers to an older version of the page.', {exact: true}).waitFor();
  await highlightCount(0);
  const stale = JSON.parse(await text(base + '/api/collections/' + collection.id + '/pages/' + collection.pages[0].id + '/comments')).comments;
  assert.equal(stale[0].outdated, true);
  report.checks.push('Collection export includes notes; changing source through API retains comments as outdated without highlights');

  const unavailable = await browser.newContext({viewport: {width: 390, height: 844}});
  await unavailable.addInitScript(() => {
    for (const name of ['getItem', 'setItem', 'removeItem']) Object.defineProperty(Storage.prototype, name, {value() {throw Error('Disabled');}});
  });
  const blocked = await unavailable.newPage();
  await blocked.goto(artifact.url);
  await blocked.getByText(/Browser storage is unavailable/).waitFor();
  await blocked.getByLabel('Page note', {exact: true}).fill('Temporary browser note');
  await blocked.getByRole('button', {name: 'Add comment', exact: true}).click();
  await blocked.locator('.annotations-note').filter({hasText: 'Temporary browser note'}).waitFor();
  await fits(blocked, 'annotations-storage-unavailable.png');
  await unavailable.close();
  await ready(html.url);
  assert.equal(await page.getByRole('button', {name: 'Highlight / add note', exact: true}).count(), 0);
  await page.getByText('Add a note about this page below. Text highlights are not available for HTML pages.', {exact: true}).waitFor();
  await page.frameLocator('iframe').locator('body[data-isolated="yes"]').waitFor();
  assert.equal(await page.evaluate(() => document.body.dataset.frameEscaped), undefined);
  assert.equal(await page.locator('iframe').evaluate(frame => {try {return frame.contentWindow.document.body.textContent;} catch {return null;}}), null, 'Parent cannot read the HTML frame document');
  await addNote('A page-level HTML note.');
  await ready(html.url);
  await page.locator('.annotations-note').filter({hasText: 'A page-level HTML note.'}).waitFor();
  const htmlAPI = page.locator('article.document').getAttribute('data-comments-url');
  const htmlNotes = JSON.parse(await text(new URL(await htmlAPI, base).href)).comments;
  assert.equal(htmlNotes[0].quote, '');
  await fits(page, 'annotations-html-mobile.png');
  assert.deepEqual(errors, []);
  report.checks.push('Blocked storage warns but allows a page-session note; HTML supports only page notes and retains cross-origin iframe isolation');

  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL';
  report.error = error.stack;
} finally {
  await browser?.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  db?.close();
  fs.rmSync(dir, {recursive: true, force: true});
  fs.writeFileSync(path.join(out, 'annotations-browser-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.result === 'PASS' ? 0 : 1;
}
