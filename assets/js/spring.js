/**
 * 弹簧积分器。
 *
 * 为什么不用 CSS transition：transition 只有时长和缓动曲线，
 * 拖拽时无法「跟手」，松手后也无法根据当前速度自然回弹。
 * 真弹簧每一步都根据位移和速度积分，手感才对。
 *
 * 公式：F = -k·x - c·v，a = F/m
 *   k 刚度越大回得越快，c 阻尼越小回弹越明显
 */
export class Spring{
  constructor(v, { stiffness = 165, damping = 24, mass = 1 } = {}){
    this.value    = v;
    this.target   = v;
    this.velocity = 0;
    this.k = stiffness;
    this.c = damping;
    this.m = mass;
  }

  /** 设定目标值，让弹簧自己走过去 */
  set(t){ this.target = t; }

  /** 直接瞬移到某值并清零速度（拖拽时用，保证跟手） */
  jump(v){ this.value = this.target = v; this.velocity = 0; }

  /**
   * 推进一步。
   * @param {number} dt 距上一帧的秒数
   * @returns {boolean} 是否已静止（可用于跳过后续计算）
   */
  step(dt){
    const a = (-this.k * (this.value - this.target) - this.c * this.velocity) / this.m;
    this.velocity += a * dt;
    this.value    += this.velocity * dt;

    if (Math.abs(this.value - this.target) < .008 && Math.abs(this.velocity) < .008){
      this.value = this.target;
      this.velocity = 0;
      return true;
    }
    return false;
  }
}
