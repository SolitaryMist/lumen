package com.lumen.pieces.rimtrace

/**
 * Lumen 001 · Rim Trace — Jetpack Compose.
 * Motion params match the web piece. Code only; no emulator required.
 */

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.hypot
import kotlin.math.min

object RimTraceParams {
    const val TOUR_MS = 8000
    const val INTRO_HALF_MS = 4000
    const val MAGNET_MS = 280
    const val BACK_MS = 420
    const val PRESS_MS = 300
    const val RELEASE_MS = 280
    const val SEGMENT = 0.18f
    const val SEGMENT_PRESS = 0.28f
    const val MAGNET_PAD = 48f
    const val CORNER = 20f
    const val STROKE = 1.5f
    const val CARD_MAX = 360f
    const val ASPECT = 1.25f

    // spring stiffness/damping (Compose spring) — web: magnet 180/22, press 120/20
    const val MAGNET_STIFFNESS = 180f
    const val MAGNET_DAMPING = 22f
    const val PRESS_STIFFNESS = 120f
    const val PRESS_DAMPING = 20f

    val Bg = Color(0xFF0B0B0C)
    val Card = Color(0xFF121214)
    val StrokeColor = Color(0xFF2A2A2E)
    val Fg = Color(0xFFEDEDED)
    val Dim = Color(0xFF6B6B6B)
    val Amber = Color(0xFFFFB547)

    val EaseSoft = CubicBezierEasing(0.65f, 0f, 0.35f, 1f)
    val EaseOut = CubicBezierEasing(0.16f, 1f, 0.3f, 1f)
}

