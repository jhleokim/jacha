import { readFileSync, readdirSync } from 'node:fs';
import { Script } from 'node:vm';
import { execFileSync } from 'node:child_process';
import {createHash} from 'node:crypto';
const font=readFileSync('public/fonts/PretendardVariable.woff2');
if(createHash('sha256').update(font).digest('hex')!=='9599f12fd42fc0bce1cd50b47a0c022e108d7aa64dd0d1bb0ed44f3282d900b4')throw new Error('Bundled Pretendard font is missing or altered');
const ocrManifest=JSON.parse(readFileSync('public/vendor/ocr/manifest.json','utf8'));
for(const [name,entry] of Object.entries(ocrManifest.files)){
  const data=readFileSync('public/vendor/ocr/'+name);
  if(data.length!==entry.bytes||createHash('sha256').update(data).digest('hex')!==entry.sha256)throw new Error('OCR asset mismatch: '+name);
}
for (const file of ['worker.js', 'opinet-capture.js', 'route-capture.js', ...readdirSync('public').filter(f => f.endsWith('.js')).map(f => `public/${f}`)]) {
  execFileSync(process.execPath, ['--check', file]);
}
for (const file of readdirSync('public').filter(f => f.endsWith('.html'))) {
  const html=readFileSync(`public/${file}`, 'utf8');
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    new Script(match[1], { filename: file });
  }
}
console.log('All JavaScript and inline HTML scripts passed syntax checks.');
