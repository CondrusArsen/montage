import { CATALOG } from './assets.mjs';

export const FORMATS = {
  wide: { label: 'Горизонтальный', width: 1200, height: 630 },
  square: { label: 'Квадратный', width: 1080, height: 1080 },
  tall: { label: 'Вертикальный', width: 800, height: 1200 },
};

export const LAYOUTS = {
  compact: 'Собранно',
  offset: 'Со смещением',
  title: 'Под заголовок',
};

export const PALETTES = {
  iris: { label: 'Ирис', colors: ['#d7cdf5', '#aa9bf0', '#7864d7', '#181817', '#f9ecb0', '#f9a3aa', '#ffe3e1', '#ffffff'] },
  peach: { label: 'Персик', colors: ['#fdd7b9', '#fac896', '#d27532', '#181817', '#f9ecb0', '#80dada', '#beebeb', '#ffffff'] },
  laguna: { label: 'Лагуна', colors: ['#beebeb', '#80dada', '#5abebe', '#181817', '#ffd4f2', '#6d7bfc', '#b6c6fe', '#ffffff'] },
};

// Исходники S нарисованы вдвое мельче L. Масштаб сцены хранится в единицах L.
export const S_FACTOR = 1449 / 726;

export function normalize(text) {
  return text.toLowerCase().replaceAll('ё', 'е').match(/[а-яёa-z0-9]+/giu)?.join(' ') || '';
}

export function fromNames(text, catalog) {
  // «телефон и наушники» читается как список из двух названий.
  const requested = text.replace(/\s+(?:и|а также|плюс)\s+/giu, ',')
    .split(/[,;\n]+/).map(value => value.trim()).filter(Boolean);
  if (requested.length === 1) {
    const whole = normalize(requested[0]);
    const exact = catalog.find(asset => [asset.label, ...asset.aliases].some(alias => normalize(alias) === whole));
    if (exact) return { assets: [exact], missing: [] };
    const words = whole.split(' ');
    if (words.length > 1) {
      const phrases = catalog.flatMap(asset => [asset.label, ...asset.aliases].map(alias => ({
        asset, phrase: normalize(alias).split(' '),
      }))).sort((a, b) => b.phrase.length - a.phrase.length);
      const result = { assets: [], missing: [] };
      for (let index = 0; index < words.length;) {
        const match = phrases.find(({ phrase }) => phrase.every((part, offset) => part === words[index + offset]));
        if (match) {
          result.assets.push(match.asset);
          index += match.phrase.length;
        } else {
          result.missing.push(words[index++]);
        }
      }
      return result;
    }
  }
  const assets = [];
  const missing = [];
  for (const term of requested) {
    const query = normalize(term);
    const asset = catalog.find(item => [item.label, ...item.aliases].some(alias => normalize(alias) === query));
    if (asset) assets.push(asset);
    else missing.push(term);
  }
  return { assets, missing };
}

// ---------- Автоматическая раскладка ----------
// Эталоны в Figma — крупный план: главный объект занимает большую часть кадра, второй
// прижат к нему по изометрической диагонали, фоновый силуэт срезан краем кадра.
// Пропорции объектов между собой не меняются: у всей сцены один масштаб.

const BOXES = new Map(CATALOG.map(asset => [asset.id, asset.variants.L.main.box]));
const FORMAT_BASE = { wide: .9, square: .95, tall: .85 };
// Насколько крупный объект может выходить за ширину кадра: в узком кадре допускаем срез.
const WIDTH_CAP = { wide: .8, square: .9, tall: 1.1 };
const STYLE = {
  compact: { fit: 1, hero: { wide: [.46, .55], square: [.46, .54], tall: [.5, .52] } },
  offset: { fit: 1.08, hero: { wide: [.36, .6], square: [.38, .6], tall: [.42, .62] } },
  title: { fit: .84, hero: { wide: [.64, .6], square: [.56, .66], tall: [.5, .68] } },
};
// Свободная зона для текста заголовка в раскладке «Под заголовок», доли кадра.
export const TITLE_ZONE = { wide: [0, 0, .44, .5], square: [0, 0, .62, .3], tall: [0, 0, 1, .3] };
// Направления от главного объекта: диагонали изометрии, бока, а для узких кадров — верх и низ.
const SECONDARY = [[1, -1], [1.25, .15], [1, .95], [-1, .95], [-1.25, -.15], [-1, -1], [.25, -1.35], [-.25, 1.35]];
const PREFERRED = { compact: [0, 1, 2, 5, 3, 4, 6, 7], offset: [1, 0, 2, 5, 4, 3, 6, 7], title: [3, 4, 2, 7, 5, 1, 0, 6] };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function sizeOf(assetId, scale) {
  const [, , w, h] = BOXES.get(assetId);
  return { w: w * scale, h: h * scale };
}

