import { CATALOG } from './assets.mjs';
import { composeScene, newLayer } from './engine.mjs';
import { suggest } from './semantics.mjs';

// Примеры собираются тем же путём, что и в редакторе: офлайн-подбор по заголовку и автораскладка.
function assemble(id, title, format, size, palette, layout) {
  const objects = suggest(title, CATALOG);
  const scene = composeScene({ title, format, size, palette, layout, custom: null },
    objects.map((item, index) => newLayer(item.id, `${id}-${index}`, item.role)));
  return { id, scene, explain: { source: 'offline', objects } };
}

export const EXAMPLES = [
  assemble('knowledge', 'Собрать знания по кусочкам', 'wide', 'L', 'iris', 'compact'),
  assemble('podcasts', 'Подкасты для долгой дороги', 'square', 'L', 'laguna', 'offset'),
  assemble('budget', 'Навести порядок в бюджете', 'tall', 'S', 'peach', 'title'),
];
