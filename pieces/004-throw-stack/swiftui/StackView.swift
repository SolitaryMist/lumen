// Stack — Lumen 004 (SwiftUI, iOS 17+)
// Bundle Inter Variable (see README). Parameters match the web piece one-to-one.
import SwiftUI

/* ===== Stack parameters (identical to web / Compose) =====
   CARDS 5 · 320x440 (r20) on wide screens · min(78% width, 320) at 8:11 (r18) on phones · padding 28
   DEPTH i: offsetY i*10 · scale 1-i*0.04 · darken 6%/level · opacity clamp(4-depth,0,1)
   INTRO: deal bottom->top, stagger 70ms, 700ms position cubic-bezier(0.22,1,0.36,1) from y+40;
          face opacity 0->1 linear in the first 160ms only; text (number, title, subtitle,
          Open, amber line) stays 0 until then, then 0->1 linear over 120ms; nothing drawn until layout is ready
   TICK: amber line only on the top card, fades in 200ms linear when a card becomes top
   DRAG: x 1:1, y*0.6, rot clamp(x*0.06, ±14)°, anchor (0.5, 1.2); card below lifts p*0.6, p=min(|x|/0.5W,1)
   FLING IF |x| > 0.35W or |vx| > 800 pt/s · FLING 360ms cubic-bezier(0.2,0.7,0.3,1) to ±(screen/2+W), ±24°
   SNAP spring k380 c30 (response 0.32 / dampingFraction 0.77) with release velocity
   SHIFT spring k260 c26 (0.39 / 0.81), stagger 40ms · TAP slop 8pt, only "Open" navigates
   HINT 2500ms idle -> nudge -28pt and back, 900ms cubic-bezier(0.65,0,0.35,1), max 2, 4000ms apart
   REDUCED MOTION: fling = 200ms fade, shift/snap 200ms linear, no hint
   (Tilt is pointer-hover only on the web; iPad pointer hover uses the same 6° / spring k200 c24.)
   ========================================================= */
enum ST {
    static let dy: CGFloat = 10, ds: CGFloat = 0.04, shade = 0.06
    static let introStagger = 0.070, introDur = 0.700, introFade = 0.160, textFade = 0.120, introY: CGFloat = 40, tickFade = 0.200
    static let yDamp: CGFloat = 0.6, rotPerPt: CGFloat = 0.06, rotMax: CGFloat = 14, lift: CGFloat = 0.6
    static let flingX: CGFloat = 0.35, flingV: CGFloat = 800
    static let flingDur = 0.360, flingRot: Double = 24
    static let snap = (k: 380.0, c: 30.0), shift = (k: 260.0, c: 26.0), tilt = (k: 200.0, c: 24.0)
    static let shiftStagger = 0.040, tapSlop: CGFloat = 8, tiltMax = 6.0
    static let hintIdle = 2.5, hintX: CGFloat = 28, hintDur = 0.9, hintMax = 2, hintGap = 4.0
    static let reducedDur = 0.2
    static let bg = Color(hex: 0x0E0E10), face = Color(hex: 0x18181C), fg = Color(hex: 0xE8E6E1)
    static let dim = Color(hex: 0x6B6A70), amber = Color(hex: 0xF2A65A)
    // SwiftUI spring equivalents of the k/c pairs above
    static let snapAnim = Animation.spring(response: 0.32, dampingFraction: 0.77)
    static let shiftAnim = Animation.spring(response: 0.39, dampingFraction: 0.81)
    static let tiltAnim = Animation.spring(response: 0.44, dampingFraction: 0.85)
}

struct StackItem: Identifiable { let id: Int; let title: String; let sub: String; let url: URL? }
let stackItems: [StackItem] = [
    .init(id: 0, title: "Rim Trace", sub: "A rim of light that follows you", url: URL(string: "https://lumen-motion.vercel.app/001-rim-trace/")),
    .init(id: 1, title: "Dusk", sub: "A gradient that breathes", url: URL(string: "https://lumen-motion.vercel.app/002-dusk-mesh/")),
    .init(id: 2, title: "Weight Field", sub: "Type that gets heavier near you", url: URL(string: "https://lumen-motion.vercel.app/003-weight-field/")),
    .init(id: 3, title: "Stack", sub: "Fling a card, the deck follows", url: URL(string: "https://lumen-motion.vercel.app/004-throw-stack/")),
    .init(id: 4, title: "Coming soon", sub: "Next piece in the works", url: nil)
]

