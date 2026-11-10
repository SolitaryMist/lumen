// Magnetic rail — Lumen 006 (Jetpack Compose)
// Put Inter Variable at res/font/inter_variable.ttf. Parameters match the web piece one-to-one.
package lumen.magneticrail

import android.provider.Settings
import android.view.InputDevice
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
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
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.PointerType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/* ===== Magnetic rail parameters (identical to web / SwiftUI) =====
   ITEMS 5 · Rim Mesh Weight Stack Scale. Slot 40dp, centers 72dp apart. Row 328dp.
          The simulation uses these same numbers as CSS px on the web. Scale is a
          transform from the bottom center, so the label baseline stays put.
   SCALE 1 + 0.5 * exp(-d² / (2 σ²)), σ = 56. Peak 1.5.
          Nearest item only: lift = 4 * hot * max(0, (scale - 1) / 0.5).
   SPRING Scale and highlight: stiffness 280, damping 28, mass 0.1.
          a = (-k (x - target) - c v) / m, 1/240 s semi-implicit steps.
          Amber bar slide: stiffness 220, damping 26, mass 1.
          Press snaps the magnet to that center: stiffness 320, damping 30, mass 1.
   COMPOSE Scale spring(dampingRatio = 0.82f, stiffness = 280f)
          Slide spring(dampingRatio = 0.80f, stiffness = 220f)
          SwiftUI scale .spring(response = 0.32, dampingFraction = 0.82)
          SwiftUI slide .spring(response = 0.36, dampingFraction = 0.80)
          The frame loop is the shared integrator, not the platform helper.
   GUIDE  No fine pointer: after entrance, u runs 0→1 over 1400ms,
          CubicBezierEasing(0.45, 0, 0.55, 1). u = 0 is the first center, u = 1 the last.
          Drift is 0.5 + 0.5 cos(ωt), period 8000ms.
          driftT0 = entrance end + 1400, so t = 0 is u = 1 with velocity 0, then it moves left.
   FINE   Known at launch from SOURCE_MOUSE, SOURCE_MOUSE_RELATIVE, or SOURCE_TOUCHPAD.
          Those rest on index 2. Leaving the rail fades the bar over 200ms and returns
          scales to 1. Entering again fades the bar in over 200ms from the pointer x.
   ENTER  Stage opacity 160ms. Items spring 0.88 → magnetic scale, stagger 60ms from the left.
          Entrance ends at t0 + 760ms. The bar stays hidden until then.
   REDUCED Animator duration scale 0: scales stay 1, bar fixed under the middle item.
   COLORS bg #0C0C0C · idle #6B6B6B · nearest #F2F2F2 · secondary #8A8A8A · amber #FFB547
   ICONS  1.5dp stroke, no fill. Same 40-unit coordinates as web and SwiftUI.
   ================================================================= */
private object MR {
    const val COUNT = 5
    const val SLOT = 40f
    const val GAP = 72f
    const val ROW_W = 328f
    const val ROW_H = 59f
    const val SIGMA = 56.0
    const val LIFT = 4f
    const val STIFFNESS = 280f
    const val DAMPING = 28f
    const val MASS = 0.1f
    const val SLIDE_K = 220f
    const val SLIDE_C = 26f
    const val SLIDE_M = 1f
    const val SNAP_K = 320f
    const val SNAP_C = 30f
    const val SNAP_M = 1f
    const val RESPONSE = 0.32f
    const val DAMPING_FRACTION = 0.82f
    const val SLIDE_RESPONSE = 0.36f
    const val SLIDE_DAMPING_FRACTION = 0.80f
    const val STAGE = 160.0
    const val STAGGER = 60.0
    const val ENTER_FROM = 0.88f
    const val ENTRANCE = 760.0
    const val GUIDE = 1400.0
    const val DRIFT = 8000.0
    const val AWAY = 200.0
    const val BAR_GAP = 12f
    const val BAR_H = 2f
    val NAMES = arrayOf("Rim", "Mesh", "Weight", "Stack", "Scale")
    val CENTERS = FloatArray(COUNT) { SLOT / 2f + it * GAP }
    val motion = androidx.compose.animation.core.spring<Float>(
        dampingRatio = DAMPING_FRACTION, stiffness = STIFFNESS
    )
    val slide = androidx.compose.animation.core.spring<Float>(
        dampingRatio = SLIDE_DAMPING_FRACTION, stiffness = SLIDE_K
    )
    val easeGuide = androidx.compose.animation.core.CubicBezierEasing(0.45f, 0f, 0.55f, 1f)
    val bg = Color(0xFF0C0C0C)
    val fg = Color(0xFFF2F2F2)
    val idle = Color(0xFF6B6B6B)
    val sub = Color(0xFF8A8A8A)
    val amber = Color(0xFFFFB547)
}

