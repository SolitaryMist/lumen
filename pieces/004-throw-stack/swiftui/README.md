# Stack — SwiftUI

Drop `StackView.swift` into an iOS 17+ SwiftUI target and bundle **Inter Variable** (add it to `UIAppFonts`; the name used is `Inter Variable`).

- `DragGesture(minimumDistance: 0)`: x follows 1:1, y × 0.6, rotation clamp(x × 0.06°, ±14°) around anchor (0.5, 1.2).
- Fling if |x| > 0.35W or `velocity.width` > 800 pt/s; 360ms cubic-bezier(0.2,0.7,0.3,1) off screen, ±24°, then back to depth 4 (opacity 0) so it never flashes.
- Intro: 70ms stagger, 700ms position ease; opacity only fades during the first 160ms of each card; its text stays hidden until then and fades in over 120ms. Amber line only on the top card, 200ms fade-in when a card becomes top.
- Snap back: spring k380/c30 (`response 0.32, dampingFraction 0.77`) started with the gesture velocity as initial velocity.
- Stack shift: k260/c26 (`0.39 / 0.81`), 40ms stagger. Hover tilt (iPad pointer): 6°, k200/c24 (`0.44 / 0.85`).
- Springs are integrated by hand (semi-implicit Euler at 1/240 s), same as web and Compose, so all three move identically.
- Only `Open ↗` opens the piece; a press that moves less than 8pt is a tap.
- Reduce Motion: no hint or tilt, fling is a 200ms fade, shifts are 200ms linear.
- Not compiled here; expect small fixes on first build.
