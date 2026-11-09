# Scale — Jetpack Compose

Add `TickScale.kt` to a Compose module and put Inter Variable at `res/font/inter_variable.ttf`. Labels use `FontFamily.Monospace` at 12sp as a stand-in for JetBrains Mono.

- 24 ticks in a column `min(420dp, 56% of height)` wide by 56dp. Idle 16×2, neighbor 20×2, active 28×2. Length is `scaleX` from the left edge.
- Value domain 0–100. The top of the column is 100, the bottom is 0. `activeIndex = round(value / 100 * 23)`.
- One spring on the value and one per tick length: stiffness 200, damping 24, mass 1, integrated per frame with the same 1/240 s step as web and SwiftUI. The Compose form is `spring(dampingRatio = 0.78f, stiffness = 200f)`.
- The readout is weight 500 with tabular figures. Its vertical center follows the continuous value, then the same spring settles it onto the active tick. Amber is only the active tick.
- No fine pointer: after the reveal, a 1400ms guide runs 0→100→50 with `CubicBezierEasing(0.65f, 0f, 0.35f, 1f)`, then an 8000ms cosine round-trip between 20 and 80. A press drives the spring; on release a 300ms smoothstep returns to the drift.
- Reveal matches the web piece: 40ms center-out stagger, 160ms scale and opacity, number fades 120ms after the last tick. Animator duration scale 0 holds 50 and skips the stagger, guide, and drift.
- Parameters match the web piece (block at the top of the file). Not compiled here.