// Главный объект сцены для раскладки — самый крупный из главных: он задаёт масштаб и центр.
function anchorOf(layers) {
  const mains = layers.filter(layer => layer.role === 'main');
  const pool = mains.length ? mains : layers;
  return pool.reduce((best, layer) => {
    const [, , w, h] = BOXES.get(layer.assetId);
    return !best || w * h > best.area ? { layer, area: w * h } : best;
  }, null)?.layer;
}

export function autoScale(layers, format, style) {
  const anchor = anchorOf(layers);
  if (!anchor) return FORMAT_BASE[format];
  const { width, height } = FORMATS[format];
  const [, , w, h] = BOXES.get(anchor.assetId);
  // Крупные объекты (книга, лампа) уменьшаем мягче, мелкие (монета) увеличиваем мягче.
  const relative = clamp(Math.sqrt(925 / Math.hypot(w, h)), .68, 1.6);
  // Все главные объекты вместе занимают не больше ~60% кадра, иначе второй уйдёт за край.
  const mains = layers.filter(layer => layer.role === 'main');
  const footprint = mains.reduce((sum, layer) => { const box = BOXES.get(layer.assetId); return sum + box[2] * box[3]; }, 0);
  const crowd = footprint ? Math.sqrt(width * height * .62 / footprint) : Infinity;
  const scale = Math.min(FORMAT_BASE[format] * relative, height * .98 / h, width * WIDTH_CAP[format] / w, crowd) * STYLE[style].fit;
  return +scale.toFixed(4);
}

function rect(cx, cy, size) {
  return { x0: cx - size.w / 2, y0: cy - size.h / 2, x1: cx + size.w / 2, y1: cy + size.h / 2 };
}
function area(r) { return Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0); }
function intersection(a, b) {
  return area({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });
}

// Оценка позиции: объект должен быть виден, не прятать соседей и не лезть в зону текста.
function placementCost(r, placed, frame, zone, rank) {
  const visible = intersection(r, frame) / area(r);
  let cost = (1 - visible) * 10 + rank * .08;
  for (const other of placed) {
    const overlap = intersection(r, other) / Math.min(area(r), area(other));
    cost += Math.max(0, overlap - .28) * 5;
  }
  if (zone) cost += intersection(r, zone) / area(r) * 8;
  return cost;
}

function placeMain(layer, hero, placed, scale, frame, zone, style) {
  const size = sizeOf(layer.assetId, scale);
  const heroSize = { w: hero.x1 - hero.x0, h: hero.y1 - hero.y0 };
  const cx = (hero.x0 + hero.x1) / 2;
  const cy = (hero.y0 + hero.y1) / 2;
  let best = null;
  PREFERRED[style].forEach((index, rank) => {
    const [kx, ky] = SECONDARY[index];
    for (const reach of [.35, .5, .65]) {
      const x = cx + kx * (heroSize.w * reach * .78 + size.w * .42);
      const y = cy + ky * (heroSize.h * reach * .55 + size.h * .4);
      const r = rect(x, y, size);
      const cost = placementCost(r, placed, frame, zone, rank) + reach * .3;
      if (!best || cost < best.cost) best = { cost, x, y, r };
    }
  });
  return best;
}

function placeBackground(layer, placed, scale, frame, zone, heroCenter) {
  const size = sizeOf(layer.assetId, scale);
  const corners = [[0, 0], [1, 0], [0, 1], [1, 1]];
  let best = null;
  for (const [ux, uy] of corners) {
    // Центр силуэта чуть внутри угла: в кадре остаётся около половины объекта.
    const x = ux * frame.x1 + (ux ? -1 : 1) * size.w * .18;
    const y = uy * frame.y1 + (uy ? -1 : 1) * size.h * .18;
    const r = rect(x, y, size);
    const covered = placed.reduce((sum, other) => sum + intersection(r, other), 0) / area(r);
    const distance = Math.hypot(x - heroCenter[0], y - heroCenter[1]) / Math.hypot(frame.x1, frame.y1);
    const cost = covered * 2 + (zone ? intersection(r, zone) / area(r) * 3 : 0) - distance;
    if (!best || cost < best.cost) best = { cost, x, y, r };
  }
  return best;
}

