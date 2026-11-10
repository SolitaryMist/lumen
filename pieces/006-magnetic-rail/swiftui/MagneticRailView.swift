// Magnetic rail — Lumen 006 (SwiftUI, iOS 16+)
// Bundle Inter Variable (see README). Parameters match the web piece one-to-one.
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/* ===== Magnetic rail parameters (identical to web / Compose) =====
   ITEMS 5 · Rim Mesh Weight Stack Scale. Slot 40, centers 72 apart. Row 328.
          Scale is a transform from the bottom center, so the label baseline stays put.
   SCALE 1 + 0.5 * exp(-d² / (2 σ²)), σ = 56. d is the horizontal distance to the magnet.
          Peak 1.5. Nearest item only: lift = 4 * hot * max(0, (scale - 1) / 0.5).
   SPRING Scale and highlight: stiffness 280, damping 28, mass 0.1.
          a = (-k (x - target) - c v) / m, 1/240 s semi-implicit steps.
          Amber bar slide: stiffness 220, damping 26, mass 1.
          Press snaps the magnet to that center: stiffness 320, damping 30, mass 1.
   SWIFTUI Scale .spring(response: 0.32, dampingFraction: 0.82)
          Slide .spring(response: 0.36, dampingFraction: 0.80)
          The TimelineView loop integrates the stiffness form so it matches web and Compose.
   GUIDE  No fine pointer: after entrance, u runs 0→1 over 1400ms, timingCurve(0.45, 0, 0.55, 1).
          u = 0 is the first center, u = 1 the last. Drift is 0.5 + 0.5 cos(ωt), period 8000ms.
          driftT0 = entrance end + 1400, so t = 0 is u = 1 with velocity 0, then it moves left.
   FINE   Known at launch on macOS, Mac Catalyst, iOS on a Mac, or when a hover pointer is present. Those rest on index 2. A touch-only iPad follows the same guide then drift as iPhone.
          Leaving the rail fades the bar over 200ms and returns scales to 1.
          Entering again fades the bar in over 200ms from the pointer x.
   ENTER  Stage opacity 160ms linear. Items spring 0.88 → magnetic scale, stagger 60ms
          from the left. Entrance ends at t0 + 760ms. The bar stays hidden until then.
   REDUCED Static. Scales stay 1. Bar fixed under the middle item. No entrance, guide, or drift.
   COLORS bg #0C0C0C · idle #6B6B6B · nearest #F2F2F2 · secondary #8A8A8A · amber #FFB547
   ICONS  1.5pt stroke, no fill. Same 40-unit coordinates as web and Compose.
   ================================================================= */
enum MR {
    static let count = 5
    static let slot: CGFloat = 40
    static let gap: CGFloat = 72
    static let rowW: CGFloat = 328
    static let rowH: CGFloat = 59
    static let sigma = 56.0
    static let lift = 4.0
    static let stiffness = 280.0, damping = 28.0, mass = 0.1
    static let slideK = 220.0, slideC = 26.0, slideM = 1.0
    static let snapK = 320.0, snapC = 30.0, snapM = 1.0
    static let response = 0.32, dampingFraction = 0.82
    static let slideResponse = 0.36, slideDampingFraction = 0.80
    static let composeDamping = 0.82, composeStiffness = 280.0
    static let composeSlideDamping = 0.80, composeSlideStiffness = 220.0
    static let stageFade = 0.160, stagger = 0.060, enterFrom = 0.88, entrance = 0.760
    static let guide = 1.400, driftPeriod = 8.0, away = 0.200
    static let barGap: CGFloat = 12, barH: CGFloat = 2
    static let names = ["Rim", "Mesh", "Weight", "Stack", "Scale"]
    static let centers: [CGFloat] = (0..<count).map { slot / 2 + CGFloat($0) * gap }
    static let bg = Color(hex: 0x0C0C0C), fg = Color(hex: 0xF2F2F2)
    static let idle = Color(hex: 0x6B6B6B), sub = Color(hex: 0x8A8A8A), amber = Color(hex: 0xFFB547)
    static let scaleSpring = Animation.spring(response: response, dampingFraction: dampingFraction)
    static let slideSpring = Animation.spring(response: slideResponse, dampingFraction: slideDampingFraction)
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
let easeGuide = Bezier(x1: 0.45, y1: 0, x2: 0.55, y2: 1)

func platformFinePointer() -> Bool {
    #if os(macOS)
    return true
    #elseif targetEnvironment(macCatalyst)
    return true
    #elseif os(iOS)
    if ProcessInfo.processInfo.isiOSAppOnMac { return true }
    if #available(iOS 14.0, *) {
        if UIDevice.current.userInterfaceIdiom == .mac { return true }
        // pointerLockState is non-nil only when a pointer is currently available
        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .contains { $0.pointerLockState != nil }
    }
    return false
    #else
    return false
    #endif
}

