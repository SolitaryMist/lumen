# Magnetic rail — Jetpack Compose

Add `MagneticRail.kt` to a Compose module and put Inter Variable at `res/font/inter_variable.ttf`.

- Five items — Rim, Mesh, Weight, Stack, Scale — in a 328dp row. Slots are 40dp and centers are 72dp apart. Scale is `scaleX` / `scaleY` from the bottom, so the label baseline does not move.
- Scale is `1 + 0.5 * exp(-d² / (2 σ²))` with σ = 56. The nearest item also lifts by `4 * hot * (scale - 1) / 0.5` pixels. Peak scale is 1.5.
- Scale and highlight use stiffness 280, damping 28, mass 0.1. The amber bar slides with stiffness 220, damping 26, mass 1. A press springs the magnet to that center with stiffness 320, damping 30, mass 1. Same 1/240 s step as web and SwiftUI. Compose form: `spring(dampingRatio = 0.82f, stiffness = 280f)` and, for the bar, `spring(dampingRatio = 0.80f, stiffness = 220f)`. The frame loop is the shared integrator.
- The bar is 2dp tall, amber `#FFB547` only, width equal to the nearest item's current visual width, radius 1dp.
- Icons are stroked paths at 1.5dp: a circle, a 3×3 set of rings, three vertical bars, three rounded rectangles, five short ticks. No system icons, no fill.
- No fine pointer: after the 760ms entrance, a 1400ms guide runs normalized x from 0 to 1 with `CubicBezierEasing(0.45f, 0f, 0.55f, 1f)`. Drift is `0.5 + 0.5·cos(ωt)` over 8000ms, starting when the guide ends, so it sits at the right end with zero velocity and then moves left.
- A connected mouse or touchpad (`SOURCE_MOUSE`, `SOURCE_MOUSE_RELATIVE`, or `SOURCE_TOUCHPAD`) is detected at launch and rests on the middle item. Leaving the rail fades the bar over 200ms and returns every scale to 1. Entering again fades the bar in over 200ms from the pointer position.
- Entrance matches the web piece: 160ms stage opacity, 60ms stagger, scales from 0.88, bar hidden until 760ms. Animator duration scale 0 holds every scale at 1 with the bar under the middle item.
- Title is `clamp(28dp, 8% of width, 40dp)` with tracking −0.035em, 48dp above the icon row. Rail width is `min(560dp, 88% of width)`.
- Parameters match the web piece (block at the top of the file). Not compiled here.
