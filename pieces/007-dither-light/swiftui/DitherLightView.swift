// Dither light — Lumen 007 (SwiftUI, iOS 16+)
// iOS 17+: .colorEffect with DitherLight.metal, same Bayer sphere as the web shader.
// iOS 16: Canvas radial-gradient sphere and a small amber highlight. No dither.
// Bundle Inter Variable (see README). Parameters match the web piece one-to-one.
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

/* ===== Dither light parameters (identical to web / Compose) =====
   SPHERE  Centred. Diameter min(600, 62% of height, 84% of width).
           Device radius is that length times scale, rounded to a whole pixel.
   COLOUR  bg #0B0B0C · dots #E8E6E1 · amber #FFB547 where spec > 0.55.
   DITHER  8×8 Bayer. Cell = 2·round(2·dpr) device px, dpr capped at 2.
           Press cell = 2·round(dpr), also even. The grid starts on an even pixel.
   LIGHT   L = normalize(lx, ly, 0.9). y is positive downward.
           lum = 0.06 + 0.94·max(0, N·L) · smoothstep(-0.05, 0.25, N·L)
           Blinn specular exponent 40. Brightness multiplies lum.
   REST    (0.35, -0.45)
   SPRING  Stiffness 170, damping 22, mass 1. 1/240 s semi-implicit steps.
           .spring(response: 0.48, dampingFraction: 0.84)
           Compose spring(dampingRatio: 0.84, stiffness: 170)
   PRESS   240ms timingCurve(0.2, 0.8, 0.2, 1) toward the smaller cell,
           320ms timingCurve(0.4, 0, 0.2, 1) back. Cross-fade, integer cells only.
   GUIDE   No fine pointer: lx 0→0.6 over 1.4s, timingCurve(0.45, 0, 0.55, 1), ly = -0.35.
           Drift lx = 0.6·cos(ωt), period 8s. driftT0 = guide start + 1.4,
           Past that, lx is 0.6·cos of the same elapsed time, so the join
           sits at +0.6 with velocity 0.
   RELEASE After a drag, wait 2s, then 0.6s ease-in-out to the nearer of ±0.6,
           ly back to -0.35, then cosine drift from that end (phase 0 or π).
   FINE    macOS, Mac Catalyst, and an iOS app on a Mac rest at the rest pose.
           On iPhone and iPad, GCMouse.mice() is the connected-mouse list (iOS 14+).
           A non-empty list also rests. An empty list uses the guide, then drift.
           onContinuousHover promotes into pointer-follow. No interface idiom.
           UIScene.pointerLockState is not used.
   ENTER   Canvas opacity 160ms linear. Brightness 0→1 over 600ms,
           timingCurve(0.2, 0.8, 0.2, 1). Title waits 120ms, then 300ms fade and a 4pt rise.
   REDUCED Light stays at rest. No drift, no brightness growth. Opacity fade only.
           Press switches cell size immediately.
   ================================================================= */
enum DL {
    static let rest = SIMD2<Double>(0.35, -0.45)
    static let guideLx = 0.6, guideLy = -0.35
    static let stiffness = 170.0, damping = 22.0, mass = 1.0
    static let response = 0.48, dampingFraction = 0.84
    static let composeDamping = 0.84, composeStiffness = 170.0
    static let pressIn = 0.240, pressOut = 0.320
    static let bright = 0.600, stage = 0.160
    static let titleDelay = 0.120, titleDur = 0.300, titleRise = 4.0
    static let guide = 1.400, driftPeriod = 8.0, hold = 2.0, ret = 0.600
    static let clampLen = 1.2
    static let bg = Color(hex: 0x0B0B0C), ink = Color(hex: 0xE8E6E1)
    static let sub = Color(hex: 0x8A8A8A), weak = Color(hex: 0x3A3A3A), amber = Color(hex: 0xFFB547)
    static let lightSpring = Animation.spring(response: response, dampingFraction: dampingFraction)
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 255) / 255, green: Double((hex >> 8) & 255) / 255, blue: Double(hex & 255) / 255)
    }
}

