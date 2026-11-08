// Weight Field — Lumen 003 (Jetpack Compose)
// Put Inter Variable at res/font/inter_variable.ttf (Inter-VariableFont_opsz,wght.ttf).
package lumen.weightfield

import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.*
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import kotlin.math.*

/* ===== Weight Field parameters (identical to web / SwiftUI) =====
   WORD "LUMEN" · W_MIN_INTRO 100 · W_REST 200 · W_MAX 900 · R_FACTOR 1.6 (R = avg 900-width * 1.6)
   SPRING stiffness 170, damping 22, mass 1  ->  spring(stiffness = 170f, dampingRatio = 22/(2*sqrt(170)) ≈ 0.844f)
   INTRO stagger 60ms, 600ms/letter, cubic-bezier(0.22,1,0.36,1), wght 100->200, opacity 0->1
   LEAVE 480ms back to 200, cubic-bezier(0.65,0,0.35,1); bar fades 300ms
   BAR 2dp tall, 30% letter width, under heaviest letter, #F2A65A
   TRACKING -0.035em, line-height 0.9 · WIDTH 86% of screen (mobile)
   TOUR sweep left->right 1400ms cubic-bezier(0.22,1,0.36,1), then cosine ping-pong 7000ms from the right end
        (both ends have zero velocity, so the handoff is velocity-continuous)
   RESUME 800ms after release; 1000ms smoothstep blend from finger position into the ping-pong
   REDUCED MOTION no tour, no springs: 200ms linear to target; intro = fade only
   API 26+: FontVariation.weight, quantised to 25 with cached FontFamily objects
   API < 26: two static weights (200 / 700) crossfaded by opacity
   COLORS bg #0E0E10 · word #E8E6E1 · secondary #6B6A70 · accent #F2A65A
   ================================================================= */
object WF {
    const val WORD = "LUMEN"
    const val W_INTRO = 100f; const val W_REST = 200f; const val W_MAX = 900f; const val R_FACTOR = 1.6f
    const val STIFFNESS = 170f; const val DAMPING = 22f; const val MASS = 1f
    val DAMPING_RATIO = DAMPING / (2f * sqrt(STIFFNESS * MASS)) // ≈ 0.844f
    const val INTRO_STAGGER = 60L; const val INTRO_DUR = 600L; const val LEAVE_DUR = 480L; const val BAR_FADE = 300L
    const val TRACKING = -0.035f; const val WIDTH_FRAC = 0.86f
    const val SWEEP_DUR = 1400.0; const val PING_PERIOD = 7000.0; const val RESUME_DELAY = 800.0; const val RESUME_BLEND = 1000.0
    const val REDUCED_DUR = 200.0; const val QUANT = 25
    val BG = Color(0xFF0E0E10); val FG = Color(0xFFE8E6E1); val DIM = Color(0xFF6B6A70); val AMBER = Color(0xFFF2A65A)
}

private fun bezier(x1: Double, y1: Double, x2: Double, y2: Double): (Double) -> Double = { t ->
    if (t <= 0) 0.0 else if (t >= 1) 1.0 else {
        var u = t
        repeat(8) {
            val x = 3*x1*u*(1-u)*(1-u) + 3*x2*u*u*(1-u) + u*u*u - t
            val dx = 3*x1*(1-u)*(1-u) + 6*(x2-x1)*u*(1-u) + 3*(1-x2)*u*u
            if (abs(dx) > 1e-6) u = (u - x/dx).coerceIn(0.0, 1.0)
        }
        3*y1*u*(1-u)*(1-u) + 3*y2*u*u*(1-u) + u*u*u
    }
}
private val easeOut = bezier(0.22, 1.0, 0.36, 1.0)
private val easeInOut = bezier(0.65, 0.0, 0.35, 1.0)
private fun smoothstep(a: Double, b: Double, x: Double): Double { val t = ((x - a) / (b - a)).coerceIn(0.0, 1.0); return t*t*(3-2*t) }

/** Font cache: one FontFamily per 25-step weight (API 26+). */
@OptIn(ExperimentalTextApi::class)
private object FontCache {
    private val map = HashMap<Int, FontFamily>()
    fun family(w: Float): FontFamily {
        val q = ((w / WF.QUANT).roundToInt() * WF.QUANT).coerceIn(100, 900)
        return map.getOrPut(q) {
            FontFamily(Font(R.font.inter_variable, FontWeight(q),
                variationSettings = FontVariation.Settings(FontVariation.weight(q))))
        }
    }
    val static200 by lazy { FontFamily(Font(R.font.inter_variable, FontWeight(200))) }
    val static700 by lazy { FontFamily(Font(R.font.inter_variable, FontWeight(700))) }
}

private class LetterState { var w = WF.W_INTRO; var v = 0f; var op = 0f; var leaveFrom = WF.W_REST
    var twFrom = 0f; var twTo = -1f; var twT0 = 0.0 }

