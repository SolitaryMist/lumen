// Lumen 012 · Ink — Jetpack Compose
// A single drop, slowly finding its way.
//
// Source only: not compiled, not run on a device.
//
// CPU stable fluids on a 96 × 64 velocity grid (Jacobi 16) with a 192 × 128 ink field, stepped on
// Dispatchers.Default. API 33+: an AGSL RuntimeShader does edge pooling, paper absorption and colour
// from the raw ink bitmap; below 33 the same shading runs on the CPU into an ARGB bitmap.
// Numbers match ink.js. Positions are in card units (x 0…1 left→right, y 0…1 top→bottom);
// velocities in card widths (W) per second; times in ms unless noted.

package lumen.ink

import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import android.provider.Settings
import androidx.annotation.RequiresApi
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.ImageShader
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.PointerType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

// ---------- parameters (synced with ink.js) ----------
object InkP {
    val bg = Color(0xFF0B0B0C)
    val paper = floatArrayOf(0xEC / 255f, 0xE8 / 255f, 0xE1 / 255f)
    val ink = floatArrayOf(0x14 / 255f, 0x14 / 255f, 0x16 / 255f)
    const val wMaxDp = 760f; const val wVw = 0.76f; const val wVh = 1.2f
    const val aspect = 1.5f; const val portraitCy = 0.46f; const val radiusDp = 4f
    const val grainAlpha = 0.03f
    val label = Color(0xFF8A8780)
    const val labelSp = 11f; const val labelTracking = 0.08f; const val insetR = 0.05f
    // simulation (native simplification)
    const val GW = 96; const val GH = 64; const val IW = 192; const val IH = 128; const val jacobi = 16
    const val pressureWarm = 0.8f; const val vorticity = 18f
    const val velHalfLife = 1200f; const val inkHalfLife = 9000f
    const val edgeMargin = 0.06f
    const val noiseAmp = 0.06f; const val noiseK1 = 6f; const val noiseK2 = 13f
    const val noiseW1 = 0.8f; const val noiseW2 = 0.2f; const val noiseS1 = 0.18f; const val noiseS2 = 0.42f
    // render
    const val absorbK = 3.0f; const val poolK = 0.18f; const val fiberBase = 0.92f; const val fiberAmp = 0.16f
    const val fiberScale = 24; const val maxDensity = 0.92f
    const val soakRate = 0.15f; const val soakFiber = 0.15f; const val soakStill = 0.1f; const val crisp = 2.5f
    // drops (no satellites)
    const val dropAmount = 1.0f; const val dropPeak = 0.85f; const val dropR = 0.075f; const val dropIn = 180f
    const val dropImpulse = 0.2f; const val burstR = 0.028f; const val dropGap = 350.0
    // pointer stirring
    const val moveGain = 1.4f; const val moveR = 0.035f; const val moveMax = 3.0f
    // auto mode
    const val autoEvery = 5200.0
    val autoPts = arrayOf(floatArrayOf(0.50f, 0.47f), floatArrayOf(0.62f, 0.56f), floatArrayOf(0.50f, 0.40f))
    const val stirAx = 0.22f; const val stirAy = 0.14f; const val stirPeriod = 7000f; const val stirForce = 0.7f; const val stirR = 0.035f
    const val stirIn = 800.0; const val stirOut = 300.0; const val idleFine = 6000.0; const val idleCoarse = 3000.0
    const val resumeDropDelay = 800.0
    // start
    const val prerun = 600.0; const val stepMs = 1000.0 / 60; const val maxDt = 1000.0 / 30
}

// ---------- helpers ----------
class Mulberry32(seed: Int) {
    private var a = seed
    fun next(): Float {
        a += 0x6D2B79F5
        var t = (a xor (a ushr 15)) * (1 or a)
        t = (t + ((t xor (t ushr 7)) * (61 or t))) xor t
        return ((t xor (t ushr 14)).toLong() and 0xFFFFFFFFL).toFloat() / 4294967296f
    }
}

private fun smooth01(x: Float): Float { val t = x.coerceIn(0f, 1f); return t * t * (3 - 2 * t) }
private fun smoothstep(a: Float, b: Float, x: Float) = smooth01((x - a) / (b - a))

/** Velocity fades to 0 within [m] card widths of every card edge (both axes), so ink stays on the paper. */
fun edgeFade(x: Float, y: Float, m: Float): Float {
    val dx = min(x, 1 - x); val dy = min(y, 1 - y) / InkP.aspect
    return smoothstep(0f, m, dx) * smoothstep(0f, m, dy)
}

