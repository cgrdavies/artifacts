export function renderMarkdownPage(title: string, htmlContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      color: #1a1a2e;
      background: #f8f9fa;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }
    article {
      background: #fff;
      border-radius: 8px;
      padding: 2.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    h1 { font-size: 2rem; margin-bottom: 1rem; color: #16213e; }
    h2 { font-size: 1.5rem; margin: 1.8rem 0 0.8rem; color: #16213e; }
    h3 { font-size: 1.25rem; margin: 1.5rem 0 0.6rem; color: #16213e; }
    p { margin-bottom: 1rem; }
    a { color: #0f3460; }
    pre {
      background: #f6f8fa;
      border-radius: 6px;
      padding: 1rem;
      overflow-x: auto;
      margin-bottom: 1rem;
    }
    code {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 0.9em;
    }
    :not(pre) > code {
      background: #f0f0f0;
      padding: 0.2em 0.4em;
      border-radius: 3px;
    }
    blockquote {
      border-left: 4px solid #e0e0e0;
      padding-left: 1rem;
      margin: 1rem 0;
      color: #555;
    }
    img { max-width: 100%; height: auto; border-radius: 4px; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 1rem;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 0.5rem 0.75rem;
      text-align: left;
    }
    th { background: #f6f8fa; }
    ul, ol { margin-bottom: 1rem; padding-left: 1.5rem; }
    li { margin-bottom: 0.25rem; }
    hr { border: none; border-top: 1px solid #e0e0e0; margin: 1.5rem 0; }
  </style>
</head>
<body>
  <div class="container">
    <article>${htmlContent}</article>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
