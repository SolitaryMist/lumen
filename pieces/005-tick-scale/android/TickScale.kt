// Scale — Lumen 005 (Jetpack Compose)
// Put Inter Variable at res/font/inter_variable.ttf. Parameters match the web piece one-to-one.
package lumen.tickscale

import android.provider.Settings
import android.view.InputDevice
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.PointerType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/* ===== Scale parameters (identical to web / SwiftUI) =====
   TICKS 24 · column min(600dp, 62% of height) × 56dp · idle 16×2, neighbor 20×2, active 28×2
   VALUE 0–100, top = 100, bottom = 0 · activeIndex = round(value / 100 * 23)
   NEIGHBOR |Δ|==0 #FFB547 + 28 · |Δ|==1 #6B6B6B + 20 · else #2A2A2A + 16
          Drawn amber length = max(its spring length, the longest other tick).
   READOUT weight 500, clamp(56dp, 14% width, 88dp), tabular nums, 28dp to the right of the column.
           Y follows the continuous value, then the same spring pulls it onto the active tick.
   SPRING value, and a shrinking tick: stiffness 200, damping 24, mass 1, 1/240 s substeps.
          A growing tick: stiffness 320, damping 30, mass 1.
          Compose form: spring(dampingRatio = 0.78f, stiffness = 200f)
          Growing length: spring(dampingRatio = 0.84f, stiffness = 320f)
          SwiftUI form: .spring(response = 0.36, dampingFraction = 0.78)
          Growing length: .spring(response = 0.35, dampingFraction = 0.84)
   GUIDE  no fine pointer: 1400ms 0→100→20. First leg 760ms, second 640ms, each
          cubic-bezier(0.65, 0, 0.35, 1). Drift is 50 − 30·cos(ωt), period 8000ms,
          driftT0 = scanT0 + 1400, so t=0 sits at 20 with zero velocity and turns upward.
          A press drives the spring target; release blends back over 300ms.
   FINE   Known at launch when an input device advertises SOURCE_MOUSE, SOURCE_MOUSE_RELATIVE,
          or SOURCE_TOUCHPAD. Those rest at 50 in spring mode. Touch alone runs the guide.
   INTRO  160ms stage · ticks from the center outward, 40ms apart, scale 0.6→1 + alpha, 160ms
          · number fades 120ms after the last tick
   REDUCED animator duration scale 0: static at 50, no stagger, no guide, no drift
   COLORS bg #0B0B0C · fg #EDEDED · dim #6B6B6B · idle #2A2A2A · amber #FFB547
   ================================================================= */
private object SC {
    const val TICKS = 24
    const val REST = 50f
    const val LEN_IDLE = 16f
    const val LEN_NEAR = 20f
    const val LEN_ACTIVE = 28f
    const val COL_W = 56f
    const val GAP = 28f
    const val LABEL_GAP = 48f
    const val STIFFNESS = 200f
    const val DAMPING = 24f
    const val STIFFNESS_GROW = 320f
    const val DAMPING_GROW = 30f
    const val MASS = 1f
    const val RESPONSE = 0.36f
    const val DAMPING_FRACTION = 0.78f
    const val RESPONSE_GROW = 0.35f
    const val DAMPING_FRACTION_GROW = 0.84f
    const val STAGE = 160.0
    const val STAGGER = 40.0
    const val TICK_IN = 160.0
    const val NUM_FADE = 120.0
    const val TICK_FROM = 0.6f
    const val SCAN = 1400.0
    const val SCAN_UP = 760.0
    const val SCAN_DOWN = 640.0
    const val DRIFT = 8000.0
    const val DRIFT_LO = 20.0
    const val DRIFT_HI = 80.0
    const val RESUME = 300.0
    const val SETTLE = 0.25f
    val INTRO_SPAN = (TICKS - 1) * STAGGER
    val motion = androidx.compose.animation.core.spring<Float>(dampingRatio = DAMPING_FRACTION, stiffness = STIFFNESS)
    val motionGrow = androidx.compose.animation.core.spring<Float>(dampingRatio = DAMPING_FRACTION_GROW, stiffness = STIFFNESS_GROW)
    val easeSoft = androidx.compose.animation.core.CubicBezierEasing(0.22f, 1f, 0.36f, 1f)
    val easeGuide = androidx.compose.animation.core.CubicBezierEasing(0.65f, 0f, 0.35f, 1f)
    val bg = Color(0xFF0B0B0C)
    val fg = Color(0xFFEDEDED)
    val dim = Color(0xFF6B6B6B)
    val idle = Color(0xFF2A2A2A)
    val amber = Color(0xFFFFB547)
}

