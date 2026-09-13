import { Router } from 'express';
import { findCollection, findPage, getPages } from './collections';
import { renderDocument } from './render';
import { renderMarkdownPage } from './views/markdown';
import { UPLOAD_CSP } from './routes';

const escape = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export const collectionViews = Router();
function navigation(id: string, currentUrl?: string) {
  const collection = findCollection(id);
  if (!collection) return null;
  const url = `/c/${collection.id}`;
  return { title:collection.title, url, expiresAt:collection.expires_at, currentUrl,
    pages:getPages(id).map(p=>({title:p.title,url:`${url}/p/${p.id}`})) };
}
collectionViews.get('/c/:collectionId', (req,res)=>{
  const nav = navigation(req.params.collectionId);
  if (!nav) return res.status(404).send('Not found');
  const links = nav.pages.map(p=>`<li><a href="${escape(p.url)}">${escape(p.title)}</a></li>`).join('');
  return res.type('html').send(renderMarkdownPage(nav.title,`<h1>${escape(nav.title)}</h1><p>Choose a page to start reading.</p><ol class="collection-contents">${links}</ol>`,nav));
});
collectionViews.get('/c/:collectionId/p/:pageId', (req,res)=>{
  const {collectionId,pageId}=req.params;
  const page = findPage(collectionId,pageId);
  const nav = navigation(collectionId,`/c/${collectionId}/p/${pageId}`);
  if (!page || !nav) return res.status(404).send('Not found');
  let html: string;
  if (page.type==='html') {
    html=`<h1>${escape(page.title)}</h1><iframe class="artifact-frame" title="${escape(page.title)}" sandbox="allow-scripts" referrerpolicy="no-referrer" src="/c/${collectionId}/p/${pageId}/content"></iframe><p><a href="/c/${collectionId}/p/${pageId}/download">Download this page</a></p>`;
  } else {
    const links = new Map(getPages(collectionId).map(p=>[p.key,`/c/${collectionId}/p/${p.id}`]));
    const resolveLink = (href: string) => {
      if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(href)) return href;
      const match = /^(?:\.\/)?([^/?#]+)([?#].*)?$/.exec(href);
      if (!match) return href;
      let key: string;
      try { key=decodeURIComponent(match[1]); } catch { return href; }
      return links.has(key) ? links.get(key)!+(match[2]??'') : href;
    };
    try { html=renderDocument(page.content,resolveLink).html; }
    catch { html=`<h1>${escape(page.title)}</h1><p>Some formatting could not be shown. Here is the saved text.</p><pre>${escape(page.content)}</pre>`; }
  }
  return res.type('html').send(renderMarkdownPage(page.title,html,nav));
});
collectionViews.get('/c/:collectionId/p/:pageId/:mode', (req,res)=>{
  if (!['content','download'].includes(req.params.mode)) return res.status(404).send('Not found');
  const page=findPage(req.params.collectionId,req.params.pageId);
  if (!page) return res.status(404).send('Not found');
  res.set('Content-Security-Policy',UPLOAD_CSP);
  if(req.params.mode==='download')res.attachment(page.key.includes('.')?page.key:page.key+(page.type==='html'?'.html':'.md'));
  res.type(page.type==='html'?'text/html; charset=utf-8':'text/plain; charset=utf-8');
  return res.send(Buffer.from(page.content,'utf8'));
});
