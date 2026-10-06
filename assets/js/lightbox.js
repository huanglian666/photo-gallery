/**
 * 灯箱：看大图 + 缩放 / 平移 / 双指捏合。
 *
 * 大图用【原图】—— Hugo 不做任何处理，直接指向原始文件。
 * 所以无论缩略图怎么配，点开看到的永远是原图。
 */
export function initLightbox(){
  const lb    = document.getElementById('lightbox');
  const lbImg = document.getElementById('lb-img');
  const lbTags = document.getElementById('lb-tags');
  if (!lb || !lbImg) return { open(){} };

  let list = [], index = 0;

  /* ---------- 缩放状态：图片的 transform 只由这一组值驱动 ---------- */
  const Z_MIN = 1, Z_MAX = 6;
  const view = { scale:1, tx:0, ty:0 };
  const pts  = new Map();            // 按下的指针，用来识别双指捏合
  let panState = null, pinchState = null, suppressClick = false;

  function paintView(){
    lbImg.style.transform =
      `translate3d(${view.tx.toFixed(2)}px,${view.ty.toFixed(2)}px,0) scale(${view.scale.toFixed(4)})`;
  }

  /** 平移夹紧：不让图片被拖出视野、露出空白 */
  function clampView(){
    paintView();
    const r = lbImg.getBoundingClientRect();
    const overX = Math.max(0, (r.width  - innerWidth ) / 2);
    const overY = Math.max(0, (r.height - innerHeight) / 2);
    const nx = Math.min(overX, Math.max(-overX, view.tx));
    const ny = Math.min(overY, Math.max(-overY, view.ty));
    if (nx !== view.tx || ny !== view.ty){ view.tx = nx; view.ty = ny; paintView(); }
  }

  const syncZoomClass = () => lb.classList.toggle('is-zoomed', view.scale > 1.02);

  function resetView(){
    view.scale = 1; view.tx = 0; view.ty = 0;
    lbImg.style.transition = 'none';
    lbImg.style.transform  = '';
    lb.classList.remove('is-zoomed', 'is-panning');
    requestAnimationFrame(() => { lbImg.style.transition = ''; });
  }

  /**
   * 以 (ax, ay) 为锚点缩放。
   * 关键是让锚点下那个像素保持不动：
   *   T' = d - k·(d - T)，d 是锚点相对图片中心的偏移，k 是新旧缩放比
   */
  function zoomAt(ax, ay, factor){
    const next = Math.min(Z_MAX, Math.max(Z_MIN, view.scale * factor));
    if (next === view.scale) return;
    const dx = ax - innerWidth  / 2;
    const dy = ay - innerHeight / 2;
    const k  = next / view.scale;
    view.tx = dx - k * (dx - view.tx);
    view.ty = dy - k * (dy - view.ty);
    view.scale = next;
    if (next <= 1.001){ view.tx = 0; view.ty = 0; }
    syncZoomClass();
    clampView();
  }

  /* ---------- 打开 / 关闭 / 翻页 ---------- */
  function renderTags(tags){
    if (!lbTags) return;
    lbTags.innerHTML = '';
    (tags || []).forEach(t => {
      const s = document.createElement('span');
      s.className = 'lb-tag';
      s.textContent = t;
      lbTags.appendChild(s);
    });
  }

  function show(i){
    index = i;
    const item = list[index];
    if (!item) return;
    resetView();
    lbImg.style.opacity = '0';
    const pre = new Image();
    pre.onload = () => { lbImg.src = item.full; lbImg.style.opacity = '1'; };
    pre.onerror = () => { lbImg.src = item.full; lbImg.style.opacity = '1'; };
    pre.src = item.full;
    renderTags(item.tags);
  }

  function open(items, i){
    list = items;
    lb.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    show(i);
  }

  function close(){
    lb.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  function step(dir){
    if (!list.length) return;
    show((index + dir + list.length) % list.length);
  }

  /* ---------- 点击：放大 / 复位 ---------- */
  lbImg.addEventListener('click', e => {
    if (suppressClick) return;
    e.stopPropagation();
    if (view.scale > 1.02) resetView();
    else zoomAt(e.clientX, e.clientY, 2.4);
  });

  /* ---------- 滚轮缩放 ---------- */
  lb.addEventListener('wheel', e => {
    if (!lb.classList.contains('is-open')) return;
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.16 : 1 / 1.16);
  }, { passive:false });

  /* ---------- 拖动平移 + 双指捏合 ---------- */
  const pinchDist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const pinchMid  = () => { const [a, b] = [...pts.values()]; return { x:(a.x + b.x) / 2, y:(a.y + b.y) / 2 }; };

  lbImg.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
    try { lbImg.setPointerCapture(e.pointerId); } catch(_){}

    if (pts.size === 2){                                  // 进入捏合
      panState = null;
      pinchState = { d:pinchDist(), mid:pinchMid(), scale:view.scale, tx:view.tx, ty:view.ty };
      lbImg.style.transition = 'none';
    } else if (pts.size === 1 && view.scale > 1.02){      // 已放大 → 单指平移
      panState = { id:e.pointerId, x:e.clientX, y:e.clientY, tx:view.tx, ty:view.ty, moved:0 };
      lb.classList.add('is-panning');
      lbImg.style.transition = 'none';
    }
  });

  lbImg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x:e.clientX, y:e.clientY });

    if (pinchState && pts.size === 2){
      const next = Math.min(Z_MAX, Math.max(Z_MIN, pinchState.scale * (pinchDist() / pinchState.d)));
      const mid  = pinchMid();
      const k    = next / pinchState.scale;
      // 捏合要同时用起始中点和当前中点，所以不能复用单锚点的 zoomAt
      const dx0 = pinchState.mid.x - innerWidth  / 2;
      const dy0 = pinchState.mid.y - innerHeight / 2;
      view.scale = next;
      view.tx = (mid.x - innerWidth  / 2) - k * (dx0 - pinchState.tx);
      view.ty = (mid.y - innerHeight / 2) - k * (dy0 - pinchState.ty);
      if (next <= 1.001){ view.tx = 0; view.ty = 0; }
      syncZoomClass();
      clampView();
      return;
    }

    if (panState && e.pointerId === panState.id){
      const mx = e.clientX - panState.x, my = e.clientY - panState.y;
      panState.moved = Math.max(panState.moved, Math.abs(mx) + Math.abs(my));
      view.tx = panState.tx + mx;
      view.ty = panState.ty + my;
      clampView();
    }
  });

  function endPointer(e){
    pts.delete(e.pointerId);
    try { lbImg.releasePointerCapture(e.pointerId); } catch(_){}
    if (pts.size < 2) pinchState = null;

    if (panState && e.pointerId === panState.id){
      if (panState.moved > 6){                            // 拖过了就不算点击
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 0);
      }
      panState = null;
      lb.classList.remove('is-panning');
      lbImg.style.transition = '';
    }
    if (pts.size === 1 && view.scale > 1.02){             // 双指松成单指，接着平移
      const [id, p] = [...pts.entries()][0];
      panState = { id, x:p.x, y:p.y, tx:view.tx, ty:view.ty, moved:0 };
      lb.classList.add('is-panning');
      lbImg.style.transition = 'none';
    }
  }
  lbImg.addEventListener('pointerup', endPointer);
  lbImg.addEventListener('pointercancel', endPointer);

  /* ---------- 关闭 / 翻页 ---------- */
  document.getElementById('lb-close').addEventListener('click', close);
  document.getElementById('lb-prev').addEventListener('click', () => step(-1));
  document.getElementById('lb-next').addEventListener('click', () => step(1));
  lb.addEventListener('click', e => {
    // 放大状态下点空白不关闭，否则想拖到边缘时会误关
    if (e.target === lb && view.scale <= 1.02) close();
  });

  window.addEventListener('keydown', e => {
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'Escape'){
      if (view.scale > 1.02) resetView();                 // 先退出缩放，再关灯箱
      else close();
      return;
    }
    if (e.key === 'ArrowLeft')  step(-1);
    if (e.key === 'ArrowRight') step(1);
  });

  return { open };
}