/** Paper absorbency: one smooth value-noise octave, cells about W/24, Catmull-Rom, mean 0.5, SD 0.22. No lines. */
fun makeFiber(seed: Int, w: Int, h: Int, cells: Int = InkP.fiberScale): FloatArray {
    val rnd = Mulberry32(seed xor 0x9e3779b9.toInt())
    val cw = w.toFloat() / cells
    val gx = cells + 4; val gy = kotlin.math.ceil(h / cw).toInt() + 4
    val lat = FloatArray(gx * gy) { rnd.next() }
    fun cr(p0: Float, p1: Float, p2: Float, p3: Float, t: Float) =
        p1 + 0.5f * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))
    val v = FloatArray(w * h); var sum = 0.0; var sum2 = 0.0
    val row = FloatArray(4)
    for (y in 0 until h) {
        val fy = y / cw + 1; val iy = fy.toInt(); val ty = fy - iy
        for (x in 0 until w) {
            val fx = x / cw + 1; val ix = fx.toInt(); val tx = fx - ix
            for (k in 0 until 4) { val o = (iy - 1 + k) * gx + ix - 1; row[k] = cr(lat[o], lat[o + 1], lat[o + 2], lat[o + 3], tx) }
            val value = cr(row[0], row[1], row[2], row[3], ty)
            v[y * w + x] = value; sum += value; sum2 += value * value
        }
    }
    val n = (w * h).toDouble(); val mean = (sum / n).toFloat()
    val sd = sqrt(max(1e-10, sum2 / n - (sum / n) * (sum / n))).toFloat()
    return FloatArray(w * h) { (0.5f + (v[it] - mean) * 0.22f / sd).coerceIn(0f, 1f) }
}

// ---------- the solver ----------
/** Modes, drops, stirrer and pointer (same rules as ink.js) plus the CPU fluid. Not thread-safe: use one thread. */
class InkSim(private val seed: Int) {
    private val gw = InkP.GW; private val gh = InkP.GH; val iw = InkP.IW; val ih = InkP.IH
    private var u = FloatArray(gw * gh); private var v = FloatArray(gw * gh)
    private var u2 = FloatArray(gw * gh); private var v2 = FloatArray(gw * gh)
    private var p = FloatArray(gw * gh); private var p2 = FloatArray(gw * gh)
    private val dv = FloatArray(gw * gh); private val cu = FloatArray(gw * gh)
    private val ps = FloatArray(gw * gh); private val nu = FloatArray(gw * gh); private val nv = FloatArray(gw * gh)
    private var wet = FloatArray(iw * ih); private var tmp = FloatArray(iw * ih)
    private val dry = FloatArray(iw * ih); private val fwd = FloatArray(iw * ih)
    private val kx = FloatArray(iw * ih); private val ky = FloatArray(iw * ih); private val ks = FloatArray(iw * ih)
    val fiber = makeFiber(seed, iw, ih)
    private var noiseNorm = 1f

    // director state
    var simT = 0.0; private set
    private var rand = Mulberry32(seed)
    private var noiseSeed = floatArrayOf(0f, 0f)
    private var auto = true
    private var lastDropT = -1e9; private var nextAutoT = 0.0; private var autoIdx = 0
    private var lastInputT = -1e9; private var lastInputCoarse = false
    private var stirFrom = 0f; private var stirTo = 0f; private var stirT0 = 0.0; private var stirDur = 1.0
    private val queue = ArrayDeque<FloatArray>()
    private class Pour(val x: Float, val y: Float, val r: Float, val amount: Float, val s: Float, var t: Float)
    private val pours = ArrayList<Pour>()
    private class Burst(val x: Float, val y: Float, var age: Float)
    private val bursts = ArrayList<Burst>()
    private var px = 0.5f; private var py = 0.5f; private var ppx = 0.5f; private var ppy = 0.5f
    private var pt = 0.0; private var ppt = 0.0
    private var moved = false; private var inside = false; private var down = false

    // the pre-run happens in reset(), off the main thread (see Ink())
    init { calibrateNoise() }

    fun reset(reduced: Boolean) {
        rand = Mulberry32(seed)
        noiseSeed = floatArrayOf(rand.next() * 100, rand.next() * 100)
        u.fill(0f); v.fill(0f); p.fill(0f); wet.fill(0f); dry.fill(0f)
        auto = true; lastDropT = -1e9; lastInputT = -1e9; queue.clear(); pours.clear(); bursts.clear()
        moved = false; inside = false; down = false; autoIdx = 0; nextAutoT = 0.0; simT = 0.0
        // the first visible frame is a drop that has just burst: run the first 0.6 s offscreen
        repeat((InkP.prerun / InkP.stepMs).roundToInt()) { step(InkP.stepMs) }
        stirFrom = 0f; stirTo = if (reduced) 0f else 1f; stirT0 = simT; stirDur = InkP.stirIn
    }

    private fun currentStir(): Float {
        val k = if (stirDur > 0) min(1.0, (simT - stirT0) / stirDur).toFloat() else 1f
        val e = if (stirTo > stirFrom) smooth01(k) else k
        return stirFrom + (stirTo - stirFrom) * e
    }
    private fun setStir(to: Float, dur: Double) { stirFrom = currentStir(); stirTo = to; stirT0 = simT; stirDur = dur }

