# Stack — Jetpack Compose

Add `ThrowStack.kt` to a Compose module and put Inter Variable at `res/font/inter_variable.ttf`.

- Drag via `awaitEachGesture` + `VelocityTracker`; x 1:1, y × 0.6, rotation clamp(x × 0.06°, ±14°), `TransformOrigin(0.5f, 1.2f)`.
- Fling if |x| > 0.35W or |vx| > 800 dp/s; 360ms `CubicBezierEasing(0.2f, 0.7f, 0.3f, 1f)` off screen, ±24°, then depth 4 (opacity 0) so there is no flash.
- Intro: 70ms stagger, 700ms position ease; alpha only fades during the first 160ms of each card. Amber line only on the top card, 200ms fade-in when a card becomes top.
- Snap back: `Animatable.animateTo(0f, spring(dampingRatio = 0.77f, stiffness = 380f), initialVelocity = vx)`.
- Stack shift: `spring(dampingRatio = 0.81f, stiffness = 260f)`, 40ms stagger.
- Hint: after 2500ms idle, nudge -28dp and back over 900ms, max 2 times, 4000ms apart; cancelled on first touch.
- Reduced motion (animator duration scale 0): 200ms fade fling, 200ms linear shifts, no hint.
- Parameters match the web piece one-to-one (block at the top of the file). Not compiled here.