func magScale(_ d: Double) -> Double {
    1 + 0.5 * exp(-(d * d) / (2 * MR.sigma * MR.sigma))
}
func nearestOf(_ x: Double) -> Int {
    var best = 0
    var bd = Double.greatestFiniteMagnitude
    for i in 0..<MR.count {
        let d = abs(x - Double(MR.centers[i]))
        if d < bd { bd = d; best = i }
    }
    return best
}
func xFromU(_ u: Double) -> Double {
    let a = Double(MR.centers[0])
    let b = Double(MR.centers[MR.count - 1])
    return a + u * (b - a)
}

final class RailModel {
    enum Phase { case enter, idle, follow, away, snap, guide, drift, still }
    var scales = [Double](repeating: MR.enterFrom, count: MR.count)
    var svel = [Double](repeating: 0, count: MR.count)
    var hot = [Double](repeating: 0, count: MR.count)
    var hvel = [Double](repeating: 0, count: MR.count)
    var magnet = Double(MR.centers[2])
    var magnetV = 0.0
    var nearest = 2
    var barX = Double(MR.centers[2])
    var barV = 0.0
    var markOp = 0.0
    var phase: Phase = .enter
    var inside = false
    var pointerX = Double(MR.centers[2])
    var snapTarget = Double(MR.centers[2])
    var snapAnchor = Double(MR.centers[2])
    var fading = false
    var fadeFrom = 0.0, fadeTo = 1.0, fadeT0 = 0.0
    var reduced = false
    var fine = false
    var t0 = 0.0, guideT0 = 0.0, driftT0 = 0.0, last = 0.0
    var booted = false

    init() { fine = platformFinePointer() }

    func boot(now: Double) {
        guard !booted else { return }
        booted = true
        reset(now: now)
    }

    func reset(now: Double) {
        t0 = now
        last = 0
        guideT0 = 0
        driftT0 = 0
        fading = false
        magnetV = 0
        barV = 0
        inside = false
        if reduced {
            phase = .still
            magnet = Double(MR.centers[2])
            nearest = 2
            barX = magnet
            markOp = 1
            for i in 0..<MR.count {
                scales[i] = 1; svel[i] = 0
                hot[i] = i == 2 ? 1 : 0; hvel[i] = 0
            }
            return
        }
        phase = .enter
        nearest = fine ? 2 : 0
        magnet = Double(MR.centers[nearest])
        pointerX = magnet
        barX = magnet
        markOp = 0
        for i in 0..<MR.count {
            scales[i] = MR.enterFrom; svel[i] = 0
            hot[i] = i == nearest ? 1 : 0; hvel[i] = 0
        }
    }

    func spring(_ pos: inout Double, _ vel: inout Double, to target: Double, dt: Double, k: Double, c: Double, m: Double) {
        guard dt > 0 else { return }
        let n = max(1, Int((dt * 240).rounded())), h = dt / Double(n)
        for _ in 0..<n {
            vel += ((-k * (pos - target) - c * vel) / m) * h
            pos += vel * h
        }
    }

    func drift(_ now: Double) -> Double {
        let phase = (now - driftT0) / MR.driftPeriod * 2 * .pi
        return 0.5 + 0.5 * cos(phase)
    }

    func beginFade(to: Double, now: Double) {
        fadeFrom = markOp
        fadeTo = to
        fadeT0 = now
        fading = true
    }

    func hover(x: Double, inside: Bool, now: Double) {
        if reduced || !fine { return }
        self.inside = inside
        if inside {
            pointerX = x
            engage(now: now, entered: phase == .away)
        } else if phase == .follow || phase == .snap {
            beginFade(to: 0, now: now)
            phase = .away
        }
    }

    func press(index: Int, x: Double) {
        if reduced || !fine || phase == .enter || phase == .still { return }
        phase = .snap
        snapTarget = Double(MR.centers[index])
        snapAnchor = x
        magnetV = 0
    }

    private func engage(now: Double, entered: Bool) {
        if phase == .enter || phase == .guide || phase == .drift || phase == .still { return }
        if phase == .away || (entered && markOp < 0.999) {
            barX = pointerX
            barV = 0
            beginFade(to: 1, now: now)
            phase = .follow
            magnet = pointerX
            magnetV = 0
            return
        }
        if phase == .snap {
            if abs(pointerX - snapAnchor) > 4 { phase = .follow }
            else { return }
        }
        phase = .follow
        magnet = pointerX
        magnetV = 0
    }

