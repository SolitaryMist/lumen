// Lumen 010 · Split Flap — Jetpack Compose
// Every letter falls into place.
// Source only: written to match the web piece, not compiled, not run on a device.
//
// Motion is a pure function of time (withFrameMillis), with the same numbers as
// split-flap.js: 64ms steps, 32ms per half on cubic-bezier(0.55,0,0.9,0.4),
// a 4deg rebound on the last step, 40ms column stagger, 2000ms per word.
// Flaps use graphicsLayer rotationX + transformOrigin, cameraDistance 12 * density.
// The perspective strength still needs a side-by-side visual check against web.

package lumen.splitflap

import android.graphics.BitmapShader
import android.graphics.Matrix
import android.graphics.Shader
import android.provider.Settings
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.PointerType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

// ---------- parameters ----------

object SF {
    val bg = Color(0xFF0B0B0C)
    val flapTop = Color(0xFF17171A)
    val flapBottom = Color(0xFF141417)
    val ink = Color(0xFFE8E6E1)
    val dim = Color(0xFF8A8A8E)
    val amber = Color(0xFFFFB547)
    val edge = Color.White.copy(alpha = 0.04f)
    const val grainSizeDp = 128f
    const val grainAlpha = 0.03f

    const val wMin = 52f; const val wVw = 0.11f; const val wMax = 132f
    const val hRatio = 1.42f; const val gapR = 0.08f; const val radiusR = 0.06f; const val fontR = 0.86f
    const val smallR = 0.5f; const val rowGapR = 0.3f
    const val portraitCenter = 0.45f
    const val hingePx = 2f
    const val capRatio = 0.71f // Geist cap height / em

    val words = listOf("MESH" to "002", "WEIGHT" to "003", "STACK" to "004", "LENS" to "009")
    const val cols = 6
    const val wordMs = 2000.0
    const val firstWordAt = 200.0
    const val introFade = 160.0

    const val stepMs = 64.0
    const val halfMs = 32.0
    val fall = Bezier(0.55, 0.0, 0.9, 0.4)
    val steps = intArrayOf(5, 6, 7, 8, 6, 7)
    val numSteps = intArrayOf(5, 6, 7)
    const val colStagger = 40.0
    const val numDelay = 120.0

    // Last step: rebound to 4deg over 160ms. Spring reference from the spec is
    // stiffness 600 / damping 20; the drawn shape is the overshoot of
    // cubic-bezier(0.34,1.4,0.64,1), same as web.
    const val reboundDeg = 4.0
    const val reboundMs = 160.0
    val reboundCurve = Bezier(0.34, 1.4, 0.64, 1.0)

    const val cameraDistance = 12f // multiplied by density
    const val topShade = 0.45f
    const val coverShade = 0.35f
    const val riseShade = 0.45f

    const val amberHold = 900.0
    const val amberFade = 400.0
    val amberEase = Bezier(0.4, 0.0, 0.2, 1.0)

    const val hoverSteps = 4
    const val hoverGapMs = 320.0
    const val reducedFade = 160.0

    const val label = "LUMEN · Split Flap · Nº 010"
    const val letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ "
    const val digits = "0123456789"
}

class Bezier(private val x1: Double, private val y1: Double, private val x2: Double, private val y2: Double) {
    private fun cx(t: Double) = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t
    private fun cy(t: Double) = 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t
    operator fun invoke(x: Double): Double {
        if (x <= 0) return 0.0
        if (x >= 1) return 1.0
        var lo = 0.0; var hi = 1.0; var t = x
        repeat(40) {
            val v = cx(t)
            if (abs(v - x) < 1e-7) return cy(t)
            if (v < x) lo = t else hi = t
            t = (lo + hi) / 2
        }
        return cy(t)
    }
}

object Rebound {
    private val xCross: Double
    private val yPeak: Double
    init {
        var xc = 0.0; var yp = 1.0
        for (i in 1..2000) {
            val x = i / 2000.0; val y = SF.reboundCurve(x)
            if (xc == 0.0 && y >= 1) xc = x
            if (y > yp) yp = y
        }
        xCross = xc; yPeak = yp
    }
    fun angle(ms: Double): Double {
        val p = ms / SF.reboundMs
        if (p <= 0 || p >= 1) return 0.0
        val y = SF.reboundCurve(xCross + p * (1 - xCross))
        return SF.reboundDeg * max(0.0, y - 1) / (yPeak - 1)
    }
}

