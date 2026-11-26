// Lumen 011 · Paper Fold — Jetpack Compose
// Every crease catches the light.
// Source only: written to match the web piece, not compiled, not run on a device.
//
// Four panels, each a graphicsLayer rotationY with transformOrigin on its valley
// crease edge and cameraDistance = 1400 * density. Panel x comes from f so the
// joins meet; the card is then scaled so its projected width is W·cosθ, as on web.

package lumen.paperfold

import android.content.Context
import android.graphics.BitmapShader
import android.graphics.Matrix
import android.graphics.Shader
import android.hardware.input.InputManager
import android.os.Build
import android.provider.Settings
import android.view.InputDevice
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.graphicsLayer
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
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

// ---------- parameters (same numbers as paper-fold.js) ----------

object PF {
    val bg = Color(0xFF0B0B0C)
    val paper = Color(0xFFECE8E1)
    val ink = Color(0xFF1A1A1C)
    val small = Color(0xFF8A8780)

    const val wMax = 720f; const val wVw = 0.72f; const val wVh = 1.28f
    const val portraitVw = 0.86f; const val portraitCy = 0.46f
    const val typeR = 0.14f; const val typeTracking = -0.03f
    const val metaSize = 11f; const val metaTracking = 0.08f
    const val insetR = 0.05f
    const val grainDp = 128f; const val grainAlpha = 0.03f

    const val maxDeg = 72.0
    const val perspective = 1400f

    const val leftShade = 0.10f; const val rightShade = 0.42f
    const val valleyDp = 24f; const val valleyAlpha = 0.18f
    const val peakAlpha = 0.5f
    const val shadowW = 0.9f; const val shadowBlurDp = 24f; const val shadowYDp = 18f
    const val shadowA0 = 0.18f; const val shadowA1 = 0.22f; const val shadowH = 0.14f

    const val rest = 0.45
    const val hoverLo = 0.15; const val hoverSpan = 0.7
    const val tiltDeg = 12.0
    const val followK = 170.0; const val followC = 22.0
    const val pressK = 280.0; const val pressC = 28.0; const val pressF = 0.96
    const val introFade = 160.0; const val introMs = 900.0
    val introEase = Bezier(0.22, 1.0, 0.36, 1.0)
    val guideTo = doubleArrayOf(0.85, 0.2); val guideMs = doubleArrayOf(760.0, 640.0)
    val guideEase = Bezier(0.42, 0.0, 0.58, 1.0)
    const val driftMid = 0.5; const val driftAmp = 0.3; const val driftMs = 8000.0
    const val dragGain = 0.7
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

private fun driftF(ms: Double) = PF.driftMid - PF.driftAmp * cos(2 * PI * ms / PF.driftMs)
private fun driftV(ms: Double) = PF.driftAmp * sin(2 * PI * ms / PF.driftMs) * 2 * PI / PF.driftMs * 1000

/** Semi-implicit Euler at 240 Hz; returns (pos, vel). */
private fun spring(pos: Double, vel: Double, target: Double, dt: Double, k: Double, c: Double): Pair<Double, Double> {
    val n = max(1, ceil(dt * 240).toInt()); val h = dt / n
    var p = pos; var v = vel
    repeat(n) { v += (-k * (p - target) - c * v) * h; p += v * h }
    return p to v
}

// ---------- model ----------

class PaperFoldModel(var pointerMode: Boolean) {
    enum class Mode { Rest, Hover, Press, Guide, Drift, Drag, Settle }
    var now = 0.0
    var f = 0.0; var vf = 0.0; var rx = 0.0; var vrx = 0.0
    var reduced = false
    private var last = -1.0
    private var introDone = false
    var mode = Mode.Rest
    private var target = PF.rest; private var targetRx = 0.0
    private var dragF0 = 0.0
    private var settleE = 0.0; private var settleV = 0.0
    private val introEnd = PF.introFade + PF.introMs
    private val driftStart = introEnd + PF.guideMs[0] + PF.guideMs[1]

