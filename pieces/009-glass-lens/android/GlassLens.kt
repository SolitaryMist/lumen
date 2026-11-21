/*
 * Lumen 009: Glass Lens
 * Subtitle: A lens that bends the page
 *
 * Parameters:
 * - Card: aspect ratio 1.586, width min(640.dp, 86% container width, 111% container height), face #121214, stroke 1.dp rgba(255,255,255,0.06), radius 20.dp, page #0B0B0C.
 * - Lens: rest diameter 0.30x card width, hold 0.36x card width, center mag 1.35 -> 1.8, IOR = mag, edge CA e=smoothstep(0.72,1,r), R*(1-0.012e), B*(1+0.012e) (x2 on hold).
 * - Springs: follow spring stiffness 170 / damping 22; hold spring stiffness 280 / damping 28; liquid stretch spring stiffness 280 / damping 28.
 * - Drift: figure-8 (x = 0.50 + 0.28*sin(2pi*t/8000), y = 0.52 + 0.10*sin(4pi*t/8000)), speed eased with 800ms smoothstep.
 * - Intro: card alpha 0->1 in 160ms; lens scale 0.6->1 in 600ms cubic-bezier(0.16,1,0.3,1).
 * - Reduced motion: static at rest, no stretch, hold fades mag/diameter/CA over 200ms, card fades 200ms, no drift.
 * - Fine pointer: fine pointer sources (mouse, trackpad, stylus) trigger follow mode; finger only uses figure-8 drift.
 *
 * Source only: not compiled, not run on a device.
 */

package com.example.lumen009

import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.os.Build
import android.provider.Settings
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

private const val AGSL_LENS_SHADER = """
uniform shader contents;
uniform float2 uLensCenter;
uniform float uLensRadius;
uniform float uMag;
uniform float uCA;
uniform float uStretchS;
uniform float uStretchAngle;
uniform float2 uCardSize;

half4 main(float2 fragCoord) {
    float2 d = fragCoord - uLensCenter;
    
    float cosA = cos(-uStretchAngle);
    float sinA = sin(-uStretchAngle);
    float2 rotD = float2(d.x * cosA - d.y * sinA, d.x * sinA + d.y * cosA);
    
    float2 unStretched = float2(rotD.x / uStretchS, rotD.y * uStretchS);
    float r = length(unStretched) / uLensRadius;
    
    if (r <= 1.0) {
        float z = sqrt(max(0.0, 1.0 - r * r));
        float factor = 1.0 - (1.0 - 1.0 / uMag) * z;
        float2 sampleLocal = unStretched * factor;
        
        float e = smoothstep(0.72, 1.0, r);
        float caEffect = uCA * e;
        
        float cosB = cos(uStretchAngle);
        float sinB = sin(uStretchAngle);
        
        float2 sR_local = sampleLocal * (1.0 - caEffect);
        float2 sR_rot = float2(sR_local.x * cosB - sR_local.y * sinB, sR_local.x * sinB + sR_local.y * cosB);
        float2 coordR = uLensCenter + sR_rot;
        
        float2 sG_rot = float2(sampleLocal.x * cosB - sampleLocal.y * sinB, sampleLocal.x * sinB + sampleLocal.y * cosB);
        float2 coordG = uLensCenter + sG_rot;
        
        float2 sB_local = sampleLocal * (1.0 + caEffect);
        float2 sB_rot = float2(sB_local.x * cosB - sB_local.y * sinB, sB_local.x * sinB + sB_local.y * cosB);
        float2 coordB = uLensCenter + sB_rot;
        
        half4 colR = contents.eval(clamp(coordR, float2(0.0), uCardSize));
        half4 colG = contents.eval(clamp(coordG, float2(0.0), uCardSize));
        half4 colB = contents.eval(clamp(coordB, float2(0.0), uCardSize));
        
        half4 color = half4(colR.r, colG.g, colB.b, colG.a);
        
        float rimWidth = 1.5;
        float rim = smoothstep(1.0 - rimWidth / uLensRadius, 1.0, r) * (1.0 - smoothstep(0.98, 1.0, r));
        color.rgb = mix(color.rgb, half3(1.0), rim * 0.18);
        
        float angle = atan(unStretched.y, unStretched.x);
        if (angle < 0.0) angle += 6.28318530718;
        float midAngle = 3.9269908169872414;
        float diffAngle = abs(angle - midAngle);
        if (diffAngle > 3.14159265359) diffAngle = 6.28318530718 - diffAngle;
        float halfArc = 0.3490658503988659;
        
        if (diffAngle < halfArc && r > (1.0 - 2.5 / uLensRadius) && r <= 1.0) {
            float arcAlpha = smoothstep(halfArc, halfArc * 0.5, diffAngle) * smoothstep(1.0 - 2.5 / uLensRadius, 1.0 - 1.0 / uLensRadius, r);
            half3 amber = half3(1.0, 0.7098, 0.2784);
            color.rgb = mix(color.rgb, amber, arcAlpha * 0.85);
        }
        
        return color;
    } else {
        half4 color = contents.eval(fragCoord);
        
        float2 shadowCenter = uLensCenter + float2(0.0, 10.0);
        float2 sD = fragCoord - shadowCenter;
        float2 sRotD = float2(sD.x * cosA - sD.y * sinA, sD.x * sinA + sD.y * cosA);
        float2 sUnStretched = float2(sRotD.x / uStretchS, sRotD.y * uStretchS);
        float shadowR = length(sUnStretched);
        
        if (shadowR > uLensRadius) {
            float shadowDist = shadowR - uLensRadius;
            float blurRadius = 28.0;
            float shadowAlpha = 0.5 * (1.0 - smoothstep(0.0, blurRadius, shadowDist));
            color.rgb *= (1.0 - shadowAlpha);
        }
        
        return color;
    }
}
"""

