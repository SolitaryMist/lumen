# Dither Light — Jetpack Compose

Add `DitherLight.kt` to a Compose module and put Inter Variable at `res/font/inter_variable.ttf`.

- A centred sphere, diameter `min(600dp, 62% of height, 84% of width)`. No ground and no shadow. Ink is only `#E8E6E1` on `#0B0B0C`, except the specular patch, which is `#FFB547` where the Blinn highlight is above 0.55.
- API 33 and later draw it with an AGSL `RuntimeShader`. The shader is the web fragment shader: 8×8 Bayer, one sample at the centre of each cell, filled squares. Cell side is `2·round(2·dpr)` device pixels, with dpr capped at 2, aligned to device pixels. A press cross-fades that cell with `2·round(dpr)` over 240ms (`CubicBezierEasing(0.2, 0.8, 0.2, 1)`) and releases over 320ms (`CubicBezierEasing(0.4, 0, 0.2, 1)`). Cells stay integers.
- Older APIs draw a smooth radial-gradient sphere plus a small amber highlight. No dither.
- Light is `normalize(lx, ly, 0.9)`, y positive downward. `lum = 0.06 + 0.94·max(0, N·L) · smoothstep(-0.05, 0.25, N·L)`. Specular exponent 40.
- Rest pose is `(0.35, -0.45)`. The pointer offset is divided by the radius and clamped to length 1.2, then sprung with stiffness 170, damping 22, mass 1 (`spring(dampingRatio = 0.84, stiffness = 170)`). The frame loop is that integrator.
- No fine pointer: `lx` runs 0→0.6 over 1400ms with `CubicBezierEasing(0.45, 0, 0.55, 1)` and `ly` stays -0.35. Drift is `0.6·cos(ωt)` over 8000ms, starting when the guide ends, so it sits at +0.6 with zero velocity. After a drag, the light waits 2s, eases for 600ms to the nearer of ±0.6, then drifts from that end.
- A connected mouse or touchpad (`SOURCE_MOUSE`, `SOURCE_MOUSE_RELATIVE`, or `SOURCE_TOUCHPAD`) rests at the rest pose. A mouse or stylus hover promotes into pointer-follow. Animator duration scale 0 keeps the light at rest, skips the brightness growth and the drift, and only fades opacity over 160ms. A press then switches cell size immediately.
- Entrance matches the web piece: 160ms opacity, brightness over 600ms, title waits 120ms then fades and rises 4dp over 300ms.
- Readout is azimuth and elevation in degrees, 13sp Inter Variable, tabular figures, `#8A8A8A`, fixed-width so the marks do not shift.
- Parameters match the web piece (block at the top of the file). Not compiled here.