/// Cubic bezier easing (same solver as the web piece).
struct Bezier {
    let x1, y1, x2, y2: Double
    func callAsFunction(_ x: Double) -> Double {
        if x <= 0 { return 0 }; if x >= 1 { return 1 }
        let cx = 3*x1, bx = 3*(x2-x1)-cx, ax = 1-cx-bx, cy = 3*y1, by = 3*(y2-y1)-cy, ay = 1-cy-by
        var t = x
        for _ in 0..<8 { let e = ((ax*t+bx)*t+cx)*t - x; let d = (3*ax*t+2*bx)*t+cx; if abs(e) < 1e-6 || abs(d) < 1e-6 { break }; t -= e/d }
        t = min(max(t, 0), 1)
        return ((ay*t+by)*t+cy)*t
    }
}
let eIntro = Bezier(x1: 0.22, y1: 1, x2: 0.36, y2: 1), eFling = Bezier(x1: 0.2, y1: 0.7, x2: 0.3, y2: 1), eHint = Bezier(x1: 0.65, y1: 0, x2: 0.35, y2: 1)

/// Hand-written spring, semi-implicit Euler at 1/240 s (identical to web / Compose).
struct Spring1D {
    var pos: Double = 0, vel: Double = 0
    mutating func step(to target: Double, k: Double, c: Double, dt: Double) {
        let n = max(1, Int((dt * 240).rounded())), h = dt / Double(n)
        for _ in 0..<n { vel += (-k*(pos-target) - c*vel) * h; pos += vel * h }
    }
}

final class CardState {
    var depth = Spring1D(), depthTarget = 0.0, depthStart = 0.0
    var x = Spring1D(), y = Spring1D(), tiltX = Spring1D(), tiltY = Spring1D()
    var mode: Mode = .rest
    var fling: (t0: Double, x0: Double, y0: Double, r0: Double, x1: Double, r1: Double)?
    var lin: (from: Double, to: Double, t0: Double)?
    var introT0 = 0.0, tickT0 = 0.0
    enum Mode { case rest, drag, spring, fling, hint }
}

struct StackView: View {
    @Environment(\.accessibilityReduceMotion) private var reduced
    @Environment(\.openURL) private var openURL
    @State private var cards = (0..<5).map { i -> CardState in let c = CardState(); c.depth.pos = Double(i); c.depthTarget = Double(i); return c }
    @State private var order = Array(0..<5)
    @State private var started = 0.0
    @State private var touched = false
    @State private var hintsDone = 0
    @State private var nextHint = Double.infinity
    @State private var hintT0: Double?
    @State private var lastTick = 0.0
    @State private var dragging = false

    var body: some View {
        GeometryReader { geo in
            let wide = geo.size.width > 760
            let W = wide ? 320 : min(geo.size.width * 0.78, 320)
            let H = W * 11 / 8
            TimelineView(.animation) { tl in
                let now = tl.date.timeIntervalSinceReferenceDate
                let _ = tick(now: now, W: W, screenW: geo.size.width)
                ZStack {
                    ST.bg.ignoresSafeArea()
                    ZStack {
                        ForEach(stackItems) { item in
                            card(item, W: W, H: H, radius: wide ? 20 : 18, now: now, screenW: geo.size.width)
                        }
                    }
                    .frame(width: W, height: H)
                    .offset(y: -15)
                    .position(x: geo.size.width / 2, y: geo.size.height / 2)
                    VStack { HStack { Spacer(); links }.padding(.top, 20).padding(.trailing, 24); Spacer()
                        HStack { counter; Spacer() }.padding(.leading, wide ? 48 : 24).padding(.bottom, wide ? 40 : 24) }
                }
            }
        }
        .onAppear {
            let now = Date.timeIntervalSinceReferenceDate
            started = now
            for (i, c) in cards.enumerated() { c.introT0 = now + Double(4 - i) * ST.introStagger }
            cards[order[0]].tickT0 = 0  // intro: line follows the 120ms text fade
            nextHint = now + 4 * ST.introStagger + ST.introDur + ST.hintIdle
        }
    }

    private var links: some View {
        HStack(spacing: 16) {
            Link("GitHub", destination: URL(string: "https://github.com/SolitaryMist/lumen")!)
            Link("@aldininin", destination: URL(string: "https://x.com/aldininin")!)
        }.font(.custom("Inter Variable", size: 12)).foregroundStyle(ST.dim)
    }
    private var counter: some View {
        (Text(String(format: "%02d", order[0] + 1)).foregroundColor(ST.amber) + Text(" / 05").foregroundColor(ST.dim))
            .font(.custom("Inter Variable", size: 13)).monospacedDigit()
    }

    private func rot(_ x: Double) -> Double { min(max(x * Double(ST.rotPerPt), -Double(ST.rotMax)), Double(ST.rotMax)) }

