import Markdoc, { Config, Node, Schema, Tag } from '@markdoc/markdoc';
import hljs from 'highlight.js';
import { randomUUID } from 'node:crypto';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const tags: Record<string, Schema> = {
  callout: {
    inline: false,
    attributes: {
      title: { type: String },
      tone: { type: String, default: 'note', matches: ['note', 'warning', 'success'] },
    },
    transform(node, config) {
      const { title, tone = 'note' } = node.attributes;
      return new Tag('aside', { class: `callout callout-${tone}` }, [
        ...(title ? [new Tag('p', { class: 'block-title' }, [title])] : []),
        ...node.transformChildren(config),
      ]);
    },
  },
  columns: {
    inline: false,
    attributes: { count: { type: Number, default: 2 } },
    transform(node, config) {
      return new Tag('div', { class: `columns columns-${node.attributes.count ?? 2}` }, node.transformChildren(config));
    },
  },
  card: {
    inline: false,
    attributes: { title: { type: String } },
    transform(node, config) {
      return new Tag('section', { class: 'card' }, [
        ...(node.attributes.title ? [new Tag('p', { class: 'block-title' }, [node.attributes.title])] : []),
        ...node.transformChildren(config),
      ]);
    },
  },
  details: {
    inline: false,
    attributes: { summary: { type: String, required: true } },
    transform(node, config) {
      return new Tag('details', {}, [
        new Tag('summary', {}, [node.attributes.summary]),
        new Tag('div', { class: 'details-body' }, node.transformChildren(config)),
      ]);
    },
  },
  steps: {
    inline: false,
    attributes: {},
    transform(node, config) {
      return new Tag('div', { class: 'steps' }, node.transformChildren(config));
    },
  },
};

function safeUrl(value: string, image: boolean): boolean {
  // Reject whitespace/control obfuscation, backslashes and network-path URLs.
  if (/[\u0000-\u0020\u007f-\u009f\\]/.test(value) || value.startsWith('//')) return false;
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(value);
  return !scheme || (image ? /^(https?)$/i : /^(https?|mailto|tel)$/i).test(scheme[1]);
}

