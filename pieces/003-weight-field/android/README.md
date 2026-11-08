# Weight Field — Jetpack Compose

Add `WeightField.kt` to a Compose module and put Inter Variable at `res/font/inter_variable.ttf`.

- API 26+: `FontVariation.Settings(FontVariation.weight(w))`, weight quantised to steps of 25 with cached `FontFamily` objects (rebuilding a font every frame is expensive).
- API < 26: two static weights (200 / 700) crossfaded by opacity.
- Each letter sits in a fixed cell (its width at wght 900), so the row never shifts.
- Spring: stiffness 170, damping 22, mass 1 (`dampingRatio = 22 / (2·√170) ≈ 0.844f`), integrated per frame.
- Reduced motion (animator duration scale 0): no tour, no springs, 200ms linear weight change, intro is fade only.
- Parameters match the web piece one-to-one (see the block at the top of the file).
