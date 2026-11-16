// Guilloché — Lumen 008 (Jetpack Compose)
// Canvas drawPath. Source only: not compiled, not run on a device.
// Put Inter Variable at res/font/inter_variable.ttf and grain.png at res/drawable/grain.png.
package lumen.guilloche

import android.content.Context
import android.provider.Settings
import android.view.InputDevice
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.PointerType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.graphicsLayer

/* ===== Guilloché parameters (identical to web / SwiftUI) =====
   CARD    Aspect 1.586, width min(640dp, 86% of the view). Face #121214,
           1dp stroke at 6% white, radius 20. Page #0B0B0C.
   RINGS   36. Centre (0.68W, 0.5H). 360 segments. Stroke 1dp.
           Density used for snapping is capped at 2.
   LIGHT   b = |cos(φ−θ)|^k · (0.35+0.65·exp(−d²/(2σ²))).
           θ = lx·70°. σ = 0.35W. k rests at 8. 12 buckets.
           Mix #2A2A2A → #E8E6E1 by b, then #FFB547 when b > 0.9.
   REST    (0.35, 0.40). lx = −0.30. θ = −21°.
   SPRING  Light stiffness 170, damping 22, mass 1.
           Press stiffness 280, damping 28, mass 1. k travels 8 → 24.
           Release keeps velocity. 1/240 s steps.
           SwiftUI light response 0.48 / dampingFraction 0.84.
           SwiftUI press response 0.32 / dampingFraction 0.82.
   GUIDE   No fine pointer. θ −60° → +50° in 760ms, then +50° → −30° in 640ms,
           cubic-bezier(0.65, 0, 0.35, 1). Drift θ = 10° − 40°·cos(2πt/8000ms)
           on that same clock. Light y stays 0.45.
   ENTER   Card opacity 160ms. Each ring fades 300ms, stagger 40ms.
           Type fades 300ms and rises 4dp after the outer ring.
   REDUCED Animator duration scale 0. Rest pose, 200ms fade, no drift.
   FINE    SOURCE_MOUSE or SOURCE_TOUCHPAD at launch stays at rest.
           A mouse or stylus hover promotes into pointer follow.
   ================================================================= */
private object GL {
    const val RINGS = 36
    const val SEGMENTS = 360
    const val BUCKETS = 12
    const val ASPECT = 1.586
    const val REST_U = 0.35
    const val REST_V = 0.40
    const val THETA = 70.0
    const val K_REST = 8.0
    const val K_PRESS = 24.0
    const val LIGHT_K = 170.0
    const val LIGHT_C = 22.0
    const val PRESS_K = 280.0
    const val PRESS_C = 28.0
    const val MASS = 1.0
    const val GUIDE_A = 760.0
    const val GUIDE_B = 640.0
    const val DRIFT = 8000.0
    const val DRIFT_Y = 0.45
    const val CARD_FADE = 160.0
    const val REDUCED_FADE = 200.0
    const val RING_FADE = 300.0
    const val STAGGER = 40.0
    const val TYPE = 300.0
    const val TYPE_RISE = 4.0
    const val MOVE = 0.002
    val bg = Color(0xFF0B0B0C)
    val face = Color(0xFF121214)
    val sub = Color(0xFF8A8A8A)
    val ink = Color(0xFFE8E6E1)
    val guideTheta = doubleArrayOf(-60.0, 50.0, -30.0)
}

private fun bez(x1: Double, y1: Double, x2: Double, y2: Double): (Double) -> Double {
    val cx = 3 * x1
    val bx = 3 * (x2 - x1) - cx
    val ax = 1 - cx - bx
    val cy = 3 * y1
    val by = 3 * (y2 - y1) - cy
    val ay = 1 - cy - by
    fun xOf(t: Double) = ((ax * t + bx) * t + cx) * t
    fun yOf(t: Double) = ((ay * t + by) * t + cy) * t
    fun dx(t: Double) = (3 * ax * t + 2 * bx) * t + cx
    return fun(x: Double): Double {
        if (x <= 0.0) return 0.0
        if (x >= 1.0) return 1.0
        var t = x
        repeat(8) {
            val e = xOf(t) - x
            val d = dx(t)
            if (abs(e) < 1e-6 || abs(d) < 1e-6) return@repeat
            t -= e / d
        }
        if (t < 0.0 || t > 1.0) {
            var a = 0.0
            var b = 1.0
            t = x
            repeat(30) {
                if (xOf(t) < x) a = t else b = t
                t = (a + b) / 2
            }
        }
        return yOf(t.coerceIn(0.0, 1.0))
    }
}

private val easeGuide = bez(0.65, 0.0, 0.35, 1.0)

