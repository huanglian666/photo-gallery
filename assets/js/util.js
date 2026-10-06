/**
 * 公共工具
 */

/**
 * 读取模板用 jsonify 输出的页面数据。
 * 日期已经在 Hugo 那边格式化成字符串了（ym / y），前端不碰时区，
 * 否则跨时区拍的照片分组会偏移一天。
 */
export function pageData(){
  const el = document.getElementById('page-data');
  if (!el) return {};
  try {
    return JSON.parse(el.textContent);
  } catch (e){
    console.error('[影集] page-data 解析失败', e);
    return {};
  }
}

/**
 * 懒加载淡入。
 *
 * 原图动辄几 MB，直接弹出来很突兀；配合每格的主色调底，
 * 加载过程是「色块 → 照片」而不是「空白 → 照片」。
 *
 * 关键点：已经命中缓存、加载完成的图（complete 且 naturalWidth 非 0）
 * 不会再触发 load 事件，必须当场补上 is-loaded，
 * 否则它们会永远停在 opacity:0。
 */
export function watchImages(root){
  const scope = root || document;
  scope.querySelectorAll('img:not(.is-loaded)').forEach(img => {
    if (img.complete && img.naturalWidth > 0){
      img.classList.add('is-loaded');
      return;
    }
    const done = () => img.classList.add('is-loaded');
    img.addEventListener('load',  done, { once:true });
    img.addEventListener('error', done, { once:true });   // 失败也要放出来，否则留个空洞
  });
}

/** 节流到下一帧，避免 resize / scroll 里反复重排 */
export function rafThrottle(fn){
  let queued = false;
  return (...args) => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(...args); });
  };
}

/**
 * 把一组宽度按比例塞进容器，返回断行结果。
 * 等高行对齐的核心：先按目标行高估算，超宽就断行，
 * 再按比例缩放到刚好铺满整行宽。
 *
 * @param {number[]} ratios 每项的宽高比（宽/高）
 * @param {number}   W      容器可用宽度
 * @param {number}   gap    间距
 * @param {number}   targetH 目标行高
 * @returns {{start:number, end:number, h:number}[]}
 */
export function justifyRows(ratios, W, gap, targetH){
  const rows = [];
  let start = 0, sum = 0;

  for (let i = 0; i < ratios.length; i++){
    sum += ratios[i];
    const n = i - start + 1;
    if (sum * targetH + gap * (n - 1) >= W){
      rows.push({ start, end: i + 1, h: (W - gap * (n - 1)) / sum });
      start = i + 1; sum = 0;
    }
  }
  if (start < ratios.length){                        // 末行不拉伸，保持目标行高
    const n = ratios.length - start;
    rows.push({
      start, end: ratios.length,
      h: Math.min(targetH, (W - gap * (n - 1)) / sum),
    });
  }
  return rows;
}
