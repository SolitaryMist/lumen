<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
/* Mount: Vue 3. <MagneticRail /> in a box. Sigma 56, scale spring 280/28/0.1, bar 220/26, press 320/30.
   Guide uses cubic-bezier(0.45, 0, 0.55, 1) for 1400ms, then 8000ms cosine drift. */
const NAMES = ['Rim', 'Mesh', 'Weight', 'Stack', 'Scale'];
const CENTERS = [20, 92, 164, 236, 308];
const mag = (d) => 1 + 0.5 * Math.exp(-(d * d) / (2 * 56 * 56));
function bez(x1, y1, x2, y2) {
  const cx = 3*x1, bx = 3*(x2-x1)-cx, ax = 1-cx-bx, cy = 3*y1, by = 3*(y2-y1)-cy, ay = 1-cy-by;
  const X = (t) => ((ax*t+bx)*t+cx)*t, Y = (t) => ((ay*t+by)*t+cy)*t, dX = (t) => (3*ax*t+2*bx)*t+cx;
  return (x) => { if (x<=0) return 0; if (x>=1) return 1; let t=x; for (let i=0;i<8;i++){ const e=X(t)-x, d=dX(t); if (Math.abs(e)<1e-6||Math.abs(d)<1e-6) break; t-=e/d; } return Y(Math.min(1,Math.max(0,t))); };
}
const easeGuide = bez(0.45, 0, 0.55, 1);
function spring(pos, vel, to, dt, k, c, m) {
  if (!(dt>0)) return [pos, vel];
  const n = Math.max(1, Math.round(dt*240)), h = dt/n;
  for (let s=0;s<n;s++) { vel += ((-k*(pos-to)-c*vel)/m)*h; pos += vel*h; }
  return [pos, vel];
}
const root = ref(null);
let stop = () => {};
onMounted(() => {
  const el = root.value, icons = [...el.querySelectorAll('svg')], labels = [...el.querySelectorAll('em')], bar = el.querySelector('[data-bar]');
  const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let reduced = reducedMq.matches;
  const onReduce = () => { reduced = reducedMq.matches; };
  reducedMq.addEventListener('change', onReduce);
  const scales = CENTERS.map(() => 0.88), svel = CENTERS.map(() => 0), hot = CENTERS.map(() => 0), hvel = CENTERS.map(() => 0);
  let magnet = fine || reduced ? 164 : 20, magnetV = 0, nearest = fine || reduced ? 2 : 0, barX = magnet, barV = 0;
  let phase = reduced ? 'still' : 'enter', inside = false, pointerX = magnet, markOp = 0, fading = false, fadeFrom = 0, fadeTo = 1, fadeT0 = 0;
  let raf = 0, last = 0, t0 = performance.now(), guideT0 = 0, driftT0 = 0, alive = true, snapping = false, snapTarget = 164, snapAnchor = 164;
  hot[nearest] = 1;
  const local = (x) => x - el.getBoundingClientRect().left;
  const move = (e) => {
    if (!fine || reduced || (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen')) return;
    inside = true; pointerX = local(e.clientX);
    if (phase === 'enter' || phase === 'still') return;
    if (snapping && Math.abs(pointerX - snapAnchor) <= 4) return;
    snapping = false; phase = 'follow'; magnet = pointerX; magnetV = 0;
  };
  const leave = () => { inside = false; if (!fine || reduced || phase === 'enter' || phase === 'still') return; phase = 'away'; fadeFrom = markOp; fadeTo = 0; fadeT0 = performance.now(); fading = true; };
  const down = (e) => { const item = e.target.closest?.('[data-i]'); if (!item || !fine || reduced || phase === 'enter') return; snapping = true; snapTarget = CENTERS[Number(item.dataset.i)]; snapAnchor = local(e.clientX); magnetV = 0; phase = 'snap'; };
  el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave); el.addEventListener('pointerdown', down);
  const frame = (now) => {
    if (!alive) return;
    const dt = last ? Math.min(0.05, (now-last)/1000) : 0; last = now;
    el.dataset.frames = String((Number(el.dataset.frames)||0)+1);
    if (reduced || phase === 'still') { magnet = 164; nearest = 2; barX = 164; markOp = 1; scales.fill(1); hot.fill(0); hot[2] = 1; }
    else {
      const end = t0 + 760;
      if (phase === 'enter' && now >= end) { if (fine && inside) { phase = 'follow'; magnet = pointerX; } else if (fine) phase = 'idle'; else { phase = 'guide'; guideT0 = end; } }
      if (phase === 'guide') { const elapse = now - guideT0; if (elapse >= 1400) { driftT0 = guideT0 + 1400; phase = 'drift'; } else magnet = 20 + easeGuide(Math.min(1, elapse/1400)) * 288; }
      if (phase === 'drift') magnet = 20 + (0.5 + 0.5 * Math.cos(((now-driftT0)/8000)*Math.PI*2)) * 288;
      else if (phase === 'snap') [magnet, magnetV] = spring(magnet, magnetV, snapTarget, dt, 320, 30, 1);
      else if (phase === 'idle') magnet = 164; else if (phase === 'follow') magnet = pointerX;
      if (phase !== 'away') nearest = CENTERS.reduce((b,c,i)=>Math.abs(c-magnet)<Math.abs(CENTERS[b]-magnet)?i:b,0);
      CENTERS.forEach((c,i) => {
        const goal = phase === 'away' ? 1 : mag(magnet - c);
        const hgoal = phase === 'away' ? 0 : (i === nearest ? 1 : 0);
        if (now < t0 + i * 60) { scales[i] = 0.88; svel[i] = 0; }
        else { const step = Math.min(dt, (now - (t0 + i * 60)) / 1000); [scales[i], svel[i]] = spring(scales[i], svel[i], goal, step, 280, 28, 0.1); [hot[i], hvel[i]] = spring(hot[i], hvel[i], hgoal, step, 280, 28, 0.1); }
      });
      if (phase !== 'away') [barX, barV] = spring(barX, barV, CENTERS[nearest], dt, 220, 26, 1);
      if (now < end) markOp = 0; else if (fading) { const u = Math.min(1, Math.max(0, (now-fadeT0)/200)); markOp = fadeFrom + (fadeTo-fadeFrom)*u; if (u>=1) { fading=false; markOp=fadeTo; } } else if (phase==='away') markOp = 0; else markOp = 1;
    }
    CENTERS.forEach((_, i) => {
      const influence = Math.max(0, Math.min(1, (scales[i]-1)/0.5));
      const lift = 4 * Math.max(0, Math.min(1, hot[i])) * influence;
      const g = Math.round(107 + (242-107) * Math.max(0, Math.min(1, hot[i])));
      icons[i].style.transform = `translateY(${(-lift).toFixed(2)}px) scale(${scales[i].toFixed(4)})`;
      icons[i].style.color = `rgb(${g},${g},${g})`; labels[i].style.color = icons[i].style.color;
      labels[i].style.fontVariationSettings = `"wght" ${(400+100*Math.max(0,Math.min(1,hot[i]))).toFixed(1)}`;
    });
    const w = 40 * scales[nearest];
    bar.style.width = w + 'px'; bar.style.transform = `translateX(${barX - w/2}px)`; bar.style.opacity = String(markOp);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  stop = () => { alive = false; cancelAnimationFrame(raf); el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); el.removeEventListener('pointerdown', down); reducedMq.removeEventListener('change', onReduce); };
});
onUnmounted(() => stop());
</script>
<template>
  <div ref="root" data-fw="rail" style="min-height:280px;display:grid;place-items:center;background:#0C0C0C;color:#F2F2F2;padding:24px">
    <div>
      <h1 style="margin:0 0 8px;text-align:center;font-weight:500;font-size:clamp(28px,8vw,40px);letter-spacing:-0.035em;line-height:1">Magnetic rail</h1>
      <p style="margin:0 0 28px;text-align:center;color:#8A8A8A;font-size:12px">Proximity scale</p>
      <div style="position:relative;width:328px;height:78px">
        <div v-for="(name, i) in NAMES" :key="name" :data-i="i" :style="{ position:'absolute', left:(CENTERS[i]-20)+'px', width:'40px', textAlign:'center' }">
          <svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="display:block;transform-origin:50% 100%;color:#6B6B6B">
            <circle v-if="i===0" cx="20" cy="20" r="8.5" />
            <template v-if="i===1"><circle v-for="p in [[12,12],[20,12],[28,12],[12,20],[20,20],[28,20],[12,28],[20,28],[28,28]]" :key="p[0]+'-'+p[1]" :cx="p[0]" :cy="p[1]" r="2.15" /></template>
            <template v-if="i===2"><line v-for="x in [13,20,27]" :key="x" :x1="x" y1="11" :x2="x" y2="29" /></template>
            <template v-if="i===3"><rect v-for="y in [9,17.5,26]" :key="y" x="11" :y="y" width="18" height="5" rx="1.2" /></template>
            <template v-if="i===4"><line v-for="y in [10,15,20,25,30]" :key="y" x1="14" :y1="y" x2="26" :y2="y" /></template>
          </svg>
          <em style="display:block;margin-top:8px;font-size:11px;font-style:normal;color:#6B6B6B">{{ name }}</em>
        </div>
        <i data-bar="1" style="position:absolute;left:0;top:66px;height:2px;border-radius:1px;background:#FFB547;opacity:0" />
      </div>
    </div>
  </div>
</template>
