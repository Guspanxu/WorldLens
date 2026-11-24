import fs from 'node:fs/promises';
import path from 'node:path';
import {
  fileURLToPath
} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(
    import.meta.url)), '..'),
  dist = path.join(root, 'dist');
const output = path.resolve(process.argv[2] || path.join(root, 'artifacts/WorldLens.html'));
const read = name => fs.readFile(path.join(dist, name), 'utf8');
const pack = {
  version: 1,
  data: {},
  assets: {},
  worker: await read('app/vision-worker.js')
};
const cases = JSON.parse(await read('photos/cases.json')),
  lenses = JSON.parse(await read('lenses/index.json'));
for (const name of ['photos/cases.json', 'lenses/index.json', ...lenses.flatMap(l => [l.file, l.signals])]) pack.data[name] = JSON.parse(await read(name));
const mime = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain;charset=utf-8'
};
for (const name of new Set(['favicon.svg', 'guides/Designers-Eye.md', ...cases.map(c => c.image)])) pack.assets[name] = 'data:' + mime[path.extname(name)] + ';base64,' + (await fs.readFile(path.join(dist, name))).toString('base64');
const strip = s => s.replace(/^import .* from .*;\s*$/gm, '').replace(/^export (?=(?:async )?(?:function|const|class|let) )/gm, '');
const lang = (await fs.readFile(path.join(dist, 'ocr/eng.traineddata'))).toString('base64');
pack.ocrWorker = (await read('ocr/tesseract-core-lstm.wasm.js')) + '\n' + strip(await read('ocr/panels.mjs')) + '\n' + strip(await read('ocr/engine.mjs')) + '\n' +
  'self.onmessage=async({data})=>{try{self.postMessage({type:"progress",phase:"recognizing"});const b=Uint8Array.from(atob(' + JSON.stringify(lang) + '),s=>s.charCodeAt(0));const lines=await runOcrModel(new Uint8Array(data.image),TesseractCore,b);self.postMessage({type:"result",lines})}catch(e){self.postMessage({type:"error",message:e.message})}};';
pack.notices = await Promise.all(['ocr/LICENSE.core-and-model.txt', 'ocr/LICENSE.model.txt', 'ocr/THIRD_PARTY.txt'].map(read));
// Encapsulate the source modules, preserving imports and their scoped names. No build dependencies.
const ready = new Set(),
  compiled = [];
async function emit(name) {
  if (ready.has(name)) return;
  ready.add(name);
  let src = await read(name);
  const deps = [],
    out = new Set();
  src = src.replace(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?$/gm, (_, bindings, spec) => {
    const id = path.posix.normalize(path.posix.join(path.posix.dirname(name), spec));
    deps.push(id);
    return 'const {' + bindings.trim().replace(/\s+as\s+/g, ':') + '}=modules[' + JSON.stringify(id) + '];';
  });
  src = src.replace(/^export\s+((?:async\s+)?(?:function|class|const|let)\s+)([\w$]+)/gm, (_, decl, symbol) => {
    out.add(symbol);
    return decl + symbol
  });
  src = src.replace(/^export\s*\{([^}]+)\};?$/gm, (_, names) => {
    for (const n of names.split(',')) out.add(n.trim());
    return ''
  });
  for (const id of deps) await emit(id);
  if (/^import\s+(?!\()/m.test(src) || /^export\s/m.test(src)) throw Error('Unsupported module syntax in ' + name);
  compiled.push('modules[' + JSON.stringify(name) + ']=(()=>{\n' + src + '\nreturn {' + [...out].join(',') + '};\n})();');
}
await emit('app/main.js');
const safeJS = s => s.replace(/<\/script/gi, '<\\/script');
const css = await read('style.css');
let html = await read('index.html');
html = html.replace('href="./favicon.svg"', 'href="' + pack.assets['favicon.svg'] + '"')
  .replace('<link rel="stylesheet" href="./style.css">', () => '<style>' + (css) + '</style>');

function render(page) {
  return page.replace('<script type="module" src="./app/main.js"></script>', () => '<script type="module">' + safeJS('globalThis.WORLDLENS_PACK=' + JSON.stringify(pack) + ';\nconst modules={};\n' + compiled.join('\n')) + '</script>')
};
await fs.mkdir(path.dirname(output), {
  recursive: true
});
await fs.writeFile(output, render(html));
console.log('Portable WorldLens: ' + output);