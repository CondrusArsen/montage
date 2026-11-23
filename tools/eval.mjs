// Замер качества офлайн-подбора на размеченных заголовках: node tools/eval.mjs [--verbose]
import { readFile } from 'node:fs/promises';
import { CATALOG } from '../dist/assets.mjs';
import * as engine from '../dist/semantics.mjs';

const data = JSON.parse(await readFile(new URL('../eval/headlines.json', import.meta.url), 'utf-8'));
const verbose = process.argv.includes('--verbose');
const pick = title => engine.suggest
  ? engine.suggest(title, CATALOG).map(item => item.id)
  : engine.fromMeaning(title, CATALOG).map(asset => asset.id);

export function score(cases) {
  let hero = 0, precision = 0, empty = 0;
  const misses = [];
  for (const { title, ok } of cases) {
    const ids = pick(title);
    if (!ids.length) empty++;
    if (ok.includes(ids[0])) hero++;
    else misses.push(`${title} → ${ids.join(', ') || 'ничего'}`);
    precision += ids.length ? ids.filter(id => ok.includes(id)).length / ids.length : 0;
  }
  const n = cases.length;
  return { n, hero: hero / n, precision: precision / n, empty, misses };
}

const percent = value => `${Math.round(value * 100)}%`;
// blind.json составлен отдельным агентом без доступа к словарю: по нему словарь не настраивается.
Object.assign(data, JSON.parse(await readFile(new URL('../eval/blind.json', import.meta.url), 'utf-8')));
for (const name of ['dev', 'holdout', 'blind']) {
  const result = score(data[name]);
  console.log(`${name.padEnd(8)} n=${result.n}  главный объект верен: ${percent(result.hero)}  ` +
    `точность набора: ${percent(result.precision)}  пустых ответов: ${result.empty}`);
  if (verbose) result.misses.forEach(line => console.log('   ✗ ' + line));
}
