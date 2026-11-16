// Guilloché — Lumen 008 (SwiftUI, iOS 17+)
// Canvas draws the engraved rings. Source only: not compiled, not run on a device.
// Bundle Inter Variable and a "grain" image (the piece's grain.png).
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

/* ===== Guilloché parameters (identical to web / Compose) =====
   CARD    Aspect 1.586, width min(640, 86% of the view). Face #121214,
           1pt stroke rgba white 0.06, radius 20. Page #0B0B0C.
   RINGS   36. Centre (0.68W, 0.5H). r = H·(0.10+0.012i).
           p(t) = c + (r + 0.035H·sin(12t+0.18i)) · (1.35 cos t, sin t).
           360 segments. Stroke 1pt. Coordinates snap to device pixels.
           Display scale is capped at 2.
   LIGHT   b = |cos(φ−θ)|^k · (0.35+0.65·exp(−d²/(2σ²))).
           θ = lx·70°. σ = 0.35W. k rests at 8. 12 brightness buckets.
           Mix #2A2A2A → #E8E6E1 by b, then #FFB547 when b > 0.9.
           Rebuild when the light point moves more than 0.002.
   REST    (0.35, 0.40). lx = −0.30. θ = −21°.
   SPRING  Light stiffness 170, damping 22, mass 1.
           .spring(response: 0.48, dampingFraction: 0.84)
           Press stiffness 280, damping 28, mass 1. k travels 8 → 24.
           .spring(response: 0.32, dampingFraction: 0.82)
           Release keeps velocity. 1/240 s semi-implicit steps.
   GUIDE   No fine pointer. θ: −60° → +50° in 0.76s, then +50° → −30° in 0.64s,
           timingCurve(0.65, 0, 0.35, 1). Those angles are lx −0.86, +0.71, −0.43.
           Drift θ = 10° − 40°·cos(2πt/8s) from the same clock, so the join
           is −30° with velocity 0. Light y stays 0.45.
   ENTER   Card opacity 160ms linear. Each ring fades in over 300ms, stagger 40ms
           from the inside (no stroke draw). Type fades 300ms and rises 4pt
           after the outer ring (35·40ms + 300ms).
   REDUCED Rest pose, 200ms fade, rings already drawn, no drift.
   FINE    macOS, Mac Catalyst, and an iOS app on a Mac rest.
           A connected mouse rests. A hover promotes into pointer follow.
   ================================================================= */
enum GL {
    static let rings = 36
    static let segments = 360
    static let buckets = 12
    static let aspect = 1.586
    static let restU = 0.35, restV = 0.40
    static let thetaScale = 70.0
    static let kRest = 8.0, kPress = 24.0
    static let lightK = 170.0, lightC = 22.0, mass = 1.0
    static let pressK = 280.0, pressC = 28.0
    static let swiftLightResponse = 0.48, swiftLightDamping = 0.84
    static let swiftPressResponse = 0.32, swiftPressDamping = 0.82
    static let guideA = 0.760, guideB = 0.640
    static let guideTheta = (-60.0, 50.0, -30.0)
    static let driftBias = 10.0, driftAmp = 40.0, driftPeriod = 8.0, driftY = 0.45
    static let cardFade = 0.160, reducedFade = 0.200
    static let ringFade = 0.300, stagger = 0.040, typeDur = 0.300, typeRise = 4.0
    static let moveEps = 0.002
    static let bg = Color(red: 11/255, green: 11/255, blue: 12/255)
    static let face = Color(red: 18/255, green: 18/255, blue: 20/255)
    static let sub = Color(red: 138/255, green: 138/255, blue: 138/255)
    static let ink = Color(red: 232/255, green: 230/255, blue: 225/255)
    static let lightSpring = Animation.spring(response: swiftLightResponse, dampingFraction: swiftLightDamping)
    static let pressSpring = Animation.spring(response: swiftPressResponse, dampingFraction: swiftPressDamping)
}

private struct Bezier {
    let x1, y1, x2, y2: Double
    func callAsFunction(_ x: Double) -> Double {
        if x <= 0 { return 0 }
        if x >= 1 { return 1 }
        let cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
        let cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
        var t = x
        for _ in 0..<8 {
            let xx = ((ax * t + bx) * t + cx) * t
            let d = (3 * ax * t + 2 * bx) * t + cx
            let e = xx - x
            if abs(e) < 1e-6 || abs(d) < 1e-6 { break }
            t -= e / d
        }
        if t < 0 || t > 1 {
            var a = 0.0, b = 1.0
            t = x
            for _ in 0..<30 {
                let v = ((ax * t + bx) * t + cx) * t
                if v < x { a = t } else { b = t }
                t = (a + b) / 2
            }
        }
        t = min(1, max(0, t))
        return ((ay * t + by) * t + cy) * t
    }
}

