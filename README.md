# Artifacts

Readable write-ups with simple, unlisted links. No login is needed to open a page.

Write Markdown for most documents. Add a few Markdoc blocks when they help. Use a focused HTML page when an interaction or custom layout is the point.

## What renders

- Headings, lists, tables, quotes, links and images.
- Code, pseudocode, file trees, call trees, component trees and diffs.
- Mermaid flow, sequence and state diagrams, with their source available below.
- Five Markdoc blocks: callout, columns, card, details and steps.
- Standalone HTML with inline CSS and scripts, kept in an isolated frame.

The service provides readable type, restrained colors, light/dark styles and phone layouts. Wide diagrams scroll rather than shrinking their labels. Ordinary pages do not download the diagram renderer. All assets are served locally. The theme defaults to System; Light or Dark saves a choice in that browser. Choosing System clears the override. Diagram colors update too. Custom HTML keeps its own styling.

See [the format guide](pi/skills/artifact-writeup/references/FORMAT.md) and [the example document](examples/readable-write-ups.md). [The HTML example](examples/focused-visual.html) shows when a custom page helps.

## Share a write-up

The checked publisher is the normal agent path:

```sh
node pi/skills/artifact-writeup/scripts/publish.mjs /path/to/notes.md --type markdoc
```

It defaults to `https://artifacts.yeeted.lol`. It checks the service before uploading, then verifies the page, no-index headers, HTML isolation when relevant, and saved source bytes. A receipt stays beside the source. It does not retry an uncertain upload.

The lower-level CLI remains available:

```sh
ARTIFACTS_URL=https://artifacts.yeeted.lol ./artifacts-cli create --type markdown --file notes.md
ARTIFACTS_URL=https://artifacts.yeeted.lol ./artifacts-cli create --type markdoc --file proposal.md
ARTIFACTS_URL=https://artifacts.yeeted.lol ./artifacts-cli create --type html --file visual.html
ARTIFACTS_URL=https://artifacts.yeeted.lol ./artifacts-cli create --type raw --file screenshot.png
```

The CLI alone defaults to localhost and does not perform the publisher's full checks. File uploads are streamed from temporary files rather than passed as large command arguments.

## Collections

Group related documents into one ordered collection. Each page has a stable link, shared contents, and previous/next navigation. On phones, the contents fit in a Pages menu. All pages expire together, 30 days after creation; editing does not renew the date.

```sh
node pi/skills/artifact-writeup/scripts/publish-collection.mjs /path/to/collection.json
node pi/skills/artifact-writeup/scripts/publish-collection.mjs /path/to/collection.json --update COLLECTION_ID
```

See the [manifest and editing guide](pi/skills/artifact-writeup/references/COLLECTIONS.md) and [three-page example](examples/collection/collection.json). Keep keys fixed when editing titles, files, or reading order. Markdown links such as `[Design](design.md#trade-offs)` resolve to stable page links. Updates replace the full list; removed pages stop working. There are no folders or file-browser controls yet.

The local receipt contains a private edit key. Keep it with the sources, and never share or commit it. Read links need no login; editing and deleting a collection require that key.

## Links, search and privacy

- All app responses send `X-Robots-Tag: noindex, nofollow, nosnippet, noimageindex` and `Referrer-Policy: no-referrer`.
- `robots.txt` allows fetching so search engines can see the no-index header. There is no public directory or sitemap.
- These are unlisted links, not private accounts. Anyone who gets a link can read it. No-index is a request to search engines, not authentication.
- The legacy single-artifact create/delete API has no authentication. Knowing an artifact ID allows deletion. Collections use a separate edit key for updates and deletion; public metadata never returns it.
- Markdown HTML is shown as text. Unknown tags, expressions, file includes and unsafe parsed URLs are rejected.
- HTML and raw HTML/SVG use an isolated frame. Direct content URLs also carry sandbox restrictions. Inline interaction is allowed; fetch requests, site storage, parent-page access, remote libraries and other frames are blocked. This is browser isolation, not a guarantee against every possible navigation or malicious page.
- Off-site document images and other remote page assets are blocked. Upload images here first. Ordinary external text links still work.
- Keep credentials and personal data out. Keep source files locally: artifacts are removed after about 30 days.

## Give a coding agent the context

