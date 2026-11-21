# Light Grille — SwiftUI

This repository contains the SwiftUI implementation for **Lumen piece 009, "Light Grille"**.

This file is source only. It was not compiled, and it was not run on a device.

## Setup Instructions

1. Copy `LightGrilleView.swift` into your iOS 17+ / macOS 14+ Xcode project.
2. Ensure your Asset Catalog includes:
   - An image asset named `"grain"` (tiled noise texture).
   - The custom font `"Geist"` bundled in your app Info.plist (falls back to system rounded/sans if missing).

## Parameters & Specifications

- **Card Aspect & Dimensions**: 3:4 aspect ratio, width `min(420pt, 86% container width)`, corner radius `20pt`, background `#121214`, page background `#0B0B0C`, 1pt border stroke `rgba(255,255,255,0.06)`.
- **Grille Grid**: 10×10 array centered on card, grid side `66%` of card width. Slat rest width `2.8%` of grid side, rest height `5%` of grid side, corner radius `1pt`.
- **Typography**: Top-left "LUMEN" (12pt, weight 600), bottom-left "Light Grille" (22pt, weight 500), bottom-right "Nº 009" (12pt, weight 500). Letter spacing `-0.03em`. Ink `#E8E6E1`, secondary `#55545D`.
- **Physics Springs (Semi-Implicit Euler Integrator)**:
  - `follow`: stiffness 260, damping 24, mass 1.
  - `hold`: stiffness 420, damping 28, mass 1.
  - `release`: stiffness 300, damping 20, mass 1.
- **Pointer Guide & Drift**:
  - Fine pointer devices start at (0,0) and follow pointer hover.
  - Non-fine pointer sessions trigger a initial guide at 760ms from (-50, +35) to (+50, -35) over 520ms `cubic-bezier(0.22, 1, 0.36, 1)`, then enter an 8-second figure loop `(50*cos(2πt/8), -35*cos(2πt/8))`.
- **Intro & Stagger**:
  - Card opacity fades linearly in 160ms.
  - Slat height grows over 600ms `cubic-bezier(0.16, 1, 0.3, 1)` with radial stagger delay `12ms * hypot(c-4.5, r-4.5)`.
- **Accessibility / Reduced Motion**:
  - 200ms simple card fade.
  - No slat grow, no drift, no follow, no press interaction, no haptics.
  - Center slat (c=4, r=4) remains static amber `#FFB547`.
