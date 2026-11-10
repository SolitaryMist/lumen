<script setup>
import { onMounted, onUnmounted, ref } from 'vue';

// Throw the top card. Fling past 0.35 width or 800 px/s. Snap spring 380/30. Reduced motion fades in 200ms.
const CARDS = ['Rim', 'Dusk', 'Weight', 'Stack', 'Scale'];
const SNAP = { k: 380, c: 30 }, FLING_X = 0.35, FLING_V = 800;
const root = ref(null);
let raf = 0, down, move, up, reducedMq, onReduce;

onMounted(() => {
  const el = root.value;
  const nodes = [...el.querySelectorAll('article')];
  const cards = nodes.map(() => ({ x: 0, y: 0, vx: 0, vy: 0, mode: 'rest', op: 1 }));
  let order = cards.map((_, i) => i), last = 0, drag = null;
  const samples = [];
  reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedMq.matches;
  onReduce = () => { reduced = reducedMq.matches; };
  reducedMq.addEventListener('change', onReduce);
  down = (e) => {
    if (cards[order[0]].mode === 'fling') return;
    drag = { i: order[0], sx: e.clientX, sy: e.clientY, x0: cards[order[0]].x, y0: cards[order[0]].y };
    samples.length = 0;
  };
  move = (e) => {
    if (!drag) return;
    const c = cards[drag.i];
    c.x = drag.x0 + (e.clientX - drag.sx);
    c.y = drag.y0 + (e.clientY - drag.sy) * 0.6;
    samples.push({ t: performance.now(), x: c.x, y: c.y });
  };
  up = () => {
    if (!drag) return;
    const c = cards[drag.i], now = performance.now();
    const recent = samples.filter((s) => now - s.t < 80);
    let vx = 0;
    if (recent.length >= 2) {
      const a = recent[0], b = recent[recent.length - 1];
      vx = (b.x - a.x) / Math.max(0.016, (b.t - a.t) / 1000);
    }
    const w = el.getBoundingClientRect().width;
    if (Math.abs(c.x) > FLING_X * w || Math.abs(vx) > FLING_V) {
      c.mode = 'fling'; c.t0 = now; c.x0 = c.x; c.dir = Math.sign(c.x || vx) || 1;
    } else c.mode = 'spring';
    drag = null;
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  const frame = (now) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    const w = el.getBoundingClientRect().width || 320;
    cards.forEach((c, i) => {
      if (c.mode === 'fling') {
        const u = Math.min(1, (now - c.t0) / (reduced ? 200 : 360));
        c.x = c.x0 + c.dir * (w * 0.5 + w) * u; c.op = 1 - u;
        if (u >= 1) { c.mode = 'rest'; c.x = c.y = 0; c.op = 1; order = [...order.slice(1), i]; }
      } else if (c.mode === 'spring' && dt) {
        const n = Math.max(1, Math.round(dt * 60)), h = dt / n;
        for (let s = 0; s < n; s++) {
          c.vx += (-SNAP.k * c.x - SNAP.c * c.vx) * h; c.x += c.vx * h;
          c.vy += (-SNAP.k * c.y - SNAP.c * c.vy) * h; c.y += c.vy * h;
        }
        if (Math.abs(c.x) < 0.5 && Math.abs(c.y) < 0.5) { c.mode = 'rest'; c.x = c.y = 0; }
      }
    });
    order.forEach((idx, depth) => {
      const c = cards[idx];
      const x = c.mode === 'rest' ? 0 : c.x;
      const y = depth * 10 + (c.mode === 'rest' ? 0 : c.y);
      nodes[idx].style.transform = `translate(${x}px, ${y}px) scale(${1 - depth * 0.04})`;
      nodes[idx].style.opacity = String(c.op);
      nodes[idx].style.zIndex = String(20 - depth);
    });
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
});

onUnmounted(() => {
  cancelAnimationFrame(raf);
  const el = root.value;
  if (el) {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
  }
  reducedMq?.removeEventListener('change', onReduce);
});
</script>

<template>
  <div ref="root" style="position:relative;width:min(78vw,320px);aspect-ratio:8/11;margin:auto">
    <article v-for="name in CARDS" :key="name" style="position:absolute;inset:0;border-radius:18px;background:#18181C;color:#E8E6E1;padding:24px;border:1px solid rgba(255,255,255,.06)">
      <div style="width:24px;height:2px;background:#F2A65A;margin-bottom:14px" />
      <div style="font-size:28px;letter-spacing:-0.04em">{{ name }}</div>
    </article>
  </div>
</template>
