// Lumen 012 — Ink
// A drop of sumi ink on still paper. WebGL2 stable fluids: velocity grid, vorticity
// confinement, Jacobi pressure, MacCormack ink advection with curl noise, paper absorption.
// Units: positions in card widths (W), velocity in W per second, time in ms unless noted.

const P = {
  // layout
  bg: '#0B0B0C',
  wMax: 760, wVw: 0.76, wVh: 1.2, aspect: 1.5, portraitCy: 0.46,
  radius: 4, dprCap: 2,
  paper: [0xEC, 0xE8, 0xE1], ink: [0x14, 0x14, 0x16],
  grainAlpha: 0.03,
  label: '#8A8780', labelSize: 11, labelTracking: 0.08, insetR: 0.05,
  // simulation
  gridLong: 256, inkScale: 0.5, inkMax: 1024,
  jacobi: 24, pressureWarm: 0.8, vorticity: 18,
  velHalfLife: 1200, inkHalfLife: 9000, edgeMargin: 0.06,
  noiseAmp: 0.06, noiseK1: 6, noiseK2: 13, noiseW1: 0.8, noiseW2: 0.2, noiseS1: 0.18, noiseS2: 0.42,
  noiseNorm: 0.497, // measured: makes the curl-noise RMS speed equal noiseAmp
  // render
  absorbK: 3.0, poolK: 0.18, poolBlur: 2, fiberBase: 0.92, fiberAmp: 0.16, fiberScale: 24, maxDensity: 0.92,
  // paper absorption (wet ink soaking into the fibers, which then stays put)
  soakRate: 0.15, soakFiber: 0.15, soakStill: 0.1, crisp: 2.5,
  // drops
  dropAmount: 1.0, dropPeak: 0.85, dropR: 0.075, dropIn: 180, dropImpulse: 0.2, burstR: 0.028,
  dropGap: 350,
  // pointer stirring
  moveGain: 1.4, moveR: 0.035, moveMax: 3.0,
  // auto mode
  autoEvery: 5200, autoPts: [[0.50, 0.47], [0.62, 0.56], [0.50, 0.40]],
  stirAx: 0.22, stirAy: 0.14, stirPeriod: 7000, stirForce: 0.7, stirR: 0.035,
  stirIn: 800, stirOut: 300, idleFine: 6000, idleCoarse: 3000, resumeDropDelay: 800,
  // start
  prerun: 600, recDt: 1000 / 60, maxDt: 1000 / 30,
  // perf fallback
  slowMs: 20, slowRun: 30
};

// ---------- shaders ----------
const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const HEAD = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; out vec4 o;
`;

const FS = {
  copy: HEAD + `uniform sampler2D uSrc; void main(){ o = texture(uSrc, vUv); }`,

  // directional force (blend toward a target velocity) and/or a wobbly radial impulse
  splatVel: HEAD + `
uniform sampler2D uVel; uniform vec2 uPoint; uniform vec2 uForce; uniform float uRadius;
uniform float uBlend; uniform float uRadial; uniform float uAspect; uniform float uSeed;
void main(){
  vec2 v = texture(uVel, vUv).xy;
  vec2 d = vec2(vUv.x - uPoint.x, (vUv.y - uPoint.y) / uAspect);
  float g = exp(-dot(d, d) / (uRadius * uRadius));
  v = mix(v, uForce, g * uBlend);
  if (uRadial > 0.0) {
    float r = length(d), a = atan(d.y, d.x);
    // low orders only: a few long lobes rather than many short jets
    float wob = 1.0 + 0.2 * sin(a * 5.0 + uSeed) + 0.17 * sin(a * 8.0 + uSeed * 2.31);
    float q = r / uRadius;
    v += d / max(r, 1e-5) * uRadial * q * exp(0.5 * (1.0 - q * q)) * wob;
  }
  o = vec4(v, 0.0, 1.0);
}`,

  // a drop: d = peak (1 - r^2)^2 from the centre out (tonal layers, no flat fill), slightly ragged rim
  splatInk: HEAD + `
uniform sampler2D uInk; uniform vec2 uPoint; uniform float uRadius; uniform float uAmount;
uniform float uAspect; uniform float uSeed;
void main(){
  vec2 ink = texture(uInk, vUv).rg;
  vec2 d = vec2(vUv.x - uPoint.x, (vUv.y - uPoint.y) / uAspect);
  float r = length(d), a = atan(d.y, d.x);
  // low-order wobble only, so the soft profile has no radial rays
  float e = uRadius * (1.0 + 0.07 * sin(a * 3.0 + uSeed) + 0.05 * sin(a * 5.0 + uSeed * 1.7));
  float q = min(r / e, 1.0), k = 1.0 - q * q;
  ink.r = min(ink.r + uAmount * k * k, 1.6);
  o = vec4(ink, 0.0, 1.0);
}`,

  curl: HEAD + `
uniform sampler2D uVel; uniform vec2 uTx; uniform float uInvH;
void main(){
  float L = texture(uVel, vUv - vec2(uTx.x, 0.0)).y;
  float R = texture(uVel, vUv + vec2(uTx.x, 0.0)).y;
  float B = texture(uVel, vUv - vec2(0.0, uTx.y)).x;
  float T = texture(uVel, vUv + vec2(0.0, uTx.y)).x;
  o = vec4(0.5 * (R - L - T + B) * uInvH, 0.0, 0.0, 1.0);
}`,

  vorticity: HEAD + `
uniform sampler2D uVel; uniform sampler2D uCurl; uniform vec2 uTx; uniform float uH;
uniform float uEps; uniform float uDt;
void main(){
  float L = abs(texture(uCurl, vUv - vec2(uTx.x, 0.0)).x);
  float R = abs(texture(uCurl, vUv + vec2(uTx.x, 0.0)).x);
  float B = abs(texture(uCurl, vUv - vec2(0.0, uTx.y)).x);
  float T = abs(texture(uCurl, vUv + vec2(0.0, uTx.y)).x);
  float C = texture(uCurl, vUv).x;
  vec2 n = vec2(T - B, R - L);
  n /= length(n) + 1e-5;
  vec2 f = uEps * uH * C * vec2(n.x, -n.y);
  vec2 v = texture(uVel, vUv).xy + f * uDt;
  o = vec4(clamp(v, -8.0, 8.0), 0.0, 1.0);
}`,

  divergence: HEAD + `
