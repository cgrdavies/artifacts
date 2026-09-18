import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),publisher=new URL('../pi/skills/artifact-writeup/scripts/publish-collection.mjs',import.meta.url).pathname;
test('collection publisher keeps an unverified edit receipt and never forwards it to another service',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'collection-publisher-'));
 const folder=path.join(dir,'docs');fs.mkdirSync(folder);fs.writeFileSync(path.join(dir,'outside.md'),'# Outside');
 const manifest=path.join(folder,'collection.json');fs.writeFileSync(path.join(folder,'a.md'),'# A');fs.writeFileSync(manifest,JSON.stringify({title:'A',pages:[{key:'a.md',title:'A',file:'a.md'}]}));
 const id='11111111-1111-4111-8111-111111111111',pageId='22222222-2222-4222-8222-222222222222',token='a'.repeat(64);
 let base,posts=0,protectedEdits=true,brokenResponse=false;const requests=[];
 const server=http.createServer(async(req,res)=>{
  requests.push({url:req.url,authorization:req.headers.authorization});res.setHeader('x-robots-tag','noindex');res.setHeader('referrer-policy','no-referrer');res.setHeader('content-type','application/json');
  if(req.url==='/api/capabilities')return res.end(JSON.stringify({version:2,htmlIsolation:'sandbox',collections:{version:1,stablePageLinks:true,sharedExpiry:true,editTokenRequired:protectedEdits}}));
  if(req.method==='POST'){posts++;if(brokenResponse)return res.end('{');let body='';for await(const chunk of req)body+=chunk;const value=JSON.parse(body);return res.end(JSON.stringify({id,title:value.title,url:base+'/c/'+id,expiresAt:'2030-01-01T00:00:00.000Z',editToken:token,pages:value.pages.map(p=>({...p,id:pageId,url:base+'/c/'+id+'/p/'+pageId}))}));}
  res.statusCode=404;res.end('{}');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 const run=(args=[],url=base)=>exec(process.execPath,[publisher,manifest,...args],{env:{...process.env,ARTIFACTS_URL:url},timeout:10000});
 try{
  await assert.rejects(run(),e=>{assert.ok(e.stderr.includes(base+'/c/'+id));assert.ok(!e.stderr.includes(token));assert.equal(e.stdout,'');return true;});assert.equal(posts,1);
  const receipt=manifest+'.artifact.json',history=JSON.parse(fs.readFileSync(receipt));assert.equal(history[0].verified,false);assert.equal(history[0].editToken,token);assert.equal(fs.statSync(receipt).mode&0o777,0o600);
  // Same server, different service URL: the existing key must not be used.
  history[0].url='https://elsewhere.test/c/'+id;fs.writeFileSync(receipt,JSON.stringify(history));requests.length=0;
  await assert.rejects(run(['--update',id]),e=>/local receipt/.test(e.stderr));assert.equal(posts,1);assert.ok(requests.every(r=>r.authorization===undefined));assert.deepEqual(requests.map(r=>r.url),['/api/capabilities']);
  brokenResponse=true;await assert.rejects(run(),e=>/may have been saved/.test(e.stderr)&&/Do not retry blindly/.test(e.stderr));assert.equal(posts,2);
  protectedEdits=false;await assert.rejects(run(),e=>/Nothing was uploaded/.test(e.stderr));assert.equal(posts,2);
  fs.writeFileSync(manifest,JSON.stringify({title:'A',pages:[{title:'A',file:'../outside.md'}]}));requests.length=0;
  await assert.rejects(run(),e=>/inside the manifest folder/.test(e.stderr));assert.equal(requests.length,0);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});

test('collection publisher reports a safe server validation message',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'collection-publisher-error-'));
 const manifest=path.join(dir,'collection.json');fs.writeFileSync(path.join(dir,'a.md'),'# A');fs.writeFileSync(manifest,JSON.stringify({title:'A',pages:[{key:'a.md',title:'A',file:'a.md'}]}));
 const server=http.createServer(async(req,res)=>{
  res.setHeader('x-robots-tag','noindex');res.setHeader('referrer-policy','no-referrer');res.setHeader('content-type','application/json');
  if(req.url==='/api/capabilities')return res.end(JSON.stringify({version:2,htmlIsolation:'sandbox',collections:{version:1,stablePageLinks:true,sharedExpiry:true,editTokenRequired:true}}));
  res.statusCode=400;res.end(JSON.stringify({error:'The document has unsupported markup.\nCheck its links.'}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{await assert.rejects(exec(process.execPath,[publisher,manifest],{env:{...process.env,ARTIFACTS_URL:base},timeout:10000}),e=>/HTTP 400: The document has unsupported markup\. Check its links\./.test(e.stderr));}
 finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