@Composable
fun RimTraceScreen(
    reduceMotion: Boolean = false,
    coarsePointer: Boolean = false,
) {
    val progress = remember { Animatable(0f) }
    var segFrac by remember { mutableFloatStateOf(RimTraceParams.SEGMENT) }
    var peak by remember { mutableFloatStateOf(0.95f) }
    var lift by remember { mutableFloatStateOf(0f) }
    var entered by remember { mutableStateOf(reduceMotion) }
    var magnetizing by remember { mutableStateOf(false) }
    var magnetTarget by remember { mutableStateOf<Float?>(null) }

    LaunchedEffect(magnetTarget) {
        val t = magnetTarget ?: return@LaunchedEffect
        progress.animateTo(
            targetValue = t,
            animationSpec = spring(dampingRatio = 0.82f, stiffness = RimTraceParams.MAGNET_STIFFNESS)
        )
    }
    var introDone by remember { mutableStateOf(false) }
    var tourBase by remember { mutableFloatStateOf(0f) }
    var epochNanos by remember { mutableStateOf(0L) }

    LaunchedEffect(Unit) {
        epochNanos = withFrameNanos { it }
        if (!reduceMotion) {
            // card enter
            entered = true
        }
    }

    // auto tour loop
    LaunchedEffect(reduceMotion, magnetizing) {
        if (reduceMotion) {
            progress.snapTo(0f)
            return@LaunchedEffect
        }
        while (true) {
            withFrameNanos { now ->
                if (magnetizing) return@withFrameNanos
                if (epochNanos == 0L) epochNanos = now
                val elapsedMs = (now - epochNanos) / 1_000_000.0
                val p = if (!introDone) {
                    val t = (elapsedMs / RimTraceParams.INTRO_HALF_MS).toFloat().coerceIn(0f, 1f)
                    val e = RimTraceParams.EaseSoft.transform(t)
                    if (t >= 1f) {
                        introDone = true
                        epochNanos = now
                        tourBase = 0.5f
                        0.5f
                    } else e * 0.5f
                } else {
                    val u = ((elapsedMs / RimTraceParams.TOUR_MS) % 1.0).toFloat()
                    val e = RimTraceParams.EaseSoft.transform(u)
                    ((tourBase + e) % 1f + 1f) % 1f
                }
                // Only snap when not animating magnet/back
                if (!magnetizing) {
                    // use snap for continuous tour
                    // Animatable.snapTo from coroutine
                }
                // store via snap in coroutine scope below
            }
            // drive Animatable
            if (!magnetizing) {
                val now = withFrameNanos { it }
                if (epochNanos == 0L) epochNanos = now
                val elapsedMs = (now - epochNanos) / 1_000_000.0
                val p = if (!introDone) {
                    val t = (elapsedMs / RimTraceParams.INTRO_HALF_MS).toFloat().coerceIn(0f, 1f)
                    val e = RimTraceParams.EaseSoft.transform(t)
                    if (t >= 1f) {
                        introDone = true
                        epochNanos = now
                        tourBase = 0.5f
                        0.5f
                    } else e * 0.5f
                } else {
                    val u = ((elapsedMs / RimTraceParams.TOUR_MS) % 1.0).toFloat()
                    val e = RimTraceParams.EaseSoft.transform(u)
                    ((tourBase + e) % 1f + 1f) % 1f
                }
                progress.snapTo(p)
            }
        }
    }

    val enterLift by animateFloatAsState(
        targetValue = if (entered) lift else 12f,
        animationSpec = tween(500, delayMillis = 80, easing = RimTraceParams.EaseOut),
        label = "enterLift"
    )
    val enterAlpha by animateFloatAsState(
        targetValue = if (entered || reduceMotion) 1f else 0f,
        animationSpec = tween(500, delayMillis = 80, easing = RimTraceParams.EaseOut),
        label = "enterAlpha"
    )

    Box(
        Modifier
            .fillMaxSize()
            .background(RimTraceParams.Bg),
        contentAlignment = Alignment.Center
    ) {
        BoxWithConstraints {
            val maxW = min(RimTraceParams.CARD_MAX, maxWidth.value * 0.88f)
            val h = maxW * RimTraceParams.ASPECT
            val shape = RoundedCornerShape(RimTraceParams.CORNER.dp)

            Box(
                Modifier
                    .size(maxW.dp, h.dp)
                    .offset(y = enterLift.dp)
                    .background(RimTraceParams.Card, shape)
                    .then(
                        if (reduceMotion) Modifier
                        else Modifier.pointerInput(Unit) {
                            detectTapGestures(
                                onPress = {
                                    if (reduceMotion) {
                                        peak = 1f
                                    } else {
                                        lift = -4f
                                        segFrac = RimTraceParams.SEGMENT_PRESS
                                        peak = 1f
                                    }
                                    tryAwaitRelease()
                                    if (reduceMotion) {
                                        peak = 0.95f
                                    } else {
                                        lift = 0f
                                        segFrac = RimTraceParams.SEGMENT
                                        peak = 0.95f
                                    }
                                }
                            )
                        }.then(
                            if (coarsePointer) Modifier
                            else Modifier.pointerInput(Unit) {
                                detectDragGestures(
                                    onDragStart = { offset ->
                                        val pad = RimTraceParams.MAGNET_PAD
                                        if (offset.x in -pad..(maxW + pad) && offset.y in -pad..(h + pad)) {
                                            magnetizing = true
                                        }
                                    },
                                    onDrag = { change, _ ->
                                        change.consume()
                                        val loc = change.position
                                        val t = nearestOnRim(loc, Size(maxW, h))
                                        magnetizing = true
                                        // Caller drives Animatable via a side channel — see LaunchedEffect(magnetTarget)
                                        magnetTarget = t
                                    },
                                    onDragEnd = {
                                        magnetizing = false
                                        magnetTarget = null
                                        tourBase = progress.value
                                        epochNanos = System.nanoTime()
                                        introDone = true
                                    },
                                    onDragCancel = {
                                        magnetizing = false
                                    }
                                )
                            }
                        )
                    )
            ) {
                // border
                Canvas(Modifier.fillMaxSize()) {
                    val inset = RimTraceParams.STROKE / 2f
                    val path = rimPath(size, RimTraceParams.CORNER, inset)
                    drawPath(
                        path,
                        color = RimTraceParams.StrokeColor,
                        style = Stroke(width = RimTraceParams.STROKE)
                    )
                    // measure + draw amber segment
                    val measure = PathMeasure().apply { setPath(path, true) }
                    val perim = measure.length
                    if (perim > 0f) {
                        val center = progress.value
                        val len = segFrac * perim
                        val start = ((center * perim - len / 2f) % perim + perim) % perim
                        // glow blob
                        val gLen = min(perim * 0.42f, len * 2.2f)
                        val gStart = ((center * perim - gLen / 2f) % perim + perim) % perim
                        val glow = Path()
                        measure.getSegment(gStart, gStart + gLen, glow, true)
                        // soft glow via translucent thick stroke + circles at ends
                        drawPath(
                            glow,
                            color = RimTraceParams.Amber.copy(alpha = 0.22f * peak / 0.95f),
                            style = Stroke(width = 12f, cap = StrokeCap.Round)
                        )
                        // sample midpoint for radial soft spot
                        val mid = measure.getPosition((center * perim) % perim)
                        drawCircle(
                            color = RimTraceParams.Amber.copy(alpha = 0.08f),
                            radius = 12f,
                            center = mid
                        )
                        // wings
                        val aLen = len * 1.35f
                        val aStart = ((center * perim - aLen / 2f) % perim + perim) % perim
                        val wing = Path()
                        measure.getSegment(aStart, aStart + aLen, wing, true)
                        drawPath(
                            wing,
                            color = RimTraceParams.Amber.copy(alpha = 0.35f * peak),
                            style = Stroke(width = RimTraceParams.STROKE)
                        )
                        // core
                        val core = Path()
                        // handle wrap
                        if (start + len <= perim) {
                            measure.getSegment(start, start + len, core, true)
                        } else {
                            measure.getSegment(start, perim, core, true)
                            measure.getSegment(0f, start + len - perim, core, true)
                        }
                        drawPath(
                            core,
                            color = RimTraceParams.Amber.copy(alpha = peak),
                            style = Stroke(width = RimTraceParams.STROKE)
                        )
                    }
                }

                Text(
                    text = "Rim Trace",
                    color = RimTraceParams.Fg,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = (-0.04 * 28).sp,
                    modifier = Modifier.align(Alignment.Center).padding(bottom = (h * 0.08f).dp)
                )
                Text(
                    text = "No. 001 · Lumen",
                    color = RimTraceParams.Dim,
                    fontSize = 12.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Normal,
                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 24.dp)
                )
            }
        }
    }
}

