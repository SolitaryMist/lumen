// Weight Field — Lumen 003 (SwiftUI, iOS 16+)
// Bundle Inter Variable (Inter-VariableFont_opsz,wght.ttf) and list it under UIAppFonts.
import SwiftUI
import UIKit
import CoreText

/* ===== Weight Field parameters (identical to web / Compose) =====
   WORD "LUMEN" · W_MIN_INTRO 100 · W_REST 200 · W_MAX 900 · R_FACTOR 1.6 (R = avg 900-width * 1.6)
   SPRING stiffness 170, damping 22, mass 1  ==  response 0.48 / dampingFraction 0.84
   INTRO stagger 60ms, 600ms/letter, cubic-bezier(0.22,1,0.36,1), wght 100->200, opacity 0->1
   LEAVE 480ms back to 200, cubic-bezier(0.65,0,0.35,1); bar fades 300ms
   BAR 2pt tall, 30% letter width, under heaviest letter, #F2A65A
   TRACKING -0.035em, line-height 0.9 · WIDTH 86% of screen (mobile)
   TOUR sweep left->right 1400ms cubic-bezier(0.22,1,0.36,1), then cosine ping-pong 7000ms from the right end
        (both ends have zero velocity, so the handoff is velocity-continuous)
   RESUME 800ms after release; 1000ms smoothstep blend from finger position into the ping-pong
   REDUCED MOTION no tour, no springs: 200ms linear to target; intro = fade only
   COLORS bg #0E0E10 · word #E8E6E1 · secondary #6B6A70 · accent #F2A65A
   ================================================================= */
enum WF {
    static let word = Array("LUMEN").map(String.init)
    static let wIntro: CGFloat = 100, wRest: CGFloat = 200, wMax: CGFloat = 900, rFactor: CGFloat = 1.6
    static let stiffness: CGFloat = 170, damping: CGFloat = 22, mass: CGFloat = 1
    static let introStagger = 0.060, introDur = 0.600, leaveDur = 0.480, barFade = 0.300
    static let tracking: CGFloat = -0.035, widthFrac: CGFloat = 0.86
    static let sweepDur = 1.4, pingPeriod = 7.0, resumeDelay = 0.8, resumeBlend = 1.0, reducedDur = 0.2
    static let bg = Color(hex: 0x0E0E10), fg = Color(hex: 0xE8E6E1), dim = Color(hex: 0x6B6A70), amber = Color(hex: 0xF2A65A)
    static let wghtTag = 2003265652 // 'wght'
    static let fontName = "Inter Variable"
}

extension Color { init(hex: UInt32) { self.init(red: Double((hex >> 16) & 255) / 255, green: Double((hex >> 8) & 255) / 255, blue: Double(hex & 255) / 255) } }

/// Cubic bezier easing (x1,y1,x2,y2), Newton solve.
struct Bezier { let x1, y1, x2, y2: Double
    func callAsFunction(_ t: Double) -> Double {
        if t <= 0 { return 0 }; if t >= 1 { return 1 }
        var u = t
        for _ in 0..<8 {
            let x = 3*x1*u*(1-u)*(1-u) + 3*x2*u*u*(1-u) + u*u*u - t
            let dx = 3*x1*(1-u)*(1-u) + 6*(x2-x1)*u*(1-u) + 3*(1-x2)*u*u
            if abs(dx) < 1e-6 { break }; u = min(1, max(0, u - x/dx))
        }
        return 3*y1*u*(1-u)*(1-u) + 3*y2*u*u*(1-u) + u*u*u
    }
}
let easeOut = Bezier(x1: 0.22, y1: 1, x2: 0.36, y2: 1), easeInOut = Bezier(x1: 0.65, y1: 0, x2: 0.35, y2: 1)
func smoothstep(_ a: Double, _ b: Double, _ x: Double) -> Double { let t = min(1, max(0, (x-a)/(b-a))); return t*t*(3-2*t) }

/// Continuous weight via the CTFont variation axis; cached per 0.5 weight to keep allocation low.
final class VariableFontCache {
    static let shared = VariableFontCache()
    private var cache: [Int: UIFont] = [:]
    func font(size: CGFloat, weight: CGFloat) -> UIFont {
        let key = Int(size * 10) * 10_000 + Int(weight * 2)
        if let f = cache[key] { return f }
        let desc = UIFontDescriptor(name: WF.fontName, size: size)
            .addingAttributes([UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): [WF.wghtTag: weight]])
        let f = UIFont(descriptor: desc, size: size)
        if cache.count > 4000 { cache.removeAll() }
        cache[key] = f; return f
    }
    func width(_ s: String, size: CGFloat, weight: CGFloat) -> CGFloat {
        (s as NSString).size(withAttributes: [.font: font(size: size, weight: weight)]).width
    }
}

