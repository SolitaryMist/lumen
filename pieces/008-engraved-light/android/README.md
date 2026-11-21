# Engraved Light — Jetpack Compose

Add `EngravedLight.kt` to a Compose module. Put Inter Variable at `res/font/inter_variable.ttf` and the piece's `grain.png` at `res/drawable/grain.png`.

This file is source only. It was not compiled, and it was not run on a device.

- A card of aspect 1.586, width `min(640dp, 86% of the view)`, face `#121214`, 1dp stroke at 6% white, corner radius 20. Page `#0B0B0C`.
- 36 rings centred at `(0.68W, 0.5H)`. `Canvas` `drawPath` uses 360 segments and 12 brightness buckets. Strokes are 1dp, snapped with density capped at 2.
- Brightness matches the web piece. Ink is `#2A2A2A` through `#E8E6E1`, and `#FFB547` only once `b > 0.9`. Lighting rebuilds after the light point moves more than 0.002.
- Rest light is `(0.35, 0.40)`, so `lx = −0.30` and `θ = −21°`.
- Light spring: stiffness 170, damping 22, mass 1. Press spring: stiffness 280, damping 28, mass 1, `k` from 8 to 24, release keeps velocity. The frame loop is that integrator.
- No fine pointer: `θ` runs −60° → +50° in 760ms, then +50° → −30° in 640ms, each `CubicBezierEasing(0.65, 0, 0.35, 1)`. Drift is `θ = 10° − 40°·cos(2πt/8000ms)` from the same clock, joined at −30° with velocity 0. Light y stays 0.45.
- `SOURCE_MOUSE` or `SOURCE_TOUCHPAD` at launch stays at rest. A mouse or stylus hover promotes into pointer follow. Animator duration scale 0 keeps the rest pose, fades over 200ms, and does not drift.
- Entrance fades the card over 160ms. Each ring fades over 300ms, stagger 40ms, instead of a stroke draw. Type fades over 300ms and rises 4dp after the outer ring.
- Labels: `LUMEN`, `Engraved Light`, `Nº 008`. The grain image is static at 3% opacity.
