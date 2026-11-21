//
// LightGrilleView.swift
// Lumen piece 009: "Light Grille"
//
// Source only: not compiled, not run on a device.
//
// Parameters:
// - Card: aspect 3:4, width min(420, 86% container width), corner radius 20, stroke 1pt rgba(255,255,255,0.06), fill #121214, page #0B0B0C
// - Grid: 10x10, side = 66% card width, cell = gridSide/10, slat rest width = 2.8% grid side, rest height = 5% grid side, corner radius 1
// - Springs:
//     follow: stiffness 260, damping 24, mass 1 (SwiftUI response 0.32, dampingFraction 0.75)
//     hold: stiffness 420, damping 28, mass 1 (SwiftUI response 0.18, dampingFraction 0.62)
//     release: stiffness 300, damping 20, mass 1 (SwiftUI response 0.28, dampingFraction 0.70)
// - Guide: starts at 760ms, (-50, +35) to (+50, -35) over 520ms curve(0.22, 1, 0.36, 1); drift P=(50*cos(2πt/8), -35*cos(2πt/8))
// - Intro: card opacity linear 160ms, slat height grow 600ms curve(0.16, 1, 0.3, 1) with 12ms * hypot(c-4.5, r-4.5) stagger
// - Reduced motion: 200ms fade only, static light at (0,0), focus slat (c=4, r=4) amber
// - Fine pointer: resting at (0,0) after intro, no guide/drift, updated by pointer hover
//

import SwiftUI
#if canImport(GameController)
import GameController
#endif
#if canImport(UIKit)
import UIKit
#endif
#if canImport(AppKit)
import AppKit
#endif

private func platformAlwaysHasPointer() -> Bool {
    #if os(macOS) || targetEnvironment(macCatalyst)
    return true
    #elseif os(iOS)
    return ProcessInfo.processInfo.isiOSAppOnMac
    #else
    return false
    #endif
}

private func connectedMice() -> Bool {
    #if canImport(GameController)
    if #available(iOS 14.0, macOS 11.0, *) {
        return !GCMouse.mice().isEmpty
    }
    #endif
    return false
}

private func launchFinePointer() -> Bool {
    platformAlwaysHasPointer() || connectedMice()
}