struct Bezier {
    let x1, y1, x2, y2: Double
    func callAsFunction(_ x: Double) -> Double {
        if x <= 0 { return 0 }
        if x >= 1 { return 1 }
        let cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
        let cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
        var t = x
        for _ in 0..<8 {
            let e = ((ax * t + bx) * t + cx) * t - x
            let d = (3 * ax * t + 2 * bx) * t + cx
            if abs(e) < 1e-6 || abs(d) < 1e-6 { break }
            t -= e / d
        }
        t = min(max(t, 0), 1)
        return ((ay * t + by) * t + cy) * t
    }
}
let easePress = Bezier(x1: 0.2, y1: 0.8, x2: 0.2, y2: 1)
let easeRelease = Bezier(x1: 0.4, y1: 0, x2: 0.2, y2: 1)
let easeBright = Bezier(x1: 0.2, y1: 0.8, x2: 0.2, y2: 1)
let easeGuide = Bezier(x1: 0.45, y1: 0, x2: 0.55, y2: 1)
let easeInOut = Bezier(x1: 0.42, y1: 0, x2: 0.58, y2: 1)

func platformAlwaysHasPointer() -> Bool {
    #if os(macOS) || targetEnvironment(macCatalyst)
    return true
    #elseif os(iOS)
    return ProcessInfo.processInfo.isiOSAppOnMac
    #else
    return false
    #endif
}
func connectedMice() -> Bool {
    #if canImport(GameController)
    if #available(iOS 14.0, macOS 11.0, tvOS 14.0, *) {
        return !GCMouse.mice().isEmpty
    }
    #endif
    return false
}
func launchFinePointer() -> Bool { platformAlwaysHasPointer() || connectedMice() }

func cells(scale: CGFloat) -> (CGFloat, CGFloat) {
    let dpr = min(max(scale, 1), 2)
    var rest = 2 * (2 * dpr).rounded()
    var press = 2 * dpr.rounded()
    if rest < 2 { rest = 2 }
    if press < 2 { press = 2 }
    if Int(press) % 2 == 1 { press -= 1 }
    if Int(rest) % 2 == 1 { rest += 1 }
    if press >= rest { press = max(2, rest - 2) }
    return (rest, press)
}
func angles(_ lx: Double, _ ly: Double) -> (Int, Int) {
    let th = Int((atan2(lx, 0.9) * 180 / .pi).rounded())
    let ph = Int((atan2(-ly, hypot(lx, 0.9)) * 180 / .pi).rounded())
    return (th, ph)
}

func sphereRadius(_ size: CGSize) -> CGFloat {
    min(600, min(size.height * 0.62, size.width * 0.84)) / 2
}

final class LightModel {
    enum Phase { case rest, follow, guide, drift, hold, back }
    var lx = DL.rest.x, ly = DL.rest.y, vx = 0.0, vy = 0.0
    var target = DL.rest
    var phase: Phase = .rest
    var pressU = 0.0, pressFrom = 0.0, pressTo = 0.0, pressT0 = 0.0, pressDur = DL.pressIn
    var pressing = false
    var bright = 0.0
    var fine = false, reduced = false, inside = false
    var t0 = 0.0, guideT0 = 0.0, driftT0 = 0.0, holdT0 = 0.0, returnT0 = 0.0, last = 0.0
    var returnFrom = SIMD2<Double>(0, 0), returnTo = SIMD2<Double>(DL.guideLx, DL.guideLy)
    var booted = false
    private var deviceWatch: [NSObjectProtocol] = []

    init() { fine = launchFinePointer() }

    deinit {
        let center = NotificationCenter.default
        for token in deviceWatch { center.removeObserver(token) }
    }

