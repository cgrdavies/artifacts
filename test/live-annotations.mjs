// One temporary comment on an existing harmless test page. Never changes its source.
// PAGE_URL must be a disposable/example page; the test deletes only its own comment.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
const url = new URL(process.env.PAGE_URL || '');
assert.ok(['http:', 'https:'].includes(url.protocol));
const note = `Temporary annotation verification ${randomUUID()}`;
const report = { checks: [] };
const receipt = `test-results/live-annotation-${randomUUID()}.private.json`;
let browser, api, key;
async function get(address, headers = {}) {
  const r = await fetch(address, { headers, redirect: 'error', signal: AbortSignal.timeout(20000) });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('x-robots-tag') || '', /noindex/);
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  return r;
}
try {
  const caps = await (await get(url.origin + '/api/capabilities')).json();
  assert.equal(caps.annotations.version, 1);
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ headless: true, ...(fs.existsSync(chrome) ? { executablePath: chrome } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(url.href);
  await page.locator('.annotations').waitFor();
  api = new URL(await page.locator('article.document').getAttribute('data-comments-url'), url.origin);
  assert.equal(api.origin, url.origin);
  key = await page.evaluate(() => localStorage.getItem('artifacts-comment-key'));
  assert.match(key, /^[a-f0-9]{64}$/);
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync(receipt, JSON.stringify({ api: api.href, key, note }), { mode: 0o600 });
  const original = await (await get(url.href + '/content')).text();
  const quote = await page.locator('.document-content h1').first().textContent();
  await page.locator('.document-content h1').first().evaluate(node => {
    const range = document.createRange(); range.selectNodeContents(node);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  await page.getByRole('button', { name: 'Highlight / add note', exact: true }).click();
  await page.getByLabel('Note about selected text (optional)', { exact: true }).fill(note);
  const posted = page.waitForResponse(r => r.url() === api.href && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  assert.equal((await posted).status(), 201);
  await page.locator('.annotations-list').getByText(note, { exact: true }).waitFor();
  await page.reload();
  await page.locator('.annotations-list').getByText(note, { exact: true }).waitFor();
  assert.ok(await page.evaluate(() => CSS.highlights.get('artifact-comments')?.size > 0));
  const publicData = await (await get(api.href)).json();
  const comment = publicData.comments.find(c => c.note === note);
  assert.ok(comment); assert.equal(comment.author, 'user'); assert.equal(comment.quote, quote); assert.equal(comment.canEdit, false);
  assert.ok(!JSON.stringify(publicData).includes(key));
  for (const suffix of ['/comments.md', '/markdown', '/download']) {
    const text = await (await get(url.href + suffix)).text();
    assert.ok(text.includes(note)); assert.ok(text.includes(quote)); assert.ok(text.includes('User-added context')); assert.ok(!text.includes(key));
  }
  assert.equal(await (await get(url.href + '/content')).text(), original);
  assert.equal(await (await get(url.href + '/download?source=1')).text(), original);
  const collectionRoot = url.href.match(/^(.*\/c\/[^/]+)\/p\/[^/]+$/)?.[1];
  if (collectionRoot) {
    for (const suffix of ['/export.md', '/export.txt', '/comments.md']) assert.ok((await (await get(collectionRoot + suffix)).text()).includes(note));
    const id = new URL(collectionRoot).pathname.split('/').at(-1);
    assert.ok(JSON.stringify(await (await get(url.origin + '/api/collections/' + id + '/comments')).json()).includes(note));
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  // Do not include the real page or any existing comments in a public report/screenshot.
  report.checks.push('live mobile highlight and note save; reload persistence; public comments JSON/Markdown; annotated page/collection downloads; unchanged original source; no owner key in public responses');
  report.result = 'PASS';
} catch (error) { report.result = 'FAIL'; report.error = error.message; process.exitCode = 1; }
finally {
  if (api && key) {
    try {
      const owned = await (await get(api.href, { Authorization: `Bearer ${key}` })).json();
      for (const comment of owned.comments.filter(c => c.note === note && c.canEdit)) {
        const response = await fetch(api.href + '/' + encodeURIComponent(comment.id), { method: 'DELETE', headers: { Authorization: `Bearer ${key}` }, redirect: 'error', signal: AbortSignal.timeout(20000) });
        assert.equal(response.status, 204);
      }
      const after = await (await get(api.href)).json();
      assert.ok(!after.comments.some(c => c.note === note));
      fs.rmSync(receipt, { force: true });
      report.checks.push('temporary owned comment removed; existing comments and source left untouched');
    } catch { report.result = 'FAIL'; report.cleanupFailed = true; report.privateCleanupReceipt = receipt; process.exitCode = 1; }
  }
  await browser?.close();
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/live-annotations.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
