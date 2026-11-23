import { CATALOG } from './assets.mjs';
import {
  FORMATS, LAYOUTS, PALETTES, normalize, fromNames, composeScene, placeAdded,
  parsePalette, newLayer, initialScene,
} from './engine.mjs';
import { suggest } from './semantics.mjs';
import { PROVIDERS, suggestWithAI } from './ai.mjs';
import { ASSETS, objectTransform, sceneSVG, thumbnail } from './vector.mjs';
import { EXAMPLES } from './examples.mjs';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const icons = {
  spark: '<path d="M12 2 9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5L12 2Z"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  upload: '<path d="M12 16V4M8 8l4-4 4 4M4 16v4h16v-4"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/>',
  layers: '<path d="m3 10 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5"/>',
  sliders: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="white"/><circle cx="15" cy="17" r="2" fill="white"/>',
  undo: '<path d="M9 7 4 12l5 5m-5-5h11c4 0 5 3 5 5"/>',
  redo: '<path d="m15 7 5 5-5 5m5-5H9c-4 0-5 3-5 5"/>',
  pointer: '<path d="m5 4 14 8-7 1-2 7-5-16Z"/>',
  minus: '<path d="M6 12h12"/>',
  plus: '<path d="M6 12h12m-6-6v12"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 4H6a2 2 0 0 0-2 2v10"/>',
  trash: '<path d="M4 7h16m-11 0V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/>',
  up: '<path d="M12 19V5m-5 5 5-5 5 5"/>',
  down: '<path d="M12 5v14m-5-5 5 5 5-5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
};

