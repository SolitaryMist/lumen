# Ink — Jetpack Compose

Lumen piece 012
Subtitle: A single drop, slowly finding its way.

Source only: not compiled, not run on a device.

## Integration

1. Drop `Ink.kt` into a Compose module (Material 3 for `Text`) and import your app's `R`.
2. Add JetBrains Mono Regular as `res/font/jetbrains_mono_regular.ttf`.
3. Add `grain.png` (128 × 128) as `res/drawable-nodpi/grain.png`; it is tiled at alpha 0.03.
4. Call `Ink(Modifier.fillMaxSize())`. Pass `seed` for a repeatable start.

## How it maps to the web piece

- Native simplification from the spec: CPU stable fluids on a 96 × 64 velocity grid (Jacobi 16, vorticity 18) with a 192 × 128 ink field, stepped on `Dispatchers.Default`, one frame per display frame.
- API 33+: an AGSL `RuntimeShader` does the unsharp edge, edge pooling (0.18 on a small gaussian slope), paper absorption (0.92 + 0.16 · fiber) and colour from the raw ink bitmap. Below 33 the same shading runs on the CPU into an ARGB bitmap, drawn with high-quality filtering.
- Same numbers as `ink.js`: display 1 − e^(−3.0 d), max density 0.92; velocity half-life 1200 ms, ink 9000 ms (3500 ms in auto mode); curl noise 0.06 W/s at k 6 / 13.
- Drop: d = 0.85 (1 − r²)², r = 0.075 W, poured over 180 ms with an ease-out; outward impulse 0.2 as a soft-core source. No satellite dots.
- Edge containment: within 0.06 W of every card edge, the grid velocity and the ink transport both fade to 0 (smoothstep on both axes), so the ink stays on the paper.
- Ink advection: limited MacCormack with RK2 departure points, clamped to ≥ 0.
- Press drops ink at the pointer (350 ms apart). Moving the pointer stirs at pointer velocity × 1.4; a mouse hover stirs too. With no input (auto mode): a drop every 9 s and a slow figure-eight stirrer (force 0.7) that runs for 3.5 s after each drop, then eases to 0 over 1.2 s (smoothstep); the ink half-life is 3.5 s, so the card goes back to near-bare paper. Any pointer input switches to the normal parameters (ink half-life 9 s, stirring unchanged); auto mode resumes 6 s after the last mouse input, 3 s after a finger or pen input.
- When system animations are off (`ANIMATOR_DURATION_SCALE` = 0): one still frame of the fresh drop, no simulation.
- The curl noise here is a smooth value noise (the web uses simplex), scaled once at start to the same 0.06 W/s RMS speed. At this grid size the filaments are softer than on the web; that is the expected cost of the CPU budget.
