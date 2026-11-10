<script setup>
import { onMounted, onUnmounted, ref } from 'vue';

// Same drift, spring, and colors as the web piece. Drawn as a canvas mesh, not the WebGL shader.
const COLORS = ['#1B1E3A', '#2A2550', '#1B1E3A', '#3A2E5C', '#C9744A', '#2B4A5E', '#2B4A5E', '#E8B27A', '#3A2E5C'];
const PERIODS = [14000, 16000, 18000, 20000, 22000];
const INNER = [4, 1, 3, 5, 7];
const K = 120, C = 20, MASS = 1, AMP = 0.06;
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const canvas = ref(null);
let raf = 0, down, up, reducedMq, onReduce;

onMounted(() => {
  const cv = canvas.value, ctx = cv.getContext('2d');
  const cols = COLORS.map(rgb);
  const phase = INNER.map(() => Math.random() * Math.PI * 2);
  let last = 0, x = 0, y = 0, vx = 0, vy = 0, tx = 0, ty = 0;
  reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedMq.matches;
  onReduce = () => { reduced = reducedMq.matches; if (reduced) { tx = ty = x = y = vx = vy = 0; } };
  reducedMq.addEventListener('change', onReduce);
  function points(now) {
    const w = cv.width, h = cv.height, s = Math.min(w, h);
    const cy = h > w ? 0.45 : 0.5;
    const pts = [];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) pts.push([(i === 0 ? 0 : i === 1 ? 0.5 : 1) * w, (j === 0 ? 0 : j === 1 ? cy : 1) * h]);
    if (!reduced) INNER.forEach((idx, k) => {
      const wgt = (2 * Math.PI * now) / PERIODS[k];
      pts[idx][0] += AMP * s * Math.sin(wgt + phase[k]);
      pts[idx][1] += AMP * s * Math.cos(wgt + phase[k] * 1.7);
    });
    pts[4][0] += x; pts[4][1] += y;
    return pts;
  }
  function paint(pts) {
    const w = cv.width, h = cv.height, n = 18;
    const ox = pts[4][0] / w - 0.5, oy = pts[4][1] / h - 0.5;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const u = Math.min(0.999, Math.max(0, i / (n - 1) - ox * 0.4));
      const v = Math.min(0.999, Math.max(0, j / (n - 1) - oy * 0.4));
      const gx = Math.min(1, Math.floor(u * 2)), gy = Math.min(1, Math.floor(v * 2));
      const tu = u * 2 - gx, tv = v * 2 - gy;
      const mix = (a, b, t) => a.map((c, k) => c + (b[k] - c) * t);
      const col = mix(mix(cols[gy * 3 + gx], cols[gy * 3 + gx + 1], tu), mix(cols[(gy + 1) * 3 + gx], cols[(gy + 1) * 3 + gx + 1], tu), tv);
      ctx.fillStyle = `rgb(${col.map((c) => Math.round(c)).join(',')})`;
      ctx.fillRect((i / n) * w, (j / n) * h, w / n + 1, h / n + 1);
    }
  }
  const frame = (now) => {
    const dt = last ? Math.min(0.032, (now - last) / 1000) : 0;
    last = now;
    if (!reduced && dt) {
      const h = dt / 2;
      for (let s = 0; s < 2; s++) {
        vx += ((-K * (x - tx) - C * vx) / MASS) * h; x += vx * h;
        vy += ((-K * (y - ty) - C * vy) / MASS) * h; y += vy * h;
      }
    }
    const r = cv.getBoundingClientRect();
    cv.width = Math.max(2, Math.round(r.width)); cv.height = Math.max(2, Math.round(r.height));
    paint(points(now));
    raf = requestAnimationFrame(frame);
  };
  down = (e) => {
    const r = cv.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const max = 0.12 * Math.min(r.width, r.height), L = Math.hypot(dx, dy) || 1, k = Math.min(max, L) / L;
    tx = dx * k; ty = dy * k;
  };
  up = () => { tx = 0; ty = 0; };
  cv.addEventListener('pointerdown', down);
  window.addEventListener('pointerup', up);
  raf = requestAnimationFrame(frame);
});

onUnmounted(() => {
  cancelAnimationFrame(raf);
  canvas.value?.removeEventListener('pointerdown', down);
  window.removeEventListener('pointerup', up);
  reducedMq?.removeEventListener('change', onReduce);
});
</script>

<template>
  <canvas ref="canvas" style="width:100%;height:100%;display:block;background:#0E0F13" />
</template>
