// Renames tsc's dist-electron output from .js to .cjs, since package.json's
// "type": "module" (for Vite/React) would otherwise make Node treat these
// CommonJS-compiled Electron files as ES modules.
import { readdirSync, renameSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist-electron');

const files = readdirSync(distDir).filter((f) => f.endsWith('.js'));

for (const file of files) {
  const oldPath = path.join(distDir, file);
  const newPath = path.join(distDir, file.replace(/\.js$/, '.cjs'));

  let contents = readFileSync(oldPath, 'utf8');
  for (const other of files) {
    const base = other.replace(/\.js$/, '');
    contents = contents.replaceAll(`require("./${base}.js")`, `require("./${base}.cjs")`);
    contents = contents.replaceAll(`require("./${base}")`, `require("./${base}.cjs")`);
  }
  writeFileSync(oldPath, contents);
  renameSync(oldPath, newPath);
  console.log(`  renamed ${file} -> ${path.basename(newPath)}`);
}