    private fun drop(x: Float, y: Float) {
        val s = rand.next() * 100
        splatVel(x, y, 0f, 0f, InkP.burstR, 0f, InkP.dropImpulse, s)
        pours.add(Pour(x, y, InkP.dropR, InkP.dropPeak * InkP.dropAmount, s, 0f))
        bursts.add(0, Burst(x, y / InkP.aspect, 0f))
        while (bursts.size > 4) bursts.removeAt(bursts.size - 1)
        lastDropT = simT
    }
    private fun easeOut(k: Float): Float { val t = k.coerceIn(0f, 1f); return 1 - (1 - t) * (1 - t) * (1 - t) }

    fun step(dtMs: Double) {
        val dt = dtMs.toFloat()
        while (queue.isNotEmpty()) { val q = queue.removeFirst(); drop(q[0], q[1]) }
        if (auto && simT >= nextAutoT) {
            val pnt = InkP.autoPts[autoIdx % InkP.autoPts.size]
            drop(pnt[0], pnt[1]); autoIdx++; nextAutoT = simT + InkP.autoEvery
        }
        // each drop is poured in over 180 ms with an ease-out, never in one frame
        val iter = pours.iterator()
        while (iter.hasNext()) {
            val q = iter.next()
            val k0 = easeOut(q.t / InkP.dropIn); val k1 = easeOut((q.t + dt) / InkP.dropIn)
            splatInk(q.x, q.y, q.r, q.amount * (k1 - k0), q.s)
            q.t += dt
            if (q.t >= InkP.dropIn) iter.remove()
        }
        val gain = currentStir()
        if (gain > 0.001f) {
            val w = (2 * PI / InkP.stirPeriod).toFloat(); val t = simT.toFloat()
            val sx = 0.5f + InkP.stirAx * sin(w * t); val sy = 0.5f + InkP.stirAy * sin(2 * w * t)
            val vx = InkP.stirAx * w * cos(w * t) * 1000 * InkP.stirForce
            val vy = InkP.stirAy * 2 * w * cos(2 * w * t) * 1000 / InkP.aspect * InkP.stirForce
            splatVel(sx, sy, vx, vy, InkP.stirR, gain * (1 - 0.5f.pow(dt / InkP.stepMs.toFloat())), 0f, 0f)
        }
        if (moved) {
            val dts = (max(1.0, pt - ppt) / 1000).toFloat()
            var vx = (px - ppx) / dts * InkP.moveGain
            var vy = (py - ppy) / InkP.aspect / dts * InkP.moveGain
            val m = sqrt(vx * vx + vy * vy)
            if (m > InkP.moveMax) { vx *= InkP.moveMax / m; vy *= InkP.moveMax / m }
            splatVel(px, py, vx, vy, InkP.moveR, 1f, 0f, 0f)
            ppx = px; ppy = py; ppt = pt; moved = false
        }
        simulate(dt)
        for (b in bursts) b.age += dt
        bursts.removeAll { InkP.dropImpulse * 0.5f.pow(it.age / InkP.velHalfLife) < 0.004f }
        simT += dtMs
        if (!auto && simT - lastInputT > (if (lastInputCoarse) InkP.idleCoarse else InkP.idleFine)) {
            auto = true; setStir(1f, InkP.stirIn); nextAutoT = simT + InkP.resumeDropDelay
        }
    }

    // ---- pointer (card units) ----
    private fun takeOver(coarse: Boolean) {
        lastInputT = simT; lastInputCoarse = coarse
        if (auto) { auto = false; setStir(0f, InkP.stirOut) }
    }
    fun move(x: Float, y: Float, coarse: Boolean) {
        if (!inside) { ppx = x; ppy = y; ppt = simT - 16 }
        inside = true; px = x; py = y; pt = simT; moved = true
        takeOver(coarse)
    }
    fun leave() { if (!down) inside = false }
    fun press(x: Float, y: Float, coarse: Boolean) {
        takeOver(coarse)
        down = true; inside = true
        px = x; ppx = x; py = y; ppy = y; pt = simT; ppt = simT
        if (simT - lastDropT >= InkP.dropGap) { queue.addLast(floatArrayOf(x, y)); lastDropT = simT }
    }
    fun release() { down = false }

    // ---- fluid ----
    private fun at(a: FloatArray, w: Int, h: Int, x: Int, y: Int) = a[y.coerceIn(0, h - 1) * w + x.coerceIn(0, w - 1)]
    private fun samp(a: FloatArray, w: Int, h: Int, x: Float, y: Float): Float {
        val fx = (x * w - 0.5f).coerceIn(0f, (w - 1).toFloat()); val fy = (y * h - 0.5f).coerceIn(0f, (h - 1).toFloat())
        val x0 = fx.toInt(); val y0 = fy.toInt(); val x1 = min(x0 + 1, w - 1); val y1 = min(y0 + 1, h - 1)
        val tx = fx - x0; val ty = fy - y0
        val a0 = a[y0 * w + x0] + (a[y0 * w + x1] - a[y0 * w + x0]) * tx
        val a1 = a[y1 * w + x0] + (a[y1 * w + x1] - a[y1 * w + x0]) * tx
        return a0 + (a1 - a0) * ty
    }