uniform sampler2D uVel; uniform vec2 uTx; uniform float uInvH;
void main(){
  vec2 C = texture(uVel, vUv).xy;
  float L = texture(uVel, vUv - vec2(uTx.x, 0.0)).x;
  float R = texture(uVel, vUv + vec2(uTx.x, 0.0)).x;
  float B = texture(uVel, vUv - vec2(0.0, uTx.y)).y;
  float T = texture(uVel, vUv + vec2(0.0, uTx.y)).y;
  if (vUv.x - uTx.x < 0.0) L = -C.x;
  if (vUv.x + uTx.x > 1.0) R = -C.x;
  if (vUv.y - uTx.y < 0.0) B = -C.y;
  if (vUv.y + uTx.y > 1.0) T = -C.y;
  o = vec4(0.5 * (R - L + T - B) * uInvH, 0.0, 0.0, 1.0);
}`,

  scale: HEAD + `uniform sampler2D uSrc; uniform float uK; void main(){ o = texture(uSrc, vUv) * uK; }`,

  jacobi: HEAD + `
uniform sampler2D uP; uniform sampler2D uDiv; uniform vec2 uTx; uniform float uH2;
void main(){
  float L = texture(uP, vUv - vec2(uTx.x, 0.0)).x;
  float R = texture(uP, vUv + vec2(uTx.x, 0.0)).x;
  float B = texture(uP, vUv - vec2(0.0, uTx.y)).x;
  float T = texture(uP, vUv + vec2(0.0, uTx.y)).x;
  float div = texture(uDiv, vUv).x;
  o = vec4((L + R + B + T - div * uH2) * 0.25, 0.0, 0.0, 1.0);
}`,

  gradient: HEAD + `
uniform sampler2D uP; uniform sampler2D uVel; uniform vec2 uTx; uniform float uInvH;
void main(){
  float L = texture(uP, vUv - vec2(uTx.x, 0.0)).x;
  float R = texture(uP, vUv + vec2(uTx.x, 0.0)).x;
  float B = texture(uP, vUv - vec2(0.0, uTx.y)).x;
  float T = texture(uP, vUv + vec2(0.0, uTx.y)).x;
  vec2 v = texture(uVel, vUv).xy - 0.5 * uInvH * vec2(R - L, T - B);
  o = vec4(v, 0.0, 1.0);
}`,

  advectVel: HEAD + `
uniform sampler2D uVel; uniform float uDt; uniform float uAspect; uniform float uDecay; uniform vec2 uTx;
uniform float uEdge;
// soft margin: velocity fades to 0 within uEdge (card widths) of every card edge, so ink stays on the paper
float edgeFade(vec2 uv, float aspect, float m){
  float dx = min(uv.x, 1.0 - uv.x), dy = min(uv.y, 1.0 - uv.y) / aspect;
  return smoothstep(0.0, m, dx) * smoothstep(0.0, m, dy);
}
void main(){
  vec2 v = texture(uVel, vUv).xy;
  vec2 c = vUv - uDt * vec2(v.x, v.y * uAspect);
  vec2 nv = texture(uVel, c).xy * uDecay;
  // walls: no flow through the card edge
  if (vUv.x < uTx.x || vUv.x > 1.0 - uTx.x) nv.x = 0.0;
  if (vUv.y < uTx.y || vUv.y > 1.0 - uTx.y) nv.y = 0.0;
  nv *= edgeFade(vUv, uAspect, uEdge);
  o = vec4(nv, 0.0, 1.0);
}`,

  // stream function for the curl noise (two octaves of 3D simplex, time as the third axis)
  psi: HEAD + `