private fun magScale(d: Float): Float {
    val x = d.toDouble()
    return (1.0 + 0.5 * exp(-(x * x) / (2.0 * MR.SIGMA * MR.SIGMA))).toFloat()
}

private fun nearestOf(x: Float): Int {
    var best = 0
    var bd = Float.POSITIVE_INFINITY
    for (i in 0 until MR.COUNT) {
        val d = abs(x - MR.CENTERS[i])
        if (d < bd) { bd = d; best = i }
    }
    return best
}

private fun xFromU(u: Float): Float {
    val a = MR.CENTERS[0]
    val b = MR.CENTERS[MR.COUNT - 1]
    return a + u * (b - a)
}

private fun hasFinePointer(): Boolean {
    val watched = intArrayOf(
        InputDevice.SOURCE_MOUSE,
        InputDevice.SOURCE_MOUSE_RELATIVE,
        InputDevice.SOURCE_TOUCHPAD
    )
    return InputDevice.getDeviceIds().any { id ->
        val sources = InputDevice.getDevice(id)?.sources ?: return@any false
        watched.any { source -> (sources and source) == source }
    }
}

private fun snapEven(px: Float, dpr: Float): Float {
    return (px * dpr / 2f).roundToInt() * 2f / dpr
}

private class Sim {
    val scale = FloatArray(MR.COUNT) { MR.ENTER_FROM }
    val svel = FloatArray(MR.COUNT)
    val hot = FloatArray(MR.COUNT)
    val hvel = FloatArray(MR.COUNT)
    var magnet = MR.CENTERS[2]
    var magnetV = 0f
    var nearest = 2
    var barX = MR.CENTERS[2]
    var barV = 0f
    var markOp = 0f
    var phase = "enter"
    var inside = false
    var pointerX = MR.CENTERS[2]
    var snapTarget = MR.CENTERS[2]
    var snapAnchor = MR.CENTERS[2]
    var fading = false
    var fadeFrom = 0f
    var fadeTo = 1f
    var fadeT0 = 0.0
    var fine = false
    var t0 = -1.0
    var guideT0 = 0.0
    var driftT0 = 0.0
    var now = 0.0

    init { fine = hasFinePointer() }

    fun reset(now: Double, reduced: Boolean) {
        t0 = now
        guideT0 = 0.0
        driftT0 = 0.0
        fading = false
        magnetV = 0f
        barV = 0f
        inside = false
        if (reduced) {
            phase = "static"
            fine = false
            magnet = MR.CENTERS[2]
            nearest = 2
            barX = magnet
            markOp = 1f
            for (i in scale.indices) {
                scale[i] = 1f; svel[i] = 0f
                hot[i] = if (i == 2) 1f else 0f; hvel[i] = 0f
            }
            return
        }
        phase = "enter"
        fine = hasFinePointer()
        nearest = if (fine) 2 else 0
        magnet = MR.CENTERS[nearest]
        pointerX = magnet
        barX = magnet
        markOp = 0f
        for (i in scale.indices) {
            scale[i] = MR.ENTER_FROM; svel[i] = 0f
            hot[i] = if (i == nearest) 1f else 0f; hvel[i] = 0f
        }
    }

    private fun spring(pos: Float, vel: Float, to: Float, dt: Float, k: Float, c: Float, m: Float): Pair<Float, Float> {
        var p = pos
        var v = vel
        if (dt > 0f) {
            val n = max(1, (dt * 240f).roundToInt())
            val h = dt / n
            repeat(n) {
                v += ((-k * (p - to) - c * v) / m) * h
                p += v * h
            }
        }
        return p to v
    }