    func watchPointingDevices() {
        guard deviceWatch.isEmpty else { return }
        #if canImport(GameController)
        guard #available(iOS 14.0, macOS 11.0, tvOS 14.0, *) else { return }
        let names = [Notification.Name.GCMouseDidConnect, Notification.Name.GCMouseDidDisconnect]
        for name in names {
            let token = NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                self?.notePointerDevices(now: Date().timeIntervalSinceReferenceDate)
            }
            deviceWatch.append(token)
        }
        #endif
    }

    func notePointerDevices(now: Double) {
        if reduced { return }
        if platformAlwaysHasPointer() { fine = true; return }
        if !booted { fine = connectedMice(); return }
        if connectedMice() {
            fine = true
            if !inside && (phase == .guide || phase == .drift || phase == .hold || phase == .back) {
                phase = .rest
                target = DL.rest
            }
        } else if !inside && fine {
            fine = false
            beginGuide(now)
        }
    }

    func beginGuide(_ now: Double) {
        phase = .guide
        guideT0 = now
        driftT0 = 0
        vx = 0; vy = 0
    }

    func reset(now: Double) {
        t0 = now; last = 0; vx = 0; vy = 0; inside = false
        if reduced {
            phase = .rest; fine = false
            lx = DL.rest.x; ly = DL.rest.y; target = DL.rest; bright = 1
            pressU = pressing ? 1 : 0; pressFrom = pressU; pressTo = pressU
            return
        }
        bright = 0
        fine = launchFinePointer()
        if fine {
            phase = .rest
            lx = DL.rest.x; ly = DL.rest.y; target = DL.rest
        } else {
            beginGuide(now)
            lx = 0; ly = DL.guideLy; target = SIMD2(lx, ly)
        }
    }

    func spring(_ pos: inout Double, _ vel: inout Double, to target: Double, dt: Double) {
        guard dt > 0 else { return }
        let n = max(1, Int((dt * 240).rounded())), h = dt / Double(n)
        let k = DL.stiffness, c = DL.damping, m = DL.mass
        for _ in 0..<n {
            vel += ((-k * (pos - target) - c * vel) / m) * h
            pos += vel * h
        }
    }

    func springTo(_ dt: Double) -> Bool {
        spring(&lx, &vx, to: target.x, dt: dt)
        spring(&ly, &vy, to: target.y, dt: dt)
        if abs(lx - target.x) < 1e-4 && abs(ly - target.y) < 1e-4 && abs(vx) < 1e-4 && abs(vy) < 1e-4 {
            lx = target.x; ly = target.y; vx = 0; vy = 0
            return true
        }
        return false
    }

    func cruiseX(_ el: Double) -> Double {
        if el <= 0 { return 0 }
        if el >= DL.guide {
            let w = (el - DL.guide) / DL.driftPeriod * 2 * .pi
            return DL.guideLx * cos(w)
        }
        return easeGuide(min(1, el / DL.guide)) * DL.guideLx
    }
    func applyGuide(_ el: Double, _ dt: Double) {
        let prev = lx
        lx = cruiseX(el)
        ly = DL.guideLy
        vx = dt > 0 ? (lx - prev) / dt : 0
        vy = 0
    }
    func applyDrift(_ now: Double, _ dt: Double) {
        let prev = lx
        let w = (now - driftT0) / DL.driftPeriod * 2 * .pi
        lx = DL.guideLx * cos(w)
        ly = DL.guideLy
        vx = dt > 0 ? (lx - prev) / dt : 0
        vy = 0
    }
    func beginReturn(_ now: Double) {
        phase = .back
        returnT0 = now
        returnFrom = SIMD2(lx, ly)
        returnTo = SIMD2(lx >= 0 ? DL.guideLx : -DL.guideLx, DL.guideLy)
    }

    func step(now: Double) {
        if !booted {
            booted = true
            reset(now: now)
        }
        let dt = last == 0 ? 0 : min(0.05, now - last)
        last = now
        if reduced {
            bright = 1
            lx = DL.rest.x; ly = DL.rest.y; vx = 0; vy = 0
            target = DL.rest; phase = .rest
            pressU = pressing ? 1 : 0; pressFrom = pressU; pressTo = pressU
            return
        }
        let bt = min(1, max(0, (now - t0) / DL.bright))
        bright = easeBright(bt)
        if pressFrom != pressTo {
            let u = min(1, max(0, (now - pressT0) / pressDur))
            let e = pressTo > pressFrom ? easePress(u) : easeRelease(u)
            pressU = pressFrom + (pressTo - pressFrom) * e
            if u >= 1 { pressU = pressTo; pressFrom = pressTo }
        }
        if phase == .guide {
            let el = now - guideT0
            if el >= DL.guide {
                driftT0 = guideT0 + DL.guide
                phase = .drift
            }
            applyGuide(el, dt)
        } else if phase == .drift {
            applyDrift(now, dt)
        } else if phase == .back {
            let u = min(1, max(0, (now - returnT0) / DL.ret))
            let e = easeInOut(u)
            lx = returnFrom.x + (returnTo.x - returnFrom.x) * e
            ly = returnFrom.y + (returnTo.y - returnFrom.y) * e
            if u >= 1 {
                lx = returnTo.x; ly = returnTo.y; vx = 0; vy = 0
                phase = .drift
                driftT0 = returnTo.x > 0 ? now : now - DL.driftPeriod / 2
            }
        } else if phase == .hold {
            if now - holdT0 >= DL.hold { beginReturn(now) }
            else { _ = springTo(dt) }
        } else {
            _ = springTo(dt)
        }
    }

    func map(_ point: CGPoint, _ size: CGSize) -> SIMD2<Double> {
        let radius = max(1, Double(sphereRadius(size)))
        var x = (Double(point.x) - Double(size.width) / 2) / radius
        var y = (Double(point.y) - Double(size.height) / 2) / radius
        let len = hypot(x, y)
        if len > DL.clampLen { x *= DL.clampLen / len; y *= DL.clampLen / len }
        return SIMD2(x, y)
    }
    func follow(_ p: SIMD2<Double>) {
        target = p
        phase = .follow
    }
    func hover(at point: CGPoint, inside: Bool, now: Double, size: CGSize) {
        if reduced { return }
        if inside {
            fine = true
            self.inside = true
            follow(map(point, size))
        } else {
            self.inside = false
        }
    }
    func press(at point: CGPoint, now: Double, size: CGSize) {
        pressing = true
        if reduced { pressU = 1; pressFrom = 1; pressTo = 1; return }
        pressFrom = pressU; pressTo = 1; pressT0 = now; pressDur = DL.pressIn
        if !fine { follow(map(point, size)) }
        else { target = map(point, size); phase = .follow }
    }
    func move(at point: CGPoint, now: Double, size: CGSize) {
        if reduced || !pressing { return }
        if fine { return }
        follow(map(point, size))
    }
    func release(now: Double) {
        let was = pressing
        pressing = false
        if reduced { pressU = 0; pressFrom = 0; pressTo = 0; return }
        if was { pressFrom = pressU; pressTo = 0; pressT0 = now; pressDur = DL.pressOut }
        if !fine && was && phase == .follow {
            phase = .hold
            holdT0 = now
        }
    }
}

