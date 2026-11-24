import {createHash} from 'node:crypto';
import {cp, mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'dist');
const output = path.join(root, 'artifacts/pages');
async function filesIn(directory) {
  const result = [];
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    const file = path.join(directory,entry.name);
    if (entry.isDirectory()) result.push(...await filesIn(file));
    else if (entry.isFile()) result.push(file);
  }
  return result.sort();
}
const files = await filesIn(source);
const hash = createHash('sha256');
for (const file of files) hash.update(path.relative(source,file)).update('\0').update(await readFile(file));
const version = hash.digest('hex').slice(0,12);
await mkdir(output,{recursive:true});
await cp(source,output,{recursive:true});

for (const file of files) {
  const relative = path.relative(source,file);
  if (relative !== 'index.html' && !relative.startsWith('app' + path.sep) && relative !== path.join('ocr','recognize.mjs')) continue;
  const original = await readFile(file,'utf8');
  const updated = relative === 'index.html' ? original
    .replace('name="worldlens-version" content=""','name="worldlens-version" content="' + version + '"')
    .replace(/((?:src|href)="\.\/[^"]+\.(?:css|js|svg))"/g,'$1?v=' + version + '"') :
    original.replace(/(\bfrom\s*['"]|\bnew URL\(\s*['"])(\.{1,2}\/[^'"]+?\.(?:js|mjs))(['"])/g,'$1$2?v=' + version + '$3');
  if (updated !== original) await writeFile(path.join(output,relative),updated);
}
console.log('WorldLens Pages build ' + version);
