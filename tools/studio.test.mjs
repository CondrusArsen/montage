import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BACKDROPS, CATALOG } from '../dist/assets.mjs';
import { FORMATS, LAYOUTS, PALETTES, fromMeaning, fromNames, layoutLayers, newLayer, parsePalette } from '../dist/engine.mjs';
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
});

test('headline ranking picks relevant catalog objects and declines unrelated topics', () => {
  assert.ok(fromMeaning('Собрать знания по кусочкам', CATALOG).some(asset => asset.id === 'book'));
  assert.equal(fromMeaning('Найти фокус в шуме', CATALOG)[0].id, 'headphones');
  assert.ok(fromMeaning('Навести порядок в бюджете', CATALOG).some(asset => asset.id === 'wallet'));
  assert.deepEqual(fromMeaning('Пингвины бороздят Антарктиду', CATALOG), []);
});

test('all formats and layouts keep object IDs and give each instance its own position', () => {
  const layers = ['book','lamp','pen','puzzles','phone','wallet','coin','flowers'].map(
    (id, n) => newLayer(id, String(n), n === 0 ? 'background' : 'main'),
  );
  for (const format of Object.keys(FORMATS)) {
    for (const layout of Object.keys(LAYOUTS)) {
      const result = layoutLayers(layers, format, layout);
      assert.deepEqual(result.map(layer => layer.key), layers.map(layer => layer.key));
      assert.equal(new Set(result.map(layer => `${layer.x},${layer.y}`)).size, 8);
      assert.ok(result.every(layer => layer.x > 0 && layer.x < 1 && layer.y > 0 && layer.y < 1));
    }
  }
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
    assert.doesNotMatch(result, /<image\b|<foreignObject\b|@@|data-layer=|class="selection"/);
    assert.equal(await readFile(new URL(`../examples/${id}.svg`, import.meta.url), 'utf-8'), result);
  }
  assert.match(sceneSVG({ ...EXAMPLES[0].scene, title: '< A & B >' }), /&lt; A &amp; B &gt;/);
});
