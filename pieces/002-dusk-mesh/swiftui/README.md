# Dusk — SwiftUI

Open `DuskMeshView.swift` in an iOS/macOS SwiftUI target. Parameters mirror the web piece (`DuskParams`).

- iOS 18+: `MeshGradient(width: 3, height: 3)` + `TimelineView`; ≤ iOS 17: 4 `RadialGradient` + `blur(60)`, breathing only
- Drag spring: `.spring(response: 0.57, dampingFraction: 0.91)`, max ±12% of short side
- Drift: 6% of short side, periods 14/16/18/20/22 s
- Grain: add `../grain.png` (256px tile) to the asset catalog as `grain`, 3% opacity
- Reduce Motion: static frame, drag follows directly