private let easeGuide = Bezier(x1: 0.65, y1: 0, x2: 0.35, y2: 1)

private func thetaAt(_ elapsed: Double) -> Double {
    let el = max(0, elapsed)
    let end = GL.guideA + GL.guideB
    if el < GL.guideA {
        return GL.guideTheta.0 + (GL.guideTheta.1 - GL.guideTheta.0) * easeGuide(el / GL.guideA)
    }
    if el < end {
        return GL.guideTheta.1 + (GL.guideTheta.2 - GL.guideTheta.1) * easeGuide((el - GL.guideA) / GL.guideB)
    }
    let w = (el - end) / GL.driftPeriod * 2 * .pi
    return GL.driftBias - GL.driftAmp * cos(w)
}

private func spring(_ pos: inout Double, _ vel: inout Double, to target: Double, dt: Double, k: Double, c: Double) {
    guard dt > 0 else { return }
    let n = max(1, Int((dt * 240).rounded()))
    let h = dt / Double(n)
    for _ in 0..<n {
        vel += ((-k * (pos - target) - c * vel) / GL.mass) * h
        pos += vel * h
    }
}

private func colorOf(_ b: Double) -> Color {
    let t = min(1, max(0, b))
    var r = 0x2A + (0xE8 - 0x2A) * t
    var g = 0x2A + (0xE6 - 0x2A) * t
    var bl = 0x2A + (0xE1 - 0x2A) * t
    if t > 0.9 {
        let u = (t - 0.9) / 0.1
        r += (0xFF - r) * u
        g += (0xB5 - g) * u
        bl += (0x47 - bl) * u
    }
    return Color(red: r / 255, green: g / 255, blue: bl / 255)
}

private func bucketValue(_ i: Int) -> Double {
    if i >= GL.buckets - 1 { return 1 }
    return (Double(i) + 0.5) / Double(GL.buckets)
}

private func bucketIndex(_ b: Double) -> Int {
    if b >= 1 { return GL.buckets - 1 }
    if b <= 0 { return 0 }
    return min(GL.buckets - 1, Int(b * Double(GL.buckets)))
}

private func segmentDistance(_ px: Double, _ py: Double, _ ax: Double, _ ay: Double, _ bx: Double, _ by: Double) -> Double {
    let abx = bx - ax, aby = by - ay
    let ab2 = abx * abx + aby * aby
    var u = ab2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / ab2 : 0
    if u < 0 { u = 0 } else if u > 1 { u = 1 }
    let dx = ax + abx * u - px, dy = ay + aby * u - py
    return hypot(dx, dy)
}

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

private func launchFinePointer() -> Bool { platformAlwaysHasPointer() || connectedMice() }

private func cappedScale() -> CGFloat {
    #if canImport(UIKit)
    return min(2, UIScreen.main.scale)
    #elseif canImport(AppKit)
    return min(2, NSScreen.main?.backingScaleFactor ?? 2)
    #else
    return 2
    #endif
}

final class GuillocheModel {
    enum Phase { case rest, follow, guide, drift }
    var lx = GL.restU * 2 - 1
    var ly = GL.restV
    var vx = 0.0, vy = 0.0
    var targetLx = GL.restU * 2 - 1
    var targetLy = GL.restV
    var k = GL.kRest, kv = 0.0
    var phase: Phase = .rest
    var pressing = false
    var fine = false
    var reduced = false
    var t0 = 0.0, last = 0.0
    var booted = false
    private var deviceWatch: [NSObjectProtocol] = []

    init() { fine = launchFinePointer() }

    deinit {
        for token in deviceWatch { NotificationCenter.default.removeObserver(token) }
    }

