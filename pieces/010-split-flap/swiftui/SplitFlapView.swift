// Lumen 010 · Split Flap — SwiftUI
// Every letter falls into place.
// Source only: written to match the web piece, not compiled, not run on a device.
//
// Motion is a pure function of time (TimelineView), with the same numbers as
// split-flap.js: 64ms steps, 32ms per half on cubic-bezier(0.55,0,0.9,0.4),
// a 4deg rebound on the last step, 40ms column stagger, 2000ms per word.

import SwiftUI
import UIKit

// MARK: - Parameters

enum SF {
    static let bg = Color(hex: 0x0B0B0C)
    static let flapTop = Color(hex: 0x17171A)
    static let flapBottom = Color(hex: 0x141417)
    static let ink = RGB(0xE8E6E1)
    static let dim = Color(hex: 0x8A8A8E)
    static let amber = RGB(0xFFB547)
    static let edge = Color.white.opacity(0.04)
    static let grainSize: CGFloat = 128
    static let grainAlpha: Double = 0.03

    static let wMin: CGFloat = 52, wVw: CGFloat = 0.11, wMax: CGFloat = 132
    static let hRatio: CGFloat = 1.42, gapR: CGFloat = 0.08, radiusR: CGFloat = 0.06, fontR: CGFloat = 0.86
    static let smallR: CGFloat = 0.5, rowGapR: CGFloat = 0.3
    static let portraitCenter: CGFloat = 0.45
    static let hingeDev: CGFloat = 2
    static let capRatio: CGFloat = 0.71 // Geist cap height / em

    static let words: [(String, String)] = [("MESH", "002"), ("WEIGHT", "003"), ("STACK", "004"), ("LENS", "009")]
    static let cols = 6
    static let wordMs = 2000.0
    static let firstWordAt = 200.0
    static let introFade = 160.0

    static let stepMs = 64.0
    static let halfMs = 32.0
    static let fall = Bezier(0.55, 0, 0.9, 0.4)
    static let steps = [5, 6, 7, 8, 6, 7]
    static let numSteps = [5, 6, 7]
    static let colStagger = 40.0
    static let numDelay = 120.0

    // Last step: rebound to 4deg over 160ms. Spring reference from the spec:
    // stiffness 600 / damping 20, i.e. .spring(response: 0.26, dampingFraction: 0.41).
    // The drawn shape is the overshoot of cubic-bezier(0.34,1.4,0.64,1), same as web.
    static let reboundDeg = 4.0
    static let reboundMs = 160.0
    static let reboundCurve = Bezier(0.34, 1.4, 0.64, 1)

    static let perspective: CGFloat = 0.5
    static let topShade = 0.45
    static let coverShade = 0.35
    static let riseShade = 0.45

    static let amberHold = 900.0
    static let amberFade = 400.0
    static let amberEase = Bezier(0.4, 0, 0.2, 1)

    static let hoverSteps = 4
    static let hoverGapMs = 320.0
    static let reducedFade = 160.0

    static let label = "LUMEN · Split Flap · Nº 010"
    static let letters: [Character] = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ ")
    static let digits: [Character] = Array("0123456789")
}

struct RGB {
    let r, g, b: Double
    init(_ hex: UInt32) {
        r = Double((hex >> 16) & 255) / 255
        g = Double((hex >> 8) & 255) / 255
        b = Double(hex & 255) / 255
    }
    func mix(_ o: RGB, _ a: Double) -> Color {
        Color(red: r + (o.r - r) * a, green: g + (o.g - g) * a, blue: b + (o.b - b) * a)
    }
    var color: Color { Color(red: r, green: g, blue: b) }
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 255) / 255,
                  green: Double((hex >> 8) & 255) / 255,
                  blue: Double(hex & 255) / 255)
    }
}

