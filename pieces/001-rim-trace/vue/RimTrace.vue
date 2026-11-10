<script setup>
import { onMounted, onUnmounted, ref } from 'vue';

// Same numbers as the web piece. Tour 8000ms, segment 0.12, magnet spring 180/22/mass 1.
const TOUR = 8000, SEG = 0.12, K = 180, C = 22, M = 1;
const card = ref(null);
const stroke = ref(null);
let raf = 0, last = 0, prog = 0, vel = 0, magnet = false, px = 0, py = 0;
let reducedMq, onReduce, move, leave;

function nearest(path, localX, localY) {
  const len = path.getTotalLength();
  let best = 0, bd = Infinity;
  for (let i = 0; i < 80; i++) {
    const t = i / 80;
    const pt = path.getPointAtLength(t * len);
    const d = (pt.x - localX) ** 2 + (pt.y - localY) ** 2;
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

onMounted(() => {
  const el = card.value, path = stroke.value;
  reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedMq.matches;
  onReduce = () => { reduced = reducedMq.matches; };
  reducedMq.addEventListener('change', onReduce);
  move = (e) => {
    const r = el.getBoundingClientRect();
    magnet = true; px = e.clientX - r.left; py = e.clientY - r.top;
  };
  leave = () => { magnet = false; };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);
  const frame = (now) => {
    const dt = last ? Math.min(0.032, (now - last) / 1000) : 0;
    last = now;
    const len = Math.max(1, path.getTotalLength());
    const target = reduced ? 0.08 : magnet ? nearest(path, px, py) : (now % TOUR) / TOUR;
    if (reduced || !magnet) { prog = target; vel = 0; }
    else {
      const n = Math.max(1, Math.round(dt * 240)), h = dt / n;
      for (let i = 0; i < n; i++) {
        vel += ((-K * (prog - target) - C * vel) / M) * h;
        prog += vel * h;
      }
    }
    const seg = SEG * len;
    path.style.strokeDasharray = `${seg} ${len}`;
    path.style.strokeDashoffset = `${-(((prog % 1 + 1) % 1) * len - seg / 2)}`;
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
});

onUnmounted(() => {
  cancelAnimationFrame(raf);
  const el = card.value;
  if (el) {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerleave', leave);
  }
  reducedMq?.removeEventListener('change', onReduce);
});
</script>

<template>
  <div ref="card" style="width:min(360px,88%);aspect-ratio:1/1.25;margin:auto;position:relative;background:#121214;border-radius:20px;box-shadow:inset 0 0 0 1.5px #2A2A2E">
    <svg viewBox="0 0 360 450" style="position:absolute;inset:0;width:100%;height:100%" aria-hidden="true">
      <rect ref="stroke" x="1" y="1" width="358" height="448" rx="20" fill="none" stroke="#FFB547" stroke-width="1.5" />
    </svg>
    <div style="position:absolute;inset:0;display:grid;place-items:center;color:#EDEDED;font-weight:600;letter-spacing:-0.04em">Rim Trace</div>
  </div>
</template>