    private fun splatVel(x: Float, y: Float, fx: Float, fy: Float, r: Float, blend: Float, radial: Float, seed: Float) {
        for (j in 0 until gh) for (i in 0 until gw) {
            val dx = (i + 0.5f) / gw - x; val dy = ((j + 0.5f) / gh - y) / InkP.aspect
            val k = exp(-(dx * dx + dy * dy) / (r * r)) * blend
            val id = j * gw + i
            u[id] += (fx - u[id]) * k; v[id] += (fy - v[id]) * k
            if (radial > 0) {
                val rr = sqrt(dx * dx + dy * dy); val a = atan2(dy, dx); val q = rr / r
                // low orders only: a few long lobes rather than many short jets
                val wob = 1 + 0.2f * sin(a * 5 + seed) + 0.17f * sin(a * 8 + seed * 2.31f)
                val s = radial * q * exp(0.5f * (1 - q * q)) * wob / max(rr, 1e-5f)
                u[id] += dx * s; v[id] += dy * s
            }
        }
    }

    /** Ink with the profile amount·(1 − q²)², q = distance / (r · low-order wobble): graded, no flat fill. */
    private fun splatInk(x: Float, y: Float, r: Float, amount: Float, seed: Float) {
        val x0 = max(0, ((x - r * 1.2f) * iw).toInt()); val x1 = min(iw - 1, ((x + r * 1.2f) * iw).toInt() + 1)
        val ry = r * 1.2f * InkP.aspect
        val y0 = max(0, ((y - ry) * ih).toInt()); val y1 = min(ih - 1, ((y + ry) * ih).toInt() + 1)
        for (j in y0..y1) for (i in x0..x1) {
            val dx = (i + 0.5f) / iw - x; val dy = ((j + 0.5f) / ih - y) / InkP.aspect
            val rr = sqrt(dx * dx + dy * dy); val a = atan2(dy, dx)
            val e = r * (1 + 0.07f * sin(a * 3 + seed) + 0.05f * sin(a * 5 + seed * 1.7f))
            val q = min(rr / e, 1f); val k = 1 - q * q
            wet[j * iw + i] = min(wet[j * iw + i] + amount * k * k, 1.6f)
        }
    }

    // smooth 3D value noise (quintic), the CPU stand-in for simplex; its scale is calibrated once
    private fun hash(x: Int, y: Int, z: Int): Float {
        var h = x * 374761393 + y * 668265263 + z * 2147483647
        h = (h xor (h ushr 13)) * 1274126177
        return ((h xor (h ushr 16)).toLong() and 0xFFFFFFFFL).toFloat() / 4294967296f * 2 - 1
    }
    private fun vnoise(x: Float, y: Float, z: Float): Float {
        val xi = floor(x); val yi = floor(y); val zi = floor(z)
        fun q(t: Float) = t * t * t * (t * (t * 6 - 15) + 10)
        fun l(a: Float, b: Float, t: Float) = a + (b - a) * t
        val ux = q(x - xi); val uy = q(y - yi); val uz = q(z - zi)
        val X = xi.toInt(); val Y = yi.toInt(); val Z = zi.toInt()
        return l(l(l(hash(X, Y, Z), hash(X + 1, Y, Z), ux), l(hash(X, Y + 1, Z), hash(X + 1, Y + 1, Z), ux), uy),
                 l(l(hash(X, Y, Z + 1), hash(X + 1, Y, Z + 1), ux), l(hash(X, Y + 1, Z + 1), hash(X + 1, Y + 1, Z + 1), ux), uy), uz)
    }
    private fun noiseField(t: Float, scale: Float) {
        val s0 = noiseSeed[0]; val s1 = noiseSeed[1]
        for (j in 0 until gh) for (i in 0 until gw) {
            val x = (i + 0.5f) / gw; val y = (j + 0.5f) / gh / InkP.aspect
            ps[j * gw + i] = (InkP.noiseW1 * vnoise(x * InkP.noiseK1 + s0, y * InkP.noiseK1 + s1, t * InkP.noiseS1) / InkP.noiseK1 +
                    InkP.noiseW2 * vnoise(x * InkP.noiseK2 - s1, y * InkP.noiseK2 - s0, t * InkP.noiseS2 + 7.3f) / InkP.noiseK2) * scale
        }
        val h = 1f / gw   // grid spacing in W, both axes
        for (j in 0 until gh) for (i in 0 until gw) {
            nu[j * gw + i] = (at(ps, gw, gh, i, j + 1) - at(ps, gw, gh, i, j - 1)) / (2 * h)
            nv[j * gw + i] = -(at(ps, gw, gh, i + 1, j) - at(ps, gw, gh, i - 1, j)) / (2 * h)
        }
    }
    /** Measure the value noise's RMS speed once and scale it to 0.06 W/s. */
    private fun calibrateNoise() {
        noiseField(0f, 1f)
        var s2 = 0f
        for (k in nu.indices) s2 += nu[k] * nu[k] + nv[k] * nv[k]
        val rms = sqrt(s2 / nu.size)
        noiseNorm = if (rms > 0) InkP.noiseAmp / rms else 0f
    }

