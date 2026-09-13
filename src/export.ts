import type { Collection, CollectionPage } from './collections';

/** Keep authored Markdown intact; represent HTML as source, never as a live page. */
export function pageMarkdown(page: Pick<CollectionPage, 'type' | 'content'>): string {
  if (page.type !== 'html') return page.content;
  const runs = page.content.match(/`+/g) ?? [];
  const fence = '`'.repeat(runs.reduce((length, run) => Math.max(length, run.length + 1), 3));
  return `${fence}html\n${page.content}${page.content.endsWith('\n') ? '' : '\n'}${fence}\n`;
}

// Titles are metadata, not authored markup. Keep them on one safe heading line.
function heading(title: string): string {
  return title.replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/[\\`*_{}\[\]()#+.!|<>~-]/g, '\\$&');
}

/** Both downloads use readable Markdown so context and original source survive. */
export function collectionMarkdown(collection: Pick<Collection, 'title'>, pages: CollectionPage[]): string {
  const sections = [...pages].sort((a, b) => a.position - b.position).map(page =>
    `## ${heading(page.title)}\n\nKey: ${page.key}\n\n${pageMarkdown(page)}`);
  return `# ${heading(collection.title)}\n\n${sections.join('\n\n---\n\n')}\n`;
}
