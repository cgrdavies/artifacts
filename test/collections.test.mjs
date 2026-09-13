import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { createHash } from 'node:crypto';

const directory = mkdtempSync(join(tmpdir(), 'collections-'));
process.env.DB_PATH = join(directory, 'test.db');
process.env.ARTIFACTS_URL = 'https://example.test';
const { collectionsRouter, findCollection, findPage, getPages } = await import('../dist/collections.js');
const database = await import('../dist/db.js');
const db = database.default.default;
const app = express();
app.use(express.json({ limit: '65mb' }), collectionsRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api/collections`;
const page = (key = 'intro.md', type = 'markdown') => ({ key, type, title: key, content: '# Page' });
async function request(method, path = '', body, token) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Host: 'attacker.test', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

test('collections: atomic replacement, validation, expiry and independent storage', async () => {
  try {
    db.prepare("INSERT INTO artifacts (id,type,content) VALUES ('legacy','markdown','old')").run();
    const created = await request('POST', '', { title: 'Guide', pages: [page(), page('design', 'markdoc'), { ...page('demo.html', 'html'), content: '<button>Hi</button>' }] });
    assert.equal(created.status, 201);
    const { editToken, ...c } = created.body;
    assert.match(editToken, /^[a-f0-9]{64}$/);
    const stored = db.prepare('SELECT edit_token_hash FROM collections WHERE id = ?').get(c.id).edit_token_hash;
    assert.equal(stored, createHash('sha256').update(editToken).digest('hex'));
    assert.notEqual(stored, editToken);
    assert.equal('edit_token_hash' in findCollection(c.id), false);
    assert.equal('editToken' in findCollection(c.id), false);
    assert.deepEqual((await request('GET', `/${c.id}`)).body, c);
    for (const token of [undefined, '0'.repeat(64), 'invalid']) {
      assert.equal((await request('PUT', `/${c.id}`, { title: 'Blocked', pages: [page()] }, token)).status, 403);
      assert.equal((await request('DELETE', `/${c.id}`, undefined, token)).status, 403);
      assert.deepEqual((await request('GET', `/${c.id}`)).body, c);
    }
    assert.equal(c.url, `https://example.test/c/${c.id}`);
    assert.equal(new Date(c.expiresAt) - new Date(c.createdAt), 30 * 86400000);
    assert.equal(new Set([c.id, ...c.pages.map(p => p.id)]).size, 4);
    assert.equal(c.pages[0].url, `${c.url}/p/${c.pages[0].id}`);
    assert.equal((await request('GET', `/${c.id}`)).body.pages[2].content, '<button>Hi</button>');
    const other = (await request('POST', '', { title: 'Other', pages: [page()] })).body;
    for (const id of [other.pages[0].id, 'missing']) {
      assert.equal((await request('PUT', `/${c.id}`, { title: 'Bad', pages: [{ ...page(), id }] }, editToken)).status, 400);
      assert.deepEqual((await request('GET', `/${c.id}`)).body, c);
    }
    const updated = await request('PUT', `/${c.id}`, { title: 'Revised', pages: [{ ...page('intro.md'), id: c.pages[1].id }, { ...page('design'), id: c.pages[0].id }, page('new')] }, editToken);
    assert.equal(updated.status, 200);
    assert.equal('editToken' in updated.body, false);
    assert.equal('edit_token_hash' in updated.body, false);
    assert.equal((await request('DELETE', `/${c.id}`, undefined, other.editToken)).status, 403);
    assert.equal(updated.body.expiresAt, c.expiresAt);
    assert.deepEqual(updated.body.pages.slice(0, 2).map(p => p.id), [c.pages[1].id, c.pages[0].id]);
    assert.equal(findPage(c.id, c.pages[2].id), null);
    assert.equal(findPage(other.id, c.pages[0].id), null);
    assert.equal(getPages(c.id).length, 3);
    const badPages = [[], Array.from({ length: 51 }, (_, i) => page(`p${i}`)), [page(), page()],
      ...['../intro.md', 'a/b', 'a\\b', '.', 'a\n', 'x'.repeat(101)].map(key => [page(key)]),
      [{ ...page(), type: 'raw' }], [{ ...page(), title: '' }], [{ ...page(), content: '{% unknown %}x{% /unknown %}' }],
      [{ ...page(), content: '[bad](//example.test)' }], [{ ...page(), id: c.pages[0].id }]];
    for (const pages of badPages) assert.equal((await request('POST', '', { title: 'Bad', pages })).status, 400, JSON.stringify(pages));
    assert.equal((await request('POST', '', { title: 'x'.repeat(201), pages: [page()] })).status, 400);
    assert.equal((await request('POST', '', { title: 'Big', pages: [{ ...page('big', 'html'), content: 'é'.repeat(5 * 1024 * 1024 + 1) }] })).status, 413);
    assert.equal(db.prepare('SELECT count(*) AS n FROM collections').get().n, 2);
    db.prepare("UPDATE collections SET expires_at = datetime('now', '-1 second') WHERE id = ?").run(c.id);
    assert.equal((await request('GET', `/${c.id}`)).status, 404);
    assert.equal((await request('PUT', `/${c.id}`, { title: 'No', pages: [page()] })).status, 404);
    assert.equal((await request('DELETE', `/${c.id}`, undefined, editToken)).status, 404);
    assert.equal((await request('PUT', '/missing', {}, editToken)).status, 404);
    assert.equal((await request('DELETE', '/missing')).status, 404);
    assert.equal(findCollection(c.id), null);
    assert.equal(findPage(c.id, c.pages[0].id), null);
    assert.deepEqual(getPages(c.id), []);
    database.deleteOldCollections.run();
    assert.equal(db.prepare('SELECT count(*) AS n FROM collection_pages WHERE collection_id = ?').get(c.id).n, 0);
    assert.equal((await request('DELETE', `/${other.id}`, undefined, other.editToken)).status, 204);
    assert.equal((await request('GET', `/${other.id}`)).status, 404);
    assert.equal(db.prepare('SELECT count(*) AS n FROM collection_pages').get().n, 0);
    assert.equal(db.prepare("SELECT content FROM artifacts WHERE id = 'legacy'").get().content, 'old');
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
