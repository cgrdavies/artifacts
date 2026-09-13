#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

let createdUrl;
const fail = message => { throw Error(message); };
try {
  const [input, flag, type, ...extra] = process.argv.slice(2);
  if (!input || flag !== '--type' || !['markdown','markdoc','html','raw'].includes(type) || extra.length) fail('Usage: node publish.mjs FILE --type markdown|markdoc|html|raw');
  const source = path.resolve(input);
  const bytes = fs.readFileSync(source);
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) fail('Use a non-empty file no larger than 10MB.');
  const base = new URL(process.env.ARTIFACTS_URL || 'https://artifacts.yeeted.lol');
  if (!['https:','http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) fail('Use an HTTP or HTTPS service address without credentials, a query or a fragment.');
  const baseUrl = base.href.replace(/\/$/, '');
  const headersOkay = r => /\bnoindex\b/i.test(r.headers.get('x-robots-tag') || '') && r.headers.get('referrer-policy') === 'no-referrer';
  const get = url => fetch(url, { redirect:'error', signal:AbortSignal.timeout(20000) });
  const capabilities = await get(baseUrl + '/api/capabilities');
  if (!capabilities.ok || !headersOkay(capabilities)) fail('The service is not ready for checked publishing. Nothing was uploaded; keep the source locally.');
  const caps = await capabilities.json();
  if (!Number.isInteger(caps.version) || caps.version < 2 || !Array.isArray(caps.formats) || !caps.formats.includes(type) || caps.htmlIsolation !== 'sandbox') fail('The service does not support the requested format safely yet. Nothing was uploaded.');
  const receiptPath = source + '.artifact.json';
  let history = [];
  if (fs.existsSync(receiptPath)) {
    history = JSON.parse(fs.readFileSync(receiptPath,'utf8'));
    if (!Array.isArray(history)) fail('The local receipt file could not be read. Nothing was uploaded.');
  }
  const cli = fileURLToPath(new URL('../../../../artifacts-cli', import.meta.url));
  const upload = spawnSync('bash', [cli,'create','--type',type,'--file',source], {
    env:{...process.env,ARTIFACTS_URL:baseUrl},encoding:'utf8',timeout:55000,maxBuffer:1024*1024,
  });
  if (upload.error || upload.status !== 0) fail((upload.stderr || '').trim() || 'Upload failed; its outcome may be unknown. Do not retry blindly.');
  createdUrl = upload.stdout.trim();
  const url = new URL(createdUrl);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname.replace(/\/$/,'') + '/')) fail('The service returned an unexpected link.');
  const page = await get(createdUrl);
  if (!page.ok || !headersOkay(page)) fail('The link was created, but its page or no-index headers could not be verified.');
  await page.arrayBuffer();
  if (type === 'html' || type === 'raw') {
    const content = await get(createdUrl + '/content');
    const csp = content.headers.get('content-security-policy') || '';
    if (!content.ok || !headersOkay(content) || !/sandbox\s+allow-scripts(?:;|$)/.test(csp) || /allow-same-origin/.test(csp)) fail('The link was created, but HTML isolation could not be verified.');
    await content.arrayBuffer();
  }
  const download = await get(createdUrl + '/download');
  if (!download.ok || !headersOkay(download)) fail('The link was created, but its saved source could not be checked.');
  const saved = Buffer.from(await download.arrayBuffer());
  if (!saved.equals(bytes)) fail('The saved source did not match the local file.');
  history.push({url:createdUrl,contentUrl:createdUrl+'/content',downloadUrl:createdUrl+'/download',type,source,sha256:createHash('sha256').update(bytes).digest('hex'),publishedAt:new Date().toISOString(),retentionDays:caps.retentionDays});
  const temp = receiptPath + '.' + randomUUID() + '.tmp';
  try { fs.writeFileSync(temp,JSON.stringify(history,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temp,receiptPath); }
  finally { fs.rmSync(temp,{force:true}); }
  console.log(createdUrl);
} catch (error) {
  console.error(error.message);
  if (createdUrl) console.error('A link was created. Inspect it before trying another upload: ' + createdUrl);
  process.exitCode = 1;
}