private fun thetaAt(elapsed: Double): Double {
    val el = max(0.0, elapsed)
    val end = GL.GUIDE_A + GL.GUIDE_B
    if (el < GL.GUIDE_A) return GL.guideTheta[0] + (GL.guideTheta[1] - GL.guideTheta[0]) * easeGuide(el / GL.GUIDE_A)
    if (el < end) return GL.guideTheta[1] + (GL.guideTheta[2] - GL.guideTheta[1]) * easeGuide((el - GL.GUIDE_A) / GL.GUIDE_B)
    val w = (el - end) / GL.DRIFT * 2 * PI
    return 10.0 - 40.0 * cos(w)
}

private fun spring(pos: Double, vel: Double, target: Double, dt: Double, k: Double, c: Double): Pair<Double, Double> {
    if (dt <= 0.0) return pos to vel
    val n = max(1, (dt * 240.0).roundToInt())
    val h = dt / n
    var p = pos
    var v = vel
    repeat(n) {
        v += ((-k * (p - target) - c * v) / GL.MASS) * h
        p += v * h
    }
    return p to v
}

private fun colorOf(b: Double): Color {
    val t = b.coerceIn(0.0, 1.0)
    var r = 0x2A + (0xE8 - 0x2A) * t
    var g = 0x2A + (0xE6 - 0x2A) * t
    var bl = 0x2A + (0xE1 - 0x2A) * t
    if (t > 0.9) {
        val u = (t - 0.9) / 0.1
        r += (0xFF - r) * u
        g += (0xB5 - g) * u
        bl += (0x47 - bl) * u
    }
    return Color(r.toFloat() / 255f, g.toFloat() / 255f, bl.toFloat() / 255f)
}

private fun bucketIndex(b: Double): Int {
    if (b >= 1.0) return GL.BUCKETS - 1
    if (b <= 0.0) return 0
    return min(GL.BUCKETS - 1, (b * GL.BUCKETS).toInt())
}

private fun bucketValue(i: Int): Double {
    if (i >= GL.BUCKETS - 1) return 1.0
    return (i + 0.5) / GL.BUCKETS
}

private fun segmentDistance(px: Double, py: Double, ax: Double, ay: Double, bx: Double, by: Double): Double {
    val abx = bx - ax
    val aby = by - ay
    val ab2 = abx * abx + aby * aby
    var u = if (ab2 > 0) ((px - ax) * abx + (py - ay) * aby) / ab2 else 0.0
    if (u < 0) u = 0.0 else if (u > 1) u = 1.0
    return hypot(ax + abx * u - px, ay + aby * u - py)
}

private fun finePointer(): Boolean {
    val ids = InputDevice.getDeviceIds()
    for (id in ids) {
        val dev = InputDevice.getDevice(id) ?: continue
        val sources = dev.sources
        if (sources and InputDevice.SOURCE_MOUSE != 0) return true
        if (sources and InputDevice.SOURCE_TOUCHPAD != 0) return true
    }
    return false
}

private fun reducedMotion(context: Context): Boolean {
    val scale = Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
    return scale == 0f
}

private class Engine {
    var lx = GL.REST_U * 2 - 1
    var ly = GL.REST_V
    var vx = 0.0
    var vy = 0.0
    var targetLx = lx
    var targetLy = ly
    var k = GL.K_REST
    var kv = 0.0
    var phase = "rest"
    var pressing = false
    var fine = false
    var reduced = false
    var t0 = 0.0
    var last = 0.0
    var booted = false
    var pts = Array(GL.RINGS) { DoubleArray((GL.SEGMENTS + 1) * 2) }
    var ids = Array(GL.RINGS) { IntArray(GL.SEGMENTS) }
    private var cacheW = -1.0
    private var cacheH = -1.0
    private var cacheU = Double.NaN
    private var cacheV = Double.NaN
    private var cacheK = Double.NaN

    fun arm(now: Double) {
        t0 = now
        last = 0.0
        k = GL.K_REST
        kv = 0.0
        if (reduced) {
            fine = false
            rest()
            return
        }
        fine = finePointer()
        if (fine) rest() else {
            phase = "guide"
            lx = thetaAt(0.0) / GL.THETA
            ly = GL.DRIFT_Y
            vx = 0.0
            vy = 0.0
        }
    }

    fun rest() {
        lx = GL.REST_U * 2 - 1
        ly = GL.REST_V
        vx = 0.0
        vy = 0.0
        targetLx = lx
        targetLy = ly
        phase = "rest"
    }

