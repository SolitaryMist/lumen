# Scale — Jetpack Compose

Add `TickScale.kt` to a Compose module and put Inter Variable at `res/font/inter_variable.ttf`. Labels use `FontFamily.Monospace` at 12sp as a stand-in for JetBrains Mono.

- 24 ticks in a column 56dp wide. The pitch is `floor(targetPx / 23)` whole pixels, with the target `min(600dp, 62% of height)`, and the column is that pitch times 23, so every gap matches. Idle 16×2, neighbor 20×2, active 28×2. Length is `scaleX` from the left edge. The amber tick's drawn length is `max(its spring length, the longest other tick)`.
- Value domain 0–100. The top of the column is 100, the bottom is 0. `activeIndex = round(value / 100 * 23)`.
- The value spring, and a tick that is shrinking, use stiffness 200, damping 24, mass 1. A tick that is growing uses stiffness 320, damping 30, mass 1. Same 1/240 s step as web and SwiftUI. Compose form: `spring(dampingRatio = 0.78f, stiffness = 200f)` and, for a growing length, `spring(dampingRatio = 0.84f, stiffness = 320f)`.
- The readout is weight 500, size `clamp(56dp, 14% of width, 88dp)`, with tabular figures. Its vertical center follows the continuous value, then the same spring settles it onto the active tick. Amber is only the active tick.
- No fine pointer: after the reveal, a 1400ms guide runs 0→100→20. The first leg is 760ms and the second is 640ms, each `CubicBezierEasing(0.65f, 0f, 0.35f, 1f)`. Drift is `50 − 30·cos(ωt)` over 8000ms, starting when the scan ends, so it sits at 20 with zero velocity and turns upward. A press drives the spring; on release a 300ms smoothstep returns to the drift.
- A connected mouse or touchpad (`SOURCE_MOUSE`, `SOURCE_MOUSE_RELATIVE`, or `SOURCE_TOUCHPAD`) is detected at launch and starts at 50 in spring mode, so the guide does not run before the first hover.
- Reveal matches the web piece: 40ms center-out stagger, 160ms scale and opacity, number fades 120ms after the last tick. Animator duration scale 0 holds 50 and skips the stagger, guide, and drift.
- Parameters match the web piece (block at the top of the file). Not compiled here.
