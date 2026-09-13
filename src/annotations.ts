import { Router, Request } from "express";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import db, { Artifact } from "./db";

export type AnnotationTarget = { artifactId?: string; collectionId?: string; pageId?: string };
export interface Comment {
  id: string; author: "user"; note: string; quote: string; prefix: string; suffix: string;
  sourceHash: string; createdAt: string; updatedAt: string; outdated: boolean; canEdit: boolean;
}
interface Row {
  id: string; owner_token_hash: string; note: string; quote: string; prefix: string; suffix: string;
  source_hash: string; created_at: string; updated_at: string;
}
export class AnnotationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const getSourceHash = (content: string): string => createHash("sha256").update(content, "utf8").digest("hex");
function resolve(target: AnnotationTarget): { column: "artifact_id" | "page_id"; id: string; sourceHash: string } {
  if (target.artifactId && !target.collectionId && !target.pageId) {
    const artifact = db.prepare("SELECT * FROM artifacts WHERE id = ? AND julianday(created_at) > julianday('now', '-30 days')").get(target.artifactId) as Artifact | undefined;
    if (!artifact) throw new AnnotationError("Not found.", 404);
    if (artifact.type !== "markdown" && !/^(?:text\/html|application\/xhtml\+xml|image\/svg\+xml)(?:;|$)/i.test(artifact.content_type)) throw new AnnotationError("This file does not support comments.", 415);
    const content = artifact.type === "markdown" ? artifact.content : Buffer.from(artifact.content, "base64").toString("utf8");
    return { column: "artifact_id", id: artifact.id, sourceHash: getSourceHash(content) };
  }
  if (!target.artifactId && target.collectionId && target.pageId) {
    const page = db.prepare("SELECT p.content FROM collection_pages p JOIN collections c ON c.id = p.collection_id WHERE p.id = ? AND c.id = ? AND julianday(c.expires_at) > julianday('now')").get(target.pageId, target.collectionId) as { content: string } | undefined;
    if (!page) throw new AnnotationError("Not found.", 404);
    return { column: "page_id", id: target.pageId, sourceHash: getSourceHash(page.content) };
  }
  throw new AnnotationError("Invalid comment target.");
}
function owns(row: Row, token?: string): boolean {
  return !!token && /^[a-f0-9]{64}$/.test(token) && timingSafeEqual(Buffer.from(row.owner_token_hash, "hex"), Buffer.from(getSourceHash(token), "hex"));
}
function publicComment(row: Row, hash: string, token?: string): Comment {
  return { id: row.id, author: "user", note: row.note, quote: row.quote, prefix: row.prefix, suffix: row.suffix,
    sourceHash: row.source_hash, createdAt: row.created_at, updatedAt: row.updated_at,
    outdated: row.source_hash !== hash, canEdit: owns(row, token) };
}
/** Public export; ownerToken is the raw browser key, not an Authorization header. */
export function getComments(target: AnnotationTarget, ownerToken?: string): { comments: Comment[]; sourceHash: string } {
  const resolved = resolve(target);
  const rows = db.prepare(`SELECT * FROM annotations WHERE ${resolved.column} = ? ORDER BY created_at, id`).all(resolved.id) as Row[];
  return { comments: rows.map(row => publicComment(row, resolved.sourceHash, ownerToken)), sourceHash: resolved.sourceHash };
}
// Count UTF-8 bytes, not SQLite character lengths. Called inside write transactions.
function checkBudget(resolved: ReturnType<typeof resolve>, target: AnnotationTarget, fields: Pick<Row, "note" | "quote" | "prefix" | "suffix">, replacingId?: string) {
  const incoming = [fields.note, fields.quote, fields.prefix, fields.suffix].reduce((total, value) => total + Buffer.byteLength(value, "utf8"), 0);
  const bytes = "length(CAST(note AS BLOB)) + length(CAST(quote AS BLOB)) + length(CAST(prefix AS BLOB)) + length(CAST(suffix AS BLOB))";
  const page = db.prepare(`SELECT coalesce(sum(${bytes}), 0) AS bytes FROM annotations WHERE ${resolved.column} = ? AND id != ?`).get(resolved.id, replacingId ?? "") as { bytes: number };
  if (page.bytes + incoming > 1024 * 1024) throw new AnnotationError("Comments exceed the 1 MiB page limit.", 413);
  if (target.collectionId) {
    const collection = db.prepare(`SELECT coalesce(sum(${bytes}), 0) AS bytes FROM annotations WHERE page_id IN (SELECT id FROM collection_pages WHERE collection_id = ?) AND id != ?`).get(target.collectionId, replacingId ?? "") as { bytes: number };
    if (collection.bytes + incoming > 4 * 1024 * 1024) throw new AnnotationError("Comments exceed the 4 MiB collection limit.", 413);
  }
}
function token(req: Request): string | undefined {
  return /^Bearer ([a-f0-9]{64})$/.exec(req.get("Authorization") ?? "")?.[1];
}
function bodyObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AnnotationError("Send a JSON object.");
  return body as Record<string, unknown>;
}
function text(body: Record<string, unknown>, key: string, max: number): string {
  const value = body[key] === undefined ? "" : body[key];
  if (typeof value !== "string" || value.length > max) throw new AnnotationError(`${key} must be text of at most ${max} characters.`);
  return value;
}
const configuredOrigin = process.env.ARTIFACTS_URL ? new URL(process.env.ARTIFACTS_URL).origin : undefined;
export const annotationsRouter = Router();
annotationsRouter.get("/api/collections/:collectionId/comments", (req, res, next) => {
  try {
    const collectionId = req.params.collectionId as string;
    const collection = db.prepare("SELECT id FROM collections WHERE id = ? AND julianday(expires_at) > julianday('now')").get(collectionId);
    if (!collection) throw new AnnotationError("Not found.", 404);
    const pages = db.prepare("SELECT id, key, title FROM collection_pages WHERE collection_id = ? ORDER BY position").all(collectionId) as { id: string; key: string; title: string }[];
    res.json({ pages: pages.map(page => ({ ...page, comments: getComments({ collectionId, pageId: page.id }, token(req)).comments })) });
  } catch (error) { if (error instanceof AnnotationError) res.status(error.status).json({ error: error.message }); else next(error); }
});
for (const path of ["/api/artifacts/:id/comments", "/api/collections/:collectionId/pages/:pageId/comments"]) {
  const target = (req: Request): AnnotationTarget => req.params.id ? { artifactId: req.params.id as string } : { collectionId: req.params.collectionId as string, pageId: req.params.pageId as string };
  annotationsRouter.get(path, (req, res, next) => {
    try { res.json(getComments(target(req), token(req))); }
    catch (error) { if (error instanceof AnnotationError) res.status(error.status).json({ error: error.message }); else next(error); }
  });
  for (const method of ["post", "patch", "delete"] as const) {
    annotationsRouter[method](path + (method === "post" ? "" : "/:commentId"), (req, res, next) => {
      try {
        const origin = req.get("Origin");
        const expectedOrigin = configuredOrigin ?? `${req.protocol}://${req.get("Host")}`;
        if (origin !== undefined && origin !== expectedOrigin) throw new AnnotationError("Cross-origin comment changes are not allowed.", 403);
        const owner = token(req);
        if (!owner) throw new AnnotationError("A valid owner token is required.", 403);
        const result = db.transaction(() => {
          const resolved = resolve(target(req));
          if (method === "post") {
            const body = bodyObject(req.body);
            const note = text(body, "note", 10000), quote = text(body, "quote", 3000);
            const prefix = text(body, "prefix", 80), suffix = text(body, "suffix", 80);
            if (!note.trim() && !quote.trim()) throw new AnnotationError("Include a note or quote.");
            if (typeof body.sourceHash !== "string" || !/^[a-f0-9]{64}$/.test(body.sourceHash)) throw new AnnotationError("Supply the current sourceHash.");
            if (body.sourceHash !== resolved.sourceHash) throw new AnnotationError("The source has changed. Reload before commenting.", 409);
            const count = db.prepare(`SELECT count(*) AS n FROM annotations WHERE ${resolved.column} = ?`).get(resolved.id) as { n: number };
            if (count.n >= 100) throw new AnnotationError("This page has reached its 100-comment limit.", 409);
            checkBudget(resolved, target(req), { note, quote, prefix, suffix });
            const now = new Date().toISOString();
            const row: Row = { id: randomUUID(), owner_token_hash: getSourceHash(owner), note, quote, prefix, suffix, source_hash: resolved.sourceHash, created_at: now, updated_at: now };
            db.prepare(`INSERT INTO annotations (id, ${resolved.column}, owner_token_hash, note, quote, prefix, suffix, source_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(row.id, resolved.id, row.owner_token_hash, note, quote, prefix, suffix, row.source_hash, now, now);
            return publicComment(row, resolved.sourceHash, owner);
          }
          const row = db.prepare(`SELECT * FROM annotations WHERE id = ? AND ${resolved.column} = ?`).get(req.params.commentId, resolved.id) as Row | undefined;
          if (!row) throw new AnnotationError("Not found.", 404);
          if (!owns(row, owner)) throw new AnnotationError("This comment belongs to another browser key.", 403);
          if (method === "delete") { db.prepare("DELETE FROM annotations WHERE id = ?").run(row.id); return null; }
          const body = bodyObject(req.body);
          if (Object.keys(body).some(key => key !== "note") || body.note === undefined) throw new AnnotationError("Only note may be edited.");
          row.note = text(body, "note", 10000);
          if (!row.note.trim() && !row.quote.trim()) throw new AnnotationError("Include a note or quote.");
          checkBudget(resolved, target(req), row, row.id);
          row.updated_at = new Date().toISOString();
          db.prepare("UPDATE annotations SET note = ?, updated_at = ? WHERE id = ?").run(row.note, row.updated_at, row.id);
          return publicComment(row, resolved.sourceHash, owner);
        })();
        if (method === "delete") res.status(204).send(); else res.status(method === "post" ? 201 : 200).json(result);
      } catch (error) { if (error instanceof AnnotationError) res.status(error.status).json({ error: error.message }); else next(error); }
    });
  }
}
