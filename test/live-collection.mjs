// Read an already-published harmless example; do not create or retry uploads.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
const url=new URL(process.env.COLLECTION_URL||'');
assert.match(url.pathname,/^\/c\/[a-f0-9-]{36}$/);
const id=url.pathname.split('/').at(-1),base=url.origin;
const report={url:url.href,checks:[]};
const get=async address=>{const r=await fetch(address,{redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);assert.match(r.headers.get('x-robots-tag')||'',/noindex/);assert.equal(r.headers.get('referrer-policy'),'no-referrer');return r;};
let browser;
try{
 const caps=await (await get(base+'/api/capabilities')).json();assert.equal(caps.version,2);assert.equal(caps.collections.version,1);assert.equal(caps.collections.editTokenRequired,true);assert.equal(caps.theme.savedPreference,true);assert.equal(caps.contextExport.pageMarkdown,true);
 const collection=await (await get(base+'/api/collections/'+id)).json();assert.equal(collection.editToken,undefined);assert.equal(collection.pages.length,3);
 for(const p of collection.pages){const r=await get(p.url);await r.arrayBuffer();assert.equal(await (await get(p.url+'/content')).text(),p.content);}
 const denied=await fetch(base+'/api/collections/'+id,{method:'PUT',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'content-type':'application/json'},body:JSON.stringify({title:collection.title,pages:collection.pages.map(({id,key,title,type,content})=>({id,key,title,type,content}))})});assert.equal(denied.status,403);
 const markdown=await (await get(collection.url+'/export.md')).text();
 const text=await get(collection.url+'/export.txt');assert.match(text.headers.get('content-disposition')||'',/attachment/);assert.equal(await text.text(),markdown);
 let previous=-1;for(const p of collection.pages){const index=markdown.indexOf(p.content);assert.ok(index>previous);previous=index;assert.equal(await (await get(p.url+'/markdown')).text(),p.content);}
 report.checks.push('live capabilities, no-index/no-referrer, exact source, no edit key in public metadata, unauthenticated edit denied, complete ordered collection exports');
 const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';browser=await chromium.launch({headless:true,...(fs.existsSync(chrome)?{executablePath:chrome}:{})});
 const context=await browser.newContext({viewport:{width:1200,height:900},colorScheme:'light'});const page=await context.newPage();
 await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:base});
 const failures=[];page.on('pageerror',e=>failures.push(e.message));
 await page.goto(collection.url);await page.locator('.document a').first().click();assert.equal(page.url(),collection.pages[0].url);
 await page.locator('.document').getByRole('link',{name:'choose a useful view',exact:true}).click();assert.equal(page.url(),collection.pages[1].url);await page.locator('.diagram svg').waitFor();
 await page.getByLabel('Color theme').selectOption('dark');await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 await page.locator('.diagram svg').waitFor();fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/live-collection-dark.png',fullPage:true});
 await page.locator('a[rel="next"]').click();assert.equal(page.url(),collection.pages[2].url);await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
 await page.getByLabel('Color theme').selectOption('system');await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
 await page.setViewportSize({width:390,height:844});await page.goto(collection.pages[1].url);await page.locator('.diagram svg').waitFor();await page.locator('.collection-mobile > summary').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'test-results/live-collection-mobile.png',fullPage:true});
 await page.locator('.collection-mobile').getByRole('link',{name:'Start here',exact:true}).click();assert.equal(page.url(),collection.pages[0].url);await page.locator('.document').getByRole('link',{name:'sharing',exact:true}).click();assert.equal(page.url(),collection.pages[2].url+'#keep-a-copy');
 await page.goto(collection.pages[0].url);
 await page.getByRole('button',{name:'Copy Markdown',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Markdown copied.'}).waitFor();
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),collection.pages[0].content);
 const downloadEvent=page.waitForEvent('download');await page.getByRole('link',{name:'Download collection Markdown',exact:true}).click();const download=await downloadEvent;
 assert.match(download.suggestedFilename(),/\.md$/);assert.equal(fs.readFileSync(await download.path(),'utf8'),markdown);
 report.checks.push('live mobile UI copies exact source using real browser clipboard and downloads the complete Markdown file');
 if(process.env.HTML_SAMPLE_URL){const htmlUrl=new URL(process.env.HTML_SAMPLE_URL);assert.equal(htmlUrl.origin,base);const source=await get(htmlUrl.href+'/content');assert.match(source.headers.get('content-security-policy')||'',/sandbox allow-scripts/);assert.doesNotMatch(source.headers.get('content-security-policy')||'',/allow-same-origin/);await source.arrayBuffer();await page.goto(htmlUrl.href);assert.equal(await page.locator('iframe').getAttribute('sandbox'),'allow-scripts');await page.frameLocator('iframe').locator('#balance').focus();await page.frameLocator('iframe').locator('#balance').press('ArrowRight');assert.equal(await page.frameLocator('iframe').locator('#value').textContent(),'76%');report.checks.push('existing live HTML still has isolated direct content and working keyboard interaction');}
 assert.deepEqual(failures,[]);report.checks.push('live desktop/mobile contents, page links/anchors, previous/next, Mermaid, saved theme across reload/navigation, live system changes');report.expiresAt=collection.expiresAt;report.result='PASS';
}catch(error){report.result='FAIL';report.error=error.message;process.exitCode=1;}
finally{await browser?.close();fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/live-collection.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
