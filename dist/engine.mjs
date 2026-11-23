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

const WORDS = /[а-яёa-z0-9]+/giu;
const NOISE = new Set('как что это для или про чтобы свой свои без где когда зачем после можно нужно новый новые весь всему все мне хочу сделать просто иллюстрация'.split(' '));

export function normalize(text) {
  return text.toLowerCase().replaceAll('ё', 'е').match(WORDS)?.join(' ') || '';
}

function tokens(text) {
  return normalize(text).split(' ').filter(word => word.length >= 3 && !NOISE.has(word));
}

function hits(text, terms) {
  const words = tokens(text);
  return terms.reduce((total, term) => {
    const query = tokens(term);
    if (!query.length) return total;
    const matched = query.every(part => words.some(word => word === part ||
      (part.length >= 4 && word.startsWith(part)) ||
      (word.length >= 4 && part.startsWith(word))));
    return total + Number(matched);
  }, 0);
}

export function fromNames(text, catalog) {
  const requested = text.split(/[,;\n]+/).map(value => value.trim()).filter(Boolean);
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

const THEMES = [
  { cues: ['учеб', 'школ', 'образова', 'знани', 'учим', 'глава', 'читать', 'понима', 'разобра', 'исслед', 'смысл', 'кусоч', 'learning'], ids: ['book', 'puzzles', 'pen'] },
  { cues: ['приложен', 'мобиль', 'цифров', 'интерфейс', 'автоматиза', 'собрат', 'част', 'кусоч', 'задач', 'решени', 'логик', 'app'], ids: ['phone', 'puzzles', 'folder'] },
  { cues: ['фокус', 'тишин', 'концентрац', 'отвлека', 'слуша', 'аудио', 'музык', 'шум', 'звук', 'focus'], ids: ['headphones', 'lamp', 'book'] },
  { cues: ['деньг', 'заработ', 'финанс', 'бюджет', 'платеж', 'покуп', 'оплат', 'кошел', 'сбереж', 'money'], ids: ['wallet', 'coin', 'folder'] },
  { cues: ['идея', 'идеи', 'вдохнов', 'свет', 'озарен', 'творчеств', 'мысл', 'придум', 'идею', 'design'], ids: ['lamp', 'pen', 'puzzles'] },
  { cues: ['весн', 'подар', 'поздрав', 'цвет', 'раст', 'букет', 'радост', 'праздн', 'забот', 'spring'], ids: ['flowers', 'pen', 'book'] },
  { cues: ['документ', 'поряд', 'архив', 'структурир', 'карьер', 'портфолио', 'список', 'файл', 'organize'], ids: ['folder', 'pen', 'phone'] },
];

export function fromMeaning(text, catalog) {
  const theme = THEMES.map(entry => ({ ...entry, score: hits(text, entry.cues) }))
    .sort((a, b) => b.score - a.score)[0];
  const ranked = catalog.map(asset => {
    const exact = hits(text, [asset.label, ...asset.aliases]);
    const tags = hits(text, asset.tags);
    const themePosition = theme.ids.indexOf(asset.id);
    const score = exact * 8 + tags * 2 + (theme.score && themePosition >= 0 ? 3 - themePosition * 0.8 : 0);
    return { asset, score };
  }).sort((a, b) => b.score - a.score);
  return ranked.filter(result => result.score > 0).slice(0, 3).map(result => result.asset);
}

const ANCHORS = {
  wide: {
    compact: [[.49,.49],[.76,.32],[.24,.72],[.78,.72],[.25,.27]],
    offset: [[.34,.63],[.65,.35],[.78,.73],[.65,.73],[.25,.30]],
    title: [[.64,.55],[.80,.29],[.80,.76],[.59,.77],[.56,.30]],
  },
  square: {
    compact: [[.45,.47],[.72,.28],[.69,.75],[.25,.75],[.23,.26]],
    offset: [[.38,.58],[.70,.26],[.74,.74],[.42,.78],[.22,.29]],
    title: [[.45,.63],[.73,.50],[.68,.80],[.29,.83],[.27,.49]],
  },
  tall: {
    compact: [[.45,.48],[.69,.25],[.68,.72],[.25,.80],[.25,.25]],
    offset: [[.37,.61],[.69,.29],[.75,.77],[.36,.84],[.25,.24]],
    title: [[.44,.64],[.70,.42],[.70,.82],[.24,.83],[.25,.46]],
  },
};

export function layoutLayers(layers, format, style) {
  const anchors = ANCHORS[format][style];
  const tracked = [...layers].sort((a, b) => a.role === b.role ? 0 : a.role === 'main' ? -1 : 1);
  const positions = new Map(tracked.map((layer, index) => {
    const [x, y] = anchors[index] || [0.2 + ((index * 37) % 60) / 100, 0.22 + ((index * 29) % 57) / 100];
    return [layer.key, { x, y }];
  }));
  return layers.map(layer => ({ ...layer, ...positions.get(layer.key) }));
}

export function parsePalette(text) {
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  const raw = typeof data === 'string' ? data.trim().split(/[\s,;]+/) :
    (Array.isArray(data) ? data : data?.colors);
  if (!Array.isArray(raw) || raw.length !== 8 ||
      !raw.every(color => typeof color === 'string' && /^#[\da-f]{6}$/i.test(color))) {
    throw Error('Нужно 8 HEX-цветов. Сначала 4 для фона, затем 4 для объектов.');
  }
  return raw.map(color => color.toLowerCase());
}

export function newLayer(assetId, key, role = 'main') {
  return { key, assetId, role, x: .5, y: .5, angle: 0 };
}

export function initialScene() {
  return {
    title: 'Собрать знания по кусочкам', format: 'wide', size: 'L', layout: 'compact',
    palette: 'iris', custom: null,
    layers: layoutLayers([
      newLayer('book', 'initial-book'),
      newLayer('puzzles', 'initial-puzzles'),
      newLayer('pen', 'initial-pen', 'background'),
    ], 'wide', 'compact').sort((a, b) => Number(b.role === 'background') - Number(a.role === 'background')),
  };
}
