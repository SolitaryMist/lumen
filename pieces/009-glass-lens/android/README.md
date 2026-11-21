# Glass Lens — Jetpack Compose

Lumen piece 009
Subtitle: A lens that bends the page

## Overview
This component implements an interactive dark glass card with a fluid hemisphere lens refraction, chromatic aberration, edge highlights, and physics integration.

Source only: not compiled, not run on a device.

## Integration
1. Drop `GlassLens.kt` into your Android Compose project.
2. Ensure Jetpack Compose and Material 3 dependencies are available.
3. Bundle the Geist font family and optional grain texture asset named `"grain"` if required by your resource system.

## Features & Shader Fallback
- **API 33+ (Android 13+)**: Uses AGSL (`RuntimeShader`) for realistic hemisphere refraction, edge chromatic aberration, dynamic velocity stretch, inner highlight rim, top-left amber arc, and drop shadow.
- **Pre-API 33**: Fallback magnify region with outer drop shadow, inner rim, and amber arc.
- **Physics**: Semi-implicit Euler integration driving position follow springs, hold expansion, and velocity liquid stretch.
- **Reduced Motion**: Respects reduced motion preferences by turning off dynamic drift/stretch and using gentle alpha transitions.
