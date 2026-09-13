// Real browser checks on an isolated local app. No hosted writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
const require=createRequire(import.meta.url),dir=fs.mkdtempSync(path.join(os.tmpdir(),'artifacts-browser-'));
process.env.DB_PATH=path.join(dir,'db.sqlite');
let app,leaks=0;
const server=http.createServer((req,res)=>{if(req.url==='/__leak')leaks++;app?app(req,res):res.end();});
server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base='http://127.0.0.1:'+server.address().port;process.env.ARTIFACTS_URL=base;
app=require('../dist/app.js').createApp();const db=require('../dist/db.js').default;
const out=path.resolve('test-results');fs.mkdirSync(out,{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let browser;const report={checks:[]};
async function create(type,content){const r=await fetch(base+'/api/artifacts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type,content})});assert.equal(r.status,201,await r.clone().text());return (await r.json()).url;}
try{
 browser=await chromium.launch({headless:true,...(fs.existsSync(chrome)?{executablePath:chrome}:{})});
 const context=await browser.newContext({viewport:{width:1100,height:900},colorScheme:'light'});
 const page=await context.newPage();
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 const doc=await create('markdoc',fs.readFileSync('examples/readable-write-ups.md','utf8'));
 await page.goto(doc);await page.locator('.diagram svg').waitFor();
 assert.equal(await page.locator('h1').textContent(),'Write less layout. Explain more clearly.');
 await page.getByText('What belongs in the shared page?',{exact:true}).click();
 assert.equal(await page.locator('article details[open]').count(),1);
 await page.screenshot({path:path.join(out,'document-desktop.png'),fullPage:true});
 await page.emulateMedia({colorScheme:'dark'});await page.reload();await page.locator('.diagram svg').waitFor();
 await page.screenshot({path:path.join(out,'document-dark.png'),fullPage:true});
 await page.emulateMedia({colorScheme:'light'});await page.setViewportSize({width:390,height:844});await page.reload();await page.locator('.diagram svg').waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no page-wide mobile overflow');
 assert.equal(await page.locator('.columns').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),1);
 assert.ok(await page.locator('.diagram svg').evaluate(e=>e.getBoundingClientRect().width/e.viewBox.baseVal.width>=0.98),'diagram labels are not shrunk on phones');
 await page.locator('.diagram-hint').waitFor({state:'visible'});
 await page.screenshot({path:path.join(out,'document-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);assert.ok(requests.every(u=>u.startsWith(base+'/')||u.startsWith('data:')),'document assets stay local');
 report.checks.push('desktop/mobile/light/dark; disclosure control; Mermaid SVG; no external requests or page-wide overflow');
 const diagrams=await create('markdoc','# More views\n\n```mermaid\nsequenceDiagram\n  User->>Service: Save the note\n  Service-->>User: Return the link\n```\n\n```mermaid\nstateDiagram-v2\n  [*] --> Draft\n  Draft --> Shared\n```\n\n```mermaid\nthis is not a diagram\n```');
 await page.goto(diagrams);await page.waitForFunction(()=>document.querySelectorAll('.diagram svg').length===2&&document.querySelector('.diagram-error'));
 assert.match(await page.locator('.diagram-error').textContent(),/could not be drawn/);
 report.checks.push('sequence/state diagrams render; invalid diagrams keep readable source');
 const visual=await create('html',fs.readFileSync('examples/focused-visual.html','utf8'));
 await page.goto(visual);const frame=page.frameLocator('iframe');await frame.locator('#balance').focus();await frame.locator('#balance').press('ArrowRight');
 assert.equal(await frame.locator('#value').textContent(),'76%');
 await page.screenshot({path:path.join(out,'html-mobile.png'),fullPage:true});
 report.checks.push('standalone HTML renders and its keyboard-controlled interaction works');
 const hostile=await create('html',`<!doctype html><body><p id="done">waiting</p><img src="${base}/__leak"><script>
 let results={};
 try{parent.document.body.dataset.escaped='yes';results.parent=false}catch{results.parent=true}
 try{localStorage.setItem('test','x');results.storage=false}catch{results.storage=true}
 fetch('${base}/__leak').then(()=>{results.network=false}).catch(()=>{results.network=true}).finally(()=>{document.querySelector('#done').textContent=JSON.stringify(results)});
 </script></body>`);
 await page.goto(hostile);await page.frameLocator('iframe').locator('#done').filter({hasText:'network'}).waitFor();
 const blocked=JSON.parse(await page.frameLocator('iframe').locator('#done').textContent());
 assert.deepEqual(blocked,{parent:true,storage:true,network:true});assert.equal(leaks,0);assert.equal(await page.evaluate(()=>document.body.dataset.escaped),undefined);
 await page.goto(hostile+'/content');await page.locator('#done').filter({hasText:'network'}).waitFor();
 const direct=JSON.parse(await page.locator('#done').textContent());assert.equal(direct.storage,true);assert.equal(direct.network,true);assert.equal(leaks,0);
 report.checks.push('HTML frame cannot read parent/storage or send requests; direct content URL also isolates storage/network');
 const attack=await create('markdown','# Safe text\n\n<script>document.body.dataset.escaped="yes"</script>\n\n<img src=x onerror="alert(1)">');
 await page.goto(attack);assert.equal(await page.evaluate(()=>document.body.dataset.escaped),undefined);assert.equal(await page.locator('article script, article img').count(),0);
 report.checks.push('raw HTML in Markdown remains text, not running elements');
 const manifest=JSON.parse(fs.readFileSync('examples/collection/collection.json','utf8'));
 const collectionPayload={title:manifest.title,pages:manifest.pages.map(p=>({key:p.key,title:p.title,type:p.type,content:fs.readFileSync('examples/collection/'+p.file,'utf8')}))};
 collectionPayload.pages.push({key:'visual.html',title:'Try a visual',type:'html',content:fs.readFileSync('examples/focused-visual.html','utf8')});
 const cr=await fetch(base+'/api/collections',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(collectionPayload)});assert.equal(cr.status,201);const collection=await cr.json();
 await page.setViewportSize({width:1200,height:900});await page.goto(collection.url);
 await page.locator('.document a').first().click();assert.equal(page.url(),collection.pages[0].url);
 await page.locator('.document').getByRole('link',{name:'choose a useful view',exact:true}).click();assert.equal(page.url(),collection.pages[1].url);await page.locator('.diagram svg').waitFor();
 assert.equal(await page.locator('.collection-sidebar [aria-current="page"]').count(),1);
 assert.equal(await page.locator('a[rel="prev"]').getAttribute('href'),new URL(collection.pages[0].url).pathname);
 assert.equal(await page.locator('a[rel="next"]').getAttribute('href'),new URL(collection.pages[2].url).pathname);
 await page.screenshot({path:path.join(out,'collection-desktop.png'),fullPage:true});
 const oldDiagram=await page.locator('.diagram svg').getAttribute('id');
 await page.getByLabel('Color theme').selectOption('dark');await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
 await page.waitForFunction(old=>document.querySelector('.diagram svg')?.id!==old,oldDiagram);
 assert.equal(await page.evaluate(()=>localStorage.getItem('artifacts-theme')),'dark');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),'dark');
 await page.screenshot({path:path.join(out,'collection-dark.png'),fullPage:true});
 await page.locator('a[rel="next"]').click();assert.equal(page.url(),collection.pages[2].url);assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 const tab=await page.context().newPage();await tab.goto(collection.pages[0].url);assert.equal(await tab.locator('html').getAttribute('data-theme'),'dark');
 await tab.getByLabel('Color theme').selectOption('light');await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
 await page.emulateMedia({colorScheme:'dark'});assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
 await page.getByLabel('Color theme').selectOption('system');await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
 assert.equal(await page.evaluate(()=>localStorage.getItem('artifacts-theme')),null);await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');await tab.close();
 await page.goto(collection.pages[3].url);await page.getByLabel('Color theme').selectOption('dark');
 assert.equal(await page.locator('iframe').evaluate(e=>getComputedStyle(e).colorScheme),'dark');
 await page.frameLocator('iframe').locator('#balance').focus();await page.frameLocator('iframe').locator('#balance').press('ArrowRight');assert.equal(await page.frameLocator('iframe').locator('#value').textContent(),'76%');
 await page.getByLabel('Color theme').selectOption('system');await page.goto(collection.pages[0].url);await page.locator('.document').getByRole('link',{name:'sharing',exact:true}).click();assert.equal(page.url(),collection.pages[2].url+'#keep-a-copy');
 await page.setViewportSize({width:390,height:844});await page.goto(collection.pages[1].url);await page.locator('.diagram svg').waitFor();
 await page.locator('.collection-mobile > summary').click();assert.equal(await page.locator('.collection-mobile[open]').count(),1);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,'collection-mobile.png'),fullPage:true});
 await page.locator('.collection-mobile').getByRole('link',{name:'Start here',exact:true}).click();assert.equal(page.url(),collection.pages[0].url);
 const unavailable=await browser.newContext({colorScheme:'dark'});await unavailable.addInitScript(()=>{Object.defineProperty(Storage.prototype,'getItem',{value(){throw Error('Disabled')}});Object.defineProperty(Storage.prototype,'setItem',{value(){throw Error('Disabled')}});Object.defineProperty(Storage.prototype,'removeItem',{value(){throw Error('Disabled')}});});
 const blockedPage=await unavailable.newPage();await blockedPage.goto(collection.url);assert.equal(await blockedPage.locator('html').getAttribute('data-theme'),'dark');await blockedPage.getByLabel('Color theme').selectOption('light');assert.equal(await blockedPage.locator('html').getAttribute('data-theme'),'light');await unavailable.close();
 const bootContext=await browser.newContext({colorScheme:'light'});await bootContext.addInitScript(()=>localStorage.setItem('artifacts-theme','dark'));const bootPage=await bootContext.newPage();await bootPage.route('**/assets/document.js',route=>route.abort());await bootPage.goto(collection.url);assert.equal(await bootPage.locator('html').getAttribute('data-theme'),'dark');assert.equal(await bootPage.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(21, 25, 31)');assert.equal(await bootPage.getByLabel('Color theme').isDisabled(),true,'theme choices wait for the main change handler');await bootContext.close();
 report.checks.push('collection sidebar/mobile contents/prev-next/relative links/anchors; saved theme survives navigation/reload/tabs; system changes, blocked storage, and saved colors before the main script; diagrams redraw and the HTML frame receives the chosen color-scheme style');
 // Exercise context controls with a deterministic clipboard, independent of host permissions.
 await page.addInitScript(()=>{
  window.__copiedMarkdown=null;window.__clipboardFails=false;
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{async writeText(text){
   if(window.__clipboardFails)throw new DOMException('Clipboard denied','NotAllowedError');
   window.__copiedMarkdown=text;
  }}});
 });
 async function checkMenuDismissal(menu){
  const summary=menu.locator(':scope > summary');
  await menu.getByRole('link').first().focus();
  await page.keyboard.press('Escape');
  assert.equal(await menu.evaluate(e=>e.open),false,'Escape closes the action menu');
  assert.equal(await summary.evaluate(e=>e===document.activeElement),true,'Escape restores summary focus');
  await summary.click();
  await page.getByLabel('Color theme',{exact:true}).click();
  assert.equal(await menu.evaluate(e=>e.open),false,'outside click closes the action menu');
  await page.keyboard.press('Escape');
 }
 async function checkCopy(url,expected,{failure=false,endpoint}={}){
  await page.goto(url);
  const button=page.locator('.context-actions').getByRole('button',{name:'Copy page as Markdown',exact:true});
  assert.equal((await button.textContent()).trim(),'Copy page');
  assert.ok(await button.isVisible(),'copy control is visible');
  if(endpoint)assert.equal(await button.getAttribute('data-copy-markdown'),endpoint);
  const pageMenu=page.locator('.context-actions details.page-menu');
  const summary=pageMenu.getByLabel('More page actions',{exact:true});
  await summary.click();
  assert.ok(await pageMenu.getByRole('link',{name:'View Markdown source',exact:true}).isVisible());
  assert.ok(await pageMenu.getByRole('link',{name:'Download page source',exact:true}).isVisible());
  if(url===collection.pages[0].url&&!failure)await page.screenshot({path:path.join(out,`page-menu-${page.viewportSize().width}.png`),fullPage:true});
  await checkMenuDismissal(pageMenu);
  await page.evaluate(fails=>{window.__clipboardFails=fails;window.__copiedMarkdown=null;},failure);
  await button.click();
  if(failure){
   const fallback=page.locator('textarea[data-markdown-fallback]');
   await fallback.waitFor({state:'visible'});
   assert.equal(await fallback.inputValue(),expected,'fallback preserves exact Markdown');
   assert.equal(await fallback.evaluate(e=>e.readOnly),true);
   assert.equal(await page.evaluate(()=>window.__copiedMarkdown),null);
  }else{
   await page.waitForFunction(()=>window.__copiedMarkdown!==null);
   assert.equal(await page.evaluate(()=>window.__copiedMarkdown),expected,'clipboard preserves exact Markdown');
   await button.filter({hasText:'Copied'}).waitFor();
   assert.equal(await page.locator('textarea[data-markdown-fallback]:visible').count(),0);
  }
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('[role="status"]')).some(e=>e.textContent.trim()));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'context controls do not cause mobile overflow');
 }
 async function openCollectionExport(target){
  const sidebar=target.locator('.collection-sidebar');
  const navigation=await sidebar.isVisible()?sidebar:target.locator('.collection-mobile');
  if(await navigation.evaluate(e=>e.tagName==='DETAILS'&&!e.open))await navigation.locator(':scope > summary').click();
  const menu=navigation.locator('details.collection-export');
  if(!await menu.evaluate(e=>e.open))await menu.locator(':scope > summary').click();
  return menu;
 }
 async function checkDownloads(url){
  await page.goto(url);
  assert.equal(await page.locator('.context-actions .collection-export').count(),0);
  const menu=await openCollectionExport(page);
  const bodies=[];
  for(const [name,contentType] of [['Download collection Markdown','text/markdown'],['Download collection text','text/plain']]){
   const link=menu.getByRole('link',{name,exact:true});
   assert.ok(await link.isVisible(),name+' is visible');
   assert.ok((await link.textContent()).trim().startsWith(contentType==='text/markdown'?'Markdown (.md)':'Text file (.txt)'),'download label precedes its explanatory subtitle');
   const href=await link.getAttribute('href');assert.ok(href);
   const response=await page.request.get(new URL(href,page.url()).href);
   assert.equal(response.status(),200);
   assert.ok(response.headers()['content-type'].startsWith(contentType));
   assert.match(response.headers()['content-disposition'],/attachment/);
   bodies.push(await response.text());
  }
  assert.equal(bodies[0],bodies[1],'Markdown and text downloads contain the same complete collection');
  let previous=-1;
  for(const source of collectionPayload.pages){
   const position=bodies[0].indexOf(source.content);
   assert.ok(position>previous,'download contains each original page in order');previous=position;
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'download controls fit the viewport');
  if(url===collection.url)await page.screenshot({path:path.join(out,`collection-export-${page.viewportSize().width}.png`),fullPage:true});
  await checkMenuDismissal(menu);
 }
 for(const viewport of [{width:1200,height:900},{width:390,height:844}]){
  await page.setViewportSize(viewport);
  await checkDownloads(collection.url);
  for(let i=0;i<collection.pages.length;i++){
   const source=collectionPayload.pages[i];
   const expected=source.type==='html'?'```html\n'+source.content+(source.content.endsWith('\n')?'':'\n')+'```\n':source.content;
   await checkDownloads(collection.pages[i].url);
   await checkCopy(collection.pages[i].url,expected,{endpoint:new URL(collection.pages[i].url).pathname+'/markdown'});
  }
  await checkCopy(doc,fs.readFileSync('examples/readable-write-ups.md','utf8'));
  const htmlSource=fs.readFileSync('examples/focused-visual.html','utf8');
  await checkCopy(visual,'```html\n'+htmlSource+(htmlSource.endsWith('\n')?'':'\n')+'```\n');
  await checkCopy(collection.pages[0].url,collectionPayload.pages[0].content,{failure:true});
  await checkCopy(doc,fs.readFileSync('examples/readable-write-ups.md','utf8'),{failure:true});
  await page.screenshot({path:path.join(out,`markdown-fallback-${viewport.width}.png`),fullPage:true});
 }
 const realClipboardPage=await context.newPage();
 await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:base});
 await realClipboardPage.goto(collection.pages[0].url);
 await realClipboardPage.getByRole('button',{name:'Copy page as Markdown',exact:true}).click();
 await realClipboardPage.getByRole('status').filter({hasText:'Markdown copied.'}).waitFor();
 assert.equal(await realClipboardPage.evaluate(()=>navigator.clipboard.readText()),collectionPayload.pages[0].content);
 const exportMenu=await openCollectionExport(realClipboardPage);
 const downloadEvent=realClipboardPage.waitForEvent('download');
 await exportMenu.getByRole('link',{name:'Download collection Markdown',exact:true}).click();
 const download=await downloadEvent;assert.match(download.suggestedFilename(),/\.md$/);
 assert.ok(fs.readFileSync(await download.path(),'utf8').includes(collectionPayload.pages[0].content));
 await realClipboardPage.route('**/markdown',route=>route.fulfill({status:404,body:'Not found'}));
 await realClipboardPage.getByRole('button',{name:'Copy page as Markdown',exact:true}).click();
 await realClipboardPage.getByRole('status').filter({hasText:'Could not load Markdown'}).waitFor();
 assert.equal(await realClipboardPage.getByRole('button',{name:'Copy page as Markdown',exact:true}).isEnabled(),true);
 await realClipboardPage.close();
 report.checks.push('real browser clipboard and file download work; failed source fetch is announced and can be retried');
 report.checks.push('desktop/mobile page and collection menus close on Escape with summary focus restored, and on outside click; open-menu screenshots captured');
 report.checks.push('desktop/mobile collection home and all page download links return complete ordered Markdown/text; collection and standalone copy preserve exact Markdown; denied clipboard exposes readonly source and announces status without overflow');
 report.result='PASS';
}catch(e){report.result='FAIL';report.error=e.stack;}
finally{await browser?.close();await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true,force:true});fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));process.exitCode=report.result==='PASS'?0:1;}
