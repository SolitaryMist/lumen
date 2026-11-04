import SwiftUI

// Lumen 001 · Rim Trace — params match the web piece.
// Code only; no simulator run required.

enum RimTraceParams {
    static let tourMs: Double = 8000
    static let introHalfMs: Double = 4000
    static let magnetMs: Double = 280
    static let backMs: Double = 420
    static let pressMs: Double = 300
    static let releaseMs: Double = 280
    static let segment: CGFloat = 0.12
    static let segmentPress: CGFloat = 0.28
    static let magnetPad: CGFloat = 48
    static let corner: CGFloat = 20
    static let stroke: CGFloat = 1.5
    static let cardMaxWidth: CGFloat = 360
    static let aspect: CGFloat = 1.25
    static let magnetResponse: Double = 0.32
    static let magnetDamping: Double = 0.82
    static let pressResponse: Double = 0.35
    static let pressDamping: Double = 0.78
    static let bg = Color(red: 0x0B/255, green: 0x0B/255, blue: 0x0C/255)
    static let card = Color(red: 0x12/255, green: 0x12/255, blue: 0x14/255)
    static let strokeColor = Color(red: 0x2A/255, green: 0x2A/255, blue: 0x2E/255)
    static let fg = Color(red: 0xED/255, green: 0xED/255, blue: 0xED/255)
    static let dim = Color(red: 0x6B/255, green: 0x6B/255, blue: 0x6B/255)
    static let amber = Color(red: 0xFF/255, green: 0xB5/255, blue: 0x47/255)
}