    func watchPointingDevices() {
        guard deviceWatch.isEmpty else { return }
        #if canImport(GameController)
        guard #available(iOS 14.0, macOS 11.0, *) else { return }
        for name in [Notification.Name.GCMouseDidConnect, Notification.Name.GCMouseDidDisconnect] {
            let token = NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                self?.noteDevices()
            }
            deviceWatch.append(token)
        }
        #endif
    }

    func noteDevices() {
        if reduced || platformAlwaysHasPointer() { return }
        if connectedMice() {
            fine = true
            if phase == .guide || phase == .drift {
                phase = .rest
                targetLx = GL.restU * 2 - 1
                targetLy = GL.restV
            }
        } else if fine && phase != .follow {
            fine = false
            phase = .guide
            t0 = Date().timeIntervalSinceReferenceDate
            last = 0
        }
    }

    func arm(_ now: Double) {
        t0 = now
        last = 0
        k = GL.kRest
        kv = 0
        if reduced {
            fine = false
            rest()
            return
        }
        fine = launchFinePointer()
        if fine { rest() }
        else {
            phase = .guide
            lx = thetaAt(0) / GL.thetaScale
            ly = GL.driftY
            vx = 0; vy = 0
        }
    }

    func rest() {
        lx = GL.restU * 2 - 1
        ly = GL.restV
        vx = 0; vy = 0
        targetLx = lx
        targetLy = ly
        phase = .rest
    }

    func step(now: Double) {
        if !booted {
            booted = true
            arm(now)
            return
        }
        let dt = last > 0 ? min(0.05, now - last) : 0
        last = now
        let elapsed = now - t0
        if reduced {
            rest()
            k = pressing ? GL.kPress : GL.kRest
            kv = 0
            return
        }
        let kTarget = pressing ? GL.kPress : GL.kRest
        spring(&k, &kv, to: kTarget, dt: dt, k: GL.pressK, c: GL.pressC)
        if phase == .guide || phase == .drift {
            lx = thetaAt(elapsed) / GL.thetaScale
            ly = GL.driftY
            phase = elapsed >= GL.guideA + GL.guideB ? .drift : .guide
            return
        }
        spring(&lx, &vx, to: targetLx, dt: dt, k: GL.lightK, c: GL.lightC)
        spring(&ly, &vy, to: targetLy, dt: dt, k: GL.lightK, c: GL.lightC)
    }

    func follow(u: Double, v: Double) {
        guard !reduced else { return }
        fine = true
        targetLx = min(1, max(0, u)) * 2 - 1
        targetLy = min(1, max(0, v))
        phase = .follow
    }

    var elapsed: Double { booted && last > 0 ? max(0, last - t0) : 0 }

    func cardFade() -> Double {
        min(1, max(0, elapsed / (reduced ? GL.reducedFade : GL.cardFade)))
    }

    func ringAlpha(_ i: Int) -> Double {
        if reduced { return 1 }
        return min(1, max(0, (elapsed - Double(i) * GL.stagger) / GL.ringFade))
    }

    func typeAmount() -> Double {
        if reduced { return cardFade() }
        let start = Double(GL.rings - 1) * GL.stagger + GL.ringFade
        return min(1, max(0, (elapsed - start) / GL.typeDur))
    }
}

struct GuillocheView: View {
    @Environment(\.accessibilityReduceMotion) private var reduced
    @State private var model = GuillocheModel()

    var body: some View {
        GeometryReader { geo in
            let size = geo.size
            let cardW = min(640, size.width * 0.86)
            let cardH = cardW / GL.aspect
            TimelineView(.animation) { tl in
                let now = tl.date.timeIntervalSinceReferenceDate
                let _ = model.step(now: now)
                let fade = model.cardFade()
                let typeU = model.typeAmount()
                let rise = model.reduced ? 0.0 : GL.typeRise * (1 - typeU)
                ZStack {
                    GL.bg.ignoresSafeArea()
                    plate(cardW, cardH)
                        .frame(width: cardW, height: cardH)
                        .opacity(fade)
                    labels(typeU, rise)
                        .frame(width: cardW, height: cardH)
                        .allowsHitTesting(false)
                    VStack {
                        HStack { Spacer(); links }.padding(.top, 20).padding(.trailing, 24)
                        Spacer()
                    }
                }
            }
            .contentShape(Rectangle())
            .gesture(press)
            .onContinuousHover { phase in
                let rect = CGRect(
                    x: (size.width - cardW) / 2, y: (size.height - cardH) / 2,
                    width: cardW, height: cardH)
                if case .active(let loc) = phase {
                    model.follow(u: (loc.x - rect.minX) / rect.width, v: (loc.y - rect.minY) / rect.height)
                }
            }
            .onAppear {
                model.watchPointingDevices()
                model.reduced = reduced
            }
            .onChange(of: reduced) { value in
                model.reduced = value
                model.booted = false
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Guilloché. Engraved lines that catch the light.")
    }

    private var links: some View {
        HStack(spacing: 16) {
            Link("GitHub", destination: URL(string: "https://github.com/SolitaryMist/lumen")!)
            Link("@aldininin", destination: URL(string: "https://x.com/aldininin")!)
        }
        .font(.custom("Inter Variable", size: 12))
        .foregroundStyle(GL.sub)
    }

    private var press: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { _ in model.pressing = true }
            .onEnded { _ in model.pressing = false }
    }

    private func labels(_ typeU: Double, _ rise: Double) -> some View {
        ZStack(alignment: .topLeading) {
            Text("LUMEN")
                .font(.custom("Inter Variable", size: 11).weight(.semibold))
                .tracking(11 * 0.12)
                .foregroundStyle(GL.sub)
                .padding(.top, 26)
                .padding(.leading, 28)
            VStack {
                Spacer()
                HStack(alignment: .firstTextBaseline) {
                    Text("Guilloché")
                        .font(.custom("Inter Variable", size: 28).weight(.medium))
                        .tracking(28 * -0.03)
                        .foregroundStyle(GL.ink)
                    Spacer()
                    Text("Nº 008")
                        .font(.custom("Inter Variable", size: 13).weight(.medium))
                        .monospacedDigit()
                        .foregroundStyle(GL.sub)
                }
                .padding(.horizontal, 28)
                .padding(.bottom, 24)
            }
        }
        .opacity(typeU)
        .offset(y: rise)
    }

    private func plate(_ W: CGFloat, _ H: CGFloat) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 20, style: .continuous).fill(GL.face)
            Canvas { ctx, size in
                strokeRings(ctx, model: model, w: Double(size.width), h: Double(size.height))
            }
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .allowsHitTesting(false)
            Image("grain").resizable(resizingMode: .tile).opacity(0.03).allowsHitTesting(false)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(Color.white.opacity(0.06), lineWidth: 1)
        }
        .frame(width: W, height: H)
    }
}

