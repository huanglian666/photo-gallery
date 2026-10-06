/**
 * 首页牌堆。
 *
 * 三件事：发牌入场、悬停时其余牌退让、拖拽时整副牌跟着手转。
 * 所有位移都走弹簧，不用 CSS transition —— 拖拽要跟手、松手要回弹。
 */
import { Spring } from './spring.js';
import { watchImages } from './util.js';

const isNarrow = () => window.innerWidth < 640;

export function initDeck(albums, config){
  const deckEl  = document.getElementById('deck');
  const stageEl = document.getElementById('stage');
  if (!deckEl || !albums || !albums.length) return;

  const maxW  = (config && config.maxWidth) || 380;
  const ratio = (config && config.ratio)    || 1.5;

  let cards = [];
  let deckAngle, deckScale;
  let hoverIndex = -1;
  let drag = null;
  let suppressNav = false;      // 拖拽结束后要吞掉随之而来的那次 click

  /**
   * 牌宽同时受宽高约束，取小值：
   *   宽度：扇形总宽 = cw × (6 × 0.42 + 1) = cw × 3.52
   *   高度：牌高 = cw × ratio，另留 250px 给顶栏、提示和呼吸空间
   * 首页没别的东西，牌就该撑满，但不能撑到被裁。
   */
  function metrics(){
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (isNarrow()){
      const cw = Math.max(118, Math.min(vw * 0.34, 176));
      return { cw, stepX: cw * 0.32, rotStep: 5.6, arcY: 2.2, scaleFalloff: .026, liftY: -18 };
    }

    const byWidth  = (vw - 140) / 3.52;
    const byHeight = (vh - 250) / ratio;
    const cw = Math.max(150, Math.min(byWidth, byHeight, maxW));

    return { cw, stepX: cw * 0.42, rotStep: 3.7, arcY: 3.3, scaleFalloff: .026, liftY: -36 };
  }

  function fanTarget(i, n, m){
    const d = i - (n - 1) / 2;
    return {
      x: d * m.stepX,
      y: d * d * m.arcY,
      rot: d * m.rotStep,
      scale: 1 - Math.abs(d) * m.scaleFalloff,
    };
  }

  function build(){
    deckEl.innerHTML = '';
    cards = [];
    const n = albums.length;
    const m = metrics();
    document.documentElement.style.setProperty('--cw', m.cw + 'px');

    albums.forEach((album, i) => {
      const el = document.createElement('a');
      el.className = 'card';
      el.dataset.index = i;
      el.href = album.url;
      el.innerHTML = `
        <div class="card-media"><img src="${album.src}" alt="${album.name}" draggable="false"></div>
        <div class="card-sheen"></div>
        <div class="card-scrim"></div>
        <div class="card-count">${album.count}</div>
        <div class="card-body">
          <div class="card-name">${album.name}</div>
          <div class="card-en">${album.en}</div>
        </div>`;
      el.querySelector('img').addEventListener('error', e => {
        e.target.closest('.card-media').classList.add('fallback');
      });
      deckEl.appendChild(el);

      cards.push({
        el, index: i,
        delay: 480 + i * 58,                 // 依次发牌的节奏
        dealt: false,
        sx: new Spring(0), sy: new Spring(0),
        sr: new Spring(0), ss: new Spring(0.94),
        target: fanTarget(i, n, m),
      });

      // z 从左到右递增：每张牌只盖住左边那张的右半边，
      // 于是所有牌左下角的分类名都露在外面
      el.style.zIndex = 100 + i;
    });

    watchImages(deckEl);
    deckAngle = new Spring(0, { stiffness: 130, damping: 20 });
    deckScale = new Spring(1, { stiffness: 150, damping: 22 });
    refreshCenter();
  }

  /* ---------- 悬停：一张前推，其余退让 ---------- */
  function applyTargets(){
    const i = hoverIndex;
    const n = cards.length;
    const m = metrics();
    deckEl.classList.toggle('is-hovering', i >= 0);

    cards.forEach((c, j) => {
      const f = fanTarget(j, n, m);
      c.el.classList.toggle('is-active', j === i);

      if (i < 0){                                   // 常态：回到扇形
        c.sx.set(f.x); c.sy.set(f.y); c.sr.set(f.rot); c.ss.set(f.scale);
      } else if (j === i){                          // 前推：上浮 + 放大 + 转正
        c.sx.set(f.x); c.sy.set(f.y + m.liftY);
        c.sr.set(0);   c.ss.set(f.scale * 1.075);
      } else {                                      // 退让：下沉 + 缩小 + 被推离焦点
        const push = Math.sign(j - i) * m.cw * 0.035;
        c.sx.set(f.x + push); c.sy.set(f.y + 9);
        c.sr.set(f.rot * 1.12); c.ss.set(f.scale * 0.955);
      }
    });
  }

  function setHover(i){
    if (hoverIndex === i) return;
    hoverIndex = i;
    applyTargets();
  }

  /* ---------- 命中判定 ---------- */

  // 舞台中心：牌在舞台里居中，舞台本身没有 transform，位置稳定，可以缓存
  let center = { x:0, y:0 };
  function refreshCenter(){
    const r = stageEl.getBoundingClientRect();
    center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /**
   * 用「静止扇形」的几何判定光标落在哪张牌上，不用 DOM 命中测试。
   *
   * 为什么不能用 DOM：悬停会让牌上浮放大、其余牌缩小位移，牌在光标底下动。
   * 从「旅行」移向「日常」时，牌一移动光标可能已经落到「人像」上，
   * 触发新一轮悬停 —— 形成「悬停改布局、布局改悬停」的反馈环，来回抖。
   *
   * 静止几何下，每张牌独占的区域是一条宽 stepX 的竖带
   * （右边那张盖住它，只露出 stepX 宽）。这些带固定不动，判定就稳定了。
   */
  function hitTest(clientX, clientY){
    const n = cards.length;
    if (!n) return -1;
    const m = metrics();

    // 抵消拖拽时的整体旋转，换算回牌的静止坐标系
    const th = (deckAngle ? deckAngle.value : 0) * Math.PI / 180;
    const dx = clientX - center.x;
    const dy = clientY - center.y;
    const lx =  dx * Math.cos(th) + dy * Math.sin(th);
    const ly = -dx * Math.sin(th) + dy * Math.cos(th);

    const h     = m.cw * ratio;
    const mid   = (n - 1) / 2;
    const left  = -mid * m.stepX - m.cw / 2;       // 最左那张牌的左边缘
    const right =  mid * m.stepX + m.cw / 2;       // 最右那张牌的右边缘
    const top   = -h / 2 - 45;                     // 留 45px 容差，覆盖悬停上浮
    const bot   = mid * mid * m.arcY + h / 2 + 45;

    if (lx < left || lx >= right || ly < top || ly > bot) return -1;

    // 每张牌独占一条宽 stepX 的竖带（右边那张盖住它，只露这么宽）。
    // 最右那张没被任何牌盖住，整张都归它，所以要夹到 n-1。
    let i = Math.floor((lx - left) / m.stepX);
    if (i > n - 1) i = n - 1;
    return i;
  }

  /* ---------- 拖拽：整副牌跟着手转 ---------- */
  function onDown(e){
    if (e.button !== undefined && e.button !== 0) return;
    drag = { id:e.pointerId, startX:e.clientX, moved:0, card:e.target.closest('.card') };
    deckEl.classList.add('is-dragging');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function onMove(e){
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.startX;
    drag.moved = Math.max(drag.moved, Math.abs(dx));

    let a = dx * 0.05;                                   // 每像素 0.05 度
    if (Math.abs(a) > 20) a = Math.sign(a) * (20 + (Math.abs(a) - 20) * 0.22);   // 橡皮筋
    deckAngle.jump(a);
    deckScale.jump(1 - Math.min(Math.abs(a) / 20, 1) * 0.035);
  }

  function onUp(e){
    if (!drag) return;
    const { moved, card } = drag;
    drag = null;
    deckEl.classList.remove('is-dragging');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);

    deckAngle.set(0);                                    // 弹簧回正
    deckScale.set(1);

    // 位移小于 6px 视为点击，交给 <a> 自己跳转；
    // 超过 6px 是拖拽，要吞掉紧随其后触发的那次 click，否则会误进相册。
    // preventDefault 在 pointerup 上拦不住 click，只能挂到 click 上。
    if (moved >= 6 && card){
      suppressNav = true;
      setTimeout(() => { suppressNav = false; }, 0);
    }
  }

  deckEl.addEventListener('click', e => {
    if (suppressNav){ e.preventDefault(); e.stopPropagation(); }
  });

  deckEl.addEventListener('pointerdown', onDown);

  // 悬停只在指针设备上启用，触屏没有 hover 语义。
  // 用 pointermove 而不是 pointerover：判定基于几何而非 DOM，
  // 需要持续跟踪位置，不能只在进出元素时触发。
  stageEl.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' || drag) return;
    setHover(hitTest(e.clientX, e.clientY));
  });
  stageEl.addEventListener('pointerleave', () => setHover(-1));

  /* ---------- 主循环 ---------- */
  let last = performance.now();
  function tick(now){
    const dt = Math.min((now - last) / 1000, 1 / 30);    // 钳制，防止切标签页后炸开
    last = now;

    deckAngle.step(dt);
    deckScale.step(dt);
    deckEl.style.transform =
      `rotate(${deckAngle.value.toFixed(3)}deg) scale(${deckScale.value.toFixed(4)})`;

    for (const c of cards){
      if (!c.dealt && now > c.delay){                    // 依次发牌
        c.dealt = true;
        c.sx.set(c.target.x); c.sy.set(c.target.y);
        c.sr.set(c.target.rot); c.ss.set(c.target.scale);
      }
      c.sx.step(dt); c.sy.step(dt); c.sr.step(dt); c.ss.step(dt);
      c.el.style.transform =
        `translate3d(${c.sx.value.toFixed(2)}px,${c.sy.value.toFixed(2)}px,0) ` +
        `rotate(${c.sr.value.toFixed(3)}deg) scale(${c.ss.value.toFixed(4)})`;
    }
    requestAnimationFrame(tick);
  }

  /* ---------- 尺寸变化：重算牌宽与扇形 ---------- */
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const m = metrics();
      document.documentElement.style.setProperty('--cw', m.cw + 'px');
      cards.forEach((c, i) => { c.target = fanTarget(i, cards.length, m); });
      const prev = hoverIndex;
      hoverIndex = -99; applyTargets();                  // 强制重算目标位
      hoverIndex = prev; applyTargets();
      refreshCenter();
    }, 180);
  });

  build();
  requestAnimationFrame(tick);
  requestAnimationFrame(refreshCenter);      // 等布局稳定后再量一次中心点
}

/**
 * 随机背景。
 *
 * 用缩略图而不是原图：背景被压到 34% 亮度 + 3px 模糊，
 * 在这个处理下 800px 和 4000px 看不出任何差别，没必要拖几 MB 下来。
 */
export function initBackground(urls){
  const img = document.getElementById('bg-img');
  if (!img || !urls || !urls.length) return;

  const url = urls[Math.floor(Math.random() * urls.length)];
  img.style.opacity = '0';
  img.addEventListener('load', () => { img.style.opacity = '1'; }, { once:true });
  img.src = url;

  // 视差：鼠标轻微反向位移，制造纵深
  window.addEventListener('pointermove', e => {
    if (isNarrow()) return;
    const dx = (e.clientX / window.innerWidth  - .5) * -18;
    const dy = (e.clientY / window.innerHeight - .5) * -18;
    img.style.translate = `${dx}px ${dy}px`;
  });
}