    private fun simulate(dtMs: Float) {
        val dt = dtMs / 1000; val h = 1f / gw; val invH = gw.toFloat()
        // vorticity confinement
        for (j in 0 until gh) for (i in 0 until gw)
            cu[j * gw + i] = 0.5f * (at(v, gw, gh, i + 1, j) - at(v, gw, gh, i - 1, j) - at(u, gw, gh, i, j + 1) + at(u, gw, gh, i, j - 1)) * invH
        for (j in 0 until gh) for (i in 0 until gw) {
            val l = abs(at(cu, gw, gh, i - 1, j)); val r = abs(at(cu, gw, gh, i + 1, j))
            val b = abs(at(cu, gw, gh, i, j - 1)); val t = abs(at(cu, gw, gh, i, j + 1))
            var nx = t - b; var ny = r - l
            val len = sqrt(nx * nx + ny * ny) + 1e-5f; nx /= len; ny /= len
            val id = j * gw + i; val c = cu[id]
            u[id] = (u[id] + InkP.vorticity * h * c * nx * dt).coerceIn(-8f, 8f)
            v[id] = (v[id] - InkP.vorticity * h * c * ny * dt).coerceIn(-8f, 8f)
        }
        // projection: divergence with walls, warm-started Jacobi, gradient subtraction
        for (j in 0 until gh) for (i in 0 until gw) {
            val id = j * gw + i
            val l = if (i == 0) -u[id] else u[id - 1]; val r = if (i == gw - 1) -u[id] else u[id + 1]
            val b = if (j == 0) -v[id] else v[id - gw]; val t = if (j == gh - 1) -v[id] else v[id + gw]
            dv[id] = 0.5f * (r - l + t - b) * invH
            p[id] *= InkP.pressureWarm
        }
        repeat(InkP.jacobi) {
            for (j in 0 until gh) for (i in 0 until gw)
                p2[j * gw + i] = (at(p, gw, gh, i - 1, j) + at(p, gw, gh, i + 1, j) + at(p, gw, gh, i, j - 1) + at(p, gw, gh, i, j + 1) - dv[j * gw + i] * h * h) * 0.25f
            val s = p; p = p2; p2 = s
        }
        for (j in 0 until gh) for (i in 0 until gw) {
            val id = j * gw + i
            u[id] -= 0.5f * invH * (at(p, gw, gh, i + 1, j) - at(p, gw, gh, i - 1, j))
            v[id] -= 0.5f * invH * (at(p, gw, gh, i, j + 1) - at(p, gw, gh, i, j - 1))
        }
        // advection with decay, walls and the soft 0.06W margin
        val vd = 0.5f.pow(dtMs / InkP.velHalfLife)
        for (j in 0 until gh) for (i in 0 until gw) {
            val id = j * gw + i
            val x = (i + 0.5f) / gw; val y = (j + 0.5f) / gh
            val cx = x - dt * u[id]; val cy = y - dt * v[id] * InkP.aspect
            val f = edgeFade(x, y, InkP.edgeMargin) * vd
            u2[id] = if (i == 0 || i == gw - 1) 0f else samp(u, gw, gh, cx, cy) * f
            v2[id] = if (j == 0 || j == gh - 1) 0f else samp(v, gw, gh, cx, cy) * f
        }
        run { val s = u; u = u2; u2 = s }; run { val s = v; v = v2; v2 = s }
        // ink transport at ink resolution: grid + curl noise + drop sources, faded at the margin
        noiseField((simT / 1000).toFloat(), noiseNorm)
        val bs = bursts.filter { InkP.dropImpulse * 0.5f.pow(it.age / InkP.velHalfLife) >= 0.004f }
        for (j in 0 until ih) for (i in 0 until iw) {
            val x = (i + 0.5f) / iw; val y = (j + 0.5f) / ih
            val gx = samp(u, gw, gh, x, y); val gy = samp(v, gw, gh, x, y)
            var ax = gx + samp(nu, gw, gh, x, y); var ay = gy + samp(nv, gw, gh, x, y)
            val wy = y / InkP.aspect
            for (b in bs) {
                // a source with a soft core: v = A R (1 - e^-q^2) / r
                val amp = InkP.dropImpulse * 0.5f.pow(b.age / InkP.velHalfLife)
                val dx = x - b.x; val dy = wy - b.y; val r2 = max(dx * dx + dy * dy, 1e-10f)
                val s = amp * InkP.burstR * (1 - exp(-r2 / (InkP.burstR * InkP.burstR))) / r2
                ax += dx * s; ay += dy * s
            }
            val f = edgeFade(x, y, InkP.edgeMargin); val id = j * iw + i
            kx[id] = ax * f; ky[id] = ay * f; ks[id] = sqrt(gx * gx + gy * gy)
        }
        // limited MacCormack with RK2 departure points, clamped to >= 0, then soak and decay
        val out = FloatArray(2)
        fun tr(x: Float, y: Float, s: Float) {
            val mx = x - 0.5f * s * dt * samp(kx, iw, ih, x, y); val my = y - 0.5f * s * dt * samp(ky, iw, ih, x, y) * InkP.aspect
            out[0] = x - s * dt * samp(kx, iw, ih, mx, my); out[1] = y - s * dt * samp(ky, iw, ih, mx, my) * InkP.aspect
        }
        for (j in 0 until ih) for (i in 0 until iw) {
            tr((i + 0.5f) / iw, (j + 0.5f) / ih, 1f)
            fwd[j * iw + i] = samp(wet, iw, ih, out[0], out[1])
        }
        val idc = 0.5f.pow(dtMs / InkP.inkHalfLife)
        for (j in 0 until ih) for (i in 0 until iw) {
            val id = j * iw + i
            val x = (i + 0.5f) / iw; val y = (j + 0.5f) / ih
            tr(x, y, -1f)
            var a = fwd[id] + 0.5f * (wet[id] - samp(fwd, iw, ih, out[0], out[1]))
            tr(x, y, 1f)
            val x0 = floor(out[0] * iw - 0.5f).toInt(); val y0 = floor(out[1] * ih - 0.5f).toInt()
            val s00 = at(wet, iw, ih, x0, y0); val s10 = at(wet, iw, ih, x0 + 1, y0)
            val s01 = at(wet, iw, ih, x0, y0 + 1); val s11 = at(wet, iw, ih, x0 + 1, y0 + 1)
            a = a.coerceIn(minOf(s00, s10, s01, s11), maxOf(s00, s10, s01, s11))
            val n0 = at(fwd, iw, ih, i + 1, j); val n1 = at(fwd, iw, ih, i - 1, j)
            val n2 = at(fwd, iw, ih, i, j + 1); val n3 = at(fwd, iw, ih, i, j - 1)
            a = a.coerceIn(minOf(minOf(n0, n1, n2), minOf(n3, fwd[id])), maxOf(maxOf(n0, n1, n2), maxOf(n3, fwd[id])))
            a = max(a, 0f)
            val soak = InkP.soakRate * (0.6f + InkP.soakFiber * fiber[id]) * exp(-ks[id] / InkP.soakStill) * a * dt
            tmp[id] = max(a - soak, 0f) * idc
            dry[id] = min(dry[id] + soak, 1.6f) * idc
        }
        run { val s = wet; wet = tmp; tmp = s }
    }

