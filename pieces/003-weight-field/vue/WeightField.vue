<script setup>
import { onMounted, onUnmounted, ref } from 'vue';

// LUMEN. Rest 200, peak 900, spring 170/22/mass 1. Sweep 1400ms, then cosine period 7000ms.
const WORD = 'LUMEN';
const W_REST = 200, W_MAX = 900, K = 170, C = 22, MASS = 1, SWEEP = 1400, PING = 7000;
const root = ref(null);
let raf = 0, move, leave, reducedMq, onReduce;

onMounted(() => {
  const el = root.value;
  const letters = [...el.querySelectorAll('span')];
  const state = letters.map(() => ({ w: W_REST, v: 0 }));
  let last = 0, mode = 'tour', px = null, t0 = performance.now();
  reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedMq.matches;
  onReduce = () => { reduced = reducedMq.matches; };
  reducedMq.addEventListener('change', onReduce);
  move = (e) => { mode = 'follow'; px = e.clientX; };
  leave = () => { mode = 'tour'; px = null; t0 = performance.now(); };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);
  const tourX = (now) => {
    const r = el.getBoundingClientRect();
    const elapse = now - t0;
    const u = elapse < SWEEP ? elapse / SWEEP : 0.5 + 0.5 * Math.cos(((elapse - SWEEP) / PING) * Math.PI * 2);
    return r.left + u * r.width;
  };
  const frame = (now) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    const x = reduced ? null : mode === 'follow' ? px : tourX(now);
    const rects = letters.map((n) => n.getBoundingClientRect());
    const avg = rects.reduce((a, r) => a + r.width, 0) / letters.length;
    const R = avg * 1.6;
    letters.forEach((node, i) => {
      const cx = rects[i].left + rects[i].width / 2;
      const d = x == null ? R : Math.abs(x - cx);
      const t = Math.min(1, Math.max(0, d / R));
      const s = t * t * (3 - 2 * t);
      const goal = W_MAX - (W_MAX - W_REST) * s;
      const st = state[i];
      if (reduced) st.w += (goal - st.w) * Math.min(1, dt / 0.2);
      else if (dt) {
        const n = 4, h = dt / n;
        for (let k = 0; k < n; k++) {
          st.v += ((-K * (st.w - goal) - C * st.v) / MASS) * h;
          st.w += st.v * h;
        }
      }
      node.style.fontVariationSettings = `'wght' ${st.w.toFixed(1)}`;
    });
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
});

onUnmounted(() => {
  cancelAnimationFrame(raf);
  root.value?.removeEventListener('pointermove', move);
  root.value?.removeEventListener('pointerleave', leave);
  reducedMq?.removeEventListener('change', onReduce);
});
</script>

<template>
  <div ref="root" style="height:100%;display:grid;place-items:center;background:#0E0E10;color:#E8E6E1">
    <div style="display:flex;font-size:18vw;letter-spacing:-0.035em;line-height:0.9">
      <span v-for="ch in WORD" :key="ch">{{ ch }}</span>
    </div>
  </div>
</template>