Open a collection and choose **Download collection Markdown** or **Download collection text**. Both save one UTF-8 file containing all pages in reading order, with the collection title, page titles, and page keys. The `.txt` version keeps the same Markdown source rather than stripping code, links, diagrams, or Markdoc blocks. HTML pages are included as fenced HTML source, not executed or converted from their visual layout. Downloads never include the collection's edit key.

Every document page, including standalone Markdown and HTML pages, has **Copy Markdown**. It copies saved Markdown/Markdoc exactly; HTML is wrapped in a code fence. If clipboard access is blocked, a selected text box lets you copy manually. **View Markdown** also works without JavaScript. Review the content before giving it to another service; the existing unlisted-link sharing and expiry rules still apply.

## API

| Request | Purpose |
| --- | --- |
| `GET /api/capabilities` | Supported formats and sharing settings |
| `POST /api/artifacts` | Create: `{content, type, filename?, contentType?}` |
| `GET /:id` | Read the page or file |
| `GET /:id/content` | Read its original content |
| `GET /:id/download` | Download its source |
| `GET /:id/markdown` | Copyable Markdown source (HTML/SVG pages use a code fence) |
| `DELETE /api/artifacts/:id` | Remove it |
| `POST /api/collections` | Create `{title, pages: [{key, title, type, content}]}`; returns the edit token once |
| `GET /api/collections/:id` | Public metadata and page sources |
| `PUT /api/collections/:id` | Replace title/pages; include existing page `id` values to keep links |
| `DELETE /api/collections/:id` | Remove the collection and its pages |
| `GET /c/:id` | Collection contents |
| `GET /c/:id/p/:pageId` | Read a page; append `/content` or `/download` for its source |
| `GET /c/:id/export.md` | Download all pages as Markdown |
| `GET /c/:id/export.txt` | Download the same source context as plain text |
| `GET /c/:id/p/:pageId/markdown` | Copyable Markdown source for one page |

Types are `markdown`, `markdoc`, `html` and `raw`. Raw content is base64. The limit is 10 MiB of decoded content; the JSON body limit is 15 MiB to fit a full-size encoded file. Single artifacts keep their existing table. Collections add two tables automatically without changing older artifacts. Older Markdown that cannot be rendered is still readable as escaped source.

Collection pages support `markdown`, `markdoc`, and `html`, all as original UTF-8 text, not base64. A collection allows 1–50 pages and 10 MiB total content. Create returns `id`, `url`, `createdAt`, `expiresAt`, `pages`, and a one-time `editToken`. Each page includes its own `id`, `key`, `title`, `type`, `content`, `position`, and `url`. Keep the token out of shared links and logs. PUT/DELETE require `Authorization: Bearer <editToken>`. Missing or wrong tokens return 403; expired or missing collections return 404. Page IDs supplied to PUT must belong to that collection. Validation happens before an atomic replacement. Concurrent updates replace, rather than merge, the previous version.

## Local checks

Node 20 matches the current Dockerfile. With fnm:

```sh
fnm exec --using 20.19.6 npm ci
fnm exec --using 20.19.6 npm test
fnm exec --using 20.19.6 npm run test:browser
fnm exec --using 20.19.6 npm run dev
```

Browser checks use installed Chrome on macOS, or Playwright Chromium elsewhere (`npx playwright install chromium` if needed). Tests use temporary databases and loopback servers, not the hosted service. Screenshots and the browser report go in ignored `test-results/`.

## Pi skill

The skill lives in `pi/skills/artifact-writeup/`. Install it in `~/.pi/agent/skills/` by symlinking that directory. A short rule in `~/.pi/agent/AGENTS.md` makes it the default for requested write-ups, while respecting another destination and leaving short chat replies alone.

The writing rule is:

> Don't use jargon; speak coherently; write simply and concisely, like one human talking to another.

The original HumanLayer show-me skill is unchanged. The new skill keeps its best rule: choose the smallest view that explains the point.

## Hosted update

Machine-specific hosting details are kept in local deployment notes, not this public repository. See [AGENTS.md](AGENTS.md) for the workflow. Building locally does not update it. After an approved deployment, check `/api/capabilities`, publish harmless Markdown and HTML samples, verify their response headers and source bytes, and open both in a browser before sharing internal notes.