    func step(now: Double) {
        if !booted { boot(now: now) }
        let dt = last == 0 ? 0 : min(0.05, now - last)
        last = now
        if reduced || phase == .still {
            magnet = Double(MR.centers[2]); magnetV = 0
            nearest = 2; barX = magnet; barV = 0; markOp = 1; fading = false
            for i in 0..<MR.count {
                scales[i] = 1; svel[i] = 0
                hot[i] = i == 2 ? 1 : 0; hvel[i] = 0
            }
            return
        }
        let entranceEnd = t0 + MR.entrance
        if phase == .enter && now >= entranceEnd {
            if fine && inside {
                phase = .follow
                magnet = pointerX
            } else if fine {
                phase = .idle
            } else {
                phase = .guide
                guideT0 = entranceEnd
            }
        }
        if phase == .guide {
            let el = now - guideT0
            if el >= MR.guide {
                driftT0 = guideT0 + MR.guide
                phase = .drift
            } else {
                magnet = xFromU(easeGuide(min(1, max(0, el / MR.guide))))
            }
        }
        if phase == .drift { magnet = xFromU(drift(now)) }
        else if phase == .snap { spring(&magnet, &magnetV, to: snapTarget, dt: dt, k: MR.snapK, c: MR.snapC, m: MR.snapM) }
        else if phase == .idle { magnet = Double(MR.centers[2]); magnetV = 0 }
        else if phase == .follow { magnet = pointerX; magnetV = 0 }

        if phase != .away { nearest = nearestOf(magnet) }
        for i in 0..<MR.count {
            let delay = t0 + Double(i) * MR.stagger
            let goal = phase == .away ? 1 : magScale(magnet - Double(MR.centers[i]))
            let hgoal = phase == .away ? 0 : (i == nearest ? 1.0 : 0)
            if now < delay {
                scales[i] = MR.enterFrom
                svel[i] = 0
            } else {
                let step = min(dt, now - delay)
                spring(&scales[i], &svel[i], to: goal, dt: step, k: MR.stiffness, c: MR.damping, m: MR.mass)
                spring(&hot[i], &hvel[i], to: hgoal, dt: step, k: MR.stiffness, c: MR.damping, m: MR.mass)
            }
        }
        if phase != .away {
            let target = Double(MR.centers[nearest])
            spring(&barX, &barV, to: target, dt: dt, k: MR.slideK, c: MR.slideC, m: MR.slideM)
        }
        if now < entranceEnd { markOp = 0 }
        else if fading {
            let u = min(1, max(0, (now - fadeT0) / MR.away))
            markOp = fadeFrom + (fadeTo - fadeFrom) * u
            if u >= 1 { fading = false; markOp = fadeTo }
        } else if phase == .away { markOp = 0 }
        else { markOp = 1 }
    }
}

struct RailGlyph: View {
    let kind: Int
    var body: some View {
        GeometryReader { geo in
            glyph(kind, scale: geo.size.width / 40)
                .stroke(style: StrokeStyle(lineWidth: geo.size.width / 40 * 1.5, lineCap: .round, lineJoin: .round))
        }
    }

    private func glyph(_ kind: Int, scale s: CGFloat) -> Path {
        var path = Path()
        func box(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect {
            CGRect(x: x * s, y: y * s, width: w * s, height: h * s)
        }
        switch kind {
        case 0:
            path.addEllipse(in: box(11.5, 11.5, 17, 17))
        case 1:
            for y in [CGFloat(12), 20, 28] {
                for x in [CGFloat(12), 20, 28] {
                    path.addEllipse(in: box(x - 2.15, y - 2.15, 4.3, 4.3))
                }
            }
        case 2:
            for x in [CGFloat(13), 20, 27] {
                path.move(to: CGPoint(x: x * s, y: 11 * s))
                path.addLine(to: CGPoint(x: x * s, y: 29 * s))
            }
        case 3:
            for y in [CGFloat(9), 17.5, 26] {
                path.addRoundedRect(in: box(11, y, 18, 5), cornerSize: CGSize(width: 1.2 * s, height: 1.2 * s))
            }
        default:
            for y in [CGFloat(10), 15, 20, 25, 30] {
                path.move(to: CGPoint(x: 14 * s, y: y * s))
                path.addLine(to: CGPoint(x: 26 * s, y: y * s))
            }
        }
        return path
    }
}

struct MagneticRailView: View {
    @Environment(\.accessibilityReduceMotion) private var reduced
    @State private var model = RailModel()

