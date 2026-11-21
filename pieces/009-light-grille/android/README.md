# Light Grille — Jetpack Compose

This folder holds implementation notes only. There is no Kotlin source in this piece.

Draw every slit in one `Canvas(Modifier.fillMaxSize())` with `drawRoundRect`. Drive the focus with `Animatable` so a change in the light point does not recompose the whole tree. Put Geist at weight 600 in `res/font` and the piece's `grain.png` at `res/drawable/grain.png`, shown static at 3% opacity.

- Card 360×480 (aspect 3/4, width `min(360dp, 86% of the view)`), face `#121214`, 1dp stroke at 6% white, corner radius 20. Page `#0B0B0C`.
- Grid 240×240, centred, 12×12 cells of 20. Each slit starts 2×14, corner radius 1. Base fill `rgba(255,255,255,0.04)`.
- Labels: `LUMEN` 12sp / 0.08em / `#55545D` top left; `Nº 009` 12sp / 0.04em / `#55545D` top right; `Light Grille` 22sp / −0.03em / `#E8E6E1` bottom left. One weight only.
- Hover: height 14→18 by distance; `offsetX = clamp(-4, dx*0.05, 4)`; one nearest slit `#FFB547`; others fall with `d^-1.5` toward the leak, `#55545D`, and the base. Spring stiffness 240, damping 22.
- Press: card scale 0.98. All slits go to 16×2 and gather on the horizontal mid-line, forming one band. Midpoint `#FFB547`, sides `rgba(255,181,71,0.15)`. Spring 380 / 26.
- No fine pointer: 480ms reverse arc from (−60, 40) into (60, −40), opacity 0→1 in the first 160ms (`CubicBezierEasing(0f, 0f, 0.2f, 1f)`). Then `pos(t) = (60·cos(2πt/8000), −40·cos(2πt/8000))` from that same clock, joined at (60, −40) with velocity 0. Leaving the pointer returns to this path.
- Animator duration scale 0, or a reduced-motion preference: focus stays at the origin, the centre slit holds `#FFB547`, and there is no drift, press scale, or offset.