struct DitherLightView: View {
    @Environment(\.accessibilityReduceMotion) private var reduced
    @State private var model = LightModel()

    var body: some View {
        GeometryReader { geo in
            let size = geo.size
            let title = min(40, max(28, size.width * 0.04))
            TimelineView(.animation) { tl in
                let now = tl.date.timeIntervalSinceReferenceDate
                let _ = model.step(now: now)
                let fade = model.reduced ? min(1, max(0, (model.last - model.t0) / DL.stage)) : min(1, max(0, (model.last - model.t0) / DL.stage))
                let titleU: Double = {
                    if model.reduced { return fade }
                    let u = min(1, max(0, (model.last - model.t0 - DL.titleDelay) / DL.titleDur))
                    return easeBright(u)
                }()
                ZStack(alignment: .topLeading) {
                    DL.bg.ignoresSafeArea()
                    sphere(size)
                        .opacity(fade)
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Dither Light")
                            .font(.custom("Inter Variable", size: title))
                            .fontWeight(.medium)
                            .tracking(title * -0.035)
                            .foregroundStyle(DL.ink)
                            .lineLimit(1)
                        Text("One light, one bit.")
                            .font(.custom("Inter Variable", size: 13))
                            .foregroundStyle(DL.sub)
                    }
                    .padding(.top, 28)
                    .padding(.leading, 28)
                    .opacity(titleU)
                    .offset(y: model.reduced ? 0 : CGFloat(DL.titleRise * (1 - titleU)))
                    readout
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                        .padding(.trailing, 24)
                        .padding(.bottom, 22)
                        .opacity(fade)
                    VStack {
                        HStack { Spacer(); links }
                            .padding(.top, 20).padding(.trailing, 24)
                        Spacer()
                    }
                }
            }
            .contentShape(Rectangle())
            .gesture(drag(size))
            .onContinuousHover { phase in
                let now = Date().timeIntervalSinceReferenceDate
                switch phase {
                case .active(let loc):
                    model.hover(at: loc, inside: true, now: now, size: size)
                case .ended:
                    model.hover(at: .zero, inside: false, now: now, size: size)
                }
            }
            .onAppear {
                model.watchPointingDevices()
                model.reduced = reduced
                if model.booted { model.reset(now: Date().timeIntervalSinceReferenceDate) }
            }
            .onChange(of: reduced) { value in
                model.reduced = value
                model.fine = value ? false : launchFinePointer()
                model.booted = true
                model.reset(now: Date().timeIntervalSinceReferenceDate)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Dither light. One light, one bit.")
    }

    private var links: some View {
        HStack(spacing: 16) {
            Link("GitHub", destination: URL(string: "https://github.com/SolitaryMist/lumen")!)
            Link("@aldininin", destination: URL(string: "https://x.com/aldininin")!)
        }
        .font(.custom("Inter Variable", size: 12))
        .foregroundStyle(DL.weak)
    }

    private var readout: some View {
        let pair = angles(model.lx, model.ly)
        return HStack(alignment: .firstTextBaseline, spacing: 0) {
            Text("θ").padding(.trailing, 4)
            Text(pair.0 < 0 ? "-" : " ")
                .frame(width: 8, alignment: .center)
            Text("\(abs(pair.0))")
                .frame(width: 22, alignment: .trailing)
            Text("°").padding(.leading, 1)
            Text(" ").frame(width: 12)
            Text("φ").padding(.trailing, 4)
            Text(pair.1 < 0 ? "-" : " ")
                .frame(width: 8, alignment: .center)
            Text("\(abs(pair.1))")
                .frame(width: 22, alignment: .trailing)
            Text("°").padding(.leading, 1)
        }
        .font(.custom("Inter Variable", size: 13))
        .monospacedDigit()
        .foregroundStyle(DL.sub)
    }

    @ViewBuilder private func sphere(_ size: CGSize) -> some View {
        let radius = sphereRadius(size)
        if #available(iOS 17.0, macOS 14.0, *) {
            DitherShade(model: model, size: size, radius: radius)
        } else {
            FallbackSphere(model: model, radius: radius)
        }
    }