struct RimTraceView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var progress: CGFloat = 0
    @State private var segFrac: CGFloat = RimTraceParams.segment
    @State private var peak: Double = 0.95
    @State private var lift: CGFloat = 0
    @State private var entered = false
    @State private var magnetizing = false
    @State private var introDone = false
    @State private var tourBase: CGFloat = 0
    @State private var startDate = Date()
    @State private var cardSize: CGSize = .zero

    var body: some View {
        ZStack {
            RimTraceParams.bg.ignoresSafeArea()
            cardBody
                .opacity(entered || reduceMotion ? 1 : 0)
                .offset(y: (entered || reduceMotion ? lift : 12))
        }
        .onAppear {
            startDate = Date()
            if reduceMotion {
                entered = true
                progress = 0
            } else {
                withAnimation(.timingCurve(0.16, 1, 0.3, 1, duration: 0.5).delay(0.08)) {
                    entered = true
                }
            }
        }
        .onReceive(Timer.publish(every: 1.0 / 60.0, on: .main, in: .common).autoconnect()) { date in
            guard !reduceMotion, !magnetizing else { return }
            progress = tourProgress(at: date)
        }
    }

    private var cardBody: some View {
        GeometryReader { geo in
            let w = min(RimTraceParams.cardMaxWidth, geo.size.width * 0.88)
            let h = w * RimTraceParams.aspect
            ZStack {
                RoundedRectangle(cornerRadius: RimTraceParams.corner, style: .continuous)
                    .fill(RimTraceParams.card)
                    .overlay(
                        RoundedRectangle(cornerRadius: RimTraceParams.corner, style: .continuous)
                            .strokeBorder(RimTraceParams.strokeColor, lineWidth: RimTraceParams.stroke)
                    )

                RimLightCanvas(
                    progress: progress,
                    segment: segFrac,
                    peak: peak,
                    corner: RimTraceParams.corner
                )
                .allowsHitTesting(false)

                VStack {
                    Spacer()
                    Text("Rim Trace")
                        .font(.system(size: 28, weight: .semibold))
                        .tracking(-0.04 * 28)
                        .foregroundStyle(RimTraceParams.fg)
                        .offset(y: -h * 0.08)
                    Spacer()
                    Text("No. 001 · Lumen")
                        .font(.system(size: 12, weight: .regular, design: .monospaced))
                        .foregroundStyle(RimTraceParams.dim)
                        .padding(.bottom, 24)
                }
            }
            .frame(width: w, height: h)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
            .onAppear { cardSize = CGSize(width: w, height: h) }
            .onChange(of: w) { _, _ in cardSize = CGSize(width: w, height: h) }
            .gesture(magnetGesture(size: CGSize(width: w, height: h)))
            .simultaneousGesture(pressGesture)
        }
    }

    private var pressGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { _ in press(true) }
            .onEnded { _ in press(false) }
    }

    private func magnetGesture(size: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                guard !reduceMotion else { return }
                let p = value.location
                let pad = RimTraceParams.magnetPad
                let inZone = p.x >= -pad && p.x <= size.width + pad
                    && p.y >= -pad && p.y <= size.height + pad
                if inZone {
                    magnetizing = true
                    let t = nearestProgress(local: p, size: size)
                    withAnimation(.spring(response: RimTraceParams.magnetResponse, dampingFraction: RimTraceParams.magnetDamping)) {
                        progress = t
                    }
                } else if magnetizing {
                    endMagnet()
                }
            }
            .onEnded { _ in
                if magnetizing { endMagnet() }
            }
    }

    private func endMagnet() {
        magnetizing = false
        let target = tourProgress(at: Date())
        withAnimation(.timingCurve(0.16, 1, 0.3, 1, duration: RimTraceParams.backMs / 1000)) {
            progress = target
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + RimTraceParams.backMs / 1000) {
            tourBase = progress
            startDate = Date()
            introDone = true
        }
    }

    private func press(_ on: Bool) {
        if reduceMotion {
            peak = on ? 1.0 : 0.95
            return
        }
        if on {
            withAnimation(.spring(response: RimTraceParams.pressResponse, dampingFraction: RimTraceParams.pressDamping)) {
                lift = -4
                segFrac = RimTraceParams.segmentPress
                peak = 1.0
            }
        } else {
            withAnimation(.spring(response: RimTraceParams.pressResponse, dampingFraction: RimTraceParams.pressDamping)) {
                lift = 0
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + RimTraceParams.pressMs / 1000) {
                withAnimation(.easeOut(duration: 0.28)) {
                    segFrac = RimTraceParams.segment
                    peak = 0.95
                }
            }
        }
    }

    private func tourProgress(at date: Date) -> CGFloat {
        let elapsed = date.timeIntervalSince(startDate) * 1000
        if !introDone {
            let t = min(1, max(0, elapsed / RimTraceParams.introHalfMs))
            let e = cubicBezierSoft(t)
            if t >= 1 {
                introDone = true
                startDate = date
                tourBase = 0.5
                return 0.5
            }
            return CGFloat(e * 0.5)
        }
        let u = (elapsed / RimTraceParams.tourMs).truncatingRemainder(dividingBy: 1)
        let e = cubicBezierSoft(u < 0 ? u + 1 : u)
        return CGFloat((Double(tourBase) + e).truncatingRemainder(dividingBy: 1))
    }

    private func nearestProgress(local: CGPoint, size: CGSize) -> CGFloat {
        let samples = 160
        var bestT: CGFloat = 0
        var bestD = CGFloat.greatestFiniteMagnitude
        for i in 0..<samples {
            let t = CGFloat(i) / CGFloat(samples)
            let p = pointOnRim(t: t, size: size)
            let d = hypot(p.x - local.x, p.y - local.y)
            if d < bestD { bestD = d; bestT = t }
        }
        return bestT
    }

    private func pointOnRim(t: CGFloat, size: CGSize) -> CGPoint {
        let r = RimTraceParams.corner
        let w = size.width
        let h = size.height
        let straightW = w - 2 * r
        let straightH = h - 2 * r
        let arc = CGFloat.pi * r / 2
        let perim = 2 * (straightW + straightH) + 4 * arc
        var d = ((t.truncatingRemainder(dividingBy: 1) + 1).truncatingRemainder(dividingBy: 1)) * perim
        let topHalf = straightW / 2
        if d <= topHalf { return CGPoint(x: w/2 + d, y: 0) }; d -= topHalf
        if d <= arc {
            let a = -CGFloat.pi/2 + (d / arc) * (CGFloat.pi/2)
            return CGPoint(x: w - r + Foundation.cos(a) * r, y: r + Foundation.sin(a) * r)
        }; d -= arc
        if d <= straightH { return CGPoint(x: w, y: r + d) }; d -= straightH
        if d <= arc {
            let a = 0 + (d / arc) * (CGFloat.pi/2)
            return CGPoint(x: w - r + Foundation.cos(a) * r, y: h - r + Foundation.sin(a) * r)
        }; d -= arc
        if d <= straightW { return CGPoint(x: w - r - d, y: h) }; d -= straightW
        if d <= arc {
            let a = CGFloat.pi/2 + (d / arc) * (CGFloat.pi/2)
            return CGPoint(x: r + Foundation.cos(a) * r, y: h - r + Foundation.sin(a) * r)
        }; d -= arc
        if d <= straightH { return CGPoint(x: 0, y: h - r - d) }; d -= straightH
        if d <= arc {
            let a = CGFloat.pi + (d / arc) * (CGFloat.pi/2)
            return CGPoint(x: r + Foundation.cos(a) * r, y: r + Foundation.sin(a) * r)
        }; d -= arc
        return CGPoint(x: r + d, y: 0)
    }
}

/// Canvas rim light: segment + soft outer glow (blur radius 8 downgrade).
struct RimLightCanvas: View {
    var progress: CGFloat
    var segment: CGFloat
    var peak: Double
    var corner: CGFloat

