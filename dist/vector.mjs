import { BACKDROPS, CATALOG } from './assets.mjs';
import { FORMATS, PALETTES, S_FACTOR, TITLE_ZONE, autoScale } from './engine.mjs';

export const ASSETS = new Map(CATALOG.map(asset => [asset.id, asset]));
const fixed = value => +value.toFixed(3);
const recolor = (body, colors) => body.replace(/@@([0-7])@@/g, (_, slot) => colors[slot]);
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[char]);

export function thumbnail(asset, size) {
  const { box, body } = asset.variants[size].main;
  return `<svg viewBox="${box.join(' ')}" aria-hidden="true" focusable="false">${recolor(body, PALETTES.iris.colors)}</svg>`;
}

export function objectTransform(scene, layer) {
  const { width, height } = FORMATS[scene.format];
  const { box: [x, y, w, h] } = ASSETS.get(layer.assetId).variants[scene.size][layer.role];
  const base = Number.isFinite(scene.scale) ? scene.scale : autoScale(scene.layers, scene.format, scene.layout);
  const scale = base * (scene.fit || 1) * (scene.size === 'L' ? 1 : S_FACTOR);
  return `translate(${fixed(layer.x * width)} ${fixed(layer.y * height)}) rotate(${fixed(layer.angle)}) scale(${fixed(scale)}) translate(${fixed(-x - w / 2)} ${fixed(-y - h / 2)})`;
}

export function sceneSVG(scene, { editor = false, selected = null, zoom = 1 } = {}) {
  const { width, height } = FORMATS[scene.format];
  const colors = scene.palette === 'custom' ? scene.custom : PALETTES[scene.palette].colors;
  const source = BACKDROPS[scene.size][scene.palette === 'custom' ? 'iris' : scene.palette];
  const [bx, by, bw, bh] = source.box;
  const backdropScale = Math.max(width / bw, height / bh);
  // Keep the source artwork at its original aspect ratio and crop at the frame.
  const left = (width - bw * backdropScale) / 2;
  const top = (height - bh * backdropScale) / 2;
  const backdrop = `<g id="background"><rect width="${width}" height="${height}" fill="${colors[0]}"/><g transform="translate(${fixed(left)} ${fixed(top)}) scale(${fixed(backdropScale)}) translate(${-bx} ${-by})">${recolor(source.body, colors)}</g></g>`;
  const groups = scene.layers.map(layer => {
    const asset = ASSETS.get(layer.assetId);
    const fragment = asset.variants[scene.size][layer.role];
    const [x, y, w, h] = fragment.box;
    const attributes = editor ? ` data-layer="${escape(layer.key)}" class="canvas-object"` :
      ` id="object-${escape(layer.key)}" data-component="${asset.id}" data-role="${layer.role}"`;
    const hit = editor ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="transparent" pointer-events="all"/>` : '';
    // Подсказка при наведении: тонкая рамка, только в редакторе.
    const ring = editor && selected !== layer.key ? `<rect class="hover-ring" x="${x}" y="${y}" width="${w}" height="${h}"/>` : '';
    const outline = editor && selected === layer.key ?
      `<rect class="selection" x="${x}" y="${y}" width="${w}" height="${h}"/>` : '';
    return `<g${attributes} transform="${objectTransform(scene, layer)}">${hit}${recolor(fragment.body, colors)}${ring}${outline}</g>`;
  }).join('');
  // Подсказка «место для заголовка» видна только в редакторе и в экспорт не попадает.
  const z = TITLE_ZONE[scene.format];
  const guide = editor && scene.layout === 'title' ?
    `<rect class="title-guide" x="${z[0] * width + 18}" y="${z[1] * height + 18}" width="${(z[2] - z[0]) * width - 36}" height="${(z[3] - z[1]) * height - 36}" rx="10"/>` : '';
  const id = editor ? 'editor-frame' : 'export-frame';
  const controls = editor ? ` class="artboard" role="img" aria-label="Холст композиции" data-zoom="${zoom}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"${controls}><title>${escape(scene.title || 'Композиция')}</title><defs><clipPath id="${id}"><rect width="${width}" height="${height}"/></clipPath></defs><g clip-path="url(#${id})">${backdrop}${groups}${guide}</g></svg>`;
}