struct Bezier {
    let x1, y1, x2, y2: Double
    init(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double) {
        self.x1 = x1; self.y1 = y1; self.x2 = x2; self.y2 = y2
    }
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

enum Rebound {
    static let (xCross, yPeak): (Double, Double) = {
        var xc = 0.0, yp = 1.0
        for i in 1...2000 {
            let x = Double(i) / 2000, y = SF.reboundCurve(x)
            if xc == 0 && y >= 1 { xc = x }
            if y > yp { yp = y }
        }
        return (xc, yp)
    }()
    static func angle(_ ms: Double) -> Double {
        let p = ms / SF.reboundMs
        if p <= 0 || p >= 1 { return 0 }
        let y = SF.reboundCurve(xCross + p * (1 - xCross))
        return SF.reboundDeg * max(0, y - 1) / (yPeak - 1)
    }
}

func flapSequence(_ target: Character, _ n: Int, _ drum: [Character]) -> [Character] {
    let len = drum.count
    let idx = drum.firstIndex(of: target) ?? 0
    return (0..<n).map { k in drum[((idx - n + 1 + k) % len + len) % len] }
}

// MARK: - Model (plain class: mutated while drawing, never observed)

struct FlapStep { let ch: Character; let t0: Double; let last: Bool; let reduced: Bool }

final class FlapCell {
    let isLetter: Bool
    let drum: [Character]
    var char0: Character
    var steps: [FlapStep] = []
    var target: Character
    var lastHover = -1e9
    init(isLetter: Bool) {
        self.isLetter = isLetter
        drum = isLetter ? SF.letters : SF.digits
        char0 = isLetter ? " " : "0"
        target = char0
    }
    func end(_ s: FlapStep) -> Double { s.t0 + (s.reduced ? SF.reducedFade : SF.stepMs) }
    var busyUntil: Double { steps.last.map { end($0) } ?? -1e9 }
}

final class SplitFlapModel {
    let letters = (0..<SF.cols).map { _ in FlapCell(isLetter: true) }
    let nums = (0..<3).map { _ in FlapCell(isLetter: false) }
    var start: Date?
    var now = 0.0
    var wordIndex = -1
    var nextWordAt = SF.firstWordAt
    var amber: (cell: FlapCell, t0: Double)?
    var reduced = false
    var lastHoverCol = -1

    @discardableResult
    func schedule(_ cell: FlapCell, _ input: [Character], at start: Double) -> FlapStep {
        cell.steps = cell.steps.filter { $0.t0 <= now }
        var t = start
        if let prev = cell.steps.last { t = max(t, prev.t0 + SF.stepMs) }
        let chars = reduced ? [input.last!] : input
        for (k, ch) in chars.enumerated() {
            cell.steps.append(FlapStep(ch: ch, t0: t + Double(k) * SF.stepMs, last: k == chars.count - 1, reduced: reduced))
        }
        cell.target = chars.last!
        return cell.steps.last!
    }

    func showWord(_ idx: Int, at T: Double) {
        wordIndex = idx
        let (word, no) = SF.words[idx]
        let w = Array(word), n = Array(no)
        amber = nil
        var best: (FlapCell, FlapStep)?
        for (i, cell) in letters.enumerated() {
            let target: Character = i < w.count ? w[i] : " "
            if target == " " && cell.target == " " { continue }
            let s = schedule(cell, flapSequence(target, SF.steps[i], SF.letters), at: T + Double(i) * SF.colStagger)
            if target != " ", best == nil || cell.end(s) >= best!.0.end(best!.1) { best = (cell, s) }
        }
        for (i, cell) in nums.enumerated() {
            schedule(cell, flapSequence(n[i], SF.numSteps[i], SF.digits), at: T + SF.numDelay + Double(i) * SF.colStagger)
        }
        if let b = best { amber = (b.0, b.1.t0) }
        nextWordAt = T + SF.wordMs
    }

    func next() { showWord((wordIndex + 1) % SF.words.count, at: now) }

    func advance(to date: Date) {
        if start == nil { start = date }
        now = date.timeIntervalSince(start!) * 1000
        while now >= nextWordAt { showWord((wordIndex + 1) % SF.words.count, at: nextWordAt) }
        for c in letters + nums {
            while c.steps.count > 1 && now >= c.steps[1].t0 { c.char0 = c.steps.removeFirst().ch }
        }
    }

    func hover(column: Int) {
        guard !reduced, column >= 0, column < letters.count else { return }
        let cell = letters[column]
        if now < cell.busyUntil || now - cell.lastHover < SF.hoverGapMs { return }
        cell.lastHover = now
        let back = cell.target
        let pool = SF.letters.filter { $0 != " " }
        var chars: [Character] = []
        var prev = back
        for _ in 0..<SF.hoverSteps {
            var ch: Character
            repeat { ch = pool.randomElement()! } while ch == prev || ch == back
            chars.append(ch); prev = ch
        }
        chars.append(back)
        if amber?.cell === cell { amber = nil }
        schedule(cell, chars, at: now)
    }

    func amberMix(_ cell: FlapCell) -> Double {
        guard let a = amber, a.cell === cell, let s = cell.steps.last(where: { $0.t0 <= now }), s.t0 == a.t0 else { return 0 }
        let dt = now - cell.end(s)
        if dt < 0 { return 0 }
        if dt <= SF.amberHold { return 1 }
        let p = (dt - SF.amberHold) / SF.amberFade
        return p >= 1 ? 0 : 1 - SF.amberEase(p)
    }

