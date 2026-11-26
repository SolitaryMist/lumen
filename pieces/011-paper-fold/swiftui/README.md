# Paper Fold — SwiftUI

Every crease catches the light.

Lumen piece 011 in SwiftUI.

> **Note:** Source only: not compiled, not run on a device.

## Setup

1. Add `PaperFoldView.swift` to an iOS 17+ target (it uses `onContinuousHover` and `GCMouse`).
2. Bundle Geist SemiBold (`Geist-SemiBold`) and JetBrains Mono Regular and list both under `UIAppFonts`.
3. Add `grain.png` (128 × 128) to the asset catalog as `grain`.

## How it maps to the web piece

- Same numbers as `paper-fold.js`: panel angle f·72°, perspective 1400, facing shade ×(1−0.10f) / ×(1−0.42f), valley shadow 24pt at 0.18f, 1px peak highlight at 0.5f.
- Each panel is a `rotation3DEffect` around y, anchored at its valley crease edge. Panel x comes from f so the joins meet, and the card is scaled so its projected width is W·cosθ.
- Springs are integrated directly (170/22 follow, 280/28 press), equal to `.spring(response: 0.48, dampingFraction: 0.84)` and `.spring(response: 0.32, dampingFraction: 0.82)`, so the release speed carries.
- At launch a connected mouse or trackpad means rest at f = 0.45 waiting for hover. Devices without a mouse or trackpad, iPad included, run the guide (0.45 → 0.85 → 0.2) and then the 8s drift; a horizontal drag drives f and springs back to the drift.
- Reduce Motion: fixed f = 0.45, no follow, no drift.
- The perspective strength and the y-rotation sign still need a visual check against web.
