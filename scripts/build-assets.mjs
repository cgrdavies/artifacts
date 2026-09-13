import { build } from 'esbuild';
import fs from 'node:fs';
fs.rmSync('public/assets', { recursive: true, force: true });
await build({entryPoints:['client/document.js'],outdir:'public/assets',bundle:true,splitting:true,format:'esm',target:['es2022'],minify:true,chunkNames:'chunks/[name]-[hash]',legalComments:'eof'});
