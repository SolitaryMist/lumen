# Split Flap — Jetpack Compose

Lumen piece 010
Subtitle: Every letter falls into place.

Source only: not compiled, not run on a device.

## Integration

1. Drop `SplitFlap.kt` into a Compose module and import your app's `R`.
2. Add Geist SemiBold as `res/font/geist_semibold.ttf` and JetBrains Mono Regular as `res/font/jetbrains_mono_regular.ttf`.
3. Add `grain.png` (128 × 128) as `res/drawable-nodpi/grain.png`. It is tiled at 128.dp, opacity 0.03.
4. Call `SplitFlap(Modifier.fillMaxSize())`.

## How it maps to the web piece

- Same numbers as `split-flap.js`: 64ms steps, 32ms per half on `cubic-bezier(0.55,0,0.9,0.4)`, column steps 5/6/7/8/6/7, 40ms stagger, number row 120ms later, 2000ms per word, 4deg rebound over 160ms on the last step.
- Leaves use `graphicsLayer { rotationX; transformOrigin }` with `cameraDistance = 12 * density`. The top leaf pivots on its bottom edge, the bottom leaf on its top edge. The perspective strength still needs a side-by-side visual check against web.
- Sizes snap to even device pixels; the 2 px hinge starts on an even row. The glyph's cap middle sits on the hinge.
- A mouse pointer moving into a column flips it 4 random steps, once per 320ms per column. Press shows the next word.
- When system animations are off (`ANIMATOR_DURATION_SCALE` = 0) the board crossfades over 160ms and hover flips are off.
