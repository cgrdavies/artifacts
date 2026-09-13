# A write-up with several pages

Use a collection when a longer write-up has distinct parts worth linking to separately. Keep short write-ups on one page. Collections are a flat, ordered list—not folders or a file browser.

## Keep the sources together

Make a folder under `~/Documents/artifacts/` with the page files and a manifest:

```text
my-guide/
  collection.json
  start.md
  design.md
```

`collection.json`:

```json
{
  "title": "My guide",
  "pages": [
    { "key": "start.md", "title": "Start here", "file": "start.md", "type": "markdoc" },
    { "key": "design.md", "title": "The design", "file": "design.md", "type": "markdoc" }
  ]
}
```

The array sets reading order. Each page needs a title and a UTF-8 source file. Types are `markdown`, `markdoc`, or `html`. Keep file paths inside the manifest folder. A collection holds 1–50 pages and at most 10 MiB of source text in total; heavily escaped JSON can hit the separate 15 MiB request limit sooner.

Keys are unique plain filenames or slugs, up to 100 characters: letters, digits, dots, underscores, and hyphens, beginning with a letter or digit. No slash or `..`. Titles can use ordinary text, up to 200 characters.

## Link between pages

Use keys in Markdown links:

```markdown
Read [the design](design.md), or jump to [its trade-offs](design.md#trade-offs).
```

The service converts those links into stable page URLs. `./design.md` also works. Heading anchors use lowercase words joined by hyphens; repeated headings get a numeric suffix. Unknown relative page links are rejected before saving. Use full URLs for outside links. HTML source is kept unchanged, so relative sibling links are not rewritten inside custom HTML.

The service adds shared contents, a phone-friendly Pages menu, and previous/next links. Don't build those yourself. The collection and every page share one expiry date, 30 days after creation. Edits do not renew it.

## Publish

```bash
node <skill-directory>/scripts/publish-collection.mjs ~/Documents/artifacts/my-guide/collection.json
```

The helper checks service support, uploads once, verifies every page and its saved source, and prints the collection link. Check diagrams or custom HTML in a browser too. Share the main collection link or an individual page link from the receipt.

A `collection.json.artifact.json` receipt stays beside the manifest. **It contains a private edit key. Never publish, print, or commit that file.** Keep it with the sources; copying those files securely to another machine lets you edit there. Readers do not need a login or the edit key.

## Edit without changing links

```bash
node <skill-directory>/scripts/publish-collection.mjs ~/Documents/artifacts/my-guide/collection.json --update COLLECTION_ID
```

Use the collection ID from the receipt or main link. Keep each page's **key** fixed while changing its title, source filename, content, or position. The helper uses the key to retain its page ID. Advanced callers can supply an existing page `id` explicitly when changing its key.

An update replaces the whole list. Omitted pages are deleted, and their old links stop working. New keys create new pages unless an existing ID is supplied. Do not update the same collection concurrently from separate writers; updates replace the previous version, rather than merging it.

If a request fails, inspect the existing collection before trying again. A failed check can leave a saved collection and a receipt marked `verified: false`; that receipt still preserves its edit key. There are no automatic retries. Keep local sources even after successful publication, since hosted pages expire.
