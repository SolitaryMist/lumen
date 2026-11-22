// GlassLensView.swift
// Lumen Nº 009 — "Glass Lens"
//
// PARAMETERS:
// - Card: aspect ratio 1.586, width min(640, 86% container, 111% container height),
//   face #121214, 1pt stroke rgba(255,255,255,0.06), corner radius 20, page #0B0B0C,
//   hairlines every 8 device pixels, 1 device pixel tall, rgba(255,255,255,0.07).
// - Lens: rest diameter 0.30 x card width, hold diameter 0.36 x card width,
//   hemisphere refraction, centre magnification 1.35 (hold 1.8), IOR = magnification,
//   edge-only chromatic aberration e = smoothstep(0.72, 1, r), R x (1 - 0.012e), B x (1 + 0.012e)
//   (hold CA = 0.024), 1pt inner highlight rgba(255,255,255,0.18),
//   soft shadow 10pt down / 28pt blur rgba(0,0,0,0.5) outside lens,
//   amber arc 40° at top-left 135° (Y-up), 1.5pt, #FFB547.
// - Physics: semi-implicit Euler (m=1, substeps n = max(1, round(dt*240))),
//   follow spring 170/22 (SwiftUI mapping 0.48 / 0.84), hold spring 280/28,
//   liquid stretch s = 1 + min(|v|/3000, 0.12) along velocity, perpendicular 1/s, smoothed by 280/28.
// - Drift: figure-8 path x = 0.50 + 0.28 sin(2π t / 8s), y = 0.52 + 0.10 sin(4π t / 8s),
//   drift speed eased from 0 over 800ms smoothstep. At t=0 lens sits on title.
// - Intro: card opacity linear 0 -> 1 over 160ms, lens scale 0.6 -> 1 over 600ms timingCurve(0.16, 1, 0.3, 1).
// - Reduced Motion: lens static at rest (0.62, 0.50), no stretch, 200ms fade for hold & card fade, no drift.
// - Fine Pointer: macOS / Mac Catalyst / iOS with connected mouse rests until pointer input;
//   .onContinuousHover tracks pointer in card space. Press via DragGesture(minimumDistance: 0).
//
// DISCLAIMER: Source only: not compiled, not run on a device.

import SwiftUI
#if canImport(UIKit)
import UIKit
#endif
#if canImport(GameController)
import GameController
#endif
// MARK: - Metal Shader Source

private let glassLensMetalSource = """
#include <metal_stdlib>
#include <SwiftUI/SwiftUI_Metal.h>
using namespace metal;
// Drop this stitchable function into GlassLens.metal in the app target so ShaderLibrary can load it.
// Source only: this string is not compiled here.

[[ stitchable ]] half4 glassLensShader(
    float2 position,
    SwiftUI::Layer layer,
    float2 lensCenter,
    float lensRadius,
    float stretch,
    float stretchAngle,
    float mag,
    float caAmount,
    float2 cardSize
) {
    float2 p = position - lensCenter;
    
    float cosA = cos(-stretchAngle);
    float sinA = sin(-stretchAngle);
    float2 pRot = float2(p.x * cosA - p.y * sinA, p.x * sinA + p.y * cosA);
    float2 pUnstretched = float2(pRot.x / max(stretch, 0.001), pRot.y * stretch);
    float2 pNorm = float2(pUnstretched.x * cosA + pUnstretched.y * sinA, -pUnstretched.x * sinA + pUnstretched.y * cosA);
    
    float dist = length(pNorm);
    float r = dist / max(lensRadius, 1.0);
    
    if (r > 1.0) {
        float2 shadowCenter = lensCenter + float2(0.0, 10.0);
        float dShadow = length(position - shadowCenter);
        float shadowFactor = 1.0 - smoothstep(lensRadius, lensRadius + 28.0, dShadow);
        half4 bg = layer.sample(position);
        half3 shadowCol = half3(0.0, 0.0, 0.0);
        return half4(mix(bg.rgb, shadowCol, shadowFactor * 0.5), bg.a);
    }
    
    float z = sqrt(max(0.0, 1.0 - r * r));
    float refractScale = (1.0 / mag) + (1.0 - 1.0 / mag) * (1.0 - z);
    float2 sampleP = lensCenter + pNorm * refractScale;
    
    float e = smoothstep(0.72, 1.0, r);
    float ca = caAmount * e;
    
    float2 rCoord = lensCenter + (sampleP - lensCenter) * (1.0 - ca);
    float2 gCoord = sampleP;
    float2 bCoord = lensCenter + (sampleP - lensCenter) * (1.0 + ca);
    
    half4 colorR = layer.sample(rCoord);
    half4 colorG = layer.sample(gCoord);
    half4 colorB = layer.sample(bCoord);
    half4 color = half4(colorR.r, colorG.g, colorB.b, colorG.a);
    
    float edgeDist = (1.0 - r) * lensRadius;
    float innerHighlight = smoothstep(0.0, 0.8, edgeDist) * (1.0 - smoothstep(0.8, 1.8, edgeDist));
    color.rgb = mix(color.rgb, half3(1.0, 1.0, 1.0), innerHighlight * 0.18);
    
    float angle = atan2(-pNorm.y, pNorm.x);
    float targetAngle = 2.35619449;
    float diffAngle = abs(atan2(sin(angle - targetAngle), cos(angle - targetAngle)));
    float arcAngleMask = 1.0 - smoothstep(0.30, 0.35, diffAngle);
    float arcRadialMask = smoothstep(0.0, 0.5, edgeDist) * (1.0 - smoothstep(1.5, 2.5, edgeDist));
    half3 amberColor = half3(1.0, 0.7098, 0.2784);
    color.rgb = mix(color.rgb, amberColor, arcAngleMask * arcRadialMask);
    
    float aa = smoothstep(1.0, 0.98, r);
    half4 bg = layer.sample(position);
    color.rgb = mix(bg.rgb, color.rgb, aa);
    
    return color;
}
"""

