export const P = {
  aspect: 1.586,
  cardMax: 640,
  cardVw: 0.86,
  cardVh: 1.11,
  radius: 20,
  restU: 0.62,
  restV: 0.50,
  lensDiam: 0.30,
  lensDiamHold: 0.36,
  magRest: 1.35,
  magHold: 1.80,
  iorRest: 1.35,
  iorHold: 1.80,
  caRest: 0.012,
  caHold: 0.024,
  caInner: 0.72,
  shadowOff: 10,
  shadowBlur: 28,
  shadowAlpha: 0.5,
  rimPx: 1,
  rimColor: [1, 1, 1, 0.18],
  arcDeg: 40,
  arcMidDeg: 135,
  arcPx: 1.5,
  amber: "#FFB547",
  amberRgb: [1, 0.7109375, 0.27734375],
  stretchGain: 3000,
  stretchMax: 0.12,
  stretchK: 280,
  stretchC: 28,
  followK: 170,
  followC: 22,
  mass: 1,
  holdK: 280,
  holdC: 28,
  swiftFollow: [0.48, 0.84],
  swiftHold: [0.32, 0.82],
  cardFade: 160,
  reducedFade: 200,
  lensInMs: 600,
  lensInFrom: 0.6,
  lensInEase: [0.16, 1, 0.3, 1],
  driftPeriod: 8000,
  driftCx: 0.50,
  driftAx: 0.28,
  driftCy: 0.52,
  driftAy: 0.10,
  driftEaseMs: 800,
  hairEvery: 8,
  hairWidth: 1,
  hairColor: "rgba(255,255,255,.07)",
  grainSize: 128,
  grainAlpha: 0.03,
  titleSize: 0.13,
  titleX: 0.08,
  titleBaseline: 0.58,
  titleTracking: -0.04,
  titleColor: "#E8E6E1",
  metaSize: 12,
  metaTracking: 0.08,
  metaColor: "#6E6D75",
  metaInset: 0.06,
  ink: "#E8E6E1",
  pageBg: "#0B0B0C",
  cardBg: "#121214",
  stroke: "rgba(255,255,255,.06)",
  dprCap: 2
};

export function bez(x1, y1, x2, y2) {
  const solve = (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const currentX = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t - x;
      if (Math.abs(currentX) < 1e-6) break;
      const dX = 3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2);
      if (Math.abs(dX) < 1e-6) break;
      t -= currentX / dX;
    }
    if (t < 0 || t > 1) {
      let t0 = 0, t1 = 1;
      t = x;
      for (let j = 0; j < 30; j++) {
        const currentX = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
        if (Math.abs(currentX - x) < 1e-6) break;
        if (x > currentX) t0 = t; else t1 = t;
        t = (t1 + t0) * 0.5;
      }
    }
    return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  };
  return solve;
}

export function spring(pos, vel, target, dt, k, c, m = 1) {
  if (dt <= 0) return { pos, vel };
  const n = Math.max(1, Math.round(dt * 240));
  const h = dt / n;
  let p = pos;
  let v = vel;
  for (let i = 0; i < n; i++) {
    const a = (-k * (p - target) - c * v) / m;
    v += a * h;
    p += v * h;
  }
  return { pos: p, vel: v };
}

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

let styleRefCount = 0;
let styleElem = null;

function injectStyles() {
  if (styleRefCount === 0) {
    styleElem = document.createElement("style");
    styleElem.textContent = `
      .g-stage {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        visibility: hidden;
      }
      .g-stage.on {
        visibility: visible;
      }
      .g-card {
        width: min(640px, 86vw, 111vh);
        aspect-ratio: 1.586 / 1;
        box-sizing: border-box;
        border-radius: 20px;
        border: none;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.06);
        background: #121214;
        overflow: hidden;
        position: relative;
        transform-origin: center;
        opacity: 0;
        will-change: transform, opacity;
      }
      canvas.g-gl {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
      }
      body.og .links {
        display: none;
      }
    `;
    document.head.appendChild(styleElem);
  }
  styleRefCount++;
}

function removeStyles() {
  styleRefCount--;
  if (styleRefCount === 0 && styleElem) {
    styleElem.remove();
    styleElem = null;
  }
}

const vertShaderSource = `
  attribute vec2 aPos;
  varying vec2 vUv;
  void main() {
    vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`;