private fun activeIndex(v: Float): Int {
    val t = v.coerceIn(0f, 100f)
    return (t / 100f * (SC.TICKS - 1)).roundToInt().coerceIn(0, SC.TICKS - 1)
}
private fun lenTarget(i: Int, active: Int): Float {
    val d = abs(i - active)
    return if (d == 0) SC.LEN_ACTIVE else if (d == 1) SC.LEN_NEAR else SC.LEN_IDLE
}
private fun smooth(u: Float) = u * u * (3f - 2f * u)

/** Hover-capable pointer already attached: mouse or touchpad. A touchscreen does not match. */
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

private class Sim {
    var value = 0f
    var vel = 0f
    var target = 0f
    var yOff = 0f
    var yOffV = 0f // pixels, sprung onto the active tick
    val len = FloatArray(SC.TICKS) { SC.LEN_IDLE }
    val lvel = FloatArray(SC.TICKS)
    var mode = "hold"
    var fine = false
    var touching = false
    val delays = DoubleArray(SC.TICKS)
    var t0 = -1.0
    var scanT0 = 0.0
    var driftT0 = 0.0
    var blendT0 = 0.0
    var blendFrom = SC.REST
    var last = -1.0
    var now = 0.0

    init {
        val seq = ArrayList<Int>(SC.TICKS)
        seq.add(12)
        var lo = 12
        var hi = 12
        while (seq.size < SC.TICKS) {
            if (--lo >= 0) seq.add(lo)
            if (++hi < SC.TICKS) seq.add(hi)
        }
        seq.forEachIndexed { s, i -> delays[i] = s * SC.STAGGER }
        fine = hasFinePointer()
    }

    fun seed() {
        val a = activeIndex(value)
        for (i in len.indices) { len[i] = lenTarget(i, a); lvel[i] = 0f }
    }

    private fun spring(pos: Float, vel: Float, to: Float, dt: Float): Pair<Float, Float> {
        var p = pos
        var v = vel
        if (dt > 0f) {
            val n = max(1, (dt * 240f).roundToInt())
            val h = dt / n
            repeat(n) {
                v += (-SC.STIFFNESS * (p - to) - SC.DAMPING * v) * h
                p += v * h
            }
        }
        if (abs(p - to) < SC.SETTLE && abs(v) < 40f) { p = to; v = 0f }
        return p to v
    }

    private fun lengthSpring(pos: Float, vel: Float, to: Float, dt: Float): Pair<Float, Float> {
        var p = pos
        var v = vel
        if (dt > 0f) {
            val n = max(1, (dt * 240f).roundToInt())
            val h = dt / n
            repeat(n) {
                val grow = to > p
                val k = if (grow) SC.STIFFNESS_GROW else SC.STIFFNESS
                val c = if (grow) SC.DAMPING_GROW else SC.DAMPING
                v += (-k * (p - to) - c * v) * h
                p += v * h
            }
        }
        if (abs(p - to) < SC.SETTLE && abs(v) < 40f) { p = to; v = 0f }
        return p to v
    }

    private fun scan(elapsed: Double): Float {
        val lo = SC.DRIFT_LO.toFloat()
        return if (elapsed <= SC.SCAN_UP) 100f * SC.easeGuide.transform((elapsed / SC.SCAN_UP).toFloat())
        else 100f + (lo - 100f) * SC.easeGuide.transform(((elapsed - SC.SCAN_UP) / SC.SCAN_DOWN).toFloat())
    }

    /** 50 − 30·cos(ωt). At t=0 this is 20 with zero velocity, then it turns upward. */
    private fun drift(now: Double): Float {
        val phase = (now - driftT0) / SC.DRIFT * 2 * Math.PI
        return (50.0 - 30.0 * cos(phase)).toFloat()
    }

