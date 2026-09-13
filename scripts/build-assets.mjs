import { build } from 'esbuild';
import fs from 'node:fs';
fs.rmSync('public/assets', { recursive: true, force: true });
await build({entryPoints:['client/theme.js'],outfile:'public/assets/theme.js',bundle:true,format:'iife',target:['es2022'],minify:true});
await build({entryPoints:['client/document.js'],outdir:'public/assets',bundle:true,splitting:true,format:'esm',target:['es2022'],minify:true,chunkNames:'chunks/[name]-[hash]',legalComments:'eof'});
