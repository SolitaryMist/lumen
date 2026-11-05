// Dusk — Lumen 002 (Jetpack Compose)
// API 33+: AGSL RuntimeShader, same logic as the web fragment shader.
// Lower: Canvas with layered radialGradient brushes, breathing only.
package lumen.dusk

import android.graphics.RuntimeShader
import android.os.Build
import android.provider.Settings
import androidx.annotation.RequiresApi
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlin.math.*

// ===== Shared parameters (mirror of index.html `P` and DuskMeshView.swift) =====
object DuskParams {
    val bg = Color(0xFF0E0F13)
    val colors = longArrayOf(                 // 3×3, row by row
        0xFF1B1E3A, 0xFF2A2550, 0xFF1B1E3A,
        0xFF3A2E5C, 0xFFC9744A, 0xFF2B4A5E,
        0xFF2B4A5E, 0xFFE8B27A, 0xFF3A2E5C,
    ).map { Color(it) }
    val text = Color(0xFFEDEBE6)
    val secondary = Color(0xFF8A8B93)
    const val driftAmp = 0.06f                          // × short side
    val inner = intArrayOf(4, 1, 3, 5, 7)               // center, top, left, right, bottom
    val periodsMs = longArrayOf(14000, 16000, 18000, 20000, 22000)
    const val dragMax = 0.12f                           // × short side
    val spring = spring<Offset>(stiffness = 120f, dampingRatio = 0.91f)
    const val pressLift = 0.06f
    val curve = CubicBezierEasing(0.22f, 1f, 0.36f, 1f)
    const val pressInMs = 200; const val pressOutMs = 300
    const val introMs = 1200; const val textDelayMs = 400; const val textStaggerMs = 60; const val textMs = 300
    const val satFrom = 0.4f
    const val portraitCenterY = 0.45f
    const val grainOpacity = 0.03f                      // R.drawable.grain = ../grain.png (256px tile)
}

// Same as the web shader: invert the bicubic (Hermite) displacement field, then Hermite color interpolation.
private const val AGSL = """
uniform float2 res; uniform float2 pts[9]; uniform half3 cols[9]; uniform float sat; uniform float lift;
float h(float t){ return t*t*(3.0-2.0*t); }
float2 base(int i){ return float2(float(i - (i/3)*3)*0.5, float(i/3)*0.5); }
float2 offAt(float2 uv){
  float2 g=clamp(uv*2.0,0.0,1.999); float2 c=floor(g); float2 f=g-c; int i0=int(c.y)*3+int(c.x);
  float2 o00=pts[i0]-base(i0), o10=pts[i0+1]-base(i0+1), o01=pts[i0+3]-base(i0+3), o11=pts[i0+4]-base(i0+4);
  return mix(mix(o00,o10,h(f.x)),mix(o01,o11,h(f.x)),h(f.y));
}
half3 colAt(float2 uv){
  float2 g=clamp(uv*2.0,0.0,1.999); float2 c=floor(g); float2 f=g-c; int i0=int(c.y)*3+int(c.x);
  return mix(mix(cols[i0],cols[i0+1],h(f.x)),mix(cols[i0+3],cols[i0+4],h(f.x)),h(f.y));
}
half4 main(float2 fc){
  float2 px=fc/res; float2 uv=px;
  for(int k=0;k<4;k++){ uv=px-offAt(uv); }
  uv=clamp(uv,0.0,1.0);
  half3 c=colAt(uv);
  float2 d=(uv-0.5)*2.0; float wC=h(clamp(1.0-abs(d.x),0.0,1.0))*h(clamp(1.0-abs(d.y),0.0,1.0));
  c*=half(1.0+lift*wC);
  half l=dot(c,half3(0.2126,0.7152,0.0722));
  return half4(mix(half3(l),c,half(sat)),1.0);
}
"""

