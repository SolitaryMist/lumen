# Rim Trace — SwiftUI

Open `RimTraceView.swift` in an iOS/macOS SwiftUI target. Parameters mirror the web piece (`RimTraceParams`).

- Magnet spring: `response 0.32` / `dampingFraction 0.82`
- Press spring: `response 0.35` / `dampingFraction 0.78`
- Tour: 8000ms / lap, `cubic-bezier(0.65, 0, 0.35, 1)`
- Intro half-lap: 4000ms from top midpoint
- Reduced motion: static rim at top midpoint; press changes opacity only
