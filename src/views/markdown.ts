/** Page shell for trusted HTML produced by renderDocument, not arbitrary uploads. */
export interface CollectionNavigation {
  title: string;
  url: string;
  pages: { title: string; url: string }[];
  currentUrl?: string;
  expiresAt?: string;
}

export interface AnnotationOptions {
  commentsUrl: string;
  commentsMarkdownUrl: string;
  sourceHash: string;
  highlightEnabled: boolean;
}

export function renderMarkdownPage(title: string, htmlContent: string, navigation?: CollectionNavigation, markdownUrl?: string, annotations?: AnnotationOptions): string {
  const annotationAttrs = annotations ? ` data-comments-url="${escapeHtml(annotations.commentsUrl)}" data-comments-markdown="${escapeHtml(annotations.commentsMarkdownUrl)}" data-source-hash="${escapeHtml(annotations.sourceHash)}" data-highlight-enabled="${annotations.highlightEnabled}"` : '';
  const body = `<div class="document-content">${htmlContent}</div>`;
  const sourceUrl = markdownUrl ?? (navigation?.currentUrl ? `${navigation.currentUrl}/markdown` : undefined);
  const actions = sourceUrl ? `<section class="context-actions" aria-label="Page actions"><div class="copy-split"><button type="button" aria-label="Copy page as Markdown" data-copy-markdown="${escapeHtml(sourceUrl)}" disabled>Copy page</button><details class="page-menu action-menu"><summary aria-label="More page actions">▾</summary><div class="action-options"><p>THIS PAGE</p><a href="${escapeHtml(sourceUrl)}?source=1">View Markdown source</a><a href="${escapeHtml(sourceUrl.replace(/\/markdown$/, '/download'))}" download>Download with comments</a><a href="${escapeHtml(sourceUrl.replace(/\/markdown$/, '/download'))}?source=1" download>Download page source</a>${annotations ? `<a href="${escapeHtml(annotations.commentsMarkdownUrl)}">Read comments only</a>` : ''}</div></details></div><span class="copy-status" role="status" aria-live="polite" data-copy-status></span><label class="markdown-fallback" hidden>Markdown — select and copy<textarea data-markdown-fallback readonly rows="10" spellcheck="false"></textarea></label></section>` : '';
  const contents = navigation ? `<nav aria-label="Collection contents"><p class="nav-label">Contents</p><ol>${navigation.pages.map(page => `<li><a href="${escapeHtml(page.url)}"${page.url === navigation.currentUrl ? ' aria-current="page"' : ''}>${escapeHtml(page.title)}</a></li>`).join('')}</ol><div class="collection-utilities"><details class="collection-export action-menu"><summary>Export collection <span aria-hidden="true">▾</span></summary><div class="action-options"><p>ALL ${navigation.pages.length} PAGES</p><a href="${escapeHtml(navigation.url)}/export.md" download aria-label="Download collection Markdown">Markdown (.md)<small>Recommended for coding agents</small></a><a href="${escapeHtml(navigation.url)}/export.txt" download aria-label="Download collection text">Text file (.txt)<small>Same source, different file extension</small></a><a href="${escapeHtml(navigation.url)}/comments.md">Comments only<small>All pages, ready for an agent</small></a></div></details><p class="collection-expiry">${navigation.pages.length} pages${navigation.expiresAt ? ` · Expires <time datetime="${escapeHtml(navigation.expiresAt)}">${escapeHtml(new Date(navigation.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }))}</time>` : ''}</p></div></nav>` : '';
  const current = navigation?.pages.findIndex(page => page.url === navigation.currentUrl) ?? -1;
  const previous = current > 0 ? navigation?.pages[current - 1] : undefined;
  const next = current >= 0 ? navigation?.pages[current + 1] : undefined;
  const adjacent = previous || next ? `<nav class="page-navigation" aria-label="Previous and next pages">${previous ? `<a rel="prev" href="${escapeHtml(previous.url)}">← Previous: ${escapeHtml(previous.title)}</a>` : '<span></span>'}${next ? `<a rel="next" href="${escapeHtml(next.url)}">Next: ${escapeHtml(next.title)} →</a>` : ''}</nav>` : '';
  const pageTools = actions ? `<div class="page-tools">${current >= 0 ? `<span class="page-position">Page ${current + 1} of ${navigation!.pages.length}</span>` : '<span class="page-position">Document</span>'}${actions}</div>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<link rel="stylesheet" href="/assets/document.css">
<meta name="robots" content="noindex,nofollow,nosnippet,noimageindex">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title>
<script src="/assets/theme.js"></script>
<style>
:root{color-scheme:light;--bg:#f4f5f7;--paper:#fff;--ink:#202a35;--muted:#596574;--line:#dce2e8;--soft:#f4f6f8;--accent:#245db0;--note:#376dbe;--warning:#996014;--success:#27744c;--code-comment:#66717f;--code-keyword:#9252a3;--code-string:#266b49;--code-number:#a24d20}
*{box-sizing:border-box}
html{font-size:17px;-webkit-text-size-adjust:100%;overflow-wrap:break-word}
body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.75}
.container{max-width:1000px;margin:0 auto;padding:clamp(1rem,4vw,3rem) 1rem}
.document{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:clamp(1.25rem,5vw,4rem);box-shadow:0 8px 32px #15233406}
.document>div{max-width:76ch;margin:auto}
.artifact-frame{display:block;width:100%;max-width:100%;height:70vh;height:70dvh;min-height:400px;border:0;color-scheme:inherit}
h1,h2,h3,h4,h5,h6{line-height:1.25;letter-spacing:-.025em;text-wrap:balance;color:var(--ink);margin:1.8em 0 .65em}
h1{font-size:clamp(1.9rem,4.5vw,2.65rem);margin-top:0;letter-spacing:-.04em}
h2{font-size:1.55rem;padding-top:.35em}h3{font-size:1.2rem}h4,h5,h6{font-size:1rem}
p,ul,ol,blockquote,pre,table,figure{margin:0 0 1.2rem}
a{color:var(--accent);text-underline-offset:.18em;text-decoration-thickness:1px}
a:hover{text-decoration-thickness:2px}a:focus-visible,summary:focus-visible,[tabindex]:focus-visible{outline:3px solid var(--accent);outline-offset:4px}
strong{font-weight:650}ul,ol{padding-left:1.55rem}li{padding-left:.15rem;margin:.3rem 0}li>ul,li>ol{margin:.35rem 0}li>p{margin:.4rem 0}
blockquote{border-left:3px solid var(--line);padding:.2rem 0 .2rem 1.2rem;color:var(--muted)}blockquote>:last-child{margin-bottom:0}
hr{border:0;border-top:1px solid var(--line);margin:2.3rem 0}
img{display:block;max-width:100%;height:auto;border-radius:6px;margin:1rem 0}
code,pre{font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;font-size:.86em;font-variant-ligatures:none}
:not(pre)>code{background:var(--soft);border:1px solid var(--line);border-radius:4px;padding:.12em .32em;overflow-wrap:anywhere}
pre{background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:1rem 1.15rem;overflow:auto;max-width:100%;line-height:1.65;tab-size:2;white-space:pre;overflow-wrap:normal}
pre code{font-size:1em;background:none;padding:0}
.table-scroll{overflow-x:auto;max-width:100%;margin:1.4rem 0;border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;width:100%;font-size:.92rem;margin:0;line-height:1.55}
th,td{padding:.75rem 1rem;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;min-width:7rem}th{font-weight:650;background:var(--soft)}tr:last-child td{border-bottom:0}td p:last-child{margin-bottom:0}
.callout,.card,details{border:1px solid var(--line);border-radius:8px;padding:1.1rem 1.25rem;margin:1.3rem 0;min-width:0}
.callout{border-left:4px solid var(--note);background:var(--soft)}.callout-warning{border-left-color:var(--warning)}.callout-success{border-left-color:var(--success)}
.block-title{font-weight:650;line-height:1.4;margin:0 0 .65rem}.callout>:last-child,.card>:last-child,.details-body>:last-child{margin-bottom:0}
.columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;margin:1.4rem 0}.columns-3{grid-template-columns:repeat(3,minmax(0,1fr))}.columns>*{min-width:0;margin-top:0;margin-bottom:0}.columns .card{padding:1rem}
summary{cursor:pointer;font-weight:600;line-height:1.5}summary::marker{color:var(--muted)}.details-body{padding-top:1rem}
.steps>ol{padding-left:2rem}.steps>ol>li{padding-left:.45rem;margin:1rem 0}.steps>ol>li::marker{font-weight:700;color:var(--accent)}
.mermaid{background:var(--paper);text-align:left}.diagram{max-width:100%;margin:1.5rem 0}.diagram-canvas{max-width:100%;overflow:auto;padding:.5rem 0}.diagram svg{display:block;height:auto;margin:auto}.diagram details{font-size:.85rem;background:var(--soft)}.diagram-hint,.diagram-error{color:var(--muted);font-size:.9rem}.diagram-hint{margin:.5rem 0}
.hljs-comment,.hljs-quote{color:var(--code-comment)}.hljs-keyword,.hljs-selector-tag,.hljs-literal,.hljs-doctag{color:var(--code-keyword)}.hljs-string,.hljs-regexp,.hljs-addition,.hljs-attribute{color:var(--code-string)}.hljs-number,.hljs-symbol,.hljs-bullet,.hljs-deletion{color:var(--code-number)}.hljs-title,.hljs-section,.hljs-built_in,.hljs-type,.hljs-attr{color:var(--accent)}.hljs-meta{color:var(--muted)}.hljs-addition{background:#23834c15}.hljs-deletion{background:#b1433015}.hljs-emphasis{font-style:italic}.hljs-strong{font-weight:700}
:root[data-theme="dark"]{color-scheme:dark;--bg:#15191f;--paper:#1c222a;--ink:#e6eaf0;--muted:#acb6c4;--line:#39424e;--soft:#242c36;--accent:#90baff;--note:#85aef0;--warning:#e5b464;--success:#7bcea0;--code-comment:#a4afbd;--code-keyword:#d7a3eb;--code-string:#9cd7b0;--code-number:#efb58c}
@media(prefers-color-scheme:dark){:root:not([data-theme]){color-scheme:dark;--bg:#15191f;--paper:#1c222a;--ink:#e6eaf0;--muted:#acb6c4;--line:#39424e;--soft:#242c36;--accent:#90baff;--note:#85aef0;--warning:#e5b464;--success:#7bcea0;--code-comment:#a4afbd;--code-keyword:#d7a3eb;--code-string:#9cd7b0;--code-number:#efb58c}}
.theme-controls{display:flex;justify-content:flex-end;align-items:center;gap:.6rem;margin:0 0 1rem;color:var(--muted);font-size:.85rem}.theme-controls select{font:inherit;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:5px;padding:.35rem .5rem}select:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.site-header{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:1px solid var(--line)}.site-title{font-size:.95rem;font-weight:600;text-decoration:none;max-width:70ch;color:var(--ink)}.site-header .theme-controls{margin:0;flex-shrink:0}.site-header .theme-controls label{font-size:.8rem}.site-header select{max-width:6rem}
.page-tools{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:1.5rem!important;font-size:.8rem}.document>.page-tools{max-width:none}.page-position{color:var(--muted);padding-top:.4rem;white-space:nowrap}.context-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:.5rem;min-width:0;font-size:.8rem}.copy-split{display:flex;align-items:stretch}.context-actions button{font:inherit;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:6px 0 0 6px;padding:.4rem .75rem;cursor:pointer}.context-actions button:hover,.action-menu>summary:hover{background:var(--soft)}.context-actions button:disabled{opacity:.65;cursor:wait}.context-actions button:focus-visible,.context-actions textarea:focus-visible{outline:3px solid var(--accent);outline-offset:3px}.copy-status{color:var(--muted);max-width:28ch}.copy-status:empty{display:none}.copy-status:not([data-error]){position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.page-tools:has(.markdown-fallback:not([hidden])) .context-actions{flex-basis:100%}.markdown-fallback{width:100%;max-width:76ch}.markdown-fallback textarea{display:block;width:100%;margin-top:.5rem;padding:.75rem;background:var(--paper);color:var(--ink);border:1px solid var(--line);font:inherit;resize:vertical}
.action-menu{padding:0;margin:0;border:0;border-radius:0;position:relative}.action-menu>summary{font-weight:500;font-size:.85rem;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:.5rem;border:1px solid var(--line);border-radius:6px;padding:.5rem .7rem}.action-menu>summary::-webkit-details-marker{display:none}.page-menu>summary{height:100%;border-left:0;border-radius:0 6px 6px 0}.action-options{background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:.4rem;box-shadow:0 8px 24px #0002;z-index:10}.page-menu .action-options{position:absolute;right:0;top:calc(100% + .4rem);width:230px;max-width:75vw}.action-options p{font-size:.65rem;letter-spacing:.07em;color:var(--muted);margin:.3rem .55rem}.action-options a{display:block;padding:.5rem .55rem;border-radius:4px;text-decoration:none;font-size:.85rem;color:var(--ink)}.action-options a:hover{background:var(--soft)}.action-options small{display:block;font-size:.72rem;line-height:1.4;color:var(--muted);margin-top:.2rem}.collection-export .action-options{margin-top:.5rem;box-shadow:none}
.container.collection{max-width:1320px}.collection-layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:2rem;align-items:start}.collection-sidebar{position:sticky;top:1.5rem;max-height:calc(100vh - 3rem);overflow:auto;font-size:.9rem}.nav-label{font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0 0 .75rem}.collection-sidebar ol,.collection-mobile ol{list-style:none;padding:0;margin:0}.collection-sidebar li,.collection-mobile li{padding:0;margin:.15rem 0}.collection-sidebar li a,.collection-mobile li a{display:block;padding:.45rem .7rem;border-left:3px solid transparent;border-radius:0 5px 5px 0;text-decoration:none;color:var(--muted);line-height:1.5}.collection-sidebar li a:hover,.collection-mobile li a:hover{background:var(--soft);color:var(--ink)}.collection-sidebar [aria-current="page"],.collection-mobile [aria-current="page"]{font-weight:600;color:var(--ink);background:var(--soft);border-left-color:var(--accent)}.collection-utilities{border-top:1px solid var(--line);margin-top:1.25rem;padding-top:1rem}.collection-expiry{font-size:.72rem;color:var(--muted);margin:.75rem 0 0}.collection-mobile{display:none}.collection-main{min-width:0}.page-navigation{display:flex;justify-content:space-between;gap:1rem;margin-top:1.5rem;font-size:.9rem}.page-navigation a{max-width:48%}
@media(max-width:850px){.collection-layout{display:block}.collection-sidebar{display:none}.collection-mobile{display:block;background:var(--paper);margin:0 0 1rem}.collection-mobile nav{margin-top:1rem}}
@media(max-width:640px){html{font-size:16px}.container{padding:0}.theme-controls{padding:.75rem 1.1rem;margin:0}.collection-mobile{margin:0 .75rem 1rem}.page-navigation{padding:0 1.1rem 1.5rem}.document{border:0;border-radius:0;box-shadow:none;padding:1.5rem 1.1rem}.columns,.columns-3{grid-template-columns:1fr;gap:.85rem}h2{margin-top:1.6em}th,td{padding:.65rem .8rem}}
@media(max-width:640px){.site-header{padding:.85rem 1.1rem;margin-bottom:.75rem;align-items:flex-start;gap:.5rem}.site-header .theme-controls{padding:0}.site-header .theme-controls label{display:none}.site-title{font-size:.85rem}.page-tools{gap:.5rem;margin-bottom:1rem!important}.page-position{font-size:.7rem}.context-actions{font-size:.75rem}.page-menu .action-options{width:210px}}
@media print{.site-header,.page-tools,.context-actions,.theme-controls,.collection-sidebar,.collection-mobile,.page-navigation{display:none}.collection-layout{display:block}:root,:root[data-theme]{color-scheme:light;--bg:#fff;--paper:#fff;--ink:#000;--muted:#444;--line:#ccc;--soft:#f5f5f5;--accent:#234e7c;--code-comment:#555;--code-keyword:#60346d;--code-string:#245634;--code-number:#733d19}html{font-size:11pt}body{background:white}.container{max-width:none;padding:0}.document{border:0;padding:0;box-shadow:none}.document>div{max-width:none}h1,h2,h3,h4,summary{break-after:avoid}pre,blockquote,.card,.callout{break-inside:avoid}pre{white-space:pre-wrap;overflow-wrap:anywhere}.table-scroll{overflow:visible}th,td{min-width:0}a{color:inherit}.columns{display:block}.columns>*{margin-bottom:1rem}.diagram-canvas{overflow:visible}.diagram svg{max-width:100%!important}.diagram-hint{display:none}details:not([open])::after{content:"Expand this section in the web version to read more.";display:block;font-size:.85em;color:var(--muted);margin-top:.5rem}}
</style>
<script type="module" src="/assets/document.js" defer></script>
</head>
<body><main class="container${navigation ? ' collection' : ''}"><header class="site-header">${navigation ? `<a class="site-title" href="${escapeHtml(navigation.url)}">${escapeHtml(navigation.title)}</a>` : '<span class="site-title">Artifacts</span>'}<div class="theme-controls"><label for="theme-preference">Appearance</label><select id="theme-preference" aria-label="Color theme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div></header>${navigation ? `<div class="collection-layout"><aside class="collection-sidebar">${contents}</aside><div class="collection-main"><details class="collection-mobile"${navigation.currentUrl ? '' : ' open'}><summary>Collection <span class="page-position">${navigation.pages.length} pages</span></summary>${contents}</details><article class="document"${annotationAttrs}>${pageTools}${body}</article>${adjacent}</div></div>` : `<article class="document"${annotationAttrs}>${pageTools}${body}</article>`}</main></body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