    fun begin(now: Double, reduced: Boolean) {
        if (t0 >= 0) return
        t0 = now
        // Touch reveals at 0 so the guide can leave from 0 and land on 20, where the drift turns upward.
        // A fine pointer known at launch, and Reduce Motion, rest at 50 in spring mode.
        val restAtMid = reduced || fine
        value = if (restAtMid) SC.REST else 0f
        target = value
        mode = if (restAtMid) "spring" else "hold"
        seed()
    }

    fun step(now: Double, dtMs: Float, colH: Float, reduced: Boolean) {
        this.now = now
        if (t0 < 0) begin(now, reduced)
        if (reduced) {
            value = SC.REST; vel = 0f; target = SC.REST
        } else if (!fine && mode == "hold" && now >= t0 + SC.INTRO_SPAN + SC.TICK_IN) {
            mode = "scan"; scanT0 = now
        }
        if (!reduced) {
            when (mode) {
                "scan" -> {
                    val el = now - scanT0
                    if (el >= SC.SCAN) { driftT0 = scanT0 + SC.SCAN; mode = "drift"; value = drift(now) }
                    else value = scan(el)
                    vel = 0f
                }
                "drift" -> { value = drift(now); vel = 0f }
                "blend" -> {
                    val u = ((now - blendT0) / SC.RESUME).toFloat().coerceIn(0f, 1f)
                    value = blendFrom + (drift(now) - blendFrom) * smooth(u)
                    vel = 0f
                    if (u >= 1f) mode = "drift"
                }
                "spring" -> {
                    val s = spring(value, vel, target, dtMs / 1000f)
                    value = s.first; vel = s.second
                }
            }
        }
        val active = activeIndex(value)
        val dt = dtMs / 1000f
        val offT = (value / 100f - active / (SC.TICKS - 1f)) * colH
        if (reduced || dt == 0f) { yOff = offT; yOffV = 0f }
        else {
            val s = spring(yOff, yOffV, offT, dt)
            yOff = s.first; yOffV = s.second
        }
        for (i in len.indices) {
            val goal = lenTarget(i, active)
            if (reduced) { len[i] = goal; lvel[i] = 0f }
            else if (dt > 0f) {
                val s = lengthSpring(len[i], lvel[i], goal, dt)
                len[i] = s.first; lvel[i] = s.second
            }
        }
    }

    fun release() {
        if (driftT0 == 0.0) driftT0 = now
        blendFrom = value
        blendT0 = now
        touching = false
        mode = "blend"
    }
}

