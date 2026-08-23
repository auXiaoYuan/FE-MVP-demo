/**
 * 木鱼敲击音效：使用 Web Audio API 实时合成（无需任何音频资源文件）。
 *
 * 敲击声由三层叠加而成：
 *  1. 低频"咚"（正弦波，快速降频 + 快速衰减）—— 木鱼腔体共鸣
 *  2. 高频"梆"（三角波，快速衰减）—— 木质敲击感
 *  3. 极短噪声脉冲 —— 击打瞬间的接触声
 */

let ctx: AudioContext | null = null;

function ensureCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
  }
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}

export function playKnock(): void {
  try {
    const c = ensureCtx();
    const t = c.currentTime;

    // 1) 低频共鸣 "咚"
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(118, t + 0.09);
    gain.gain.setValueAtTime(0.9, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.2);

    // 2) 高频木质敲击 "梆"
    const osc2 = c.createOscillator();
    const g2 = c.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(880, t);
    osc2.frequency.exponentialRampToValueAtTime(520, t + 0.06);
    g2.gain.setValueAtTime(0.25, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc2.connect(g2).connect(c.destination);
    osc2.start(t);
    osc2.stop(t + 0.14);

    // 3) 击打瞬间的噪声脉冲
    const dur = 0.03;
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const noise = c.createBufferSource();
    noise.buffer = buf;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.18, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(ng).connect(c.destination);
    noise.start(t);
  } catch {
    // 音效失败不影响功能
  }
}
