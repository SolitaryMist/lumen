export const P = {
  cols: 10,
  rows: 10,
  aspect: 4 / 3,
  cardMax: 420,
  cardVw: 0.86,
  radius: 20,
  gridFrac: 0.66,
  slatW: 0.028,
  slatH: 0.05,
  slatRadius: 1,
  heightMax: 1.35,
  rotGain: 0.3,
  rotMax: 25,
  closeRot: 75,
  holdHeight: 1.50,
  holdWidth: 0.80,
  holdBright: 1.20,
  followK: 260,
  followC: 24,
  mass: 1,
  holdK: 420,
  holdC: 28,
  releaseK: 300,
  releaseC: 20,
  releaseStagger: 18,
  cardScaleHeld: 0.98,
  cardFade: 160,
  reducedFade: 200,
  growMs: 600,
  growEase: [0.16, 1, 0.3, 1],
  growStagger: 12,
  guideDelay: 760,
  guideMs: 520,
  guideEase: [0.22, 1, 0.36, 1],
  driftPeriod: 8000,
  ampX: 50,
  ampY: 35,
  charRadiusFrac: 0.22,
  pageBg: "#0B0B0C",
  cardBg: "#121214",
  ink: "#E8E6E1",
  dim: "#55545D",
  amber: "#FFB547",
  slatBase: "rgba(255,255,255,.05)",
  slatLit: "rgba(232,230,225,.22)",
  border: "rgba(255,255,255,.06)",
  grainSize: 128,
  grainOpacity: 0.03,
  brandSize: 12,
  titleSize: 22,
  titleTracking: -0.03,
  dprCap: 2
};

export function bez(x1, y1, x2, y2) {
  if (x1 === y1 && x2 === y2) return (t) => t;
  const sampleValues = new Float32Array(11);
  for (let i = 0; i < 11; ++i) {
    sampleValues[i] = calcBezier(i * 0.1, x1, x2);
  }
  function calcBezier(t, a1, a2) {
    return (((1 - 3 * a2 + 3 * a1) * t + (3 * a2 - 6 * a1)) * t + 3 * a1) * t;
  }
  function getSlope(t, a1, a2) {
    return 3 * (1 - 3 * a2 + 3 * a1) * t * t + 2 * (3 * a2 - 6 * a1) * t + 3 * a1;
  }
  function solveT(x) {
    let intervalStart = 0.0;
    let currentSample = 1;
    for (; currentSample !== 10 && sampleValues[currentSample] <= x; ++currentSample) {
      intervalStart += 0.1;
    }
    --currentSample;
    let dist = (x - sampleValues[currentSample]) / (sampleValues[currentSample + 1] - sampleValues[currentSample]);
    let guessT = intervalStart + dist * 0.1;
    let initialSlope = getSlope(guessT, x1, x2);
    if (initialSlope >= 0.001) {
      for (let i = 0; i < 4; ++i) {
        let currentX = calcBezier(guessT, x1, x2) - x;
        let currentSlope = getSlope(guessT, x1, x2);
        if (currentSlope === 0.0) break;
        guessT -= currentX / currentSlope;
      }
      return guessT;
    }
    if (initialSlope === 0.0) return guessT;
    let a = intervalStart;
    let b = intervalStart + 0.1;
    let currentX, t;
    let i = 0;
    do {
      t = a + (b - a) / 2.0;
      currentX = calcBezier(t, x1, x2) - x;
      if (currentX > 0.0) {
        b = t;
      } else {
        a = t;
      }
    } while (Math.abs(currentX) > 0.0000001 && ++i < 10);
    return t;
  }
  return function(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return calcBezier(solveT(x), y1, y2);
  };
}

export function spring(pos, vel, target, dt, k, c, m = 1) {
  const n = Math.max(1, Math.round(dt * 240));
  const subDt = dt / n;
  let p = pos;
  let v = vel;
  for (let i = 0; i < n; i++) {
    const a = (-k * (p - target) - c * v) / m;
    v += a * subDt;
    p += v * subDt;
  }
  return { pos: p, vel: v };
}

export function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

let styleRefCount = 0;
let injectedStyleEl = null;