    /// Everything one cell needs to draw at `now`.
    func frame(_ cell: FlapCell) -> CellFrame {
        var f = CellFrame()
        let a = cell.isLetter ? amberMix(cell) : 0
        let settled = SF.ink.mix(SF.amber, a)
        guard let k = cell.steps.lastIndex(where: { $0.t0 <= now }) else {
            f.top = cell.char0; f.bottom = cell.char0; f.color = settled
            return f
        }
        let s = cell.steps[k]
        let from = k > 0 ? cell.steps[k - 1].ch : cell.char0
        let local = now - s.t0
        if s.reduced {
            let p = min(1, local / SF.reducedFade)
            f.top = from; f.bottom = from; f.color = SF.ink.color
            f.fadeTo = s.ch; f.fade = p; f.fadeColor = settled
            return f
        }
        if local < SF.stepMs {
            f.top = s.ch; f.bottom = from; f.color = SF.ink.color
            if local < SF.halfMs {
                let e = SF.fall(local / SF.halfMs)
                f.flapTop = from; f.topAngle = -90 * e; f.topShade = SF.topShade * e; f.cover = e
            } else {
                let e = SF.fall((local - SF.halfMs) / SF.halfMs)
                f.flapBottom = s.ch; f.bottomAngle = 90 * (1 - e); f.bottomShade = SF.riseShade * (1 - e); f.cover = 1 - e
            }
            return f
        }
        f.top = s.ch; f.bottom = s.ch; f.color = settled
        let since = local - SF.stepMs
        if s.last && since < SF.reboundMs {
            f.flapBottom = s.ch; f.bottomAngle = Rebound.angle(since); f.flapBottomColor = settled
        }
        return f
    }
}

struct CellFrame {
    var top: Character = " "
    var bottom: Character = " "
    var color: Color = SF.ink.color
    var flapTop: Character?
    var topAngle = 0.0
    var topShade = 0.0
    var flapBottom: Character?
    var bottomAngle = 0.0
    var bottomShade = 0.0
    var flapBottomColor: Color?
    var cover = 0.0
    var fadeTo: Character?
    var fade = 0.0
    var fadeColor: Color = SF.ink.color
}

// MARK: - Geometry (even device px)

struct FlapSize {
    let w, h, gap, r, font: CGFloat
    let halfH, botTop: CGFloat
}

struct BoardGeo {
    let big: FlapSize, small: FlapSize
    let rowGap, boardW, boardH, left, top: CGFloat

    init(size: CGSize, scale: CGFloat) {
        let even: (CGFloat) -> CGFloat = { (($0 * scale) / 2).rounded() * 2 / scale }
        let hinge: (CGFloat) -> CGFloat = { h in
            let d = (h * scale).rounded()
            return (d / 2).truncatingRemainder(dividingBy: 2) == 0 ? (d + 2) / scale : d / scale
        }
        func flap(_ w: CGFloat) -> FlapSize {
            let fw = even(w), fh = hinge(even(SF.hRatio * w))
            let g = SF.hingeDev / scale
            return FlapSize(w: fw, h: fh, gap: even(SF.gapR * w), r: even(SF.radiusR * w), font: even(SF.fontR * w),
                            halfH: fh / 2 - g / 2, botTop: fh / 2 + g / 2)
        }
        let w = min(SF.wMax, max(SF.wMin, SF.wVw * size.width))
        big = flap(w)
        small = flap(SF.smallR * w)
        rowGap = even(SF.rowGapR * w)
        boardW = CGFloat(SF.cols) * big.w + CGFloat(SF.cols - 1) * big.gap
        boardH = big.h + rowGap + small.h
        let cy = size.height > size.width ? SF.portraitCenter : 0.5
        left = even((size.width - boardW) / 2)
        top = even(cy * size.height - boardH / 2)
    }
}

// MARK: - Views

public struct SplitFlapView: View {
    @State private var model = SplitFlapModel()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.displayScale) private var scale

    public init() {}

