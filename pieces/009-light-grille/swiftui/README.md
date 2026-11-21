# Light Grille — SwiftUI

This folder holds implementation notes only. There is no Swift source in this piece.

Drop a `Canvas` + `GraphicsContext` view into an iOS 17+ target and batch-draw all 144 slits in one frame. Use `.onContinuousHover` for the pointer and `@State` to refresh. When a press enters the focused band, fire `.sensoryFeedback(.impact(weight: .light))`. Bundle **Geist** at weight 600 and the piece's `grain.png` as a static 3% overlay.

- Card 360×480 (aspect 3/4, width `min(360, 86% of the width)`), face `#121214`, 1pt stroke at 6% white, corner radius 20. Page `#0B0B0C`.
- Grid 240×240, centred, 12×12 cells of 20. Each slit starts 2×14, corner radius 1. Base fill `rgba(255,255,255,0.04)`.
- Labels: `LUMEN` 12pt / 0.08em / `#55545D` top left; `Nº 009` 12pt / 0.04em / `#55545D` top right; `Light Grille` 22pt / −0.03em / `#E8E6E1` bottom left. One weight only.
- Hover: height 14→18 by distance; `offsetX = clamp(-4, dx*0.05, 4)`; one nearest slit `#FFB547`; others fall with `d^-1.5` toward the leak, `#55545D`, and the base. Spring stiffness 240, damping 22 (`.spring(response: 0.34, dampingFraction: 0.78)`).
- Press: card scale 0.98. All slits go to 16×2 and gather on the horizontal mid-line, forming one band. Midpoint `#FFB547`, sides `rgba(255,181,71,0.15)`. Spring 380 / 26 (`.spring(response: 0.22, dampingFraction: 0.65)`).
- No fine pointer: 480ms reverse arc from (−60, 40) into (60, −40), opacity 0→1 in the first 160ms (`timingCurve(0, 0, 0.2, 1)`). Then `pos(t) = (60·cos(2πt/8000), −40·cos(2πt/8000))` from that same clock, so the join is (60, −40) with velocity 0. Leaving the pointer returns to this path.
- Reduce Motion: focus stays at the origin, the centre slit holds `#FFB547`, and there is no drift, press scale, or offset.