// Раскладывает слои и возвращает масштаб сцены. Порядок отрисовки: фон, затем главные
// объекты от крупного к мелкому, чтобы мелкий предмет не прятался за крупным.
export function layoutScene(layers, format, style) {
  if (!layers.length) return { layers: [], scale: FORMAT_BASE[format] };
  const { width, height } = FORMATS[format];
  const frame = { x0: 0, y0: 0, x1: width, y1: height };
  const z = style === 'title' ? TITLE_ZONE[format] : null;
  const zone = z && { x0: z[0] * width, y0: z[1] * height, x1: z[2] * width, y1: z[3] * height };
  const scale = autoScale(layers, format, style);
  const mains = layers.filter(layer => layer.role === 'main');
  const backgrounds = layers.filter(layer => layer.role !== 'main');
  const positions = new Map();
  const placed = [];
  let heroRect = null;
  const [hx, hy] = STYLE[style].hero[format];
  const anchor = anchorOf(mains);
  const queue = anchor ? [anchor, ...mains.filter(layer => layer !== anchor)] : [];
  queue.forEach((layer, index) => {
    if (index === 0) {
      heroRect = rect(hx * width, hy * height, sizeOf(layer.assetId, scale));
      placed.push(heroRect);
      positions.set(layer.key, [hx * width, hy * height]);
      return;
    }
    const spot = placeMain(layer, heroRect, placed, scale, frame, zone, style);
    placed.push(spot.r);
    positions.set(layer.key, [spot.x, spot.y]);
  });
  const heroCenter = heroRect ? [(heroRect.x0 + heroRect.x1) / 2, (heroRect.y0 + heroRect.y1) / 2] : [width / 2, height / 2];
  const usedCorners = [];
  for (const layer of backgrounds) {
    const spot = placeBackground(layer, [...placed, ...usedCorners], scale, frame, zone, heroCenter);
    usedCorners.push(spot.r);
    positions.set(layer.key, [spot.x, spot.y]);
  }
  const footprint = layer => { const { w, h } = sizeOf(layer.assetId, 1); return w * h; };
  const ordered = [...backgrounds, ...[...mains].sort((a, b) => footprint(b) - footprint(a))];
  return {
    scale,
    layers: ordered.map(layer => {
      const [x, y] = positions.get(layer.key);
      return { ...layer, x: +(x / width).toFixed(4), y: +(y / height).toFixed(4) };
    }),
  };
}

// Новый объект из библиотеки встаёт рядом с композицией, остальные слои не двигаются.
export function placeAdded(scene, layer) {
  const { width, height } = FORMATS[scene.format];
  const scale = scene.scale * (scene.fit || 1);
  const frame = { x0: 0, y0: 0, x1: width, y1: height };
  const placed = scene.layers.map(item => rect(item.x * width, item.y * height, sizeOf(item.assetId, scale)));
  const hero = placed[scene.layers.findIndex(item => item.role === 'main')] ||
    rect(width / 2, height / 2, { w: width * .3, h: height * .3 });
  const spot = placeMain(layer, hero, placed, scale, frame, null, 'compact');
  return { ...layer, x: +clamp(spot.x / width, .02, .98).toFixed(4), y: +clamp(spot.y / height, .02, .98).toFixed(4) };
}

export function parsePalette(text) {
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  const raw = typeof data === 'string' ? data.trim().split(/[\s,;]+/) :
    (Array.isArray(data) ? data : data?.colors);
  // Короткая запись #abc разворачивается в #aabbcc.
  const full = Array.isArray(raw) ? raw.map(color => typeof color === 'string' && /^#[\da-f]{3}$/i.test(color)
    ? '#' + [...color.slice(1)].map(digit => digit + digit).join('') : color) : raw;
  if (!Array.isArray(full) || full.length !== 8 ||
      !full.every(color => typeof color === 'string' && /^#[\da-f]{6}$/i.test(color))) {
    throw Error('Нужно 8 HEX-цветов вида #aabbcc или #abc. Сначала 4 для фона, затем 4 для объектов.');
  }
  return full.map(color => color.toLowerCase());
}

export function newLayer(assetId, key, role = 'main') {
  return { key, assetId, role, x: .5, y: .5, angle: 0 };
}

export function composeScene(base, layers, overrides = {}) {
  const scene = { ...base, ...overrides };
  const result = layoutScene(layers, scene.format, scene.layout);
  return { ...scene, layers: result.layers, scale: result.scale, fit: 1 };
}

export function initialScene() {
  return composeScene({
    title: 'Собрать знания по кусочкам', format: 'wide', size: 'L', layout: 'compact',
    palette: 'iris', custom: null, note: null,
  }, [
    newLayer('book', 'initial-book'),
    newLayer('puzzles', 'initial-puzzles'),
    newLayer('lamp', 'initial-lamp', 'background'),
  ]);
}