const storageKey = 'montage-illustration-scene-v2';
const aiKey = 'montage-ai-settings-v1';
const artboard = $('#artboard');
const stage = $('#stage');
const query = $('#query');
const search = $('#search');
const undo = [];
const redo = [];
let scene = loadScene();
let selected = null;
let mode = 'meaning';
let zoom = 1;
let drag = null;
let toastTimer;
let renderedSize = '';
let busy = false;
let fitStart = null;
let ai = loadAI();
const drafts = { meaning: scene.title, names: '' };
const layerKey = () => [...crypto.getRandomValues(new Uint32Array(3))].map(part => part.toString(16).padStart(8, '0')).join('');

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icons[name]}</svg>`;
}

function loadScene() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey));
    if (!value || !Object.hasOwn(FORMATS, value.format) || !Object.hasOwn(LAYOUTS, value.layout) ||
        !['S','L'].includes(value.size) || typeof value.title !== 'string' ||
        !Array.isArray(value.layers) || value.layers.length > 60 ||
        !Number.isFinite(value.scale) || !(value.fit >= .6 && value.fit <= 1.6)) return initialScene();
    if (value.palette === 'custom') value.custom = parsePalette(JSON.stringify(value.custom));
    else if (!Object.hasOwn(PALETTES, value.palette)) return initialScene();
    if (value.layers.some(layer => !ASSETS.has(layer.assetId) || !['main','background'].includes(layer.role) ||
      ![layer.x, layer.y, layer.angle].every(Number.isFinite) || typeof layer.key !== 'string')) return initialScene();
    return value;
  } catch {
    return initialScene();
  }
}

// Настройки ИИ: ключ остаётся в sessionStorage, а с галочкой «запомнить» — в localStorage.
function loadAI() {
  const empty = { enabled: false, provider: 'openrouter', key: '', model: '', endpoint: '', remember: false };
  for (const store of [() => sessionStorage, () => localStorage]) {
    try {
      const value = JSON.parse(store().getItem(aiKey));
      if (value && Object.hasOwn(PROVIDERS, value.provider)) return { ...empty, ...value };
    } catch { /* хранилище может быть выключено */ }
  }
  return empty;
}

function saveAI() {
  try {
    sessionStorage.setItem(aiKey, JSON.stringify(ai));
    if (ai.remember) localStorage.setItem(aiKey, JSON.stringify(ai));
    else localStorage.removeItem(aiKey);
  } catch { /* настройки действуют до перезагрузки */ }
}

function aiReady() {
  return ai.enabled && Boolean(ai.key || ai.provider === 'custom');
}

function renderAIStatus() {
  $('#ai-row').hidden = mode !== 'meaning';
  $('#ai-status').innerHTML = aiReady()
    ? `<i class="dot dot-on"></i>ИИ: ${PROVIDERS[ai.provider].short}`
    : '<i class="dot"></i>Офлайн-словарь';
  $('#ai-open').textContent = aiReady() ? 'Изменить' : 'Подключить ИИ';
}

function saveScene() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(scene));
  } catch { /* The editor works in memory when storage is disabled. */ }
}

function announce(message) {
  const toast = $('#toast');
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4400);
}

function note(message, error = false) {
  const field = $('#query-note');
  field.textContent = message;
  field.classList.toggle('is-error', error);
  field.setAttribute('aria-live', 'polite');
}

function escapeHTML(text) {
  return String(text).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

// Почему выбраны именно эти объекты: источник подбора, метафора и причина для каждого.
function explain(result) {
  const box = $('#explain');
  if (!result) { box.hidden = true; return; }
  const source = result.source === 'ai' ? `ИИ · ${PROVIDERS[ai.provider].short}` :
    result.source === 'names' ? 'По названиям' : 'Словарь ассоциаций';
  const items = result.objects.map(item => `<li><b>${ASSETS.get(item.id).label}</b>` +
    `${item.role === 'background' ? ' <span class="tag">фон</span>' : ''}` +
    `${item.reason ? ` — ${escapeHTML(item.reason)}` : ''}</li>`).join('');
  box.innerHTML = `<span class="badge${result.source === 'ai' ? ' badge-ai' : ''}">${source}</span>` +
    (result.metaphor ? `<p class="metaphor">${escapeHTML(result.metaphor)}</p>` : '') +
    `<ul>${items}</ul>` + (result.warning ? `<p class="explain-warning">${escapeHTML(result.warning)}</p>` : '');
  box.hidden = false;
}

function renderCatalog() {
  const term = normalize(search.value);
  const results = CATALOG.filter(asset => !term ||
    [asset.label, ...asset.aliases, ...asset.tags].some(word => normalize(word).includes(term)));
  $('#catalog-count').textContent = results.length;
  $('#catalog').innerHTML = results.length ? results.map(asset =>
    `<button type="button" class="asset" data-id="${asset.id}" aria-label="Добавить: ${asset.label}">${thumbnail(asset, scene.size)}<span>${asset.label}</span></button>`
  ).join('') : '<p class="empty-note">Компоненты не найдены.</p>';
  renderedSize = scene.size;
}

function renderCanvas() {
  const format = FORMATS[scene.format];
  const shell = $('#artboard-shell');
  const ratio = format.width / format.height;
  const available = Math.min(500, Math.max(260, window.innerHeight * .50));
  shell.style.maxWidth = `${Math.round(available * ratio)}px`;
  artboard.style.setProperty('--zoom', zoom);
  artboard.innerHTML = sceneSVG(scene, { editor: true, selected, zoom });
  $('#frame-label').textContent = `${format.width} × ${format.height} · ${scene.size}`;
  $('#zoom-reset').textContent = `${Math.round(zoom * 100)}%`;
  $('#zoom-out').disabled = zoom <= .5;
  $('#zoom-in').disabled = zoom >= 1.5;
  $('#empty').hidden = scene.layers.length > 0;
}

function renderLayerInspector() {
  const index = scene.layers.findIndex(layer => layer.key === selected);
  const layer = scene.layers[index];
  $('#layer-count').textContent = scene.layers.length;
  $('#layers').replaceChildren(...[...scene.layers].reverse().map(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'layer';
    button.dataset.select = item.key;
    button.setAttribute('aria-pressed', String(item.key === selected));
    button.innerHTML = `<span data-icon="layers">${icon('layers')}</span><span>${ASSETS.get(item.assetId).label}</span><span class="layer-role">${item.role === 'main' ? 'Главный' : 'Фоновый'}</span>`;
    return button;
  }));
  if (!scene.layers.length) $('#layers').innerHTML = '<p class="empty-note">На холсте пока пусто.</p>';
  $('#layer-tools').hidden = !layer;
  if (!layer) return;
  $('#layer-role').value = layer.role;
  $('#angle').value = layer.angle;
  $('#layer-up').disabled = index === scene.layers.length - 1;
  $('#layer-down').disabled = index === 0;
  $('#duplicate').disabled = scene.layers.length >= 60;
}

function renderPalette() {
  const schemes = { ...PALETTES };
  if (scene.custom) schemes.custom = { label: 'Своя', colors: scene.custom };
  $('#palettes').innerHTML = Object.entries(schemes).map(([id, { label, colors }]) =>
    `<button type="button" data-palette="${id}" aria-pressed="${id === scene.palette}"><span class="palette-swatches">${[0,2,4,5].map(i => `<i style="background:${colors[i]}"></i>`).join('')}</span>${label}</button>`
  ).join('');
}

function render() {
  $('#scene-title').textContent = scene.title || 'Новая композиция';
  document.title = `${scene.title || 'Композиция'} — Монтаж`;
  $('#layout').value = scene.layout;
  $('#fit').value = Math.round((scene.fit || 1) * 100);
  $('#fit-value').textContent = `${Math.round((scene.fit || 1) * 100)}%`;
  $('#relayout').disabled = !scene.layers.length;
  $('#export').disabled = !scene.layers.length;
  $('#undo').disabled = !undo.length;
  $('#redo').disabled = !redo.length;
  $$('[data-format]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.format === scene.format)));
  $$('[data-size]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.size === scene.size)));
  renderCanvas();
  renderLayerInspector();
  renderPalette();
  if (renderedSize !== scene.size) renderCatalog();
}

function commit(next, selectedKey = selected, previous = scene) {
  undo.push(previous);
  if (undo.length > 50) undo.shift();
  redo.length = 0;
  scene = next;
  selected = selectedKey;
  saveScene();
  render();
}

function changeHistory(from, to) {
  if (!from.length) return;
  to.push(scene);
  scene = from.pop();
  if (!scene.layers.some(layer => layer.key === selected)) selected = null;
  saveScene();
  render();
}

function changeMode(next, value = drafts[next]) {
  mode = next;
  drafts[mode] = value;
  query.value = value;
  const meaning = mode === 'meaning';
  $('#mode-meaning').setAttribute('aria-pressed', String(meaning));
  $('#mode-names').setAttribute('aria-pressed', String(!meaning));
  $('#query-label').textContent = meaning ? 'Заголовок или метафора' : 'Названия компонентов';
  query.placeholder = meaning ? 'Например, «Найти фокус в шуме»' : 'Например, книга, пазлы, карандаш';
  note(meaning ? 'Подберём компоненты по смыслу из исходной библиотеки.' :
    'Перечисли нужные предметы через запятую.');
  renderAIStatus();
}

async function compose(event) {
  event.preventDefault();
  if (busy) return;
  const input = query.value.trim();
  if (!input) {
    note('Введи заголовок или названия объектов.', true);
    return;
  }
  let result;
  if (mode === 'names') {
    const found = fromNames(input, CATALOG);
    if (found.missing.length) {
      note(`В библиотеке нет: ${found.missing.join(', ')}. Проверь названия в каталоге.`, true);
      return;
    }
    if (found.assets.length > 8) {
      note('Для одной автоматической раскладки выбери до 8 объектов. Остальные можно добавить на холст из библиотеки.', true);
      return;
    }
    result = { source: 'names', objects: found.assets.map(asset => ({ id: asset.id, role: 'main', reason: '' })) };
  } else {
    result = await meaningResult(input);
  }
  if (!result.objects.length) {
    note(aiReady() ? 'Совпадений не нашлось. Переформулируй заголовок.' :
      'Словарь не нашёл знакомых смыслов. Уточни тему (чтение, звук, бюджет) или подключи ИИ.', true);
    explain(null);
    return;
  }
  const layers = result.objects.map(item => newLayer(item.id, layerKey(), item.role));
  const title = mode === 'meaning' ? input : result.objects.map(item => ASSETS.get(item.id).label).join(' · ');
  commit(composeScene(scene, layers, { title }), null);
  note(`На холсте: ${result.objects.map(item => ASSETS.get(item.id).label.toLowerCase()).join(', ')}.`);
  explain(result);
  announce('Композиция собрана');
}

// Сначала ИИ, если он подключён. При ошибке сети или ключа — словарь, с пометкой почему.
async function meaningResult(input) {
  const offline = warning => ({ source: 'offline', warning, objects: suggest(input, CATALOG) });
  if (!aiReady()) return offline();
  setBusy(true);
  try {
    const answer = await suggestWithAI(ai, input, CATALOG);
    return { source: 'ai', metaphor: answer.metaphor, objects: answer.objects };
  } catch (error) {
    return offline(`ИИ недоступен: ${error.message} Использован словарь.`);
  } finally {
    setBusy(false);
  }
}

function setBusy(value) {
  busy = value;
  const button = $('#compose-button');
  button.disabled = value;
  button.classList.toggle('is-busy', value);
  button.lastChild.textContent = value ? 'Модель думает…' : 'Собрать композицию';
}

function select(key) {
  if (selected === key) return;
  selected = key;
  renderCanvas();
  renderLayerInspector();
}

function addObject(id) {
  if (scene.layers.length >= 60) {
    announce('На холсте уже 60 слоёв.');
    return;
  }
  const layer = placeAdded(scene, newLayer(id, layerKey()));
  commit({ ...scene, layers: [...scene.layers, layer] }, layer.key);
  announce(`Добавлено: ${ASSETS.get(id).label.toLowerCase()}`);
}

function updateLayer(values) {
  const layer = scene.layers.find(item => item.key === selected);
  if (!layer || Object.entries(values).every(([key, value]) => layer[key] === value)) return;
  const layers = scene.layers.map(item => item.key === selected ? { ...item, ...values } : item);
  commit({ ...scene, layers });
}

function reorder(direction) {
  const layers = [...scene.layers];
  const index = layers.findIndex(item => item.key === selected);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= layers.length) return;
  [layers[index], layers[target]] = [layers[target], layers[index]];
  commit({ ...scene, layers });
}

function duplicate() {
  const index = scene.layers.findIndex(item => item.key === selected);
  if (index < 0 || scene.layers.length >= 60) return;
  const original = scene.layers[index];
  const layer = { ...original, key: layerKey(), x: Math.min(.99, original.x + .025), y: Math.min(.99, original.y + .035) };
  const layers = [...scene.layers];
  layers.splice(index + 1, 0, layer);
  commit({ ...scene, layers }, layer.key);
}

function deleteLayer() {
  if (!selected) return;
  commit({ ...scene, layers: scene.layers.filter(item => item.key !== selected) }, null);
}

function updateFormat(format) {
  if (scene.format === format) return;
  commit(composeScene(scene, scene.layers, { format }));
}

function updateZoom(value) {
  zoom = Math.max(.5, Math.min(1.5, +value.toFixed(2)));
  renderCanvas();
}

function download() {
  if (!scene.layers.length) return;
  const filename = normalize(scene.title).replaceAll(' ', '-').slice(0, 64) || 'montage';
  const url = URL.createObjectURL(new Blob([sceneSVG(scene)], { type: 'image/svg+xml;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filename}-${scene.format}.svg`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce('Векторная композиция скачана');
}

