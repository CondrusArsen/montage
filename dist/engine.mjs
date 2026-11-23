import { CATALOG } from './assets.mjs';
import { MASKS, MASK_CELL } from './masks.mjs';

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

// ---------- Силуэты ----------
// Маски из dist/masks.mjs: занятые клетки сетки MASK_CELL×MASK_CELL единиц L.
const SILHOUETTES = new Map(Object.entries(MASKS).map(([id, roles]) => {
  const { cols, rows, bits } = roles.main;
  const bytes = typeof atob === 'function'
    ? Uint8Array.from(atob(bits), char => char.charCodeAt(0))
    : Uint8Array.from(Buffer.from(bits, 'base64'));
  const grid = new Uint8Array(cols * rows);
  const cells = [];
  for (let index = 0; index < cols * rows; index++) {
    if (bytes[index >> 3] >> (index & 7) & 1) {
      grid[index] = 1;
      cells.push(index % cols, Math.floor(index / cols));
    }
  }
  return [id, { cols, rows, grid, cells: Int16Array.from(cells), filled: cells.length / 2 }];
}));

// Объект на холсте: рамка, масштаб и силуэт.
function shape(assetId, cx, cy, scale) {
  const r = rect(cx, cy, sizeOf(assetId, scale));
  return { assetId, cx, cy, r, step: MASK_CELL * scale, mask: SILHOUETTES.get(assetId) };
}

function covers(s, x, y) {
  const col = Math.floor((x - s.r.x0) / s.step);
  const row = Math.floor((y - s.r.y0) / s.step);
  return col >= 0 && row >= 0 && col < s.mask.cols && row < s.mask.rows && s.mask.grid[row * s.mask.cols + col] === 1;
}

// Доля силуэта, которая проходит проверку: в кадре, в зоне заголовка и т. п.
function share(s, test) {
  const { cells, filled } = s.mask;
  let count = 0;
  for (let i = 0; i < cells.length; i += 2) {
    const x = s.r.x0 + (cells[i] + .5) * s.step;
    const y = s.r.y0 + (cells[i + 1] + .5) * s.step;
    if (test(x, y)) count++;
  }
  return count / filled;
}

// Насколько силуэты двух объектов закрывают друг друга, доля меньшего.
function overlap(a, b) {
  if (!intersection(a.r, b.r)) return 0;
  const [small, large] = a.mask.filled * a.step ** 2 <= b.mask.filled * b.step ** 2 ? [a, b] : [b, a];
  return share(small, (x, y) => covers(large, x, y));
}

const inside = r => (x, y) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;

// Оценка позиции: объект виден в кадре, не наезжает на соседей и не лезет в зону текста.
function placementCost(s, placed, frame, zone, rank) {
  let cost = (1 - share(s, inside(frame))) * 16 + rank * .06;
  for (const other of placed) cost += Math.max(0, overlap(s, other) - .02) * 14;
  if (zone) cost += share(s, inside(zone)) * 8;
  return cost;
}

function placeMain(layer, hero, placed, scale, frame, zone, style) {
  const size = sizeOf(layer.assetId, scale);
  const heroSize = { w: hero.r.x1 - hero.r.x0, h: hero.r.y1 - hero.r.y0 };
  let best = null;
  PREFERRED[style].forEach((index, rank) => {
    const [kx, ky] = SECONDARY[index];
    for (const reach of [.2, .32, .45, .58, .72, .88]) {
      const x = hero.cx + kx * (heroSize.w * reach * .78 + size.w * .42);
      const y = hero.cy + ky * (heroSize.h * reach * .55 + size.h * .4);
      const candidate = shape(layer.assetId, x, y, scale);
      // Ближе к главному объекту лучше: композиция должна оставаться собранной.
      const cost = placementCost(candidate, placed, frame, zone, rank) + reach * .9;
      if (!best || cost < best.cost) best = { cost, shape: candidate };
    }
  });
  return best.shape;
}

