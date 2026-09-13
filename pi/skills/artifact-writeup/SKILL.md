---
name: artifact-writeup
description: "Default destination for requested write-ups: reports, plans, proposals, research summaries, comparisons, explanations, handoffs, and visual walkthroughs. Write a clear document, publish it to Artifacts, and share its verified link unless the user asks for another destination. Use Markdown, simple diagrams, or focused HTML as needed."
---

# Write it up

Use Artifacts for requested write-ups unless the user names another destination. Short conversational answers, quick status messages, code edits, and ordinary questions do not need their own page. Don't turn each reply into a document.

## Writing rule

**Don't use jargon; speak coherently; write simply and concisely, like one human talking to another.**

Lead with the answer. Use short paragraphs and useful headings. Explain an unavoidable technical term once. Keep exact code, commands, paths, and names when they matter. Separate what was checked from what is proposed or still unknown. Don't pad the document or add decorative summaries.

## Pick the smallest useful view

Adapted from the local HumanLayer `show-me` skill; the original skill is unchanged.

- Logic or an algorithm: fenced `text` pseudocode.
- Runtime flow: a short call tree in a `text` fence.
- UI structure: a component tree in a `tsx` fence; show meaningful state and file boundaries.
- File ownership or a broad refactor: a shallow file tree in a `text` fence.
- Interactions, steps, or data movement: a fenced `mermaid` diagram.
- What changes: a `diff` fence. Keep enough context to understand it.
- A copyable target or mostly new block: show the whole block.
- A custom layout, comparison, or interaction that the above cannot explain: one focused HTML page.

Place each view beside the short text it supports. Use real labels and checked facts. Choose only what helps; do not include every view. Keep the design simple, legible, and useful on both phones and desktops. For a UI walkthrough, match the product's existing colors, type, spacing, and controls where they matter; don't invent a new visual style.

## Authoring

Write ordinary Markdown first. The service supplies typography, spacing, code colors, tables, and diagrams. Don't hand-write a page shell or CSS for a normal write-up.

For richer structure, use the few built-in Markdoc components. Read [FORMAT.md](references/FORMAT.md) when you need their syntax or an HTML page. Do not invent components or use MDX, imports, or JavaScript expressions in Markdown.

Save source files under `~/Documents/artifacts/`, with a descriptive filename. A `.md` file can contain Markdoc tags. A standalone `.html` file is the escape hatch; keep its CSS and any scripts inside the file. No remote libraries, fonts, tracking, or network calls. HTML runs in an isolated frame. A normal Markdoc page should be enough most of the time.

## Sharing policy

Read access is by unlisted link: no login, but anyone who gets a link can open it. Search engines are instructed not to index pages. This is the user's chosen policy for ordinary internal write-ups; do not add a login gate or ask the same permission question each time.

Never include credentials, access tokens, or customer/personal data by default. If a requested document needs more protection, explain that and ask for a suitable destination. Do not treat a hard-to-guess link as encryption. There is no public document directory. Saved sources are the durable copy: hosted artifacts expire after about 30 days.

## Publish and check

Use the bundled publisher, not an unverified upload:

```bash
node <skill-directory>/scripts/publish.mjs ~/Documents/artifacts/my-write-up.md --type markdoc
# Plain Markdown also works: --type markdown
# A standalone visual page: --type html
# An image or PDF: --type raw
```

Replace `<skill-directory>` with the directory containing this skill. The helper:

1. Checks that the hosted service supports the format and sends no-index headers.
2. Publishes once, without automatic retries.
3. Checks the page, HTML isolation when relevant, and the saved source bytes.
4. Saves a local receipt beside the source and prints the share link.

If publishing fails or the outcome is uncertain, keep the source and say what failed. Don't retry blindly, bypass the checks, claim the page is live, or silently choose another destination. If a link was created but verification failed, report that clearly. HTML or diagram changes should also get a browser check when browser tools are available; an HTTP response alone does not prove that a visual renders correctly.

End in chat with the link and a brief useful summary. Don't repeat the full write-up. Respect an explicit request for a different destination.