function dragStart(event) {
  if (event.button !== 0) return;
  const key = event.target.closest('[data-layer]')?.dataset.layer;
  if (!key) { select(null); return; }
  const layer = scene.layers.find(item => item.key === key);
  const box = $('.artboard').getBoundingClientRect();
  drag = { before: scene, key, x: event.clientX, y: event.clientY, layer, box, pointer: event.pointerId };
  select(key);
  artboard.setPointerCapture(event.pointerId);
  stage.classList.add('is-dragging');
}

function dragMove(event) {
  if (!drag || event.pointerId !== drag.pointer) return;
  const clamp = value => Math.min(.98, Math.max(.02, value));
  const x = clamp(drag.layer.x + (event.clientX - drag.x) / drag.box.width);
  const y = clamp(drag.layer.y + (event.clientY - drag.y) / drag.box.height);
  if (scene === drag.before && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 3) return;
  const changed = { ...drag.layer, x, y };
  scene = { ...scene, layers: scene.layers.map(item => item.key === drag.key ? changed : item) };
  const group = [...artboard.querySelectorAll('[data-layer]')].find(node => node.dataset.layer === drag.key);
  group.setAttribute('transform', objectTransform(scene, changed));
}

function dragEnd(event) {
  if (!drag || event.pointerId !== drag.pointer) return;
  const { before, key } = drag;
  drag = null;
  stage.classList.remove('is-dragging');
  if (event.type === 'pointercancel') { scene = before; render(); return; }
  if (scene !== before) commit(scene, key, before);
}

