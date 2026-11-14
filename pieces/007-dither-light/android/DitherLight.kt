// Dither light — Lumen 007 (Jetpack Compose)
// API 33+: AGSL RuntimeShader, same Bayer sphere as the web fragment shader.
// Lower: Canvas radial-gradient sphere and a small amber highlight. No dither.
// Put Inter Variable at res/font/inter_variable.ttf. Parameters match the web piece.
package lumen.ditherlight

import android.graphics.RuntimeShader
import android.os.Build
import android.provider.Settings
import android.view.InputDevice
import androidx.annotation.RequiresApi
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.PointerType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/* ===== Dither light parameters (identical to web / SwiftUI) =====
   SPHERE  Centred. Diameter min(600dp, 62% of height, 84% of width).
           Device radius rounds to a whole pixel.
   LIGHT   L = normalize(lx, ly, 0.9). y is positive downward.
           lum = 0.06 + 0.94·max(0, N·L) · smoothstep(-0.05, 0.25, N·L)
           Blinn exponent 40. Amber where spec > 0.55.
   REST    (0.35, -0.45)
   SPRING  Stiffness 170, damping 22, mass 1. 1/240 s semi-implicit steps.
           spring(dampingRatio = 0.84, stiffness = 170)
           SwiftUI .spring(response = 0.48, dampingFraction = 0.84)
   PRESS   240ms CubicBezierEasing(0.2, 0.8, 0.2, 1) to the smaller cell,
           320ms CubicBezierEasing(0.4, 0, 0.2, 1) back. Integer cells, cross-fade.
   GUIDE   No fine pointer: lx 0→0.6 over 1400ms, cubic-bezier(0.45, 0, 0.55, 1),
           ly = -0.35. Drift lx = 0.6·cos(ωt), period 8000ms.
           driftT0 = guide start + 1400. Past that, lx is 0.6·cos of the
           same elapsed time, so the join is +0.6 with velocity 0.
   RELEASE Wait 2000ms, then 600ms ease-in-out to the nearer of ±0.6, then drift.
   FINE    SOURCE_MOUSE, SOURCE_MOUSE_RELATIVE, or SOURCE_TOUCHPAD at launch.
           A mouse or stylus hover promotes into pointer-follow.
   ENTER   Opacity 160ms. Brightness 0→1 over 600ms. Title waits 120ms,
           then 300ms fade and a 4dp rise.
   REDUCED Animator duration scale 0. Rest pose, no drift, no brightness growth.
           Press switches cell size immediately.
   ================================================================= */
private object DL {
    const val REST_X = 0.35
    const val REST_Y = -0.45
    const val GUIDE_LX = 0.6
    const val GUIDE_LY = -0.35
    const val K = 170.0
    const val C = 22.0
    const val M = 1.0
    const val PRESS_IN = 240.0
    const val PRESS_OUT = 320.0
    const val BRIGHT = 600.0
    const val STAGE = 160.0
    const val TITLE_DELAY = 120.0
    const val TITLE = 300.0
    const val GUIDE = 1400.0
    const val DRIFT = 8000.0
    const val HOLD = 2000.0
    const val RET = 600.0
    const val CLAMP = 1.2
    val bg = Color(0xFF0B0B0C)
    val ink = Color(0xFFE8E6E1)
    val sub = Color(0xFF8A8A8A)
    val weak = Color(0xFF3A3A3A)
    val amber = Color(0xFFFFB547)
}