function placeBackground(layer, mains, scale, frame, zone, heroCenter, used) {
  const size = sizeOf(layer.assetId, scale);
  let best = null;
  for (const [ux, uy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    // Центр силуэта чуть внутри угла: в кадре остаётся около половины объекта.
    const x = ux * frame.x1 + (ux ? -1 : 1) * size.w * .18;
    const y = uy * frame.y1 + (uy ? -1 : 1) * size.h * .18;
    const candidate = shape(layer.assetId, x, y, scale);
    const hidden = mains.reduce((sum, other) => sum + share(candidate, (px, py) => covers(other, px, py)), 0);
    const crowded = used.reduce((sum, other) => sum + overlap(candidate, other), 0);
    const distance = Math.hypot(x - heroCenter[0], y - heroCenter[1]) / Math.hypot(frame.x1, frame.y1);
    const cost = hidden * 2 + crowded * 3 + (zone ? share(candidate, inside(zone)) * 3 : 0) - distance;
    if (!best || cost < best.cost) best = { cost, shape: candidate };
  }
  return best.shape;
}

// Глубина изометрии: чей силуэт ниже в кадре, тот ближе к зрителю и рисуется позже.
function depthOf(s) {
  const { cells, rows } = s.mask;
  let lowest = 0;
  for (let i = 1; i < cells.length; i += 2) lowest = Math.max(lowest, cells[i]);
  return s.r.y0 + (Math.min(lowest, rows - 1) + 1) * s.step;
}

// Раскладывает слои и возвращает масштаб сцены. Порядок отрисовки: фоновые силуэты,
// затем главные объекты от дальнего к ближнему.
export function layoutScene(layers, format, style) {
  if (!layers.length) return { layers: [], scale: FORMAT_BASE[format] };
  const { width, height } = FORMATS[format];
  const frame = { x0: 0, y0: 0, x1: width, y1: height };
  const z = style === 'title' ? TITLE_ZONE[format] : null;
  const zone = z && { x0: z[0] * width, y0: z[1] * height, x1: z[2] * width, y1: z[3] * height };
  const scale = autoScale(layers, format, style);
  const mains = layers.filter(layer => layer.role === 'main');
  const backgrounds = layers.filter(layer => layer.role !== 'main');
  const shapes = new Map();
  const [hx, hy] = STYLE[style].hero[format];
  const anchor = anchorOf(mains);
  const queue = anchor ? [anchor, ...mains.filter(layer => layer !== anchor)] : [];
  let hero = null;
  for (const layer of queue) {
    const placed = [...shapes.values()];
    const spot = hero ? placeMain(layer, hero, placed, scale, frame, zone, style)
      : shape(layer.assetId, hx * width, hy * height, scale);
    hero ||= spot;
    shapes.set(layer.key, spot);
  }
  const mainShapes = [...shapes.values()];
  const heroCenter = hero ? [hero.cx, hero.cy] : [width / 2, height / 2];
  const used = [];
  for (const layer of backgrounds) {
    const spot = placeBackground(layer, mainShapes, scale, frame, zone, heroCenter, used);
    used.push(spot);
    shapes.set(layer.key, spot);
  }
  const ordered = [...backgrounds, ...[...mains].sort((a, b) => depthOf(shapes.get(a.key)) - depthOf(shapes.get(b.key)))];
  return {
    scale,
    layers: ordered.map(layer => {
      const { cx, cy } = shapes.get(layer.key);
      return { ...layer, x: +(cx / width).toFixed(4), y: +(cy / height).toFixed(4) };
    }),
  };
}

// Новый объект из библиотеки встаёт рядом с композицией, остальные слои не двигаются.
export function placeAdded(scene, layer) {
  const { width, height } = FORMATS[scene.format];
  const scale = scene.scale * (scene.fit || 1);
  const frame = { x0: 0, y0: 0, x1: width, y1: height };
  const placed = scene.layers.map(item => shape(item.assetId, item.x * width, item.y * height, scale));
  const hero = placed[scene.layers.findIndex(item => item.role === 'main')] ||
    { cx: width / 2, cy: height / 2, r: rect(width / 2, height / 2, { w: width * .3, h: height * .3 }) };
  const spot = placeMain(layer, hero, placed, scale, frame, null, 'compact');
  return { ...layer, x: +clamp(spot.cx / width, .02, .98).toFixed(4), y: +clamp(spot.cy / height, .02, .98).toFixed(4) };
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