fun flapSequence(target: Char, n: Int, drum: String): List<Char> {
    val len = drum.length
    val idx = drum.indexOf(target).coerceAtLeast(0)
    return (0 until n).map { k -> drum[((idx - n + 1 + k) % len + len) % len] }
}

// ---------- model (plain state, read once per frame) ----------

data class FlapStep(val ch: Char, val t0: Double, val last: Boolean, val reduced: Boolean)

class FlapCell(val isLetter: Boolean) {
    var char0: Char = if (isLetter) ' ' else '0'
    val steps = ArrayList<FlapStep>()
    var target: Char = char0
    var lastHover = -1e9
    fun end(s: FlapStep) = s.t0 + if (s.reduced) SF.reducedFade else SF.stepMs
    val busyUntil get() = steps.lastOrNull()?.let { end(it) } ?: -1e9
}

class CellFrame {
    var top = ' '; var bottom = ' '; var color = SF.ink
    var flapTop: Char? = null; var topAngle = 0f; var topShade = 0f
    var flapBottom: Char? = null; var bottomAngle = 0f; var bottomShade = 0f; var flapBottomColor = SF.ink
    var cover = 0f
    var fadeTo: Char? = null; var fade = 0f; var fadeColor = SF.ink
}

class SplitFlapModel {
    val letters = List(SF.cols) { FlapCell(true) }
    val nums = List(3) { FlapCell(false) }
    var now = 0.0
    var reduced = false
    var lastHoverCol = -1
    private var wordIndex = -1
    private var nextWordAt = SF.firstWordAt
    private var amberCell: FlapCell? = null
    private var amberT0 = 0.0

    private fun schedule(cell: FlapCell, input: List<Char>, start: Double): FlapStep {
        cell.steps.removeAll { it.t0 > now }
        var t = start
        cell.steps.lastOrNull()?.let { t = max(t, it.t0 + SF.stepMs) }
        val chars = if (reduced) listOf(input.last()) else input
        chars.forEachIndexed { k, ch -> cell.steps.add(FlapStep(ch, t + k * SF.stepMs, k == chars.lastIndex, reduced)) }
        cell.target = chars.last()
        return cell.steps.last()
    }

    private fun showWord(idx: Int, at: Double) {
        wordIndex = idx
        val (word, no) = SF.words[idx]
        amberCell = null
        var best: FlapCell? = null; var bestStep: FlapStep? = null
        letters.forEachIndexed { i, cell ->
            val target = word.getOrElse(i) { ' ' }
            if (target == ' ' && cell.target == ' ') return@forEachIndexed
            val s = schedule(cell, flapSequence(target, SF.steps[i], SF.letters), at + i * SF.colStagger)
            if (target != ' ' && (bestStep == null || cell.end(s) >= best!!.end(bestStep!!))) { best = cell; bestStep = s }
        }
        nums.forEachIndexed { i, cell ->
            schedule(cell, flapSequence(no[i], SF.numSteps[i], SF.digits), at + SF.numDelay + i * SF.colStagger)
        }
        bestStep?.let { amberCell = best; amberT0 = it.t0 }
        nextWordAt = at + SF.wordMs
    }

    fun next() = showWord((wordIndex + 1) % SF.words.size, now)

    fun advance(ms: Double) {
        now = ms
        while (now >= nextWordAt) showWord((wordIndex + 1) % SF.words.size, nextWordAt)
        for (c in letters + nums) {
            while (c.steps.size > 1 && now >= c.steps[1].t0) c.char0 = c.steps.removeAt(0).ch
        }
    }

