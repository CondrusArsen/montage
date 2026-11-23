import { mkdir, writeFile } from 'node:fs/promises';
import { EXAMPLES } from '../dist/examples.mjs';
import { sceneSVG } from '../dist/vector.mjs';

await mkdir(new URL('../examples/', import.meta.url), { recursive: true });
for (const { id, scene } of EXAMPLES) {
  const svg = sceneSVG(scene);
  await writeFile(new URL(`../examples/${id}.svg`, import.meta.url), svg);
}