// MARK: - Math Helpers

private func smoothstep(_ edge0: Double, _ edge1: Double, _ x: Double) -> Double {
    let t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)
}

private func lerp(_ a: Double, _ b: Double, _ t: Double) -> Double {
    return a + (b - a) * t
}

/// Cubic bezier unit solver, same idea as the web piece.
private func unitBezier(_ x: Double, _ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double) -> Double {
    if x <= 0 { return 0 }
    if x >= 1 { return 1 }
    var t = x
    for _ in 0..<8 {
        let currentX = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t
        let dX = 3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2)
        let e = currentX - x
        if abs(e) < 1e-6 || abs(dX) < 1e-6 { break }
        t -= e / dX
    }
    if t < 0 || t > 1 {
        var a = 0.0, b = 1.0
        t = x
        for _ in 0..<30 {
            let currentX = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t
            if currentX < x { a = t } else { b = t }
            t = (a + b) * 0.5
        }
    }
    return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t
}

// MARK: - Main View

public struct GlassLensView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    
    @State private var position: CGPoint = .zero
    @State private var velocity: CGVector = .zero
    @State private var holdAmount: Double = 0.0
    @State private var holdVelocity: Double = 0.0
    @State private var stretch: Double = 1.0
    @State private var stretchVel: Double = 0.0
    @State private var stretchAngle: Double = 0.0
    
    @State private var pointerLocation: CGPoint = .zero
    @State private var isHovering: Bool = false
    @State private var isPressing: Bool = false
    @State private var hasPointerDevice: Bool = false
    
    @State private var startTime: Date = Date()
    @State private var lastTime: Date = Date()
    @State private var driftClock: Double = 0.0
    @State private var isInitialized: Bool = false
    
    public init() {}
    
    public var body: some View {
        ZStack {
            Color(red: 0.043, green: 0.043, blue: 0.047)
                .ignoresSafeArea()
            
            GeometryReader { geometry in
                let containerW = geometry.size.width
                let containerH = geometry.size.height
                
                let cardW = min(640.0, min(containerW * 0.86, containerH * 1.11))
                let cardH = cardW / 1.586
                
                let restRadius = cardW * 0.15
                let holdRadius = cardW * 0.18
                let currentRadius = lerp(restRadius, holdRadius, holdAmount) * introScale
                let currentMag = lerp(1.35, 1.80, holdAmount)
                let currentCA = lerp(0.012, 0.024, holdAmount)
                
                let wallTime = Date().timeIntervalSince(startTime)
                let cardOpacity = reduceMotion ? min(1.0, wallTime / 0.20) : min(1.0, wallTime / 0.16)
                
                let introScale: CGFloat = {
                    if reduceMotion { return 1.0 }
                    let t = min(1.0, wallTime / 0.60)
                    let eased = unitBezier(t, 0.16, 1.0, 0.3, 1.0)
                    return 0.6 + 0.4 * eased
                }()
                
                TimelineView(.animation) { timelineContext in
                    let now = timelineContext.date
                    let dt = min(0.033, max(0.001, now.timeIntervalSince(lastTime)))
                    
                    let _ = DispatchQueue.main.async {
                        self.updatePhysics(
                            dt: dt,
                            cardW: cardW,
                            cardH: cardH,
                            wallTime: wallTime
                        )
                        self.lastTime = now
                    }
                    
                    ZStack {
                        RenderCardContent(
                            cardW: cardW,
                            cardH: cardH,
                            position: position,
                            radius: currentRadius,
                            stretch: stretch,
                            stretchAngle: stretchAngle,
                            mag: currentMag,
                            ca: currentCA
                        )
                    }
                    .frame(width: cardW, height: cardH)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .stroke(Color.white.opacity(0.06), lineWidth: 1)
                    )
                    .opacity(cardOpacity)
                    .onContinuousHover { phase in
                        switch phase {
                        case .active(let location):
                            isHovering = true
                            hasPointerDevice = true
                            pointerLocation = location
                        case .ended:
                            isHovering = false
                        }
                    }
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                if !isPressing {
                                    triggerHaptic(reduceMotion: reduceMotion)
                                }
                                isPressing = true
                                pointerLocation = value.location
                            }
                            .onEnded { _ in
                                if isPressing {
                                    triggerHaptic(reduceMotion: reduceMotion)
                                }
                                isPressing = false
                            }
                    )
                    .onAppear {
                        if !isInitialized {
                            self.startTime = Date()
                            self.lastTime = Date()
                            self.position = CGPoint(x: cardW * 0.62, y: cardH * 0.50)
                            self.hasPointerDevice = checkFinePointer()
                            self.isInitialized = true
                        }
                    }
                }
                .frame(width: containerW, height: containerH)
            }
        }
    }
    
    private func updatePhysics(dt: Double, cardW: CGFloat, cardH: CGFloat, wallTime: Double) {
        let restPos = CGPoint(x: cardW * 0.62, y: cardH * 0.50)
        
        let targetPos: CGPoint
        if reduceMotion {
            targetPos = restPos
        } else if isHovering || (isPressing && hasPointerDevice) {
            targetPos = pointerLocation
        } else if hasPointerDevice {
            targetPos = restPos
        } else {
            let driftRamp = smoothstep(0.0, 0.80, max(0.0, wallTime - 0.60))
            driftClock += dt * driftRamp
            let xFrac = 0.50 + 0.28 * sin(2.0 * .pi * driftClock / 8.0)
            let yFrac = 0.52 + 0.10 * sin(4.0 * .pi * driftClock / 8.0)
            targetPos = CGPoint(x: cardW * xFrac, y: cardH * yFrac)
        }
        
        let targetHold: Double = isPressing ? 1.0 : 0.0
        
        let kFollow: Double = 170.0
        let cFollow: Double = 22.0
        let kHold: Double = 280.0
        let cHold: Double = 28.0
        let kStretch: Double = 280.0
        let cStretch: Double = 28.0
        
        let nSubsteps = max(1, Int((dt * 240.0).rounded()))
        let subDt = dt / Double(nSubsteps)
        
        for _ in 0..<nSubsteps {
            if reduceMotion {
                position = restPos
                velocity = .zero
                holdAmount += (targetHold - holdAmount) * min(1.0, subDt / 0.20)
                stretch = 1.0
                stretchVel = 0.0
            } else {
                let ax = -kFollow * (position.x - targetPos.x) - cFollow * velocity.dx
                let ay = -kFollow * (position.y - targetPos.y) - cFollow * velocity.dy
                velocity.dx += ax * subDt
                velocity.dy += ay * subDt
                position.x += velocity.dx * subDt
                position.y += velocity.dy * subDt
                
                let aHold = -kHold * (holdAmount - targetHold) - cHold * holdVelocity
                holdVelocity += aHold * subDt
                holdAmount += holdVelocity * subDt
                holdAmount = max(0.0, min(1.0, holdAmount))
                
                let speed = hypot(velocity.dx, velocity.dy)
                let targetStretch = 1.0 + min(speed / 3000.0, 0.12)
                if speed > 1.0 {
                    stretchAngle = atan2(velocity.dy, velocity.dx)
                }
                let aStretch = -kStretch * (stretch - targetStretch) - cStretch * stretchVel
                stretchVel += aStretch * subDt
                stretch += stretchVel * subDt
            }
        }
    }
    
    private func checkFinePointer() -> Bool {
        #if os(macOS)
        return true
        #else
        #if targetEnvironment(macCatalyst)
        return true
        #else
        #if canImport(UIKit)
        if ProcessInfo.processInfo.isiOSAppOnMac {
            return true
        }
        #endif
        #if canImport(GameController)
        if GCMouse.mice().first != nil {
            return true
        }
        #endif
        return false
        #endif
        #endif
    }
    
    private func triggerHaptic(reduceMotion: Bool) {
        guard !reduceMotion else { return }
        #if canImport(UIKit) && !os(watchOS)
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.prepare()
        generator.impactOccurred()
        #endif
    }
}