    private fun introF(t: Double) = if (t <= PF.introFade) 0.0 else PF.rest * PF.introEase((t - PF.introFade) / PF.introMs)
    private fun guideF(t: Double): Double {
        val g = t - introEnd
        if (g <= PF.guideMs[0]) return PF.rest + (PF.guideTo[0] - PF.rest) * PF.guideEase(g / PF.guideMs[0])
        return PF.guideTo[0] + (PF.guideTo[1] - PF.guideTo[0]) * PF.guideEase((g - PF.guideMs[0]) / PF.guideMs[1])
    }
    private fun endIntro() {
        if (introDone) return
        introDone = true
        f = introF(now); vf = (introF(now + 1) - f) * 1000
        mode = if (pointerMode) Mode.Rest else if (now < driftStart) Mode.Guide else Mode.Drift
    }

    fun advance(ms: Double) {
        val dt = if (last < 0) 0.0 else ((ms - last) / 1000).coerceIn(0.0, 1.0 / 30)
        last = ms; now = ms
        if (reduced) { f = PF.rest; vf = 0.0; rx = 0.0; vrx = 0.0; return }
        if (!introDone) {
            if (now < introEnd) { f = introF(now); return }
            introDone = true; vf = 0.0
            mode = if (pointerMode) Mode.Rest else Mode.Guide
        }
        if (mode == Mode.Guide) {
            if (now < driftStart) { f = guideF(now); vf = (guideF(now + 1) - f) * 1000 } else mode = Mode.Drift
        }
        if (mode == Mode.Drift) { f = driftF(now - driftStart); vf = driftV(now - driftStart) }
        if (mode == Mode.Settle) {
            val (e, v) = spring(settleE, settleV, 0.0, dt, PF.followK, PF.followC); settleE = e; settleV = v
            f = driftF(now - driftStart) + settleE; vf = driftV(now - driftStart) + settleV
            if (abs(settleE) < 1e-4 && abs(settleV) < 1e-3) mode = Mode.Drift
        }
        when (mode) {
            Mode.Press -> spring(f, vf, PF.pressF, dt, PF.pressK, PF.pressC).let { f = it.first; vf = it.second }
            Mode.Rest, Mode.Hover, Mode.Drag -> spring(f, vf, target, dt, PF.followK, PF.followC).let { f = it.first; vf = it.second }
            else -> {}
        }
        spring(rx, vrx, targetRx, dt, PF.followK, PF.followC).let { rx = it.first; vrx = it.second }
    }

