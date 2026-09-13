import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { insertArtifact, getArtifact, deleteArtifact, Artifact } from "./db";
import { renderMarkdownPage } from "./views/markdown";
import { renderDocument } from "./render";

const MAX_SIZE = 10 * 1024 * 1024;
const router = Router();
const configured = new URL(process.env.ARTIFACTS_URL || "http://localhost:3000");
if (!["http:", "https:"].includes(configured.protocol) || configured.username || configured.password || configured.search || configured.hash) {
  throw new Error("ARTIFACTS_URL must be an HTTP or HTTPS address without credentials, a query or a fragment.");
}
const BASE_URL = configured.href.replace(/\/$/, "");
// Also sent on the direct content URL: opening it outside the frame must not
// give an uploaded page the site's origin or access to other artifacts.
export const UPLOAD_CSP = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

router.get("/api/capabilities", (_req, res) => res.json({
  version: 2, formats: ["markdown", "markdoc", "html", "raw"],
  components: ["callout", "columns", "card", "details", "steps"],
  diagrams: ["mermaid"], readAccess: "unlisted", indexing: "noindex",
  htmlIsolation: "sandbox", retentionDays: 30,
  collections: { version: 1, maxPages: 50, stablePageLinks: true, sharedExpiry: true, editTokenRequired: true },
  theme: { system: true, savedPreference: true },
}));

router.post("/api/artifacts", (req: Request, res: Response) => {
  const body = req.body;
  if (!body || Array.isArray(body) || typeof body !== "object") return res.status(400).json({ error: "Send a JSON object." });
  const { content, type, filename, contentType } = body;
  if (typeof content !== "string" || !content.trim()) return res.status(400).json({ error: "Content must be a non-empty string." });
  if (!["markdown", "markdoc", "html", "raw"].includes(type)) return res.status(400).json({ error: "Type must be markdown, markdoc, html or raw." });
  if (filename !== undefined && (typeof filename !== "string" || !filename || Buffer.byteLength(filename) > 255 || /[\x00-\x1f\x7f/\\]/.test(filename))) {
    return res.status(400).json({ error: "Use a plain filename without paths or control characters." });
  }
  if (contentType !== undefined && (typeof contentType !== "string" || !/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+(?:;\s*charset=[a-zA-Z0-9_-]+)?$/.test(contentType))) {
    return res.status(400).json({ error: "Use a valid content type." });
  }
  let stored = content;
  let size = Buffer.byteLength(content, "utf8");
  let storedType: "markdown" | "raw" = "markdown";
  let ct = "text/markdown";
  if (type === "raw") {
    stored = content.replace(/[\r\n\t ]/g, "");
    if (stored.length > Math.ceil(MAX_SIZE / 3) * 4) return res.status(413).json({ error: "Artifact exceeds the 10MB limit." });
    if (!stored.length || stored.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(stored)) return res.status(400).json({ error: "Raw content must be valid base64." });
    const bytes = Buffer.from(stored, "base64");
    if (bytes.toString("base64") !== stored) return res.status(400).json({ error: "Raw content must be valid base64." });
    size = bytes.length;
    storedType = "raw";
    ct = contentType || "application/octet-stream";
  } else if (type === "html") {
    storedType = "raw";
    ct = "text/html";
    if (size <= MAX_SIZE) stored = Buffer.from(content, "utf8").toString("base64");
  }
  if (size > MAX_SIZE) return res.status(413).json({ error: "Artifact exceeds the 10MB limit." });
  if (storedType === "markdown") {
    try { renderDocument(content); }
    catch { return res.status(400).json({ error: "The document has unsupported markup. Check its tags and links." }); }
  }
  // Keep the existing schema: rich Markdown is markdown; HTML is a raw file.
  const id = uuidv4();
  insertArtifact.run(id, storedType, stored, filename || (type === "html" ? "document.html" : null), ct, size);
  return res.status(201).json({ id, url: `${BASE_URL}/${id}` });
});

router.delete("/api/artifacts/:id", (req: Request, res: Response) => {
  deleteArtifact.run(req.params.id as string);
  return res.status(204).send();
});

function find(req: Request, res: Response): Artifact | undefined {
  const artifact = getArtifact.get(req.params.id as string) as Artifact | undefined;
  if (!artifact) res.status(404).type("text/plain").send("Not found");
  return artifact;
}
const activeFile = (a: Artifact) => /^(?:text\/html|application\/xhtml\+xml|image\/svg\+xml)(?:;|$)/i.test(a.content_type);

router.get("/:id/content", (req: Request, res: Response) => {
  const artifact = find(req, res);
  if (!artifact) return;
  res.set("Content-Security-Policy", UPLOAD_CSP);
  if (artifact.type === "markdown") return res.type("text/plain").send(artifact.content);
  // Unknown uploaded types download rather than execute in the site origin.
  res.type(artifact.content_type);
  if (!activeFile(artifact) && !/^(?:image\/(?:png|jpeg|gif|webp|avif)|text\/plain|application\/pdf)(?:;|$)/i.test(artifact.content_type)) {
    res.attachment(artifact.filename || "artifact.bin");
  }
  return res.send(Buffer.from(artifact.content, "base64"));
});

router.get("/:id/download", (req: Request, res: Response) => {
  const artifact = find(req, res);
  if (!artifact) return;
  res.set("Content-Security-Policy", UPLOAD_CSP);
  res.attachment(artifact.filename || (artifact.type === "markdown" ? "document.md" : "artifact.bin"));
  return res.send(artifact.type === "markdown" ? Buffer.from(artifact.content) : Buffer.from(artifact.content, "base64"));
});

router.get("/:id", (req: Request, res: Response) => {
  const artifact = find(req, res);
  if (!artifact) return;
  if (artifact.type === "markdown") {
    try {
      const doc = renderDocument(artifact.content);
      return res.type("html").send(renderMarkdownPage(doc.title, doc.html));
    } catch {
      // Preserve older documents that don't fit the new markup rules, without
      // falling back to unsafe HTML rendering.
      return res.type("html").send(renderMarkdownPage("Saved document", `<h1>Saved document</h1><p>Some formatting could not be shown. Here is the saved text.</p><pre>${escape(artifact.content)}</pre>`));
    }
  }
  if (activeFile(artifact)) {
    const title = artifact.filename || "Interactive page";
    return res.type("html").send(renderMarkdownPage(title, `<h1>${escape(title)}</h1><iframe class="artifact-frame" title="${escape(title)}" sandbox="allow-scripts" referrerpolicy="no-referrer" src="/${artifact.id}/content"></iframe><p><a href="/${artifact.id}/download">Download</a></p>`));
  }
  res.set("Content-Security-Policy", UPLOAD_CSP);
  res.type(artifact.content_type);
  if (!/^(?:image\/(?:png|jpeg|gif|webp|avif)|text\/plain|application\/pdf)(?:;|$)/i.test(artifact.content_type)) res.attachment(artifact.filename || "artifact.bin");
  else if (artifact.filename) res.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(artifact.filename)}`);
  return res.send(Buffer.from(artifact.content, "base64"));
});

export default router;
