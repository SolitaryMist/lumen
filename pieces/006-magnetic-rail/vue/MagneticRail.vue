<script setup>
import { onMounted, onUnmounted, ref } from 'vue';

// Gaussian scale, sigma 56. Scale spring 280/28/mass 0.1. Bar 220/26. Guide 1400ms, drift period 8000ms.
const NAMES = ['Rim', 'Mesh', 'Weight', 'Stack', 'Scale'];
const CENTERS = [20, 92, 164, 236, 308];
const SIGMA = 56, K = 280, C = 28, MASS = 0.1, KS = 220, CS = 26;
const mag = (d) => 1 + 0.5 * Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
const rail = ref(null);
let raf = 0, move, leave, reducedMq, onReduce;

onMounted(() => {
  const el = rail.value;
  const icons = [...el.querySelectorAll('svg')];
  const labels = [...el.querySelectorAll('em')];
  const bar = el.querySelector('i');
  const scales = CENTERS.map(() => 0.88), svel = CENTERS.map(() => 0);
  let last = 0, t0 = performance.now(), phase = 'enter', magnet = 164, barX = 164, barV = 0, nearest = 2;
  reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let reduced = reducedMq.matches, guideT0 = 0, driftT0 = 0, pointerX = 164;
  if (!fine && !reduced) { magnet = 20; nearest = 0; barX = 20; }
  onReduce = () => { reduced = reducedMq.matches; };
  reducedMq.addEventListener('change', onReduce);
  const local = (clientX) => clientX - el.getBoundingClientRect().left;
  move = (e) => { if (!fine || reduced) return; phase = 'follow'; pointerX = local(e.clientX); magnet = pointerX; };
  leave = () => { if (fine && !reduced) phase = 'away'; };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);
  const spring = (pos, vel, to, dt, k, c, m) => {
    if (!(dt > 0)) return [pos, vel];
    const n = Math.max(1, Math.round(dt * 240)), h = dt / n;
    for (let s = 0; s < n; s++) { vel += ((-k * (pos - to) - c * vel) / m) * h; pos += vel * h; }
    return [pos, vel];
  };
  const frame = (now) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (reduced) { magnet = 164; nearest = 2; barX = 164; scales.fill(1); }
    else {
      if (phase === 'enter' && now >= t0 + 760) {
        if (fine) phase = 'idle'; else { phase = 'guide'; guideT0 = t0 + 760; }
      }
      if (phase === 'guide') {
        const elapse = now - guideT0;
        if (elapse >= 1400) { phase = 'drift'; driftT0 = guideT0 + 1400; }
        else magnet = 20 + (elapse / 1400) * 288;
      }
      if (phase === 'drift') magnet = 20 + (0.5 + 0.5 * Math.cos(((now - driftT0) / 8000) * Math.PI * 2)) * 288;
      else if (phase === 'idle') magnet = 164;
      else if (phase === 'follow') magnet = pointerX;
      if (phase !== 'away') nearest = CENTERS.reduce((b, c, i) => Math.abs(c - magnet) < Math.abs(CENTERS[b] - magnet) ? i : b, 0);
      CENTERS.forEach((c, i) => {
        const goal = phase === 'away' ? 1 : mag(magnet - c);
        if (now < t0 + i * 60) scales[i] = 0.88;
        else [scales[i], svel[i]] = spring(scales[i], svel[i], goal, dt, K, C, MASS);
        const hot = i === nearest && phase !== 'away';
        icons[i].style.transform = `scale(${scales[i].toFixed(3)})`;
        icons[i].style.color = hot ? '#F2F2F2' : '#6B6B6B';
        labels[i].style.color = icons[i].style.color;
        labels[i].style.fontWeight = hot ? '500' : '400';
      });
      if (phase !== 'away') [barX, barV] = spring(barX, barV, CENTERS[nearest], dt, KS, CS, 1);
    }
    bar.style.width = `${40 * scales[nearest]}px`;
    bar.style.transform = `translateX(${barX - 20 * scales[nearest]}px)`;
    bar.style.opacity = reduced || (phase !== 'enter' && phase !== 'away') ? '1' : '0';
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
});

onUnmounted(() => {
  cancelAnimationFrame(raf);
  rail.value?.removeEventListener('pointermove', move);
  rail.value?.removeEventListener('pointerleave', leave);
  reducedMq?.removeEventListener('change', onReduce);
});
</script>

<template>
  <div style="height:100%;display:grid;place-items:center;background:#0C0C0C;color:#F2F2F2">
    <div>
      <h1 style="margin:0 0 48px;text-align:center;font-size:clamp(28px,8vw,40px);letter-spacing:-0.035em;font-weight:500">Magnetic rail</h1>
      <div ref="rail" style="position:relative;width:328px;height:72px">
        <div v-for="(name, i) in NAMES" :key="name" :style="{ position: 'absolute', left: (CENTERS[i] - 20) + 'px', width: '40px', textAlign: 'center' }">
          <svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" style="transform-origin:50% 100%;color:#6B6B6B">
            <circle v-if="i === 0" cx="20" cy="20" r="8.5" />
            <template v-if="i === 1">
              <circle v-for="p in [[12,12],[20,12],[28,12],[12,20],[20,20],[28,20],[12,28],[20,28],[28,28]]" :key="p[0] + '-' + p[1]" :cx="p[0]" :cy="p[1]" r="2.15" />
            </template>
            <template v-if="i === 2">
              <line v-for="x in [13, 20, 27]" :key="x" :x1="x" y1="11" :x2="x" y2="29" />
            </template>
            <template v-if="i === 3">
              <rect v-for="y in [9, 17.5, 26]" :key="y" x="11" :y="y" width="18" height="5" rx="1.2" />
            </template>
            <template v-if="i === 4">
              <line v-for="y in [10, 15, 20, 25, 30]" :key="y" x1="14" :y1="y" x2="26" :y2="y" />
            </template>
          </svg>
          <em style="display:block;margin-top:8px;font-size:11px;font-style:normal;color:#6B6B6B">{{ name }}</em>
        </div>
        <i style="position:absolute;left:0;top:64px;height:2px;border-radius:1px;background:#FFB547;opacity:0" />
      </div>
    </div>
  </div>
</template>