private func strokeRings(_ ctx: GraphicsContext, model: GuillocheModel, w: Double, h: Double) {
    let scale = Double(cappedScale())
    func snap(_ v: Double) -> CGFloat { CGFloat((v * scale).rounded() / scale) }
    let theta = model.lx * GL.thetaScale * .pi / 180
    let lightX = (model.lx + 1) * 0.5 * w
    let lightY = model.ly * h
    let sigma = 0.35 * w
    let moved = hypot(((model.lx + 1) * 0.5) - cacheU, model.ly - cacheV)
    if cacheW != w || cacheH != h || moved > GL.moveEps || abs(model.k - cacheK) > GL.moveEps {
        rebuild(w: w, h: h, theta: theta, lightX: lightX, lightY: lightY, sigma: sigma, k: model.k)
    }
    for i in 0..<GL.rings {
        let alpha = model.ringAlpha(i)
        if alpha <= 0.001 { continue }
        var paths = Array(repeating: Path(), count: GL.buckets)
        var open = Array(repeating: false, count: GL.buckets)
        let pts = cache[i]
        let row = cacheIds[i]
        for s in 0..<GL.segments {
            let idx = Int(row[s])
            let x0 = snap(pts[s * 2]), y0 = snap(pts[s * 2 + 1])
            let x1 = snap(pts[(s + 1) * 2]), y1 = snap(pts[(s + 1) * 2 + 1])
            if !open[idx] {
                paths[idx].move(to: CGPoint(x: x0, y: y0))
                open[idx] = true
            }
            paths[idx].addLine(to: CGPoint(x: x1, y: y1))
            for j in 0..<GL.buckets where j != idx { open[j] = false }
        }
        ctx.opacity = alpha
        for idx in 0..<GL.buckets {
            ctx.stroke(paths[idx], with: .color(colorOf(bucketValue(idx))),
                       style: StrokeStyle(lineWidth: 1, lineCap: .round, lineJoin: .round))
        }
    }
}

private var cache: [[Double]] = []
private var cacheIds: [[UInt8]] = []
private var cacheW = -1.0, cacheH = -1.0, cacheU = Double.nan, cacheV = Double.nan, cacheK = Double.nan

private func rebuild(w: Double, h: Double, theta: Double, lightX: Double, lightY: Double, sigma: Double, k: Double) {
    cache = Array(repeating: [], count: GL.rings)
    cacheIds = Array(repeating: [], count: GL.rings)
    for i in 0..<GL.rings {
        var pts = [Double](repeating: 0, count: (GL.segments + 1) * 2)
        var ids = [UInt8](repeating: 0, count: GL.segments)
        let cx = 0.68 * w, cy = 0.5 * h
        let base = h * (0.10 + 0.012 * Double(i))
        for s in 0...GL.segments {
            let t = Double(s) / Double(GL.segments) * 2 * .pi
            let rad = base + 0.035 * h * sin(12 * t + 0.18 * Double(i))
            pts[s * 2] = cx + rad * 1.35 * cos(t)
            pts[s * 2 + 1] = cy + rad * sin(t)
        }
        for s in 0..<GL.segments {
            let ax = pts[s * 2], ay = pts[s * 2 + 1]
            let bx = pts[(s + 1) * 2], by = pts[(s + 1) * 2 + 1]
            let phi = atan2(by - ay, bx - ax)
            let d = segmentDistance(lightX, lightY, ax, ay, bx, by)
            let align = pow(abs(cos(phi - theta)), k)
            let fall = 0.35 + 0.65 * exp(-(d * d) / (2 * sigma * sigma))
            ids[s] = UInt8(bucketIndex(align * fall))
        }
        cache[i] = pts
        cacheIds[i] = ids
    }
    cacheW = w
    cacheH = h
    cacheU = lightX / w
    cacheV = lightY / h
    cacheK = k
}
