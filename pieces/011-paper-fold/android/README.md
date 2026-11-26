# Paper Fold — Jetpack Compose

Lumen piece 011
Subtitle: Every crease catches the light.

Source only: not compiled, not run on a device.

## Integration

1. Drop `PaperFold.kt` into a Compose module and import your app's `R`.
2. Add Geist SemiBold as `res/font/geist_semibold.ttf` and JetBrains Mono Regular as `res/font/jetbrains_mono_regular.ttf`.
3. Add `grain.png` (128 × 128) as `res/drawable-nodpi/grain.png`; it is tiled at 128.dp, alpha 0.03.
4. Call `PaperFold(Modifier.fillMaxSize())`.

## How it maps to the web piece

- Same numbers as `paper-fold.js`: panel angle f·72°, facing shade ×(1−0.10f) / ×(1−0.42f), valley shadow 24dp at 0.18f, 1px peak highlight at 0.5f.
- Each panel uses `graphicsLayer { rotationY; transformOrigin }` on its valley crease edge with `cameraDistance = 1400 * density`. Panel x comes from f so the joins meet, and the card is scaled so its projected width is W·cosθ.
- Shadow: blurred ellipse on API 31+, radial-gradient ellipse below that.
- At launch a connected mouse or trackpad means rest at f = 0.45 waiting for hover; hover switches to pointer mode. Otherwise the guide (0.45 → 0.85 → 0.2) runs, then the 8s drift; a horizontal drag drives f and springs back to the drift.
- When system animations are off (`ANIMATOR_DURATION_SCALE` = 0): fixed f = 0.45, no follow, no drift.
- The perspective strength and the rotation sign still need a visual check against web.