    private fun drift(now: Double): Float {
        val phase = (now - driftT0) / MR.DRIFT * 2.0 * Math.PI
        return (0.5 + 0.5 * cos(phase)).toFloat()
    }

    private fun beginFade(to: Float, now: Double) {
        fadeFrom = markOp
        fadeTo = to
        fadeT0 = now
        fading = true
    }

    fun hover(x: Float, inside: Boolean, now: Double) {
        if (!fine || phase == "static") return
        this.inside = inside
        if (inside) {
            pointerX = x
            engage(now, phase == "away")
        } else if (phase == "follow" || phase == "snap") {
            beginFade(0f, now)
            phase = "away"
        }
    }

    fun press(index: Int, x: Float) {
        if (!fine || phase == "enter" || phase == "static") return
        phase = "snap"
        snapTarget = MR.CENTERS[index]
        snapAnchor = x
        magnetV = 0f
    }

    private fun engage(now: Double, entered: Boolean) {
        if (phase == "enter" || phase == "guide" || phase == "drift" || phase == "static") return
        if (phase == "away" || (entered && markOp < 0.999f)) {
            barX = pointerX
            barV = 0f
            beginFade(1f, now)
            phase = "follow"
            magnet = pointerX
            magnetV = 0f
            return
        }
        if (phase == "snap") {
            if (abs(pointerX - snapAnchor) > 4f) phase = "follow"
            else return
        }
        phase = "follow"
        magnet = pointerX
        magnetV = 0f
    }

    fun step(now: Double, dtMs: Float, reduced: Boolean) {
        this.now = now
        if (t0 < 0) reset(now, reduced)
        val dt = dtMs / 1000f
        if (reduced || phase == "static") {
            magnet = MR.CENTERS[2]; magnetV = 0f
            nearest = 2; barX = magnet; barV = 0f; markOp = 1f; fading = false
            for (i in scale.indices) {
                scale[i] = 1f; svel[i] = 0f
                hot[i] = if (i == 2) 1f else 0f; hvel[i] = 0f
            }
            return
        }
        val entranceEnd = t0 + MR.ENTRANCE
        if (phase == "enter" && now >= entranceEnd) {
            if (fine && inside) {
                phase = "follow"
                magnet = pointerX
            } else if (fine) phase = "idle"
            else {
                phase = "guide"
                guideT0 = entranceEnd
            }
        }
        if (phase == "guide") {
            val el = now - guideT0
            if (el >= MR.GUIDE) {
                driftT0 = guideT0 + MR.GUIDE
                phase = "drift"
            } else magnet = xFromU(MR.easeGuide.transform((el / MR.GUIDE).toFloat().coerceIn(0f, 1f)))
        }
        if (phase == "drift") magnet = xFromU(drift(now))
        else if (phase == "snap") {
            val s = spring(magnet, magnetV, snapTarget, dt, MR.SNAP_K, MR.SNAP_C, MR.SNAP_M)
            magnet = s.first; magnetV = s.second
        } else if (phase == "idle") {
            magnet = MR.CENTERS[2]; magnetV = 0f
        } else if (phase == "follow") {
            magnet = pointerX; magnetV = 0f
        }
        if (phase != "away") nearest = nearestOf(magnet)
        for (i in scale.indices) {
            val delay = t0 + i * MR.STAGGER
            val goal = if (phase == "away") 1f else magScale(magnet - MR.CENTERS[i])
            val hgoal = if (phase == "away") 0f else if (i == nearest) 1f else 0f
            if (now < delay) {
                scale[i] = MR.ENTER_FROM
                svel[i] = 0f
            } else {
                val step = min(dt, ((now - delay) / 1000.0).toFloat())
                val s = spring(scale[i], svel[i], goal, step, MR.STIFFNESS, MR.DAMPING, MR.MASS)
                scale[i] = s.first; svel[i] = s.second
                val h = spring(hot[i], hvel[i], hgoal, step, MR.STIFFNESS, MR.DAMPING, MR.MASS)
                hot[i] = h.first; hvel[i] = h.second
            }
        }
        if (phase != "away") {
            val s = spring(barX, barV, MR.CENTERS[nearest], dt, MR.SLIDE_K, MR.SLIDE_C, MR.SLIDE_M)
            barX = s.first; barV = s.second
        }
        if (now < entranceEnd) markOp = 0f
        else if (fading) {
            val u = ((now - fadeT0) / MR.AWAY).toFloat().coerceIn(0f, 1f)
            markOp = fadeFrom + (fadeTo - fadeFrom) * u
            if (u >= 1f) { fading = false; markOp = fadeTo }
        } else if (phase == "away") markOp = 0f
        else markOp = 1f
    }
}