    var body: some View {
        GeometryReader { geo in
            let title = min(40, max(28, geo.size.width * 0.08))
            let railW = min(560, geo.size.width * 0.88)
            TimelineView(.animation) { tl in
                let now = tl.date.timeIntervalSinceReferenceDate
                let _ = model.step(now: now)
                ZStack {
                    MR.bg.ignoresSafeArea()
                    VStack(spacing: 0) {
                        Text("Magnetic rail")
                            .font(.custom("Inter Variable", size: title))
                            .fontWeight(.medium)
                            .tracking(title * -0.035)
                            .foregroundStyle(MR.fg)
                            .lineLimit(1)
                        Text("Proximity scale")
                            .font(.custom("Inter Variable", size: 12))
                            .foregroundStyle(MR.sub)
                            .padding(.top, 8)
                        rail(railW)
                            .padding(.top, 28)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                    .opacity(model.reduced || model.phase == .still ? 1 : min(1, max(0, (model.last - model.t0) / MR.stageFade)))

                    VStack {
                        HStack { Spacer(); links }
                            .padding(.top, 20).padding(.trailing, 24)
                        Spacer()
                    }
                }
            }
            .onAppear {
                model.reduced = reduced
                model.fine = reduced ? false : platformFinePointer()
            }
            .onChange(of: reduced) { value in
                model.reduced = value
                model.fine = value ? false : platformFinePointer()
                model.booted = true
                model.reset(now: Date().timeIntervalSinceReferenceDate)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("Magnetic rail. Proximity scale.")
    }

    private var links: some View {
        HStack(spacing: 16) {
            Link("GitHub", destination: URL(string: "https://github.com/SolitaryMist/lumen")!)
            Link("@aldininin", destination: URL(string: "https://x.com/aldininin")!)
        }
        .font(.custom("Inter Variable", size: 12))
        .foregroundStyle(MR.idle)
    }

    private func rail(_ railW: CGFloat) -> some View {
        let origin = (railW - MR.rowW) / 2
        return ZStack(alignment: .topLeading) {
            ForEach(0..<MR.count, id: \.self) { i in
                item(i)
                    .frame(width: MR.slot, height: MR.rowH, alignment: .bottom)
                    .offset(x: origin + MR.centers[i] - MR.slot / 2)
                    .onTapGesture { model.press(index: i, x: model.pointerX) }
            }
            bar(origin)
        }
        .frame(width: railW, height: MR.rowH + 18, alignment: .topLeading)
        .contentShape(Rectangle())
        .onContinuousHover { phase in
            let now = Date().timeIntervalSinceReferenceDate
            switch phase {
            case .active(let loc):
                let x = Double(loc.x - origin)
                model.hover(x: x, inside: true, now: now)
            case .ended:
                model.hover(x: model.pointerX, inside: false, now: now)
            }
        }
    }

    private func item(_ i: Int) -> some View {
        let influence = min(1, max(0, (model.scales[i] - 1) / 0.5))
        let lift = MR.lift * min(1, max(0, model.hot[i])) * influence
        let color = Color(
            red: (107 + (242 - 107) * min(1, max(0, model.hot[i]))) / 255,
            green: (107 + (242 - 107) * min(1, max(0, model.hot[i]))) / 255,
            blue: (107 + (242 - 107) * min(1, max(0, model.hot[i]))) / 255
        )
        return VStack(spacing: 8) {
            RailGlyph(kind: i)
                .foregroundStyle(color)
                .frame(width: MR.slot, height: MR.slot, alignment: .bottom)
                .scaleEffect(model.scales[i], anchor: .bottom)
                .offset(y: -lift)
            Text(MR.names[i])
                .font(.custom("Inter Variable", size: 11))
                .fontWeight(model.hot[i] >= 0.5 ? .medium : .regular)
                .foregroundStyle(color)
                .lineLimit(1)
                .frame(height: 11)
        }
    }

    private func bar(_ origin: CGFloat) -> some View {
        let w = snapEven(max(2, CGFloat(MR.slot) * CGFloat(model.scales[model.nearest])))
        let x = snapEven(origin + CGFloat(model.barX) - w / 2)
        let y = snapEven(MR.rowH + MR.barGap)
        return RoundedRectangle(cornerRadius: 1)
            .fill(MR.amber)
            .frame(width: w, height: snapEven(MR.barH))
            .offset(x: x, y: y)
            .opacity(model.markOp)
    }
}

func snapEven(_ value: CGFloat) -> CGFloat {
    #if canImport(UIKit)
    let d = UIScreen.main.scale
    #else
    let d: CGFloat = 2
    #endif
    return (value * d / 2).rounded() * 2 / d
}

#Preview { MagneticRailView() }