$$('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
$('#formats').innerHTML = Object.entries(FORMATS).map(([id, format]) =>
  `<button type="button" data-format="${id}" aria-label="${format.label}" title="${format.label} · ${format.width} × ${format.height}"><i class="format-icon ${id}"></i>${{ wide: 'Широкий', square: 'Квадрат', tall: 'Вертикаль' }[id]}</button>`
).join('');
$('#layout').innerHTML = Object.entries(LAYOUTS).map(([id, label]) => `<option value="${id}">${label}</option>`).join('');

$('#compose').addEventListener('submit', compose);
$('#mode-meaning').onclick = () => changeMode('meaning');
$('#mode-names').onclick = () => changeMode('names');
query.oninput = () => { drafts[mode] = query.value; };
search.oninput = renderCatalog;
$('#catalog').onclick = event => {
  const asset = event.target.closest('[data-id]');
  if (asset) addObject(asset.dataset.id);
};
$('#formats').onclick = event => {
  const option = event.target.closest('[data-format]');
  if (option) updateFormat(option.dataset.format);
};
$$('[data-size]').forEach(button => {
  button.onclick = () => {
    if (scene.size !== button.dataset.size) commit({ ...scene, size: button.dataset.size });
  };
});
$('#layout').onchange = event => {
  commit(composeScene(scene, scene.layers, { layout: event.target.value }));
};
$('#relayout').onclick = () => commit(composeScene(scene, scene.layers));
// Пока ползунок тянут, холст перерисовывается без записи в историю; отпустили — один шаг отмены.
$('#fit').onpointerdown = () => { fitStart = scene; };
$('#fit').oninput = event => {
  fitStart ||= scene;
  $('#fit-value').textContent = `${event.target.value}%`;
  scene = { ...scene, fit: Number(event.target.value) / 100 };
  renderCanvas();
};
$('#fit').onchange = event => {
  const before = fitStart || scene;
  fitStart = null;
  commit({ ...scene, fit: Number(event.target.value) / 100 }, selected, before);
};
$('#palettes').onclick = event => {
  const option = event.target.closest('[data-palette]');
  if (option && scene.palette !== option.dataset.palette) commit({ ...scene, palette: option.dataset.palette });
};
$('#layers').onclick = event => {
  const row = event.target.closest('[data-select]');
  if (row) {
    select(row.dataset.select);
    [...$$('[data-select]')].find(button => button.dataset.select === selected)?.focus();
  }
};
$('#layer-role').onchange = event => updateLayer({ role: event.target.value });
$('#angle').onchange = event => {
  const value = Math.round(event.target.valueAsNumber);
  if (Number.isFinite(value)) updateLayer({ angle: Math.max(-180, Math.min(180, value)) });
  else renderLayerInspector();
};
$('#layer-up').onclick = () => reorder(1);
$('#layer-down').onclick = () => reorder(-1);
$('#duplicate').onclick = duplicate;
$('#delete').onclick = deleteLayer;
$('#undo').onclick = () => changeHistory(undo, redo);
$('#redo').onclick = () => changeHistory(redo, undo);
$('#zoom-reset').onclick = () => updateZoom(1);
$('#zoom-out').onclick = () => updateZoom(zoom - .25);
$('#zoom-in').onclick = () => updateZoom(zoom + .25);
$('#export').onclick = download;
artboard.addEventListener('pointerdown', dragStart);
artboard.addEventListener('pointermove', dragMove);
artboard.addEventListener('pointerup', dragEnd);
artboard.addEventListener('pointercancel', dragEnd);
window.addEventListener('resize', renderCanvas);

const paletteDialog = $('#palette-dialog');
const paletteValue = $('#palette-value');
const paletteFile = $('#palette-file');
const paletteError = $('#palette-error');
$('#palette-open').onclick = () => {
  paletteValue.value = (scene.custom || PALETTES[scene.palette].colors).join(' ');
  paletteFile.value = '';
  paletteError.textContent = '';
  paletteDialog.showModal();
};
paletteFile.onchange = async () => {
  const file = paletteFile.files[0];
  if (!file) return;
  try {
    if (file.size > 10000) throw Error('Файл палитры должен быть меньше 10 КБ.');
    const colors = parsePalette(await file.text());
    paletteValue.value = colors.join(' ');
    paletteError.textContent = '';
  } catch (error) {
    paletteError.textContent = error.message;
  }
};
$('#palette-form').onsubmit = event => {
  event.preventDefault();
  try {
    const custom = parsePalette(paletteValue.value);
    commit({ ...scene, custom, palette: 'custom' });
    paletteDialog.close();
    announce('Своя палитра применена');
  } catch (error) {
    paletteError.textContent = error.message;
  }
};

const aiDialog = $('#ai-dialog');
$('#ai-provider').innerHTML = Object.entries(PROVIDERS).map(([id, item]) => `<option value="${id}">${item.label}</option>`).join('');
function fillAIForm(providerId) {
  const provider = PROVIDERS[providerId];
  const same = providerId === ai.provider;
  $('#ai-provider').value = providerId;
  $('#ai-key').value = same ? ai.key : '';
  $('#ai-model').value = same && ai.model ? ai.model : provider.model;
  $('#ai-model').placeholder = provider.model || 'например, qwen2.5:7b';
  $('#ai-endpoint').value = same && ai.endpoint ? ai.endpoint : provider.endpoint;
  $('#ai-endpoint-field').hidden = providerId !== 'custom';
  $('#ai-key-link').hidden = !provider.keys;
  $('#ai-key-link').href = provider.keys || '#';
  $('#ai-key').placeholder = providerId === 'custom' ? 'Необязательно для локальной модели' : 'Вставь ключ';
  $('#ai-remember').checked = ai.remember;
  $('#ai-error').textContent = '';
}
$('#ai-open').onclick = () => { fillAIForm(ai.provider); aiDialog.showModal(); };
$('#ai-provider').onchange = event => fillAIForm(event.target.value);
$('#ai-form').onsubmit = event => {
  event.preventDefault();
  const provider = $('#ai-provider').value;
  const key = $('#ai-key').value.trim();
  const endpoint = $('#ai-endpoint').value.trim();
  if (!key && provider !== 'custom') { $('#ai-error').textContent = 'Вставь API-ключ или выбери «Свой» для локальной модели.'; return; }
  if (provider === 'custom' && !$('#ai-model').value.trim()) { $('#ai-error').textContent = 'Укажи название модели, например qwen2.5:7b.'; return; }
  if (provider === 'custom' && !/^https?:[/][/]/.test(endpoint)) { $('#ai-error').textContent = 'Укажи адрес API, начиная с http:// или https://.'; return; }
  ai = { enabled: true, provider, key, model: $('#ai-model').value.trim(), endpoint: provider === 'custom' ? endpoint : '', remember: $('#ai-remember').checked };
  saveAI();
  renderAIStatus();
  aiDialog.close();
  announce(`Подбор через ${PROVIDERS[provider].short} включён`);
};
$('#ai-off').onclick = () => {
  ai = { ...ai, enabled: false, key: '', remember: false };
  saveAI();
  renderAIStatus();
  aiDialog.close();
  announce('ИИ выключен, работает словарь');
};

const examplesDialog = $('#examples-dialog');
$('#example-grid').innerHTML = EXAMPLES.map(({ scene: example, id }) =>
  `<button type="button" class="example" data-example="${id}"><i style="background:${PALETTES[example.palette].colors[0]}"></i><strong>${example.title}</strong><small>${FORMATS[example.format].label} · ${example.size}</small></button>`
).join('');
$('#examples-open').onclick = () => examplesDialog.showModal();
$('#example-grid').onclick = event => {
  const id = event.target.closest('[data-example]')?.dataset.example;
  const example = EXAMPLES.find(item => item.id === id);
  if (!example) return;
  const next = { ...structuredClone(example.scene), custom: scene.custom };
  commit(next, null);
  explain(example.explain || null);
  changeMode('meaning', next.title);
  examplesDialog.close();
  announce('Пример открыт');
};
$$('[data-close]').forEach(button => { button.onclick = () => button.closest('dialog').close(); });

window.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.target.closest('input, textarea, select, dialog')) return;
  const command = event.ctrlKey || event.metaKey;
  if (command && event.code === 'KeyZ') {
    event.preventDefault();
    if (event.shiftKey) changeHistory(redo, undo);
    else changeHistory(undo, redo);
  }
  if (command && event.code === 'KeyY') { event.preventDefault(); changeHistory(redo, undo); }
  if (command && selected && event.code === 'KeyD') { event.preventDefault(); duplicate(); }
  if (selected && ['Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); deleteLayer(); }
  if (event.key === 'Escape') select(null);
  const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  const layer = scene.layers.find(item => item.key === selected);
  if (layer && move && !command) {
    event.preventDefault();
    const factor = event.shiftKey ? .025 : .005;
    const clamp = value => Math.min(.98, Math.max(.02, value));
    updateLayer({ x: clamp(layer.x + move[0] * factor), y: clamp(layer.y + move[1] * factor) });
  }
});

const params = new URLSearchParams(location.search);
const demo = EXAMPLES.find(example => example.id === params.get('case'));
if (demo) {
  scene = structuredClone(demo.scene);
  // Opening a demo link leaves the reader's saved composition in place until an edit.
  if (location.protocol !== 'file:') history.replaceState(null, '', location.pathname);
}
changeMode(params.get('mode') === 'names' ? 'names' : 'meaning', params.get('mode') === 'names' ?
  (demo?.scene.layers.map(layer => ASSETS.get(layer.assetId).label).join(', ') || '') : scene.title);
render();
