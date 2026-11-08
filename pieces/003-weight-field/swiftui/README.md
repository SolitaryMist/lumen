# Weight Field — SwiftUI

Drop `WeightFieldView.swift` into an iOS 16+ SwiftUI target.

- Bundle **Inter Variable** (`Inter-VariableFont_opsz,wght.ttf`, from rsms/inter or Google Fonts) and add it to `UIAppFonts` in Info.plist. The PostScript name used is `Inter Variable`; change `WF.fontName` if your copy reports a different one.
- Weight is continuous: `UIFontDescriptor` + `kCTFontVariationAttribute` with the `'wght'` tag (2003265652). SwiftUI's `.fontWeight` only has 9 steps, so it is not used.
- Each letter sits in a fixed cell (its width at wght 900), so the row never shifts.
- Spring: stiffness 170 / damping 22 / mass 1, integrated per frame (equivalent to `.spring(response: 0.48, dampingFraction: 0.84)`).
- Reduce Motion (`accessibilityReduceMotion`): no tour, no springs, 200ms linear weight change, intro is fade only.
- Parameters match the web piece one-to-one (see the block at the top of the file).
