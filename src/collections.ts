import { Router } from "express";
import { randomUUID, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import db from "./db";
import { renderDocument } from "./render";

export interface Collection {
  id: string;
  title: string;
  created_at: string;
  expires_at: string;
}
export interface CollectionPage {
  id: string;
  collection_id: string;
  key: string;
  title: string;
  type: "markdown" | "markdoc" | "html";
  /** Original UTF-8 source, including for HTML (not base64). */
  content: string;
  position: number;
}

const configured = new URL(process.env.ARTIFACTS_URL || "http://localhost:3000");
if (!["http:", "https:"].includes(configured.protocol) || configured.username || configured.password || configured.search || configured.hash) {
  throw new Error("ARTIFACTS_URL must be an HTTP or HTTPS address without credentials, a query or a fragment.");
}
const BASE_URL = configured.href.replace(/\/$/, "");
const active = "julianday(expires_at) > julianday('now')";
const selectCollection = db.prepare(`SELECT id, title, created_at, expires_at FROM collections WHERE id = ? AND ${active}`);
const selectPages = db.prepare(`SELECT p.* FROM collection_pages p JOIN collections c ON c.id = p.collection_id WHERE c.id = ? AND ${active} ORDER BY p.position`);
const selectPage = db.prepare(`SELECT p.* FROM collection_pages p JOIN collections c ON c.id = p.collection_id WHERE c.id = ? AND p.id = ? AND ${active}`);
export function findCollection(id: string): Collection | null {
  return (selectCollection.get(id) as Collection | undefined) ?? null;
}
export function findPage(collectionId: string, pageId: string): CollectionPage | null {
  return (selectPage.get(collectionId, pageId) as CollectionPage | undefined) ?? null;
}
export function getPages(collectionId: string): CollectionPage[] {
  return selectPages.all(collectionId) as CollectionPage[];
}

class InputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const tokenHash = (token: string) => createHash("sha256").update(token).digest();
function canEdit(id: string, authorization: string | undefined): boolean {
  const match = /^Bearer ([a-f0-9]{64})$/i.exec(authorization ?? "");
  if (!match) return false;
  const row = db.prepare("SELECT edit_token_hash FROM collections WHERE id = ?").get(id) as { edit_token_hash: string } | undefined;
  if (!row) return false;
  const expected = Buffer.from(row.edit_token_hash, "hex");
  const supplied = tokenHash(match[1]);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
type PageInput = Pick<CollectionPage, "key" | "title" | "type" | "content"> & { id?: string };
function validTitle(value: unknown): value is string {
  return typeof value === "string" && !!value.trim() && value.length <= 200;
}
function validate(body: unknown, replacing: boolean): { title: string; pages: PageInput[] } {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("Send a JSON object.");
  const { title, pages } = body as Record<string, unknown>;
  if (!validTitle(title)) throw new InputError("Titles must contain 1 to 200 characters.");
  if (!Array.isArray(pages) || pages.length < 1 || pages.length > 50) throw new InputError("Send between 1 and 50 pages.");
  const keys = new Set<string>();
  const ids = new Set<string>();
  let size = 0;
  const checked = pages.map((page: unknown): PageInput => {
    if (!page || typeof page !== "object" || Array.isArray(page)) throw new InputError("Each page must be an object.");
    const { id, key, title, type, content } = page as Record<string, unknown>;
    if (typeof key !== "string" || key.length > 100 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(key) || /[^A-Za-z0-9._-]/.test(key) || key.includes("..")) throw new InputError("Use a plain filename or slug of at most 100 characters for each key.");
    if (keys.has(key)) throw new InputError("Page keys must be unique.");
    keys.add(key);
    if (!validTitle(title)) throw new InputError("Titles must contain 1 to 200 characters.");
    if (type !== "markdown" && type !== "markdoc" && type !== "html") throw new InputError("Page type must be markdown, markdoc or html.");
    if (typeof content !== "string" || !content.trim()) throw new InputError("Page content must be a non-empty string.");
    size += Buffer.byteLength(content, "utf8");
    if (size > 10 * 1024 * 1024) throw new InputError("Collection content exceeds the 10 MiB limit.", 413);
    if (id !== undefined) {
      if (!replacing || typeof id !== "string" || ids.has(id)) throw new InputError("Supply each existing page ID only once when replacing a collection.");
      ids.add(id);
    }
    return { ...(id !== undefined ? { id: id as string } : {}), key, title, type, content };
  });
  // Check the total size before parsing any documents. No writes precede validation.
  for (const page of checked) {
    if (page.type !== "html") {
      try { renderDocument(page.content, href => {
        if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(href)) return href;
        const match = /^(?:\.\/)?([^/?#]+)([?#].*)?$/.exec(href);
        if (!match || !keys.has(decodeURIComponent(match[1]))) throw new Error('Relative links must name a page in this collection.');
        return href;
      }); }
      catch { throw new InputError("The document has unsupported markup. Check its tags and links."); }
    }
  }
  return { title, pages: checked };
}
const insertPage = db.prepare("INSERT INTO collection_pages (id, collection_id, key, title, type, content, position) VALUES (?, ?, ?, ?, ?, ?, ?)");
function writePages(id: string, pages: PageInput[]) {
  pages.forEach((page, position) => insertPage.run(page.id ?? randomUUID(), id, page.key, page.title, page.type, page.content, position));
}
function response(collection: Collection) {
  const url = `${BASE_URL}/c/${collection.id}`;
  return { id: collection.id, title: collection.title, url, collectionUrl: url,
    createdAt: collection.created_at, expiresAt: collection.expires_at,
    pages: getPages(collection.id).map(page => ({ id: page.id, key: page.key, title: page.title, type: page.type, content: page.content, position: page.position, url: `${url}/p/${page.id}` })) };
}

/** API routes only; mount before any catch-all artifact routes. */
export const collectionsRouter = Router();
collectionsRouter.post("/api/collections", (req, res, next) => {
  try {
    const input = validate(req.body, false);
    const editToken = randomBytes(32).toString("hex");
    const collection = db.transaction(() => {
      const now = Date.now();
      const collection: Collection = { id: randomUUID(), title: input.title, created_at: new Date(now).toISOString(), expires_at: new Date(now + 30 * 86400000).toISOString() };
      db.prepare("INSERT INTO collections (id, title, created_at, expires_at, edit_token_hash) VALUES (?, ?, ?, ?, ?)").run(collection.id, collection.title, collection.created_at, collection.expires_at, tokenHash(editToken).toString("hex"));
      writePages(collection.id, input.pages);
      return collection;
    })();
    res.status(201).json({ ...response(collection), editToken });
  } catch (error) {
    if (error instanceof InputError) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});
collectionsRouter.put("/api/collections/:id", (req, res, next) => {
  try {
    if (!findCollection(req.params.id)) return res.status(404).json({ error: "Not found." });
    if (!canEdit(req.params.id, req.get("Authorization"))) return res.status(403).json({ error: "A valid edit token is required." });
    const input = validate(req.body, true);
    const collection = db.transaction(() => {
      const current = findCollection(req.params.id);
      if (!current) throw new InputError("Not found.", 404);
      const owned = new Set(getPages(current.id).map(page => page.id));
      if (input.pages.some(page => page.id !== undefined && !owned.has(page.id))) throw new InputError("A supplied page ID does not belong to this collection.");
      db.prepare("UPDATE collections SET title = ? WHERE id = ?").run(input.title, current.id);
      // Move existing keys and positions out of the input namespace before swaps.
      // Temporary keys contain ':' (not allowed in client keys).
      const existing = getPages(current.id);
      const offset = Math.max(0, ...existing.map(page => page.position)) + input.pages.length + 1;
      const stage = db.prepare("UPDATE collection_pages SET key = ?, position = ? WHERE id = ?");
      existing.forEach((page, index) => stage.run(`:staged:${page.id}`, offset + index, page.id));
      const retained = new Set(input.pages.map(page => page.id));
      for (const page of existing) {
        if (!retained.has(page.id)) db.prepare("DELETE FROM collection_pages WHERE id = ?").run(page.id);
      }
      const update = db.prepare("UPDATE collection_pages SET key = ?, title = ?, type = ?, content = ?, position = ? WHERE id = ?");
      input.pages.forEach((page, position) => {
        if (page.id) update.run(page.key, page.title, page.type, page.content, position, page.id);
        else insertPage.run(randomUUID(), current.id, page.key, page.title, page.type, page.content, position);
      });
      return { ...current, title: input.title };
    })();
    res.json(response(collection));
  } catch (error) {
    if (error instanceof InputError) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});
collectionsRouter.get("/api/collections/:id", (req, res) => {
  const collection = findCollection(req.params.id);
  if (!collection) return res.status(404).json({ error: "Not found." });
  res.json(response(collection));
});
collectionsRouter.delete("/api/collections/:id", (req, res) => {
  if (!findCollection(req.params.id)) return res.status(404).json({ error: "Not found." });
  if (!canEdit(req.params.id, req.get("Authorization"))) return res.status(403).json({ error: "A valid edit token is required." });
  db.prepare("DELETE FROM collections WHERE id = ?").run(req.params.id);
  res.status(204).send();
});