private const val AGSL = """
uniform float2 res;
uniform float2 center;
uniform float2 radius;
uniform float2 light;
uniform float2 cell;
uniform float mixAmt;
uniform float bright;
const float BAYER[64] = float[64](
  0.0,32.0,8.0,40.0,2.0,34.0,10.0,42.0,
  48.0,16.0,56.0,24.0,50.0,18.0,58.0,26.0,
  12.0,44.0,4.0,36.0,14.0,46.0,6.0,38.0,
  60.0,28.0,52.0,20.0,62.0,30.0,54.0,22.0,
  3.0,35.0,11.0,43.0,1.0,33.0,9.0,41.0,
  51.0,19.0,59.0,27.0,49.0,17.0,57.0,25.0,
  15.0,47.0,7.0,39.0,13.0,45.0,5.0,37.0,
  63.0,31.0,55.0,23.0,61.0,29.0,53.0,21.0
);
float thresh(float2 idx) {
  int ix = int(mod(idx.x, 8.0));
  int iy = int(mod(idx.y, 8.0));
  if (ix < 0) ix = 0; if (ix > 7) ix = 7;
  if (iy < 0) iy = 0; if (iy > 7) iy = 7;
  return (BAYER[iy * 8 + ix] + 0.5) / 64.0;
}
half4 ink(float2 frag, float sideIn) {
  half3 bg = half3(11.0/255.0, 11.0/255.0, 12.0/255.0);
  float side = max(2.0, floor(sideIn + 0.5));
  float2 idx = floor(frag / side);
  float2 mid = (idx + 0.5) * side;
  float2 p = (mid - center) / max(radius, float2(1.0));
  if (dot(p, p) > 1.0) return half4(bg, 1.0);
  float3 N = float3(p, sqrt(max(0.0, 1.0 - dot(p, p))));
  float3 L = normalize(float3(light, 0.9));
  float ndl = dot(N, L);
  float lum = (0.06 + 0.94 * max(ndl, 0.0) * smoothstep(-0.05, 0.25, ndl)) * bright;
  float3 H = normalize(L + float3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(N, H), 0.0), 40.0);
  if (lum <= thresh(idx)) return half4(bg, 1.0);
  if (spec > 0.55) return half4(1.0, 181.0/255.0, 71.0/255.0, 1.0);
  return half4(232.0/255.0, 230.0/255.0, 225.0/255.0, 1.0);
}
half4 main(float2 frag) {
  half4 a = ink(frag, max(cell.x, 2.0));
  half4 b = ink(frag, max(cell.y, 2.0));
  return mix(a, b, half(clamp(mixAmt, 0.0, 1.0)));
}
"""

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
        if (x <= 0) return 0.0
        if (x >= 1) return 1.0
        var t = x
        repeat(8) {
            val e = xOf(t) - x
            val d = dx(t)
            if (abs(e) < 1e-6 || abs(d) < 1e-6) return@repeat
            t -= e / d
        }
        return yOf(t.coerceIn(0.0, 1.0))
    }
}

private val easePress = bez(0.2, 0.8, 0.2, 1.0)
private val easeRelease = bez(0.4, 0.0, 0.2, 1.0)
private val easeBright = bez(0.2, 0.8, 0.2, 1.0)
private val easeGuide = bez(0.45, 0.0, 0.55, 1.0)
private val easeInOut = bez(0.42, 0.0, 0.58, 1.0)

private fun cells(raw: Float): Pair<Float, Float> {
    val dpr = min(if (raw > 0f) raw else 1f, 2f)
    var rest = 2f * (2f * dpr).roundToInt()
    var press = 2f * dpr.roundToInt()
    if (rest < 2f) rest = 2f
    if (press < 2f) press = 2f
    if (press.toInt() % 2 == 1) press -= 1f
    if (rest.toInt() % 2 == 1) rest += 1f
    if (press >= rest) press = max(2f, rest - 2f)
    return rest to press
}

private fun hasFinePointer(): Boolean {
    val watched = intArrayOf(
        InputDevice.SOURCE_MOUSE,
        InputDevice.SOURCE_MOUSE_RELATIVE,
        InputDevice.SOURCE_TOUCHPAD
    )
    return InputDevice.getDeviceIds().any { id ->
        val sources = InputDevice.getDevice(id)?.sources ?: return@any false
        watched.any { source -> sources and source == source }
    }
}

private class Sim {
    var lx = DL.REST_X
    var ly = DL.REST_Y
    var vx = 0.0
    var vy = 0.0
    var targetX = DL.REST_X
    var targetY = DL.REST_Y
    var phase = "rest"
    var pressU = 0.0
    var pressFrom = 0.0
    var pressTo = 0.0
    var pressT0 = 0.0
    var pressDur = DL.PRESS_IN
    var pressing = false
    var bright = 0.0
    var fine = false
    var reduced = false
    var t0 = 0.0
    var guideT0 = 0.0
    var driftT0 = 0.0
    var holdT0 = 0.0
    var returnT0 = 0.0
    var now = 0.0
    var last = 0.0
    var booted = false
    var returnFromX = 0.0
    var returnFromY = 0.0
    var returnToX = DL.GUIDE_LX
    var returnToY = DL.GUIDE_LY
    var viewW = 1f
    var viewH = 1f

    fun reset(time: Double) {
        t0 = time; last = 0.0; vx = 0.0; vy = 0.0
        if (reduced) {
            phase = "rest"; fine = false; bright = 1.0
            lx = DL.REST_X; ly = DL.REST_Y; targetX = lx; targetY = ly
            pressU = if (pressing) 1.0 else 0.0; pressFrom = pressU; pressTo = pressU
            return
        }
        bright = 0.0
        fine = hasFinePointer()
        if (fine) {
            phase = "rest"; lx = DL.REST_X; ly = DL.REST_Y; targetX = lx; targetY = ly
        } else {
            phase = "guide"; guideT0 = time; driftT0 = 0.0
            lx = 0.0; ly = DL.GUIDE_LY; targetX = lx; targetY = ly
        }
    }

