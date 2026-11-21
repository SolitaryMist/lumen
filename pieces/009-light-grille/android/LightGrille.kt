/*
 * Lumen Piece 009: Light Grille
 * Package: lumen.lightgrille
 *
 * Source only: not compiled, not run on a device.
 *
 * Parameters:
 * - modifier: Modifier applied to the outer root container.
 * - enableGuide: Boolean flag to enable or disable the introductory guide gesture animation.
 * - enableDrift: Boolean flag to enable target light drifting when inactive.
 */

package lumen.lightgrille

import android.content.Context
import android.os.Build
import android.provider.Settings
import android.view.InputDevice
import android.view.MotionEvent
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.compose.ui.input.pointer.PointerEvent
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.PointerType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.isActive
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin

private val PageBackground = Color(0xFF0B0B0C)
private val CardBackground = Color(0xFF121214)
private val CardBorderColor = Color(0x0FFFFFFF)

private val SlatBaseColor = Color(0x0DFFFFFF)
private val SlatLitColor = Color(0x38E8E6E1)
private val AmberColor = Color(0xFFFFB547)
private val AmberBrightColor = Color(0xFFFFD978)

private val InkPrimary = Color(0xFFE8E6E1)
private val InkSecondary = Color(0xFF55545D)

private val SlatGrowEasing = CubicBezierEasing(0.16f, 1.0f, 0.3f, 1.0f)
private val GuideEasing = CubicBezierEasing(0.22f, 1.0f, 0.36f, 1.0f)