function injectStyles() {
  if (styleRefCount === 0) {
    injectedStyleEl = document.createElement('style');
    injectedStyleEl.setAttribute('data-light-grille', '');
    injectedStyleEl.textContent = `
      .g-stage {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        background-color: ${P.pageBg};
        overflow: hidden;
        user-select: none;
        -webkit-user-select: none;
        overscroll-behavior: none;
        visibility: hidden;
      }
      .g-stage.on {
        visibility: visible;
      }
      .g-card {
        position: relative;
        width: min(${P.cardMax}px, ${P.cardVw * 100}vw, 60vh);
        aspect-ratio: 3 / 4;
        background: ${P.cardBg};
        border: 1px solid ${P.border};
        border-radius: ${P.radius}px;
        box-sizing: border-box;
        overflow: hidden;
        opacity: 0;
        transform-origin: center center;
        touch-action: none;
        will-change: opacity, transform;
      }
      body.og .g-card {
        width: min(${P.cardMax}px, ${P.cardVw * 100}vw);
      }
      .g-grille {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 66%;
        aspect-ratio: 1;
        transform: translate(-50%, -50%);
        perspective: 800px;
        transform-style: preserve-3d;
        pointer-events: none;
      }
      .g-slat {
        position: absolute;
        border-radius: ${P.slatRadius}px;
        transform-origin: center center;
        will-change: transform, width, height, background;
      }
      .g-grain {
        position: absolute;
        inset: 0;
        opacity: ${P.grainOpacity};
        pointer-events: none;
        background: url("./grain.png") repeat;
        background-size: ${P.grainSize}px ${P.grainSize}px;
        z-index: 2;
      }
      .g-brand {
        position: absolute;
        top: 22px;
        left: 24px;
        font-size: ${P.brandSize}px;
        font-weight: 600;
        letter-spacing: 0.12em;
        color: ${P.dim};
        font-family: "Geist", Geist, ui-sans-serif, system-ui, sans-serif;
        margin: 0;
        line-height: 1;
        z-index: 3;
      }
      .g-foot {
        position: absolute;
        left: 24px;
        right: 24px;
        bottom: 22px;
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        pointer-events: none;
        z-index: 3;
      }
      .g-title {
        font-size: ${P.titleSize}px;
        font-weight: 500;
        letter-spacing: ${P.titleTracking}em;
        color: ${P.ink};
        white-space: nowrap;
        margin: 0;
        font-family: "Geist", Geist, ui-sans-serif, system-ui, sans-serif;
        line-height: 1;
      }
      .g-num {
        font-size: 12px;
        font-weight: 500;
        color: ${P.dim};
        font-variant-numeric: tabular-nums;
        margin: 0;
        font-family: "Geist", Geist, ui-sans-serif, system-ui, sans-serif;
        line-height: 1;
      }
    `;
    document.head.appendChild(injectedStyleEl);
  }
  styleRefCount++;
}

function dropStyles() {
  styleRefCount--;
  if (styleRefCount === 0 && injectedStyleEl) {
    injectedStyleEl.remove();
    injectedStyleEl = null;
  }
}