    /** Raw ink (wet + dry, 0…1) as ARGB, value in red: the AGSL path does the shading on the GPU. */
    fun rawInto(px: IntArray) {
        for (k in px.indices) {
            val d = ((wet[k] + dry[k]).coerceIn(0f, 1f) * 255).roundToInt()
            px[k] = (0xFF shl 24) or (d shl 16)
        }
    }

    /** CPU shading below API 33: unsharp, edge pooling 0.18 on a gaussian slope, paper absorption, colour. */
    fun shadeInto(px: IntArray) {
        fun d(i: Int, j: Int) = at(wet, iw, ih, i, j) + at(dry, iw, ih, i, j)
        val sig = 0.6f; val k2 = 0.5f / (sig * sig)
        val ox = intArrayOf(1, -1, 0, 0, 1, -1, 1, -1); val oy = intArrayOf(0, 0, 1, -1, 1, 1, -1, -1)
        for (j in 0 until ih) for (i in 0 until iw) {
            val c = max(d(i, j), 0f)
            var lo = c; var hi = c; var blur = c * 0.25f
            for (k in 0 until 8) { val s = d(i + ox[k], j + oy[k]); blur += s * (if (k < 4) 0.125f else 0.0625f); lo = min(lo, s); hi = max(hi, s) }
            val dd = (c + InkP.crisp * (c - blur)).coerceIn(lo, hi)
            var gx = 0f; var gy = 0f; var wn = 0f
            for (b in -2..2) for (a in -2..2) { val w = exp(-(a * a + b * b) * k2); val s = d(i + a, j + b); gx += w * a * s; gy += w * b * s; wn += w * a * a }
            var dp = min(dd + InkP.poolK * sqrt(gx * gx + gy * gy) / wn * (dd * 4).coerceIn(0f, 1f), 1f)
            dp = dp.coerceIn(0f, 1f) * (InkP.fiberBase + InkP.fiberAmp * fiber[j * iw + i])
            val cov = min(1 - exp(-InkP.absorbK * dp), InkP.maxDensity)
            val r = ((InkP.paper[0] + (InkP.ink[0] - InkP.paper[0]) * cov) * 255).roundToInt()
            val g = ((InkP.paper[1] + (InkP.ink[1] - InkP.paper[1]) * cov) * 255).roundToInt()
            val bl = ((InkP.paper[2] + (InkP.ink[2] - InkP.paper[2]) * cov) * 255).roundToInt()
            px[j * iw + i] = (0xFF shl 24) or (r shl 16) or (g shl 8) or bl
        }
    }
}

