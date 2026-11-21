# Light Grille — Jetpack Compose

A Jetpack Compose implementation of Lumen Piece 009, "Light Grille".

> **Source only:** This file was not compiled, and it was not run on a device.

## Integration & Assets

1. Add `LightGrille.kt` to your project package `lumen.lightgrille`.
2. (Optional) Place the Geist font at `res/font/geist_regular.ttf`. If omitted, standard `FontFamily.SansSerif` will be used as a fallback.
3. (Optional) Place `grain.png` at `res/drawable/grain.png` (128.dp tileable grain). If omitted, the background container operates cleanly without grain tiling.

## Key Numerical Parameters

- **Card Aspect Ratio**: 3:4 aspect ratio, width `min(420.dp, 86% of container)`, corner radius `20.dp`, border `1.dp` at `rgba(255,255,255,0.06)`.
- **Louvre Grille**: 10×10 grid centered in card, side = 66% of card width. Rest slat width = 2.8% grid side, rest slat height = 5.0% grid side, corner radius `1.dp`.
- **Hover Physics**:
  - Light follow spring: Stiffness $k = 260$, damping $c = 24$, mass $m = 1$.
  - Height scaling: $1 + 0.35 \times \frac{1}{1 + (d / 0.22S)^2}$, capped at $1.35$.
  - Y Rotation projection: $\text{clamp}(-25^\circ, dx \times 0.3^\circ, 25^\circ)$.
- **Hold & Release Interaction**:
  - Press-and-hold compresses card scale to 0.98.
  - Nearest focus slat stays at 0° Y rotation, scales height by 150%, width by 80%, and brightens to amber.
  - The remaining 99 slats flip closed to +75° Y using hold spring ($k = 420$, $c = 28$).
  - Release reopens slats using release spring ($k = 300$, $c = 20$) staggered by Chebyshev distance $r \times 18\text{ms}$.
- **Intro & Motion**:
  - Card opacity linear fade: 160ms.
  - Slat grow animation: 600ms cubic bezier $(0.16, 1.0, 0.3, 1.0)$ with radial delay $12\text{ms} \times \text{hypot}(c - 4.5, r - 4.5)$.
  - Automated guide path: starts at 760ms, duration 520ms from $(-50, +35)$ to $(+50, -35)$ in grid coordinates.
  - Drift motion: $50 \cos(2\pi t / 8000), -35 \cos(2\pi t / 8000)$ after 1280ms.
- **Reduced Motion**: If system animator duration scale is 0, static 200ms fade is rendered with light static at $(0,0)$ and slat (4,4) fixed amber without interactive physics or drift.
