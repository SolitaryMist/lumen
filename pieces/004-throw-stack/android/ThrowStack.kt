// Stack — Lumen 004 (Jetpack Compose)
// Put Inter Variable at res/font/inter_variable.ttf. Parameters match the web piece one-to-one.
package lumen.throwstack

import android.provider.Settings
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.sign

/* ===== Stack parameters (identical to web / SwiftUI) =====
   CARDS 5 · 320x440 (r20) wide · min(78% width, 320) at 8:11 (r18) phone · padding 28
   DEPTH i: translationY i*10 · scale 1-i*0.04 · darken 6%/level · alpha clamp(4-depth,0,1)
   INTRO deal bottom->top, stagger 70, 700ms position cubic-bezier(0.22,1,0.36,1) from y+40;
         face alpha 0->1 linear in the first 160ms only; text (number, title,
         subtitle, Open, amber line) stays 0 until then, then 0->1 linear over 120ms
   TICK amber line only on the top card, fades in 200ms linear when a card becomes top
   DRAG x 1:1, y*0.6, rot clamp(x*0.06, ±14)°, origin (0.5, 1.2); card below lifts p*0.6, p=min(|x|/0.5W,1)
   FLING IF |x| > 0.35W or |vx| > 800 dp/s · FLING 360ms cubic-bezier(0.2,0.7,0.3,1) to ±(screen/2+W), ±24°
   SNAP spring k380 c30 (dampingRatio 0.77) with release velocity · SHIFT spring k260 c26 (0.81), stagger 40ms
   TAP slop 8dp, only "Open" navigates
   HINT 2500ms idle -> nudge -28dp and back, 900ms cubic-bezier(0.65,0,0.35,1), max 2, 4000ms apart
   REDUCED MOTION fling = 200ms fade, shift/snap 200ms linear, no hint
   ========================================================= */
private object ST {
    const val DY = 10f; const val DS = 0.04f; const val SHADE = 0.06f
    const val INTRO_STAGGER = 70L; const val INTRO_DUR = 700; const val INTRO_FADE = 160; const val TEXT_FADE = 120; const val TICK_FADE = 200; const val INTRO_Y = 40f
    const val Y_DAMP = 0.6f; const val ROT_PER_DP = 0.06f; const val ROT_MAX = 14f; const val LIFT = 0.6f
    const val FLING_X = 0.35f; const val FLING_V = 800f; const val FLING_DUR = 360; const val FLING_ROT = 24f
    const val SHIFT_STAGGER = 40L; const val TAP_SLOP = 8f
    const val HINT_IDLE = 2500L; const val HINT_X = 28f; const val HINT_DUR = 900; const val HINT_MAX = 2; const val HINT_GAP = 4000L
    const val REDUCED_DUR = 200
    // stiffness / damping (mass 1) -> dampingRatio = c / (2·√k)
    val snap = spring<Float>(dampingRatio = 0.77f, stiffness = 380f)
    val shift = spring<Float>(dampingRatio = 0.81f, stiffness = 260f)
    val eIntro = CubicBezierEasing(0.22f, 1f, 0.36f, 1f)
    val eFling = CubicBezierEasing(0.2f, 0.7f, 0.3f, 1f)
    val eHint = CubicBezierEasing(0.65f, 0f, 0.35f, 1f)
    val bg = Color(0xFF0E0E10); val face = Color(0xFF18181C); val fg = Color(0xFFE8E6E1)
    val dim = Color(0xFF6B6A70); val amber = Color(0xFFF2A65A)
}

private data class Item(val title: String, val sub: String, val url: String?)
private val items = listOf(
    Item("Rim Trace", "A rim of light that follows you", "https://lumen-motion.vercel.app/001-rim-trace/"),
    Item("Dusk", "A gradient that breathes", "https://lumen-motion.vercel.app/002-dusk-mesh/"),
    Item("Weight Field", "Type that gets heavier near you", "https://lumen-motion.vercel.app/003-weight-field/"),
    Item("Stack", "Fling a card, the deck follows", "https://lumen-motion.vercel.app/004-throw-stack/"),
    Item("Coming soon", "Next piece in the works", null),
)

private class CardAnim(i: Int) {
    val x = Animatable(0f); val y = Animatable(0f); val rot = Animatable(0f)
    val depth = Animatable(i.toFloat()); val intro = Animatable(0f); val introAlpha = Animatable(0f); val textAlpha = Animatable(0f)
    val fade = Animatable(1f); val tick = Animatable(0f)
    var flinging by mutableStateOf(false)
}