    fun hover(col: Int) {
        if (reduced || col !in letters.indices) return
        val cell = letters[col]
        if (now < cell.busyUntil || now - cell.lastHover < SF.hoverGapMs) return
        cell.lastHover = now
        val back = cell.target
        val pool = SF.letters.trim()
        val chars = ArrayList<Char>()
        var prev = back
        repeat(SF.hoverSteps) {
            var ch: Char
            do { ch = pool.random() } while (ch == prev || ch == back)
            chars.add(ch); prev = ch
        }
        chars.add(back)
        if (amberCell === cell) amberCell = null
        schedule(cell, chars, now)
    }

    private fun amberMix(cell: FlapCell): Float {
        if (amberCell !== cell) return 0f
        val s = cell.steps.lastOrNull { it.t0 <= now } ?: return 0f
        if (s.t0 != amberT0) return 0f
        val dt = now - cell.end(s)
        if (dt < 0) return 0f
        if (dt <= SF.amberHold) return 1f
        val p = (dt - SF.amberHold) / SF.amberFade
        return if (p >= 1) 0f else (1 - SF.amberEase(p)).toFloat()
    }

    fun frame(cell: FlapCell): CellFrame {
        val f = CellFrame()
        val a = if (cell.isLetter) amberMix(cell) else 0f
        val settled = lerp(SF.ink, SF.amber, a)
        val k = cell.steps.indexOfLast { it.t0 <= now }
        if (k < 0) { f.top = cell.char0; f.bottom = cell.char0; f.color = settled; return f }
        val s = cell.steps[k]
        val from = if (k > 0) cell.steps[k - 1].ch else cell.char0
        val local = now - s.t0
        if (s.reduced) {
            f.top = from; f.bottom = from
            f.fadeTo = s.ch; f.fade = min(1.0, local / SF.reducedFade).toFloat(); f.fadeColor = settled
            return f
        }
        if (local < SF.stepMs) {
            f.top = s.ch; f.bottom = from
            if (local < SF.halfMs) {
                val e = SF.fall(local / SF.halfMs).toFloat()
                f.flapTop = from; f.topAngle = -90f * e; f.topShade = SF.topShade * e; f.cover = e
            } else {
                val e = SF.fall((local - SF.halfMs) / SF.halfMs).toFloat()
                f.flapBottom = s.ch; f.bottomAngle = 90f * (1 - e); f.bottomShade = SF.riseShade * (1 - e); f.cover = 1 - e
            }
            return f
        }
        f.top = s.ch; f.bottom = s.ch; f.color = settled
        val since = local - SF.stepMs
        if (s.last && since < SF.reboundMs) {
            f.flapBottom = s.ch; f.bottomAngle = Rebound.angle(since).toFloat(); f.flapBottomColor = settled
        }
        return f
    }
}

// ---------- geometry (even device px) ----------

data class FlapSize(val w: Float, val h: Float, val gap: Float, val r: Float, val font: Float) {
    val halfH get() = h / 2 - SF.hingePx / 2
    val botTop get() = h / 2 + SF.hingePx / 2
}

class BoardGeo(widthPx: Float, heightPx: Float, density: Float) {
    private fun even(px: Float) = (px / 2).roundToInt() * 2f
    private fun hinge(px: Float): Float { val d = even(px); return if ((d / 2).toInt() % 2 == 0) d + 2 else d }
    private fun flap(wPx: Float) = FlapSize(even(wPx), hinge(SF.hRatio * wPx), even(SF.gapR * wPx), even(SF.radiusR * wPx), even(SF.fontR * wPx))

    private val wDp = min(SF.wMax, max(SF.wMin, SF.wVw * widthPx / density))
    val big = flap(wDp * density)
    val small = flap(SF.smallR * wDp * density)
    val rowGap = even(SF.rowGapR * wDp * density)
    val boardW = SF.cols * big.w + (SF.cols - 1) * big.gap
    val boardH = big.h + rowGap + small.h
    val left = even((widthPx - boardW) / 2)
    val top = even((if (heightPx > widthPx) SF.portraitCenter else 0.5f) * heightPx - boardH / 2)
}

// ---------- UI ----------

