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
 const page=await browser.newPage({viewport:{width:1100,height:900},colorScheme:'light'});
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 const doc=await create('markdoc',fs.readFileSync('examples/readable-write-ups.md','utf8'));
 await page.goto(doc);await page.locator('.diagram svg').waitFor();
 assert.equal(await page.locator('h1').textContent(),'Write less layout. Explain more clearly.');
 await page.getByText('What belongs in the shared page?',{exact:true}).click();
 assert.equal(await page.locator('details[open]').count(),1);
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
 report.result='PASS';
}catch(e){report.result='FAIL';report.error=e.stack;}
finally{await browser?.close();await new Promise(r=>server.close(r));db.close();fs.rmSync(dir,{recursive:true,force:true});fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));process.exitCode=report.result==='PASS'?0:1;}
