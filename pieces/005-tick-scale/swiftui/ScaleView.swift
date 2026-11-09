// Scale — Lumen 005 (SwiftUI, iOS 16+)
// Bundle Inter Variable (see README). Parameters match the web piece one-to-one.
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/* ===== Scale parameters (identical to web / Compose) =====
   TICKS 24 · column min(600, 62% of height) × 56 · idle 16×2, neighbor 20×2, active 28×2
   VALUE 0–100, top = 100, bottom = 0 · activeIndex = round(value / 100 * 23)
   NEIGHBOR |Δ|==0 #FFB547 + 28 · |Δ|==1 #6B6B6B + 20 · else #2A2A2A + 16
          Drawn amber length = max(its spring length, the longest other tick).
   READOUT Inter 500, clamp(56, 14% width, 88), tracking −0.04em, tabular digits, 28pt to the right of the column.
           Y follows the continuous value, then the same spring pulls it onto the active tick,
           so a resting number sits on the lit mark and a moving number never jumps. Number stays body color.
   SPRING value, and a shrinking tick: stiffness 200, damping 24, mass 1.
          A growing tick: stiffness 320, damping 30, mass 1.
          Settle within 0.25 so a return to 50 does not chatter the boundary.
          Platform form: .spring(response: 0.36, dampingFraction: 0.78)
          Growing length: .spring(response: 0.35, dampingFraction: 0.84)
          Compose form: spring(dampingRatio: 0.78, stiffness: 200), grow spring(dampingRatio: 0.84, stiffness: 320)
   GUIDE  no fine pointer: 1400ms 0→100→20. First leg 760ms, second 640ms, each
          cubic-bezier(0.65, 0, 0.35, 1). Drift is 50 − 30·cos(ωt), period 8000ms,
          driftT0 = scanT0 + 1400, so t=0 sits at 20 with zero velocity and turns upward.
          Touch sets the spring target; release blends back over 300ms.
   FINE   Known at launch on macOS, Mac Catalyst, and iPad (pointer support). Those rest at 50
          in spring mode. A phone waits out the reveal, then runs the guide.
   INTRO  stage 160ms linear · ticks from the center outward, 40ms apart, scale 0.6→1 + opacity, 160ms
          · number fades 120ms after the last tick lands
   REDUCED static at 50, no stagger, no guide, no drift, amber on the active tick
   COLORS bg #0B0B0C · fg #EDEDED · dim #6B6B6B · idle #2A2A2A · amber #FFB547
   ================================================================= */
enum SC {
    static let ticks = 24
    static let rest = 50.0, vmin = 0.0, vmax = 100.0
    static let lenIdle = 16.0, lenNear = 20.0, lenActive = 28.0
    static let colW: CGFloat = 56, gap: CGFloat = 28, labelGap: CGFloat = 48
    static let stiffness = 200.0, damping = 24.0, mass = 1.0
    static let stiffnessGrow = 320.0, dampingGrow = 30.0
    static let response = 0.36, dampingFraction = 0.78
    static let responseGrow = 0.35, dampingFractionGrow = 0.84
    static let composeDamping = 0.78, composeStiffness = 200.0
    static let composeDampingGrow = 0.84, composeStiffnessGrow = 320.0
    static let stageFade = 0.160, stagger = 0.040, tickIn = 0.160, numFade = 0.120, tickFrom = 0.6
    static let scanDur = 1.400, scanUp = 0.760, scanDown = 0.640
    static let driftPeriod = 8.0, driftLo = 20.0, driftHi = 80.0, resume = 0.300
    static let settle = 0.25
    static let introSpan = Double(ticks - 1) * stagger
    static let bg = Color(hex: 0x0B0B0C), fg = Color(hex: 0xEDEDED), dim = Color(hex: 0x6B6B6B)
    static let idle = Color(hex: 0x2A2A2A), amber = Color(hex: 0xFFB547)
    static let springAnim = Animation.spring(response: response, dampingFraction: dampingFraction)
    static let springGrow = Animation.spring(response: responseGrow, dampingFraction: dampingFractionGrow)
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 255) / 255, green: Double((hex >> 8) & 255) / 255, blue: Double(hex & 255) / 255)
    }
}

