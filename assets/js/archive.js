/**
 * 归档页：按年月分组的时间轴 + 右侧年份筛选轨。
 *
 * 一行放不下就折成「+N」，点击就地展开 —— 不跳页，
 * 因为跳页会丢滚动位置，回来还得重新找。
 *
 * 分组和筛选用的日期字符串（ym / y）都是 Hugo 那边格式化好的，
 * 前端不做任何日期解析，避免时区把跨时区拍的照片挪到隔壁月份。
 */
import { watchImages } from './util.js';

const GAP = 6;

export function initArchive(photos, lightbox){
  const tl   = document.getElementById('timeline');
  const rail = document.getElementById('year-rail');
  const meta = document.getElementById('arc-meta');
  if (!tl || !photos || !photos.length) return;

  const expanded = new Set();     // 已就地展开的月份 key
  let year = 'all';

  /* ---------- 分组：照片已按时间倒序，Map 的插入顺序就是分组顺序 ---------- */
  const groups = [];
  const byKey  = new Map();
  for (const p of photos){
    const key = p.has ? p.ym : 'unknown';
    if (!byKey.has(key)){
      const g = { key, y: p.has ? p.y : '', m: p.has ? p.ym.slice(5) : '', photos: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    byKey.get(key).photos.push(p);
  }

  const years = [...new Set(photos.filter(p => p.has).map(p => p.y))].sort((a, b) => b - a);

  /* ---------- 年份筛选轨 ---------- */
  function renderRail(){
    rail.innerHTML = '';
    const items = [{ v:'all', label:'全部' }, ...years.map(y => ({ v:y, label:y }))];
    items.forEach(it => {
      const b = document.createElement('button');
      b.className = 'year-item' + (year === it.v ? ' is-active' : '');
      b.innerHTML = `<span>${it.label}</span><i></i>`;
      b.addEventListener('click', () => {
        if (year === it.v) return;
        year = it.v;
        render();
        window.scrollTo({ top:0, behavior:'smooth' });   // 换了年份，回到顶部
      });
      rail.appendChild(b);
    });
  }

  /* ---------- 缩略图 ---------- */
  function makeThumb(list, j){
    const t = document.createElement('div');
    t.className = 'tl-thumb';
    t.innerHTML = `<img src="${list[j].thumb}" alt="" loading="lazy" decoding="async" draggable="false">`;
    t.addEventListener('click', () => lightbox.open(list, j));
    return t;
  }

  /** 量真实缩略图宽度：直接读 CSS，避免在 JS 里把 clamp 再写一遍 */
  function measureThumbW(strip){
    const probe = document.createElement('div');
    probe.className = 'tl-thumb';
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
    strip.appendChild(probe);
    const w = probe.offsetWidth || 100;
    probe.remove();
    return w;
  }

  function perRowCount(strip){
    const W = strip.clientWidth;
    if (!W) return 12;
    const tw = measureThumbW(strip);
    return Math.max(3, Math.floor((W + GAP) / (tw + GAP)));
  }

  /** 高度过渡：先钉住旧高 → 强制回流 → 放到新高 → 收尾清干净 */
  function animateHeight(el, from, to, dur){
    el.style.height = from + 'px';
    el.style.overflow = 'hidden';
    void el.offsetHeight;
    el.style.transition = `height ${dur}s cubic-bezier(.22,1,.36,1)`;
    el.style.height = to + 'px';
    el.addEventListener('transitionend', () => {
      el.style.height = el.style.overflow = el.style.transition = '';
    }, { once:true });
  }

  function makeCollapse(strip, list, key){
    const btn = document.createElement('button');
    btn.className = 'tl-collapse';
    btn.textContent = '收起';
    btn.addEventListener('click', () => {
      expanded.delete(key);
      const h0 = strip.offsetHeight;
      fillStrip(strip, list, key);
      animateHeight(strip, h0, strip.offsetHeight, .5);
    });
    return btn;
  }

  function fillStrip(strip, list, key){
    strip.innerHTML = '';
    const visible = Math.max(2, perRowCount(strip) - 1);   // 留一格给「+N」
    const showAll = expanded.has(key) || list.length <= visible;

    if (showAll){
      list.forEach((p, j) => strip.appendChild(makeThumb(list, j)));
      if (list.length > visible) strip.appendChild(makeCollapse(strip, list, key));
      watchImages(strip);
      return;
    }

    for (let j = 0; j < visible; j++) strip.appendChild(makeThumb(list, j));

    // 「+N」：正面是下一张压暗作底，后面露出两张牌暗示「还有更多」
    const more = document.createElement('button');
    more.className = 'tl-more';
    more.innerHTML = `
      <span class="tl-more-face">
        <img src="${list[visible].thumb}" alt="" loading="lazy" decoding="async" draggable="false">
        <span class="tl-more-count">+${list.length - visible}</span>
      </span>`;
    more.addEventListener('click', () => {
      expanded.add(key);
      const h0 = strip.offsetHeight;
      more.remove();
      for (let j = visible; j < list.length; j++){
        const t = makeThumb(list, j);
        t.classList.add('tl-thumb-enter');
        t.style.animationDelay = Math.min((j - visible) * 16, 420) + 'ms';
        strip.appendChild(t);
      }
      const col = makeCollapse(strip, list, key);
      col.style.animation = 'thumbIn .5s var(--ease) both';
      strip.appendChild(col);
      watchImages(strip);
      animateHeight(strip, h0, strip.offsetHeight, .6);
    });
    strip.appendChild(more);
    watchImages(strip);
  }

  /* ---------- 渲染 ---------- */
  function render(){
    renderRail();

    const shown = year === 'all' ? groups : groups.filter(g => g.y === year);
    const count = shown.reduce((n, g) => n + g.photos.length, 0);

    meta.textContent = year === 'all'
      ? `${count} 张 · 按时间倒序`
      : `${year} 年 · ${count} 张`;

    tl.innerHTML = '';
    shown.forEach((g, i) => {
      const el = document.createElement('div');
      el.className = 'tl-group';
      el.dataset.key = g.key;
      el.style.animationDelay = Math.min(i * 40, 800) + 'ms';

      const stamp = g.key === 'unknown'
        ? `<div class="tl-year">—</div><div class="tl-month">未标注时间 · ${g.photos.length} 张</div>`
        : `<div class="tl-year">${g.y}</div><div class="tl-month">${g.m} 月 · ${g.photos.length} 张</div>`;

      el.innerHTML = `<div class="tl-stamp">${stamp}</div><div class="tl-strip"></div>`;
      tl.appendChild(el);                                    // 先入 DOM，量宽度才有值
      fillStrip(el.querySelector('.tl-strip'), g.photos, g.key);
    });
  }

  render();

  /* ---------- 宽度变了，一行放得下几张也变了 ---------- */
  let timer;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      tl.querySelectorAll('.tl-group').forEach(el => {
        const g = byKey.get(el.dataset.key);
        if (g) fillStrip(el.querySelector('.tl-strip'), g.photos, g.key);
      });
    }, 160);
  });
}