private fun glyph(kind: Int, s: Float): Path {
    val path = Path()
    fun circle(cx: Float, cy: Float, r: Float) {
        path.addOval(Rect(cx - r, cy - r, cx + r, cy + r))
    }
    when (kind) {
        0 -> circle(20f * s, 20f * s, 8.5f * s)
        1 -> {
            for (y in floatArrayOf(12f, 20f, 28f)) {
                for (x in floatArrayOf(12f, 20f, 28f)) circle(x * s, y * s, 2.15f * s)
            }
        }
        2 -> {
            for (x in floatArrayOf(13f, 20f, 27f)) {
                path.moveTo(x * s, 11f * s)
                path.lineTo(x * s, 29f * s)
            }
        }
        3 -> {
            for (y in floatArrayOf(9f, 17.5f, 26f)) {
                path.addRoundRect(
                    RoundRect(
                        Rect(11f * s, y * s, 29f * s, (y + 5f) * s),
                        CornerRadius(1.2f * s, 1.2f * s)
                    )
                )
            }
        }
        else -> {
            for (y in floatArrayOf(10f, 15f, 20f, 25f, 30f)) {
                path.moveTo(14f * s, y * s)
                path.lineTo(26f * s, y * s)
            }
        }
    }
    return path
}

@Composable
fun MagneticRail(modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val reduced = remember {
        Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    val inter = remember { FontFamily(Font(R.font.inter_variable)) }
    val density = LocalDensity.current
    val sim = remember { Sim() }
    var frame by remember { mutableLongStateOf(0L) }
    val unit = with(density) { 1.dp.toPx() }

    BoxWithConstraints(modifier.fillMaxSize().background(MR.bg)) {
        val wPx = constraints.maxWidth.toFloat()
        val hPx = constraints.maxHeight.toFloat()
        val titleDp = min(40.dp, max(28.dp, maxWidth * 0.08f))
        val titleSp = with(density) { titleDp.toSp() }
        val railDp = min(560.dp, maxWidth * 0.88f)
        val railPx = with(density) { railDp.toPx() }
        val rowPx = MR.ROW_W * unit
        val rowHPx = MR.ROW_H * unit
        val slotPx = MR.SLOT * unit
        val liveReduced = rememberUpdatedState(reduced)

        LaunchedEffect(reduced) {
            sim.reset(withFrameNanos { it / 1e6 }, liveReduced.value)
            while (true) {
                withFrameNanos { n ->
                    val now = n / 1e6
                    val dt = if (sim.t0 < 0 || sim.now <= 0) 0f else min(50f, (now - sim.now).toFloat())
                    sim.step(now, dt, liveReduced.value)
                    frame = n
                }
            }
        }
        @Suppress("UNUSED_EXPRESSION") frame

        val stageOp = if (reduced || sim.phase == "static" || sim.t0 < 0) {
            if (reduced || sim.phase == "static") 1f else 0f
        } else ((sim.now - sim.t0) / MR.STAGE).toFloat().coerceIn(0f, 1f)

        Column(
            modifier = Modifier.fillMaxSize().graphicsLayer { alpha = stageOp },
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center
        ) {
            Text(
                "Magnetic rail",
                color = MR.fg,
                fontFamily = inter,
                fontWeight = FontWeight.Medium,
                fontSize = titleSp,
                textAlign = TextAlign.Center,
                maxLines = 1,
                style = TextStyle(
                    letterSpacing = (-0.035).em,
                    lineHeight = titleSp,
                    platformStyle = PlatformTextStyle(includeFontPadding = false)
                )
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "Proximity scale",
                color = MR.sub,
                fontFamily = inter,
                fontWeight = FontWeight.Normal,
                fontSize = 12.sp,
                maxLines = 1,
                style = TextStyle(
                    lineHeight = 12.sp,
                    platformStyle = PlatformTextStyle(includeFontPadding = false)
                )
            )
            Box(
                Modifier
                    .width(railDp)
                    .height(105.dp)
                    .pointerInput(reduced) {
                        awaitPointerEventScope {
                            while (true) {
                                val event = awaitPointerEvent()
                                val change = event.changes.firstOrNull() ?: continue
                                val rowLeft = (railPx - rowPx) / 2f
                                val x = ((change.position.x - rowLeft) / unit)
                                val mouse = change.type == PointerType.Mouse
                                val now = sim.now
                                if (!mouse || reduced) continue
                                when (event.type) {
                                    PointerEventType.Exit -> sim.hover(x, false, now)
                                    PointerEventType.Press -> {
                                        var hit = -1
                                        for (i in 0 until MR.COUNT) {
                                            if (abs(x - MR.CENTERS[i]) <= MR.SLOT / 2f) hit = i
                                        }
                                        if (hit >= 0) sim.press(hit, x)
                                        sim.hover(x, true, now)
                                    }
                                    else -> sim.hover(x, true, now)
                                }
                            }
                        }
                    }
            ) {
                val origin = (railPx - rowPx) / 2f
                val pad = 28f * unit
                for (i in 0 until MR.COUNT) {
                    val influence = ((sim.scale[i] - 1f) / 0.5f).coerceIn(0f, 1f)
                    val lift = MR.LIFT * sim.hot[i].coerceIn(0f, 1f) * influence
                    val tone = sim.hot[i].coerceIn(0f, 1f)
                    val channel = (0x6B + (0xF2 - 0x6B) * tone) / 255f
                    val color = Color(channel, channel, channel)
                    val left = origin + MR.CENTERS[i] * unit - slotPx / 2f
                    Column(Modifier.offset { IntOffset(left.roundToInt(), pad.roundToInt()) }.width(MR.SLOT.dp)) {
                        Canvas(
                            Modifier
                                .size(MR.SLOT.dp)
                                .graphicsLayer {
                                    scaleX = sim.scale[i]
                                    scaleY = sim.scale[i]
                                    transformOrigin = TransformOrigin(0.5f, 1f)
                                    translationY = -lift * unit
                                }
                        ) {
                            drawPath(
                                glyph(i, size.width / 40f),
                                color = color,
                                style = Stroke(width = size.width / 40f * 1.5f, cap = androidx.compose.ui.graphics.StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round)
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(
                            MR.NAMES[i],
                            color = color,
                            fontFamily = inter,
                            fontWeight = FontWeight((400 + 100 * tone).roundToInt()),
                            fontSize = 11.sp,
                            textAlign = TextAlign.Center,
                            maxLines = 1,
                            softWrap = false,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Visible,
                            modifier = Modifier.height(11.dp),
                            style = TextStyle(
                                lineHeight = 11.sp,
                                textAlign = TextAlign.Center,
                                platformStyle = PlatformTextStyle(includeFontPadding = false)
                            )
                        )
                    }
                }
                val bw = snapEven(max(2f, MR.SLOT * sim.scale[sim.nearest] * unit), unit)
                val bx = snapEven(origin + sim.barX * unit - bw / 2f, unit)
                val by = snapEven(pad + rowHPx + MR.BAR_GAP * unit, unit)
                val bh = snapEven(max(2f, MR.BAR_H * unit), unit)
                Canvas(Modifier.fillMaxSize().graphicsLayer { alpha = sim.markOp }) {
                    drawRoundRect(
                        color = MR.amber,
                        topLeft = Offset(bx, by),
                        size = Size(bw, bh),
                        cornerRadius = CornerRadius(unit, unit)
                    )
                }
            }
        }
    }
}

@Suppress("unused")
private val springForms = listOf(MR.motion, MR.slide)
