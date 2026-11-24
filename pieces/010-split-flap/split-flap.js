// Lumen 010 · Split Flap
// An airport split-flap board that flips through past Lumen pieces.
// DOM + CSS 3D transforms. Every frame only writes transform, opacity and color.
// All motion is a pure function of time, so a frozen clock gives repeatable frames.

export const P = {
  bg: '#0B0B0C',
  flapTop: '#17171A',
  flapBottom: '#141417',
  ink: '#E8E6E1',
  dim: '#8A8A8E',
  amber: '#FFB547',
  edge: 'rgba(255,255,255,0.04)',
  grainSize: 128,
  grainAlpha: 0.03,

  // layout, in units of w (big flap width)
  wMin: 52, wVw: 0.11, wMax: 132,
  hRatio: 1.42, gapR: 0.08, radiusR: 0.06, fontR: 0.86,
  smallR: 0.5, rowGapR: 0.3,
  portraitCenter: 0.45,
  hingeDev: 2,           // hinge gap, device px, starts on an even row
  capHalf: 0.355,        // Geist cap height 710 / 1000, half of it

  words: [['MESH', '002'], ['WEIGHT', '003'], ['STACK', '004'], ['LENS', '009']],
  cols: 6,
  wordMs: 2000,
  firstWordAt: 200,
  introFade: 160,

  stepMs: 64,
  halfMs: 32,
  fallEase: [0.55, 0, 0.9, 0.4],
  steps: [5, 6, 7, 8, 6, 7],
  numSteps: [5, 6, 7],
  colStagger: 40,
  numDelay: 120,

  // last step only: lands, rebounds to 4deg, settles
  reboundDeg: 4,
  reboundMs: 160,
  reboundEase: [0.34, 1.4, 0.64, 1],
  reboundSpring: { stiffness: 600, damping: 20 },

  perspective: 800,
  topShade: 0.45,
  coverShade: 0.35,
  riseShade: 0.45,

  amberHold: 900,
  amberFade: 400,
  amberEase: [0.4, 0, 0.2, 1],

  hoverSteps: 4,
  hoverGapMs: 320,
  reducedFade: 160,

  labelSize: 12,
  label: 'LUMEN · Split Flap · Nº 010'
};

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ';
const DIGITS = '0123456789';

export function bez(x1, y1, x2, y2) {
  const cx = (t) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
  const cy = (t) => 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 40; i++) {
      const v = cx(t);
      if (Math.abs(v - x) < 1e-7) break;
      if (v < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return cy(t);
  };
}

const fall = bez(...P.fallEase);
const amberEase = bez(...P.amberEase);

// Rebound shape: the part of cubic-bezier(0.34,1.4,0.64,1) above 1,
// stretched over 160ms and scaled so its peak is exactly 4deg.
const reboundShape = (() => {
  const curve = bez(...P.reboundEase);
  let xCross = 0, yPeak = 1;
  for (let i = 1; i <= 2000; i++) {
    const x = i / 2000, y = curve(x);
    if (!xCross && y >= 1) xCross = x;
    if (y > yPeak) yPeak = y;
  }
  return (p) => {
    if (p <= 0 || p >= 1) return 0;
    const y = curve(xCross + p * (1 - xCross));
    return Math.max(0, y - 1) / (yPeak - 1);
  };
})();

export function reboundAngle(ms) {
  return P.reboundDeg * reboundShape(ms / P.reboundMs);
}

export function sequence(target, n, drum) {
  const len = drum.length;
  const idx = drum.indexOf(target);
  const out = [];
  for (let k = 0; k < n; k++) out.push(drum[((idx - n + 1 + k) % len + len) % len]);
  return out;
}

