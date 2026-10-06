/**
 * 首页牌堆。
 *
 * 两套形态，按屏宽自动切换：
 *
 *   fan （≥640px）桌面 —— 扇形展开，悬停时一张前推、其余退让，
 *                          拖拽时整副牌跟着手转。
 *   rail（<640px）手机 —— 横向一手牌，左右滑动挑选，停在中间的
 *                          那张自动前推放大（等价于桌面的 hover），
 *                          点一下进入；点两侧的牌先把它滑到中间。
 *
 * 为什么手机上不沿用扇形：扇形靠 hover 选中，而触屏没有 hover 语义；
 * 且扇形总宽随分类数量线性增长，分类一多就会溢出屏幕，靠边的牌
 * 点不中。rail 的牌宽和数量无关，分类再多也只是滑得更久。
 *
 * 所有位移都走弹簧，不用 CSS transition —— 拖拽要跟手、松手要回弹。
 */
import { Spring } from './spring.js';
import { watchImages } from './util.js';

const NARROW = 640;                             // 视口窄于这个值走 rail
const isNarrow = () => window.innerWidth < NARROW;

export function initDeck(albums, config){
  const deckEl  = document.getElementById('deck');
  const stageEl = document.getElementById('stage');
  if (!deckEl || !albums || !albums.length) return;

  const maxW  = (config && config.maxWidth) || 380;
  const ratio = (config && config.ratio)    || 1.5;

  let cards = [];
  let mode  = isNarrow() ? 'rail' : 'fan';      // 当前形态
  let booted = false;                           // 只有首次构建才播发牌动效

  /* ---- fan 专用 ---- */
  let deckAngle, deckScale;
  let hoverIndex = -1;

  /* ---- rail 专用 ----
     focus 是「屏幕正中现在对着第几张牌」的连续值，2.4 这种小数是合法的：
     滑到一半时左右两张各占一半的前推量，过渡才连续。 */
  let focusSpring = null;

  let drag = null;
  let suppressNav = false;      // 拖拽结束后要吞掉随之而来的那次 click

  /**
   * fan：牌宽同时受宽高约束，取小值。
   *   宽度：扇形总宽 = cw × (6 × 0.42 + 1) = cw × 3.52
   *   高度：牌高 = cw × ratio，另留 250px 给顶栏、提示和呼吸空间
   * 首页没别的东西，牌就该撑满，但不能撑到被裁。
   */
  function fanMetrics(){
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const byWidth  = (vw - 140) / 3.52;
    const byHeight = (vh - 250) / ratio;
    const cw = Math.max(150, Math.min(byWidth, byHeight, maxW));

    return { cw, stepX: cw * 0.42, rotStep: 3.7, arcY: 3.3, scaleFalloff: .026, liftY: -36 };
  }

  /**
   * rail：横向一手牌。
   *
   * stepX 决定相邻两张露出多少，这是手机端能不能点中的关键 ——
   * 取 cw 的 0.46 倍，露出的宽度够手指落点，看不清是哪张也能先滑到中间。
   */
  function railMetrics(){
    const vw = window.innerWidth;
    // 0.58 是「牌够大撑得住画面」和「两侧还能露出足够多的邻牌」的折中：
    // 牌宽和露出宽度（stepX）同比放大，所以手机上一屏仍然能看到近 4 张。
    const cw = Math.max(170, Math.min(vw * 0.58, 252));

    return {
      cw,
      stepX:     cw * 0.46,
      liftY:     -26,      // 居中那张相对静止位的上浮量
      restY:      7,       // 其余牌的下沉量
      peakScale:  1.06,    // 居中那张的放大倍率
      restScale:  0.965,   // 其余牌的缩小倍率
      maxTilt:    4.2,     // 两侧牌最多倾斜多少度
    };
  }

  const metrics = () => (mode === 'rail' ? railMetrics() : fanMetrics());

  function fanTarget(i, n, m){
    const d = i - (n - 1) / 2;
    return {
      x: d * m.stepX,
      y: d * d * m.arcY,
      rot: d * m.rotStep,
      scale: 1 - Math.abs(d) * m.scaleFalloff,
    };
  }

  /**
   * rail 单张的目标位。f 是连续的居中位置（可以是 2.4 这种小数），
   * t 是「离正中还有多远」的权重：正中为 1、隔一张为 0，
   * 于是并排滑动时两张牌的前推量此消彼长，不会突然跳一下。
   */
  function railTarget(i, f, m){
    const d  = i - f;
    const t  = Math.max(0, 1 - Math.abs(d));
    const rot = Math.max(-m.maxTilt, Math.min(m.maxTilt, d * 1.8));

    return {
      x: d * m.stepX,
      y: m.restY + t * (m.liftY - m.restY),
      rot,
      scale: m.restScale + t * (m.peakScale - m.restScale),
    };
  }

  function build(){
    deckEl.innerHTML = '';
    cards = [];
    mode = isNarrow() ? 'rail' : 'fan';

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
        dealt: booted,                       // 重建（例如转屏）时直接落位，不重播发牌
        sx: new Spring(0), sy: new Spring(0),
        sr: new Spring(0), ss: new Spring(0.94),
        target: mode === 'fan' ? fanTarget(i, n, m) : null,
      });

      // rail 的出场透明度由 tick 每帧写 inline style，这里先落个初值，
      // 否则第一帧会拿 CSS 默认的 opacity:1 闪一下
      if (mode === 'rail') el.style.opacity = '0';

      // z 从左到右递增：每张牌只盖住左边那张的右半边，
      // 于是所有牌左下角的分类名都露在外面
      el.style.zIndex = 100 + i;
    });

    const rail = (mode === 'rail');
    deckEl.classList.toggle('is-rail', rail);
    stageEl.classList.toggle('is-rail', rail);

    if (rail){
      focusSpring = new Spring((n - 1) / 2, { stiffness: 150, damping: 26 });
    } else {
      deckAngle = new Spring(0, { stiffness: 130, damping: 20 });
      deckScale = new Spring(1, { stiffness: 150, damping: 22 });
    }

    watchImages(deckEl);
    refreshCenter();
    booted = true;
  }

  /* ---------- 悬停：一张前推，其余退让（仅 fan） ---------- */
  function applyTargets(){
    if (mode !== 'fan') return;

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

  /* ---------- 命中判定（仅 fan） ---------- */

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

  /* ---------- 拖拽 ----------
     fan ：整副牌跟着手转，松手回正。
     rail：整条轨道跟着手滑，松手吸附到最近的一张居中。 */
  function onDown(e){
    if (e.button !== undefined && e.button !== 0) return;
    const m = metrics();
    drag = {
      id: e.pointerId,
      startX: e.clientX,
      moved: 0,
      card: e.target.closest ? e.target.closest('.card') : null,
      startFocus: focusSpring ? focusSpring.value : 0,   // rail：按下瞬间的居中位置
      stepX: m.stepX,                                    // rail：一像素对应几张
    };
    deckEl.classList.add('is-dragging');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function onMove(e){
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.startX;
    drag.moved = Math.max(drag.moved, Math.abs(dx));

    if (mode === 'rail'){
      const n = cards.length;
      let f = drag.startFocus - dx / drag.stepX;         // 右滑看左边的牌
      if (f < 0)         f *= 0.35;                      // 越界给橡皮筋阻尼
      if (f > n - 1)     f = (n - 1) + (f - (n - 1)) * 0.35;
      focusSpring.jump(f);
      return;
    }

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

    if (mode === 'rail'){
      const n = cards.length;
      const f = Math.max(0, Math.min(n - 1, Math.round(focusSpring.value)));
      focusSpring.set(f);                                // 吸附到最近的一张居中
    } else {
      deckAngle.set(0);                                  // 弹簧回正
      deckScale.set(1);
    }

    // 位移小于 6px 视为点击，交给 <a> 自己跳转；
    // 超过 6px 是拖拽，要吞掉紧随其后触发的那次 click，否则会误进相册。
    // preventDefault 在 pointerup 上拦不住 click，只能挂到 click 上。
    if (moved >= 6 && card){
      suppressNav = true;
      setTimeout(() => { suppressNav = false; }, 0);
    }
  }

  deckEl.addEventListener('click', e => {
    if (suppressNav){ e.preventDefault(); e.stopPropagation(); return; }

    // rail：点两侧的牌先把它滑到中间选中，点中间那张才进入。
    // 手指落点本来就比鼠标糊，一步直达很容易进错分类。
    if (mode !== 'rail' || !focusSpring) return;
    const card = e.target.closest('.card');
    if (!card) return;

    const i = Number(card.dataset.index);
    if (i !== Math.round(focusSpring.value)){
      e.preventDefault();
      focusSpring.set(i);
    }
  });

  deckEl.addEventListener('pointerdown', onDown);
  // rail 的牌只占屏幕中间一段，两侧空白也要能起手滑动，所以挂到整个舞台。
  // 牌上的起手已经由 deckEl 处理，这里跳过，避免同一次按下触发两遍。
  stageEl.addEventListener('pointerdown', e => {
    if (mode !== 'rail' || deckEl.contains(e.target)) return;
    onDown(e);
  });

  // 悬停只在指针设备上启用，触屏没有 hover 语义。
  // 用 pointermove 而不是 pointerover：判定基于几何而非 DOM，
  // 需要持续跟踪位置，不能只在进出元素时触发。
  stageEl.addEventListener('pointermove', e => {
    if (mode !== 'fan') return;
    if (e.pointerType === 'touch' || drag) return;
    setHover(hitTest(e.clientX, e.clientY));
  });
  stageEl.addEventListener('pointerleave', () => { if (mode === 'fan') setHover(-1); });

  /* ---------- 主循环 ---------- */
  let last = performance.now();
  function tick(now){
    const dt = Math.min((now - last) / 1000, 1 / 30);    // 钳制，防止切标签页后炸开
    last = now;

    if (mode === 'rail'){
      const m = metrics();
      focusSpring.step(dt);
      const f   = focusSpring.value;
      const cur = Math.round(f);

      for (const c of cards){
        if (!c.dealt && now > c.delay) c.dealt = true;
        if (!c.dealt){                                   // 还没发到这张
          c.el.style.opacity = '0';
          c.el.style.transform = 'translate3d(0,26px,0) scale(.92)';
          continue;
        }

        c.el.style.opacity = '1';
        const t = railTarget(c.index, f, m);
        c.el.style.transform =
          `translate3d(${t.x.toFixed(2)}px,${t.y.toFixed(2)}px,0) ` +
          `rotate(${t.rot.toFixed(3)}deg) scale(${t.scale.toFixed(4)})`;

        c.el.classList.toggle('is-active', c.index === cur);
        // 越靠近居中越靠上；居中那张由 .is-active 的 !important 提到最顶
        c.el.style.zIndex = 100 - Math.abs(c.index - cur);
      }
      requestAnimationFrame(tick);
      return;
    }

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
      // 跨过 640 要换形态，整副重建（此时 booted 为 true，不重播发牌动效）
      if ((isNarrow() ? 'rail' : 'fan') !== mode){
        build();
        requestAnimationFrame(refreshCenter);
        return;
      }

      const m = metrics();
      document.documentElement.style.setProperty('--cw', m.cw + 'px');

      if (mode === 'fan'){
        cards.forEach((c, i) => { c.target = fanTarget(i, cards.length, m); });
        const prev = hoverIndex;
        hoverIndex = -99; applyTargets();                  // 强制重算目标位
        hoverIndex = prev; applyTargets();
      }
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
