// Lumen 011 · Paper Fold — SwiftUI
// Every crease catches the light.
// Source only: written to match the web piece, not compiled, not run on a device.
//
// Four panels, each a rotation3DEffect around the y axis, anchored at its valley
// crease edge. Panel x positions are computed from f so the joins meet exactly,
// then the whole card is scaled so its projected width is W·cosθ, as on web.

import SwiftUI
import GameController

// MARK: - Parameters (same numbers as paper-fold.js)

enum PF {
    static let bg = Color(hex: 0x0B0B0C)
    static let paper = Color(hex: 0xECE8E1)
    static let ink = Color(hex: 0x1A1A1C)
    static let small = Color(hex: 0x8A8780)

    static let wMax: CGFloat = 720, wVw: CGFloat = 0.72, wVh: CGFloat = 1.28
    static let portraitVw: CGFloat = 0.86, portraitCy: CGFloat = 0.46
    static let typeR: CGFloat = 0.14, typeTracking: CGFloat = -0.03
    static let metaSize: CGFloat = 11, metaTracking: CGFloat = 0.08
    static let insetR: CGFloat = 0.05
    static let grainSize: CGFloat = 128, grainAlpha: Double = 0.03

    static let maxDeg = 72.0
    static let perspective: CGFloat = 1400

    static let leftShade = 0.10, rightShade = 0.42
    static let valleyPx: CGFloat = 24, valleyAlpha = 0.18
    static let peakAlpha = 0.5
    static let shadowW: CGFloat = 0.9, shadowBlur: CGFloat = 24, shadowY: CGFloat = 18
    static let shadowA0 = 0.18, shadowA1 = 0.22, shadowH: CGFloat = 0.14

    static let rest = 0.45
    static let hoverLo = 0.15, hoverSpan = 0.7
    static let tiltDeg = 12.0
    // Integrated directly so release speed carries. Equivalent SwiftUI springs:
    // follow .spring(response: 0.48, dampingFraction: 0.84), press .spring(response: 0.32, dampingFraction: 0.82).
    static let follow = (k: 170.0, c: 22.0)
    static let press = (k: 280.0, c: 28.0, f: 0.96)
    static let introFade = 160.0, introMs = 900.0
    static let introEase = Bezier(0.22, 1, 0.36, 1)
    static let guide: [(to: Double, ms: Double)] = [(0.85, 760), (0.2, 640)]
    static let guideEase = Bezier(0.42, 0, 0.58, 1)
    static let driftMid = 0.5, driftAmp = 0.3, driftMs = 8000.0
    static let dragGain = 0.7
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 255) / 255, green: Double((hex >> 8) & 255) / 255, blue: Double(hex & 255) / 255)
    }
}

struct Bezier {
    let x1, y1, x2, y2: Double
    init(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double) { self.x1 = x1; self.y1 = y1; self.x2 = x2; self.y2 = y2 }
    private func cx(_ t: Double) -> Double { 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t }
    private func cy(_ t: Double) -> Double { 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t }
    func callAsFunction(_ x: Double) -> Double {
        if x <= 0 { return 0 }
        if x >= 1 { return 1 }
        var lo = 0.0, hi = 1.0, t = x
        for _ in 0..<40 {
            let v = cx(t)
            if abs(v - x) < 1e-7 { break }
            if v < x { lo = t } else { hi = t }
            t = (lo + hi) / 2
        }
        return cy(t)
    }
}

func springStep(_ pos: inout Double, _ vel: inout Double, to target: Double, dt: Double, k: Double, c: Double) {
    let n = max(1, Int((dt * 240).rounded(.up)))
    let h = dt / Double(n)
    for _ in 0..<n {
        vel += (-k * (pos - target) - c * vel) * h
        pos += vel * h
    }
}

