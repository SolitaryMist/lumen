<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
/* Mount: Vue 3. <ThrowStack />. Snap spring 380/30, shift 260/26, tilt 200/24, fling 360ms. */
const DATA = [
  { title: 'Rim Trace', sub: 'A rim of light that follows you' },
  { title: 'Dusk', sub: 'A gradient that breathes' },
  { title: 'Weight Field', sub: 'Type that turns bold on hover' },
  { title: 'Stack', sub: 'A deck you can throw' },
  { title: 'Coming soon', sub: 'Next piece in the works' },
];
const root = ref(null);
let stop = () => {};
const clamp = (v,a,b) => Math.min(b, Math.max(a, v));
const spring = (pos, vel, target, k, c, dt) => { vel += (-k*(pos-target) - c*vel)*dt; pos += vel*dt; return [pos, vel]; };
function eHint(x) {
  const x1 = 0.65, y1 = 0, x2 = 0.35, y2 = 1;
  if (x <= 0) return 0; if (x >= 1) return 1;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const cx = 3*x1*t*(1-t)**2 + 3*x2*t*t*(1-t) + t**3 - x;
    const dx = 3*x1*(1-t)**2 + 6*(x2-x1)*t*(1-t) + 3*(1-x2)*t*t;
    if (Math.abs(dx) < 1e-6) break;
    t = Math.min(1, Math.max(0, t - cx / dx));
  }
  return 3*y1*t*(1-t)**2 + 3*y2*t*t*(1-t) + t**3;
}
onMounted(() => {
  const el = root.value, nodes = [...el.querySelectorAll('article')];
  const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
  const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let reduced = reducedMq.matches;
  const onReduce = () => { reduced = reducedMq.matches; };
  reducedMq.addEventListener('change', onReduce);
  const cards = nodes.map((node, i) => ({ i, el: node, shade: node.querySelector('[data-shade]'), content: node.querySelector('[data-body]'), tick: node.querySelector('[data-tick]'), depth: i, dv: 0, dTarget: i, x: 0, vx: 0, y: 0, vy: 0, mode: 'rest', tx: 0, tvx: 0, ty: 0, tvy: 0, ttx: 0, tty: 0, introT0: performance.now() + (4-i)*70, tickT0: i===0 ? -1e9 : 0 }));
  let order = cards.map((c) => c.i), drag = null, raf = 0, last = 0, alive = true;
  let touched = false, hint = null, hintsDone = 0;
  const now0 = performance.now();
  let nextHint = now0 + 4 * 70 + 700 + 2500;
  const rotOf = (x) => clamp(x*0.06, -14, 14);
  const fling = (c, dir) => {
    const w = el.getBoundingClientRect().width || 320;
    c.mode = 'fling'; c.fl = { t0: performance.now(), x0: c.x, y0: c.y, r0: rotOf(c.x), x1: dir*(w/2+w), r1: dir*24 };
    order.push(order.shift()); cards[order[0]].tickT0 = performance.now();
    order.forEach((ci, d) => { cards[ci].dTarget = d; });
  };
  const down = (e) => {
    touched = true; nextHint = Infinity;
    if (hint) { cards[order[0]].mode = 'spring'; cards[order[0]].vx = 0; hint = null; }
    const top = cards[order[0]]; if (e.target.closest('article') !== top.el || top.mode==='fling') return; drag = { id: e.pointerId, c: top, sx: e.clientX, sy: e.clientY, x0: top.x, y0: top.y }; top.mode = 'drag';
  };
  const move = (e) => {
    if (drag && e.pointerId === drag.id) { drag.c.x = drag.x0 + (e.clientX-drag.sx); drag.c.y = (drag.y0 + (e.clientY-drag.sy))*0.6; return; }
    if (canHover && !reduced && e.pointerType === 'mouse') {
      const r = el.getBoundingClientRect(), nx = (e.clientX-(r.left+r.width/2))/(r.width/2), ny = (e.clientY-(r.top+r.height/2))/(r.height/2);
      const inside = Math.abs(nx)<=1 && Math.abs(ny)<=1, c = cards[order[0]];
      c.ttx = inside ? clamp(-ny,-1,1)*6 : 0; c.tty = inside ? clamp(nx,-1,1)*6 : 0;
    }
  };
  const up = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const c = drag.c, w = el.getBoundingClientRect().width || 320; drag = null;
    if (Math.abs(c.x) > 0.35*w) fling(c, Math.sign(c.x)||1); else c.mode = 'spring';
  };
  el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  const frame = (now) => {
    if (!alive) return;
    const dt = last ? Math.min(0.05,(now-last)/1000) : 0; last = now;
    el.dataset.frames = String((Number(el.dataset.frames)||0)+1);
    const topCard = cards[order[0]];
    if (!reduced && !canHover && !touched && hintsDone < 2 && now >= nextHint && !hint && topCard.mode === 'rest') {
      hint = { t0: now }; topCard.mode = 'hint';
    }
    const steps = Math.max(1, Math.round(dt*240)), h = dt/steps;
    for (const c of cards) {
      const ti = clamp((now-c.introT0)/700, 0, 1);
      if (c.mode === 'fling') {
        const u = clamp((now-c.fl.t0)/(reduced?200:360), 0, 1);
        const e = u*u*(3-2*u);
        if (!reduced) { c.x = c.fl.x0 + (c.fl.x1-c.fl.x0)*e; c.y = c.fl.y0*(1-e); }
        if (u>=1) { c.mode='rest'; c.x=c.y=0; c.depth=4; c.dTarget=4; }
      } else if (c.mode === 'spring' && !reduced) {
        for (let s=0;s<steps;s++) { [c.x,c.vx] = spring(c.x,c.vx,0,380,30,h); [c.y,c.vy] = spring(c.y,c.vy,0,380,30,h); }
        if (Math.abs(c.x)<0.4 && Math.abs(c.y)<0.4) { c.mode='rest'; c.x=c.y=0; }
      } else if (c.mode === 'hint' && hint) {
        const u = clamp((now - hint.t0) / 900, 0, 1);
        c.x = -28 * (u < 0.5 ? eHint(u * 2) : 1 - eHint(Math.max(0, u * 2 - 1)));
        if (u >= 1) { c.x = 0; c.mode = 'rest'; hint = null; hintsDone++; nextHint = hintsDone < 2 ? now + 4000 : Infinity; }
        for (let s=0;s<steps;s++) [c.depth, c.dv] = spring(c.depth, c.dv||0, c.dTarget, 260, 26, h);
      } else if (c.mode !== 'drag' && c.mode !== 'fling') {
        for (let s=0;s<steps;s++) [c.depth, c.dv] = spring(c.depth, c.dv||0, c.dTarget, 260, 26, h);
      }
      for (let s=0;s<steps;s++) { [c.tx,c.tvx]=spring(c.tx,c.tvx,c.ttx,200,24,h); [c.ty,c.tvy]=spring(c.ty,c.tvy,c.tty,200,24,h); }
      const d = c.mode==='fling'?0:c.depth, rot = rotOf(c.x);
      c.el.style.transform = `perspective(1000px) translate3d(${c.x.toFixed(1)}px,${(d*10+c.y+(1-ti)*40).toFixed(1)}px,0) rotate(${rot.toFixed(2)}deg) rotateX(${c.tx.toFixed(2)}deg) rotateY(${c.ty.toFixed(2)}deg) scale(${(1-d*0.04).toFixed(3)})`;
      c.el.style.opacity = String(clamp(4-d,0,1) * (reduced?1:clamp((now-c.introT0)/160,0,1)));
      c.el.style.zIndex = c.mode==='fling'?'20':String(100-Math.round(d*10));
      c.content.style.opacity = String(clamp((now-c.introT0-160)/120,0,1));
      c.shade.style.opacity = (clamp(d,0,4)*0.06).toFixed(3);
      c.tick.style.opacity = c === cards[order[0]] && c.mode!=='fling' ? '1' : '0';
    }
    el.dataset.mode = cards[order[0]].mode;
    el.dataset.x = cards[order[0]].x.toFixed(2);
    el.dataset.hints = String(hintsDone);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  stop = () => { alive=false; cancelAnimationFrame(raf); el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); reducedMq.removeEventListener('change', onReduce); };
});
onUnmounted(() => stop());
</script>
<template>
  <div ref="root" data-fw="stack" style="position:relative;width:min(78vw,320px);height:440px;margin:40px auto">
    <article v-for="(d,i) in DATA" :key="d.title" style="position:absolute;inset:0;border-radius:18px;background:#18181C;color:#E8E6E1;border:1px solid rgba(255,255,255,.06);overflow:hidden">
      <div data-shade="1" style="position:absolute;inset:0;background:#000" />
      <div data-body="1" style="position:relative;padding:28px;height:100%;display:flex;flex-direction:column">
        <div data-tick="1" style="width:24px;height:2px;background:#F2A65A;margin-bottom:14px" />
        <div style="font-size:64px;font-weight:600;letter-spacing:-0.04em">{{ String(i+1).padStart(2,'0') }}</div>
        <div style="margin-top:auto"><div>{{ d.title }}</div><div style="color:#6B6A70;font-size:13px;margin-top:4px">{{ d.sub }}</div></div>
      </div>
    </article>
  </div>
</template>