    private fun spring(pos: Double, vel: Double, to: Double, dt: Double): Pair<Double, Double> {
        if (dt <= 0) return pos to vel
        var p = pos; var v = vel
        val n = max(1, (dt * 240).roundToInt())
        val h = dt / n
        repeat(n) {
            v += ((-DL.K * (p - to) - DL.C * v) / DL.M) * h
            p += v * h
        }
        return p to v
    }

    private fun springTo(dt: Double) {
        val x = spring(lx, vx, targetX, dt); lx = x.first; vx = x.second
        val y = spring(ly, vy, targetY, dt); ly = y.first; vy = y.second
        if (abs(lx - targetX) < 1e-4 && abs(ly - targetY) < 1e-4 && abs(vx) < 1e-4 && abs(vy) < 1e-4) {
            lx = targetX; ly = targetY; vx = 0.0; vy = 0.0
        }
    }

    fun step(time: Double) {
        if (!booted) { booted = true; reset(time) }
        val dt = if (last == 0.0) 0.0 else min(0.05, (time - last) / 1000.0)
        last = time; now = time
        if (reduced) {
            bright = 1.0; lx = DL.REST_X; ly = DL.REST_Y; vx = 0.0; vy = 0.0
            targetX = lx; targetY = ly; phase = "rest"
            pressU = if (pressing) 1.0 else 0.0; pressFrom = pressU; pressTo = pressU
            return
        }
        bright = easeBright(((time - t0) / DL.BRIGHT).coerceIn(0.0, 1.0))
        if (pressFrom != pressTo) {
            val u = ((time - pressT0) / pressDur).coerceIn(0.0, 1.0)
            val e = if (pressTo > pressFrom) easePress(u) else easeRelease(u)
            pressU = pressFrom + (pressTo - pressFrom) * e
            if (u >= 1) { pressU = pressTo; pressFrom = pressTo }
        }
        when (phase) {
            "guide" -> {
                val el = time - guideT0
                if (el >= DL.GUIDE) { driftT0 = guideT0 + DL.GUIDE; phase = "drift" }
                val prev = lx
                lx = cruiseX(el)
                ly = DL.GUIDE_LY
                vx = if (dt > 0) (lx - prev) / dt else 0.0; vy = 0.0
            }
            "drift" -> drift(time, dt)
            "return" -> {
                val u = ((time - returnT0) / DL.RET).coerceIn(0.0, 1.0)
                val e = easeInOut(u)
                lx = returnFromX + (returnToX - returnFromX) * e
                ly = returnFromY + (returnToY - returnFromY) * e
                if (u >= 1.0) {
                    lx = returnToX; ly = returnToY; vx = 0.0; vy = 0.0; phase = "drift"
                    driftT0 = if (returnToX > 0) time else time - DL.DRIFT / 2
                }
            }
            "hold" -> {
                if (time - holdT0 >= DL.HOLD) beginReturn(time) else springTo(dt)
            }
            else -> springTo(dt)
        }
    }

    private fun cruiseX(el: Double): Double {
        if (el <= 0.0) return 0.0
        if (el >= DL.GUIDE) {
            val w = (el - DL.GUIDE) / DL.DRIFT * 2 * PI
            return DL.GUIDE_LX * cos(w)
        }
        return easeGuide((el / DL.GUIDE).coerceIn(0.0, 1.0)) * DL.GUIDE_LX
    }

    private fun drift(time: Double, dt: Double) {
        val prev = lx
        val w = (time - driftT0) / DL.DRIFT * 2 * PI
        lx = DL.GUIDE_LX * cos(w); ly = DL.GUIDE_LY
        vx = if (dt > 0) (lx - prev) / dt else 0.0; vy = 0.0
    }

    private fun beginReturn(time: Double) {
        phase = "return"; returnT0 = time
        returnFromX = lx; returnFromY = ly
        returnToX = if (lx >= 0) DL.GUIDE_LX else -DL.GUIDE_LX
        returnToY = DL.GUIDE_LY
    }

    fun map(xPx: Float, yPx: Float, radius: Float): Pair<Double, Double> {
        val r = max(1f, radius)
        var x = (xPx - viewW / 2f) / r
        var y = (yPx - viewH / 2f) / r
        val len = hypot(x.toDouble(), y.toDouble())
        if (len > DL.CLAMP) { val s = DL.CLAMP / len; x = (x * s).toFloat(); y = (y * s).toFloat() }
        return x.toDouble() to y.toDouble()
    }