func driftF(_ ms: Double) -> Double { PF.driftMid - PF.driftAmp * cos(2 * .pi * ms / PF.driftMs) }
func driftV(_ ms: Double) -> Double { PF.driftAmp * sin(2 * .pi * ms / PF.driftMs) * 2 * .pi / PF.driftMs * 1000 }

// MARK: - Model (plain class, advanced once per frame)

final class PaperFoldModel {
    enum Mode { case rest, hover, press, guide, drift, drag, settle }

    var start: Date?
    var last: Date?
    var now = 0.0
    var f = 0.0, vf = 0.0, rx = 0.0, vrx = 0.0
    var introDone = false
    var mode: Mode = .rest
    var target = PF.rest, targetRx = 0.0
    var pointerMode: Bool
    var reduced = false
    var dragF0 = 0.0
    var settleE = 0.0, settleV = 0.0

    let introEnd = PF.introFade + PF.introMs
    var driftStart: Double { introEnd + PF.guide[0].ms + PF.guide[1].ms }

    init() {
        #if os(macOS) || targetEnvironment(macCatalyst)
        pointerMode = true
        #else
        // a mouse or trackpad at launch: rest and wait for hover; without one, the guide and drift run
        pointerMode = !GCMouse.mice().isEmpty
        #endif
    }

    func introF(_ t: Double) -> Double {
        t <= PF.introFade ? 0 : PF.rest * PF.introEase((t - PF.introFade) / PF.introMs)
    }
    func guideF(_ t: Double) -> Double {
        let g = t - introEnd
        if g <= PF.guide[0].ms { return PF.rest + (PF.guide[0].to - PF.rest) * PF.guideEase(g / PF.guide[0].ms) }
        let g2 = g - PF.guide[0].ms
        return PF.guide[0].to + (PF.guide[1].to - PF.guide[0].to) * PF.guideEase(g2 / PF.guide[1].ms)
    }

    func endIntro() {
        guard !introDone else { return }
        introDone = true
        f = introF(now); vf = (introF(now + 1) - f) * 1000
        mode = pointerMode ? .rest : (now < driftStart ? .guide : .drift)
    }

    func advance(to date: Date) {
        if start == nil { start = date; last = date }
        now = date.timeIntervalSince(start!) * 1000
        let dt = min(1.0 / 30, max(0, date.timeIntervalSince(last!)))
        last = date
        if reduced { f = PF.rest; vf = 0; rx = 0; vrx = 0; return }
        if !introDone {
            if now < introEnd { f = introF(now); return }
            introDone = true; vf = 0
            mode = pointerMode ? .rest : .guide
        }
        if mode == .guide {
            if now < driftStart { f = guideF(now); vf = (guideF(now + 1) - f) * 1000 } else { mode = .drift }
        }
        if mode == .drift { f = driftF(now - driftStart); vf = driftV(now - driftStart) }
        if mode == .settle {
            springStep(&settleE, &settleV, to: 0, dt: dt, k: PF.follow.k, c: PF.follow.c)
            f = driftF(now - driftStart) + settleE
            vf = driftV(now - driftStart) + settleV
            if abs(settleE) < 1e-4 && abs(settleV) < 1e-3 { mode = .drift }
        }
        switch mode {
        case .press: springStep(&f, &vf, to: PF.press.f, dt: dt, k: PF.press.k, c: PF.press.c)
        case .rest, .hover, .drag: springStep(&f, &vf, to: target, dt: dt, k: PF.follow.k, c: PF.follow.c)
        default: break
        }
        springStep(&rx, &vrx, to: targetRx, dt: dt, k: PF.follow.k, c: PF.follow.c)
    }

