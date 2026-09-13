#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
let createdUrl;
const fail=message=>{throw Error(message);};
try {
 const [input,flag,updateId,...extra]=process.argv.slice(2);
 if(!input || extra.length || (flag!==undefined&&(flag!=='--update'||!updateId)) || (updateId&&!/^[a-f0-9-]{36}$/.test(updateId)))fail('Usage: node publish-collection.mjs MANIFEST.json [--update COLLECTION_ID]');
 const manifestPath=fs.realpathSync(input),directory=path.dirname(manifestPath);
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 if(typeof manifest.title!=='string'||!manifest.title.trim()||manifest.title.length>200||!Array.isArray(manifest.pages)||!manifest.pages.length||manifest.pages.length>50)fail('Provide a title and 1 to 50 pages.');
 const seen=new Set();let total=0;
 const pages=manifest.pages.map(p=>{
  if(typeof p.file!=='string'||path.isAbsolute(p.file))fail('Page files must be relative to the manifest folder.');
  const source=fs.realpathSync(path.resolve(directory,p.file));
  const relative=path.relative(directory,source);
  if(relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative)||!fs.statSync(source).isFile())fail('Keep page files inside the manifest folder.');
  const key=p.key??path.basename(p.file),type=p.type??'markdoc';
  if(typeof key!=='string'||key.length>100||!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(key)||key.includes('..')||seen.has(key))fail('Use a unique plain filename or slug for each page key.');
  seen.add(key);
  if(typeof p.title!=='string'||!p.title.trim()||p.title.length>200||!['markdown','markdoc','html'].includes(type))fail('Each page needs a title and a supported type.');
  if(fs.statSync(source).size>10*1024*1024)fail('Collection content exceeds 10 MiB.');
  const bytes=fs.readFileSync(source);total+=bytes.length;
  if(total>10*1024*1024)fail('Collection content exceeds 10 MiB.');
  const content=bytes.toString('utf8');
  if(!content.trim()||!Buffer.from(content).equals(bytes))fail('Page files must contain non-empty UTF-8 text.');
  return {key,title:p.title,type,content,source,sha256:createHash('sha256').update(bytes).digest('hex'),...(p.id?{id:p.id}:{})};
 });
 const base=new URL(process.env.ARTIFACTS_URL||'https://artifacts.yeeted.lol');
 if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash)fail('Use an HTTP or HTTPS service address without credentials, a query or a fragment.');
 const baseUrl=base.href.replace(/\/$/,'');
 const privateHeaders=r=>/\bnoindex\b/i.test(r.headers.get('x-robots-tag')||'')&&r.headers.get('referrer-policy')==='no-referrer';
 const get=url=>fetch(url,{redirect:'error',signal:AbortSignal.timeout(20000)});
 const capabilities=await get(baseUrl+'/api/capabilities');
 if(!capabilities.ok||!privateHeaders(capabilities))fail('The service is not ready. Nothing was uploaded.');
 const caps=await capabilities.json();
 if(caps.version!==2||caps.collections?.version!==1||caps.collections?.stablePageLinks!==true||caps.collections?.sharedExpiry!==true||caps.collections?.editTokenRequired!==true||caps.htmlIsolation!=='sandbox')fail('The service does not support checked collections yet. Nothing was uploaded.');
 const receiptFile=manifestPath+'.artifact.json';
 const history=fs.existsSync(receiptFile)?JSON.parse(fs.readFileSync(receiptFile,'utf8')):[];
 if(!Array.isArray(history))fail('The local receipt file could not be read. Nothing was changed.');
 const saveHistory=()=>{const temp=receiptFile+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(temp,JSON.stringify(history,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temp,receiptFile);}finally{fs.rmSync(temp,{force:true});}};
 let previous,editToken;
 if(updateId){
  editToken=history.findLast(r=>r.type==='collection'&&r.id===updateId&&r.url===baseUrl+'/c/'+updateId&&typeof r.editToken==='string')?.editToken;
  if(!editToken||!/^[a-f0-9]{64}$/.test(editToken))fail('The local receipt does not contain this collection’s edit key. Keep the receipt with its source files. Nothing was changed.');
  const r=await get(baseUrl+'/api/collections/'+updateId);
  if(!r.ok||!privateHeaders(r))fail('The collection could not be read. Nothing was changed.');
  previous=await r.json();
  for(const p of pages)if(!p.id)p.id=previous.pages.find(old=>old.key===p.key)?.id;
 }
 const payload={title:manifest.title,pages:pages.map(({source,sha256,...p})=>p)};
 if(!updateId)for(const p of payload.pages)delete p.id;
 let response;
 try { response=await fetch(baseUrl+'/api/collections'+(updateId?'/'+updateId:''),{method:updateId?'PUT':'POST',redirect:'error',signal:AbortSignal.timeout(45000),headers:{'content-type':'application/json',...(editToken?{authorization:'Bearer '+editToken}:{})},body:JSON.stringify(payload)}); }
 catch { fail('The request failed. Its result may be unknown; check the collection before trying again.'); }
 if(!response.ok)fail('Server returned HTTP '+response.status+'. The change was not confirmed.');
 let result;try{result=await response.json();}catch{fail('The server returned an unreadable response. The change may have been saved, but its edit key may not have arrived. Do not retry blindly.');}
 if(typeof result.id!=='string'||!/^[a-f0-9-]{36}$/.test(result.id)||result.url!==baseUrl+'/c/'+result.id)fail('The server returned an unexpected collection link. The change may have been saved.');
 createdUrl=result.url;
 if(!updateId)editToken=result.editToken;
 if(typeof editToken!=='string'||!/^[a-f0-9]{64}$/.test(editToken))fail('The server did not return a usable edit key.');
 const receipt={type:'collection',id:result.id,title:manifest.title,url:createdUrl,expiresAt:result.expiresAt,publishedAt:new Date().toISOString(),editToken,verified:false,pages:[]};
 history.push(receipt);saveHistory(); // Keep the edit key even if a later page check fails.
 if(updateId&&result.id!==updateId)fail('The collection ID changed unexpectedly.');
 if(!Array.isArray(result.pages)||result.pages.length!==pages.length||result.title!==manifest.title||!Number.isFinite(Date.parse(result.expiresAt)))fail('The saved collection did not match the request.');
 if(previous&&result.expiresAt!==previous.expiresAt)fail('The collection expiry changed unexpectedly.');
 const landing=await get(createdUrl);if(!landing.ok||!privateHeaders(landing))fail('The collection was saved, but its page or no-index headers could not be checked.');await landing.arrayBuffer();
 const checked=[];
 for(let i=0;i<pages.length;i++){
  const local=pages[i],remote=result.pages[i];
  if(remote.key!==local.key||remote.title!==local.title||remote.type!==local.type||remote.content!==local.content||(local.id&&remote.id!==local.id)||!/^[-a-f0-9]{36}$/.test(remote.id)||remote.url!==createdUrl+'/p/'+remote.id)fail('A saved page did not match the request.');
  const page=await get(remote.url);if(!page.ok||!privateHeaders(page))fail('A page or its no-index headers could not be checked.');await page.arrayBuffer();
  const content=await get(remote.url+'/content');
  if(!content.ok||!privateHeaders(content))fail('A saved source could not be checked.');
  const bytes=Buffer.from(await content.arrayBuffer());if(!bytes.equals(Buffer.from(local.content)))fail('A saved source did not match the local file.');
  if(local.type==='html'){
   const csp=content.headers.get('content-security-policy')||'';
   if(!/sandbox\s+allow-scripts(?:;|$)/.test(csp)||/allow-same-origin/.test(csp))fail('HTML isolation could not be checked.');
  }
  checked.push({id:remote.id,key:local.key,title:local.title,type:local.type,url:remote.url,source:local.source,sha256:local.sha256});
 }
 receipt.pages=checked;receipt.verified=true;saveHistory();
 console.log(createdUrl);
}catch(error){console.error(error.message);if(createdUrl)console.error('A collection was saved. Inspect it before trying again: '+createdUrl);process.exitCode=1;}