    fun follow(x: Double, y: Double) { targetX = x; targetY = y; phase = "follow" }

    fun hover(xPx: Float, yPx: Float, radius: Float) {
        if (reduced) return
        fine = true
        val p = map(xPx, yPx, radius)
        follow(p.first, p.second)
    }

    fun press(xPx: Float, yPx: Float, radius: Float) {
        pressing = true
        if (reduced) { pressU = 1.0; pressFrom = 1.0; pressTo = 1.0; return }
        pressFrom = pressU; pressTo = 1.0; pressT0 = now; pressDur = DL.PRESS_IN
        val p = map(xPx, yPx, radius)
        follow(p.first, p.second)
    }

    fun drag(xPx: Float, yPx: Float, radius: Float) {
        if (reduced || !pressing || fine) return
        val p = map(xPx, yPx, radius)
        follow(p.first, p.second)
    }

    fun release() {
        val was = pressing
        pressing = false
        if (reduced) { pressU = 0.0; pressFrom = 0.0; pressTo = 0.0; return }
        if (was) { pressFrom = pressU; pressTo = 0.0; pressT0 = now; pressDur = DL.PRESS_OUT }
        if (!fine && was && phase == "follow") { phase = "hold"; holdT0 = now }
    }
}

@Composable
fun DitherLight(modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val reduced = remember {
        Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    val inter = remember { FontFamily(Font(R.font.inter_variable)) }
    val sim = remember { Sim().also { it.reduced = reduced; it.fine = if (reduced) false else hasFinePointer() } }
    var frame by remember { mutableLongStateOf(0L) }
    val density = LocalDensity.current.density
    val uri = LocalUriHandler.current

    LaunchedEffect(reduced) {
        sim.reduced = reduced
        if (sim.booted) sim.reset(sim.now)
        while (true) {
            withFrameNanos { n ->
                sim.step(n / 1_000_000.0)
                frame = n
            }
        }
    }

    BoxWithConstraints(modifier.fillMaxSize().background(DL.bg)) {
        val w = constraints.maxWidth.toFloat()
        val h = constraints.maxHeight.toFloat()
        sim.viewW = w; sim.viewH = h
        val radius = max(1f, (minOf(600f * density, h * 0.62f, w * 0.84f) / 2f).roundToInt().toFloat())
        val pair = cells(density)
        val fade = ((sim.now - sim.t0) / DL.STAGE).toFloat().coerceIn(0f, 1f)
        val titleU = if (reduced) fade else easeBright(((sim.now - sim.t0 - DL.TITLE_DELAY) / DL.TITLE).coerceIn(0.0, 1.0)).toFloat()
        val input = Modifier.pointerInput(radius, reduced) {
            awaitPointerEventScope {
                var down = false
                while (true) {
                    val event = awaitPointerEvent()
                    val change = event.changes.firstOrNull() ?: continue
                    val mouse = change.type == PointerType.Mouse || change.type == PointerType.Stylus
                    val pressed = change.pressed
                    if (event.type == PointerEventType.Exit) {
                        if (down) sim.release()
                        down = false
                        continue
                    }
                    if (mouse) sim.hover(change.position.x, change.position.y, radius)
                    if (pressed && !down) sim.press(change.position.x, change.position.y, radius)
                    else if (pressed) sim.drag(change.position.x, change.position.y, radius)
                    else if (down) sim.release()
                    down = pressed
                }
            }
        }
        Box(Modifier.fillMaxSize().then(input)) {
            if (Build.VERSION.SDK_INT >= 33) {
                ShaderLayer(sim, radius, pair.first, pair.second, Modifier.fillMaxSize())
            } else {
                FallbackLayer(sim, radius, Modifier.fillMaxSize())
            }
            val titleSp = (w / density * 0.04f).coerceIn(28f, 40f).sp
            Column(
                Modifier.padding(start = 28.dp, top = 28.dp).graphicsLayer {
                    alpha = titleU
                    translationY = if (reduced) 0f else (4.dp * (1f - titleU)).toPx()
                }
            ) {
                Text(
                    "Dither Light",
                    color = DL.ink,
                    fontFamily = inter,
                    fontWeight = FontWeight.Medium,
                    fontSize = titleSp,
                    maxLines = 1,
                    style = TextStyle(letterSpacing = (-0.035).em, platformStyle = PlatformTextStyle(includeFontPadding = false))
                )
                Spacer(Modifier.height(8.dp))
                Text("One light, one bit.", color = DL.sub, fontFamily = inter, fontSize = 13.sp, maxLines = 1)
            }
            val ang = angles(sim.lx, sim.ly)
            Readout(ang.first, ang.second, inter, Modifier.align(Alignment.BottomEnd).padding(end = 24.dp, bottom = 22.dp).graphicsAlpha(fade))
            Row(Modifier.align(Alignment.TopEnd).padding(top = 20.dp, end = 24.dp)) {
                Text("GitHub", color = DL.weak, fontFamily = inter, fontSize = 12.sp, modifier = Modifier.clickable { uri.openUri("https://github.com/SolitaryMist/lumen") })
                Spacer(Modifier.width(16.dp))
                Text("@aldininin", color = DL.weak, fontFamily = inter, fontSize = 12.sp, modifier = Modifier.clickable { uri.openUri("https://x.com/aldininin") })
            }
        }
        @Suppress("UNUSED_EXPRESSION") frame
    }
}

private fun angles(lx: Double, ly: Double): Pair<Int, Int> {
    val th = Math.toDegrees(atan2(lx, 0.9)).roundToInt()
    val ph = Math.toDegrees(atan2(-ly, hypot(lx, 0.9))).roundToInt()
    return th to ph
}

@Composable
private fun Readout(theta: Int, phi: Int, font: FontFamily, modifier: Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Text("θ", color = DL.sub, fontFamily = font, fontSize = 13.sp)
        Digit(theta, font)
        Text("°", color = DL.sub, fontFamily = font, fontSize = 13.sp)
        Spacer(Modifier.width(10.dp))
        Text("φ", color = DL.sub, fontFamily = font, fontSize = 13.sp)
        Digit(phi, font)
        Text("°", color = DL.sub, fontFamily = font, fontSize = 13.sp)
    }
}