    fun step(nowMs: Double) {
        if (!booted) {
            booted = true
            arm(nowMs)
            return
        }
        val dt = if (last > 0) min(0.05, (nowMs - last) / 1000.0) else 0.0
        last = nowMs
        val elapsed = nowMs - t0
        if (reduced) {
            rest()
            k = if (pressing) GL.K_PRESS else GL.K_REST
            kv = 0.0
            return
        }
        val sprung = spring(k, kv, if (pressing) GL.K_PRESS else GL.K_REST, dt, GL.PRESS_K, GL.PRESS_C)
        k = sprung.first
        kv = sprung.second
        if (phase == "guide" || phase == "drift") {
            lx = thetaAt(elapsed) / GL.THETA
            ly = GL.DRIFT_Y
            phase = if (elapsed >= GL.GUIDE_A + GL.GUIDE_B) "drift" else "guide"
            return
        }
        val sx = spring(lx, vx, targetLx, dt, GL.LIGHT_K, GL.LIGHT_C)
        val sy = spring(ly, vy, targetLy, dt, GL.LIGHT_K, GL.LIGHT_C)
        lx = sx.first; vx = sx.second
        ly = sy.first; vy = sy.second
    }

    fun follow(u: Double, v: Double) {
        if (reduced) return
        fine = true
        targetLx = u.coerceIn(0.0, 1.0) * 2 - 1
        targetLy = v.coerceIn(0.0, 1.0)
        phase = "follow"
    }

    fun elapsed(): Double = if (booted && last > 0) max(0.0, last - t0) else 0.0

    fun cardFade(): Float {
        val ms = if (reduced) GL.REDUCED_FADE else GL.CARD_FADE
        return (elapsed() / ms).coerceIn(0.0, 1.0).toFloat()
    }

    fun ringAlpha(i: Int): Float {
        if (reduced) return 1f
        return ((elapsed() - i * GL.STAGGER) / GL.RING_FADE).coerceIn(0.0, 1.0).toFloat()
    }

    fun typeAmount(): Float {
        if (reduced) return cardFade()
        val start = (GL.RINGS - 1) * GL.STAGGER + GL.RING_FADE
        return ((elapsed() - start) / GL.TYPE).coerceIn(0.0, 1.0).toFloat()
    }

    fun ensure(w: Double, h: Double) {
        val u = (lx + 1) * 0.5
        val moved = hypot(u - cacheU, ly - cacheV)
        if (cacheW == w && cacheH == h && moved <= GL.MOVE && abs(k - cacheK) <= GL.MOVE) return
        val theta = lx * GL.THETA * PI / 180.0
        val lightX = u * w
        val lightY = ly * h
        val sigma = 0.35 * w
        for (i in 0 until GL.RINGS) {
            val row = pts[i]
            val cx = 0.68 * w
            val cy = 0.5 * h
            val base = h * (0.10 + 0.012 * i)
            for (s in 0..GL.SEGMENTS) {
                val t = s.toDouble() / GL.SEGMENTS * 2 * PI
                val rad = base + 0.035 * h * sin(12 * t + 0.18 * i)
                row[s * 2] = cx + rad * 1.35 * cos(t)
                row[s * 2 + 1] = cy + rad * sin(t)
            }
            for (s in 0 until GL.SEGMENTS) {
                val ax = row[s * 2]; val ay = row[s * 2 + 1]
                val bx = row[(s + 1) * 2]; val by = row[(s + 1) * 2 + 1]
                val phi = atan2(by - ay, bx - ax)
                val d = segmentDistance(lightX, lightY, ax, ay, bx, by)
                val align = abs(cos(phi - theta)).pow(k)
                val fall = 0.35 + 0.65 * exp(-(d * d) / (2 * sigma * sigma))
                ids[i][s] = bucketIndex(align * fall)
            }
        }
        cacheW = w; cacheH = h; cacheU = u; cacheV = ly; cacheK = k
    }
}