@Composable
fun SplitFlap(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val model = remember { SplitFlapModel() }
    var tick by remember { mutableLongStateOf(0L) }
    val reduced = remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    // Font resources: add Geist SemiBold and JetBrains Mono Regular under res/font.
    val geist = remember { FontFamily(Font(R.font.geist_semibold, FontWeight.SemiBold)) }
    val mono = remember { FontFamily(Font(R.font.jetbrains_mono_regular, FontWeight.Normal)) }
    val grain = ImageBitmap.imageResource(R.drawable.grain)
    val grainBrush = remember(grain, density) {
        val shader = BitmapShader(grain.asAndroidBitmap(), Shader.TileMode.REPEAT, Shader.TileMode.REPEAT)
        val s = SF.grainSizeDp * density.density / grain.width
        shader.setLocalMatrix(Matrix().apply { setScale(s, s) })
        ShaderBrush(shader)
    }

    LaunchedEffect(Unit) {
        var start = -1L
        while (true) {
            withFrameMillis { t ->
                if (start < 0) start = t
                tick = t - start
            }
        }
    }

    BoxWithConstraints(
        modifier
            .fillMaxSize()
            .background(SF.bg)
            .semantics { contentDescription = "Split flap board flipping through Lumen pieces" }
    ) {
        val geo = with(density) { BoardGeo(maxWidth.toPx(), maxHeight.toPx(), this.density) }
        model.reduced = reduced
        model.advance(tick.toDouble())

        Box(
            Modifier
                .fillMaxSize()
                .pointerInput(geo) {
                    awaitPointerEventScope {
                        while (true) {
                            val ev = awaitPointerEvent()
                            val ch = ev.changes.firstOrNull() ?: continue
                            when (ev.type) {
                                PointerEventType.Press -> model.next()
                                PointerEventType.Move, PointerEventType.Enter -> {
                                    if (ch.type != PointerType.Mouse) continue
                                    val x = ch.position.x - geo.left
                                    val y = ch.position.y - geo.top
                                    val pitch = geo.big.w + geo.big.gap
                                    val col = floor(x / pitch).toInt()
                                    val inside = y in 0f..geo.big.h && x >= 0 && x - col * pitch <= geo.big.w
                                    val c = if (inside) col else -1
                                    if (c != model.lastHoverCol && c >= 0) model.hover(c)
                                    model.lastHoverCol = c
                                }
                                PointerEventType.Exit -> model.lastHoverCol = -1
                            }
                        }
                    }
                }
        ) {
            val boardAlpha = min(1.0, model.now / SF.introFade).toFloat()
            Box(Modifier.offset { IntOffset(geo.left.roundToInt(), geo.top.roundToInt()) }.graphicsLayer { alpha = boardAlpha }) {
                Text(
                    SF.label,
                    style = TextStyle(fontFamily = mono, fontWeight = FontWeight.Normal, fontSize = 12.sp, color = SF.dim, letterSpacing = 0.sp),
                    modifier = Modifier.offset { IntOffset(0, -(geo.rowGap + 12 * density.density).roundToInt()) }
                )
                model.letters.forEachIndexed { i, cell ->
                    FlapCellView(model.frame(cell), geo.big, geist, grainBrush,
                        Modifier.offset { IntOffset((i * (geo.big.w + geo.big.gap)).roundToInt(), 0) })
                }
                model.nums.forEachIndexed { i, cell ->
                    FlapCellView(model.frame(cell), geo.small, geist, grainBrush,
                        Modifier.offset { IntOffset((i * (geo.small.w + geo.small.gap)).roundToInt(), (geo.big.h + geo.rowGap).roundToInt()) })
                }
            }
        }
    }
}