private fun smoothstep(edge0: Float, edge1: Float, x: Float): Float {
    val t = ((x - edge0) / (edge1 - edge0)).coerceIn(0f, 1f)
    return t * t * (3f - 2f * t)
}

private fun lerp(start: Float, stop: Float, fraction: Float): Float {
    return start + (stop - start) * fraction
}

@Composable
fun GlassLens(
    modifier: Modifier = Modifier,
    reducedMotionOverride: Boolean? = null
) {
    val density = LocalDensity.current
    val haptic = LocalHapticFeedback.current
    val context = LocalContext.current
    val systemReduced = remember(context) {
        try {
            Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
        } catch (e: Exception) {
            false
        }
    }
    val isReducedMotion = reducedMotionOverride ?: systemReduced

    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF0B0B0C)),
        contentAlignment = Alignment.Center
    ) {
        val containerWidthPx = with(density) { maxWidth.toPx() }
        val containerHeightPx = with(density) { maxHeight.toPx() }

        val maxCardWidthDp = 640.dp
        val widthFromWidthRatio = maxWidth * 0.86f
        val widthFromHeightRatio = maxHeight * 1.11f
        val cardWidthDp = minOf(maxCardWidthDp, minOf(widthFromWidthRatio, widthFromHeightRatio))
        val cardHeightDp = cardWidthDp / 1.586f

        val cardWidthPx = with(density) { cardWidthDp.toPx() }
        val cardHeightPx = with(density) { cardHeightDp.toPx() }

        var posX by remember { mutableFloatStateOf(0.62f) }
        var posY by remember { mutableFloatStateOf(0.50f) }
        var velX by remember { mutableFloatStateOf(0f) }
        var velY by remember { mutableFloatStateOf(0f) }

        var targetX by remember { mutableFloatStateOf(0.62f) }
        var targetY by remember { mutableFloatStateOf(0.50f) }

        var holdVal by remember { mutableFloatStateOf(0f) }
        var holdVel by remember { mutableFloatStateOf(0f) }
        var isHolding by remember { mutableStateOf(false) }

        var stretchS by remember { mutableFloatStateOf(1f) }
        var stretchVel by remember { mutableFloatStateOf(0f) }
        var stretchAngle by remember { mutableFloatStateOf(0f) }

        var isFinePointerPresent by remember { mutableStateOf(false) }
        var wallFromDriftStartMs by remember { mutableFloatStateOf(0f) }
        var driftClockMs by remember { mutableFloatStateOf(0f) }

        var introTimeMs by remember { mutableFloatStateOf(0f) }
        var cardAlpha by remember { mutableFloatStateOf(0f) }
        var lensIntroScale by remember { mutableFloatStateOf(0.6f) }

        val introEasing = remember { CubicBezierEasing(0.16f, 1f, 0.3f, 1f) }

        LaunchedEffect(isReducedMotion) {
            var lastNanos = 0L
            while (true) {
                withFrameNanos { nanos ->
                    if (lastNanos != 0L) {
                        val dt = ((nanos - lastNanos) / 1_000_000_000f).coerceIn(0.001f, 0.05f)
                        val dtMs = dt * 1000f

                        introTimeMs += dtMs
                        if (isReducedMotion) {
                            cardAlpha = (introTimeMs / 200f).coerceIn(0f, 1f)
                            lensIntroScale = 1.0f
                        } else {
                            cardAlpha = (introTimeMs / 160f).coerceIn(0f, 1f)
                            lensIntroScale = if (introTimeMs < 600f) {
                                lerp(0.6f, 1.0f, introEasing.transform(introTimeMs / 600f))
                            } else {
                                1.0f
                            }
                        }

                        if (!isReducedMotion) {
                            if (!isFinePointerPresent && introTimeMs >= 600f) {
                                wallFromDriftStartMs += dtMs
                                val ease = smoothstep(0f, 800f, wallFromDriftStartMs)
                                driftClockMs += dtMs * ease
                                targetX = 0.50f + 0.28f * sin(2f * PI.toFloat() * driftClockMs / 8000f)
                                targetY = 0.52f + 0.10f * sin(4f * PI.toFloat() * driftClockMs / 8000f)
                            }

                            val substeps = max(1, (dt * 240f).roundToInt())
                            val subDt = dt / substeps

                            repeat(substeps) {
                                val ax = -170f * (posX - targetX) - 22f * velX
                                val ay = -170f * (posY - targetY) - 22f * velY
                                velX += ax * subDt
                                velY += ay * subDt
                                posX += velX * subDt
                                posY += velY * subDt

                                val targetHold = if (isHolding) 1f else 0f
                                val aHold = -280f * (holdVal - targetHold) - 28f * holdVel
                                holdVel += aHold * subDt
                                holdVal += holdVel * subDt

                                val velPxX = velX * cardWidthPx
                                val velPxY = velY * cardHeightPx
                                val vMag = sqrt(velPxX * velPxX + velPxY * velPxY)
                                val sTarget = 1f + min(vMag / 3000f, 0.12f)
                                if (vMag > 10f) {
                                    stretchAngle = atan2(velPxY, velPxX)
                                }

                                val aStretch = -280f * (stretchS - sTarget) - 28f * stretchVel
                                stretchVel += aStretch * subDt
                                stretchS += stretchVel * subDt
                            }
                            holdVal = holdVal.coerceIn(0f, 1f)
                        } else {
                            posX = 0.62f
                            posY = 0.50f
                            velX = 0f
                            velY = 0f
                            stretchS = 1f
                            val targetHold = if (isHolding) 1f else 0f
                            holdVal = lerp(holdVal, targetHold, (dtMs / 200f).coerceIn(0f, 1f))
                        }
                    }
                    lastNanos = nanos
                }
            }
        }

        val restDiameterPx = cardWidthPx * 0.30f
        val holdDiameterPx = cardWidthPx * 0.36f
        val currentDiameterPx = lerp(restDiameterPx, holdDiameterPx, holdVal) * lensIntroScale
        val currentRadiusPx = currentDiameterPx / 2f

        val currentMag = lerp(1.35f, 1.8f, holdVal)
        val currentCA = lerp(0.012f, 0.024f, holdVal)

        val lensPxX = posX * cardWidthPx
        val lensPxY = posY * cardHeightPx

        val runtimeShader = remember {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                RuntimeShader(AGSL_LENS_SHADER)
            } else null
        }

        val cardShape = RoundedCornerShape(20.dp)

        Box(
            modifier = Modifier
                .width(cardWidthDp)
                .height(cardHeightDp)
                .alpha(cardAlpha)
                .clip(cardShape)
                .background(Color(0xFF121214))
                .border(1.dp, Color(255, 255, 255, 15), cardShape)
                .pointerInput(Unit) {
                    awaitPointerEventScope {
                        while (true) {
                            val event = awaitPointerEvent()
                            val change = event.changes.firstOrNull() ?: continue
                            val isFine = change.type == PointerType.Mouse || change.type == PointerType.Stylus

                            if (isFine) {
                                isFinePointerPresent = true
                            }

                            val positionInCard = change.position
                            val inside = positionInCard.x in 0f..cardWidthPx && positionInCard.y in 0f..cardHeightPx

                            if (isFine) {
                                if (inside) {
                                    targetX = positionInCard.x / cardWidthPx
                                    targetY = positionInCard.y / cardHeightPx
                                } else {
                                    targetX = 0.62f
                                    targetY = 0.50f
                                }
                            }

                            if (change.pressed && !isHolding) {
                                isHolding = true
                                if (!isReducedMotion) {
                                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                }
                            } else if (!change.pressed && isHolding) {
                                isHolding = false
                                if (!isReducedMotion) {
                                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                }
                            }
                        }
                    }
                }
                .then(
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && runtimeShader != null) {
                        Modifier.graphicsLayer {
                            runtimeShader.setFloatUniform("uLensCenter", lensPxX, lensPxY)
                            runtimeShader.setFloatUniform("uLensRadius", currentRadiusPx)
                            runtimeShader.setFloatUniform("uMag", currentMag)
                            runtimeShader.setFloatUniform("uCA", currentCA)
                            runtimeShader.setFloatUniform("uStretchS", stretchS)
                            runtimeShader.setFloatUniform("uStretchAngle", stretchAngle)
                            runtimeShader.setFloatUniform("uCardSize", cardWidthPx, cardHeightPx)
                            renderEffect = RenderEffect
                                .createRuntimeShaderEffect(runtimeShader, "contents")
                                .asComposeRenderEffect()
                        }
                    } else Modifier
                )
        ) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val stepPx = 8
                var yPx = 0f
                while (yPx <= size.height) {
                    drawLine(
                        color = Color(255, 255, 255, (255 * 0.07f).toInt()),
                        start = Offset(0f, yPx),
                        end = Offset(size.width, yPx),
                        strokeWidth = 1f
                    )
                    yPx += stepPx
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = (cardWidthDp.value * 0.06f).dp, vertical = (cardHeightDp.value * 0.06f).dp)
            ) {
                Text(
                    text = "LUMEN",
                    color = Color(0xFF6E6D75),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 0.08.em,
                    fontFamily = FontFamily.SansSerif,
                    modifier = Modifier.align(Alignment.TopStart)
                )

                Text(
                    text = "Nº 009",
                    color = Color(0xFF6E6D75),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 0.08.em,
                    fontFamily = FontFamily.SansSerif,
                    modifier = Modifier.align(Alignment.TopEnd)
                )
            }

            Text(
                text = "Glass Lens",
                color = Color(0xFFE8E6E1),
                fontSize = with(density) { (cardWidthPx * 0.13f).toSp() },
                fontWeight = FontWeight.Medium,
                letterSpacing = (-0.04).em,
                fontFamily = FontFamily.SansSerif,
                modifier = Modifier
                    .offset(
                        x = (cardWidthDp.value * 0.08f).dp,
                        y = (cardHeightDp.value * 0.58f - cardWidthDp.value * 0.13f * 0.8f).dp
                    )
            )

            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                Canvas(modifier = Modifier.fillMaxSize()) {
                    drawCircle(
                        color = Color.Black.copy(alpha = 0.35f),
                        radius = currentRadiusPx + 14.dp.toPx(),
                        center = Offset(lensPxX, lensPxY + 10.dp.toPx())
                    )

                    drawCircle(
                        color = Color(0xFF121214),
                        radius = currentRadiusPx,
                        center = Offset(lensPxX, lensPxY)
                    )

                    drawCircle(
                        color = Color.White.copy(alpha = 0.18f),
                        radius = currentRadiusPx,
                        center = Offset(lensPxX, lensPxY),
                        style = Stroke(width = 1.dp.toPx())
                    )

                    drawArc(
                        color = Color(0xFFFFB547),
                        startAngle = 205f,
                        sweepAngle = 40f,
                        useCenter = false,
                        topLeft = Offset(lensPxX - currentRadiusPx + 1.dp.toPx(), lensPxY - currentRadiusPx + 1.dp.toPx()),
                        size = Size((currentRadiusPx - 1.dp.toPx()) * 2, (currentRadiusPx - 1.dp.toPx()) * 2),
                        style = Stroke(width = 1.5.dp.toPx())
                    )
                }
            }
        }
    }
}
