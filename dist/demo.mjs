import { EXAMPLES } from './examples.mjs';
import { FORMATS, PALETTES } from './engine.mjs';
import { ASSETS, sceneSVG } from './vector.mjs';

const grid = document.querySelector('#demo-cards');
EXAMPLES.forEach(({ id, scene, explain }) => {
  const format = FORMATS[scene.format];
  const picked = explain.objects.map(item => ASSETS.get(item.id).label.toLowerCase() + (item.role === 'background' ? ' (фон)' : '')).join(', ');
  const blob = new Blob([sceneSVG(scene)], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const card = document.createElement('article');
  card.className = 'demo-card';
  card.innerHTML = `<div class="demo-preview"><img src="${url}" alt="${scene.title}"></div>
    <div class="demo-info">
      <h2>${scene.title}</h2><p>Подбор: ${picked}</p><p>${format.width} × ${format.height} · ${scene.size} · ${PALETTES[scene.palette].label} · ${{ compact: 'собранно', offset: 'со смещением', title: 'под заголовок' }[scene.layout]}</p>
      <div class="demo-actions"><a class="button button-accent" href="./?case=${id}">Открыть в редакторе</a>
      <a class="button button-quiet" href="${url}" download="${id}.svg">SVG</a></div>
    </div>`;
  grid.append(card);
});