@Composable
private fun FlapCellView(f: CellFrame, s: FlapSize, geist: FontFamily, grain: Brush, modifier: Modifier) {
    val density = LocalDensity.current
    val wDp = with(density) { s.w.toDp() }
    val hDp = with(density) { s.h.toDp() }
    Box(modifier.size(wDp, hDp)) {
        // static top: the character being revealed
        Half(top = true, ch = f.top, color = f.color, s = s, geist = geist, grain = grain, fadeTo = f.fadeTo, fade = f.fade, fadeColor = f.fadeColor)
        // static bottom: previous character, darkened while it gets covered
        Half(top = false, ch = f.bottom, color = f.color, s = s, geist = geist, grain = grain, fadeTo = f.fadeTo, fade = f.fade, fadeColor = f.fadeColor, cover = f.cover)
        f.flapTop?.let { ch ->
            Half(top = true, ch = ch, color = SF.ink, s = s, geist = geist, grain = grain, shade = f.topShade,
                layer = Modifier.graphicsLayer {
                    rotationX = f.topAngle
                    transformOrigin = TransformOrigin(0.5f, s.halfH / s.h)
                    cameraDistance = SF.cameraDistance * density.density
                })
        }
        f.flapBottom?.let { ch ->
            Half(top = false, ch = ch, color = f.flapBottomColor, s = s, geist = geist, grain = grain, shade = f.bottomShade,
                layer = Modifier.graphicsLayer {
                    rotationX = f.bottomAngle
                    transformOrigin = TransformOrigin(0.5f, s.botTop / s.h)
                    cameraDistance = SF.cameraDistance * density.density
                })
        }
    }
}

/** One half leaf, drawn in a full-cell layer so transformOrigin is in cell units. */
@Composable
private fun Half(
    top: Boolean, ch: Char, color: Color, s: FlapSize, geist: FontFamily, grain: Brush,
    fadeTo: Char? = null, fade: Float = 0f, fadeColor: Color = SF.ink,
    shade: Float = 0f, cover: Float = 0f, layer: Modifier = Modifier
) {
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val style = TextStyle(fontFamily = geist, fontWeight = FontWeight.SemiBold, fontSize = with(density) { s.font.toSp() }, letterSpacing = 0.sp)
    Canvas(layer.size(with(density) { s.w.toDp() }, with(density) { s.h.toDp() })) {
        val y0 = if (top) 0f else s.botTop
        val radius = s.r
        clipPath(roundedHalf(top, s.w, y0, s.halfH, radius)) {
            drawRect(if (top) SF.flapTop else SF.flapBottom, Offset(0f, y0), Size(s.w, s.halfH))
            drawRect(grain, Offset(0f, y0), Size(s.w, s.halfH), alpha = SF.grainAlpha)
            fun glyph(c: Char, col: Color, alpha: Float) {
                val layout = measurer.measure(c.toString(), style)
                // cap middle on the hinge line
                val baseline = s.h / 2 + SF.capRatio * s.font / 2
                drawText(layout, color = col, alpha = alpha,
                    topLeft = Offset((s.w - layout.size.width) / 2f, baseline - layout.firstBaseline))
            }
            if (fadeTo != null) { glyph(ch, SF.ink, 1 - fade); glyph(fadeTo, fadeColor, fade) } else glyph(ch, color, 1f)
            if (top) drawRect(SF.edge, Offset(0f, 0f), Size(s.w, 1f))
            if (cover > 0f) drawRect(
                Brush.verticalGradient(listOf(Color.Black.copy(alpha = SF.coverShade), Color.Transparent), startY = y0, endY = y0 + s.halfH),
                Offset(0f, y0), Size(s.w, s.halfH), alpha = cover)
            if (shade > 0f) drawRect(Color.Black.copy(alpha = shade), Offset(0f, y0), Size(s.w, s.halfH))
        }
    }
}

private fun roundedHalf(top: Boolean, w: Float, y0: Float, h: Float, r: Float): androidx.compose.ui.graphics.Path =
    androidx.compose.ui.graphics.Path().apply {
        val rr = androidx.compose.ui.geometry.RoundRect(
            left = 0f, top = y0, right = w, bottom = y0 + h,
            topLeftCornerRadius = androidx.compose.ui.geometry.CornerRadius(if (top) r else 0f),
            topRightCornerRadius = androidx.compose.ui.geometry.CornerRadius(if (top) r else 0f),
            bottomRightCornerRadius = androidx.compose.ui.geometry.CornerRadius(if (top) 0f else r),
            bottomLeftCornerRadius = androidx.compose.ui.geometry.CornerRadius(if (top) 0f else r)
        )
        addRoundRect(rr)
    }
