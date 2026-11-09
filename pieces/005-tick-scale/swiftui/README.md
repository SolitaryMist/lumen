# Scale — SwiftUI

Drop `ScaleView.swift` into an iOS 16+ SwiftUI target and bundle **Inter Variable** (add it to `UIAppFonts`; the name used is `Inter Variable`). Labels use **JetBrains Mono** at 12pt when that face is installed.

- 24 ticks in a column `min(420, 56% of height)` wide by 56pt. Idle 16×2, neighbor 20×2, active 28×2. Length is `scaleEffect` from the leading edge.
- Value domain 0–100. The top of the column is 100, the bottom is 0. `activeIndex = round(value / 100 * 23)`.
- One spring on the value and one per tick length: stiffness 200, damping 24, mass 1, integrated with the same 1/240 s semi-implicit Euler step as web and Compose. The platform form of that motion is `.spring(response: 0.36, dampingFraction: 0.78)`.
- The readout is Inter at weight 500, tabular digits. Its vertical center follows the continuous value, then the same spring settles it onto the active tick, so it never jumps from mark to mark. Amber is only the active tick; the number stays the body color.
- No fine pointer: after the reveal, a 1400ms guide runs 0→100→50 with `timingCurve(0.65, 0, 0.35, 1)`, then an 8000ms cosine round-trip between 20 and 80. A press drives the spring; on release a 300ms smoothstep returns to the drift.
- Reveal: ticks stagger from the center outward, 40ms apart, scale 0.6→1 and opacity over 160ms. The number fades over 120ms after the last tick. Reduce Motion holds 50 with the correct amber tick and skips the stagger, guide, and drift.
- Parameters match the web piece (block at the top of the file). Not compiled here.
