/**
 * 分类页：等高行对齐网格。
 *
 * 用等高行对齐而不是瀑布流 —— 边缘整齐、更像作品集，
 * 而且手机照片横竖混排严重，瀑布流会显得很碎。
 */
import { watchImages, justifyRows } from './util.js';

export function initGallery(photos, lightbox, config){
  const gridEl = document.getElementById('grid');
  if (!gridEl || !photos || !photos.length) return;

  const GAP     = (config && config.gap) || 8;
  const targetH = (config && config.targetHeight) || 296;

  function layout(){
    const cs = getComputedStyle(gridEl);
    const W  = gridEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (W <= 0) return;

    // 窄屏行高按比例降下来，否则一屏放不下两张
    const h = W < 640 ? targetH * 0.57 : (W < 1100 ? targetH * 0.78 : targetH);
    const rows = justifyRows(photos.map(p => p.ar), W, GAP, h);

    gridEl.innerHTML = '';
    let i = 0;

    for (const r of rows){
      const rowEl = document.createElement('div');
      rowEl.className = 'grid-row';

      for (let j = r.start; j < r.end; j++){
        const p = photos[j];
        const d = document.createElement('div');
        d.className = 'grid-item';
        d.style.width  = (p.ar * r.h) + 'px';
        d.style.height = r.h + 'px';
        d.style.animationDelay = Math.min(i * 22, 700) + 'ms';
        d.innerHTML = `<img src="${p.thumb}" alt="" loading="lazy" decoding="async" draggable="false">`;
        d.addEventListener('click', () => lightbox.open(photos, j));
        rowEl.appendChild(d);
        i++;
      }
      gridEl.appendChild(rowEl);
    }

    watchImages(gridEl);
  }

  layout();

  let timer;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(layout, 160);
  });
}
