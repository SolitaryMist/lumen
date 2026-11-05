# Dusk — Jetpack Compose

Open `DuskMesh.kt` in an Android Compose module. Parameters mirror the web piece (`DuskParams`).

- API 33+: AGSL `RuntimeShader` (same logic as the web shader); lower: layered `radialGradient` brushes, breathing only
- Drag spring: stiffness 120 / dampingRatio 0.91, max ±12% of short side
- Drift: 6% of short side, periods 14/16/18/20/22 s
- Grain: copy `../grain.png` (256px tile) to `res/drawable/grain.png`, 3% opacity
- Animator duration scale 0: static frame, drag follows directly