// MARK: - Render Card Content

private struct RenderCardContent: View {
    let cardW: CGFloat
    let cardH: CGFloat
    let position: CGPoint
    let radius: CGFloat
    let stretch: Double
    let stretchAngle: Double
    let mag: Double
    let ca: Double
    
    var body: some View {
        if #available(iOS 17.0, macOS 14.0, *) {
            CardFaceView(cardW: cardW, cardH: cardH)
                .layerEffect(
                    ShaderLibrary.glassLensShader(
                        .float2(position),
                        .float(Float(radius)),
                        .float(Float(stretch)),
                        .float(Float(stretchAngle)),
                        .float(Float(mag)),
                        .float(Float(ca)),
                        .float2(CGPoint(x: cardW, y: cardH))
                    ),
                    maxSampleOffset: CGSize(width: radius * 2.5, height: radius * 2.5)
                )
        } else {
            FallbackCardView(
                cardW: cardW,
                cardH: cardH,
                position: position,
                radius: radius,
                mag: mag
            )
        }
    }
}

// MARK: - Card Face View

private struct CardFaceView: View {
    let cardW: CGFloat
    let cardH: CGFloat
    
    var body: some View {
        ZStack(alignment: .topLeading) {
            Color(red: 0.0706, green: 0.0706, blue: 0.0784)
            
            Canvas { context, size in
                let scale = context.environment.displayScale
                let spacing: CGFloat = 8.0 / scale
                let hair: CGFloat = 1.0 / scale
                let count = Int(size.height / spacing)
                for i in 0...count {
                    let y = (CGFloat(i) * 8.0).rounded() / scale
                    let rect = CGRect(x: 0, y: y, width: size.width, height: hair)
                    context.fill(Path(rect), with: .color(Color.white.opacity(0.07)))
                }
            }
            
            Image("grain")
                .resizable(resizingMode: .tile)
                .opacity(0.03)
                .frame(width: cardW, height: cardH)
            
            HStack {
                Text("LUMEN")
                    .font(Font.custom("Geist", size: 12).weight(.semibold))
                    .tracking(12 * 0.08)
                    .foregroundColor(Color(red: 0.431, green: 0.427, blue: 0.459))
                
                Spacer()
                
                Text("Nº 009")
                    .font(Font.custom("Geist", size: 12).weight(.semibold))
                    .tracking(12 * 0.08)
                    .foregroundColor(Color(red: 0.431, green: 0.427, blue: 0.459))
            }
            .padding(.horizontal, cardW * 0.06)
            .padding(.top, cardH * 0.06)
            
            Text("Glass Lens")
                .font(Font.custom("Geist", size: cardW * 0.13).weight(.medium))
                .tracking(cardW * 0.13 * -0.04)
                .foregroundColor(Color(red: 0.9098, green: 0.9020, blue: 0.8824))
                .frame(width: cardW, height: cardH, alignment: .topLeading)
                .padding(.leading, cardW * 0.08)
                .offset(y: cardH * 0.58 - cardW * 0.13 * 0.82)
        }
        .frame(width: cardW, height: cardH)
    }
}

