import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "artifacts.db");

const db = new Database(DB_PATH);

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

export const insertArtifact = db.prepare<[string, string, string, string | null, string, number]>(
  `INSERT INTO artifacts (id, type, content, filename, content_type, size) VALUES (?, ?, ?, ?, ?, ?)`
);

export const getArtifact = db.prepare<[string]>(
  `SELECT * FROM artifacts WHERE id = ?`
);

export const deleteArtifact = db.prepare<[string]>(
  `DELETE FROM artifacts WHERE id = ?`
);

export const deleteOldArtifacts = db.prepare(
  `DELETE FROM artifacts WHERE created_at < datetime('now', '-30 days')`
);

export default db;
