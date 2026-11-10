<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
/* Mount: Vue 3. <WeightField />. Springs 170/22/mass 1, sweep 1400ms, ping 7000ms, bar #F2A65A. */
const WORD = 'LUMEN';
const root = ref(null);
let stop = () => {};
const smooth = (a,b,x) => { const t = Math.min(1, Math.max(0,(x-a)/(b-a||1))); return t*t*(3-2*t); };
onMounted(() => {
  const el = root.value, letters = [...el.querySelectorAll('[data-ch]')], bar = el.querySelector('[data-bar]'), probe = el.querySelector('[data-probe]');
  const L = letters.map((node) => ({ node, ch: node.textContent, w: 100, v: 0, op: 0, cx: 0, w200: 20, w900: 40 }));
  const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
  const noHover = matchMedia('(hover: none)').matches;
  let reduced = reducedMq.matches, raf = 0, last = 0, alive = true, t0 = performance.now(), mode = 'idle', px = null, tour = null, leaveT0 = 0, dragging = false, lastRelease = 0;
  let R = 80, wordLeft = 0, wordRight = 0, barX = 0, barV = 0, barW = 8, barWV = 0, barOp = 0, barOpFrom = 0, barOpTo = 0, barOpT0 = 0, barY = 0, barInit = false;
  const onReduce = () => { reduced = reducedMq.matches; };
  reducedMq.addEventListener('change', onReduce);
  const measure = () => {
    const box = el.getBoundingClientRect();
    const width = box.width || 640;
    probe.style.fontSize = '100px';
    probe.style.fontFamily = getComputedStyle(letters[0]).fontFamily;
    for (const l of L) {
      probe.textContent = l.ch;
      probe.style.fontVariationSettings = "'wght' 900, 'opsz' 32";
      l.w900u = (probe.getBoundingClientRect().width || 60) / 100;
      probe.style.fontVariationSettings = "'wght' 200, 'opsz' 32";
      l.w200u = (probe.getBoundingClientRect().width || 40) / 100;
    }
    const track = -0.035;
    const sumU = L.reduce((a, l) => a + l.w900u, 0) + track * (L.length - 1);
    const frac = width <= 760 ? 0.86 : 0.72;
    const fontSize = frac * width / Math.max(0.1, sumU);
    el.querySelector('[data-word]').style.fontSize = fontSize + 'px';
    let x = (width - sumU * fontSize) / 2;
    L.forEach((l, i) => {
      l.w900 = l.w900u * fontSize;
      l.w200 = l.w200u * fontSize;
      const cell = l.node.parentElement;
      cell.style.width = l.w900 + 'px';
      cell.style.marginLeft = i ? (track * fontSize) + 'px' : '0';
      l.cx = x + l.w900 / 2;
      x += l.w900 + track * fontSize;
    });
    wordLeft = L[0].cx;
    wordRight = L[L.length - 1].cx;
    R = L.reduce((a, l) => a + l.w900, 0) / L.length * 1.6;
    barY = box.height / 2 + fontSize * 0.44;
    el.dataset.w900 = L.map((l) => l.w900.toFixed(2)).join(',');
    el.dataset.w200 = L.map((l) => l.w200.toFixed(2)).join(',');
  };
  const tourX = (now) => {
    const t = now - tour.t0;
    if (tour.kind === 'sweep') { if (t < 1400) return wordLeft + (wordRight-wordLeft)*(t/1400); tour = { kind:'ping', t0: tour.t0+1400, ph0: 0 }; return tourX(now); }
    const mid = (wordLeft+wordRight)/2, half = (wordRight-wordLeft)/2, x = mid + half*Math.cos(tour.ph0 + 2*Math.PI*t/7000);
    if (tour.from != null && t < 1000) return tour.from + (x-tour.from)*smooth(0,1,t/1000);
    return x;
  };
  const move = (e) => { if (noHover && !dragging) return; px = e.clientX - el.getBoundingClientRect().left; mode = 'live'; barOpFrom = barOp; barOpTo = 1; barOpT0 = performance.now(); };
  const down = (e) => { dragging = true; move(e); };
  const up = () => { if (!dragging) return; dragging = false; lastRelease = performance.now(); if (noHover) mode = 'hold'; else { mode = 'leave'; L.forEach((l)=>l.leaveFrom=l.w); leaveT0 = performance.now(); barOpTo = 0; barOpFrom = barOp; barOpT0 = leaveT0; } };
  el.addEventListener('pointermove', move); el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up); el.addEventListener('pointerleave', up);
  const ro = new ResizeObserver(measure); ro.observe(el); measure();
  const frame = (now) => {
    if (!alive) return;
    const dt = Math.min(0.05, (now-(last||now))/1000); last = now;
    el.dataset.frames = String((Number(el.dataset.frames)||0)+1);
    let x = null;
    if (mode === 'live' || mode === 'hold') { x = px; if (mode==='hold' && now-lastRelease>800 && !reduced) { tour = { kind:'ping', t0: now, ph0: 0, from: px }; mode = 'tour'; } }
    else if (mode === 'tour') x = tourX(now);
    const introDone = now - t0 > 60*4 + 600;
    let heavy = L[0];
    L.forEach((l, i) => {
      const lt = (now-t0) - i*60;
      if (lt < 600) { const e = Math.max(0, lt)/600; l.op = reduced ? 1 : e; l.w = reduced ? 200 : 100 + 100*e; l.v = 0; }
      else { l.op = 1;
        const tgt = x == null || mode === 'leave' ? 200 : 900 - (900-200)*smooth(0, R, Math.abs(x-l.cx));
        if (mode === 'leave') l.w = l.leaveFrom + (200-l.leaveFrom)*Math.min(1,(now-leaveT0)/480);
        else if (reduced) l.w += (tgt-l.w)*Math.min(1, dt/0.2);
        else { const n=4,h=dt/n; for (let s=0;s<n;s++){ l.v += ((-170*(l.w-tgt)-22*l.v)/1)*h; l.w += l.v*h; } }
      }
      l.w = Math.max(100, Math.min(900, l.w));
      l.node.style.opacity = l.op.toFixed(3);
      l.node.style.fontVariationSettings = `'wght' ${l.w.toFixed(1)}`;
      if (l.w > heavy.w) heavy = l;
    });
    const curW = heavy.w200 + (heavy.w900 - heavy.w200) * ((heavy.w - 200) / (900 - 200));
    const tw = 0.3 * Math.max(heavy.w200 || 8, curW || 8), tx = heavy.cx - tw / 2;
    if (!barInit) { barX = tx; barW = tw; barInit = true; }
    if (!reduced) { const n=4,h=dt/n; for (let s=0;s<n;s++){ barV += ((-170*(barX-tx)-22*barV))*h; barX += barV*h; barWV += ((-170*(barW-tw)-22*barWV))*h; barW += barWV*h; } }
    else { barX = tx; barW = tw; }
    bar.style.opacity = String(introDone ? barOp + (barOpTo-barOpFrom)*Math.min(1,(now-barOpT0)/300) : 0);
    bar.style.width = Math.max(2, barW) + 'px'; bar.style.transform = `translate(${barX}px, ${barY}px)`;
    if (noHover && !reduced && mode === 'idle' && introDone) { tour = { kind:'sweep', t0: now }; mode = 'tour'; barOpTo = 1; }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  stop = () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); el.removeEventListener('pointermove', move); el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up); el.removeEventListener('pointerleave', up); reducedMq.removeEventListener('change', onReduce); };
});
onUnmounted(() => stop());
</script>
<template>
  <div ref="root" data-fw="weight" style="position:relative;height:100%;min-height:280px;background:#0E0E10;color:#E8E6E1;overflow:hidden">
    <div data-word style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;line-height:0.9;letter-spacing:-0.035em;font-family:Inter,ui-sans-serif,system-ui,sans-serif">
      <div v-for="ch in WORD" :key="ch" data-cell style="display:flex;justify-content:center"><span :data-ch="ch" style="opacity:0">{{ ch }}</span></div>
    </div>
    <i data-bar="1" style="position:absolute;left:0;top:0;height:2px;background:#F2A65A;opacity:0" />
    <span data-probe="1" aria-hidden="true" style="position:absolute;visibility:hidden;font-size:100px;white-space:pre;font-family:Inter,ui-sans-serif,system-ui,sans-serif" />
  </div>
</template>