    var body: some View {
        Canvas { ctx, size in
            let inset = RimTraceParams.stroke / 2
            let rect = CGRect(x: inset, y: inset, width: size.width - inset * 2, height: size.height - inset * 2)
            let path = roundedRectPath(rect: rect, radius: max(0, corner - inset), startAtTopMid: true)
            let perim = path.length()
            guard perim > 0 else { return }

            func drawSegment(frac: CGFloat, width: CGFloat, alpha: Double, blur: CGFloat) {
                let len = max(1, frac * perim)
                let start = ((progress * perim - len / 2).truncatingRemainder(dividingBy: perim) + perim).truncatingRemainder(dividingBy: perim)
                var seg = Path()
                if start + len <= perim {
                    seg.addPath(path.trimmed(from: start / perim, to: (start + len) / perim))
                } else {
                    seg.addPath(path.trimmed(from: start / perim, to: 1))
                    seg.addPath(path.trimmed(from: 0, to: (start + len - perim) / perim))
                }
                ctx.drawLayer { layer in
                    layer.opacity = alpha
                    if blur > 0 { layer.addFilter(.blur(radius: blur)) }
                    layer.stroke(
                        seg,
                        with: .color(RimTraceParams.amber),
                        style: StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round)
                    )
                }
            }

            // outer soft glow ~12px
            drawSegment(frac: min(0.42, segment * 2.2), width: 14, alpha: 0.22 * peak / 0.95, blur: 8)
            // falloff wing
            drawSegment(frac: segment * 1.35, width: RimTraceParams.stroke, alpha: 0.35 * peak, blur: 0)
            // core
            drawSegment(frac: segment, width: RimTraceParams.stroke, alpha: peak, blur: 0)
        }
    }
}

private extension Path {
    func length() -> CGFloat {
        // Approximate via CoreGraphics if available; fallback sampling.
        var total: CGFloat = 0
        var last: CGPoint?
        forEach { el in
            switch el {
            case .move(to: let p): last = p
            case .line(to: let p):
                if let l = last { total += hypot(p.x - l.x, p.y - l.y) }; last = p
            case .quadCurve(to: let p, control: let c):
                if let l = last {
                    // coarse
                    total += hypot(c.x - l.x, c.y - l.y) * 0.5 + hypot(p.x - c.x, p.y - c.y) * 0.5
                }
                last = p
            case .curve(to: let p, control1: let c1, control2: let c2):
                if let l = last {
                    total += hypot(c1.x - l.x, c1.y - l.y) * 0.35
                        + hypot(c2.x - c1.x, c2.y - c1.y) * 0.35
                        + hypot(p.x - c2.x, p.y - c2.y) * 0.35
                }
                last = p
            case .closeSubpath: break
            @unknown default: break
            }
        }
        return total
    }

    func trimmed(from: CGFloat, to: CGFloat) -> Path {
        // Use trimmedPath when on iOS 17+; approximate by building via CGPath
        trimmedPath(from: from, to: to)
    }
}

private func roundedRectPath(rect: CGRect, radius: CGFloat, startAtTopMid: Bool) -> Path {
    let r = min(radius, min(rect.width, rect.height) / 2)
    var path = Path()
    let midTop = CGPoint(x: rect.midX, y: rect.minY)
    path.move(to: midTop)
    path.addLine(to: CGPoint(x: rect.maxX - r, y: rect.minY))
    path.addArc(center: CGPoint(x: rect.maxX - r, y: rect.minY + r), radius: r, startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - r))
    path.addArc(center: CGPoint(x: rect.maxX - r, y: rect.maxY - r), radius: r, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
    path.addLine(to: CGPoint(x: rect.minX + r, y: rect.maxY))
    path.addArc(center: CGPoint(x: rect.minX + r, y: rect.maxY - r), radius: r, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
    path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))
    path.addArc(center: CGPoint(x: rect.minX + r, y: rect.minY + r), radius: r, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
    path.addLine(to: midTop)
    return path
}

/// cubic-bezier(0.65, 0, 0.35, 1)
private func cubicBezierSoft(_ x: Double) -> Double {
    let x1 = 0.65, y1 = 0.0, x2 = 0.35, y2 = 1.0
    func calc(_ t: Double, _ a1: Double, _ a2: Double) -> Double {
        let u = 1 - t
        return 3 * u * u * t * a1 + 3 * u * t * t * a2 + t * t * t
    }
    if x <= 0 { return 0 }; if x >= 1 { return 1 }
    var lo = 0.0, hi = 1.0, t = x
    for _ in 0..<24 {
        let cx = calc(t, x1, x2)
        if abs(cx - x) < 1e-6 { break }
        if cx < x { lo = t } else { hi = t }
        t = (lo + hi) / 2
    }
    return calc(t, y1, y2)
}

#Preview { RimTraceView() }