@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun LightGrille(
    modifier: Modifier = Modifier,
    enableGuide: Boolean = true,
    enableDrift: Boolean = true
) {
    val context = LocalContext.current
    val density = LocalDensity.current

    val isReducedMotion = remember(context) {
        try {
            Settings.Global.getFloat(
                context.contentResolver,
                Settings.Global.ANIMATOR_DURATION_SCALE,
                1.0f
            ) == 0.0f
        } catch (e: Exception) {
            false
        }
    }

    val hasFinePointerAtLaunch = remember(context) {
        try {
            val ids = InputDevice.getDeviceIds()
            ids.any { id ->
                val device = InputDevice.getDevice(id)
                device != null && (
                    device.supportsSource(InputDevice.SOURCE_MOUSE) ||
                        device.supportsSource(InputDevice.SOURCE_TOUCHPAD)
                )
            }
        } catch (e: Exception) {
            false
        }
    }

    val geistFontFamily = remember {
        try {
            val resId = context.resources.getIdentifier("geist_regular", "font", context.packageName)
            if (resId != 0) {
                FontFamily(Font(resId, FontWeight.Normal))
            } else {
                FontFamily.SansSerif
            }
        } catch (e: Exception) {
            FontFamily.SansSerif
        }
    }

    val grainBitmap = remember {
        try {
            val resId = context.resources.getIdentifier("grain", "drawable", context.packageName)
            if (resId != 0) {
                ImageBitmap.imageResource(context.resources, resId)
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }
    }

    var cardOpacity by remember { mutableFloatStateOf(if (isReducedMotion) 1.0f else 0.0f) }
    var activePointerTargetX by remember { mutableFloatStateOf(0.0f) }
    var activePointerTargetY by remember { mutableFloatStateOf(0.0f) }
    var isPointerInside by remember { mutableStateOf(false) }
    var isHoldActive by remember { mutableStateOf(false) }

    var lightX by remember { mutableFloatStateOf(0.0f) }
    var lightY by remember { mutableFloatStateOf(0.0f) }
    var lightVx by remember { mutableFloatStateOf(0.0f) }
    var lightVy by remember { mutableFloatStateOf(0.0f) }

    var cardScale by remember { mutableFloatStateOf(1.0f) }
    var cardScaleVel by remember { mutableFloatStateOf(0.0f) }

    val slatClosedVal = remember { Array(10) { FloatArray(10) { 0.0f } } }
    val slatClosedVel = remember { Array(10) { FloatArray(10) { 0.0f } } }

    var focusC by remember { mutableIntStateOf(4) }
    var focusR by remember { mutableIntStateOf(4) }
    var lastFocusC by remember { mutableIntStateOf(4) }
    var lastFocusR by remember { mutableIntStateOf(4) }

    var holdStartTimeMs by remember { mutableLongStateOf(0L) }
    var releaseStartTimeMs by remember { mutableLongStateOf(0L) }

    var startTimeNanos by remember { mutableLongStateOf(0L) }
    var elapsedMsState by remember { mutableLongStateOf(0L) }
    var cardPxWidth by remember { mutableFloatStateOf(420.0f) }
    var promotedFine by remember { mutableStateOf(false) }

    LaunchedEffect(isReducedMotion, hasFinePointerAtLaunch, enableGuide, enableDrift) {
        var lastNanos = System.nanoTime()
        startTimeNanos = lastNanos

        while (isActive) {
            withFrameNanos { frameTimeNanos ->
                if (startTimeNanos == 0L) startTimeNanos = frameTimeNanos
                val elapsedMs = (frameTimeNanos - startTimeNanos) / 1_000_000L
                elapsedMsState = elapsedMs
                val rawDt = (frameTimeNanos - lastNanos) / 1_000_000_000.0f
                lastNanos = frameTimeNanos
                val dt = rawDt.coerceIn(0.0f, 0.05f)
                if (dt <= 0.0f) return@withFrameNanos

                if (isReducedMotion) {
                    cardOpacity = (elapsedMs / 200.0f).coerceIn(0.0f, 1.0f)
                    lightX = 0.0f
                    lightY = 0.0f
                    lightVx = 0.0f
                    lightVy = 0.0f
                    cardScale = 1.0f
                    cardScaleVel = 0.0f
                    focusC = 4
                    focusR = 4
                    for (c in 0 until 10) {
                        for (r in 0 until 10) {
                            slatClosedVal[c][r] = 0.0f
                            slatClosedVel[c][r] = 0.0f
                        }
                    }
                    return@withFrameNanos
                }

                if (elapsedMs < 160L) {
                    cardOpacity = (elapsedMs / 160.0f).coerceIn(0.0f, 1.0f)
                } else {
                    cardOpacity = 1.0f
                }

                val targetX: Float
                val targetY: Float

                val fineNow = hasFinePointerAtLaunch || promotedFine
                if (isPointerInside) {
                    targetX = activePointerTargetX
                    targetY = activePointerTargetY
                } else if (fineNow || !enableGuide) {
                    targetX = 0.0f
                    targetY = 0.0f
                } else {
                    if (elapsedMs < 760L) {
                        targetX = -50.0f
                        targetY = 35.0f
                    } else if (elapsedMs < 1280L) {
                        val progress = ((elapsedMs - 760L) / 520.0f).coerceIn(0.0f, 1.0f)
                        val eased = GuideEasing.transform(progress)
                        targetX = -50.0f + 100.0f * eased
                        targetY = 35.0f - 70.0f * eased
                    } else if (enableDrift) {
                        val tDrift = (elapsedMs - 1280L).toFloat()
                        targetX = 50.0f * cos(2.0f * PI.toFloat() * tDrift / 8000.0f)
                        targetY = -35.0f * cos(2.0f * PI.toFloat() * tDrift / 8000.0f)
                    } else {
                        targetX = 50.0f
                        targetY = -35.0f
                    }
                }

                val substeps = max(1, (dt * 240.0f).roundToInt())
                val subDt = dt / substeps.toFloat()

                val followK = 260.0f
                val followC = 24.0f

                val cardTargetScale = if (isHoldActive) 0.98f else 1.0f
                val cardK = if (isHoldActive) 420.0f else 300.0f
                val cardC = if (isHoldActive) 28.0f else 20.0f

                val holdK = 420.0f
                val holdC = 28.0f
                val releaseK = 300.0f
                val releaseC = 20.0f

                for (step in 0 until substeps) {
                    val aLx = -followK * (lightX - targetX) - followC * lightVx
                    lightVx += aLx * subDt
                    lightX += lightVx * subDt

                    val aLy = -followK * (lightY - targetY) - followC * lightVy
                    lightVy += aLy * subDt
                    lightY += lightVy * subDt

                    val aScale = -cardK * (cardScale - cardTargetScale) - cardC * cardScaleVel
                    cardScaleVel += aScale * subDt
                    cardScale += cardScaleVel * subDt
                }

                var minDistSq = Float.MAX_VALUE
                var bestC = focusC
                var bestR = focusR
                val cell = cardPxWidth * 0.66f / 10.0f

                for (r in 0 until 10) {
                    for (c in 0 until 10) {
                        val sx = (c + 0.5f - 5.0f) * cell
                        val sy = (r + 0.5f - 5.0f) * cell
                        val dSq = (sx - lightX) * (sx - lightX) + (sy - lightY) * (sy - lightY)
                        if (dSq < minDistSq) {
                            minDistSq = dSq
                            bestC = c
                            bestR = r
                        }
                    }
                }

                if (!isHoldActive) {
                    focusC = bestC
                    focusR = bestR
                }

                val activeFc = if (isHoldActive) lastFocusC else focusC
                val activeFr = if (isHoldActive) lastFocusR else focusR

                for (r in 0 until 10) {
                    for (c in 0 until 10) {
                        val isFocus = (c == activeFc && r == activeFr)
                        val targetClosed = if (isHoldActive && !isFocus) 1.0f else 0.0f

                        val chebyshev = max(abs(c - activeFc), abs(r - activeFr))
                        val delayMs = chebyshev * 18L

                        val canUpdate = if (isHoldActive) {
                            true
                        } else {
                            elapsedMs >= releaseStartTimeMs + delayMs
                        }

                        if (canUpdate) {
                            val curK = if (isHoldActive) holdK else releaseK
                            val curC = if (isHoldActive) holdC else releaseC

                            var valPos = slatClosedVal[c][r]
                            var valVel = slatClosedVel[c][r]

                            for (step in 0 until substeps) {
                                val accel = -curK * (valPos - targetClosed) - curC * valVel
                                valVel += accel * subDt
                                valPos += valVel * subDt
                            }

                            slatClosedVal[c][r] = valPos.coerceIn(0.0f, 1.0f)
                            slatClosedVel[c][r] = valVel
                        }
                    }
                }
            }
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(PageBackground),
        contentAlignment = Alignment.Center
    ) {
        BoxWithConstraints(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            val containerWidth = maxWidth
            val cardWidth = minOf(420.dp, containerWidth * 0.86f)
            val measuredPx = with(density) { cardWidth.toPx() }
            if (cardPxWidth != measuredPx) {
                cardPxWidth = measuredPx
            }

            Box(
                modifier = Modifier
                    .width(cardWidth)
                    .aspectRatio(3.0f / 4.0f)
                    .graphicsLayer {
                        scaleX = cardScale
                        scaleY = cardScale
                        alpha = cardOpacity
                    }
                    .clip(RoundedCornerShape(20.dp))
                    .background(CardBackground)
                    .border(1.dp, CardBorderColor, RoundedCornerShape(20.dp))
                    .pointerInput(isReducedMotion) {
                        if (isReducedMotion) return@pointerInput
                        awaitPointerEventScope {
                            while (true) {
                                val event: PointerEvent = awaitPointerEvent()
                                val change = event.changes.firstOrNull() ?: continue
                                val pos = change.position

                                val cardPxW = size.width.toFloat()
                                val cardPxH = size.height.toFloat()
                                val gridSidePx = cardPxW * 0.66f
                                val gridCenterX = cardPxW * 0.5f
                                val gridCenterY = cardPxH * 0.5f

                                val localGridX = pos.x - gridCenterX
                                val localGridY = pos.y - gridCenterY

                                val isFineType = change.type == PointerType.Mouse || change.type == PointerType.Stylus
                                if (isFineType) promotedFine = true
                                when (event.type) {
                                    PointerEventType.Enter, PointerEventType.Move -> {
                                        if (isFineType || isHoldActive) {
                                            isPointerInside = true
                                            activePointerTargetX = localGridX
                                            activePointerTargetY = localGridY
                                        }
                                    }
                                    PointerEventType.Exit -> {
                                        isPointerInside = false
                                        if (isHoldActive) {
                                            isHoldActive = false
                                            releaseStartTimeMs = elapsedMsState
                                        }
                                    }
                                    PointerEventType.Press -> {
                                        isHoldActive = true
                                        lastFocusC = focusC
                                        lastFocusR = focusR
                                        holdStartTimeMs = elapsedMsState
                                    }
                                    PointerEventType.Release -> {
                                        isHoldActive = false
                                        releaseStartTimeMs = elapsedMsState
                                        if (!isFineType) isPointerInside = false
                                    }
                                }
                            }
                        }
                    }
            ) {
                Canvas(modifier = Modifier.fillMaxSize()) {
                    val cardPxW = size.width
                    val cardPxH = size.height
                    val gridSide = cardPxW * 0.66f
                    val cell = gridSide / 10.0f
                    val restWidth = gridSide * 0.028f
                    val restHeight = gridSide * 0.05f
                    val cornerRadiusPx = with(density) { 1.dp.toPx() }

                    val gridCenterX = cardPxW * 0.5f
                    val gridCenterY = cardPxH * 0.5f

                    val totalElapsedMs = elapsedMsState

                    val activeFc = if (isHoldActive) lastFocusC else focusC
                    val activeFr = if (isHoldActive) lastFocusR else focusR

                    for (r in 0 until 10) {
                        for (c in 0 until 10) {
                            val slatCenterX = gridCenterX + (c + 0.5f - 5.0f) * cell
                            val slatCenterY = gridCenterY + (r + 0.5f - 5.0f) * cell

                            val slatRelX = (c + 0.5f - 5.0f) * cell
                            val slatRelY = (r + 0.5f - 5.0f) * cell

                            val d = hypot(slatRelX - lightX, slatRelY - lightY)

                            val hHover = if (isReducedMotion) 1.0f else {
                                (1.0f + 0.35f * (1.0f / (1.0f + (d / (0.22f * gridSide)).pow(2)))).coerceAtMost(1.35f)
                            }

                            val introGrowProgress = if (isReducedMotion) 1.0f else {
                                val delayMs = (12.0f * hypot(c - 4.5f, r - 4.5f)).toLong()
                                val slatAnimTime = (totalElapsedMs - delayMs).coerceAtLeast(0L)
                                val fraction = (slatAnimTime / 600.0f).coerceIn(0.0f, 1.0f)
                                SlatGrowEasing.transform(fraction)
                            }

                            val dx = slatRelX - lightX
                            val rotYHover = (dx * 0.3f).coerceIn(-25.0f, 25.0f)

                            val closedVal = slatClosedVal[c][r]
                            val isFocus = (c == activeFc && r == activeFr)

                            val effectiveRotY = if (isFocus) rotYHover else {
                                rotYHover * (1.0f - closedVal) + 75.0f * closedVal
                            }

                            val scaleXProj = cos(effectiveRotY * PI.toFloat() / 180.0f).coerceAtLeast(0.05f)

                            val finalWidthScale = if (isFocus && isHoldActive) 0.8f else 1.0f
                            val finalHeightScale = hHover * introGrowProgress * (if (isFocus && isHoldActive) 1.5f else 1.0f)

                            val drawWidth = max(1.5f, restWidth * finalWidthScale * scaleXProj)
                            val drawHeight = restHeight * finalHeightScale

                            val slatColor = when {
                                isReducedMotion -> {
                                    if (c == 4 && r == 4) AmberColor else SlatBaseColor
                                }
                                isFocus -> {
                                    if (isHoldActive) AmberBrightColor else AmberColor
                                }
                                else -> {
                                    val t = ((cell * cell) / (d * d + 1.0f)).coerceIn(0.0f, 1.0f)
                                    Color(
                                        red = SlatBaseColor.red + t * (SlatLitColor.red - SlatBaseColor.red),
                                        green = SlatBaseColor.green + t * (SlatLitColor.green - SlatBaseColor.green),
                                        blue = SlatBaseColor.blue + t * (SlatLitColor.blue - SlatBaseColor.blue),
                                        alpha = SlatBaseColor.alpha + t * (SlatLitColor.alpha - SlatBaseColor.alpha)
                                    )
                                }
                            }

                            withTransform({
                                translate(left = slatCenterX, top = slatCenterY)
                            }) {
                                drawRoundRect(
                                    color = slatColor,
                                    topLeft = Offset(-drawWidth * 0.5f, -drawHeight * 0.5f),
                                    size = Size(drawWidth, drawHeight),
                                    cornerRadius = CornerRadius(cornerRadiusPx, cornerRadiusPx)
                                )
                            }
                        }
                    }
                }

                if (grainBitmap != null) {
                    val grainPainter = remember(grainBitmap) { BitmapPainter(grainBitmap) }
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .alpha(0.03f)
                            .drawWithContent {
                                drawRect(
                                    painter = grainPainter,
                                    size = size,
                                    tileMode = TileMode.Repeated
                                )
                            }
                    )
                }

                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 24.dp, vertical = 22.dp)
                ) {
                    Text(
                        text = "LUMEN",
                        color = InkSecondary,
                        fontSize = 12.sp,
                        fontFamily = geistFontFamily,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 0.12.em
                    )

                    Spacer(modifier = Modifier.weight(1.0f))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Light Grille",
                            color = InkPrimary,
                            fontSize = 22.sp,
                            fontFamily = geistFontFamily,
                            fontWeight = FontWeight.Medium,
                            letterSpacing = (-0.03).em
                        )
                        Spacer(modifier = Modifier.weight(1.0f))
                        Text(
                            text = "Nº 009",
                            color = InkSecondary,
                            fontSize = 12.sp,
                            fontFamily = geistFontFamily,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }
        }
    }
}
