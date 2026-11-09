# Scale — SwiftUI

Drop `ScaleView.swift` into an iOS 16+ SwiftUI target and bundle **Inter Variable** (add it to `UIAppFonts`; the name used is `Inter Variable`). Labels use **JetBrains Mono** at 12pt when that face is installed.

- 24 ticks in a column 56pt wide. The pitch is `floor(min(600, 62% of height) / 23)` whole points and the column is that pitch times 23, so every gap matches. Idle 16×2, neighbor 20×2, active 28×2. Length is `scaleEffect` from the leading edge. The amber tick's drawn length is `max(its spring length, the longest other tick)`.
- Value domain 0–100. The top of the column is 100, the bottom is 0. `activeIndex = round(value / 100 * 23)`.
- The value spring, and a tick that is shrinking, use stiffness 200, damping 24, mass 1. A tick that is growing uses stiffness 320, damping 30, mass 1. Same 1/240 s semi-implicit Euler step as web and Compose. Platform form: `.spring(response: 0.36, dampingFraction: 0.78)` and, for a growing length, `.spring(response: 0.35, dampingFraction: 0.84)`.
- The readout is Inter at weight 500, size `clamp(56, 14% of width, 88)`, tabular digits. Its vertical center follows the continuous value, then the same spring settles it onto the active tick, so it never jumps from mark to mark. Amber is only the active tick; the number stays the body color.
- No fine pointer: after the reveal, a 1400ms guide runs 0→100→20. The first leg is 760ms and the second is 640ms, each `timingCurve(0.65, 0, 0.35, 1)`. Drift is `50 − 30·cos(ωt)` over 8000ms, starting when the scan ends, so it sits at 20 with zero velocity and turns upward. A press drives the spring; on release a 300ms smoothstep returns to the drift.
- macOS, Mac Catalyst, and iPad (pointer support) are detected at launch and start at 50 in spring mode, so the guide does not run before the first hover.
- Reveal: ticks stagger from the center outward, 40ms apart, scale 0.6→1 and opacity over 160ms. The number fades over 120ms after the last tick. Reduce Motion holds 50 with the correct amber tick and skips the stagger, guide, and drift.
- Parameters match the web piece (block at the top of the file). Not compiled here.
