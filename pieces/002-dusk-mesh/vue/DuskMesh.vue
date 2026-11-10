<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
/* Mount: Vue 3, <script setup>. Render <DuskMesh /> inside any box.
   Each copy owns its canvas and WebGL program. Shader and springs match the web piece. */
const P = {
  colors: ['#1B1E3A','#2A2550','#1B1E3A','#3A2E5C','#C9744A','#2B4A5E','#2B4A5E','#E8B27A','#3A2E5C'],
  driftAmp: 0.06, periods: [14000,16000,18000,20000,22000], dragMax: 0.12,
  spring: { stiffness: 120, damping: 20, mass: 1 }, pressLift: 0.06,
  pressIn: 200, pressOut: 300, intro: 1200, satFrom: 0.4, portraitCenterY: 0.45, renderScale: 0.5,
};
const INNER = [4,1,3,5,7];
const FS = `precision highp float;
uniform vec2 res; uniform vec2 pts[9]; uniform vec3 cols[9]; uniform float sat; uniform float lift;
vec2 base(int i){ float c=mod(float(i),3.0); float r=floor(float(i)/3.0); return vec2(c*0.5, r*0.5); }
float h(float t){ return t*t*(3.0-2.0*t); }
vec2 pAt(int i){ for(int k=0;k<9;k++){ if(k==i) return pts[k]; } return vec2(0); }
vec3 cAt(int i){ for(int k=0;k<9;k++){ if(k==i) return cols[k]; } return vec3(0); }
vec2 offAt(vec2 uv, vec2 bc){
  vec2 g=clamp(uv*2.0,0.0,1.999); vec2 cell=floor(g); vec2 f=g-cell;
  int i0=int(cell.y)*3+int(cell.x);
  vec2 o00=pAt(i0)-base(i0)*bc, o10=pAt(i0+1)-base(i0+1)*bc, o01=pAt(i0+3)-base(i0+3)*bc, o11=pAt(i0+4)-base(i0+4)*bc;
  float hx=h(f.x), hy=h(f.y);
  return mix(mix(o00,o10,hx),mix(o01,o11,hx),hy);
}
vec3 colAt(vec2 uv){
  vec2 g=clamp(uv*2.0,0.0,1.999); vec2 cell=floor(g); vec2 f=g-cell;
  int i0=int(cell.y)*3+int(cell.x);
  float hx=h(f.x), hy=h(f.y);
  return mix(mix(cAt(i0),cAt(i0+1),hx),mix(cAt(i0+3),cAt(i0+4),hx),hy);
}
void main(){
  vec2 px=vec2(gl_FragCoord.x, res.y-gl_FragCoord.y)/res;
  vec2 uv=px;
  for(int k=0;k<4;k++){ uv=px-offAt(uv,vec2(1.0)); }
  uv=clamp(uv,0.0,1.0);
  vec3 c=colAt(uv);
  vec2 d=(uv-vec2(0.5))*2.0; float wC=h(clamp(1.0-abs(d.x),0.0,1.0))*h(clamp(1.0-abs(d.y),0.0,1.0));
  c*=1.0+lift*wC;
  float l=dot(c,vec3(0.2126,0.7152,0.0722));
  c=mix(vec3(l),c,sat);
  gl_FragColor=vec4(c,1.0);
}`;
const VS = `attribute vec2 p; void main(){ gl_Position=vec4(p,0.0,1.0); }`;
const hex = (h) => [1,3,5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const ease = (t) => {
  const x1 = 0.22, y1 = 1, x2 = 0.36, y2 = 1; let u = Math.min(1, Math.max(0, t));
  for (let i = 0; i < 8; i++) {
    const x = 3*(1-u)*(1-u)*u*x1 + 3*(1-u)*u*u*x2 + u*u*u - Math.min(1, Math.max(0, t));
    const d = 3*(1-u)*(1-u)*x1 + 6*(1-u)*u*(x2-x1) + 3*u*u*(1-x2);
    if (Math.abs(d) < 1e-6) break; u = Math.min(1, Math.max(0, u - x / d));
  }
  return 3*(1-u)*(1-u)*u*y1 + 3*(1-u)*u*u*y2 + u*u*u;
};
const root = ref(null), canvas = ref(null);
let stop = () => {};
onMounted(() => {
  const host = root.value, cv = canvas.value;
  const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedMq.matches;
  const onReduce = () => { reduced = reducedMq.matches; if (reduced) Object.assign(sp, { x:0,y:0,vx:0,vy:0,tx:0,ty:0 }); };
  reducedMq.addEventListener('change', onReduce);
  const phase = INNER.map(() => Math.random() * Math.PI * 2);
  const sp = { x:0, y:0, vx:0, vy:0, tx:0, ty:0 };
  let press = 0, pressFrom = 0, pressTo = 0, pressT0 = 0, pressDur = 1, dragging = false;
  let W = 1, H = 1, S = 1, raf = 0, last = performance.now(), alive = true;
  const t0 = performance.now();
  const gl = cv.getContext('webgl', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
  let prog, uP, uRes, uSat, uLift;
  if (gl) {
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
    prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog); gl.useProgram(prog);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    uP = gl.getUniformLocation(prog, 'pts'); uRes = gl.getUniformLocation(prog, 'res');
    uSat = gl.getUniformLocation(prog, 'sat'); uLift = gl.getUniformLocation(prog, 'lift');
    gl.uniform3fv(gl.getUniformLocation(prog, 'cols'), new Float32Array(P.colors.flatMap(hex)));
    host.dataset.gl = gl.getProgramParameter(prog, gl.LINK_STATUS) ? 'linked' : 'failed';
  } else host.dataset.gl = 'none';
  const basePoints = () => {
    const cy = H > W ? P.portraitCenterY : 0.5, ys = [0, cy, 1], xs = [0, .5, 1], pts = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) pts.push([xs[c] * W, (r === 1 ? ys[1] : ys[r]) * H]);
    return pts;
  };
  const points = (t) => {
    const pts = basePoints(), a = P.driftAmp * S;
    if (!reduced) INNER.forEach((idx, k) => {
      const w = 2 * Math.PI * t / P.periods[k];
      pts[idx][0] += a * Math.sin(w + phase[k]);
      pts[idx][1] += a * Math.cos(w + phase[k] * 1.7);
    });
    pts[4][0] += sp.x; pts[4][1] += sp.y; return pts;
  };
  const resize = () => {
    const r = host.getBoundingClientRect();
    W = Math.max(2, r.width); H = Math.max(2, r.height); S = Math.min(W, H);
    cv.width = Math.max(1, Math.round(W * P.renderScale)); cv.height = Math.max(1, Math.round(H * P.renderScale));
    if (gl) gl.viewport(0, 0, cv.width, cv.height);
  };
  const ro = new ResizeObserver(resize); ro.observe(host); resize();
  const aim = (e) => {
    const box = host.getBoundingClientRect(), b = basePoints()[4], m = P.dragMax * S;
    let dx = e.clientX - box.left - b[0], dy = e.clientY - box.top - b[1], L = Math.hypot(dx, dy);
    if (L > m) { dx *= m / L; dy *= m / L; }
    sp.tx = dx; sp.ty = dy; if (reduced) { sp.x = dx; sp.y = dy; sp.vx = sp.vy = 0; }
  };
  const down = (e) => { dragging = true; aim(e); pressFrom = press; pressTo = 1; pressT0 = performance.now(); pressDur = P.pressIn; };
  const move = (e) => { if (dragging) aim(e); };
  const up = () => { if (!dragging) return; dragging = false; sp.tx = sp.ty = 0; if (reduced) sp.x = sp.y = 0; pressFrom = press; pressTo = 0; pressT0 = performance.now(); pressDur = P.pressOut; };
  host.addEventListener('pointerdown', down); host.addEventListener('pointermove', move);
  host.addEventListener('pointerup', up); host.addEventListener('pointercancel', up);
  const frame = (now) => {
    if (!alive) return;
    const dt = Math.min(0.032, (now - last) / 1000); last = now;
    host.dataset.frames = String((Number(host.dataset.frames) || 0) + 1);
    if (!reduced) {
      const { stiffness: k, damping: c, mass: m } = P.spring;
      for (let s = 0; s < 2; s++) { const h = dt / 2;
        sp.vx += (-k * (sp.x - sp.tx) - c * sp.vx) / m * h; sp.vy += (-k * (sp.y - sp.ty) - c * sp.vy) / m * h;
        sp.x += sp.vx * h; sp.y += sp.vy * h; }
    }
    const pk = Math.min(1, (now - pressT0) / pressDur);
    press = pressFrom + (pressTo - pressFrom) * ease(Number.isFinite(pk) ? pk : 1);
    const it = reduced ? 1 : ease(Math.min(1, (now - t0) / P.intro));
    cv.style.opacity = String(it);
    if (gl) {
      const pts = points(now - t0);
      gl.useProgram(prog); gl.uniform2f(uRes, cv.width, cv.height);
      gl.uniform2fv(uP, new Float32Array(pts.flatMap((p) => [p[0] / W, p[1] / H])));
      gl.uniform1f(uSat, P.satFrom + (1 - P.satFrom) * it);
      gl.uniform1f(uLift, P.pressLift * press);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  stop = () => {
    alive = false; cancelAnimationFrame(raf); ro.disconnect();
    host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move);
    host.removeEventListener('pointerup', up); host.removeEventListener('pointercancel', up);
    reducedMq.removeEventListener('change', onReduce);
    if (gl) { gl.deleteProgram(prog); gl.getExtension('WEBGL_lose_context')?.loseContext(); }
  };
});
onUnmounted(() => stop());
</script>
<template>
  <div ref="root" data-fw="dusk" style="position:relative;width:100%;height:100%;min-height:240px;background:#0E0F13;overflow:hidden">
    <canvas ref="canvas" style="position:absolute;inset:0;width:100%;height:100%" />
  </div>
</template>
