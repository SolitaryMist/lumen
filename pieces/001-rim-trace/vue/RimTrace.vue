<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
/* Mount: Vue 3. <RimTrace /> in a box. Tour 8000ms, magnet spring 180/22/mass 1, press widens the segment. */
const uid = `rim-${Math.random().toString(36).slice(2, 10)}`;
const card = ref(null), svg = ref(null), glow = ref(null), fadeA = ref(null), fadeB = ref(null), core = ref(null);
let stop = () => {};
const easeOut = (t) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
const easeSoft = (t) => t < 0.5 ? 2*t*t : 1 - ((-2*t+2)**2)/2;
function pathOf(w, h) {
  const inset = 0.75, r = 20, x = inset, y = inset, ww = w - inset*2, hh = h - inset*2;
  const rr = Math.max(0, Math.min(r - inset, ww/2, hh/2)), mid = x + ww/2;
  return `M ${mid} ${y} L ${x+ww-rr} ${y} A ${rr} ${rr} 0 0 1 ${x+ww} ${y+rr} L ${x+ww} ${y+hh-rr} A ${rr} ${rr} 0 0 1 ${x+ww-rr} ${y+hh} L ${x+rr} ${y+hh} A ${rr} ${rr} 0 0 1 ${x} ${y+hh-rr} L ${x} ${y+rr} A ${rr} ${rr} 0 0 1 ${x+rr} ${y} L ${mid} ${y}`;
}
const shortest = (a, b) => { let d = ((b-a)%1+1)%1; return d > 0.5 ? d-1 : d; };
onMounted(() => {
  const el = card.value, paths = [glow.value, fadeA.value, fadeB.value, core.value];
  const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedMq.matches, perimeter = 1, samples = [], progress = 0, seg = 0.12, peak = 0.95;
  let mode = reduced ? 'static' : 'intro', springOn = false, sp = 0, sv = 0, starget = 0, pointerIn = false;
  let tourEpoch = performance.now(), introDone = false, raf = 0, last = performance.now(), alive = true;
  const onReduce = () => { reduced = reducedMq.matches; };
  reducedMq.addEventListener('change', onReduce);
  const layout = () => {
    const r = el.getBoundingClientRect(), w = Math.max(40, r.width), h = Math.max(40, r.height), d = pathOf(w, h);
    svg.value.setAttribute('viewBox', `0 0 ${w} ${h}`);
    paths.forEach((p) => p.setAttribute('d', d));
    perimeter = core.value.getTotalLength() || 1; samples = [];
    for (let i = 0; i < 256; i++) { const t = i/256, pt = core.value.getPointAtLength(t*perimeter); samples.push({ x: pt.x, y: pt.y, t }); }
  };
  const nearest = (x, y) => samples.reduce((b, s) => (s.x-x)**2+(s.y-y)**2 < b.d ? { t: s.t, d: (s.x-x)**2+(s.y-y)**2 } : b, { t: 0, d: Infinity }).t;
  const dash = (node, center, L, op) => {
    const start = ((center*perimeter - L/2) % perimeter + perimeter) % perimeter;
    node.style.strokeDasharray = `${L} ${Math.max(0, perimeter-L)}`;
    node.style.strokeDashoffset = String(-start); node.style.opacity = String(op); node.style.stroke = '#FFB547';
  };
  const move = (e) => {
    if (reduced || (e.pointerType && e.pointerType !== 'mouse')) return;
    const r = el.getBoundingClientRect();
    const inside = e.clientX >= r.left-48 && e.clientX <= r.right+48 && e.clientY >= r.top-48 && e.clientY <= r.bottom+48;
    if (inside) { if (mode !== 'magnet') { mode = 'magnet'; springOn = true; sp = progress; sv = 0; } starget = sp + shortest(sp, nearest(e.clientX-r.left, e.clientY-r.top)); pointerIn = true; }
    else if (pointerIn) { pointerIn = false; mode = 'tour'; springOn = false; tourEpoch = performance.now(); }
  };
  const down = () => { if (!reduced) { seg = 0.28; peak = 1; el.style.transform = 'translateY(-4px)'; } };
  const up = () => { seg = 0.12; peak = 0.95; el.style.transform = 'translateY(0px)'; };
  el.addEventListener('pointermove', move); window.addEventListener('pointermove', move);
  el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  const ro = new ResizeObserver(layout); ro.observe(el); layout();
  const frame = (now) => {
    if (!alive) return;
    const dt = Math.min(0.032, (now-last)/1000); last = now;
    el.dataset.frames = String((Number(el.dataset.frames)||0)+1);
    if (reduced) progress = 0;
    else if (mode === 'magnet' && springOn) { const a = (180*(starget-sp) - 22*sv)/1; sv += a*dt; sp += sv*dt; progress = ((sp%1)+1)%1; }
    else if (!introDone) { const t = Math.min(1, (now-tourEpoch)/4000); progress = easeSoft(t)*0.5; if (t>=1) { introDone = true; tourEpoch = now; mode = 'tour'; } }
    else progress = (0.5 + ((now-tourEpoch)/8000)%1)%1;
    const len = Math.max(1, seg*perimeter);
    dash(glow.value, progress, Math.min(perimeter*0.22, len*1.6), 0.22);
    dash(fadeA.value, progress, len*1.55, peak*0.22);
    dash(fadeB.value, progress, len*1.28, peak*0.45);
    dash(core.value, progress, len, peak);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  stop = () => {
    alive = false; cancelAnimationFrame(raf); ro.disconnect();
    el.removeEventListener('pointermove', move); window.removeEventListener('pointermove', move);
    el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
    reducedMq.removeEventListener('change', onReduce);
  };
});
onUnmounted(() => stop());
</script>
<template>
  <div ref="card" data-fw="rim" style="width:min(360px,88%);aspect-ratio:1/1.25;margin:auto;position:relative;background:#121214;border-radius:20px;box-shadow:inset 0 0 0 1.5px #2A2A2E">
    <svg ref="svg" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible" aria-hidden="true">
      <defs><filter :id="uid" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter></defs>
      <path ref="glow" fill="none" stroke="#FFB547" stroke-width="14" stroke-linecap="round" :filter="`url(#${uid})`" />
      <path ref="fadeA" fill="none" stroke="#FFB547" stroke-width="8" stroke-linecap="round" />
      <path ref="fadeB" fill="none" stroke="#FFB547" stroke-width="4" stroke-linecap="round" />
      <path ref="core" fill="none" stroke="#FFB547" stroke-width="1.5" />
    </svg>
    <div style="position:absolute;inset:0;display:grid;place-items:center;color:#EDEDED;font-weight:600">Rim Trace</div>
  </div>
</template>