    fun hover(x: Double, y: Double) {
        if (reduced) return
        pointerMode = true; endIntro()
        if (mode != Mode.Press) mode = Mode.Hover
        target = PF.hoverLo + PF.hoverSpan * x.coerceIn(0.0, 1.0)
        targetRx = (0.5 - y.coerceIn(0.0, 1.0)) * PF.tiltDeg
    }
    fun hoverExit() { if (reduced || !pointerMode || mode == Mode.Press) return; mode = Mode.Rest; target = PF.rest; targetRx = 0.0 }
    fun press() { if (reduced) return; pointerMode = true; endIntro(); mode = Mode.Press }
    fun release(x: Double, y: Double) {
        if (mode != Mode.Press) return
        // vf is kept, so the release speed carries into the follow spring
        val inside = x in 0.0..1.0 && y in 0.0..1.0
        mode = if (inside) Mode.Hover else Mode.Rest
        target = if (inside) PF.hoverLo + PF.hoverSpan * x else PF.rest
        if (!inside) targetRx = 0.0
    }
    fun dragStart() { if (reduced) return; endIntro(); dragF0 = f.coerceIn(0.0, 1.0); target = dragF0; mode = Mode.Drag }
    fun dragTo(dxFrac: Double) { if (mode == Mode.Drag) target = (dragF0 + PF.dragGain * dxFrac).coerceIn(0.0, 1.0) }
    fun dragEnd() {
        if (mode != Mode.Drag) return
        settleE = f - driftF(now - driftStart); settleV = vf - driftV(now - driftStart); mode = Mode.Settle
    }
}

private fun hasMouse(context: Context): Boolean {
    val im = context.getSystemService(Context.INPUT_SERVICE) as InputManager
    return im.inputDeviceIds.any { id ->
        val d = im.getInputDevice(id) ?: return@any false
        !d.isVirtual && (d.supportsSource(InputDevice.SOURCE_MOUSE) || d.supportsSource(InputDevice.SOURCE_TOUCHPAD))
    }
}

// ---------- UI ----------

@Composable
fun PaperFold(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val density = LocalDensity.current
    // a mouse or trackpad at launch: rest and wait for hover; without one, the guide and drift run
    val model = remember { PaperFoldModel(pointerMode = hasMouse(context)) }
    var tick by remember { mutableLongStateOf(0L) }
    val dragX0 = remember { floatArrayOf(0f) }
    val reduced = remember { Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
    val geist = remember { FontFamily(Font(R.font.geist_semibold, FontWeight.SemiBold)) }
    val mono = remember { FontFamily(Font(R.font.jetbrains_mono_regular, FontWeight.Normal)) }
    val grain = ImageBitmap.imageResource(R.drawable.grain)
    val grainBrush = remember(grain, density) {
        val shader = BitmapShader(grain.asAndroidBitmap(), Shader.TileMode.REPEAT, Shader.TileMode.REPEAT)
        val s = PF.grainDp * density.density / grain.width
        shader.setLocalMatrix(Matrix().apply { setScale(s, s) })
        ShaderBrush(shader)
    }

    LaunchedEffect(Unit) {
        var start = -1L
        while (true) withFrameMillis { t -> if (start < 0) start = t; tick = t - start }
    }

    BoxWithConstraints(
        modifier.fillMaxSize().background(PF.bg)
            .semantics { contentDescription = "Paper Fold, a printed card folded in four panels" }
    ) {
        val dens = density.density
        val vw = constraints.maxWidth.toFloat(); val vh = constraints.maxHeight.toFloat()
        model.reduced = reduced
        model.advance(tick.toDouble())

        val portrait = vh > vw
        val rawW = if (portrait) PF.portraitVw * vw else minOf(PF.wMax * dens, PF.wVw * vw, PF.wVh * vh)
        val W = max(8f, floor(rawW / 8f) * 8f)       // px; W/4 and the centre stay on even px
        val H = W / 2; val p = W / 4
        val cx = (vw / 2 / 2).roundToInt() * 2f
        val cy = ((if (portrait) PF.portraitCy else 0.5f) * vh / 2).roundToInt() * 2f
        val f = model.f.coerceIn(0.0, 1.0)
        val th = f * PF.maxDeg * PI / 180
        val c = cos(th).toFloat(); val s = sin(th).toFloat()
        val cam = PF.perspective * dens
        // the free edge (peak or outer edge) comes forward by p·sinθ around each pivot
        val sp = cam / (cam - p * s)
        val k = 1 / sp
        val valleyX = p * c * sp

        Box(
            Modifier.fillMaxSize().pointerInput(Unit) {
                awaitPointerEventScope {
                    while (true) {
                        val ev = awaitPointerEvent()
                        val ch = ev.changes.firstOrNull() ?: continue
                        val x = (ch.position.x / size.width).toDouble(); val y = (ch.position.y / size.height).toDouble()
                        val mouse = ch.type == PointerType.Mouse || ch.type == PointerType.Stylus
                        when (ev.type) {
                            PointerEventType.Enter, PointerEventType.Move ->
                                if (mouse) model.hover(x, y)
                                else if (ch.pressed) model.dragTo((ch.position.x - dragX0[0]) / size.width.toDouble())
                            PointerEventType.Exit -> if (mouse) model.hoverExit()
                            PointerEventType.Press -> if (mouse) model.press() else { dragX0[0] = ch.position.x; model.dragStart() }
                            PointerEventType.Release -> if (mouse) model.release(x, y) else model.dragEnd()
                        }
                    }
                }
            }
        ) {
            val wDp = with(density) { W.toDp() }; val hDp = with(density) { H.toDp() }
            val alpha = (model.now / PF.introFade).coerceIn(0.0, 1.0).toFloat()

            // shadow: ellipse 0.9 × projected width, 18dp under the card
            val shW = PF.shadowW * W * c; val shH = PF.shadowH * H
            val shadowMod = Modifier
                .offset { IntOffset((cx - shW / 2).roundToInt(), (cy + H / 2 + PF.shadowYDp * dens - shH / 2).roundToInt()) }
                .size(with(density) { shW.toDp() }, with(density) { shH.toDp() })
                .graphicsLayer { this.alpha = alpha * (PF.shadowA0 + PF.shadowA1 * f.toFloat()) }
            if (Build.VERSION.SDK_INT >= 31) {
                Box(shadowMod.blur(PF.shadowBlurDp.dp).background(Color.Black, androidx.compose.foundation.shape.CircleShape))
            } else {
                Canvas(shadowMod) {
                    drawOval(Brush.radialGradient(listOf(Color.Black, Color.Transparent), center = center, radius = size.width / 2),
                        topLeft = Offset.Zero, size = size)
                }
            }

            // the card: four panels plus the peak lines, scaled by k and tilted by rx
            Box(
                Modifier
                    .offset { IntOffset((cx - W / 2).roundToInt(), (cy - H / 2).roundToInt()) }
                    .size(wDp, hDp)
                    .graphicsLayer {
                        this.alpha = alpha
                        scaleX = k; scaleY = k
                        rotationX = model.rx.toFloat()
                        cameraDistance = PF.perspective * dens
                    }
            ) {
                for (i in 0 until 4) {
                    val facesRight = i % 2 == 0
                    val pivotX = if (i < 2) -valleyX else valleyX
                    // panels 0 and 2 hinge on their right edge, 1 and 3 on their left edge
                    val left = W / 2 + if (facesRight) pivotX - p else pivotX
                    Box(
                        Modifier
                            .offset { IntOffset(left.roundToInt(), 0) }
                            .size(with(density) { p.toDp() }, hDp)
                            .graphicsLayer {
                                // sign written as the mirror of CSS rotateY; flip it if the panels fold the wrong way on device
                                rotationY = (if (facesRight) -th else th).toFloat() * (180f / PI.toFloat())
                                transformOrigin = TransformOrigin(if (facesRight) 1f else 0f, 0.5f)
                                cameraDistance = PF.perspective * dens
                            }
                            .clipToBounds()
                    ) {
                        PanelSlice(i, W, H, f.toFloat(), facesRight, geist, mono, grainBrush)
                    }
                }
                // centre peak: the same 1px white highlight as a normal peak line
                Canvas(Modifier.size(wDp, hDp)) {
                    val top = H / 2 - H * sp / 2
                    drawRect(Color.White.copy(alpha = PF.peakAlpha * f.toFloat()), Offset(W / 2 - 0.5f, top), Size(1f, H * sp))
                }
            }
        }
    }
}


/** One panel: its quarter of the printed sheet, plus facing shade and valley shadow. */
@Composable
private fun PanelSlice(index: Int, W: Float, H: Float, f: Float, facesRight: Boolean, geist: FontFamily, mono: FontFamily, grain: Brush) {
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val p = W / 4
    val fs = PF.typeR * W
    val title = TextStyle(fontFamily = geist, fontWeight = FontWeight.SemiBold, fontSize = with(density) { fs.toSp() }, letterSpacing = PF.typeTracking.em, color = PF.ink)
    val meta = TextStyle(fontFamily = mono, fontWeight = FontWeight.Normal, fontSize = PF.metaSize.sp, letterSpacing = PF.metaTracking.em, color = PF.small)
    Canvas(Modifier.fillMaxSize()) {
        val ox = -index * p
        drawRect(PF.paper)
        drawRect(grain, alpha = PF.grainAlpha)
        val inset = (PF.insetR * W).roundToInt().toFloat()
        val t = measurer.measure("PAPER FOLD", title)
        // Geist cap height is 0.71 em: put its middle on H/2
        drawText(t, topLeft = Offset(ox + (W - t.size.width) / 2f, H / 2 + 0.355f * fs - t.firstBaseline))
        val l = measurer.measure("LUMEN", meta)
        drawText(l, topLeft = Offset(ox + inset, inset))
        val n = measurer.measure("Nº 011", meta)
        drawText(n, topLeft = Offset(ox + W - inset - n.size.width, inset))
        drawRect(Color.Black.copy(alpha = (if (facesRight) PF.rightShade else PF.leftShade) * f))
        val vw = PF.valleyDp * density.density
        if (facesRight) drawRect(Brush.horizontalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = PF.valleyAlpha * f)), startX = p - vw, endX = p), Offset(p - vw, 0f), Size(vw, H))
        else drawRect(Brush.horizontalGradient(listOf(Color.Black.copy(alpha = PF.valleyAlpha * f), Color.Transparent), startX = 0f, endX = vw), Offset(0f, 0f), Size(vw, H))
    }
}
