# Artifacts

Lightweight artifact sharing service. Create shareable links to rendered markdown or raw files.

Hosted at `artifacts.yeeted.lol`.

## Quick Start

```bash
docker compose up -d
```

## API

**Create an artifact:**
```bash
POST /api/artifacts
{ "content": "# Hello", "type": "markdown" }
```

**View:** `GET /:id`

**Delete:** `DELETE /api/artifacts/:id`

## CLI

```bash
# Share markdown
artifacts-cli create --type markdown --content "# Hello World"
artifacts-cli create --type markdown --file ./notes.md

# Share a file
artifacts-cli create --type raw --file ./screenshot.png
```

Set `ARTIFACTS_URL` env var to point at your instance (default: `http://localhost:3000`).

## Constraints

- 10MB max per artifact
- Artifacts auto-delete after 30 days