public struct LightGrilleView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    
    @State private var startTime: Date? = nil
    @State private var lastFrameTime: Date? = nil
    
    @State private var lx: Double = 0.0
    @State private var ly: Double = 0.0
    @State private var vx: Double = 0.0
    @State private var vy: Double = 0.0
    @State private var targetX: Double = -50.0
    @State private var targetY: Double = 35.0
    
    @State private var hasFinePointer: Bool = false
    @State private var isPressed: Bool = false
    @State private var focusIndex: Int = 44
    @State private var slatS: [Double] = Array(repeating: 0.0, count: 100)
    @State private var slatSV: [Double] = Array(repeating: 0.0, count: 100)
    @State private var releaseTime: Date? = nil
    
    @State private var cardScale: Double = 1.0
    @State private var cardScaleV: Double = 0.0
    
    public init() {}
    
    private var isFinePointerEnvironment: Bool {
        launchFinePointer()
    }
    
    public var body: some View {
        GeometryReader { containerGeo in
            let containerW = containerGeo.size.width
            let cardW = min(420.0, containerW * 0.86)
            let cardH = cardW * (4.0 / 3.0)
            
            ZStack {
                Color(red: 11/255, green: 11/255, blue: 12/255)
                    .ignoresSafeArea()
                
                TimelineView(.animation) { timelineContext in
                    let now = timelineContext.date
                    
                    let cardView = CardContentView(
                        now: now,
                        startTime: startTime,
                        lx: lx,
                        ly: ly,
                        isPressed: isPressed,
                        focusIndex: focusIndex,
                        slatS: slatS,
                        cardScale: cardScale,
                        cardWidth: cardW,
                        cardHeight: cardH,
                        reduceMotion: reduceMotion,
                        fontHelper: customFont
                    )
                    .onAppear {
                        if startTime == nil {
                            startTime = now
                            lastFrameTime = now
                            if isFinePointerEnvironment {
                                hasFinePointer = true
                                targetX = 0.0
                                targetY = 0.0
                                lx = 0.0
                                ly = 0.0
                            }
                        }
                    }
                    .onChange(of: now) { _, newDate in
                        updatePhysics(now: newDate, cardWidth: cardW)
                    }
                    
                    cardView
                        .onContinuousHover { phase in
                            guard !reduceMotion else { return }
                            switch phase {
                            case .active(let location):
                                if !hasFinePointer {
                                    hasFinePointer = true
                                }
                                let gridPos = convertToGridSpace(location: location, cardWidth: cardW, cardHeight: cardH)
                                targetX = gridPos.x
                                targetY = gridPos.y
                            case .ended:
                                break
                            }
                        }
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { value in
                                    guard !reduceMotion else { return }
                                    let gridPos = convertToGridSpace(location: value.location, cardWidth: cardW, cardHeight: cardH)
                                    if hasFinePointer {
                                        targetX = gridPos.x
                                        targetY = gridPos.y
                                    }
                                    
                                    if !isPressed {
                                        let gridSide = cardW * 0.66
                                        focusIndex = nearestSlatIndex(lx: lx, ly: ly, gridSide: gridSide)
                                        isPressed = true
                                        releaseTime = nil
                                        triggerHaptic()
                                    }
                                }
                                .onEnded { _ in
                                    guard !reduceMotion else { return }
                                    if isPressed {
                                        isPressed = false
                                        releaseTime = Date()
                                        triggerHaptic()
                                    }
                                }
                        )
                }
                .frame(width: cardW, height: cardH)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
    
    private func convertToGridSpace(location: CGPoint, cardWidth: CGFloat, cardHeight: CGFloat) -> (x: Double, y: Double) {
        let gridX = Double(location.x - cardWidth / 2.0)
        let gridY = Double(location.y - cardHeight / 2.0)
        return (gridX, gridY)
    }
    
    private func updatePhysics(now: Date, cardWidth: CGFloat) {
        guard let sTime = startTime else {
            startTime = now
            lastFrameTime = now
            return
        }
        
        let dtRaw = now.timeIntervalSince(lastFrameTime ?? now)
        lastFrameTime = now
        
        let dt = min(0.05, max(0.0, dtRaw))
        guard dt > 0 else { return }
        let elapsed = now.timeIntervalSince(sTime)
        let gridSide = cardWidth * 0.66
        
        if reduceMotion {
            targetX = 0.0
            targetY = 0.0
            lx = 0.0
            ly = 0.0
            vx = 0.0
            vy = 0.0
            cardScale = 1.0
            cardScaleV = 0.0
            slatS = Array(repeating: 0.0, count: 100)
            slatSV = Array(repeating: 0.0, count: 100)
            focusIndex = 44
            return
        }
        
        if !hasFinePointer {
            if elapsed < 0.760 {
                targetX = -50.0
                targetY = 35.0
            } else if elapsed < 1.280 {
                let guideProgress = (elapsed - 0.760) / 0.520
                let e = cubicBezier(x1: 0.22, y1: 1.0, x2: 0.36, y2: 1.0, t: guideProgress)
                targetX = -50.0 + 100.0 * e
                targetY = 35.0 - 70.0 * e
            } else {
                let driftT = elapsed - 1.280
                targetX = 50.0 * cos(2.0 * .pi * driftT / 8.0)
                targetY = -35.0 * cos(2.0 * .pi * driftT / 8.0)
            }
        }
        
        let n = max(1, Int((dt * 240.0).rounded()))
        let subDt = dt / Double(n)
        
        for _ in 0..<n {
            let ax = -260.0 * (lx - targetX) - 24.0 * vx
            let ay = -260.0 * (ly - targetY) - 24.0 * vy
            vx += ax * subDt
            vy += ay * subDt
            lx += vx * subDt
            ly += vy * subDt
            
            let targetCardScale = isPressed ? 0.98 : 1.0
            let kCard: Double = isPressed ? 420.0 : 300.0
            let cCard: Double = isPressed ? 28.0 : 20.0
            let aCard = -kCard * (cardScale - targetCardScale) - cCard * cardScaleV
            cardScaleV += aCard * subDt
            cardScale += cardScaleV * subDt
            
            for i in 0..<100 {
                let cIdx = i % 10
                let rIdx = i / 10
                let focusC = focusIndex % 10
                let focusR = focusIndex / 10
                let rDist = max(abs(cIdx - focusC), abs(rIdx - focusR))
                
                let targetS: Double
                let kS: Double
                let cS: Double
                
                if isPressed {
                    targetS = 1.0
                    kS = 420.0
                    cS = 28.0
                } else {
                    let relElapsed = releaseTime != nil ? now.timeIntervalSince(releaseTime!) : 999.0
                    let delay = Double(rDist) * 0.018
                    if relElapsed >= delay {
                        targetS = 0.0
                        kS = 300.0
                        cS = 20.0
                    } else {
                        continue
                    }
                }
                
                let aS = -kS * (slatS[i] - targetS) - cS * slatSV[i]
                slatSV[i] += aS * subDt
                slatS[i] += slatSV[i] * subDt
            }
        }
        
        if !isPressed {
            let maxS = slatS.map { abs($0) }.max() ?? 0.0
            if maxS < 0.01 {
                focusIndex = nearestSlatIndex(lx: lx, ly: ly, gridSide: gridSide)
            }
        }
    }
    
    private func nearestSlatIndex(lx: Double, ly: Double, gridSide: Double) -> Int {
        let cell = gridSide / 10.0
        var bestIndex = 0
        var minD = Double.greatestFiniteMagnitude
        for i in 0..<100 {
            let c = i % 10
            let r = i / 10
            let sx = (Double(c) + 0.5 - 5.0) * cell
            let sy = (Double(r) + 0.5 - 5.0) * cell
            let d = hypot(sx - lx, sy - ly)
            if d < minD {
                minD = d
                bestIndex = i
            }
        }
        return bestIndex
    }
    
    private func triggerHaptic() {
        #if canImport(UIKit)
        guard !reduceMotion else { return }
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()
        #endif
    }
    
    private func customFont(size: CGFloat, weight: Font.Weight) -> Font {
        #if canImport(UIKit)
        if UIFont(name: "Geist-Medium", size: size) != nil || UIFont(name: "Geist", size: size) != nil {
            return .custom("Geist", size: size).weight(weight)
        }
        #elseif canImport(AppKit)
        if NSFont(name: "Geist", size: size) != nil {
            return .custom("Geist", size: size).weight(weight)
        }
        #endif
        return .system(size: size, weight: weight, design: .rounded)
    }
}

private struct CardContentView: View {
    let now: Date
    let startTime: Date?
    let lx: Double
    let ly: Double
    let isPressed: Bool
    let focusIndex: Int
    let slatS: [Double]
    let cardScale: Double
    let cardWidth: CGFloat
    let cardHeight: CGFloat
    let reduceMotion: Bool
    let fontHelper: (CGFloat, Font.Weight) -> Font
    
    private var cardOpacity: Double {
        guard let sTime = startTime else { return 0.0 }
        let elapsed = now.timeIntervalSince(sTime)
        if reduceMotion {
            return min(1.0, elapsed / 0.200)
        } else {
            return min(1.0, elapsed / 0.160)
        }
    }
    
    private var nearestIndex: Int {
        if reduceMotion { return 44 }
        let gridSide = cardWidth * 0.66
        let cell = gridSide / 10.0
        var best = 0
        var minD = Double.greatestFiniteMagnitude
        for i in 0..<100 {
            let c = i % 10
            let r = i / 10
            let sx = (Double(c) + 0.5 - 5.0) * cell
            let sy = (Double(r) + 0.5 - 5.0) * cell
            let d = hypot(sx - lx, sy - ly)
            if d < minD {
                minD = d
                best = i
            }
        }
        return best
    }
    
    var body: some View {
        let gridSide = cardWidth * 0.66
        let cell = gridSide / 10.0
        let restW = 0.028 * gridSide
        let restH = 0.05 * gridSide
        let currentNearest = nearestIndex
        let currentFocus = focusIndex
        let elapsed = startTime != nil ? now.timeIntervalSince(startTime!) : 0.0
        
        ZStack {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(red: 18/255, green: 18/255, blue: 20/255))
            
            Canvas { context, size in
                let center = CGPoint(x: size.width / 2.0, y: size.height / 2.0)
                
                for i in 0..<100 {
                    let c = i % 10
                    let r = i / 10
                    let sx = (Double(c) + 0.5 - 5.0) * cell
                    let sy = (Double(r) + 0.5 - 5.0) * cell
                    
                    let d = hypot(sx - lx, sy - ly)
                    let heightScale = min(1.35, 1.0 + 0.35 * (1.0 / (1.0 + pow(d / (0.22 * gridSide), 2.0))))
                    let hoverH = restH * heightScale
                    let dx = sx - lx
                    let hoverRot = max(-25.0, min(25.0, dx * 0.3))
                    
                    let s = slatS[i]
                    let isFocus = (i == currentFocus)
                    
                    let rotDeg: Double
                    let h: Double
                    let w: Double
                    
                    if isFocus {
                        rotDeg = hoverRot * (1.0 - s)
                        h = hoverH * (1.0 - s) + restH * 1.5 * s
                        w = restW * ((1.0 - s) + 0.8 * s)
                    } else {
                        rotDeg = hoverRot * (1.0 - s) + 75.0 * s
                        h = hoverH * (1.0 - s) + restH * s
                        w = restW
                    }
                    
                    let introScale: Double
                    if reduceMotion {
                        introScale = 1.0
                    } else {
                        let staggerDelay = 0.012 * hypot(Double(c) - 4.5, Double(r) - 4.5)
                        let slatElapsed = max(0.0, elapsed - staggerDelay)
                        let tIntro = min(1.0, slatElapsed / 0.600)
                        introScale = cubicBezier(x1: 0.16, y1: 1.0, x2: 0.3, y2: 1.0, t: tIntro)
                    }
                    
                    let finalH = h * introScale
                    let rad = rotDeg * .pi / 180.0
                    let projW = max(0.5, w * abs(cos(rad)))
                    let projH = finalH
                    
                    let cx = center.x + CGFloat(sx)
                    let cy = center.y + CGFloat(sy)
                    let rect = CGRect(x: cx - CGFloat(projW) / 2.0, y: cy - CGFloat(projH) / 2.0, width: CGFloat(projW), height: CGFloat(projH))
                    
                    let isNearest = (i == currentNearest)
                    let fillColor: Color
                    let showAmber = isPressed ? isFocus : isNearest
                    
                    if showAmber {
                        let bMult = 1.0 + 0.2 * s
                        let redVal = min(1.0, 1.0 * bMult)
                        let greenVal = min(1.0, 0.7098039 * bMult)
                        let blueVal = min(1.0, 0.2784313 * bMult)
                        fillColor = Color(red: redVal, green: greenVal, blue: blueVal, opacity: 1.0)
                    } else {
                        let tMix = max(0.0, min(1.0, (cell * cell) / (d * d + 1.0)))
                        let redVal = 1.0 * (1.0 - tMix) + 0.9098039 * tMix
                        let greenVal = 1.0 * (1.0 - tMix) + 0.9019608 * tMix
                        let blueVal = 1.0 * (1.0 - tMix) + 0.8823529 * tMix
                        let alphaVal = 0.05 * (1.0 - tMix) + 0.22 * tMix
                        fillColor = Color(red: redVal, green: greenVal, blue: blueVal, opacity: alphaVal)
                    }
                    
                    let pathRadius = min(1.0, projW / 2.0)
                    let path = Path(roundedRect: rect, cornerRadius: CGFloat(pathRadius))
                    context.fill(path, with: .color(fillColor))
                }
            }
            
            Rectangle()
                .fill(ImagePaint(image: Image("grain"), scale: 1.0))
                .opacity(0.03)
                .allowsHitTesting(false)
            
            VStack {
                HStack {
                    Text("LUMEN")
                        .font(fontHelper(12, .semibold))
                        .tracking(1.44)
                        .foregroundColor(Color(red: 85/255, green: 84/255, blue: 93/255))
                    Spacer()
                }
                Spacer()
                HStack(alignment: .firstTextBaseline) {
                    Text("Light Grille")
                        .font(fontHelper(22, .medium))
                        .tracking(-0.66)
                        .foregroundColor(Color(red: 232/255, green: 230/255, blue: 225/255))
                    Spacer()
                    Text("Nº 009")
                        .font(fontHelper(12, .medium))
                        .tracking(-0.36)
                        .foregroundColor(Color(red: 85/255, green: 84/255, blue: 93/255))
                }
            }
            .padding(EdgeInsets(top: 22, leading: 24, bottom: 22, trailing: 24))
            .allowsHitTesting(false)
            
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
                .allowsHitTesting(false)
        }
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .scaleEffect(cardScale)
        .opacity(cardOpacity)
    }
}

private func cubicBezier(x1: Double, y1: Double, x2: Double, y2: Double, t: Double) -> Double {
    if t <= 0 { return 0 }
    if t >= 1 { return 1 }
    var u = t
    for _ in 0..<8 {
        let x = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u
        let dx = 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2)
        if abs(dx) < 1e-6 { break }
        u -= (x - t) / dx
        u = min(1.0, max(0.0, u))
    }
    return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u
}