final class WeightFieldModel: ObservableObject {
    struct Letter { var w: CGFloat = WF.wIntro; var v: CGFloat = 0; var op: Double = 0; var leaveFrom: CGFloat = 0
        var twFrom: CGFloat = 0; var twTo: CGFloat = -1; var twT0: Double = 0
        var cellW: CGFloat = 0; var w200: CGFloat = 0; var cx: CGFloat = 0 }
    enum Mode { case idle, live, hold, tour, leave }
    @Published var letters = WF.word.map { _ in Letter() }
    @Published var barX: CGFloat = 0, barW: CGFloat = 0, barOp: Double = 0
    var fontSize: CGFloat = 80, R: CGFloat = 80, track: CGFloat = 0
    var reduced = false
    private var mode: Mode = .idle, px: CGFloat? = nil, t0 = 0.0, last = 0.0, leaveT0 = 0.0, release = 0.0
    private var barV: CGFloat = 0, barWV: CGFloat = 0, barInit = false
    private var opFrom = 0.0, opTo = 0.0, opT0 = 0.0
    private enum Tour { case sweep(Double), ping(t0: Double, ph0: Double, from: CGFloat?) }
    private var tour: Tour? = nil

    func layout(width: CGFloat, now: Double) {
        let cache = VariableFontCache.shared
        let unit = WF.word.map { cache.width($0, size: 100, weight: WF.wMax) / 100 }
        let sumU = unit.reduce(0, +) + WF.tracking * CGFloat(WF.word.count - 1)
        fontSize = WF.widthFrac * width / sumU; track = WF.tracking * fontSize
        var x = (width - sumU * fontSize) / 2
        for i in letters.indices {
            letters[i].cellW = unit[i] * fontSize
            letters[i].w200 = cache.width(WF.word[i], size: fontSize, weight: WF.wRest)
            letters[i].cx = x + letters[i].cellW / 2; x += letters[i].cellW + track
        }
        R = letters.map(\.cellW).reduce(0, +) / CGFloat(letters.count) * WF.rFactor
        if t0 == 0 { t0 = now }
    }
    private func setOp(_ to: Double, _ now: Double) { if opTo != to { opFrom = barOp; opTo = to; opT0 = now } }
    func drag(_ x: CGFloat, now: Double) { px = x; mode = .live; setOp(1, now) }
    func endDrag(now: Double) { release = now; mode = .hold }

    private func pingX(_ ph: Double) -> CGFloat {
        let l = letters.first!.cx, r = letters.last!.cx
        return (l + r) / 2 + (r - l) / 2 * CGFloat(cos(ph))
    }
    private func tourX(_ now: Double) -> CGFloat? {
        guard let t = tour else { return nil }
        switch t {
        case .sweep(let s):
            let k = now - s
            if k < WF.sweepDur { let l = letters.first!.cx, r = letters.last!.cx; return l + (r - l) * CGFloat(easeOut(k / WF.sweepDur)) }
            tour = .ping(t0: s + WF.sweepDur, ph0: 0, from: nil); return tourX(now)
        case .ping(let s, let ph0, let from):
            let k = now - s, x = pingX(ph0 + 2 * .pi * k / WF.pingPeriod)
            if let f = from, k < WF.resumeBlend { return f + (x - f) * CGFloat(smoothstep(0, 1, k / WF.resumeBlend)) }
            return x
        }
    }

