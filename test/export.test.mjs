import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';

const directory = mkdtempSync(join(tmpdir(), 'exports-'));
process.env.DB_PATH = join(directory, 'test.db');
const { collectionsRouter } = await import('../dist/collections.js');
const { collectionViews } = await import('../dist/collection-views.js');
const routesModule = await import('../dist/routes.js');
const routes = routesModule.default.default;
const { pageMarkdown, collectionMarkdown } = await import('../dist/export.js');
const database = await import('../dist/db.js');
const db = database.default.default;

test('exports preserve source, fence HTML, respect ordering, ownership and expiry', async () => {
  const app = express();
  app.use(express.json(), collectionsRouter, collectionViews, routes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const standaloneCases = [
      { type: 'markdown', content: '# Exact source\r\n\r\nUnicode café.  \r\n' },
      { type: 'markdoc', content: '{% callout %}\nOriginal source.\n{% /callout %}' },
      { type: 'html', content: '<script>alert(1)</script>\n````\n<p>café</p>' },
      { type: 'raw', contentType: 'image/svg+xml', content: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>Example</text></svg>').toString('base64') },
      { type: 'raw', contentType: 'application/xhtml+xml', content: Buffer.from('<html><body>Example</body></html>').toString('base64') },
      { type: 'raw', contentType: 'text/plain', content: Buffer.from('Not a Markdown artifact').toString('base64') },
    ];
    for (const input of standaloneCases) {
      const created = await fetch(`${base}/api/artifacts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      assert.equal(created.status, 201);
      const { id } = await created.json();
      const response = await fetch(`${base}/${id}/markdown`);
      if (input.contentType === 'text/plain') {
        assert.equal(response.status, 404);
      } else {
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /text\/plain; charset=utf-8/);
        assert.match(response.headers.get('content-security-policy'), /connect-src 'none'/);
        const source = input.type === 'raw' ? Buffer.from(input.content, 'base64').toString('utf8') : input.content;
        const expected = input.type === 'markdown' || input.type === 'markdoc' ? source
          : input.type === 'html' ? `\`\`\`\`\`html\n${source}\n\`\`\`\`\`\n` : `\`\`\`html\n${source}\n\`\`\`\n`;
        assert.equal(await response.text(), expected);
      }
      // Legacy artifacts expire through scheduled cleanup, not a read-time filter.
      db.prepare("UPDATE artifacts SET created_at = datetime('now', '-31 days') WHERE id = ?").run(id);
      database.deleteOldArtifacts.run();
      assert.equal((await fetch(`${base}/${id}/markdown`)).status, 404);
    }
    assert.equal((await fetch(`${base}/missing/markdown`)).status, 404);
    const pages = [
      { key: 'intro.md', title: 'Introduction', type: 'markdown', content: '# Original\n\nText.\n' },
      { key: 'notes', title: 'Notes', type: 'markdoc', content: '{% callout %}\nKeep this.\n{% /callout %}' },
      { key: 'demo.html', title: 'Demo', type: 'html', content: '<script>alert(1)</script>\n````\n<div>Example</div>' },
    ];
    const created = await fetch(`${base}/api/collections`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Guide', pages }) });
    assert.equal(created.status, 201);
    const collection = await created.json();
    const root = `${base}/c/${collection.id}`;
    const expected = collectionMarkdown(collection, collection.pages);
    assert.equal(collectionMarkdown(collection, [...collection.pages].reverse()), expected);
    assert.ok(expected.indexOf('## Introduction') < expected.indexOf('## Notes'));
    assert.ok(expected.includes('\n\n---\n\n'));
    for (const page of pages) assert.ok(expected.includes(`Key: ${page.key}\n\n`));
    assert.ok(!expected.includes(collection.editToken));
    for (const extension of ['md', 'txt']) {
      const response = await fetch(`${root}/export.${extension}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-disposition'), /attachment/);
      assert.match(response.headers.get('content-type'), extension === 'md' ? /text\/markdown/ : /text\/plain/);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(await response.text(), expected);
    }
    for (const page of collection.pages) {
      const response = await fetch(`${root}/p/${page.id}/markdown`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/plain/);
      assert.equal(await response.text(), page.type === 'html' ? '`````html\n' + page.content + '\n`````\n' : page.content);
    }
    assert.equal(pageMarkdown({ type: 'html', content: 'x\n' }), '```html\nx\n```\n');
    assert.equal((await fetch(`${base}/c/missing/export.md`)).status, 404);
    assert.equal((await fetch(`${base}/c/missing/p/${collection.pages[0].id}/markdown`)).status, 404);
    assert.equal((await fetch(`${root}/p/missing/markdown`)).status, 404);
    db.prepare("UPDATE collections SET expires_at = datetime('now', '-1 second') WHERE id = ?").run(collection.id);
    for (const path of ['export.md', 'export.txt', `p/${collection.pages[0].id}/markdown`]) {
      assert.equal((await fetch(`${root}/${path}`)).status, 404);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
