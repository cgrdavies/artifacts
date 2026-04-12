import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { marked } from "marked";
import hljs from "highlight.js";
import { insertArtifact, getArtifact, deleteArtifact, Artifact } from "./db";
import { renderMarkdownPage } from "./views/markdown";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

marked.setOptions({
  highlight(code: string, lang: string) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  },
});

const router = Router();

const BASE_URL = process.env.ARTIFACTS_URL || "http://localhost:3000";

router.post("/api/artifacts", (req: Request, res: Response) => {
  const { content, type, filename, contentType } = req.body;

  if (!content || !type) {
    return res.status(400).json({ error: "content and type are required" });
  }

  if (type !== "markdown" && type !== "raw") {
    return res.status(400).json({ error: "type must be 'markdown' or 'raw'" });
  }

  let stored: string = content;
  let size: number;

  if (type === "raw") {
    const buf = Buffer.from(content, "base64");
    size = buf.length;
    if (size > MAX_SIZE) {
      return res.status(413).json({ error: "Artifact exceeds 10MB limit" });
    }
    stored = content; // store base64
  } else {
    size = Buffer.byteLength(content, "utf-8");
    if (size > MAX_SIZE) {
      return res.status(413).json({ error: "Artifact exceeds 10MB limit" });
    }
  }

  const id = uuidv4();
  const ct = contentType || (type === "markdown" ? "text/markdown" : "application/octet-stream");

  insertArtifact.run(id, type, stored, filename || null, ct, size);

  res.status(201).json({ id, url: `${BASE_URL}/${id}` });
});

router.delete("/api/artifacts/:id", (req: Request, res: Response) => {
  deleteArtifact.run(req.params.id);
  res.status(204).send();
});

router.get("/:id", (req: Request, res: Response) => {
  const artifact = getArtifact.get(req.params.id) as Artifact | undefined;

  if (!artifact) {
    return res.status(404).send("Not found");
  }

  if (artifact.type === "markdown") {
    const html = marked.parse(artifact.content) as string;
    const title = extractTitle(artifact.content);
    return res.type("html").send(renderMarkdownPage(title, html));
  }

  // Raw file
  const buf = Buffer.from(artifact.content, "base64");
  res.type(artifact.content_type);
  if (artifact.filename) {
    res.set("Content-Disposition", `inline; filename="${artifact.filename}"`);
  }
  res.send(buf);
});

function extractTitle(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1] : "Artifact";
}

export default router;