struct Bezier {
    let x1, y1, x2, y2: Double
    func callAsFunction(_ x: Double) -> Double {
        if x <= 0 { return 0 }; if (x >= 1) { return 1 }
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
let easeSoft = Bezier(x1: 0.22, y1: 1, x2: 0.36, y2: 1)
let easeGuide = Bezier(x1: 0.65, y1: 0, x2: 0.35, y2: 1)

/// Hover-capable pointer known before the first event: macOS, Mac Catalyst, iPad pointer support.
func platformFinePointer() -> Bool {
    #if os(macOS) || targetEnvironment(macCatalyst)
    return true
    #elseif os(iOS)
    if UIDevice.current.userInterfaceIdiom == .pad { return true }
    return ProcessInfo.processInfo.isiOSAppOnMac
    #else
    return false
    #endif
}

func activeIndex(_ v: Double) -> Int {
    let t = min(SC.vmax, max(SC.vmin, v))
    return min(SC.ticks - 1, max(0, Int((t / 100 * Double(SC.ticks - 1)).rounded())))
}
func lenTarget(_ i: Int, _ active: Int) -> Double {
    let d = abs(i - active)
    return d == 0 ? SC.lenActive : d == 1 ? SC.lenNear : SC.lenIdle
}

final class ScaleModel {
    enum Mode { case hold, spring, scan, drift, blend }
    var value = 0.0, vvel = 0.0, target = 0.0
    var yOff = 0.0, yOffV = 0.0 // pixels, sprung onto the active tick
    var lens = [Double](repeating: SC.lenIdle, count: SC.ticks)
    var lvel = [Double](repeating: 0, count: SC.ticks)
    var mode: Mode = .hold
    var reduced = false
    var fine = false
    var delays = [Double](repeating: 0, count: SC.ticks)
    var t0 = 0.0, scanT0 = 0.0, driftT0 = 0.0, blendT0 = 0.0, blendFrom = 50.0, last = 0.0
    var booted = false

    init() {
        var seq: [Int] = [12]
        var lo = 12, hi = 12
        while seq.count < SC.ticks {
            lo -= 1; if lo >= 0 { seq.append(lo) }
            hi += 1; if hi < SC.ticks { seq.append(hi) }
        }
        for (s, i) in seq.enumerated() { delays[i] = Double(s) * SC.stagger }
        fine = platformFinePointer()
    }

    func boot(now: Double) {
        guard !booted else { return }
        booted = true
        t0 = now
        // Touch reveals at 0 so the guide can leave from 0 and land on 20, where the drift turns upward.
        // A fine pointer known at launch, and Reduce Motion, rest at 50 in spring mode.
        let restAtMid = reduced || fine
        value = restAtMid ? SC.rest : SC.vmin
        target = value
        mode = restAtMid ? .spring : .hold
        seed()
    }

    func seed() {
        let a = activeIndex(value)
        for i in 0..<SC.ticks { lens[i] = lenTarget(i, a); lvel[i] = 0 }
    }

    func spring(_ pos: inout Double, _ vel: inout Double, to target: Double, dt: Double) {
        let n = max(1, Int((dt * 240).rounded())), h = dt / Double(n)
        if dt > 0 {
            for _ in 0..<n {
                vel += (-SC.stiffness * (pos - target) - SC.damping * vel) * h
                pos += vel * h
            }
        }
        if abs(pos - target) < SC.settle && abs(vel) < 40 { pos = target; vel = 0 }
    }

    func scan(_ elapsed: Double) -> Double {
        if elapsed <= SC.scanUp { return SC.vmax * easeGuide(elapsed / SC.scanUp) }
        return SC.vmax + (SC.driftLo - SC.vmax) * easeGuide((elapsed - SC.scanUp) / SC.scanDown)
    }
    /// 50 − 30·cos(ωt). At t=0 this is 20 with zero velocity, then it turns upward.
    func drift(_ now: Double) -> Double {
        let phase = (now - driftT0) / SC.driftPeriod * 2 * .pi
        return 50 - 30 * cos(phase)
    }
    /// Extending a tick uses 320/30. Contracting keeps 200/24. Chosen per substep.
    func lengthSpring(_ pos: inout Double, _ vel: inout Double, to target: Double, dt: Double) {
        let n = max(1, Int((dt * 240).rounded())), h = dt / Double(n)
        if dt > 0 {
            for _ in 0..<n {
                let grow = target > pos
                let k = grow ? SC.stiffnessGrow : SC.stiffness
                let c = grow ? SC.dampingGrow : SC.damping
                vel += (-k * (pos - target) - c * vel) * h
                pos += vel * h
            }
        }
        if abs(pos - target) < SC.settle && abs(vel) < 40 { pos = target; vel = 0 }
    }
    func smooth(_ u: Double) -> Double { u * u * (3 - 2 * u) }

    func pointer(y: CGFloat, colTop: CGFloat, colH: CGFloat, inside: Bool, now: Double) {
        fine = true
        if mode == .hold || mode == .scan || mode == .drift || mode == .blend { mode = .spring }
        target = inside ? min(SC.vmax, max(SC.vmin, (1 - Double((y - colTop) / colH)) * 100)) : SC.rest
        if t0 == 0 { boot(now: now) }
    }

    func touch(y: CGFloat, colTop: CGFloat, colH: CGFloat, down: Bool, now: Double) {
        if fine || reduced { return }
        if down {
            mode = .spring
            target = min(SC.vmax, max(SC.vmin, (1 - Double((y - colTop) / colH)) * 100))
        } else if mode == .spring {
            if driftT0 == 0 { driftT0 = now }
            blendFrom = value
            blendT0 = now
            mode = .blend
        }
    }

    func step(now: Double, colH: CGFloat) {
        if !booted { boot(now: now) }
        let dt = last == 0 ? 0 : min(0.05, now - last)
        last = now
        if reduced {
            value = SC.rest; vvel = 0; target = SC.rest
        } else if !fine && mode == .hold && now >= t0 + SC.introSpan + SC.tickIn {
            mode = .scan; scanT0 = now
        }
        if !reduced {
            switch mode {
            case .scan:
                let el = now - scanT0
                if el >= SC.scanDur {
                    driftT0 = scanT0 + SC.scanDur
                    mode = .drift
                    value = drift(now)
                } else { value = scan(el) }
                vvel = 0
            case .drift:
                value = drift(now); vvel = 0
            case .blend:
                let u = min(1, max(0, (now - blendT0) / SC.resume))
                value = blendFrom + (drift(now) - blendFrom) * smooth(u)
                vvel = 0
                if u >= 1 { mode = .drift }
            case .spring:
                spring(&value, &vvel, to: target, dt: dt)
            case .hold:
                break
            }
        }
        let active = activeIndex(value)
        let offT = (value / 100 - Double(active) / Double(SC.ticks - 1)) * Double(colH)
        if reduced || dt == 0 { yOff = offT; yOffV = 0 }
        else { spring(&yOff, &yOffV, to: offT, dt: dt) }
        for i in 0..<SC.ticks {
            let goal = lenTarget(i, active)
            if reduced { lens[i] = goal; lvel[i] = 0 }
            else if dt > 0 {
                var p = lens[i], v = lvel[i]
                lengthSpring(&p, &v, to: goal, dt: dt)
                lens[i] = p; lvel[i] = v
            }
        }
    }

    func intro(_ i: Int, _ now: Double) -> Double {
        if reduced { return 1 }
        return min(1, max(0, (now - t0 - delays[i]) / SC.tickIn))
    }
    var numberOpacity: Double {
        if reduced { return 1 }
        return min(1, max(0, (last - t0 - SC.introSpan - SC.tickIn) / SC.numFade))
    }
    var stageOpacity: Double {
        if reduced || t0 == 0 { return reduced ? 1 : 0 }
        return min(1, max(0, (last - t0) / SC.stageFade))
    }
}

struct ScaleView: View {
    @Environment(\.accessibilityReduceMotion) private var reduced
    @State private var model = ScaleModel()
    @Environment(\.openURL) private var openURL

    var body: some View {
        GeometryReader { geo in
            let colH = min(600, geo.size.height * 0.62)
            let block = 12 + SC.labelGap + colH + SC.labelGap + 12
            let colTop = (geo.size.height - block) / 2 + 12 + SC.labelGap
            let numSize = min(88, max(56, geo.size.width * 0.14))
            TimelineView(.animation) { tl in
                let now = tl.date.timeIntervalSinceReferenceDate
                let _ = model.step(now: now, colH: colH)
                ZStack {
                    SC.bg.ignoresSafeArea()
                    VStack(spacing: 0) {
                        Text("005").frame(width: SC.colW, height: 12)
                        Color.clear.frame(width: SC.colW, height: colH)
                            .padding(.top, SC.labelGap)
                        Text("SCALE").frame(width: SC.colW, height: 12)
                            .padding(.top, SC.labelGap)
                    }
                    .font(.custom("JetBrains Mono", size: 12))
                    .foregroundStyle(SC.dim)
                    .tracking(1.6)
                    .position(x: geo.size.width / 2, y: geo.size.height / 2)
                    .opacity(model.stageOpacity)

                    tickLayer(width: geo.size.width, colH: colH, colTop: colTop, now: now)
                        .opacity(model.stageOpacity)
                    readout(width: geo.size.width, colH: colH, colTop: colTop, size: numSize)
                        .opacity(model.stageOpacity * model.numberOpacity)

                    VStack {
                        HStack { Spacer(); links }
                            .padding(.top, 20).padding(.trailing, 24)
                        Spacer()
                    }
                }
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 0)
                    .onChanged { model.touch(y: $0.location.y, colTop: colTop, colH: colH, down: true, now: now) }
                    .onEnded { _ in model.touch(y: 0, colTop: colTop, colH: colH, down: false, now: now) })
                .onContinuousHover { phase in
                    switch phase {
                    case .active(let loc):
                        model.pointer(y: loc.y, colTop: colTop, colH: colH, inside: true, now: now)
                    case .ended:
                        model.pointer(y: 0, colTop: colTop, colH: colH, inside: false, now: now)
                    }
                }
            }
            .onAppear { model.reduced = reduced }
            .onChange(of: reduced) { value in model.reduced = value }
        }
        .accessibilityElement()
        .accessibilityLabel("Scale. One tick goes amber on hover.")
    }