private fun rimPath(size: Size, corner: Float, inset: Float): Path {
    val x = inset
    val y = inset
    val w = size.width - inset * 2
    val h = size.height - inset * 2
    val r = min(corner - inset, min(w, h) / 2f).coerceAtLeast(0f)
    // Start at top midpoint, clockwise via RoundRect + manual move
    // PathMeasure on addRoundRect starts at top-left of the rect typically;
    // build explicitly for top-mid start.
    return Path().apply {
        moveTo(x + w / 2f, y)
        lineTo(x + w - r, y)
        arcTo(Rect(x + w - 2 * r, y, x + w, y + 2 * r), -90f, 90f, false)
        lineTo(x + w, y + h - r)
        arcTo(Rect(x + w - 2 * r, y + h - 2 * r, x + w, y + h), 0f, 90f, false)
        lineTo(x + r, y + h)
        arcTo(Rect(x, y + h - 2 * r, x + 2 * r, y + h), 90f, 90f, false)
        lineTo(x, y + r)
        arcTo(Rect(x, y, x + 2 * r, y + 2 * r), 180f, 90f, false)
        lineTo(x + w / 2f, y)
        close()
    }
}

private fun nearestOnRim(local: Offset, size: Size): Float {
    val path = rimPath(size, RimTraceParams.CORNER, RimTraceParams.STROKE / 2f)
    val measure = PathMeasure().apply { setPath(path, true) }
    val perim = measure.length
    if (perim <= 0f) return 0f
    var best = 0f
    var bestD = Float.MAX_VALUE
    val n = 128
    for (i in 0 until n) {
        val t = i / n.toFloat()
        val p = measure.getPosition(t * perim)
        val d = hypot(p.x - local.x, p.y - local.y)
        if (d < bestD) {
            bestD = d
            best = t
        }
    }
    return best
}
