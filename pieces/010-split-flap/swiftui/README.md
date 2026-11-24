# Split Flap — SwiftUI

Every letter falls into place.

Lumen piece 010 in SwiftUI.

> **Note:** Source only: not compiled, not run on a device.

## Setup

1. Add `SplitFlapView.swift` to an iOS 17+ target (it uses `UnevenRoundedRectangle` and `onContinuousHover`).
2. Bundle `geist-sans.woff2` converted to `Geist-SemiBold` (or a Geist 600 TTF) and JetBrains Mono Regular, and list both under `UIAppFonts`. Without them the view falls back to the system font.
3. Add `grain.png` (128 × 128) to the asset catalog as `grain`.

## How it maps to the web piece

- Same numbers as `split-flap.js`: 64ms steps, 32ms per half on `cubic-bezier(0.55,0,0.9,0.4)`, column steps 5/6/7/8/6/7, 40ms stagger, number row 120ms later, 2000ms per word.
- Flaps use `rotation3DEffect` around the x axis with `perspective: 0.5`. The top leaf pivots on its bottom edge, the bottom leaf on its top edge.
- The last step rebounds to 4deg over 160ms. The spec's spring reference is `.spring(response: 0.26, dampingFraction: 0.41)`; the drawn shape uses the overshoot of `cubic-bezier(0.34,1.4,0.64,1)` so it matches web frame for frame.
- Sizes snap to even device pixels using `displayScale`; the 2 device px hinge starts on an even row.
- Pointer hover (iPad pointer, Mac) flips a column 4 random steps, once per 320ms per column. Pressing the board shows the next word.
- Reduce Motion: 160ms crossfade, no rotation, no hover flips.