    private func drag(_ size: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                let now = Date().timeIntervalSinceReferenceDate
                if !model.pressing { model.press(at: value.location, now: now, size: size) }
                else { model.move(at: value.location, now: now, size: size) }
            }
            .onEnded { _ in
                model.release(now: Date().timeIntervalSinceReferenceDate)
            }
    }
}

@available(iOS 17.0, macOS 14.0, *)
private struct DitherShade: View {
    let model: LightModel
    let size: CGSize
    let radius: CGFloat
    var body: some View {
        let scale = displayScale()
        let pair = cells(scale: scale)
        Rectangle()
            .fill(DL.bg)
            .frame(width: size.width, height: size.height)
            .colorEffect(ShaderLibrary.ditherLight(
                .float2(size),
                .float2(CGPoint(x: model.lx, y: model.ly)),
                .float(radius),
                .float(pair.0),
                .float(pair.1),
                .float(model.pressU),
                .float(model.bright),
                .float(scale)
            ))
    }
}

private struct FallbackSphere: View {
    let model: LightModel
    let radius: CGFloat
    var body: some View {
        Canvas { ctx, size in
            let c = CGPoint(x: size.width / 2, y: size.height / 2)
            let r = radius
            let gx = c.x + CGFloat(model.lx) * r * 0.42
            let gy = c.y + CGFloat(model.ly) * r * 0.42
            let disc = Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2))
            ctx.fill(disc, with: .radialGradient(
                Gradient(colors: [DL.ink.opacity(model.bright), DL.bg]),
                center: CGPoint(x: gx, y: gy),
                startRadius: 0,
                endRadius: r * 1.15
            ))
            let spec = highlight(model.lx, model.ly)
            let sc = CGPoint(x: c.x + CGFloat(spec.x) * r, y: c.y + CGFloat(spec.y) * r)
            let dot = Path(ellipseIn: CGRect(x: sc.x - r * 0.07, y: sc.y - r * 0.07, width: r * 0.14, height: r * 0.14))
            ctx.fill(dot, with: .color(DL.amber.opacity(model.bright)))
        }
        .allowsHitTesting(false)
    }
}

func highlight(_ lx: Double, _ ly: Double) -> SIMD2<Double> {
    let len = hypot(lx, hypot(ly, 0.9))
    let L = SIMD3(lx / len, ly / len, 0.9 / len)
    let hx = L.x, hy = L.y, hz = L.z + 1
    let hl = hypot(hx, hypot(hy, hz))
    return SIMD2(hx / hl, hy / hl)
}

func displayScale() -> CGFloat {
    #if canImport(UIKit)
    return UIScreen.main.scale
    #elseif canImport(AppKit)
    return NSScreen.main?.backingScaleFactor ?? 2
    #else
    return 2
    #endif
}

#Preview { DitherLightView() }