    private var links: some View {
        HStack(spacing: 16) {
            Link("GitHub", destination: URL(string: "https://github.com/SolitaryMist/lumen")!)
            Link("@aldininin", destination: URL(string: "https://x.com/aldininin")!)
        }
        .font(.custom("Inter Variable", size: 12))
        .foregroundStyle(SC.dim)
    }

    private func tickLayer(width: CGFloat, colH: CGFloat, colTop: CGFloat, now: Double) -> some View {
        let active = activeIndex(model.value)
        let grows: [CGFloat] = (0..<SC.ticks).map { i in
            let intro = model.intro(i, now)
            return CGFloat(SC.tickFrom + (1 - SC.tickFrom) * easeSoft(intro))
        }
        var maxOther: CGFloat = 0
        for i in 0..<SC.ticks where i != active {
            maxOther = max(maxOther, CGFloat(model.lens[i]) * grows[i])
        }
        let activeRendered = max(CGFloat(model.lens[active]), maxOther)
        return ZStack(alignment: .topLeading) {
            ForEach(0..<SC.ticks, id: \.self) { i in
                let intro = model.intro(i, now)
                let rendered = i == active ? activeRendered : CGFloat(model.lens[i]) * grows[i]
                let center = (1 - CGFloat(i) / CGFloat(SC.ticks - 1)) * colH
                Rectangle()
                    .fill(i == active ? SC.amber : abs(i - active) == 1 ? SC.dim : SC.idle)
                    .frame(width: SC.lenIdle, height: 2)
                    .scaleEffect(x: rendered / CGFloat(SC.lenIdle), y: 1, anchor: .leading)
                    .offset(y: (center - 1).rounded())
                    .opacity(intro)
            }
        }
        .frame(width: SC.colW, height: colH, alignment: .topLeading)
        .position(x: (width / 2).rounded(), y: colTop + colH / 2)
    }

    private func readout(width: CGFloat, colH: CGFloat, colTop: CGFloat, size: CGFloat) -> some View {
        let base = (1 - CGFloat(min(SC.vmax, max(SC.vmin, model.value))) / 100) * colH
        let y = colTop + base + CGFloat(model.yOff)
        let n = Int(min(SC.vmax, max(SC.vmin, model.value)).rounded())
        let slot = size * 2
        return Text("\(n)")
            .font(.custom("Inter Variable", size: size))
            .fontWeight(.medium)
            .monospacedDigit()
            .tracking(size * -0.04)
            .foregroundStyle(SC.fg)
            .frame(width: slot, alignment: .leading)
            .position(x: width / 2 + SC.colW / 2 + SC.gap + slot / 2, y: y)
    }
}

#Preview { ScaleView() }