@Composable
private fun Digit(n: Int, font: FontFamily) {
    Text(
        if (n < 0) "-" else " ",
        color = DL.sub, fontFamily = font, fontSize = 13.sp,
        modifier = Modifier.width(8.dp), textAlign = TextAlign.Center,
        style = TextStyle(fontFeatureSettings = "tnum", platformStyle = PlatformTextStyle(includeFontPadding = false))
    )
    Text(
        abs(n).toString(),
        color = DL.sub, fontFamily = font, fontSize = 13.sp,
        modifier = Modifier.width(18.dp), textAlign = TextAlign.End,
        style = TextStyle(fontFeatureSettings = "tnum", platformStyle = PlatformTextStyle(includeFontPadding = false))
    )
}

private fun Modifier.graphicsAlpha(a: Float): Modifier = this.then(Modifier.graphicsLayer { alpha = a.coerceIn(0f, 1f) })

@RequiresApi(33)
@Composable
private fun ShaderLayer(sim: Sim, radius: Float, cellA: Float, cellB: Float, modifier: Modifier) {
    val shader = remember { RuntimeShader(AGSL) }
    val brush = remember(shader) { ShaderBrush(shader) }
    Canvas(modifier) {
        shader.setFloatUniform("res", size.width, size.height)
        shader.setFloatUniform("center", size.width / 2f, size.height / 2f)
        shader.setFloatUniform("radius", radius, radius)
        shader.setFloatUniform("light", sim.lx.toFloat(), sim.ly.toFloat())
        shader.setFloatUniform("cell", cellA, cellB)
        shader.setFloatUniform("mixAmt", sim.pressU.toFloat())
        shader.setFloatUniform("bright", sim.bright.toFloat())
        drawRect(brush)
    }
}

@Composable
private fun FallbackLayer(sim: Sim, radius: Float, modifier: Modifier) {
    Canvas(modifier) {
        val c = Offset(size.width / 2f, size.height / 2f)
        val g = Offset(c.x + sim.lx.toFloat() * radius * 0.42f, c.y + sim.ly.toFloat() * radius * 0.42f)
        drawCircle(
            brush = Brush.radialGradient(listOf(DL.ink.copy(alpha = sim.bright.toFloat()), DL.bg), g, radius * 1.15f),
            radius = radius,
            center = c
        )
        val len = hypot(sim.lx, hypot(sim.ly, 0.9))
        val hx = sim.lx / len
        val hy = sim.ly / len
        val hz = 0.9 / len + 1
        val hl = hypot(hx, hypot(hy, hz))
        drawCircle(DL.amber.copy(alpha = sim.bright.toFloat()), radius * 0.07f, Offset(c.x + (hx / hl).toFloat() * radius, c.y + (hy / hl).toFloat() * radius))
    }
}

@Suppress("unused")
private val springForm = listOf(DL.K, 0.84, 170.0)