@Composable
fun DuskMesh(modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val reduceMotion = remember {
        Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    val phases = remember { FloatArray(5) { (Math.random() * 2 * PI).toFloat() } }
    val scope = rememberCoroutineScope()
    val drag = remember { Animatable(Offset.Zero, Offset.VectorConverter) } // added to drift → no jump
    val press = remember { Animatable(0f) }
    val intro = remember { Animatable(if (reduceMotion) 1f else 0f) }
    var hintGone by remember { mutableStateOf(false) }
    var timeMs by remember { mutableLongStateOf(0L) }

    LaunchedEffect(Unit) {
        if (!reduceMotion) launch { intro.animateTo(1f, tween(DuskParams.introMs, easing = DuskParams.curve)) }
        if (reduceMotion) return@LaunchedEffect
        val t0 = withFrameMillis { it }
        while (true) withFrameMillis { timeMs = it - t0 }  // frame clock stops when app is not visible
    }

    val conf = LocalConfiguration.current
    val mobile = conf.screenWidthDp < 760
    val margin = if (mobile) 24.dp else 48.dp

    BoxWithConstraints(modifier.fillMaxSize().background(DuskParams.bg)) {
        val w = constraints.maxWidth.toFloat(); val hgt = constraints.maxHeight.toFloat()
        val s = min(w, hgt)
        val cy = if (hgt > w) DuskParams.portraitCenterY else 0.5f

        fun points(): FloatArray {
            val p = floatArrayOf(0f,0f, .5f,0f, 1f,0f, 0f,cy, .5f,cy, 1f,cy, 0f,1f, .5f,1f, 1f,1f)
            val a = DuskParams.driftAmp * s
            DuskParams.inner.forEachIndexed { k, idx ->
                val om = 2f * PI.toFloat() * timeMs / DuskParams.periodsMs[k]
                p[idx*2] += a * sin(om + phases[k]) / w
                p[idx*2+1] += a * cos(om + phases[k] * 1.7f) / hgt
            }
            p[8] += drag.value.x / w; p[9] += drag.value.y / hgt
            return p
        }

        val input = Modifier.pointerInput(s, cy) {
            awaitEachGesture {
                val down = awaitFirstDown()
                if (!hintGone) scope.launch { kotlinx.coroutines.delay(300); hintGone = true }
                scope.launch { press.animateTo(1f, tween(DuskParams.pressInMs, easing = DuskParams.curve)) }
                fun target(pos: Offset): Offset {
                    var d = pos - Offset(w / 2f, cy * hgt); val m = DuskParams.dragMax * s
                    if (d.getDistance() > m) d *= m / d.getDistance()
                    return d
                }
                fun go(o: Offset) = scope.launch { if (reduceMotion) drag.snapTo(o) else drag.animateTo(o, DuskParams.spring) }
                go(target(down.position))
                while (true) {
                    val e = awaitPointerEvent(); val c = e.changes.first()
                    if (!c.pressed) break
                    c.consume(); go(target(c.position))
                }
                go(Offset.Zero)
                scope.launch { press.animateTo(0f, tween(DuskParams.pressOutMs, easing = DuskParams.curve)) }
            }
        }

        val sat = DuskParams.satFrom + (1 - DuskParams.satFrom) * intro.value
        if (Build.VERSION.SDK_INT >= 33) {
            ShaderLayer(points(), sat, DuskParams.pressLift * press.value, Modifier.fillMaxSize().alpha(intro.value).then(input))
        } else {
            // Fallback: layered radial gradients, breathing only
            Canvas(Modifier.fillMaxSize().alpha(intro.value)) {
                val p = points()
                drawRect(DuskParams.colors[0])
                for ((i, r) in listOf(1 to .6f, 3 to .55f, 7 to .4f, 4 to .45f)) {
                    val c = Offset(p[i*2] * size.width, p[i*2+1] * size.height)
                    drawRect(Brush.radialGradient(listOf(DuskParams.colors[i], Color.Transparent), c, max(size.width, size.height) * r))
                }
            }
        }

        Image(ImageBitmap.imageResource(R.drawable.grain), null,
            Modifier.fillMaxSize().alpha(DuskParams.grainOpacity))  // tile via BitmapShader in production; static, never animated

        Column(Modifier.align(Alignment.BottomStart).padding(margin)) {
            val title = if (mobile) (conf.screenWidthDp * 0.18f).sp else 96.sp
            Rise(0, reduceMotion) { Text("002", color = DuskParams.secondary, fontSize = 13.sp) }
            Rise(1, reduceMotion) { Text("Dusk", color = DuskParams.text, fontSize = title, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.04).em) }
            Rise(2, reduceMotion) { Text("A mesh gradient that breathes.", color = DuskParams.secondary, fontSize = 15.sp) }
        }
        val hintAlpha by animateFloatAsState(if (hintGone) 0f else 1f, tween(300, easing = DuskParams.curve), label = "hint")
        Text("drag to shift the light", color = DuskParams.secondary, fontSize = 13.sp,
            modifier = Modifier.align(Alignment.TopEnd).padding(margin).alpha(hintAlpha))
    }
}

@RequiresApi(33)
@Composable
private fun ShaderLayer(points: FloatArray, sat: Float, lift: Float, modifier: Modifier) {
    val shader = remember { RuntimeShader(AGSL).apply {
        setFloatUniform("cols", DuskParams.colors.flatMap { listOf(it.red, it.green, it.blue) }.toFloatArray())
    } }
    val brush = remember { ShaderBrush(shader) }
    Canvas(modifier) {
        shader.setFloatUniform("res", size.width, size.height)
        shader.setFloatUniform("pts", points)
        shader.setFloatUniform("sat", sat)
        shader.setFloatUniform("lift", lift)
        drawRect(brush)
    }
}

@Composable
private fun Rise(i: Int, reduceMotion: Boolean, content: @Composable () -> Unit) {
    val a = remember { Animatable(if (reduceMotion) 1f else 0f) }
    LaunchedEffect(Unit) {
        if (reduceMotion) return@LaunchedEffect
        kotlinx.coroutines.delay((DuskParams.textDelayMs + i * DuskParams.textStaggerMs).toLong())
        a.animateTo(1f, tween(DuskParams.textMs, easing = DuskParams.curve))
    }
    Box(Modifier.alpha(a.value).offset(y = (4 * (1 - a.value)).dp)) { content() }
}