    // pointer
    func hover(_ p: CGPoint, in size: CGSize) {
        guard !reduced else { return }
        pointerMode = true
        endIntro()
        let x = Double(p.x / size.width), y = Double(p.y / size.height)
        if mode != .press { mode = .hover }
        target = PF.hoverLo + PF.hoverSpan * min(1, max(0, x))
        targetRx = (0.5 - min(1, max(0, y))) * PF.tiltDeg
    }
    func hoverEnded() {
        guard !reduced, pointerMode, mode != .press else { return }
        mode = .rest; target = PF.rest; targetRx = 0
    }
    func pressBegan() {
        guard !reduced else { return }
        endIntro(); mode = .press
    }
    func pressEnded(at p: CGPoint, in size: CGSize) {
        guard mode == .press else { return }
        // vf is kept: the release speed carries into the follow spring
        let inside = CGRect(origin: .zero, size: size).contains(p)
        mode = inside ? .hover : .rest
        target = inside ? PF.hoverLo + PF.hoverSpan * Double(p.x / size.width) : PF.rest
        if !inside { targetRx = 0 }
    }

    // drag without a pointer
    func dragBegan() {
        guard !reduced else { return }
        endIntro(); dragF0 = min(1, max(0, f)); target = dragF0; mode = .drag
    }
    func dragChanged(dx: CGFloat, width: CGFloat) {
        guard mode == .drag else { return }
        target = min(1, max(0, dragF0 + PF.dragGain * Double(dx / width)))
    }
    func dragEnded() {
        guard mode == .drag else { return }
        settleE = f - driftF(now - driftStart)
        settleV = vf - driftV(now - driftStart)
        mode = .settle
    }
}

// MARK: - View

public struct PaperFoldView: View {
    @State private var model = PaperFoldModel()
    @State private var gestureActive = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.displayScale) private var scale

    public init() {}

    public var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            TimelineView(.animation) { tl in
                let _ = (model.reduced = reduceMotion)
                let _ = model.advance(to: tl.date)
                ZStack {
                    PF.bg
                    FoldedCard(f: min(1, max(0, model.f)), rx: model.rx, size: size, scale: scale)
                        .opacity(min(1, model.now / PF.introFade))
                }
            }
            .contentShape(Rectangle())
            .onContinuousHover { phase in
                switch phase {
                case .active(let p): model.hover(p, in: size)
                case .ended: model.hoverEnded()
                }
            }
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { g in
                        if !gestureActive {
                            gestureActive = true
                            if model.pointerMode { model.pressBegan() } else { model.dragBegan() }
                        }
                        if model.pointerMode { model.hover(g.location, in: size) }
                        else { model.dragChanged(dx: g.translation.width, width: size.width) }
                    }
                    .onEnded { g in
                        gestureActive = false
                        if model.pointerMode { model.pressEnded(at: g.location, in: size) } else { model.dragEnded() }
                    }
            )
            .onReceive(NotificationCenter.default.publisher(for: .GCMouseDidConnect)) { _ in
                model.pointerMode = true
            }
        }
        .ignoresSafeArea()
        .accessibilityElement()
        .accessibilityLabel("Paper Fold, a printed card folded in four panels")
    }
}

struct FoldedCard: View {
    let f: Double
    let rx: Double
    let size: CGSize
    let scale: CGFloat

