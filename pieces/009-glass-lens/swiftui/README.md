# Glass Lens — SwiftUI

A lens that bends the page.

Lumen piece 009 implementation in SwiftUI.

> **Note:** Source only: not compiled, not run on a device.

## Setup Instructions

1. Add `GlassLensView.swift` into an iOS 17+ Xcode project target.
2. Copy the stitchable Metal source in that file into `GlassLens.metal` in the same target, so `ShaderLibrary.glassLensShader` can load. Below iOS 17 the view uses a magnify-only fallback.
3. Bundle the `Geist` font family (or fall back to the system sans).
4. Bundle the grain texture image named `"grain"` in the asset catalog.

## Technical Details

- **iOS 17+ Dynamic Refraction**: Utilizes Metal `layerEffect` shader execution to deliver real-time hemisphere refraction, edge chromatic aberration, liquid velocity stretching, soft drop shadows, and an amber highlight arc.
- **Pre-iOS 17 Fallback**: Provides a simplified magnification fallback renderer maintaining identical sizing, spring physics, soft shadow, inner highlight rim, and amber accent arc.
- **Pointer & Physics Engine**: Features semi-implicit Euler integration (`m=1`, `240Hz` substeps) for follow springs, hold scaling, and liquid stretching along velocity vectors. Supports continuous pointer tracking via `.onContinuousHover` and fine pointer detection.