export function mountLightGrille(root) {
  if (!root) throw new Error('mountLightGrille needs a host');
  if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
  injectStyles();

  const growBez = bez(...P.growEase);
  const guideBez = bez(...P.guideEase);

  const stage = document.createElement('main');
  stage.className = 'g-stage';
  stage.setAttribute('aria-label', 'Light Grille. Light through a fine grille.');

  const card = document.createElement('article');
  card.className = 'g-card';

  const grille = document.createElement('div');
  grille.className = 'g-grille';

  const grain = document.createElement('div');
  grain.className = 'g-grain';

  const brand = document.createElement('p');
  brand.className = 'g-brand';
  brand.textContent = 'LUMEN';

  const foot = document.createElement('div');
  foot.className = 'g-foot';

  const title = document.createElement('h1');
  title.className = 'g-title';
  title.textContent = 'Light Grille';

  const num = document.createElement('p');
  num.className = 'g-num';
  num.textContent = 'Nº 009';

  foot.appendChild(title);
  foot.appendChild(num);

  card.appendChild(grille);
  card.appendChild(grain);
  card.appendChild(brand);
  card.appendChild(foot);
  stage.appendChild(card);
  root.appendChild(stage);

  const slatElements = [];
  const slatS = new Float32Array(100);
  const slatSVel = new Float32Array(100);

  for (let r = 0; r < P.rows; r++) {
    for (let c = 0; c < P.cols; c++) {
      const slat = document.createElement('div');
      slat.className = 'g-slat';
      grille.appendChild(slat);
      slatElements.push(slat);
    }
  }

  const mediaReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mediaFine = window.matchMedia('(hover: hover) and (pointer: fine)');

  let reduced = mediaReduced.matches;
  let finePointer = mediaFine.matches && !reduced;
  let phase = finePointer || reduced ? 'rest' : 'guide';

  const boot = { fontWait: true };
  let ready = false;
  let pressing = false;
  let lx = 0, ly = 0;
  let lxVel = 0, lyVel = 0;
  let pointerTargetX = 0, pointerTargetY = 0;
  let cardScale = 1.0;
  let cardScaleVel = 0;
  let focusCol = 4, focusRow = 4;
  let nearestCol = 4, nearestRow = 4;
  let releaseStartTime = -999999;

  let W = 0, H = 0, gridSide = 0, cell = 0;
  let restW = 0, restH = 0;

  function updateDimensions() {
    W = card.clientWidth;
    H = card.clientHeight;
    gridSide = W * P.gridFrac;
    cell = gridSide / 10;
    restW = P.slatW * gridSide;
    restH = P.slatH * gridSide;
  }

  updateDimensions();

  const resizeObs = new ResizeObserver(() => {
    updateDimensions();
  });
  resizeObs.observe(card);

  let animFrameId = null;
  let t0 = 0;
  let lastTime = 0;

  function updatePointerTarget(clientX, clientY) {
    const rect = grille.getBoundingClientRect();
    const gCenterX = rect.left + rect.width / 2;
    const gCenterY = rect.top + rect.height / 2;
    pointerTargetX = clientX - gCenterX;
    pointerTargetY = clientY - gCenterY;
  }

  const abortCtrl = new AbortController();
  const { signal } = abortCtrl;

  card.addEventListener('pointerdown', (e) => {
    if (reduced) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.pointerType !== 'mouse' && e.isPrimary === false) return;
    {
      pressing = true;
      focusCol = nearestCol;
      focusRow = nearestRow;
      if (card.setPointerCapture) {
        try { card.setPointerCapture(e.pointerId); } catch (_) {}
      }
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
        finePointer = true;
        phase = 'follow';
      }
      updatePointerTarget(e.clientX, e.clientY);
    }
  }, { signal });

  card.addEventListener('pointermove', (e) => {
    if (reduced) return;
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      finePointer = true;
      phase = 'follow';
    }
    if (phase === 'follow' || pressing) {
      updatePointerTarget(e.clientX, e.clientY);
    }
  }, { signal });

  const onPointerRelease = (e) => {
    if (pressing) {
      pressing = false;
      releaseStartTime = performance.now();
      if (card.releasePointerCapture && e.pointerId !== undefined) {
        try {
          if (card.hasPointerCapture(e.pointerId)) {
            card.releasePointerCapture(e.pointerId);
          }
        } catch (_) {}
      }
    }
  };

  card.addEventListener('pointerup', onPointerRelease, { signal });
  card.addEventListener('pointercancel', onPointerRelease, { signal });
  card.addEventListener('lostpointercapture', onPointerRelease, { signal });

  const onMediaChange = () => {
    reduced = mediaReduced.matches;
    finePointer = mediaFine.matches && !reduced;
    if (reduced) {
      phase = 'rest';
      lx = 0; ly = 0;
      lxVel = 0; lyVel = 0;
      pressing = false;
      cardScale = 1;
      cardScaleVel = 0;
      slatS.fill(0);
      slatSVel.fill(0);
    } else if (phase === 'rest' && !finePointer) {
      phase = 'guide';
    }
  };

  let mediaLegacy = false;
  try {
    mediaReduced.addEventListener('change', onMediaChange, { signal });
    mediaFine.addEventListener('change', onMediaChange, { signal });
  } catch (_) {
    mediaLegacy = true;
    mediaReduced.addListener(onMediaChange);
    mediaFine.addListener(onMediaChange);
  }

  function frame(now) {
    if (boot.fontWait) {
      animFrameId = requestAnimationFrame(frame);
      return;
    }
    if (!t0) t0 = now;
    if (!lastTime) lastTime = now;
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    const elapsedMs = now - t0;

    if (!reduced) {
      let targetX = 0, targetY = 0;
      if (phase === 'follow') {
        targetX = pointerTargetX;
        targetY = pointerTargetY;
      } else if (phase === 'rest') {
        targetX = 0;
        targetY = 0;
      } else if (phase === 'guide') {
        if (elapsedMs < P.guideDelay) {
          targetX = -P.ampX;
          targetY = P.ampY;
        } else if (elapsedMs < P.guideDelay + P.guideMs) {
          const u = (elapsedMs - P.guideDelay) / P.guideMs;
          const e = guideBez(clamp(u, 0, 1));
          targetX = -P.ampX + (P.ampX - (-P.ampX)) * e;
          targetY = P.ampY + (-P.ampY - P.ampY) * e;
        } else {
          phase = 'drift';
          const tDrift = elapsedMs - (P.guideDelay + P.guideMs);
          targetX = P.ampX * Math.cos(2 * Math.PI * tDrift / P.driftPeriod);
          targetY = -P.ampY * Math.cos(2 * Math.PI * tDrift / P.driftPeriod);
        }
      } else if (phase === 'drift') {
        const tDrift = elapsedMs - (P.guideDelay + P.guideMs);
        targetX = P.ampX * Math.cos(2 * Math.PI * tDrift / P.driftPeriod);
        targetY = -P.ampY * Math.cos(2 * Math.PI * tDrift / P.driftPeriod);
      }

      const sX = spring(lx, lxVel, targetX, dt, P.followK, P.followC, P.mass);
      lx = sX.pos; lxVel = sX.vel;
      const sY = spring(ly, lyVel, targetY, dt, P.followK, P.followC, P.mass);
      ly = sY.pos; lyVel = sY.vel;

      const cardTarget = pressing ? P.cardScaleHeld : 1.0;
      const cardK = pressing ? P.holdK : P.releaseK;
      const cardC = pressing ? P.holdC : P.releaseC;
      const sCard = spring(cardScale, cardScaleVel, cardTarget, dt, cardK, cardC, P.mass);
      cardScale = sCard.pos;
      cardScaleVel = sCard.vel;
    } else {
      lx = 0; ly = 0;
      cardScale = 1.0;
    }

    let minDist = Infinity;
    let nCol = 0, nRow = 0;
    for (let r = 0; r < P.rows; r++) {
      for (let c = 0; c < P.cols; c++) {
        const sx = (c + 0.5 - 5) * cell;
        const sy = (r + 0.5 - 5) * cell;
        const dist = Math.hypot(sx - lx, sy - ly);
        if (dist < minDist) {
          minDist = dist;
          nCol = c;
          nRow = r;
        }
      }
    }
    nearestCol = nCol;
    nearestRow = nRow;

    if (!pressing && now > releaseStartTime + 10 * P.releaseStagger + 500) {
      focusCol = nearestCol;
      focusRow = nearestRow;
    }

    const fadeDuration = reduced ? P.reducedFade : P.cardFade;
    const cardOpacity = Math.min(1, elapsedMs / fadeDuration);
    card.style.opacity = cardOpacity.toFixed(4);
    card.style.transform = `scale(${cardScale.toFixed(4)})`;

    for (let r = 0; r < P.rows; r++) {
      for (let c = 0; c < P.cols; c++) {
        const idx = r * P.cols + c;
        let targetS, kS, cS;
        let holdSpring = true;
        if (pressing) {
          targetS = 1;
          kS = P.holdK;
          cS = P.holdC;
        } else {
          const ring = Math.max(Math.abs(c - focusCol), Math.abs(r - focusRow));
          const delayMs = releaseStartTime + ring * P.releaseStagger;
          if (now < delayMs) {
            holdSpring = false;
          } else {
            targetS = 0;
            kS = P.releaseK;
            cS = P.releaseC;
          }
        }

        let sVal = 0;
        if (!reduced) {
          if (holdSpring) {
            const sRes = spring(slatS[idx], slatSVel[idx], targetS, dt, kS, cS, P.mass);
            slatS[idx] = sRes.pos;
            slatSVel[idx] = sRes.vel;
          }
          sVal = clamp(slatS[idx], 0, 1);
        }

        let grow = 1;
        if (!reduced) {
          const distCenter = Math.hypot(c - 4.5, r - 4.5);
          const startMs = distCenter * P.growStagger;
          const slatElapsed = elapsedMs - startMs;
          if (slatElapsed <= 0) grow = 0;
          else if (slatElapsed >= P.growMs) grow = 1;
          else grow = growBez(slatElapsed / P.growMs);
        }

        const sx = (c + 0.5 - 5) * cell;
        const sy = (r + 0.5 - 5) * cell;
        const dx = sx - lx;
        const dy = sy - ly;
        const d = Math.hypot(dx, dy);

        const scaleH = Math.min(P.heightMax, 1 + 0.35 * (1 / (1 + (d / (P.charRadiusFrac * gridSide)) ** 2)));
        const hoverHeight = restH * scaleH;
        const hoverRot = clamp(-P.rotMax, dx * P.rotGain, P.rotMax);

        const isFocus = (c === focusCol && r === focusRow);
        let rot, h, w, fill;

        if (isFocus) {
          rot = hoverRot * (1 - sVal);
          h = hoverHeight * (1 - sVal) + (restH * P.holdHeight) * sVal;
          w = restW * ((1 - sVal) + P.holdWidth * sVal);
          const mult = 1 + (P.holdBright - 1) * sVal;
          const rCol = clamp(Math.round(255 * mult), 0, 255);
          const gCol = clamp(Math.round(181 * mult), 0, 255);
          const bCol = clamp(Math.round(71 * mult), 0, 255);
          fill = `rgb(${rCol},${gCol},${bCol})`;
        } else {
          rot = hoverRot * (1 - sVal) + P.closeRot * sVal;
          h = hoverHeight * (1 - sVal) + restH * sVal;
          w = restW;
          const tFall = clamp((cell * cell) / (d * d + 1), 0, 1);
          const rCol = Math.round(255 - 23 * tFall);
          const gCol = Math.round(255 - 25 * tFall);
          const bCol = Math.round(255 - 30 * tFall);
          const aCol = 0.05 + 0.17 * tFall;
          fill = `rgba(${rCol},${gCol},${bCol},${aCol.toFixed(4)})`;
        }

        if (reduced) {
          rot = 0;
          h = restH;
          w = restW;
          grow = 1;
          if (c === 4 && r === 4) {
            fill = P.amber;
          } else {
            fill = P.slatBase;
          }
        }

        const finalH = h * grow;
        const cx = (c + 0.5) * cell;
        const cy = (r + 0.5) * cell;

        const el = slatElements[idx];
        el.style.left = `${cx.toFixed(2)}px`;
        el.style.top = `${cy.toFixed(2)}px`;
        el.style.width = `${w.toFixed(2)}px`;
        el.style.height = `${finalH.toFixed(2)}px`;
        el.style.transform = `translate(-50%, -50%) rotateY(${rot.toFixed(2)}deg)`;
        el.style.background = fill;
      }
    }

    if (!ready) {
      stage.classList.add('on');
      ready = true;
    }

    animFrameId = requestAnimationFrame(frame);
  }

  let fontReadySettled = false;
  const fontTimeout = setTimeout(() => {
    if (!fontReadySettled) {
      fontReadySettled = true;
      boot.fontWait = false;
    }
  }, 3000);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (!fontReadySettled) {
        fontReadySettled = true;
        clearTimeout(fontTimeout);
        boot.fontWait = false;
      }
    });
  } else {
    clearTimeout(fontTimeout);
    fontReadySettled = true;
    boot.fontWait = false;
  }

  animFrameId = requestAnimationFrame(frame);

  function destroy() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    abortCtrl.abort();
    if (mediaLegacy) {
      mediaReduced.removeListener(onMediaChange);
      mediaFine.removeListener(onMediaChange);
    }
    resizeObs.disconnect();
    stage.remove();
    dropStyles();
  }

  function state() {
    return {
      ready,
      phase,
      fine: finePointer,
      reduced,
      pressing,
      lx,
      ly,
      elapsed: t0 ? performance.now() - t0 : 0,
      cardScale,
      focusCol,
      focusRow,
      nearestCol,
      nearestRow,
      W,
      H,
      gridSide
    };
  }

  return { destroy, state, boot, stage, card };
}