uniform float uTime; uniform float uAspect; uniform vec2 uSeed;
uniform vec2 uK; uniform vec2 uW; uniform vec2 uS; uniform float uAmp;
vec3 m289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 m289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 perm(vec4 x){ return m289(((x * 34.0) + 10.0) * x); }
vec4 tis(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = m289(i);
  vec4 p = perm(perm(perm(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = tis(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
void main(){
  vec2 p = vec2(vUv.x, vUv.y / uAspect);
  float s = uW.x * snoise(vec3(p * uK.x + uSeed, uTime * uS.x)) / uK.x
          + uW.y * snoise(vec3(p * uK.y - uSeed.yx, uTime * uS.y + 7.3)) / uK.y;
  o = vec4(s * uAmp, 0.0, 0.0, 1.0);
}`
};

// shared by both ink passes: total transport velocity = grid + curl noise + drop bursts
// transport velocity for the ink, built once per frame at half ink resolution:
// rgb = grid velocity + curl noise + drop bursts (W/s), burst divergence; a = |grid velocity|
FS.vink = HEAD + `
uniform sampler2D uVel; uniform sampler2D uPsi; uniform vec2 uPsiTx; uniform float uAspect;
uniform vec4 uBurst[4]; uniform int uBurstN; uniform float uEdge;
// soft margin: velocity fades to 0 within uEdge (card widths) of every card edge, so ink stays on the paper
float edgeFade(vec2 uv, float aspect, float m){
  float dx = min(uv.x, 1.0 - uv.x), dy = min(uv.y, 1.0 - uv.y) / aspect;
  return smoothstep(0.0, m, dx) * smoothstep(0.0, m, dy);
}
void main(){
  float L = texture(uPsi, vUv - vec2(uPsiTx.x, 0.0)).x;
  float R = texture(uPsi, vUv + vec2(uPsiTx.x, 0.0)).x;
  float B = texture(uPsi, vUv - vec2(0.0, uPsiTx.y)).x;
  float T = texture(uPsi, vUv + vec2(0.0, uPsiTx.y)).x;
  // psi texel spacing in W units: x = uPsiTx.x, y = uPsiTx.y / aspect
  vec2 noise = vec2((T - B) / (2.0 * uPsiTx.y / uAspect), -(R - L) / (2.0 * uPsiTx.x));
  vec2 p = vec2(vUv.x, vUv.y / uAspect);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    if (i >= uBurstN) break;
    vec4 b = uBurst[i];
    vec2 d = p - b.xy;
    float r = length(d), q = r / b.z;
    // a source with a soft core: v = A R (1 - e^-q^2) / r. Outside the core the flow falls off as 1/r,
    // which moves rings outward area-for-area, so the drop's soft falloff is carried out intact
    // instead of being piled into one hard front; divergence 2A/R e^-q^2 sits in the core only
    float e = exp(-q * q);
    acc.xy += d / max(r * r, 1e-10) * b.w * b.z * (1.0 - e);
    acc.z += 2.0 * b.w / b.z * e;
  }
  vec2 g = texture(uVel, vUv).xy;
  // the ink's full transport (grid + noise + bursts) also fades out at the margin
  o = vec4((g + noise + acc.xy) * edgeFade(vUv, uAspect, uEdge), acc.z, length(g));
}`;

const TRACE = `
uniform sampler2D uVink; uniform float uAspect; uniform float uDt;
vec2 trace(vec2 uv, vec2 v, float s){ return uv - s * uDt * vec2(v.x, v.y * uAspect); }
// midpoint (RK2) departure point, so curved flow does not fold over
vec2 trace2(vec2 uv, vec2 v, float s){ return trace(uv, texture(uVink, trace(uv, v, 0.5 * s)).xy, s); }
`;

FS.inkFwd = HEAD + `uniform sampler2D uInk;` + TRACE + `
void main(){
  vec2 v = texture(uVink, vUv).xy;
  float a = texture(uInk, trace2(vUv, v, 1.0)).r;
  o = vec4(a, texture(uInk, vUv).g, 0.0, 1.0);
}`;

FS.inkFix = HEAD + `uniform sampler2D uInk; uniform sampler2D uFwd; uniform sampler2D uFiber;
uniform vec2 uInkTx; uniform vec2 uInkSize; uniform float uDecay;
uniform float uSoak; uniform float uSoakFiber;
uniform float uSoakV;` + TRACE + `
void main(){
  vec4 vk = texture(uVink, vUv);
  vec2 v = vk.xy;
  float fwd = texture(uFwd, vUv).r;
  float back = texture(uFwd, trace2(vUv, v, -1.0)).r;
  vec2 here = texture(uInk, vUv).rg;
  float a = fwd + 0.5 * (here.r - back);
  // clamp to the four source texels around the departure point (keeps MacCormack stable)
  vec2 c = trace2(vUv, v, 1.0) * uInkSize - 0.5;
  ivec2 i0 = ivec2(floor(c));
  ivec2 mx = ivec2(uInkSize) - 1;
  float s00 = texelFetch(uInk, clamp(i0, ivec2(0), mx), 0).r;
  float s10 = texelFetch(uInk, clamp(i0 + ivec2(1, 0), ivec2(0), mx), 0).r;
  float s01 = texelFetch(uInk, clamp(i0 + ivec2(0, 1), ivec2(0), mx), 0).r;
  float s11 = texelFetch(uInk, clamp(i0 + ivec2(1, 1), ivec2(0), mx), 0).r;
  a = clamp(a, min(min(s00, s10), min(s01, s11)), max(max(s00, s10), max(s01, s11)));
  // second limiter: keep the result inside the range of the forward pass around this texel
  vec2 ex = vec2(uInkTx.x, 0.0), ey = vec2(0.0, uInkTx.y);
  float n0 = texture(uFwd, vUv + ex).r, n1 = texture(uFwd, vUv - ex).r, n2 = texture(uFwd, vUv + ey).r, n3 = texture(uFwd, vUv - ey).r;
  a = clamp(a, min(min(min(n0, n1), min(n2, n3)), fwd), max(max(max(n0, n1), max(n2, n3)), fwd));
  a = max(a, 0.0);
  // the paper drinks the wet ink, a little faster where it is more absorbent; soaked ink stays put.
  // moving ink barely has time to soak in; it settles into the paper once the flow calms
  float fib = texture(uFiber, vUv).r;
  float soak = uSoak * (0.6 + uSoakFiber * fib) * exp(-vk.w / uSoakV) * a * uDt;
  float wet = max(a - soak, 0.0);
  float dry = here.g + soak;
  o = vec4(wet * uDecay, min(dry, 1.6) * uDecay, 0.0, 1.0);
}`;

// edge pooling at ink resolution: d' = d + 0.18 |grad d|, inside the ink only, clamped to 1.
// The gradient is taken of a ~2 px gaussian-blurred field (derivative of gaussian over 5x5 texels),
// so the pooled rim is a soft darkening, not a hard outline.
FS.pool = HEAD + `uniform sampler2D uInk; uniform vec2 uInkTx; uniform float uPool;
uniform float uSig; uniform float uCrisp;
float D(vec2 uv){ vec2 t = texture(uInk, uv).rg; return t.r + t.g; }
void main(){
  vec2 ex = vec2(uInkTx.x, 0.0), ey = vec2(0.0, uInkTx.y);
  float c = max(D(vUv), 0.0);
  float r = D(vUv + ex), l = D(vUv - ex), t = D(vUv + ey), b = D(vUv - ey);
  float ne = D(vUv + ex + ey), nw = D(vUv - ex + ey), se = D(vUv + ex - ey), sw = D(vUv - ex - ey);
  // display-only unsharp (bounded by the 3x3 range, so no halos): recovers edge crispness lost to
  // the half-resolution ink field without feeding anything back into the simulation
  float blur = (r + l + t + b) * 0.125 + (ne + nw + se + sw) * 0.0625 + c * 0.25;
  float lo = min(min(min(r, l), min(t, b)), min(min(ne, nw), min(min(se, sw), c)));
  float hi = max(max(max(r, l), max(t, b)), max(max(ne, nw), max(max(se, sw), c)));
  float d = clamp(c + uCrisp * (c - blur), lo, hi);
  // least-squares slope of the gaussian-weighted 5x5 neighbourhood (exact for a linear ramp)
  vec2 gs = vec2(0.0); float wn = 0.0;
  float k2 = 0.5 / (uSig * uSig);
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 o2 = vec2(float(i), float(j));
    float w = exp(-dot(o2, o2) * k2);
    gs += w * o2 * D(vUv + o2 * uInkTx);
    wn += w * float(i * i);
  }
  float grad = length(gs) / wn;
  float dp = min(d + uPool * grad * clamp(d * 4.0, 0.0, 1.0), 1.0);
  o = vec4(dp, 0.0, 0.0, 1.0);
}`;

FS.display = HEAD + `uniform sampler2D uPoolT; uniform sampler2D uFiber; uniform vec2 uInkTx;
uniform vec3 uPaper; uniform vec3 uInkCol; uniform float uK;
uniform float uFB; uniform float uFA; uniform float uMax; uniform vec2 uInkSize;
float D(vec2 uv){ return texture(uPoolT, uv).r; }
// Catmull-Rom (9 samples folded into 5) so the upsampled filaments stay crisp
float Dcr(vec2 uv){
  vec2 sp = uv * uInkSize, tp = floor(sp - 0.5) + 0.5, f = sp - tp;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2, o12 = w2 / w12;
  vec2 t0 = (tp - 1.0) * uInkTx, t3 = (tp + 2.0) * uInkTx, t12 = (tp + o12) * uInkTx;
  float r = D(vec2(t12.x, t0.y)) * w12.x * w0.y
          + D(vec2(t0.x, t12.y)) * w0.x * w12.y + D(t12) * w12.x * w12.y + D(vec2(t3.x, t12.y)) * w3.x * w12.y
          + D(vec2(t12.x, t3.y)) * w12.x * w3.y;
  return r / (w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y);
}
void main(){
  float dp = clamp(Dcr(vUv), 0.0, 1.0);
  dp *= uFB + uFA * texture(uFiber, vUv).r;      // paper absorption: 0.92 + 0.16 fiber, smooth noise only
  float cov = min(1.0 - exp(-uK * dp), uMax);    // never pure black
  vec3 col = mix(uPaper, uInkCol, cov);
  // triangular dither, about one 8-bit step, so the long soft tails never band
  vec2 q = gl_FragCoord.xy;
  float n1 = fract(52.9829189 * fract(dot(q, vec2(0.06711056, 0.00583715))));
  float n2 = fract(52.9829189 * fract(dot(q + 17.0, vec2(0.00583715, 0.06711056))));
  col += (n1 + n2 - 1.0) / 255.0;
  o = vec4(col, 1.0);
}`;

// ---------- small helpers ----------
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const FIBER_SD = 0.22;
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

// paper absorbency, drawn once per seed: one smooth value-noise octave with cells about W/24 wide,
// bicubic (Catmull-Rom) between lattice points, normalised to mean 0.5. No strokes, no lines.
export function makeFiber(rand, w, h, cells = 24) {
  const cw = w / cells;
  const gx = cells + 4, gy = Math.ceil(h / cw) + 4;
  const lat = new Float32Array(gx * gy);
  for (let i = 0; i < lat.length; i++) lat[i] = rand();
  const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  const v = new Float32Array(w * h);
  let sum = 0, sum2 = 0;
  const row = new Float32Array(4);
  for (let y = 0; y < h; y++) {
    const fy = y / cw + 1, iy = Math.floor(fy), ty = fy - iy;
    for (let x = 0; x < w; x++) {
      const fx = x / cw + 1, ix = Math.floor(fx), tx = fx - ix;
      for (let k = 0; k < 4; k++) {
        const o = (iy - 1 + k) * gx + ix - 1;
        row[k] = cr(lat[o], lat[o + 1], lat[o + 2], lat[o + 3], tx);
      }
      const val = cr(row[0], row[1], row[2], row[3], ty);
      v[y * w + x] = val; sum += val; sum2 += val * val;
    }
  }
  const n = w * h, mean = sum / n, sd = Math.sqrt(Math.max(1e-9, sum2 / n - mean * mean));
  const k = (FIBER_SD * 255) / sd;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const q = 127.5 + (v[i] - mean) * k; out[i] = q < 0 ? 0 : q > 255 ? 255 : q; }
  return out;
}

let styleRefs = 0;
let styleEl = null;
function addStyle() {
  if (styleRefs++ > 0) return;
  styleEl = document.createElement('style');
  styleEl.textContent = `
.ink-stage{position:relative;width:100%;height:100%;overflow:hidden;background:${P.bg};visibility:hidden;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.ink-stage.on{visibility:visible}
.ink-card{position:absolute;left:50%;top:50%;overflow:hidden;border-radius:${P.radius}px;background:rgb(${P.paper.join(',')})}
.ink-card canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block}
.ink-grain{position:absolute;inset:0;background-size:128px 128px;opacity:${P.grainAlpha};pointer-events:none}
.ink-label{position:absolute;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:${P.labelSize}px;line-height:1;letter-spacing:${P.labelTracking}em;color:${P.label};white-space:nowrap;pointer-events:none}
`;
  document.head.appendChild(styleEl);
}
function removeStyle() {
  if (--styleRefs > 0) return;
  styleEl && styleEl.remove();
  styleEl = null;
}

export function mountInk(root, opts = {}) {
  const rec = !!opts.rec;
  const seed = opts.seed != null ? opts.seed : rec ? 12 : (Math.random() * 1e9) | 0;
  let rand = mulberry32(seed);
  addStyle();

  const div = (cls, parent) => { const d = document.createElement('div'); d.className = cls; parent.appendChild(d); return d; };
  const stage = div('ink-stage', root);
  const card = div('ink-card', stage);
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Ink drop on paper');
  canvas.setAttribute('role', 'img');
  card.appendChild(canvas);
  const grain = div('ink-grain', card);
  grain.style.backgroundImage = `url(${new URL('grain.png', import.meta.url).href})`;
  const lumen = div('ink-label', card); lumen.textContent = 'LUMEN';
  const no = div('ink-label', card); no.textContent = 'Nº 012';
  const title = div('ink-label', card); title.textContent = 'Ink';

  const reducedQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fineQ = window.matchMedia('(hover: hover) and (pointer: fine)');
  let reduced = !rec && reducedQ.matches;

  // ---------- GL ----------
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: rec, powerPreference: 'high-performance'
  });
  let ok = !!gl && !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
  const progs = {};
  let vao = null;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const name = info.name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  function target(w, h, ifmt, fmt) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, gl.HALF_FLOAT, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const okFb = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fb, w, h, ok: okFb };
  }
  let fmtR, fmtRG;
  function rt(w, h, two) {
    const f = two ? fmtRG : fmtR;
    return target(w, h, f[0], f[1]);
  }
  function pair(w, h, two) {
    const a = rt(w, h, two), b = rt(w, h, two);
    return { read: a, write: b, swap() { const t = this.read; this.read = this.write; this.write = t; } };
  }
  function free(t) { if (!t) return; gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
  function freePair(p) { if (!p) return; free(p.read); free(p.write); }

  let tex0Unit = 0;
  function use(name) { const pr = progs[name]; gl.useProgram(pr.p); tex0Unit = 0; return pr.u; }
  function bindTex(u, loc, t) { gl.activeTexture(gl.TEXTURE0 + tex0Unit); gl.bindTexture(gl.TEXTURE_2D, t.tex || t); gl.uniform1i(loc, tex0Unit); tex0Unit++; }
  function draw(dst) {
    if (dst) { gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb); gl.viewport(0, 0, dst.w, dst.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  let vel, pres, divT, curlT, ink, fwdT, psiT, vinkT, poolT, fiberTex;
  let gw = 0, gh = 0, iw = 0, ih = 0, pw = 0, ph = 0;
  let gridLong = P.gridLong, inkScale = P.inkScale, perfLevel = 0;

  if (ok) {
    try {
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      for (const k in FS) progs[k] = program(FS[k]);
      fmtR = [gl.R16F, gl.RED]; fmtRG = [gl.RG16F, gl.RG];
      const probe = rt(4, 4, true);
      if (!probe.ok) { free(probe); fmtR = fmtRG = [gl.RGBA16F, gl.RGBA]; const p2 = rt(4, 4, true); ok = p2.ok; free(p2); } else free(probe);
    } catch (e) { ok = false; if (opts.debug) console.error(e); }
  }

  function makeFiberTex() {
    const fw = 384, fh = 256;
    const data = makeFiber(mulberry32(seed ^ 0x9e3779b9), fw, fh, P.fiberScale);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, fw, fh, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    return t;
  }

  function resample(oldT, newT) {
    const u = use('copy'); bindTex(u, u.uSrc, oldT); draw(newT);
  }
  // (re)allocate the fields; existing ink and motion are carried over by resampling
  function allocate(cardDevW) {
    const ngw = gridLong, ngh = Math.round(gridLong / P.aspect);
    const niw = Math.min(P.inkMax, Math.max(64, Math.round(cardDevW * inkScale)));
    const nih = Math.round(niw / P.aspect);
    if (ngw !== gw || ngh !== gh) {
      const nv = pair(ngw, ngh, true);
      if (vel) { resample(vel.read, nv.read); freePair(vel); }
      freePair(pres); free(divT); free(curlT);
      vel = nv; pres = pair(ngw, ngh, false); divT = rt(ngw, ngh, false); curlT = rt(ngw, ngh, false);
      gw = ngw; gh = ngh;
    }
    if (niw !== iw || nih !== ih) {
      const ni = pair(niw, nih, true);
      if (ink) { resample(ink.read, ni.read); freePair(ink); }
      free(fwdT); free(psiT); free(vinkT); free(poolT);
      ink = ni; fwdT = rt(niw, nih, true); poolT = rt(niw, nih, false);
      pw = Math.max(32, Math.round(niw / 2)); ph = Math.round(pw / P.aspect);
      psiT = rt(pw, ph, false);
      vinkT = target(pw, ph, gl.RGBA16F, gl.RGBA);
      iw = niw; ih = nih;
    }
    if (!fiberTex) fiberTex = makeFiberTex();
  }

  // ---------- sim state ----------
  let simT = 0;               // ms of simulated time
  let frame = 0;
  const bursts = [];           // {x, y (W units, y down from top / aspect), age ms}
  const noiseSeed = [rand() * 100, rand() * 100];
  let lastDropT = -1e9;
  let mode = 'auto';           // auto | manual
  let stirGain = 0;            // 0..1, eased
  let stirFrom = 0, stirTo = 0, stirT0 = 0, stirDur = 1;
  let autoIdx = 0, nextAutoT = 0;
  let lastInputT = -1e9, lastInputCoarse = false;
  const ptr = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, t: 0, pt: 0, moved: false, inside: false, down: false };
  const queue = [];            // pending drops [x, y] (card uv, y down)

  function setStir(to, dur) { stirFrom = currentStir(); stirTo = to; stirT0 = simT; stirDur = dur; }
  function currentStir() {
    const k = stirDur > 0 ? Math.min(1, (simT - stirT0) / stirDur) : 1;
    // smoothstep in, linear out
    const e = stirTo > stirFrom ? smooth(k) : k;
    return stirFrom + (stirTo - stirFrom) * e;
  }

  const aspectU = P.aspect;
  function splatVel(x, y, fx, fy, r, blend, radial, s) {
    const u = use('splatVel');
    bindTex(u, u.uVel, vel.read);
    gl.uniform2f(u.uPoint, x, 1 - y);
    gl.uniform2f(u.uForce, fx, -fy);
    gl.uniform1f(u.uRadius, r);
    gl.uniform1f(u.uBlend, blend);
    gl.uniform1f(u.uRadial, radial);
    gl.uniform1f(u.uAspect, aspectU);
    gl.uniform1f(u.uSeed, s || 0);
    draw(vel.write); vel.swap();
  }
  function splatInk(x, y, r, amount, s) {
    const u = use('splatInk');
    bindTex(u, u.uInk, ink.read);
    gl.uniform2f(u.uPoint, x, 1 - y);
    gl.uniform1f(u.uRadius, r);
    gl.uniform1f(u.uAmount, amount);
    gl.uniform1f(u.uAspect, aspectU);
    gl.uniform1f(u.uSeed, s || 0);
    draw(ink.write); ink.swap();
  }
  // a drop: radial burst that the projection turns into curling lobes, and a soft core.
  // The ink does not land in one frame: each splat is fed in over dropIn ms with an ease-out.
  const pours = [];            // {x, y, r, amount, s, t} pending ink, t = ms poured so far
  const easeOut = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
  function pour(dtMs) {
    for (let i = pours.length - 1; i >= 0; i--) {
      const p = pours[i];
      const k0 = easeOut(p.t / P.dropIn), k1 = easeOut((p.t + dtMs) / P.dropIn);
      splatInk(p.x, p.y, p.r, p.amount * (k1 - k0), p.s);
      p.t += dtMs;
      if (p.t >= P.dropIn) pours.splice(i, 1);
    }
  }
  function drop(x, y) {
    const R = P.dropR;
    const s = rand() * 100;
    splatVel(x, y, 0, 0, P.burstR, 0, P.dropImpulse, s);
    const peak = P.dropPeak * P.dropAmount;
    pours.push({ x, y, r: R, amount: peak, s, t: 0 });
    bursts.unshift({ x, y: y / aspectU, age: 0 });
    if (bursts.length > 4) bursts.length = 4;
    lastDropT = simT;
  }

  let prof = null;
  const px1 = new Uint8Array(4);
  function mark(name) { if (!prof) return; gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1); const t = performance.now(); prof[name] = (prof[name] || 0) + t - prof._t; prof._t = t; }
  function step(dtMs) {
    const dt = dtMs / 1000;
    const H = 1 / gw, invH = gw;
    const tx = [1 / gw, 1 / gh];

    // ---- inputs ----
    while (queue.length) { const q = queue.shift(); drop(q[0], q[1]); }
    if (mode === 'auto' && simT >= nextAutoT) {
      const p = P.autoPts[autoIdx % P.autoPts.length];
      drop(p[0], p[1]);
      autoIdx++;
      nextAutoT = simT + P.autoEvery;
    }
    pour(dtMs);
    stirGain = currentStir();
    if (stirGain > 0.001) {
      const w = (2 * Math.PI) / P.stirPeriod;
      const sx = 0.5 + P.stirAx * Math.sin(w * simT), sy = 0.5 + P.stirAy * Math.sin(2 * w * simT);
      // stirrer velocity in W per second (y in card heights converted to W); force = velocity x 0.5,
      // the same rule as the pointer (velocity x 1), so the auto stirrer stays gentler than a person
      const vx = P.stirAx * w * Math.cos(w * simT) * 1000 * P.stirForce;
      const vy = ((P.stirAy * 2 * w * Math.cos(2 * w * simT) * 1000) / aspectU) * P.stirForce;
      splatVel(sx, sy, vx, vy, P.stirR, stirGain * (1 - Math.pow(0.5, dtMs / P.recDt)), 0, 0);
    }
    if (ptr.moved) {
      const dts = Math.max(1, ptr.t - ptr.pt) / 1000;
      let vx = ((ptr.x - ptr.px) / dts) * P.moveGain;
      let vy = ((ptr.y - ptr.py) / aspectU / dts) * P.moveGain;
      const m = Math.hypot(vx, vy);
      if (m > P.moveMax) { vx *= P.moveMax / m; vy *= P.moveMax / m; }
      splatVel(ptr.x, ptr.y, vx, vy, P.moveR, 1, 0, 0);
      ptr.px = ptr.x; ptr.py = ptr.y; ptr.pt = ptr.t; ptr.moved = false;
    }

    mark('input');
    // ---- velocity: vorticity, projection, advection ----
    let u = use('curl');
    bindTex(u, u.uVel, vel.read); gl.uniform2f(u.uTx, tx[0], tx[1]); gl.uniform1f(u.uInvH, invH);
    draw(curlT);
    u = use('vorticity');
    bindTex(u, u.uVel, vel.read); bindTex(u, u.uCurl, curlT);
    gl.uniform2f(u.uTx, tx[0], tx[1]); gl.uniform1f(u.uH, H); gl.uniform1f(u.uEps, P.vorticity); gl.uniform1f(u.uDt, dt);
    draw(vel.write); vel.swap();
    u = use('divergence');
    bindTex(u, u.uVel, vel.read); gl.uniform2f(u.uTx, tx[0], tx[1]); gl.uniform1f(u.uInvH, invH);
    draw(divT);
    u = use('scale');
    bindTex(u, u.uSrc, pres.read); gl.uniform1f(u.uK, P.pressureWarm);
    draw(pres.write); pres.swap();
    u = use('jacobi');
    gl.uniform2f(u.uTx, tx[0], tx[1]); gl.uniform1f(u.uH2, H * H);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, divT.tex); gl.uniform1i(u.uDiv, 1);
    gl.uniform1i(u.uP, 0);
    for (let i = 0; i < P.jacobi; i++) {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, pres.read.tex);
      draw(pres.write); pres.swap();
    }
    u = use('gradient');
    bindTex(u, u.uP, pres.read); bindTex(u, u.uVel, vel.read);
    gl.uniform2f(u.uTx, tx[0], tx[1]); gl.uniform1f(u.uInvH, invH);
    draw(vel.write); vel.swap();
    u = use('advectVel');
    bindTex(u, u.uVel, vel.read);
    gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uAspect, aspectU); gl.uniform2f(u.uTx, tx[0], tx[1]);
    gl.uniform1f(u.uDecay, Math.pow(0.5, dtMs / P.velHalfLife)); gl.uniform1f(u.uEdge, P.edgeMargin);
    draw(vel.write); vel.swap();

    mark('velocity');
    // ---- ink ----
    u = use('psi');
    gl.uniform1f(u.uTime, simT / 1000); gl.uniform1f(u.uAspect, aspectU);
    gl.uniform2f(u.uSeed, noiseSeed[0], noiseSeed[1]);
    gl.uniform2f(u.uK, P.noiseK1, P.noiseK2); gl.uniform2f(u.uW, P.noiseW1, P.noiseW2); gl.uniform2f(u.uS, P.noiseS1, P.noiseS2);
    gl.uniform1f(u.uAmp, P.noiseAmp * P.noiseNorm);
    draw(psiT);
    mark('psi');

    const bdata = new Float32Array(16);
    let bn = 0;
    for (const b of bursts) {
      const amp = P.dropImpulse * Math.pow(0.5, b.age / P.velHalfLife);
      if (amp < 0.004) continue;
      bdata.set([b.x, (1 - b.y * aspectU) / aspectU, P.burstR, amp], bn * 4);
      bn++;
    }
    u = use('vink');
    bindTex(u, u.uVel, vel.read); bindTex(u, u.uPsi, psiT);
    gl.uniform2f(u.uPsiTx, 1 / pw, 1 / ph); gl.uniform1f(u.uAspect, aspectU);
    gl.uniform4fv(u.uBurst, bdata); gl.uniform1i(u.uBurstN, bn); gl.uniform1f(u.uEdge, P.edgeMargin);
    draw(vinkT);
    mark('vink');
    const inkCommon = (u) => {
      bindTex(u, u.uVink, vinkT);
      gl.uniform1f(u.uAspect, aspectU); gl.uniform1f(u.uDt, dt);
    };
    u = use('inkFwd');
    bindTex(u, u.uInk, ink.read); inkCommon(u);
    draw(fwdT);
    mark('inkFwd');
    u = use('inkFix');
    bindTex(u, u.uInk, ink.read); bindTex(u, u.uFwd, fwdT); bindTex(u, u.uFiber, fiberTex); inkCommon(u);
    gl.uniform2f(u.uInkTx, 1 / iw, 1 / ih); gl.uniform2f(u.uInkSize, iw, ih);
    gl.uniform1f(u.uDecay, Math.pow(0.5, dtMs / P.inkHalfLife));
    gl.uniform1f(u.uSoak, P.soakRate); gl.uniform1f(u.uSoakFiber, P.soakFiber);
    gl.uniform1f(u.uSoakV, P.soakStill);
    draw(ink.write); ink.swap();
    mark('inkFix');

    for (const b of bursts) b.age += dtMs;
    while (bursts.length && Math.pow(0.5, bursts[bursts.length - 1].age / P.velHalfLife) * P.dropImpulse < 0.004) bursts.pop();
    simT += dtMs;
    frame++;
    // idle: give the paper back to the auto stirrer
    if (mode === 'manual' && simT - lastInputT > (lastInputCoarse ? P.idleCoarse : P.idleFine)) {
      mode = 'auto';
      setStir(1, P.stirIn);
      nextAutoT = simT + P.resumeDropDelay;
    }
  }

  const paperF = P.paper.map((v) => v / 255), inkF = P.ink.map((v) => v / 255);
  function render() {
    let u = use('pool');
    bindTex(u, u.uInk, ink.read);
    gl.uniform2f(u.uInkTx, 1 / iw, 1 / ih); gl.uniform1f(u.uPool, P.poolK);
    // blur sigma: poolBlur device px expressed in ink texels
    gl.uniform1f(u.uSig, Math.max(0.6, (P.poolBlur * iw) / canvas.width)); gl.uniform1f(u.uCrisp, P.crisp);
    draw(poolT);
    u = use('display');
    bindTex(u, u.uPoolT, poolT); bindTex(u, u.uFiber, fiberTex);
    gl.uniform2f(u.uInkTx, 1 / iw, 1 / ih); gl.uniform2f(u.uInkSize, iw, ih);
    gl.uniform3fv(u.uPaper, paperF); gl.uniform3fv(u.uInkCol, inkF);
    gl.uniform1f(u.uK, P.absorbK);
    gl.uniform1f(u.uFB, P.fiberBase); gl.uniform1f(u.uFA, P.fiberAmp); gl.uniform1f(u.uMax, P.maxDensity);
    draw(null);
  }

  // the first visible frame is a drop that has just burst: run the first 0.6 s offscreen
  function prerun() {
    simT = 0; frame = 0; bursts.length = 0; pours.length = 0; autoIdx = 0; nextAutoT = 0;
    const n = Math.round(P.prerun / P.recDt);
    for (let i = 0; i < n; i++) step(P.recDt);
    // stirrer eases in from the first visible frame
    stirFrom = 0; stirTo = reduced ? 0 : 1; stirT0 = simT; stirDur = P.stirIn;
  }

  // ---------- layout ----------
  let geo = null;
  function layout() {
    const Wv = root.clientWidth, Hv = root.clientHeight;
    if (!Wv || !Hv) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, P.dprCap);
    const portrait = Hv > Wv;
    let W = Math.min(P.wMax, P.wVw * Wv, P.wVh * Hv);
    // W in multiples of 6 device px so H = 2W/3 lands on even device px
    const Wd = Math.max(48, Math.floor((W * dpr) / 6) * 6);
    const Hd = (Wd / 3) * 2;
    W = Wd / dpr;
    const H = Hd / dpr;
    const px = (v) => `${v}px`;
    card.style.top = `${(portrait ? P.portraitCy : 0.5) * 100}%`;
    card.style.width = px(W);
    card.style.height = px(H);
    card.style.transform = `translate(${-W / 2}px, ${-H / 2}px)`;
    const r0 = card.getBoundingClientRect();
    const snap = (v) => (Math.round((v * dpr) / 2) * 2 - v * dpr) / dpr;
    card.style.transform = `translate(${-W / 2 + snap(r0.left)}px, ${-H / 2 + snap(r0.top)}px)`;
    const r = card.getBoundingClientRect();
    const inset = Math.round(P.insetR * W);
    lumen.style.left = px(inset); lumen.style.top = px(inset);
    no.style.right = px(inset); no.style.top = px(inset);
    title.style.left = px(inset); title.style.bottom = px(inset);
    if (canvas.width !== Wd || canvas.height !== Hd) { canvas.width = Wd; canvas.height = Hd; }
    geo = { dpr, W, H, Wd, Hd, portrait, left: r.left, top: r.top };
    if (ok) allocate(Wd);
    return true;
  }

  // ---------- pointer ----------
  function local(e) {
    const r = card.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom };
  }
  function takeOver(coarse) {
    lastInputT = simT; lastInputCoarse = coarse;
    if (mode !== 'manual') { mode = 'manual'; setStir(0, P.stirOut); }
  }
  function moveTo(x, y, inside, coarse, tNow) {
    if (!inside && !ptr.down) { ptr.inside = false; return; }
    const t = tNow != null ? tNow : simT;
    if (!ptr.inside) { ptr.px = x; ptr.py = y; ptr.pt = t - 16; }
    ptr.inside = true;
    ptr.x = x; ptr.y = y; ptr.t = t; ptr.moved = true;
    takeOver(coarse);
  }
  function press(x, y, coarse) {
    takeOver(coarse);
    ptr.down = true; ptr.inside = true;
    ptr.x = ptr.px = x; ptr.y = ptr.py = y; ptr.t = ptr.pt = simT;
    if (simT - lastDropT >= P.dropGap) { queue.push([x, y]); lastDropT = simT; }
  }
  function release() { ptr.down = false; }

  const onMove = (e) => { if (rec || reduced) return; const l = local(e); moveTo(l.x, l.y, l.inside, e.pointerType !== 'mouse' && e.pointerType !== 'pen'); };
  const onDown = (e) => {
    if (rec || reduced) return;
    const l = local(e);
    if (!l.inside) return;
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
    press(l.x, l.y, e.pointerType !== 'mouse' && e.pointerType !== 'pen');
  };
  const onUp = () => { if (rec) return; release(); };
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);

  // ---------- loop ----------
  let raf = 0, last = null, destroyed = false, running = false;
  let slowRun = 0;
  const times = [];
  function tick(now) {
    raf = requestAnimationFrame(tick);
    let dt = last == null ? P.recDt : now - last;
    last = now;
    times.push(dt); if (times.length > 240) times.shift();
    // perf fallback: 30 frames in a row over 20 ms halves the grid
    if (dt > P.slowMs && frame > 10) slowRun++; else slowRun = 0;
    if (slowRun >= P.slowRun && perfLevel < 2) { perfLevel++; gridLong >>= 1; inkScale *= 0.5; allocate(geo.Wd); slowRun = 0; }
    dt = Math.min(Math.max(dt, 0), P.maxDt);
    if (dt > 0) step(dt);
    render();
  }
  function start() {
    if (running || rec || reduced || !ok) return;
    running = true; last = null;
    raf = requestAnimationFrame(tick);
  }
  function stop() { running = false; cancelAnimationFrame(raf); raf = 0; }

  function relayout() {
    if (destroyed || !layout()) return;
    if (ok && !running) render();
  }
  const ro = new ResizeObserver(relayout);
  ro.observe(root);
  window.addEventListener('resize', relayout);
  let dprQ = null;
  const onDpr = () => { dprQ && dprQ.removeEventListener('change', onDpr); watchDpr(); relayout(); };
  function watchDpr() { dprQ = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`); dprQ.addEventListener('change', onDpr); }
  watchDpr();
  const onReduced = () => {
    if (rec) return;
    reduced = reducedQ.matches;
    if (reduced) { stop(); if (ok) { prerun(); render(); } }
    else { setStir(1, P.stirIn); start(); }
  };
  reducedQ.addEventListener('change', onReduced);
  const onLost = (e) => { e.preventDefault(); stop(); };
  canvas.addEventListener('webglcontextlost', onLost);

  const fontsReady = (opts.fonts || document.fonts.load(`400 ${P.labelSize}px "JetBrains Mono"`, 'LUMEN Nº 012 Ink'))
    .catch(() => {}).then(() => document.fonts.ready).then(() => {
      if (destroyed) return;
      layout();
      if (ok) { prerun(); render(); }
      // shown only once the fonts are in, the size is measured and the burst frame is drawn
      stage.classList.add('on');
      start();
    });

  const api = {
    fontsReady,
    ready: fontsReady,
    get ok() { return ok; },
    state() {
      const s = times.slice().sort((a, b) => a - b);
      return {
        mode, frame, simT, stirGain, perfLevel, reduced, rec, seed,
        grid: [gw, gh], ink: [iw, ih], canvas: [canvas.width, canvas.height],
        geo, fineQ: fineQ.matches,
        frameMs: s.length ? { avg: s.reduce((a, b) => a + b, 0) / s.length, p50: s[s.length >> 1], p95: s[Math.floor(s.length * 0.95)], n: s.length } : null
      };
    },
    // ---- ?rec: fixed seed, fixed timestep, frame-stepped from the outside ----
    step(n = 1) { for (let i = 0; i < n; i++) step(P.recDt); render(); return frame; },
    press(x, y) { press(x, y, false); },
    move(x, y) { moveTo(x, y, true, false, simT); },
    release() { release(); },
    // GPU-inclusive timing of n sim+render frames (gl.finish each frame)
    bench(n = 120) {
      const out = [];
      const px = new Uint8Array(4);
      // a 1-pixel readback forces the GPU to finish the frame before the clock stops
      for (let i = 0; i < n; i++) { const t0 = performance.now(); step(P.recDt); render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); out.push(performance.now() - t0); }
      out.sort((a, b) => a - b);
      return { avg: out.reduce((a, b) => a + b, 0) / n, p50: out[n >> 1], p95: out[Math.floor(n * 0.95)], max: out[n - 1] };
    },
    // RMS of the curl-noise velocity, W per second (used to calibrate noiseNorm)
    probeNoise() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, psiT.fb);
      const buf = new Float32Array(pw * ph * 4);
      gl.readPixels(0, 0, pw, ph, gl.RGBA, gl.FLOAT, buf);
      let s2 = 0, n = 0;
      for (let y = 1; y < ph - 1; y++) for (let x = 1; x < pw - 1; x++) {
        const at = (xx, yy) => buf[(yy * pw + xx) * 4];
        const vx = (at(x, y + 1) - at(x, y - 1)) / (2 / ph / P.aspect);
        const vy = -(at(x + 1, y) - at(x - 1, y)) / (2 / pw);
        s2 += vx * vx + vy * vy; n++;
      }
      return Math.sqrt(s2 / n);
    },
    // start over from the burst frame with the same seed (used by recording and tuning)
    reset() {
      rand = mulberry32(seed);
      noiseSeed[0] = rand() * 100; noiseSeed[1] = rand() * 100;
      for (const t of [vel.read, vel.write, pres.read, pres.write, ink.read, ink.write, fwdT, divT, curlT]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      }
      mode = 'auto'; lastDropT = -1e9; lastInputT = -1e9; queue.length = 0; ptr.moved = false; ptr.down = false;
      prerun(); render();
    },
    profile(n = 30) {
      prof = { _t: 0 };
      for (let i = 0; i < n; i++) { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1); prof._t = performance.now(); step(P.recDt); render(); mark('display'); }
      const r = {}; for (const k in prof) if (k !== '_t') r[k] = +(prof[k] / n).toFixed(2);
      prof = null; return r;
    },
    params: P,
    destroy() {
      destroyed = true; stop(); ro.disconnect();
      window.removeEventListener('resize', relayout);
      dprQ && dprQ.removeEventListener('change', onDpr);
      reducedQ.removeEventListener('change', onReduced);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('webglcontextlost', onLost);
      if (ok) {
        freePair(vel); freePair(pres); free(divT); free(curlT); freePair(ink); free(fwdT); free(psiT); free(vinkT); free(poolT);
        fiberTex && gl.deleteTexture(fiberTex);
        for (const k in progs) gl.deleteProgram(progs[k].p);
        const lose = gl.getExtension('WEBGL_lose_context'); lose && lose.loseContext();
      }
      stage.remove();
      removeStyle();
    }
  };
  return api;
}