@Composable
fun WeightField(modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val density = LocalDensity.current
    val reduced = remember { Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
    val variable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
    val measurer = rememberTextMeasurer()
    val letters = remember { List(WF.WORD.length) { LetterState() } }
    var frameNanos by remember { mutableLongStateOf(0L) }

    BoxWithConstraints(modifier.fillMaxSize().background(WF.BG)) {
        val widthPx = constraints.maxWidth.toFloat()
        // fixed cells measured at wght 900 (font size 100sp -> scaled)
        val unit = remember(widthPx) {
            WF.WORD.map { ch ->
                measurer.measure(ch.toString(), TextStyle(fontFamily = if (variable) FontCache.family(900f) else FontCache.static700, fontSize = 100.sp)).size.width / with(density) { 100.sp.toPx() }
            }
        }
        val unit200 = remember(widthPx) {
            WF.WORD.map { ch ->
                measurer.measure(ch.toString(), TextStyle(fontFamily = if (variable) FontCache.family(200f) else FontCache.static200, fontSize = 100.sp)).size.width / with(density) { 100.sp.toPx() }
            }
        }
        val sumU = unit.sum() + WF.TRACKING * (unit.size - 1)
        val fontPx = WF.WIDTH_FRAC * widthPx / sumU
        val cellPx = unit.map { it * fontPx }
        val trackPx = WF.TRACKING * fontPx
        val centers = remember(widthPx) {
            var x = (widthPx - sumU * fontPx) / 2
            cellPx.map { c -> val cx = x + c / 2; x += c + trackPx; cx }
        }
        val R = cellPx.average().toFloat() * WF.R_FACTOR
        val left = centers.first(); val right = centers.last()
        val mid = (left + right) / 2; val half = (right - left) / 2

        // interaction state
        var fingerX by remember { mutableStateOf<Float?>(null) }
        var releaseAt by remember { mutableDoubleStateOf(-1.0) }
        val sim = remember { object {
            var t0 = -1.0; var last = -1.0; var mode = "idle"
            var tourKind = ""; var tourT0 = 0.0; var ph0 = 0.0; var from: Float? = null; var vx: Float? = null
            var barX = 0f; var barV = 0f; var barW = 0f; var barWV = 0f; var barInit = false
            var opFrom = 0f; var opTo = 0f; var opT0 = 0.0; var barOp = 0f
        } }

        LaunchedEffect(widthPx) {
            while (true) withFrameNanos { n ->
                val now = n / 1e6
                if (sim.t0 < 0) sim.t0 = now
                val dt = if (sim.last < 0) 0f else min(0.05f, ((now - sim.last) / 1000).toFloat()); sim.last = now
                val tIntro = now - sim.t0
                val introDone = tIntro > WF.INTRO_STAGGER * (letters.size - 1) + WF.INTRO_DUR
                fun setOp(to: Float) { if (sim.opTo != to) { sim.opFrom = sim.barOp; sim.opTo = to; sim.opT0 = now } }
                fun tourX(): Float? = when (sim.tourKind) {
                    "sweep" -> { val k = now - sim.tourT0
                        if (k < WF.SWEEP_DUR) left + (right - left) * easeOut(k / WF.SWEEP_DUR).toFloat()
                        else { sim.tourKind = "ping"; sim.tourT0 += WF.SWEEP_DUR; sim.ph0 = 0.0; sim.from = null; mid + half }
                    }
                    "ping" -> { val k = now - sim.tourT0
                        val x = mid + half * cos(sim.ph0 + 2 * PI * k / WF.PING_PERIOD).toFloat()
                        val f = sim.from
                        if (f != null && k < WF.RESUME_BLEND) f + (x - f) * smoothstep(0.0, 1.0, k / WF.RESUME_BLEND).toFloat() else x
                    }
                    else -> null
                }
                val fx = fingerX
                val x: Float? = when {
                    fx != null -> { sim.mode = "live"; setOp(1f); sim.vx = fx; fx }
                    releaseAt >= 0 && now - releaseAt < WF.RESUME_DELAY -> sim.vx
                    releaseAt >= 0 && !reduced -> { val p = sim.vx ?: mid
                        sim.tourKind = "ping"; sim.tourT0 = now; sim.ph0 = acos(((p - mid) / half).coerceIn(-1f, 1f).toDouble()); sim.from = p
                        releaseAt = -1.0; sim.mode = "tour"; tourX() }
                    sim.mode == "tour" -> tourX().also { sim.vx = it }
                    else -> null
                }
                var heavy = 0
                letters.forEachIndexed { i, L ->
                    val lt = tIntro - i * WF.INTRO_STAGGER
                    if (lt < WF.INTRO_DUR) {
                        val e = easeOut(max(0.0, lt) / WF.INTRO_DUR).toFloat()
                        L.op = e; L.w = if (reduced) WF.W_REST else WF.W_INTRO + (WF.W_REST - WF.W_INTRO) * e; L.v = 0f
                    } else {
                        L.op = 1f
                        val tgt = if (x == null) WF.W_REST else (WF.W_MAX - (WF.W_MAX - WF.W_REST) * smoothstep(0.0, R.toDouble(), abs(x - centers[i]).toDouble()).toFloat())
                        if (reduced) {
                            if (abs(L.twTo - tgt) > 4) { L.twFrom = L.w; L.twTo = tgt; L.twT0 = now }
                            L.w = L.twFrom + (L.twTo - L.twFrom) * min(1.0, (now - L.twT0) / WF.REDUCED_DUR).toFloat()
                        } else {
                            val h = dt / 4
                            repeat(4) { val a = (-WF.STIFFNESS * (L.w - tgt) - WF.DAMPING * L.v) / WF.MASS; L.v += a * h; L.w += L.v * h }
                        }
                    }
                    L.w = L.w.coerceIn(WF.W_INTRO, WF.W_MAX)
                    if (L.w > letters[heavy].w) heavy = i
                }
                val H = letters[heavy]
                val w200 = unit200[heavy] * fontPx
                val curW = w200 + (cellPx[heavy] - w200) * (H.w - WF.W_REST) / (WF.W_MAX - WF.W_REST)
                val tw = 0.3f * max(w200, curW); val tx = centers[heavy] - tw / 2
                if (!sim.barInit || reduced) { sim.barX = tx; sim.barW = tw; sim.barInit = true } else {
                    val h = dt / 4
                    repeat(4) {
                        sim.barV += (-WF.STIFFNESS * (sim.barX - tx) - WF.DAMPING * sim.barV) / WF.MASS * h; sim.barX += sim.barV * h
                        sim.barWV += (-WF.STIFFNESS * (sim.barW - tw) - WF.DAMPING * sim.barWV) / WF.MASS * h; sim.barW += sim.barWV * h
                    }
                }
                val fk = min(1.0, (now - sim.opT0) / WF.BAR_FADE).toFloat()
                sim.barOp = if (introDone) sim.opFrom + (sim.opTo - sim.opFrom) * fk else 0f
                if (!reduced && sim.mode == "idle" && introDone) { sim.tourKind = "sweep"; sim.tourT0 = now; sim.mode = "tour"; setOp(1f) }
                frameNanos = n
            }
        }

        val fontSp = with(density) { fontPx.toSp() }
        @Suppress("UNUSED_EXPRESSION") frameNanos // read to recompose each frame
        Box(Modifier.fillMaxSize().pointerInput(Unit) {
            awaitEachGesture {
                val down = awaitFirstDown(); fingerX = down.position.x; releaseAt = -1.0
                do { val ev = awaitPointerEvent(); ev.changes.firstOrNull()?.let { fingerX = it.position.x; it.consume() } }
                while (ev.changes.any { it.pressed })
                fingerX = null; releaseAt = System.nanoTime() / 1e6
            }
        }) {
            Row(Modifier.align(Alignment.Center), horizontalArrangement = Arrangement.spacedBy(with(density) { trackPx.toDp() })) {
                letters.forEachIndexed { i, L ->
                    Box(Modifier.width(with(density) { cellPx[i].toDp() }), contentAlignment = Alignment.Center) {
                        val style = TextStyle(color = WF.FG, fontSize = fontSp, lineHeight = 0.9.em, letterSpacing = 0.sp)
                        if (variable) {
                            Text(WF.WORD[i].toString(), style = style.copy(fontFamily = FontCache.family(L.w)), modifier = Modifier.graphicsLayer { alpha = L.op })
                        } else {
                            // API < 26: crossfade two static weights
                            val k = ((L.w - WF.W_REST) / (700f - WF.W_REST)).coerceIn(0f, 1f)
                            Text(WF.WORD[i].toString(), style = style.copy(fontFamily = FontCache.static200), modifier = Modifier.graphicsLayer { alpha = L.op * (1 - k) })
                            Text(WF.WORD[i].toString(), style = style.copy(fontFamily = FontCache.static700), modifier = Modifier.graphicsLayer { alpha = L.op * k })
                        }
                    }
                }
            }
            Box(Modifier
                .offset(x = with(density) { sim.barX.toDp() }, y = with(density) { (constraints.maxHeight / 2f + fontPx * 0.44f).toDp() })
                .size(width = with(density) { sim.barW.toDp() }, height = 2.dp)
                .graphicsLayer { alpha = sim.barOp }
                .background(WF.AMBER))
            Text("003 — weight field", color = WF.DIM, fontSize = 13.sp,
                modifier = Modifier.align(Alignment.BottomStart).padding(24.dp))
        }
    }
}