// MARK: - Fallback View (Pre-iOS 17)

private struct FallbackCardView: View {
    let cardW: CGFloat
    let cardH: CGFloat
    let position: CGPoint
    let radius: CGFloat
    let mag: Double
    
    var body: some View {
        ZStack {
            CardFaceView(cardW: cardW, cardH: cardH)
            
            Circle()
                .fill(Color.black.opacity(0.40))
                .frame(width: radius * 2.0, height: radius * 2.0)
                .blur(radius: 14)
                .position(x: position.x, y: position.y + 10.0)
            
            CardFaceView(cardW: cardW, cardH: cardH)
                .scaleEffect(mag, anchor: UnitPoint(x: position.x / max(cardW, 1), y: position.y / max(cardH, 1)))
                .mask(
                    Circle()
                        .frame(width: radius * 2.0, height: radius * 2.0)
                        .position(position)
                        .frame(width: cardW, height: cardH)
                )
                .overlay(
                    Circle()
                        .stroke(Color.white.opacity(0.18), lineWidth: 1)
                        .frame(width: radius * 2.0, height: radius * 2.0)
                        .position(position)
                )
                .overlay(
                    AmberArcShape()
                        .stroke(Color(red: 1.0, green: 0.7098, blue: 0.2784), lineWidth: 1.5)
                        .frame(width: radius * 2.0, height: radius * 2.0)
                        .position(position)
                )
        }
        .frame(width: cardW, height: cardH)
    }
}

// MARK: - Amber Arc Shape

private struct AmberArcShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let radius = min(rect.width, rect.height) / 2.0 - 0.75
        let startAngle = Angle(degrees: 205)
        let endAngle = Angle(degrees: 245)
        path.addArc(center: center, radius: radius, startAngle: startAngle, endAngle: endAngle, clockwise: false)
        return path
    }
}