const fragShaderSource = `
  precision highp float;
  uniform sampler2D uTexture;
  uniform vec2 uSize;
  uniform vec2 uLens;
  uniform float uRadius;
  uniform float uStretch;
  uniform float uAngle;
  uniform float uIOR;
  uniform float uCA;

  varying vec2 vUv;

  vec3 sampleFace(vec2 cssPx) {
    vec2 uv = clamp(cssPx / uSize, vec2(0.0), vec2(1.0));
    return texture2D(uTexture, vec2(uv.x, 1.0 - uv.y)).rgb;
  }

  void main() {
    vec2 pix = vUv * uSize;
    vec2 d = pix - uLens;
    float ca = cos(-uAngle), sa = sin(-uAngle);
    vec2 q = vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y);
    q.x /= uStretch;
    q.y *= uStretch;
    float r = length(q) / uRadius;

    vec3 base = sampleFace(pix);

    vec2 dSh = (pix - vec2(0.0, 10.0)) - uLens;
    vec2 qSh = vec2(ca * dSh.x - sa * dSh.y, sa * dSh.x + ca * dSh.y);
    qSh.x /= uStretch; qSh.y *= uStretch;
    float rSh = length(qSh) / uRadius;
    float sh = (1.0 - smoothstep(1.0, 1.0 + 28.0 / uRadius, rSh)) * 0.5;
    float edge = smoothstep(1.0 - 1.5 / uRadius, 1.0 + 0.5 / uRadius, r);
    vec3 col = mix(base, vec3(0.0), sh * edge);

    if (r < 1.15) {
      vec2 uvDisk = q / uRadius;
      float z = sqrt(max(0.0, 1.0 - dot(uvDisk, uvDisk)));
      vec3 N = normalize(vec3(uvDisk, z));
      vec3 I = vec3(0.0, 0.0, -1.0);
      float eta = 1.0 / uIOR;
      vec3 T = refract(I, N, eta);
      if (T.z < 0.0 && z > 0.0) {
        float tHit = (z * uRadius) / max(1e-5, -T.z);
        vec2 sampleLocal = q + T.xy * tHit;
        sampleLocal.x *= uStretch;
        sampleLocal.y /= uStretch;
        float c2 = cos(uAngle), s2 = sin(uAngle);
        vec2 samplePx = uLens + vec2(c2 * sampleLocal.x - s2 * sampleLocal.y, s2 * sampleLocal.x + c2 * sampleLocal.y);
        float e = smoothstep(0.72, 1.0, r);
        vec2 fromC = samplePx - uLens;
        vec2 sR = uLens + fromC * (1.0 - uCA * e);
        vec2 sB = uLens + fromC * (1.0 + uCA * e);
        float cr = sampleFace(sR).r;
        float cg = sampleFace(samplePx).g;
        float cb = sampleFace(sB).b;
        vec3 refr = vec3(cr, cg, cb);
        col = mix(refr, col, edge);

        float rim = smoothstep(1.0 - 2.2 / uRadius, 1.0 - 1.0 / uRadius, r)
                  * (1.0 - smoothstep(1.0 - 1.0 / uRadius, 1.0, r));
        col += vec3(1.0) * 0.18 * rim * (1.0 - edge);

        float ang = atan(-(pix.y - uLens.y), pix.x - uLens.x);
        float mid = 2.35619449019;
        float ad = abs(mod(ang - mid + 3.14159265, 6.2831853) - 3.14159265);
        float span = 0.34906585;
        float ring = smoothstep(1.0 - 2.9 / uRadius, 1.0 - 1.5 / uRadius, r)
                   * (1.0 - smoothstep(1.0 - 0.2 / uRadius, 1.0 + 0.4 / uRadius, r));
        float arc = (1.0 - smoothstep(span, span + 2.0 / uRadius, ad)) * ring;
        col = mix(col, vec3(1.0, 0.7109375, 0.27734375), clamp(arc, 0.0, 1.0));
      }
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('Shader compile failed: ' + info);
  }
  return shader;
}

function createProgram(gl, vsSource, fsSource) {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error('Program link failed: ' + info);
  }
  return program;
}

export function mountGlassLens(root) {
  injectStyles();

  const stage = document.createElement('div');
  stage.className = 'g-stage';

  const card = document.createElement('div');
  card.className = 'g-card';
  card.setAttribute('aria-label', 'Lumen Glass Lens number 009');

  const canvas = document.createElement('canvas');
  canvas.className = 'g-gl';
  card.appendChild(canvas);
  stage.appendChild(card);
  root.appendChild(stage);

  const faceCanvas = document.createElement('canvas');
  const faceCtx = faceCanvas.getContext('2d');

  let grainImg = new Image();
  let grainLoaded = false;
  grainImg.onload = () => {
    grainLoaded = true;
    faceDirty = true;
  };
  grainImg.src = 'grain.png';

  let gl = null;
  let isWebGL = false;
  let program = null;
  let vbo = null;
  let vao = null;
  let texture = null;
  let uniforms = {};

  try {
    gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true }) ||
         canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (gl) {
      program = createProgram(gl, vertShaderSource, fragShaderSource);
      gl.useProgram(program);
      vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1
      ]), gl.STATIC_DRAW);

      if (gl.createVertexArray) {
        vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
      }
      const aPos = gl.getAttribLocation(program, 'aPos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(gl.getUniformLocation(program, 'uTexture'), 0);

      uniforms = {
        uTexture: gl.getUniformLocation(program, 'uTexture'),
        uSize: gl.getUniformLocation(program, 'uSize'),
        uLens: gl.getUniformLocation(program, 'uLens'),
        uRadius: gl.getUniformLocation(program, 'uRadius'),
        uStretch: gl.getUniformLocation(program, 'uStretch'),
        uAngle: gl.getUniformLocation(program, 'uAngle'),
        uIOR: gl.getUniformLocation(program, 'uIOR'),
        uCA: gl.getUniformLocation(program, 'uCA')
      };

      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      isWebGL = true;
    }
  } catch (e) {
    isWebGL = false;
    gl = null;
  }

  let drawCanvas = canvas;
  let ctx2d = null;
  if (!isWebGL) {
    const fresh = document.createElement('canvas');
    fresh.className = 'g-gl';
    canvas.replaceWith(fresh);
    drawCanvas = fresh;
    ctx2d = drawCanvas.getContext('2d');
  }

  let cssW = 0, cssH = 0, dpr = 1;
  let faceDirty = true;
  let sizeDirty = true;

  function updateSize() {
    const rect = card.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    cssW = rect.width;
    cssH = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, P.dprCap);
    const bufW = Math.round(cssW * dpr);
    const bufH = Math.round(cssH * dpr);
    if (drawCanvas.width !== bufW || drawCanvas.height !== bufH) {
      drawCanvas.width = bufW;
      drawCanvas.height = bufH;
      faceCanvas.width = bufW;
      faceCanvas.height = bufH;
      faceDirty = true;
    }
  }

  function drawTextTracked(ctx, text, x, y, fontSize, fontWeight, color, trackingEm, align = 'left', baseline = 'alphabetic') {
    ctx.save();
    ctx.font = `${fontWeight} ${fontSize}px Geist, "Geist", ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.textBaseline = baseline;

    const letterSpacingPx = trackingEm * fontSize;
    const chars = Array.from(text);
    let totalWidth = 0;
    const widths = chars.map((ch, i) => {
      const w = ctx.measureText(ch).width;
      totalWidth += w + (i < chars.length - 1 ? letterSpacingPx : 0);
      return w;
    });

    let curX = x;
    if (align === 'right') {
      curX = x - totalWidth;
    } else if (align === 'center') {
      curX = x - totalWidth / 2;
    }
    ctx.textAlign = 'left';

    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], curX, y);
      curX += widths[i] + letterSpacingPx;
    }
    ctx.restore();
  }

  function renderFace() {
    if (!faceDirty || cssW === 0 || cssH === 0) return;
    const bufW = faceCanvas.width;
    const bufH = faceCanvas.height;

    faceCtx.setTransform(1, 0, 0, 1, 0, 0);
    faceCtx.fillStyle = P.cardBg;
    faceCtx.fillRect(0, 0, bufW, bufH);

    faceCtx.fillStyle = P.hairColor;
    for (let y = 0; y < bufH; y += P.hairEvery) {
      faceCtx.fillRect(0, y, bufW, P.hairWidth);
    }

    faceCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawTextTracked(faceCtx, "LUMEN", cssW * P.metaInset, cssH * P.metaInset, P.metaSize, 600, P.metaColor, P.metaTracking, 'left', 'top');
    drawTextTracked(faceCtx, "Nº 009", cssW * (1 - P.metaInset), cssH * P.metaInset, P.metaSize, 600, P.metaColor, P.metaTracking, 'right', 'top');
    drawTextTracked(faceCtx, "Glass Lens", cssW * P.titleX, cssH * P.titleBaseline, cssW * P.titleSize, 500, P.titleColor, P.titleTracking, 'left', 'alphabetic');

    if (grainLoaded && grainImg.complete && grainImg.naturalWidth > 0) {
      const pattern = faceCtx.createPattern(grainImg, 'repeat');
      if (pattern) {
        faceCtx.save();
        faceCtx.globalAlpha = P.grainAlpha;
        faceCtx.fillStyle = pattern;
        faceCtx.fillRect(0, 0, cssW, cssH);
        faceCtx.restore();
      }
    }

    if (isWebGL) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, faceCanvas);
    }
    faceDirty = false;
  }

  const fineQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  let hasFinePointer = fineQuery.matches;
  const onFineChange = (e) => { hasFinePointer = e.matches; };
  if (fineQuery.addEventListener) {
    fineQuery.addEventListener('change', onFineChange);
  }

  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let isReduced = reducedQuery.matches;
  const onReducedChange = (e) => { isReduced = e.matches; };
  if (reducedQuery.addEventListener) {
    reducedQuery.addEventListener('change', onReducedChange);
  }

  let isPressed = false;
  let isFineActive = false;
  let targetU = P.restU;
  let targetV = P.restV;

  let posPx = { x: P.restU * 640, y: P.restV * 400 };
  let velPx = { x: 0, y: 0 };

  let holdVal = 0;
  let holdVel = 0;

  let stretchVal = 1;
  let stretchVel = 0;
  let lastAngle = 0;

  let driftClock = 0;
  let t0 = null;
  let seekTimeMs = null;
  let firstFrameDrawn = false;
  let animFrameId = null;
  let lastFrameTime = null;

  const fontPromise = (async () => {
    try {
      if (document.fonts) {
        await document.fonts.ready;
        await Promise.all([
          document.fonts.load('600 12px Geist'),
          document.fonts.load('500 48px Geist')
        ]);
      }
    } catch (e) {}
  })();

  const timeoutPromise = new Promise(resolve => setTimeout(resolve, 1500));
  const fontWait = Promise.race([fontPromise, timeoutPromise]).then(() => {
    updateSize();
    posPx.x = P.restU * cssW;
    posPx.y = P.restV * cssH;
    return true;
  });

  const easeLensIn = bez(P.lensInEase[0], P.lensInEase[1], P.lensInEase[2], P.lensInEase[3]);

  const onPointerMove = (e) => {
    if (e.pointerType === 'mouse' || e.pointerType === 'pen' || hasFinePointer) {
      isFineActive = true;
      const rect = card.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        targetU = clamp((e.clientX - rect.left) / rect.width, 0, 1);
        targetV = clamp((e.clientY - rect.top) / rect.height, 0, 1);
      }
    }
  };

  const onPointerEnter = (e) => {
    onPointerMove(e);
  };

  const onPointerLeave = () => {
    if (isFineActive) {
      targetU = P.restU;
      targetV = P.restV;
    }
  };

  const onPointerDown = (e) => {
    if (e.isPrimary !== false && e.button === 0) {
      isPressed = true;
    }
  };

  const onWindowPointerUp = () => {
    isPressed = false;
  };

  card.addEventListener('pointermove', onPointerMove);
  card.addEventListener('pointerenter', onPointerEnter);
  card.addEventListener('pointerleave', onPointerLeave);
  card.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onWindowPointerUp);
  window.addEventListener('pointercancel', onWindowPointerUp);

  const onWinResize = () => { sizeDirty = true; };
  const resizeObserver = new ResizeObserver(onWinResize);
  resizeObserver.observe(card);
  window.addEventListener('resize', onWinResize);

  let currentPhase = 'intro';
  let currentHold = 0;
  let currentMag = P.magRest;
  let currentDiamFrac = P.lensDiam;
  let currentScale = P.lensInFrom;

  function renderFrame(nowMs) {
    if (t0 === null) {
      t0 = nowMs;
    }

    const effectiveNow = seekTimeMs !== null ? (t0 + seekTimeMs) : nowMs;
    const elapsed = Math.max(0, effectiveNow - t0);

    if (lastFrameTime === null) {
      lastFrameTime = effectiveNow;
    }
    const dt = Math.min(Math.max((effectiveNow - lastFrameTime) / 1000, 0.001), 0.064);
    lastFrameTime = effectiveNow;

    if (sizeDirty || cssW === 0) {
      const oldW = cssW || 1;
      const oldH = cssH || 1;
      const currentU = posPx.x / oldW;
      const currentV = posPx.y / oldH;
      updateSize();
      if (oldW > 1 && cssW > 0) {
        posPx.x = currentU * cssW;
        posPx.y = currentV * cssH;
      }
      sizeDirty = false;
    }
    renderFace();

    const fadeDuration = isReduced ? P.reducedFade : P.cardFade;
    const cardOpacity = clamp(elapsed / fadeDuration, 0, 1);
    card.style.opacity = cardOpacity.toFixed(3);

    let introProgress = clamp(elapsed / P.lensInMs, 0, 1);
    let introScale = isReduced ? 1.0 : (P.lensInFrom + (1.0 - P.lensInFrom) * easeLensIn(introProgress));
    currentScale = introScale;

    if (isReduced) {
      currentPhase = 'reduced';
      targetU = P.restU;
      targetV = P.restV;
      posPx.x = P.restU * cssW;
      posPx.y = P.restV * cssH;
      velPx.x = 0;
      velPx.y = 0;
      stretchVal = 1;

      const holdTarget = isPressed ? 1 : 0;
      holdVal = holdVal + Math.sign(holdTarget - holdVal) * Math.min(Math.abs(holdTarget - holdVal), dt / 0.2);
    } else {
      if (elapsed < P.lensInMs) {
        currentPhase = 'intro';
      } else if (isFineActive) {
        currentPhase = 'follow';
      } else if (!hasFinePointer) {
        currentPhase = 'drift';
        const tDrift = elapsed - P.lensInMs;
        const ev = clamp(tDrift / P.driftEaseMs, 0, 1);
        const evEased = ev * ev * (3 - 2 * ev);
        driftClock += dt * 1000 * evEased;
        targetU = P.driftCx + P.driftAx * Math.sin(2 * Math.PI * driftClock / P.driftPeriod);
        targetV = P.driftCy + P.driftAy * Math.sin(4 * Math.PI * driftClock / P.driftPeriod);
      } else {
        currentPhase = 'rest';
      }

      const targetPxX = targetU * cssW;
      const targetPxY = targetV * cssH;
      const rx = spring(posPx.x, velPx.x, targetPxX, dt, P.followK, P.followC, P.mass);
      const ry = spring(posPx.y, velPx.y, targetPxY, dt, P.followK, P.followC, P.mass);
      posPx.x = rx.pos; velPx.x = rx.vel;
      posPx.y = ry.pos; velPx.y = ry.vel;

      const holdTarget = isPressed ? 1 : 0;
      const rh = spring(holdVal, holdVel, holdTarget, dt, P.holdK, P.holdC, P.mass);
      holdVal = clamp(rh.pos, 0, 1);
      holdVel = rh.vel;

      const speed = Math.hypot(velPx.x, velPx.y);
      const stretchTarget = 1 + Math.min(speed / P.stretchGain, P.stretchMax);
      const rs = spring(stretchVal, stretchVel, stretchTarget, dt, P.stretchK, P.stretchC, P.mass);
      stretchVal = Math.max(1.0, rs.pos);
      stretchVel = rs.vel;

      if (speed > 1e-3) {
        lastAngle = Math.atan2(velPx.y, velPx.x);
      }
    }

    currentHold = holdVal;
    currentMag = P.iorRest + (P.iorHold - P.iorRest) * holdVal;
    currentDiamFrac = P.lensDiam + (P.lensDiamHold - P.lensDiam) * holdVal;
    const lensRadiusPx = 0.5 * currentDiamFrac * cssW * introScale;
    const currentCA = P.caRest + (P.caHold - P.caRest) * holdVal;

    const radiusPx = Math.max(lensRadiusPx, 1e-3);
    if (isWebGL) {
      if (vao) gl.bindVertexArray(vao);
      gl.viewport(0, 0, drawCanvas.width, drawCanvas.height);
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform2f(uniforms.uSize, cssW, cssH);
      gl.uniform2f(uniforms.uLens, posPx.x, posPx.y);
      gl.uniform1f(uniforms.uRadius, radiusPx);
      gl.uniform1f(uniforms.uStretch, Math.max(stretchVal, 1e-3));
      gl.uniform1f(uniforms.uAngle, lastAngle);
      gl.uniform1f(uniforms.uIOR, currentMag);
      gl.uniform1f(uniforms.uCA, currentCA);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } else if (ctx2d) {
      ctx2d.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      ctx2d.drawImage(faceCanvas, 0, 0);

      ctx2d.save();
      ctx2d.scale(dpr, dpr);
      ctx2d.beginPath();
      ctx2d.arc(posPx.x, posPx.y, radiusPx, 0, Math.PI * 2);
      ctx2d.clip();

      ctx2d.save();
      ctx2d.translate(posPx.x, posPx.y);
      ctx2d.scale(currentMag, currentMag);
      ctx2d.translate(-posPx.x, -posPx.y);
      ctx2d.drawImage(faceCanvas, 0, 0, cssW, cssH);
      ctx2d.restore();

      ctx2d.restore();
    }

    if (!firstFrameDrawn) {
      firstFrameDrawn = true;
      stage.classList.add('on');
    }

    animFrameId = requestAnimationFrame(renderFrame);
  }

  fontWait.then(() => {
    animFrameId = requestAnimationFrame(renderFrame);
  });

  return {
    stage,
    card,
    get canvas() { return drawCanvas; },
    boot: {
      fontWait,
      get t0() { return t0; }
    },
    destroy() {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      card.removeEventListener('pointermove', onPointerMove);
      card.removeEventListener('pointerenter', onPointerEnter);
      card.removeEventListener('pointerleave', onPointerLeave);
      card.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
      if (fineQuery.removeEventListener) fineQuery.removeEventListener('change', onFineChange);
      if (reducedQuery.removeEventListener) reducedQuery.removeEventListener('change', onReducedChange);
      resizeObserver.disconnect();
      window.removeEventListener('resize', onWinResize);

      if (isWebGL && gl) {
        if (texture) gl.deleteTexture(texture);
        if (vbo) gl.deleteBuffer(vbo);
        if (vao && gl.deleteVertexArray) gl.deleteVertexArray(vao);
        if (program) gl.deleteProgram(program);
      }
      stage.remove();
      removeStyles();
    },
    state() {
      return {
        ready: firstFrameDrawn,
        phase: currentPhase,
        fine: hasFinePointer,
        reduced: isReduced,
        u: cssW ? posPx.x / cssW : P.restU,
        v: cssH ? posPx.y / cssH : P.restV,
        tu: targetU,
        tv: targetV,
        press: isPressed,
        hold: currentHold,
        mag: currentMag,
        diameter: currentDiamFrac,
        stretch: stretchVal,
        scale: currentScale,
        webgl: isWebGL,
        elapsed: t0 !== null ? Math.max(0, (seekTimeMs !== null ? (t0 + seekTimeMs) : performance.now()) - t0) : 0,
        cssW,
        cssH,
        dpr
      };
    },
    seek(ms) {
      seekTimeMs = ms;
      lastFrameTime = null;
      if (ms == null) return;
      const tDrift = Math.max(0, ms - P.lensInMs);
      const T = P.driftEaseMs;
      if (tDrift >= T) {
        driftClock = T * 0.5 + (tDrift - T);
      } else {
        const s = tDrift / T;
        driftClock = T * (s * s * s - 0.5 * s * s * s * s);
      }
      if (!isReduced && ms >= P.lensInMs && !hasFinePointer && !isFineActive) {
        targetU = P.driftCx + P.driftAx * Math.sin(2 * Math.PI * driftClock / P.driftPeriod);
        targetV = P.driftCy + P.driftAy * Math.sin(4 * Math.PI * driftClock / P.driftPeriod);
        if (cssW > 0 && cssH > 0) {
          posPx.x = targetU * cssW;
          posPx.y = targetV * cssH;
          velPx.x = 0;
          velPx.y = 0;
        }
      }
    },
    setPress(on) {
      isPressed = !!on;
    }
  };
}
