# Ink — SwiftUI

A single drop, slowly finding its way.

Lumen piece 012 in SwiftUI.

> **Note:** Source only: not compiled, not run on a device.

## Setup

1. Add `InkView.swift` to an iOS 16+ target (the Metal pipeline is used on iOS 17+).
2. Bundle JetBrains Mono Regular (`JetBrainsMono-Regular`) and list it under `UIAppFonts`.
3. Add `grain.png` (128 × 128) to the asset catalog as `grain`.
4. Use `InkView()`, or `InkView(seed: 12)` for a repeatable start.

## How it maps to the web piece

- iOS 17+ with Metal: the web pipeline as compute kernels (the shader source is compiled at launch) on a 128 grid with Jacobi 16; the ink field is half the card's pixels, at most 1024 wide. 30 frames in a row over 20 ms halve the grid once.
- Otherwise: a CPU stable-fluids solver on a 96 × 64 grid with a 192 × 128 ink field on a background queue, drawn as a bitmap. Its curl noise is a smooth value noise scaled to the same 0.06 W/s RMS speed.
- Same numbers as `ink.js`: display 1 − e^(−3.0 d), max density 0.92, edge pooling 0.18 on a ~2 px gaussian slope, paper absorption 0.92 + 0.16 · fiber (smooth noise, cells about W/24); velocity half-life 1200 ms, ink 9000 ms (3500 ms in auto mode); vorticity 18; curl noise 0.06 W/s at k 6 / 13.
- Drop: d = 0.85 (1 − r²)², r = 0.075 W, poured over 180 ms with an ease-out; outward impulse 0.2 as a soft-core source. No satellite dots.
- Edge containment: within 0.06 W of every card edge, the grid velocity and the ink transport both fade to 0 (smoothstep on both axes), so the ink stays on the paper.
- Ink advection: limited MacCormack with RK2 departure points, clamped to ≥ 0.
- Press drops ink (350 ms apart); dragging stirs at pointer velocity × 1.4; with a mouse or trackpad, hover stirs too. With no input (auto mode): a drop every 9 s and a slow figure-eight stirrer (force 0.7) that runs for 3.5 s after each drop, then eases to 0 over 1.2 s (smoothstep); the ink half-life is 3.5 s, so the card goes back to near-bare paper. Any pointer input switches to the normal parameters (ink half-life 9 s, stirring unchanged); auto mode resumes 6 s after the last input with a mouse or trackpad connected, 3 s otherwise.
- Reduce Motion: one still frame of the fresh drop, no simulation.
- A size change restarts the sim from the fresh drop (the web resamples the fields instead).