@Composable
fun TickScale(modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val reduced = remember {
        Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    val inter = remember { FontFamily(Font(R.font.inter_variable, FontWeight.Medium)) }
    val density = LocalDensity.current
        val sim = remember { Sim() }
        var frame by remember { mutableLongStateOf(0L) }

    BoxWithConstraints(modifier.fillMaxSize().background(SC.bg)) {
        val hPx = constraints.maxHeight.toFloat()
        val wPx = constraints.maxWidth.toFloat()
        val colH = min(with(density) { 600.dp.toPx() }, hPx * 0.62f)
        val liveCol = rememberUpdatedState(colH)
        val label = with(density) { 12.dp.toPx() }
        val labelGap = with(density) { SC.LABEL_GAP.dp.toPx() }
        val colW = with(density) { SC.COL_W.dp.toPx() }
        val gap = with(density) { SC.GAP.dp.toPx() }
        val lenIdle = with(density) { SC.LEN_IDLE.dp.toPx() }
        val block = label + labelGap + colH + labelGap + label
        val colTop = (hPx - block) / 2f + label + labelGap
        val numSp = with(density) { min(88.dp, max(56.dp, maxWidth * 0.14f)).toSp() }

        LaunchedEffect(reduced) {
            while (true) {
                withFrameNanos { n ->
                    val now = n / 1e6
                    val dt = if (sim.last < 0) 0f else min(50f, (now - sim.last).toFloat())
                    sim.last = now
                    sim.step(now, dt, liveCol.value, reduced)
                    frame = n
                }
            }
        }
        @Suppress("UNUSED_EXPRESSION") frame

        val active = activeIndex(sim.value)
        val stageOp = if (reduced || sim.t0 < 0) { if (reduced) 1f else 0f } else ((sim.now - sim.t0) / SC.STAGE).toFloat().coerceIn(0f, 1f)
        val numOp = if (reduced) 1f else ((sim.now - sim.t0 - SC.INTRO_SPAN - SC.TICK_IN) / SC.NUM_FADE).toFloat().coerceIn(0f, 1f)

        Box(Modifier.fillMaxSize().graphicsLayer { alpha = stageOp }.pointerInput(reduced) {
            awaitPointerEventScope {
                while (true) {
                    val event = awaitPointerEvent()
                    val change = event.changes.firstOrNull() ?: continue
                    val y = change.position.y
                    val mapped = ((1f - (y - colTop) / colH) * 100f).coerceIn(0f, 100f)
                    val mouse = change.type == PointerType.Mouse
                    if (event.type == PointerEventType.Exit && sim.fine) { sim.target = SC.REST; continue }
                    if (mouse) {
                        sim.fine = true
                        if (sim.mode != "spring") sim.mode = "spring"
                        sim.target = mapped
                    } else if (!reduced && change.pressed) {
                        sim.touching = true
                        sim.mode = "spring"
                        sim.target = mapped
                        change.consume()
                    } else if (sim.touching) {
                        sim.release()
                    }
                }
            }
        }) {
            val colLeft = wPx / 2f - colW / 2f
            Text("005", color = SC.dim, fontSize = 12.sp, fontFamily = FontFamily.Monospace, textAlign = TextAlign.Center,
                modifier = Modifier.offset(x = with(density) { colLeft.toDp() }, y = with(density) { (colTop - labelGap - label).toDp() }).width(with(density) { colW.toDp() }))
            Text("SCALE", color = SC.dim, fontSize = 12.sp, fontFamily = FontFamily.Monospace, textAlign = TextAlign.Center,
                modifier = Modifier.offset(x = with(density) { colLeft.toDp() }, y = with(density) { (colTop + colH + labelGap).toDp() }).width(with(density) { colW.toDp() }))
            val grows = FloatArray(SC.TICKS) { i ->
                val intro = if (reduced) 1f else ((sim.now - sim.t0 - sim.delays[i]) / SC.TICK_IN).toFloat().coerceIn(0f, 1f)
                SC.TICK_FROM + (1f - SC.TICK_FROM) * SC.easeSoft.transform(intro)
            }
            var maxOther = 0f
            for (i in 0 until SC.TICKS) if (i != active) maxOther = max(maxOther, sim.len[i] * grows[i])
            val activeRendered = max(sim.len[active], maxOther)
            for (i in 0 until SC.TICKS) {
                val intro = if (reduced) 1f else ((sim.now - sim.t0 - sim.delays[i]) / SC.TICK_IN).toFloat().coerceIn(0f, 1f)
                val rendered = if (i == active) activeRendered else sim.len[i] * grows[i]
                val center = (1f - i / (SC.TICKS - 1f)) * colH
                val sx = rendered / SC.LEN_IDLE
                val color = when {
                    i == active -> SC.amber
                    abs(i - active) == 1 -> SC.dim
                    else -> SC.idle
                }
                Box(Modifier
                    .offset { IntOffset(colLeft.roundToInt(), (colTop + center - 1.dp.toPx()).roundToInt()) }
                    .size(width = with(density) { lenIdle.toDp() }, height = 2.dp)
                    .graphicsLayer {
                        scaleX = sx
                        transformOrigin = TransformOrigin(0f, 0.5f)
                        alpha = intro
                    }
                    .background(color))
            }
            val ny = colTop + (1f - sim.value.coerceIn(0f, 100f) / 100f) * colH + sim.yOff
            Text(
                sim.value.coerceIn(0f, 100f).roundToInt().toString(),
                color = SC.fg,
                fontFamily = inter,
                fontSize = numSp,
                style = TextStyle(fontFeatureSettings = "tnum", letterSpacing = (-0.04).em),
                modifier = Modifier
                    .offset(
                        x = with(density) { (colLeft + colW + gap).toDp() },
                        y = with(density) { (ny - numSp.toPx() / 2f).toDp() }
                    )
                    .graphicsLayer { alpha = numOp }
            )
        }
    }
}