    public var body: some View {
        GeometryReader { proxy in
            let geo = BoardGeo(size: proxy.size, scale: scale)
            TimelineView(.animation) { timeline in
                let _ = (model.reduced = reduceMotion)
                let _ = model.advance(to: timeline.date)
                ZStack(alignment: .topLeading) {
                    SF.bg
                    board(geo)
                        .opacity(min(1, model.now / SF.introFade))
                        .offset(x: geo.left, y: geo.top)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture { model.next() }
            .onContinuousHover(coordinateSpace: .local) { phase in
                // Fires for an iPad or Mac pointer only.
                guard case .active(let p) = phase else { model.lastHoverCol = -1; return }
                let x = p.x - geo.left, y = p.y - geo.top
                guard y >= 0, y <= geo.big.h else { model.lastHoverCol = -1; return }
                let col = Int(floor(x / (geo.big.w + geo.big.gap)))
                let inside = x >= 0 && x - CGFloat(col) * (geo.big.w + geo.big.gap) <= geo.big.w
                let c = inside ? col : -1
                if c != model.lastHoverCol, c >= 0 { model.hover(column: c) }
                model.lastHoverCol = c
            }
        }
        .ignoresSafeArea()
        .accessibilityElement()
        .accessibilityLabel("Split flap board flipping through Lumen pieces")
        .accessibilityAddTraits(.isButton)
    }

    @ViewBuilder
    private func board(_ geo: BoardGeo) -> some View {
        ZStack(alignment: .topLeading) {
            Text(SF.label)
                .font(.custom("JetBrainsMono-Regular", size: 12))
                .foregroundStyle(SF.dim)
                .fixedSize()
                .offset(y: -geo.rowGap - 12)
            ForEach(0..<SF.cols, id: \.self) { i in
                FlapCellView(frame: model.frame(model.letters[i]), size: geo.big, scale: scale)
                    .offset(x: CGFloat(i) * (geo.big.w + geo.big.gap))
            }
            ForEach(0..<3, id: \.self) { i in
                FlapCellView(frame: model.frame(model.nums[i]), size: geo.small, scale: scale)
                    .offset(x: CGFloat(i) * (geo.small.w + geo.small.gap), y: geo.big.h + geo.rowGap)
            }
        }
    }
}

struct FlapCellView: View {
    let frame: CellFrame
    let size: FlapSize
    let scale: CGFloat

    var body: some View {
        ZStack(alignment: .topLeading) {
            // static top: the character being revealed
            half(.top, frame.top, frame.color, fadeTo: frame.fadeTo)
            // static bottom: previous character, darkened while it gets covered
            half(.bottom, frame.bottom, frame.color, fadeTo: frame.fadeTo, cover: frame.cover)
            if let ch = frame.flapTop {
                half(.top, ch, SF.ink.color, fadeTo: nil, shade: frame.topShade)
                    .rotation3DEffect(.degrees(frame.topAngle), axis: (1, 0, 0),
                                      anchor: UnitPoint(x: 0.5, y: size.halfH / size.h),
                                      perspective: SF.perspective)
            }
            if let ch = frame.flapBottom {
                half(.bottom, ch, frame.flapBottomColor ?? SF.ink.color, fadeTo: nil, shade: frame.bottomShade)
                    .rotation3DEffect(.degrees(frame.bottomAngle), axis: (1, 0, 0),
                                      anchor: UnitPoint(x: 0.5, y: size.botTop / size.h),
                                      perspective: SF.perspective)
            }
        }
        .frame(width: size.w, height: size.h, alignment: .topLeading)
    }

    private enum Side { case top, bottom }

    /// One half leaf, drawn in a full-cell frame so 3D anchors are in cell units.
    private func half(_ side: Side, _ ch: Character, _ color: Color, fadeTo: Character?,
                      shade: Double = 0, cover: Double = 0) -> some View {
        let isTop = side == .top
        let shape = isTop
            ? UnevenRoundedRectangle(topLeadingRadius: size.r, topTrailingRadius: size.r)
            : UnevenRoundedRectangle(bottomLeadingRadius: size.r, bottomTrailingRadius: size.r)
        let y = isTop ? 0 : size.botTop
        return ZStack(alignment: .topLeading) {
            (isTop ? SF.flapTop : SF.flapBottom)
            Image("grain")
                .resizable(resizingMode: .tile)
                .frame(width: size.w, height: size.halfH)
                .opacity(SF.grainAlpha)
            if let to = fadeTo {
                glyph(ch, SF.ink.color).opacity(1 - frame.fade).offset(y: -y)
                glyph(to, frame.fadeColor).opacity(frame.fade).offset(y: -y)
            } else {
                glyph(ch, color).offset(y: -y)
            }
            if isTop {
                Rectangle().fill(SF.edge).frame(width: size.w, height: 1)
            }
            if cover > 0 {
                LinearGradient(colors: [.black.opacity(SF.coverShade), .clear], startPoint: .top, endPoint: .bottom)
                    .opacity(cover)
            }
            if shade > 0 {
                Color.black.opacity(shade)
            }
        }
        .frame(width: size.w, height: size.halfH, alignment: .topLeading)
        .clipShape(shape)
        .padding(.top, y)
        .frame(width: size.w, height: size.h, alignment: .topLeading)
    }

    /// Glyph placed so the middle of the cap height sits on the hinge line.
    private func glyph(_ ch: Character, _ color: Color) -> some View {
        let ui = UIFont(name: "Geist-SemiBold", size: size.font) ?? .systemFont(ofSize: size.font, weight: .semibold)
        // Text is laid out in a box of lineHeight with the baseline at `ascender`.
        let baseline = size.h / 2 + SF.capRatio * size.font / 2
        let topOfLine = baseline - ui.ascender
        return Text(String(ch))
            .font(Font(ui))
            .foregroundStyle(color)
            .kerning(0)
            .frame(width: size.w, height: ui.lineHeight)
            .offset(y: topOfLine)
    }
}

#Preview {
    SplitFlapView().frame(width: 960, height: 540)
}
