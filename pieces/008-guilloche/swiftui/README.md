# Guilloché — SwiftUI

Drop `GuillocheView.swift` into an iOS 17+ target. Bundle **Inter Variable** (the face name is `Inter Variable`) and add `grain.png` from this piece as an image asset named `grain`.

This file is source only. It was not compiled, and it was not run on a device.

- A card of aspect 1.586, width `min(640, 86% of the width)`, face `#121214`, 1pt stroke at 6% white, corner radius 20. Page `#0B0B0C`.
- 36 rings centred at `(0.68W, 0.5H)`. Radius `H·(0.10+0.012i)`. The sample is `p(t) = c + (r + 0.035H·sin(12t+0.18i)) · (1.35 cos t, sin t)` with 360 segments. Strokes are 1pt, snapped to device pixels, scale capped at 2.
- Brightness `b = |cos(φ−θ)|^k · (0.35+0.65·exp(−d²/(2σ²)))`, `θ = lx·70°`, `σ = 0.35W`, `k` rests at 8. Ink mixes `#2A2A2A` toward `#E8E6E1` by `b`, then toward `#FFB547` when `b > 0.9`. 12 brightness buckets. Rebuild after the light moves more than 0.002.
- Rest light `(0.35, 0.40)`, so `lx = −0.30` and `θ = −21°`.
- The pointer spring is stiffness 170, damping 22, mass 1 (`.spring(response: 0.48, dampingFraction: 0.84)`). Press moves `k` from 8 to 24 with stiffness 280, damping 28 (`.spring(response: 0.32, dampingFraction: 0.82)`), and the release keeps velocity.
- No fine pointer: `θ` runs −60° → +50° in 760ms, then +50° → −30° in 640ms, each `timingCurve(0.65, 0, 0.35, 1)`. Drift is `θ = 10° − 40°·cos(2πt/8s)` from that same clock, so the join is −30° with velocity 0. Light y stays 0.45.
- macOS, Mac Catalyst, and an iOS app on a Mac stay at rest. On iPhone and iPad, a connected mouse does too. Otherwise the guide runs, and a hover promotes into pointer follow.
- Entrance fades the card over 160ms. Each ring fades over 300ms, stagger 40ms from the inside, instead of a stroke draw. Type fades over 300ms and rises 4pt after the outer ring. Reduce Motion jumps to rest, fades over 200ms, and does not drift.
- Labels: `LUMEN`, `Guilloché`, `Nº 008`. Grain sits at 3% opacity.