@Composable
fun Guilloche(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val reduced = remember { reducedMotion(context) }
    val inter = remember { FontFamily(Font(R.font.inter_variable)) }
    val engine = remember {
        Engine().also { it.reduced = reduced; it.fine = if (reduced) false else finePointer() }
    }
    var frame by remember { mutableLongStateOf(0L) }
    val density = LocalDensity.current.density
    val scale = min(2f, density)
    LaunchedEffect(reduced) {
        engine.reduced = reduced
        if (engine.booted) engine.arm(engine.last)
        while (true) {
            withFrameNanos { nanos ->
                engine.step(nanos / 1_000_000.0)
                frame = nanos
            }
        }
    }
    BoxWithConstraints(
        modifier
            .fillMaxSize()
            .background(GL.bg)
            .pointerInput(engine) {
                awaitPointerEventScope {
                    while (true) {
                        val event = awaitPointerEvent()
                        val change = event.changes.firstOrNull() ?: continue
                        val cardW = min(640f * density, size.width * 0.86f)
                        val cardH = cardW / GL.ASPECT.toFloat()
                        val left = (size.width - cardW) / 2f
                        val top = (size.height - cardH) / 2f
                        val u = ((change.position.x - left) / cardW).toDouble()
                        val v = ((change.position.y - top) / cardH).toDouble()
                        val pointing = change.type == PointerType.Mouse || change.type == PointerType.Stylus
                        if ((event.type == PointerEventType.Move || event.type == PointerEventType.Enter) && pointing) {
                            engine.follow(u, v)
                        }
                        if (event.type == PointerEventType.Press) {
                            engine.pressing = true
                            if (pointing) engine.follow(u, v)
                        }
                        if (event.type == PointerEventType.Release) engine.pressing = false
                    }
                }
            }
    ) {
        @Suppress("UNUSED_EXPRESSION") frame
        val cardW = min(640.dp, maxWidth * 0.86f)
        val cardH = cardW / GL.ASPECT.toFloat()
        val fade = engine.cardFade()
        val typeU = engine.typeAmount()
        val rise = if (engine.reduced) 0f else ((GL.TYPE_RISE * (1f - typeU)) * density)
        Box(
            Modifier
                .align(Alignment.Center)
                .width(cardW)
                .height(cardH)
                .alpha(fade)
                .clip(RoundedCornerShape(20.dp))
                .background(GL.face)
        ) {
            Canvas(Modifier.fillMaxSize()) {
                val w = size.width.toDouble()
                val h = size.height.toDouble()
                engine.ensure(w, h)
                fun snap(v: Double) = (v.toFloat() * scale).roundToInt() / scale
                val clip = Path().apply {
                    addRoundRect(RoundRect(0f, 0f, size.width, size.height, 20.dp.toPx(), 20.dp.toPx()))
                }
                val stroke = Stroke(
                    width = 1.dp.toPx(),
                    cap = androidx.compose.ui.graphics.StrokeCap.Round,
                    join = androidx.compose.ui.graphics.StrokeJoin.Round
                )
                clipPath(clip) {
                    for (i in 0 until GL.RINGS) {
                        val alpha = engine.ringAlpha(i)
                        if (alpha <= 0.001f) continue
                        val paths = Array(GL.BUCKETS) { Path() }
                        val open = BooleanArray(GL.BUCKETS)
                        val row = engine.pts[i]
                        val id = engine.ids[i]
                        for (s in 0 until GL.SEGMENTS) {
                            val b = id[s]
                            if (!open[b]) {
                                paths[b].moveTo(snap(row[s * 2]), snap(row[s * 2 + 1]))
                                open[b] = true
                            }
                            paths[b].lineTo(snap(row[(s + 1) * 2]), snap(row[(s + 1) * 2 + 1]))
                            for (j in 0 until GL.BUCKETS) if (j != b) open[j] = false
                        }
                        for (b in 0 until GL.BUCKETS) {
                            drawPath(paths[b], colorOf(bucketValue(b)).copy(alpha = alpha), style = stroke)
                        }
                    }
                }
            }
            Image(
                painterResource(R.drawable.grain),
                contentDescription = null,
                modifier = Modifier.fillMaxSize().alpha(0.03f),
                contentScale = ContentScale.Crop
            )
            Text(
                "LUMEN",
                color = GL.sub,
                fontFamily = inter,
                fontWeight = FontWeight.SemiBold,
                fontSize = 11.sp,
                letterSpacing = 0.12.em,
                modifier = Modifier.align(Alignment.TopStart).padding(start = 28.dp, top = 26.dp)
                    .alpha(typeU).graphicsLayer { translationY = rise }
            )
            Row(
                Modifier.align(Alignment.BottomCenter).fillMaxSize().padding(start = 28.dp, end = 28.dp, bottom = 24.dp)
                    .alpha(typeU).graphicsLayer { translationY = rise },
                verticalAlignment = Alignment.Bottom
            ) {
                Text("Guilloché", color = GL.ink, fontFamily = inter, fontWeight = FontWeight.Medium, fontSize = 28.sp, letterSpacing = (-0.03).em)
                Spacer(Modifier.weight(1f))
                Text("Nº 008", color = GL.sub, fontFamily = inter, fontWeight = FontWeight.Medium, fontSize = 13.sp)
            }
        }
        Text("GitHub", color = GL.sub, fontFamily = inter, fontSize = 12.sp, modifier = Modifier.align(Alignment.TopEnd).padding(top = 20.dp, end = 96.dp))
        Text("@aldininin", color = GL.sub, fontFamily = inter, fontSize = 12.sp, modifier = Modifier.align(Alignment.TopEnd).padding(top = 20.dp, end = 24.dp))
    }
}
