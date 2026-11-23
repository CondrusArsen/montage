import { mkdir, readFile, writeFile } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const output = new URL('../standalone/', import.meta.url);
const read = name => readFile(new URL(name, dist), 'utf-8');
const [css, mark, ...modules] = await Promise.all(
  ['studio.css', 'mark.svg', 'assets.mjs', 'masks.mjs', 'semantics.mjs', 'engine.mjs', 'vector.mjs', 'ai.mjs', 'examples.mjs'].map(read),
);
const icon = 'data:image/svg+xml,' + encodeURIComponent(mark);

async function inline(pageName, entry) {
  const [page, script] = await Promise.all([read(pageName), read(entry)]);
  const js = [...modules, script].map(source => source
    .replace(/^import\s+\{[\s\S]*?\}\s+from\s+'[^']+';\s*/gm, '')
    .replace(/^export\s+(?=(?:const|function)\s)/gm, ''))
    .join('\n').replace(/<\/script/gi, '<\\/script');
  return page.replace('href="mark.svg"', `href="${icon}"`)
    .replace('src="mark.svg"', `src="${icon}"`)
    .replace('<link rel="stylesheet" href="studio.css">', () => `<style>\n${css}\n</style>`)
    .replace(`<script type="module" src="${entry}"></script>`, () => `<script type="module">\n${js}\n</script>`)
    .replaceAll('\r\n', '\n');
}

const [studio, demo, demoCss, sample] = await Promise.all([
  inline('index.html', 'studio.mjs'), inline('demo.html', 'demo.mjs'), read('demo.css'), read('sample-palette.json'),
]);
await mkdir(output, { recursive: true });
await Promise.all([
  writeFile(new URL('Montage.html', output), studio.replaceAll('href="./"', 'href="Montage.html"')),
  writeFile(new URL('Demo.html', output), demo
    .replaceAll('href="./', 'href="Montage.html')
    .replace('<link rel="stylesheet" href="demo.css">', () => `<style>\n${demoCss}\n</style>`)
    .replace('href="sample-palette.json" download', `href="data:application/json,${encodeURIComponent(sample)}" download="sample-palette.json"`)),
]);