    var body: some View {
        let portrait = size.height > size.width
        let rawW = portrait ? PF.portraitVw * size.width : min(PF.wMax, PF.wVw * size.width, PF.wVh * size.height)
        // W in a multiple of 8 device px, so W/4 and the centre land on even device px
        let W = max(8, floor(rawW * scale / 8) * 8) / scale
        let H = W / 2, p = W / 4
        let cy = portrait ? PF.portraitCy : 0.5
        let even: (CGFloat) -> CGFloat = { (($0 * scale) / 2).rounded() * 2 / scale }
        let center = CGPoint(x: even(size.width / 2), y: even(size.height * cy))

        let th = f * PF.maxDeg * .pi / 180
        let c = CGFloat(cos(th)), s = CGFloat(sin(th))
        // anchor-relative perspective: the free edge (peak or outer edge) comes forward by p·sinθ
        let sp = PF.perspective / (PF.perspective - p * s)
        let k = 1 / sp                      // card scale so the projected width is W·cosθ
        let valleyX = p * c * sp            // valley pivots, before the card scale
        let persp = max(p, H) / PF.perspective // SwiftUI perspective is relative to the view's larger side; verify on device

        ZStack {
            // shadow: ellipse 0.9 × projected width, 18pt under the card
            Ellipse()
                .fill(Color.black)
                .frame(width: PF.shadowW * W * c, height: PF.shadowH * H)
                .blur(radius: PF.shadowBlur)
                .opacity(PF.shadowA0 + PF.shadowA1 * f)
                .offset(y: H / 2 + PF.shadowY)

            ZStack {
                ForEach(0..<4, id: \.self) { i in
                    let facesRight = i % 2 == 0
                    let pivotX = i < 2 ? -valleyX : valleyX
                    // panels 0 and 2 hinge on their right edge, 1 and 3 on their left edge
                    PanelSlice(index: i, W: W, H: H, f: f, facesRight: facesRight)
                        .rotation3DEffect(.radians(facesRight ? th : -th), axis: (0, 1, 0),
                                          anchor: facesRight ? .trailing : .leading,
                                          perspective: persp)
                        .offset(x: facesRight ? pivotX - p / 2 : pivotX + p / 2)
                }
                // centre peak: the same 1px white highlight as a normal peak line
                Rectangle().fill(Color.white.opacity(PF.peakAlpha))
                    .frame(width: max(1, (scale).rounded()) / scale, height: H * sp)
                    .opacity(f)
            }
            .scaleEffect(k)
            .rotation3DEffect(.degrees(rx), axis: (1, 0, 0), perspective: max(W, H) / PF.perspective)
        }
        .position(center)
    }
}

/// One panel: its quarter of the printed sheet, plus facing shade and valley shadow.
struct PanelSlice: View {
    let index: Int
    let W, H: CGFloat
    let f: Double
    let facesRight: Bool

    var body: some View {
        let p = W / 4
        ZStack(alignment: .topLeading) {
            PrintedSheet(W: W, H: H)
                .offset(x: -CGFloat(index) * p)
            Color.black.opacity((facesRight ? PF.rightShade : PF.leftShade) * f)
            LinearGradient(colors: [.clear, .black.opacity(PF.valleyAlpha)],
                           startPoint: facesRight ? .leading : .trailing,
                           endPoint: facesRight ? .trailing : .leading)
                .frame(width: PF.valleyPx)
                .opacity(f)
                .offset(x: facesRight ? p - PF.valleyPx : 0)
        }
        .frame(width: p, height: H, alignment: .topLeading)
        .clipped()
    }
}

/// The full sheet; every panel shows its own slice of it.
struct PrintedSheet: View {
    let W, H: CGFloat
    var body: some View {
        let fs = PF.typeR * W
        let inset = (PF.insetR * W).rounded()
        ZStack(alignment: .topLeading) {
            PF.paper
            Image("grain").resizable(resizingMode: .tile).opacity(PF.grainAlpha)
            Text("PAPER FOLD")
                .font(.custom("Geist-SemiBold", size: fs))
                .tracking(PF.typeTracking * fs)
                .foregroundStyle(PF.ink)
                .fixedSize()
                .frame(width: W, height: H) // centred; Geist cap middle sits close to the line-box middle
            Text("LUMEN")
                .font(.custom("JetBrainsMono-Regular", size: PF.metaSize))
                .tracking(PF.metaTracking * PF.metaSize)
                .foregroundStyle(PF.small)
                .offset(x: inset, y: inset)
            Text("Nº 011")
                .font(.custom("JetBrainsMono-Regular", size: PF.metaSize))
                .tracking(PF.metaTracking * PF.metaSize)
                .foregroundStyle(PF.small)
                .frame(width: W - inset, alignment: .trailing)
                .offset(y: inset)
        }
        .frame(width: W, height: H, alignment: .topLeading)
    }
}

#Preview {
    PaperFoldView().frame(width: 960, height: 540)
}
