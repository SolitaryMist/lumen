# Rim Trace — Jetpack Compose

Open `RimTrace.kt` in an Android Compose module. Parameters mirror the web piece (`RimTraceParams`).

- Magnet spring: stiffness 180 / damping 22
- Press spring: stiffness 120 / damping 20
- Rim drawn with `PathMeasure` segment + translucent thick stroke / `drawCircle` glow (blur downgrade)
- Tour: 8000ms / lap, `CubicBezierEasing(0.65, 0, 0.35, 1)`
