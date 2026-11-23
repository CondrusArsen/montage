import { mkdir, readFile, writeFile } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const output = new URL('../standalone/', import.meta.url);
const read = name => readFile(new URL(name, dist), 'utf-8');
const files = ['assets.mjs', 'engine.mjs', 'vector.mjs', 'examples.mjs', 'studio.mjs'];
const scripts = await Promise.all(files.map(read));
const js = scripts.map(source => source
  .replace(/^import\s+\{[\s\S]*?\}\s+from\s+'[^']+';\s*/gm, '')
  .replace(/^export\s+(?=(?:const|function)\s)/gm, ''))
  .join('\n');

const [page, css, mark] = await Promise.all(['index.html', 'studio.css', 'mark.svg'].map(read));
const icon = 'data:image/svg+xml,' + encodeURIComponent(mark);
const html = page
  .replace('href="mark.svg"', `href="${icon}"`)
  .replace('src="mark.svg"', `src="${icon}"`)
  .replace('<link rel="stylesheet" href="studio.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="studio.mjs"></script>', () => `<script type="module">\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`);
await mkdir(output, { recursive: true });
await writeFile(new URL('Montage.html', output), html);
