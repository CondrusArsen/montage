import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BACKDROPS, CATALOG } from '../dist/assets.mjs';
import { FORMATS, LAYOUTS, PALETTES, TITLE_ZONE, fromNames, layoutScene, newLayer, parsePalette, placeAdded } from '../dist/engine.mjs';
import { suggest } from '../dist/semantics.mjs';
import { EXAMPLES } from '../dist/examples.mjs';
import { sceneSVG } from '../dist/vector.mjs';

test('each imported source object has four vector variants and a usable bounding box', () => {
  assert.equal(CATALOG.length, 10);
  for (const asset of CATALOG) {
    for (const size of ['S', 'L']) {
      for (const role of ['main', 'background']) {
        const { box, body, count } = asset.variants[size][role];
        assert.equal(box.length, 4);
        assert.ok(box[2] > 0 && box[2] < 1500 && box[3] > 0 && box[3] < 1200);
        assert.ok(count > 15);
        assert.match(body, /<path /);
        assert.doesNotMatch(body, /<(?:image|script|foreignObject)\b/);
      }
    }
  }
  assert.notEqual(CATALOG[1].variants.S.main.count, CATALOG[1].variants.L.main.count);
  assert.equal(Object.keys(BACKDROPS.L).length, 3);
});

test('component names support aliases, Cyrillic, duplicates, and explicit misses', () => {
  const result = fromNames('КНИГА, пазл; кошелек\nкнига, фотоаппарат', CATALOG);
  assert.deepEqual(result.assets.map(asset => asset.id), ['book','puzzles','wallet','book']);
  assert.deepEqual(result.missing, ['фотоаппарат']);
  assert.deepEqual(fromNames('книга пазлы', CATALOG).assets.map(asset => asset.id), ['book','puzzles']);
  assert.deepEqual(fromNames('телефон и наушники', CATALOG).assets.map(asset => asset.id), ['phone','headphones']);
  assert.deepEqual(parsePalette('#fff #000 #abc #123456 #111 #222 #333 #444').slice(0, 3), ['#ffffff', '#000000', '#aabbcc']);
});

test('offline meaning picks two main objects and one background from the library', () => {
  const ids = title => suggest(title, CATALOG).map(item => item.id);
  assert.ok(ids('Собрать знания по кусочкам').includes('book'));
  assert.equal(ids('Найти фокус в шуме')[0], 'headphones');
  assert.ok(['wallet', 'coin'].includes(ids('Как выбрать ипотеку и не переплатить')[0]));
  assert.deepEqual(suggest('Подарки к 8 Марта', CATALOG).map(item => item.role), ['main', 'main', 'background']);
  assert.ok(!ids('Подкасты для долгой дороги').includes('wallet'), '«долгой» is not «долг»');
  assert.deepEqual(suggest('Пингвины бороздят Антарктиду', CATALOG), []);
});

const boxOf = (layer, scale, format) => {
  const { width, height } = FORMATS[format];
  const [, , w, h] = CATALOG.find(asset => asset.id === layer.assetId).variants.L.main.box;
  const cx = layer.x * width, cy = layer.y * height;
  return { x0: cx - w * scale / 2, y0: cy - h * scale / 2, x1: cx + w * scale / 2, y1: cy + h * scale / 2 };
};
const overlapArea = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
  Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

test('auto layout keeps every layer, one scale per scene, visible main objects and a free title zone', () => {
  const sets = [['book', 'puzzles', 'pen'], ['wallet', 'coin', 'folder'], ['headphones', 'lamp', 'book'], ['phone', 'puzzles', 'lamp']];
  for (const ids of sets) {
    const layers = ids.map((id, n) => newLayer(id, String(n), n === 2 ? 'background' : 'main'));
    for (const format of Object.keys(FORMATS)) {
      const { width, height } = FORMATS[format];
      const frame = { x0: 0, y0: 0, x1: width, y1: height };
      for (const layout of Object.keys(LAYOUTS)) {
        const { layers: result, scale } = layoutScene(layers, format, layout);
        assert.ok(scale > .3 && scale < 1.6, `scale ${scale}`);
        assert.deepEqual(result.map(layer => layer.key).sort(), ['0', '1', '2']);
        assert.equal(result[0].role, 'background', 'background is painted first');
        for (const layer of result.filter(item => item.role === 'main')) {
          const box = boxOf(layer, scale, format);
          const area = (box.x1 - box.x0) * (box.y1 - box.y0);
          assert.ok(overlapArea(box, frame) / area > .6, `${ids} ${format} ${layout}: ${layer.assetId} mostly in frame`);
          if (layout === 'title') {
            const z = TITLE_ZONE[format];
            const zone = { x0: z[0] * width, y0: z[1] * height, x1: z[2] * width, y1: z[3] * height };
            assert.ok(overlapArea(box, zone) / area < .35, `${ids} ${format}: ${layer.assetId} leaves room for the title`);
          }
        }
      }
    }
  }
});

test('an object added from the library lands near the composition without moving the others', () => {
  const { layers, scale } = layoutScene([newLayer('book', 'a'), newLayer('pen', 'b')], 'wide', 'compact');
  const scene = { format: 'wide', layout: 'compact', layers, scale, fit: 1 };
  const added = placeAdded(scene, newLayer('coin', 'c'));
  assert.ok(added.x > 0 && added.x < 1 && added.y > 0 && added.y < 1);
  assert.notDeepEqual([added.x, added.y], [layers[0].x, layers[0].y]);
});

test('palettes accept exactly eight validated HEX values as JSON or text', () => {
  const colors = PALETTES.iris.colors;
  assert.deepEqual(parsePalette(colors.join(', ')), colors);
  assert.deepEqual(parsePalette(JSON.stringify({ colors })), colors);
  assert.throws(() => parsePalette('null'), /HEX/);
  assert.throws(() => parsePalette('#aa #00 #122'), /HEX/);
});

test('SVG export uses independent editable objects, palette slots and clean XML', async () => {
  for (const { id, scene } of EXAMPLES) {
    const format = FORMATS[scene.format];
    const result = sceneSVG(scene);
    assert.ok(result.includes(`viewBox="0 0 ${format.width} ${format.height}"`));
    assert.equal((result.match(/data-component=/g) || []).length, scene.layers.length);
    assert.ok(result.includes(PALETTES[scene.palette].colors[0]));
    assert.match(result, /<path /);
    assert.doesNotMatch(result, /<image\b|<foreignObject\b|@@|data-layer=|class="selection"|hover-ring|title-guide/);
    assert.equal(await readFile(new URL(`../examples/${id}.svg`, import.meta.url), 'utf-8'), result);
  }
  assert.match(sceneSVG({ ...EXAMPLES[0].scene, title: '< A & B >' }), /&lt; A &amp; B &gt;/);
});