    @ViewBuilder private func card(_ item: StackItem, W: CGFloat, H: CGFloat, radius: CGFloat, now: Double, screenW: CGFloat) -> some View {
        let c = cards[item.id]
        let isFling = c.mode == .fling
        let d = isFling ? 0 : c.depth.pos
        let ti = min(max((now - c.introT0) / ST.introDur, 0), 1)
        let ei = reduced ? ti : eIntro(ti)
        let io = min(max((now - c.introT0) / ST.introFade, 0), 1)
        let tio = min(max((now - c.introT0 - ST.introFade) / ST.textFade, 0), 1)
        let tickOp = (order[0] == item.id && !isFling) ? min(max((now - c.tickT0) / ST.tickFade, 0), 1) : 0
        var r = rot(c.x.pos); var op = 1.0; var x = c.x.pos; var y = c.y.pos
        let _ = {
            if let f = c.fling {
                let u = min(max((now - f.t0) / (reduced ? ST.reducedDur : ST.flingDur), 0), 1)
                if reduced { op = 1 - u; x = f.x0; y = f.y0; r = f.r0 }
                else { let e = eFling(u); x = f.x0 + (f.x1 - f.x0) * e; y = f.y0 * (1 - e); r = f.r0 + (f.r1 - f.r0) * e }
            }
        }()
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: radius).fill(ST.face)
            RoundedRectangle(cornerRadius: radius).strokeBorder(Color.white.opacity(0.06), lineWidth: 1)
            VStack(alignment: .leading, spacing: 0) {
                Rectangle().fill(ST.amber).frame(width: 24, height: 2).opacity(tickOp).padding(.bottom, 14)
                Text(String(format: "%02d", item.id + 1)).font(.custom("Inter Variable", size: 96).weight(.semibold))
                    .kerning(-0.04 * 96).foregroundStyle(ST.fg)
                Spacer()
                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.title).font(.custom("Inter Variable", size: 15).weight(.medium)).foregroundStyle(ST.fg)
                        Text(item.sub).font(.custom("Inter Variable", size: 13)).foregroundStyle(ST.dim)
                    }
                    Spacer()
                    if let url = item.url {
                        Text("Open ↗").font(.custom("Inter Variable", size: 13)).foregroundStyle(ST.dim)
                            .onTapGesture { if order[0] == item.id { openURL(url) } }
                    }
                }
            }.padding(28).opacity(tio)
            RoundedRectangle(cornerRadius: radius).fill(Color.black).opacity(min(max(d, 0), 4) * ST.shade).allowsHitTesting(false)
        }
        .frame(width: W, height: H)
        .rotation3DEffect(.degrees(c.tiltX.pos), axis: (1, 0, 0), perspective: 0.32)  // ≈ 1000px perspective for a 320pt card
        .rotation3DEffect(.degrees(c.tiltY.pos), axis: (0, 1, 0))
        .scaleEffect(1 - d * ST.ds)
        .rotationEffect(.degrees(r), anchor: UnitPoint(x: 0.5, y: 1.2))
        .offset(x: x, y: d * ST.dy + y + (1 - ei) * ST.introY)
        .opacity(started == 0 ? 0 : op * min(max(4 - d, 0), 1) * io)
        .zIndex(isFling ? 200 : 100 - d * 10)
        .gesture(order[0] == item.id ? dragGesture(c, W: W, screenW: screenW) : nil)
        .onContinuousHover { phase in
            guard !reduced, order[0] == item.id else { return }
            switch phase {
            case .active(let p):
                let nx = (p.x - W/2) / (W/2), ny = (p.y - H/2) / (H/2)
                tiltTarget = (Double(-ny) * ST.tiltMax, Double(nx) * ST.tiltMax)
            case .ended: tiltTarget = (0, 0)
            }
        }
    }
    @State private var tiltTarget = (0.0, 0.0)

    private func dragGesture(_ c: CardState, W: CGFloat, screenW: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { v in
                stopHint()
                guard c.mode != .fling else { return }
                c.mode = .drag; dragging = true
                c.x.pos = v.translation.width; c.x.vel = 0
                c.y.pos = v.translation.height * ST.yDamp; c.y.vel = 0
            }
            .onEnded { v in
                dragging = false
                guard c.mode == .drag else { return }
                let moved = hypot(v.translation.width, v.translation.height)
                let vx = v.velocity.width, vy = v.velocity.height
                if moved < ST.tapSlop { c.mode = .spring; return }
                // predictedEndTranslation is used only to pick the direction when velocity is ambiguous
                if abs(c.x.pos) > ST.flingX * W || abs(vx) > ST.flingV {
                    let dir: Double = abs(vx) > ST.flingV ? (vx > 0 ? 1 : -1) : (v.predictedEndTranslation.width >= 0 && c.x.pos >= 0 ? 1 : (c.x.pos >= 0 ? 1 : -1))
                    fling(c, dir: dir, W: W, screenW: screenW)
                } else {
                    c.mode = .spring
                    c.x.vel = vx; c.y.vel = vy * ST.yDamp   // initial velocity carried into the spring
                    if reduced { c.lin = (from: 1, to: 0, t0: Date.timeIntervalSinceReferenceDate) }
                }
            }
    }

    private func fling(_ c: CardState, dir: Double, W: CGFloat, screenW: CGFloat) {
        let now = Date.timeIntervalSinceReferenceDate
        c.mode = .fling
        c.fling = (now, c.x.pos, c.y.pos, rot(c.x.pos), dir * Double(screenW / 2 + W), dir * ST.flingRot)
        order.append(order.removeFirst())
        cards[order[0]].tickT0 = now
        for (d, ci) in order.enumerated() where cards[ci].mode != .fling {
            let k = cards[ci]
            if k.depthTarget != Double(d) { k.depthTarget = Double(d); k.depthStart = now + (d < 4 ? Double(d) * ST.shiftStagger : 0)
                if reduced { k.lin = (from: k.depth.pos, to: Double(d), t0: now) } }
        }
    }

    private func stopHint() {
        touched = true; nextHint = .infinity
        if hintT0 != nil { hintT0 = nil; let c = cards[order[0]]; c.mode = .spring; c.x.vel = 0 }
    }

    /// Advances every spring once per frame (called from TimelineView).
    private func tick(now: Double, W: CGFloat, screenW: CGFloat) {
        let dt = lastTick == 0 ? 0 : min(0.05, now - lastTick)
        DispatchQueue.main.async { lastTick = now }
        let top = cards[order[0]]
        let p = dragging ? min(abs(top.x.pos) / Double(0.5 * W), 1) : 0
        if !reduced && !touched && hintsDone < ST.hintMax && now >= nextHint && hintT0 == nil && top.mode == .rest {
            DispatchQueue.main.async { hintT0 = now }; top.mode = .hint
        }
        for (i, c) in cards.enumerated() {
            switch c.mode {
            case .fling:
                if let f = c.fling, now - f.t0 >= (reduced ? ST.reducedDur : ST.flingDur) {
                    // back to the bottom: depth 4 has opacity 0, it fades in only as it rises to depth 3 -> no flash
                    c.mode = .rest; c.fling = nil; c.x = .init(); c.y = .init(); c.depth = .init(pos: 4, vel: 0); c.depthTarget = 4
                }
            case .spring:
                if reduced, let l = c.lin {
                    let u = min((now - l.t0) / ST.reducedDur, 1); c.x.pos *= (1 - u); c.y.pos *= (1 - u); if u >= 1 { c.lin = nil; c.mode = .rest }
                } else {
                    c.x.step(to: 0, k: ST.snap.k, c: ST.snap.c, dt: dt); c.y.step(to: 0, k: ST.snap.k, c: ST.snap.c, dt: dt)
                    if abs(c.x.pos) < 0.05 && abs(c.x.vel) < 1 && abs(c.y.pos) < 0.05 && abs(c.y.vel) < 1 { c.x = .init(); c.y = .init(); c.mode = .rest }
                }
            case .hint:
                if let h0 = hintT0 {
                    let u = min((now - h0) / ST.hintDur, 1)
                    c.x.pos = -Double(ST.hintX) * (u < 0.5 ? eHint(u * 2) : 1 - eHint(u * 2 - 1))
                    if u >= 1 { c.x.pos = 0; c.mode = .rest
                        DispatchQueue.main.async { hintT0 = nil; hintsDone += 1; nextHint = hintsDone < ST.hintMax ? now + ST.hintGap : .infinity } }
                }
            default: break
            }
            if c.mode != .fling {
                if let l = c.lin, c.mode != .spring {
                    let u = min((now - l.t0) / ST.reducedDur, 1); c.depth.pos = l.from + (l.to - l.from) * u; if u >= 1 { c.lin = nil }
                } else if now >= c.depthStart { c.depth.step(to: c.depthTarget, k: ST.shift.k, c: ST.shift.c, dt: dt) }
                if dragging && order.count > 1 && order[1] == i { c.depth.pos = 1 - p * Double(ST.lift); c.depth.vel = 0 }
            }
            let isTop = order[0] == i && c.mode != .fling && c.mode != .drag
            c.tiltX.step(to: isTop ? tiltTarget.0 : 0, k: ST.tilt.k, c: ST.tilt.c, dt: dt)
            c.tiltY.step(to: isTop ? tiltTarget.1 : 0, k: ST.tilt.k, c: ST.tilt.c, dt: dt)
        }
    }
}

private extension Color {
    init(hex: UInt32) { self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255) }
}

#Preview { StackView().preferredColorScheme(.dark) }
