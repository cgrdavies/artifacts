import express, { ErrorRequestHandler } from "express";
import path from "path";
import routes from "./routes";

export const ROBOTS = "noindex, nofollow, nosnippet, noimageindex";
export const DOCUMENT_CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set({
      "X-Robots-Tag": ROBOTS,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": DOCUMENT_CSP,
    });
    next();
  });
  // Crawlers must be able to fetch a page to see its noindex response header.
  app.get("/robots.txt", (_req, res) => res.type("text/plain").send("User-agent: *\nAllow: /\n"));
  app.use("/assets", express.static(path.join(__dirname, "..", "public", "assets"), { index: false, redirect: false, dotfiles: "deny" }));
  // A 10 MiB file needs roughly 13.4 MiB once encoded as JSON/base64.
  app.use(express.json({ limit: "15mb" }));
  app.use(routes);
  app.use((_req, res) => res.status(404).type("text/plain").send("Not found"));
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error.type === "entity.too.large") return void res.status(413).json({ error: "Upload body is too large." });
    if (error.type === "entity.parse.failed") return void res.status(400).json({ error: "Send a valid JSON object." });
    console.error("Artifact request failed.");
    res.status(500).json({ error: "The request could not be completed." });
  };
  app.use(errorHandler);
  return app;
}