// ---------- AGSL shading (API 33+) ----------
private const val INK_AGSL = """
uniform shader ink;      // raw ink 0..1 in red, IW x IH
uniform shader fiber;    // absorbency in red, IW x IH
uniform float2 inkSize;
uniform float2 cardSize;
uniform float absorb; uniform float maxD; uniform float poolK; uniform float crisp;
uniform float fb; uniform float fa;
uniform half3 paper; uniform half3 inkc;

float D(float2 t) { return ink.eval(t).r; }   // t in ink texels

half4 main(float2 xy) {
  float2 t = xy / cardSize * inkSize;
  float c = max(D(t), 0.0);
  float r = D(t + float2(1, 0)), l = D(t - float2(1, 0)), up = D(t + float2(0, 1)), dn = D(t - float2(0, 1));
  float ne = D(t + float2(1, 1)), nw = D(t + float2(-1, 1)), se = D(t + float2(1, -1)), sw = D(t + float2(-1, -1));
  float blur = (r + l + up + dn) * 0.125 + (ne + nw + se + sw) * 0.0625 + c * 0.25;
  float lo = min(min(min(r, l), min(up, dn)), min(min(ne, nw), min(min(se, sw), c)));
  float hi = max(max(max(r, l), max(up, dn)), max(max(ne, nw), max(max(se, sw), c)));
  float d = clamp(c + crisp * (c - blur), lo, hi);
  // edge pooling d' = d + 0.18 |grad d| on a small gaussian (5x5, sigma 0.6 ink texels)
  float2 gs = float2(0); float wn = 0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      float2 o = float2(float(i), float(j));
      float w = exp(-dot(o, o) * 1.3889);
      gs += w * o * D(t + o);
      wn += w * o.x * o.x;
    }
  }
  float dp = min(d + poolK * length(gs) / wn * clamp(d * 4.0, 0.0, 1.0), 1.0);
  dp = clamp(dp, 0.0, 1.0) * (fb + fa * fiber.eval(t).r);   // paper absorption, smooth noise only
  float cov = min(1.0 - exp(-absorb * dp), maxD);            // never pure black
  return half4(mix(paper, inkc, half(cov)), 1.0);
}
"""

