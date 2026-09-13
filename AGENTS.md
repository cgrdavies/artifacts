# Artifacts: agent workflow

## Purpose and writing

Use this service for requested write-ups unless the user specifies another destination. Keep short conversational replies in chat. Follow `pi/skills/artifact-writeup/SKILL.md` for authoring and checked publishing.

For all prose: **don't use jargon; speak coherently; write simply and concisely, like one human talking to another.**

Keep the original HumanLayer show-me skill unchanged. Choose the smallest useful view: prose, pseudocode, a tree, a diff, a Mermaid diagram, then focused HTML only when needed. Prefer Markdown and shared layout blocks to hand-written page shells.

## Publish

1. Save the source under `~/Documents/artifacts/` with a descriptive name.
2. Review the content. The user chose unlisted, no-login links for ordinary internal write-ups. Don't repeatedly ask for that same permission. Do not include credentials or customer/personal data by default.
3. Run `node pi/skills/artifact-writeup/scripts/publish.mjs /absolute/source/path --type markdoc` (or markdown, html, raw).
4. The helper checks capabilities and no-index headers before uploading, then verifies the page and saved source. HTML or new diagrams also need a browser check when available. A successful HTTP request alone does not prove that a visual renders.
5. Share the link and a short summary. Keep the source and receipt. Single-artifact updates get new URLs. For related pages, use `publish-collection.mjs` and the [collection guide](pi/skills/artifact-writeup/references/COLLECTIONS.md): edits can retain page links. Collection receipts contain private edit keys—never print, publish, or commit them.

If checks fail, keep the source and explain the problem. Do not bypass the helper or retry an uncertain upload blindly. A link already created before verification failed may still exist; inspect it first.

## Hosting

This repository is public. Keep machine-specific deployment IDs and internal notes out of it. On the owner's machine, deployment details are in `~/.pi/agent/artifacts-hosting.md`. Read those notes and the applicable deployment skill before changing the hosted service.

Publishing a document is an API request, not a deployment. Do not restart, redeploy, alter environment variables or remove volumes merely to publish. Saved Dokploy status `done` is not proof the container is running. Never print credentials or raw environment/config responses.

## Checks and boundaries

Use Node 20 as in the current Dockerfile, without changing the machine's global Node/Python setup. Run `fnm exec --using 20.19.6 npm test` and `fnm exec --using 20.19.6 npm run test:browser`. The tests build the actual app and use temporary SQLite databases and loopback servers. Browser screenshots live in ignored `test-results/`.

No-index is not authentication. Legacy single-artifact creation and deletion still use the existing unauthenticated API. Collections are publicly readable by link, but updates and deletion require their separate edit key. Links may be copied. Keep sources locally because hosted copies expire after about 30 days. The original table schema is preserved: Markdoc uses the markdown type; HTML uses raw storage with its content type.

There is no arbitrary JavaScript execution on the server. Markdown uses a small Markdoc allowlist; HTML is isolated by both its frame and response headers. Do not add same-origin permission to uploaded pages or load remote page libraries. Assets are bundled into `public/assets/` at build time and copied into the Docker image.

Before declaring a hosted update complete, verify capabilities version 2 with collections version 1 and edit-token protection, no-index/referrer headers, ordinary Markdown, a diagram, a self-contained HTML interaction, collection navigation, and saved/system theme choices on the live domain. Local tests alone are not deployment proof.