function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const INK = hexRgb(P.ink), AMBER = hexRgb(P.amber);
function mixColor(a) {
  const c = INK.map((v, i) => Math.round(v + (AMBER[i] - v) * a));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

let styleRefs = 0;
let styleEl = null;
function injectStyles(grainUrl) {
  if (styleRefs++ > 0) return;
  styleEl = document.createElement('style');
  styleEl.textContent = `
.sf-stage{position:relative;width:100%;height:100%;overflow:hidden;background:${P.bg};visibility:hidden;touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.sf-stage.on{visibility:visible}
.sf-board{position:absolute;left:0;top:0;opacity:0}
.sf-cell{position:absolute;perspective:${P.perspective}px}
.sf-half{position:absolute;left:0;width:100%;overflow:hidden;backface-visibility:hidden;-webkit-backface-visibility:hidden;transform-style:flat}
.sf-half::before{content:"";position:absolute;inset:0;background-image:url("${grainUrl}");background-size:${P.grainSize}px ${P.grainSize}px;opacity:${P.grainAlpha};pointer-events:none}
.sf-t{background:${P.flapTop};box-shadow:inset 0 1px 0 ${P.edge}}
.sf-b{background:${P.flapBottom}}
.sf-flap{visibility:hidden;will-change:transform}
.sf-g{position:absolute;left:0;width:100%;text-align:center;line-height:1em;white-space:pre;font-family:Geist,ui-sans-serif,system-ui,sans-serif;font-weight:600;letter-spacing:0;text-transform:uppercase;color:${P.ink};font-kerning:none}
.sf-g2{opacity:0}
.sf-shade{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none}
.sf-cover{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,${P.coverShade}),rgba(0,0,0,0));opacity:0;pointer-events:none}
.sf-label{position:absolute;font:400 ${P.labelSize}px/1 "JetBrains Mono",ui-monospace,monospace;color:${P.dim};white-space:pre;letter-spacing:0}
`;
  document.head.appendChild(styleEl);
}
function removeStyles() {
  if (--styleRefs > 0) return;
  if (styleEl) styleEl.remove();
  styleEl = null;
}

function el(cls, parent) {
  const e = document.createElement('div');
  e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

// write-through cache so idle cells cost nothing per frame
function setter() {
  const cache = new Map();
  return (node, key, val) => {
    let m = cache.get(node);
    if (!m) { m = {}; cache.set(node, m); }
    if (m[key] === val) return;
    m[key] = val;
    if (key === 'text') node.textContent = val;
    else if (key === 'vis') node.style.visibility = val;
    else node.style[key] = val;
  };
}

function makeHalf(cell, kind, flap) {
  const half = el(`sf-half ${kind === 't' ? 'sf-t' : 'sf-b'}${flap ? ' sf-flap' : ''}`, cell);
  const g = el('sf-g', half);
  const g2 = el('sf-g sf-g2', half);
  const shade = flap ? el('sf-shade', half) : null;
  const cover = !flap && kind === 'b' ? el('sf-cover', half) : null;
  return { half, g, g2, shade, cover };
}

function makeCell(board, drum, isLetter, index) {
  const node = el('sf-cell', board);
  node.dataset.col = String(index);
  const cell = {
    node, drum, isLetter, index,
    sTop: makeHalf(node, 't', false),
    sBot: makeHalf(node, 'b', false),
    fTop: makeHalf(node, 't', true),
    fBot: makeHalf(node, 'b', true),
    char0: ' ',      // character before steps[0]
    steps: [],       // { ch, t0, last }
    target: ' ',
    lastHover: -1e9
  };
  if (!isLetter) cell.char0 = '0';
  cell.target = cell.char0;
  return cell;
}

export function mountSplitFlap(root, opts = {}) {
  const grainUrl = opts.grainUrl || new URL('./grain.png', import.meta.url).href;
  injectStyles(grainUrl);

  const stage = el('sf-stage', root);
  stage.setAttribute('role', 'img');
  stage.setAttribute('aria-label', 'Split flap board flipping through Lumen pieces. Press to show the next one.');
  const board = el('sf-board', stage);
  const label = el('sf-label', board);
  label.textContent = P.label;

  const letters = [];
  for (let i = 0; i < P.cols; i++) letters.push(makeCell(board, LETTERS, true, i));
  const nums = [];
  for (let i = 0; i < 3; i++) nums.push(makeCell(board, DIGITS, false, i));
  const cells = letters.concat(nums);

  const set = setter();
  const reducedQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fineQ = window.matchMedia('(hover: hover) and (pointer: fine)');
  let reduced = reducedQ.matches;
  let fine = fineQ.matches;

  let geo = null;
  let raf = 0;
  let t0 = null;
  let now = 0;
  let wordIndex = -1;
  let nextWordAt = P.firstWordAt;
  let amber = null; // { cell, step }
  let destroyed = false;

  // ---------- layout ----------
  function layout() {
    const W = root.clientWidth, H = root.clientHeight;
    if (!W || !H) return;
    const dpr = window.devicePixelRatio || 1;
    const even = (dev) => Math.round(dev / 2) * 2;
    const evCss = (css) => even(css * dpr);
    let w = Math.min(P.wMax, Math.max(P.wMin, P.wVw * W));
    if (opts.og) w = Math.min(W * 0.142, H * 0.24);
    const hinge = (hd) => ((hd / 2) % 2 === 0 ? hd + 2 : hd); // gap starts on an even row
    const big = {
      w: evCss(w), h: hinge(evCss(P.hRatio * w)), gap: evCss(P.gapR * w),
      r: evCss(P.radiusR * w), f: evCss(P.fontR * w)
    };
    const sw = P.smallR * w;
    const small = {
      w: evCss(sw), h: hinge(evCss(P.hRatio * sw)), gap: evCss(P.gapR * sw),
      r: evCss(P.radiusR * sw), f: evCss(P.fontR * sw)
    };
    const rowGap = evCss(P.rowGapR * w);
    const boardW = P.cols * big.w + (P.cols - 1) * big.gap;
    const boardH = big.h + rowGap + small.h;
    const cy = H > W ? P.portraitCenter : 0.5;
    const left = even((W * dpr - boardW) / 2);
    const top = even(cy * H * dpr - boardH / 2);
    geo = { dpr, big, small, rowGap, boardW, boardH, left, top, W, H };

    const px = (d) => `${d / dpr}px`;
    board.style.left = px(left);
    board.style.top = px(top);
    board.style.width = px(boardW);
    board.style.height = px(boardH);

    const place = (cell, s, x, y) => {
      const n = cell.node.style;
      n.left = px(x); n.top = px(y); n.width = px(s.w); n.height = px(s.h);
      n.perspectiveOrigin = '50% 50%';
      const halfH = s.h / 2 - P.hingeDev / 2;
      const botTop = s.h / 2 + P.hingeDev / 2;
      const glyphTop = s.h / 2 - s.f / 2; // with line-height 1em the cap middle sits on the hinge (Geist metrics)
      for (const part of [cell.sTop, cell.fTop]) {
        const h = part.half.style;
        h.top = '0px'; h.height = px(halfH);
        h.borderRadius = `${px(s.r)} ${px(s.r)} 0 0`;
        h.transformOrigin = '50% 100%';
        for (const g of [part.g, part.g2]) { g.style.top = px(glyphTop); g.style.fontSize = px(s.f); }
      }
      for (const part of [cell.sBot, cell.fBot]) {
        const h = part.half.style;
        h.top = px(botTop); h.height = px(halfH);
        h.borderRadius = `0 0 ${px(s.r)} ${px(s.r)}`;
        h.transformOrigin = '50% 0%';
        for (const g of [part.g, part.g2]) { g.style.top = px(glyphTop - botTop); g.style.fontSize = px(s.f); }
      }
      // capital middle correction from font metrics: baseline = top + 0.855em, cap middle = baseline - 0.355em
      const shift = (0.855 - P.capHalf - 0.5) * s.f; // = 0 for Geist
      if (shift) for (const part of [cell.sTop, cell.fTop, cell.sBot, cell.fBot]) part.g.style.transform = part.g2.style.transform = `translateY(${px(shift)})`;
    };
    letters.forEach((c, i) => place(c, big, i * (big.w + big.gap), 0));
    nums.forEach((c, i) => place(c, small, i * (small.w + small.gap), big.h + rowGap));
    label.style.left = '0px';
    label.style.top = px(-rowGap - evCss(P.labelSize));
  }

  // ---------- scheduling ----------
  function lastStep(cell) { return cell.steps.length ? cell.steps[cell.steps.length - 1] : null; }

  function schedule(cell, chars, start, mark) {
    // keep steps that already started; the new ones queue after them
    cell.steps = cell.steps.filter((s) => s.t0 <= now);
    const prev = lastStep(cell);
    let t = start;
    if (prev) t = Math.max(t, prev.t0 + P.stepMs);
    if (reduced) chars = chars.slice(-1);
    const added = chars.map((ch, k) => ({ ch, t0: t + k * P.stepMs, last: k === chars.length - 1, reduced }));
    cell.steps.push(...added);
    cell.target = chars[chars.length - 1];
    return added[added.length - 1];
  }

  function stepEnd(s) { return s.t0 + (s.reduced ? P.reducedFade : P.stepMs); }

  function showWord(idx, T) {
    wordIndex = idx;
    const [word, no] = P.words[idx];
    amber = null;
    let last = null, lastEnd = -1;
    letters.forEach((cell, i) => {
      const target = word[i] || ' ';
      if (target === ' ' && cell.target === ' ') return;
      const s = schedule(cell, sequence(target, P.steps[i], LETTERS), T + i * P.colStagger);
      if (target !== ' ' && stepEnd(s) >= lastEnd) { lastEnd = stepEnd(s); last = { cell, step: s }; }
    });
    nums.forEach((cell, i) => {
      schedule(cell, sequence(no[i], P.numSteps[i], DIGITS), T + P.numDelay + i * P.colStagger);
    });
    amber = last;
    nextWordAt = T + P.wordMs;
  }

  function nextWord(T) { showWord((wordIndex + 1) % P.words.length, T); }

  // ---------- render ----------
  function paintHalf(part, ch, color) {
    set(part.g, 'text', ch);
    set(part.g, 'color', color);
  }

  function amberMix(cell, t) {
    if (!amber || amber.cell !== cell) return 0;
    const s = amber.step;
    if (lastStep(cell) !== s && cell.steps.some((x) => x.t0 > s.t0 && x.t0 <= t)) return 0;
    const land = stepEnd(s);
    const dt = t - land;
    if (dt < 0) return 0;
    if (dt <= P.amberHold) return 1;
    const p = (dt - P.amberHold) / P.amberFade;
    return p >= 1 ? 0 : 1 - amberEase(p);
  }

  function renderCell(cell, t) {
    // drop steps that are fully behind us
    while (cell.steps.length > 1 && t >= cell.steps[1].t0) cell.char0 = cell.steps.shift().ch;
    let k = -1;
    for (let i = cell.steps.length - 1; i >= 0; i--) if (cell.steps[i].t0 <= t) { k = i; break; }
    const a = cell.isLetter ? amberMix(cell, t) : 0;
    const color = a > 0 ? mixColor(a) : P.ink;
    const hide = (part) => set(part.half, 'vis', 'hidden');
    const show = (part) => set(part.half, 'vis', 'visible');
    const g2off = () => {
      for (const part of [cell.sTop, cell.sBot]) set(part.g2, 'opacity', '0');
      set(cell.sTop.g, 'opacity', '1'); set(cell.sBot.g, 'opacity', '1');
    };

    if (k < 0) {
      const ch = cell.char0;
      paintHalf(cell.sTop, ch, color); paintHalf(cell.sBot, ch, color);
      set(cell.sBot.cover, 'opacity', '0');
      hide(cell.fTop); hide(cell.fBot); g2off();
      return;
    }
    const s = cell.steps[k];
    const from = k > 0 ? cell.steps[k - 1].ch : cell.char0;
    const local = t - s.t0;

    if (s.reduced) {
      hide(cell.fTop); hide(cell.fBot);
      set(cell.sBot.cover, 'opacity', '0');
      const p = Math.min(1, local / P.reducedFade);
      for (const part of [cell.sTop, cell.sBot]) {
        set(part.g, 'text', from); set(part.g, 'color', P.ink); set(part.g, 'opacity', String(1 - p));
        set(part.g2, 'text', s.ch); set(part.g2, 'color', color); set(part.g2, 'opacity', String(p));
      }
      return;
    }
    g2off();

    if (local < P.stepMs) {
      paintHalf(cell.sTop, s.ch, P.ink);
      paintHalf(cell.sBot, from, P.ink);
      if (local < P.halfMs) {
        const e = fall(local / P.halfMs);
        show(cell.fTop); hide(cell.fBot);
        paintHalf(cell.fTop, from, P.ink);
        set(cell.fTop.half, 'transform', `rotateX(${(-90 * e).toFixed(3)}deg)`);
        set(cell.fTop.shade, 'opacity', (P.topShade * e).toFixed(4));
        set(cell.sBot.cover, 'opacity', e.toFixed(4));
      } else {
        const e = fall((local - P.halfMs) / P.halfMs);
        hide(cell.fTop); show(cell.fBot);
        paintHalf(cell.fBot, s.ch, P.ink);
        set(cell.fBot.half, 'transform', `rotateX(${(90 * (1 - e)).toFixed(3)}deg)`);
        set(cell.fBot.shade, 'opacity', (P.riseShade * (1 - e)).toFixed(4));
        set(cell.sBot.cover, 'opacity', (1 - e).toFixed(4));
      }
      return;
    }

    // settled on s.ch
    paintHalf(cell.sTop, s.ch, color);
    paintHalf(cell.sBot, s.ch, color);
    set(cell.sBot.cover, 'opacity', '0');
    hide(cell.fTop);
    const since = local - P.stepMs;
    if (s.last && since < P.reboundMs) {
      show(cell.fBot);
      paintHalf(cell.fBot, s.ch, color);
      set(cell.fBot.half, 'transform', `rotateX(${reboundAngle(since).toFixed(3)}deg)`);
      set(cell.fBot.shade, 'opacity', '0');
    } else {
      hide(cell.fBot);
    }
  }

  function frame(ts) {
    raf = 0;
    if (destroyed) return;
    if (t0 === null) t0 = ts;
    now = ts - t0;
    set(board, 'opacity', String(Math.min(1, now / P.introFade)));
    while (now >= nextWordAt) nextWord(nextWordAt);
    for (const c of cells) renderCell(c, now);
    if (!stage.classList.contains('on')) stage.classList.add('on');
    raf = requestAnimationFrame(frame);
  }

  // ---------- input ----------
  function onDown(e) {
    if (e.button !== undefined && e.button > 0) return;
    if (t0 === null) return;
    nextWord(now);
  }

  function onEnter(e) {
    if (!fine || reduced || t0 === null || e.pointerType !== 'mouse') return;
    const col = Number(e.currentTarget.dataset.col);
    const cell = letters[col];
    if (!cell) return;
    const ls = lastStep(cell);
    if (ls && now < stepEnd(ls)) return;                // still flipping
    if (now - cell.lastHover < P.hoverGapMs) return;
    cell.lastHover = now;
    const back = cell.target;
    const pool = LETTERS.replace(' ', '');
    const chars = [];
    let prev = back;
    for (let i = 0; i < P.hoverSteps; i++) {
      let ch;
      do { ch = pool[Math.floor(Math.random() * pool.length)]; } while (ch === prev || ch === back);
      chars.push(ch); prev = ch;
    }
    chars.push(back);
    if (amber && amber.cell === cell) amber = null;
    schedule(cell, chars, now);
  }

  const onReduced = () => { reduced = reducedQ.matches; };
  const onFine = () => { fine = fineQ.matches; };
  const listen = (q, fn) => (q.addEventListener ? q.addEventListener('change', fn) : q.addListener(fn));
  const unlisten = (q, fn) => (q.removeEventListener ? q.removeEventListener('change', fn) : q.removeListener(fn));

  stage.addEventListener('pointerdown', onDown);
  letters.forEach((c) => c.node.addEventListener('pointerenter', onEnter));
  listen(reducedQ, onReduced);
  listen(fineQ, onFine);
  const ro = new ResizeObserver(() => layout());
  ro.observe(root);
  layout();

  const fontsReady = (opts.fonts || Promise.all([
    document.fonts.load(`600 64px Geist`, 'MESHWEIGHT0123'),
    document.fonts.load(`400 12px "JetBrains Mono"`, P.label)
  ])).catch(() => {}).then(() => document.fonts.ready).then(() => {
    if (destroyed) return;
    layout();
    raf = requestAnimationFrame(frame);
  });

  return {
    stage,
    fontsReady,
    next() { if (t0 !== null) nextWord(now); },
    state() {
      return {
        started: t0 !== null, now, word: wordIndex >= 0 ? P.words[wordIndex][0] : null,
        reduced, fine, geo,
        cells: cells.map((c) => ({ target: c.target, pending: c.steps.filter((s) => stepEnd(s) + (s.last ? P.reboundMs : 0) > now).length })),
        amber: amber ? { col: amber.cell.index, mix: amberMix(amber.cell, now) } : null
      };
    },
    destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      stage.removeEventListener('pointerdown', onDown);
      letters.forEach((c) => c.node.removeEventListener('pointerenter', onEnter));
      unlisten(reducedQ, onReduced);
      unlisten(fineQ, onFine);
      ro.disconnect();
      stage.remove();
      removeStyles();
    }
  };
}