@Composable
fun ThrowStack(modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val reduced = remember { Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
    val inter = remember { FontFamily(Font(R.font.inter_variable)) }
    val uri = LocalUriHandler.current
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    val cards = remember { List(5) { CardAnim(it) } }
    var order by remember { mutableStateOf(List(5) { it }) }
    var dragging by remember { mutableStateOf(false) }
    var touched by remember { mutableStateOf(false) }

    fun rotOf(x: Float) = (x * ST.ROT_PER_DP).coerceIn(-ST.ROT_MAX, ST.ROT_MAX)

    BoxWithConstraints(modifier.fillMaxSize().background(ST.bg)) {
        val wide = maxWidth > 760.dp
        val wDp = if (wide) 320f else min(maxWidth.value * 0.78f, 320f)
        val screenW = maxWidth.value
        val radius = if (wide) 20.dp else 18.dp

        fun shiftStack(newOrder: List<Int>) {
            newOrder.forEachIndexed { d, ci ->
                val c = cards[ci]; if (c.flinging) return@forEachIndexed
                scope.launch {
                    if (d < 4) delay(d * ST.SHIFT_STAGGER)
                    c.depth.animateTo(d.toFloat(), if (reduced) tween(ST.REDUCED_DUR, easing = LinearEasing) else ST.shift)
                }
            }
        }
        fun fling(ci: Int, dir: Float) {
            val c = cards[ci]; c.flinging = true
            val newOrder = order.drop(1) + order.first(); order = newOrder; shiftStack(newOrder)
            scope.launch { c.tick.snapTo(0f) }
            scope.launch { cards[newOrder.first()].tick.snapTo(0f); cards[newOrder.first()].tick.animateTo(1f, tween(ST.TICK_FADE, easing = LinearEasing)) }
            scope.launch {
                if (reduced) { c.fade.animateTo(0f, tween(ST.REDUCED_DUR, easing = LinearEasing)) }
                else {
                    launch { c.rot.animateTo(dir * ST.FLING_ROT, tween(ST.FLING_DUR, easing = ST.eFling)) }
                    launch { c.y.animateTo(0f, tween(ST.FLING_DUR, easing = ST.eFling)) }
                    c.x.animateTo(dir * (screenW / 2 + wDp), tween(ST.FLING_DUR, easing = ST.eFling))
                }
                // back to the bottom: depth 4 has alpha 0, it only fades in while rising to depth 3 -> no flash
                c.x.snapTo(0f); c.y.snapTo(0f); c.rot.snapTo(0f); c.depth.snapTo(4f); c.fade.snapTo(1f)
                c.flinging = false
            }
        }

        // intro + hint
        LaunchedEffect(Unit) {
            cards.forEachIndexed { i, c -> launch { delay((4 - i) * ST.INTRO_STAGGER)
                launch { c.introAlpha.animateTo(1f, tween(ST.INTRO_FADE, easing = LinearEasing))
                    c.textAlpha.animateTo(1f, tween(ST.TEXT_FADE, easing = LinearEasing)) }
                if (i == 0) launch { c.tick.snapTo(1f) }  // shown through textAlpha on the intro
                c.intro.animateTo(1f, if (reduced) tween(ST.INTRO_DUR, easing = LinearEasing) else tween(ST.INTRO_DUR, easing = ST.eIntro)) } }
            if (reduced) return@LaunchedEffect
            delay(4 * ST.INTRO_STAGGER + ST.INTRO_DUR + ST.HINT_IDLE)
            repeat(ST.HINT_MAX) { n ->
                if (touched) return@LaunchedEffect
                val c = cards[order.first()]
                c.x.animateTo(-ST.HINT_X, tween(ST.HINT_DUR / 2, easing = ST.eHint)) { c.rot.snapToLater(rotOf(value), scope) }
                if (touched) return@LaunchedEffect
                c.x.animateTo(0f, tween(ST.HINT_DUR / 2, easing = ST.eHint)) { c.rot.snapToLater(rotOf(value), scope) }
                if (n < ST.HINT_MAX - 1) delay(ST.HINT_GAP)
            }
        }

        Box(Modifier.align(Alignment.Center).offset(y = (-15).dp).width(wDp.dp).aspectRatio(8f / 11f)) {
            items.forEachIndexed { i, item ->
                val c = cards[i]
                val isTop = order.first() == i
                val d = if (c.flinging) 0f else c.depth.value
                val lift = if (dragging && order.getOrNull(1) == i) 1f - min(abs(cards[order.first()].x.value) / (0.5f * wDp), 1f) * ST.LIFT else d
                val dd = if (dragging && order.getOrNull(1) == i) lift else d
                Box(
                    Modifier.matchParentSize()
                        .zIndex(if (c.flinging) 200f else 100f - dd * 10f)
                        .graphicsLayer {
                            transformOrigin = TransformOrigin(0.5f, 1.2f)
                            translationX = c.x.value.dp.toPx()
                            translationY = (dd * ST.DY + c.y.value + (1f - c.intro.value) * ST.INTRO_Y).dp.toPx()
                            rotationZ = c.rot.value
                            val s = 1f - dd * ST.DS; scaleX = s; scaleY = s
                            alpha = (4f - dd).coerceIn(0f, 1f) * c.introAlpha.value * c.fade.value
                        }
                        .background(ST.face, RoundedCornerShape(radius))
                        .border(1.dp, Color.White.copy(alpha = 0.06f), RoundedCornerShape(radius))
                        .then(if (!isTop) Modifier else Modifier.pointerInput(order) {
                            awaitEachGesture {
                                val down = awaitFirstDown()
                                touched = true
                                if (c.flinging) return@awaitEachGesture
                                val tracker = VelocityTracker(); tracker.addPosition(down.uptimeMillis, down.position)
                                var total = Offset.Zero; dragging = true
                                scope.launch { c.x.stop(); c.y.stop() }
                                while (true) {
                                    val ev = awaitPointerEvent(); val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                                    tracker.addPosition(ch.uptimeMillis, ch.position)
                                    total += ch.positionChange(); ch.consume()
                                    val xd = total.x / density.density; val yd = total.y / density.density * ST.Y_DAMP
                                    scope.launch { c.x.snapTo(xd); c.y.snapTo(yd); c.rot.snapTo(rotOf(xd)) }
                                    if (!ch.pressed) break
                                }
                                dragging = false
                                val v = tracker.calculateVelocity()
                                val vx = v.x / density.density; val vy = v.y / density.density
                                val moved = hypot(total.x, total.y) / density.density
                                if (moved < ST.TAP_SLOP) { scope.launch { c.x.animateTo(0f, ST.snap); c.y.animateTo(0f, ST.snap) }; return@awaitEachGesture }
                                if (abs(c.x.value) > ST.FLING_X * wDp || abs(vx) > ST.FLING_V) {
                                    fling(i, if (abs(vx) > ST.FLING_V) sign(vx) else (if (c.x.value >= 0) 1f else -1f))
                                } else scope.launch {
                                    val spec: AnimationSpec<Float> = if (reduced) tween(ST.REDUCED_DUR, easing = LinearEasing) else ST.snap
                                    launch { c.y.animateTo(0f, spec, initialVelocity = vy * ST.Y_DAMP) }
                                    c.x.animateTo(0f, spec, initialVelocity = vx) { c.rot.snapToLater(rotOf(value), scope) }
                                    c.rot.snapTo(0f)
                                }
                            }
                        })
                ) {
                    Column(Modifier.fillMaxSize().graphicsLayer { alpha = c.textAlpha.value }.padding(28.dp)) {
                        Box(Modifier.size(24.dp, 2.dp).graphicsLayer { alpha = if (isTop && !c.flinging) c.tick.value else 0f }.background(ST.amber))
                        Spacer(Modifier.height(14.dp))
                        Text("%02d".format(i + 1), color = ST.fg, fontFamily = inter, fontWeight = FontWeight.SemiBold,
                            fontSize = 96.sp, letterSpacing = (-0.04).em, lineHeight = 86.sp)
                        Spacer(Modifier.weight(1f))
                        Row(verticalAlignment = Alignment.Bottom) {
                            Column(Modifier.weight(1f)) {
                                Text(item.title, color = ST.fg, fontFamily = inter, fontWeight = FontWeight.Medium, fontSize = 15.sp)
                                Spacer(Modifier.height(4.dp))
                                Text(item.sub, color = ST.dim, fontFamily = inter, fontSize = 13.sp)
                            }
                            item.url?.let { url ->
                                Text("Open ↗", color = ST.dim, fontFamily = inter, fontSize = 13.sp,
                                    modifier = Modifier.pointerInput(isTop) {
                                        awaitEachGesture {
                                            val down = awaitFirstDown(requireUnconsumed = false); var moved = 0f
                                            while (true) { val e = awaitPointerEvent(); val ch = e.changes.first()
                                                moved = maxOf(moved, (ch.position - down.position).getDistance() / density.density)
                                                if (!ch.pressed) break }
                                            if (isTop && moved < ST.TAP_SLOP) uri.openUri(url)
                                        }
                                    })
                            }
                        }
                    }
                    Box(Modifier.matchParentSize().background(Color.Black.copy(alpha = dd.coerceIn(0f, 4f) * ST.SHADE), RoundedCornerShape(radius)))
                }
            }
        }

        Row(Modifier.align(Alignment.TopEnd).padding(top = 20.dp, end = 24.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("GitHub", color = ST.dim, fontFamily = inter, fontSize = 12.sp, modifier = Modifier.pointerInput(Unit) { awaitEachGesture { awaitFirstDown(); uri.openUri("https://github.com/SolitaryMist/lumen") } })
            Text("@aldininin", color = ST.dim, fontFamily = inter, fontSize = 12.sp, modifier = Modifier.pointerInput(Unit) { awaitEachGesture { awaitFirstDown(); uri.openUri("https://x.com/aldininin") } })
        }
        Text(buildAnnotatedString {
            withStyle(SpanStyle(color = ST.amber)) { append("%02d".format(order.first() + 1)) }
            withStyle(SpanStyle(color = ST.dim)) { append(" / 05") }
        }, fontFamily = inter, fontSize = 13.sp,
            modifier = Modifier.align(Alignment.BottomStart).padding(start = if (wide) 48.dp else 24.dp, bottom = if (wide) 40.dp else 24.dp))
    }
}

/** Keeps rotation tied to x (rot = clamp(x*0.06, ±14)) while x animates. */
private fun Animatable<Float, AnimationVector1D>.snapToLater(v: Float, scope: kotlinx.coroutines.CoroutineScope) {
    scope.launch { snapTo(v) }
}