    func tick(now: Double) {
        guard letters.first!.cellW > 0 else { return }
        let dt = CGFloat(min(0.05, last == 0 ? 0 : now - last)); last = now
        let tIntro = now - t0
        let introDone = tIntro > WF.introStagger * Double(letters.count - 1) + WF.introDur
        var x: CGFloat? = nil
        switch mode {
        case .live: x = px
        case .hold:
            x = px
            if now - release > WF.resumeDelay, !reduced, let p = px {
                let l = letters.first!.cx, r = letters.last!.cx
                let c = Double(max(-1, min(1, (p - (l + r) / 2) / ((r - l) / 2))))
                tour = .ping(t0: now, ph0: acos(c), from: p); mode = .tour; x = tourX(now)
            }
        case .tour: x = tourX(now); px = x
        default: break
        }
        var heavy = 0
        for i in letters.indices {
            var L = letters[i]
            let lt = tIntro - Double(i) * WF.introStagger
            if lt < WF.introDur {
                let e = easeOut(max(0, lt) / WF.introDur)
                L.op = e; L.w = reduced ? WF.wRest : WF.wIntro + (WF.wRest - WF.wIntro) * CGFloat(e); L.v = 0
            } else {
                L.op = 1
                if mode == .leave {
                    let k = min(1, (now - leaveT0) / WF.leaveDur)
                    L.w = L.leaveFrom + (WF.wRest - L.leaveFrom) * CGFloat(easeInOut(k)); L.v = 0
                } else {
                    let tgt: CGFloat = x.map { WF.wMax - (WF.wMax - WF.wRest) * CGFloat(smoothstep(0, Double(R), Double(abs($0 - L.cx)))) } ?? WF.wRest
                    if reduced {
                        if abs(L.twTo - tgt) > 4 { L.twFrom = L.w; L.twTo = tgt; L.twT0 = now }
                        L.w = L.twFrom + (L.twTo - L.twFrom) * CGFloat(min(1, (now - L.twT0) / WF.reducedDur))
                    } else {
                        let h = dt / 4
                        for _ in 0..<4 { let a = (-WF.stiffness * (L.w - tgt) - WF.damping * L.v) / WF.mass; L.v += a * h; L.w += L.v * h }
                    }
                }
            }
            L.w = min(WF.wMax, max(WF.wIntro, L.w)); letters[i] = L
            if L.w > letters[heavy].w { heavy = i }
        }
        let H = letters[heavy]
        let curW = H.w200 + (H.cellW - H.w200) * (H.w - WF.wRest) / (WF.wMax - WF.wRest)
        let tw = 0.3 * max(H.w200, curW), tx = H.cx - tw / 2
        if !barInit || reduced { barX = tx; barW = tw; barInit = true }
        else { let h = dt / 4
            for _ in 0..<4 { barV += (-WF.stiffness * (barX - tx) - WF.damping * barV) / WF.mass * h; barX += barV * h
                barWV += (-WF.stiffness * (barW - tw) - WF.damping * barWV) / WF.mass * h; barW += barWV * h } }
        let fk = min(1, (now - opT0) / WF.barFade)
        barOp = introDone ? opFrom + (opTo - opFrom) * fk : 0
        if !reduced, mode == .idle, introDone { tour = .sweep(now); mode = .tour; setOp(1, now) }
        if reduced, mode == .idle, introDone { /* static until touched */ }
    }
}

struct WeightFieldView: View {
    @StateObject private var model = WeightFieldModel()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geo in
            TimelineView(.animation) { tl in
                let now = tl.date.timeIntervalSinceReferenceDate
                ZStack(alignment: .topLeading) {
                    WF.bg.ignoresSafeArea()
                    // fixed cells: each cell is as wide as its letter at wght 900, letter centred
                    HStack(spacing: model.track) {
                        ForEach(WF.word.indices, id: \.self) { i in
                            let L = model.letters[i]
                            Text(WF.word[i])
                                .font(Font(VariableFontCache.shared.font(size: model.fontSize, weight: L.w)))
                                .foregroundColor(WF.fg)
                                .opacity(L.op)
                                .frame(width: L.cellW, height: model.fontSize * 0.9)
                        }
                    }
                    .frame(width: geo.size.width, height: geo.size.height)
                    Rectangle().fill(WF.amber)
                        .frame(width: model.barW, height: 2)
                        .opacity(model.barOp)
                        .offset(x: model.barX, y: geo.size.height / 2 + model.fontSize * 0.44)
                    Text("003 — weight field")
                        .font(Font(VariableFontCache.shared.font(size: 13, weight: 400)))
                        .foregroundColor(WF.dim)
                        .padding(24)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                }
                .onChange(of: now) { _ in model.tick(now: now) }
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { model.drag($0.location.x, now: Date().timeIntervalSinceReferenceDate) }
                .onEnded { _ in model.endDrag(now: Date().timeIntervalSinceReferenceDate) })
            .onAppear {
                model.reduced = reduceMotion
                model.layout(width: geo.size.width, now: Date().timeIntervalSinceReferenceDate)
            }
            .onChange(of: geo.size.width) { w in model.layout(width: w, now: Date().timeIntervalSinceReferenceDate) }
        }
        .accessibilityElement()
        .accessibilityLabel("Weight Field: the word LUMEN, letters get heavier near your finger")
    }
}

#Preview { WeightFieldView() }