/** Render the safe document subset. Invalid Markdoc throws an ordinary Error. */
export function renderDocument(content: string, resolveLink?: (href: string) => string): { title: string; html: string } {
  // HTML is text, and fence contents are never parsed as Markdoc expressions.
  const tokenizer = new Markdoc.Tokenizer({ html: false });
  const tokens = tokenizer.tokenize(content);
  for (const token of tokens) {
    if (token.type === 'fence') token.children = null;
  }
  const ast = Markdoc.parse(tokens);
  const codeBlocks = new Map<string, string>();
  const headingIds = new Set<string>();
  // CommonMark permits line breaks inside emphasis and links. Markdoc parses
  // them correctly but omits break nodes from these schemas, so its validator
  // otherwise rejects ordinary prose wrapped across source lines.
  const inlineChildren = (schema: Schema): Schema => ({
    ...schema,
    children: [...(schema.children ?? []), 'softbreak', 'hardbreak'] as Schema['children'],
  });
  const config: Config = {
    tags,
    nodes: {
      document: { ...Markdoc.nodes.document, render: 'div' },
      heading: {
        ...Markdoc.nodes.heading,
        transform(node, cfg) {
          const base = text(node).normalize('NFKD').replace(/\p{Mark}/gu, '').toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-+|-+$/g, '') || 'section';
          let id = base, suffix = 2;
          while (headingIds.has(id)) id = `${base}-${suffix++}`;
          headingIds.add(id);
          return new Tag(`h${node.attributes.level}`, { id }, node.transformChildren(cfg));
        },
      },
      strong: inlineChildren(Markdoc.nodes.strong),
      em: inlineChildren(Markdoc.nodes.em),
      s: inlineChildren(Markdoc.nodes.s),
      link: {
        ...inlineChildren(Markdoc.nodes.link),
        transform(node, cfg) {
          const href = resolveLink ? resolveLink(String(node.attributes.href)) : String(node.attributes.href);
          if (!safeUrl(href, false)) throw new Error('Unsafe link URL');
          return new Tag('a', { href, ...(node.attributes.title ? { title: node.attributes.title } : {}) }, node.transformChildren(cfg));
        },
      },
      table: {
        ...Markdoc.nodes.table,
        transform(node, cfg) {
          return new Tag('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Table' }, [
            new Tag('table', {}, node.transformChildren(cfg)),
          ]);
        },
      },
      fence: {
        ...Markdoc.nodes.fence,
        transform(node) {
          const source = String(node.attributes.content ?? '');
          const language = String(node.attributes.language ?? '').trim().split(/\s+/)[0].toLowerCase();
          if (language === 'mermaid') return new Tag('pre', { class: 'mermaid' }, [source]);
          const plain = !language || ['pseudocode', 'text', 'tree', 'plain', 'plaintext', 'txt'].includes(language);
          const highlighted = !plain && hljs.getLanguage(language)
            ? hljs.highlight(source, { language, ignoreIllegals: true }).value
            : escapeHtml(source);
          // Only trusted highlight.js output enters this replacement map. Source text
          // cannot supply a token, and all other HTML goes through Markdoc escaping.
          const token = `CODEBLOCK${randomUUID()}END`;
          codeBlocks.set(token, `<pre class="code-block" tabindex="0"><code class="hljs">${highlighted}</code></pre>`);
          return token;
        },
      },
    },
  };

  let title = 'Untitled';
  let foundTitle = false;
  function text(node: Node): string {
    if (node.type === 'text' || node.type === 'code') return String(node.attributes.content ?? '');
    if (node.type === 'softbreak' || node.type === 'hardbreak') return ' ';
    return node.children.map(text).join('');
  }
  function inspect(node: Node): void {
    const schema: Schema | undefined = node.type === 'tag'
      ? (Object.prototype.hasOwnProperty.call(tags, node.tag ?? '') ? tags[node.tag!] : undefined)
      : config.nodes?.[node.type] ?? Markdoc.nodes[node.type];
    if (!schema) throw new Error(`Unsupported document element: ${node.tag ?? node.type}`);
    for (const [name, value] of Object.entries(node.attributes)) {
      if (!Object.prototype.hasOwnProperty.call(schema.attributes ?? {}, name)) {
        throw new Error(`Unsupported attribute: ${name}`);
      }
      // Variables, functions and object values are not part of this document format.
      if (value !== null && typeof value === 'object') throw new Error('Document expressions are not supported');
    }
    if (node.tag === 'columns' && node.attributes.count !== undefined && ![2, 3].includes(node.attributes.count)) {
      throw new Error('Columns count must be 2 or 3');
    }
    if (node.tag === 'details' && typeof node.attributes.summary === 'string' && !node.attributes.summary.trim()) {
      throw new Error('Details summary is required');
    }
    if (node.type === 'link' && !safeUrl(String(node.attributes.href), false)) throw new Error('Unsafe link URL');
    if (node.type === 'image' && !safeUrl(String(node.attributes.src), true)) throw new Error('Unsafe image URL');
    if (node.type === 'list' && typeof node.attributes.start === 'string') {
      node.attributes.start = Number(node.attributes.start);
    }
    if (node.type === 'fence') {
      node.attributes.process = false;
      // Markdoc may parse tags inside fences by default. Drop that AST; render only
      // the original literal fence content, including any example expressions.
      node.children = [];
    }
    if (!foundTitle && node.type === 'heading' && node.attributes.level === 1) {
      title = text(node).trim() || 'Untitled';
      foundTitle = true;
    }
    node.children.forEach(inspect);
  }
  inspect(ast);
  const errors = Markdoc.validate(ast, config);
  if (errors.length) throw new Error(`Invalid document: ${errors[0].error.message}`);
  let html = Markdoc.renderers.html(Markdoc.transform(ast, config));
  // A single replacement pass prevents generated code from becoming a template.
  html = html.replace(/CODEBLOCK[0-9a-f-]{36}END/g, token => codeBlocks.get(token) ?? token);
  return { title, html };
}
