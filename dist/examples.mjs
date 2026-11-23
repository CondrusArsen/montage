import { initialScene, layoutLayers, newLayer } from './engine.mjs';

const assemble = (title, format, size, palette, layout, entries) => ({
  ...initialScene(), title, format, size, palette, layout,
  layers: layoutLayers(entries.map(([assetId, role], index) => newLayer(assetId, `example-${index}`, role)), format, layout)
    .sort((a, b) => Number(b.role === 'background') - Number(a.role === 'background')),
});

export const EXAMPLES = [
  { id: 'knowledge', scene: initialScene() },
  { id: 'focus', scene: assemble('Найти фокус в шуме', 'square', 'L', 'laguna', 'offset',
    [['headphones', 'main'], ['lamp', 'main'], ['book', 'background']]) },
  { id: 'budget', scene: assemble('Навести порядок в бюджете', 'tall', 'S', 'peach', 'title',
    [['folder', 'main'], ['wallet', 'main'], ['coin', 'main']]) },
];
