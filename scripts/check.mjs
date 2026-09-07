import { readFileSync, readdirSync } from 'node:fs';
import { Script } from 'node:vm';
import { execFileSync } from 'node:child_process';
for (const file of ['worker.js', ...readdirSync('public').filter(f => f.endsWith('.js')).map(f => `public/${f}`)]) {
  execFileSync(process.execPath, ['--check', file]);
}
for (const file of readdirSync('public').filter(f => f.endsWith('.html'))) {
  const html=readFileSync(`public/${file}`, 'utf8');
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    new Script(match[1], { filename: file });
  }
}
console.log('All JavaScript and inline HTML scripts passed syntax checks.');
