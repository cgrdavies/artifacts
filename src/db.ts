import Database, { Database as DatabaseType, Statement } from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "artifacts.db");

if (DB_PATH !== ":memory:") fs.mkdirSync(path.dirname(DB_PATH), { recursive: true, mode: 0o700 });
const db: DatabaseType = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('markdown', 'raw')),
    content TEXT,
    filename TEXT,
    content_type TEXT DEFAULT 'application/octet-stream',
    size INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

export interface Artifact {
  id: string;
  type: "markdown" | "raw";
  content: string;
  filename: string | null;
  content_type: string;
  size: number;
  created_at: string;
}

export const insertArtifact: Statement<[string, string, string, string | null, string, number]> = db.prepare(
  `INSERT INTO artifacts (id, type, content, filename, content_type, size) VALUES (?, ?, ?, ?, ?, ?)`
);

export const getArtifact: Statement<[string]> = db.prepare(
  `SELECT * FROM artifacts WHERE id = ?`
);

export const deleteArtifact: Statement<[string]> = db.prepare(
  `DELETE FROM artifacts WHERE id = ?`
);

export const deleteOldArtifacts: Statement = db.prepare(
  `DELETE FROM artifacts WHERE created_at < datetime('now', '-30 days')`
);

// Collections are independent of the original artifacts table and retention rules.
db.exec(`
  CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    edit_token_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS collection_pages (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('markdown', 'markdoc', 'html')),
    content TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0),
    UNIQUE (collection_id, key),
    UNIQUE (collection_id, position)
  );
  CREATE INDEX IF NOT EXISTS collections_expiry ON collections(expires_at);
`);

export const deleteOldCollections: Statement = db.prepare(
  `DELETE FROM collections WHERE julianday(expires_at) <= julianday('now')`
);

export default db;
