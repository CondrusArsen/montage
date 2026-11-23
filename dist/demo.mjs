import { EXAMPLES } from './examples.mjs';
import { FORMATS, PALETTES } from './engine.mjs';
import { sceneSVG } from './vector.mjs';

const grid = document.querySelector('#demo-cards');
EXAMPLES.forEach(({ id, scene }) => {
  const format = FORMATS[scene.format];
  const mode = id === 'budget' ? 'names' : 'meaning';
  const blob = new Blob([sceneSVG(scene)], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const card = document.createElement('article');
  card.className = 'demo-card';
  card.innerHTML = `<div class="demo-preview"><img src="${url}" alt="${scene.title}"></div>
    <div class="demo-info">
      <h2>${scene.title}</h2><p>${format.width} × ${format.height} · ${scene.size} · ${PALETTES[scene.palette].label}</p>
      <div class="demo-actions"><a class="button button-accent" href="./?case=${id}&mode=${mode}">Открыть в редакторе</a>
      <a class="button button-quiet" href="${url}" download="${id}.svg">SVG</a></div>
    </div>`;
  grid.append(card);
});