@RequiresApi(33)
private class InkShading(fiberBmp: Bitmap) {
    val shader = RuntimeShader(INK_AGSL)
    init {
        val fs = BitmapShader(fiberBmp, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        shader.setInputShader("fiber", fs)
        shader.setFloatUniform("inkSize", InkP.IW.toFloat(), InkP.IH.toFloat())
        shader.setFloatUniform("absorb", InkP.absorbK); shader.setFloatUniform("maxD", InkP.maxDensity)
        shader.setFloatUniform("poolK", InkP.poolK); shader.setFloatUniform("crisp", InkP.crisp)
        shader.setFloatUniform("fb", InkP.fiberBase); shader.setFloatUniform("fa", InkP.fiberAmp)
        shader.setFloatUniform("paper", InkP.paper[0], InkP.paper[1], InkP.paper[2])
        shader.setFloatUniform("inkc", InkP.ink[0], InkP.ink[1], InkP.ink[2])
    }
    fun update(raw: Bitmap, w: Float, h: Float) {
        val s = BitmapShader(raw, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        s.setFilterMode(BitmapShader.FILTER_MODE_LINEAR)
        shader.setInputShader("ink", s)
        shader.setFloatUniform("cardSize", w, h)
    }
}

// ---------- composable ----------
/**
 * Lumen 012 · Ink. Fills its parent; the card is W = min(760dp, 76% width, 120% height), 3:2,
 * centred (portrait: centre at 46% height). Needs res/font/jetbrains_mono_regular.ttf and
 * res/drawable-nodpi/grain.png in your module's R.
 */
@Composable
fun Ink(modifier: Modifier = Modifier, seed: Int = remember { (Math.random() * Int.MAX_VALUE).toInt() }) {
    val context = LocalContext.current
    // Reduce Motion stand-in: system animations off (ANIMATOR_DURATION_SCALE = 0) → still pre-run frame only
    val reduced = remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    val sim = remember(seed) { InkSim(seed) }
    val iw = InkP.IW; val ih = InkP.IH
    val agsl = Build.VERSION.SDK_INT >= 33
    // two bitmaps, swapped each frame, so the one being drawn is never the one being written
    val bitmaps = remember(seed) { arrayOf(Bitmap.createBitmap(iw, ih, Bitmap.Config.ARGB_8888), Bitmap.createBitmap(iw, ih, Bitmap.Config.ARGB_8888)) }
    val pixels = remember(seed) { IntArray(iw * ih) }
    var shown by remember(seed) { mutableStateOf<Bitmap?>(null) }
    var frameNo by remember(seed) { mutableStateOf(0) }
    val shading = remember(seed) {
        if (agsl) {
            val fb = Bitmap.createBitmap(iw, ih, Bitmap.Config.ARGB_8888)
            fb.setPixels(IntArray(iw * ih) { (0xFF shl 24) or ((sim.fiber[it] * 255).roundToInt() shl 16) }, 0, iw, 0, 0, iw, ih)
            InkShadingHolder(InkShading(fb))
        } else null
    }
    val jbMono = remember { FontFamily(Font(R.font.jetbrains_mono_regular)) }
    val grain = ImageBitmap.imageResource(R.drawable.grain)

    LaunchedEffect(sim, reduced) {
        var w = 0
        suspend fun produce() {
            val b = bitmaps[w]; w = 1 - w
            withContext(Dispatchers.Default) {
                synchronized(sim) { if (agsl) sim.rawInto(pixels) else sim.shadeInto(pixels) }
                b.setPixels(pixels, 0, iw, 0, 0, iw, ih)
            }
            shown = b; frameNo++
        }
        withContext(Dispatchers.Default) { synchronized(sim) { sim.reset(reduced) } }
        produce()
        if (reduced) return@LaunchedEffect
        var last = -1L
        while (isActive) {
            val now = withFrameNanos { it }
            val dt = if (last < 0) InkP.stepMs else ((now - last) / 1e6).coerceIn(0.0, InkP.maxDt)
            last = now
            withContext(Dispatchers.Default) { synchronized(sim) { sim.step(dt) } }   // the solver runs off the main thread
            produce()
        }
    }

    BoxWithConstraints(modifier.fillMaxSize().background(InkP.bg)) {
        val portrait = maxHeight > maxWidth
        val wDp = minOf(InkP.wMaxDp, InkP.wVw * maxWidth.value, InkP.wVh * maxHeight.value)
        val hDp = wDp * 2 / 3
        val inset = (InkP.insetR * wDp).dp
        val density = LocalDensity.current
        val cy = if (portrait) InkP.portraitCy else 0.5f
        val left = (maxWidth.value - wDp) / 2; val top = maxHeight.value * cy - hDp / 2
        Box(
            Modifier
                .offset { with(density) { IntOffset(left.dp.roundToPx(), top.dp.roundToPx()) } }
                .size(wDp.dp, hDp.dp)
                .clip(RoundedCornerShape(InkP.radiusDp.dp))
                .semantics { contentDescription = "Ink drop on paper" }
                .pointerInput(sim, reduced) {
                    if (reduced) return@pointerInput
                    awaitPointerEventScope {
                        var down = false
                        while (true) {
                            val e = awaitPointerEvent()
                            val c = e.changes.firstOrNull() ?: continue
                            val x = c.position.x / size.width; val y = c.position.y / size.height
                            val coarse = c.type != PointerType.Mouse && c.type != PointerType.Stylus
                            synchronized(sim) {
                                when (e.type) {
                                    PointerEventType.Press -> { down = true; sim.press(x, y, coarse) }
                                    PointerEventType.Release -> { down = false; sim.release() }
                                    PointerEventType.Move -> sim.move(x, y, coarse)   // hover or drag both stir
                                    PointerEventType.Exit -> if (!down) sim.leave()
                                    else -> {}
                                }
                            }
                            c.consume()
                        }
                    }
                }
        ) {
            Canvas(Modifier.fillMaxSize()) {
                if (frameNo < 0) return@Canvas   // reading frameNo redraws on every new frame
                val b = shown ?: run { drawRect(Color(InkP.paper[0], InkP.paper[1], InkP.paper[2])); return@Canvas }
                if (shading != null && Build.VERSION.SDK_INT >= 33) {
                    shading.update(b, size.width, size.height)
                    drawRect(shading.brush)
                } else {
                    drawImage(b.asImageBitmap(), dstSize = IntSize(size.width.roundToInt(), size.height.roundToInt()), filterQuality = FilterQuality.High)
                }
            }
            // static 3% grain, tiled
            Canvas(Modifier.fillMaxSize()) {
                drawRect(ShaderBrush(ImageShader(grain, TileMode.Repeated, TileMode.Repeated)), alpha = InkP.grainAlpha)
            }
            val style = TextStyle(fontFamily = jbMono, fontSize = InkP.labelSp.sp, letterSpacing = InkP.labelTracking.em, color = InkP.label)
            Text("LUMEN", style = style, modifier = Modifier.align(Alignment.TopStart).padding(start = inset, top = inset))
            Text("Nº 012", style = style, modifier = Modifier.align(Alignment.TopEnd).padding(end = inset, top = inset))
            Text("Ink", style = style, modifier = Modifier.align(Alignment.BottomStart).padding(start = inset, bottom = inset))
        }
    }
}

/** Keeps the API 33 class out of the composable's signature on older devices. */
private class InkShadingHolder(private val s: Any) {
    @RequiresApi(33)
    fun update(b: Bitmap, w: Float, h: Float) = (s as InkShading).update(b, w, h)
    val brush: ShaderBrush
        @RequiresApi(33) get() = ShaderBrush((s as InkShading).shader)
}
