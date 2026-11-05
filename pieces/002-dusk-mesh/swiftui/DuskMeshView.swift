// Dusk — Lumen 002 (SwiftUI)
// iOS 18+: native MeshGradient(width: 3, height: 3) driven by TimelineView.
// iOS 17 and below: 4 layered RadialGradient + blur(60), breathing only.
import SwiftUI

// ===== Shared parameters (mirror of index.html `P` and DuskMesh.kt) =====
enum DuskParams {
    static let bg = Color(hex: 0x0E0F13)
    static let colors: [Color] = [            // 3×3, row by row
        Color(hex: 0x1B1E3A), Color(hex: 0x2A2550), Color(hex: 0x1B1E3A),
        Color(hex: 0x3A2E5C), Color(hex: 0xC9744A), Color(hex: 0x2B4A5E),
        Color(hex: 0x2B4A5E), Color(hex: 0xE8B27A), Color(hex: 0x3A2E5C),
    ]
    static let text = Color(hex: 0xEDEBE6)
    static let secondary = Color(hex: 0x8A8B93)
    static let driftAmp: CGFloat = 0.06                  // × short side
    static let inner = [4, 1, 3, 5, 7]                   // center, top, left, right, bottom
    static let periods: [Double] = [14, 16, 18, 20, 22]  // seconds
    static let dragMax: CGFloat = 0.12                   // × short side
    static let spring = Animation.spring(response: 0.57, dampingFraction: 0.91)
    static let pressLift: Double = 0.06
    static let pressIn = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.2)
    static let pressOut = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.3)
    static let intro = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 1.2)
    static let textDelay = 0.4, textStagger = 0.06, textDur = 0.3
    static let satFrom = 0.4
    static let portraitCenterY: CGFloat = 0.45
    static let grainOpacity = 0.03                        // uses ../grain.png (256px tile) as asset "grain"
}

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255, opacity: 1)
    }
}

struct DuskMeshView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phases: [Double] = DuskParams.inner.map { _ in .random(in: 0..<(2 * .pi)) }
    @State private var start = Date()
    @State private var dragOffset: CGSize = .zero   // springed separately, added to drift → no jump
    @State private var pressed = false
    @State private var shown = false
    @State private var textShown = [false, false, false]
    @State private var hintGone = false

    var body: some View {
        GeometryReader { geo in
            let size = geo.size
            let s = min(size.width, size.height)
            ZStack(alignment: .bottomLeading) {
                DuskParams.bg
                TimelineView(.animation(paused: reduceMotion)) { ctx in
                    let t = reduceMotion ? 0 : ctx.date.timeIntervalSince(start)
                    let pts = points(t: t, size: size, short: s)
                    mesh(points: pts, size: size)
                }
                .opacity(shown ? 1 : 0)
                .saturation(shown ? 1 : DuskParams.satFrom)
                .ignoresSafeArea()
                .gesture(drag(size: size, short: s))

                Image("grain").resizable(resizingMode: .tile)
                    .opacity(DuskParams.grainOpacity).allowsHitTesting(false).ignoresSafeArea()

                textBlock(width: size.width)
                    .padding(size.width < 760 ? 24 : 48)
                    .allowsHitTesting(false)

                Text("drag to shift the light")
                    .font(.system(size: 13)).foregroundStyle(DuskParams.secondary)
                    .opacity(hintGone ? 0 : 1)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .padding(size.width < 760 ? 24 : 48)
                    .allowsHitTesting(false)
            }
        }
        .onAppear(perform: intro)
    }

    private func textBlock(width: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("002").font(.system(size: 13)).foregroundStyle(DuskParams.secondary).rise(textShown[0])
            let title: CGFloat = width < 760 ? width * 0.18 : 96
            Text("Dusk").font(.system(size: title, weight: .semibold)).tracking(-0.04 * title)
                .foregroundStyle(DuskParams.text).rise(textShown[1])
            Text("A mesh gradient that breathes.").font(.system(size: 15))
                .foregroundStyle(DuskParams.secondary).rise(textShown[2])
        }
    }

    /// Normalized (0…1) mesh points: corners fixed, 5 inner points pure sine drift + center drag offset.
    private func points(t: Double, size: CGSize, short s: CGFloat) -> [SIMD2<Float>] {
        let cy: CGFloat = size.height > size.width ? DuskParams.portraitCenterY : 0.5
        var p: [CGPoint] = [
            .init(x: 0, y: 0), .init(x: 0.5, y: 0), .init(x: 1, y: 0),
            .init(x: 0, y: cy), .init(x: 0.5, y: cy), .init(x: 1, y: cy),
            .init(x: 0, y: 1), .init(x: 0.5, y: 1), .init(x: 1, y: 1),
        ]
        let ax = DuskParams.driftAmp * s / size.width, ay = DuskParams.driftAmp * s / size.height
        for (k, idx) in DuskParams.inner.enumerated() {
            let w = 2 * .pi * t / DuskParams.periods[k]
            p[idx].x += ax * sin(w + phases[k])
            p[idx].y += ay * cos(w + phases[k] * 1.7)
        }
        p[4].x += dragOffset.width / size.width
        p[4].y += dragOffset.height / size.height
        return p.map { SIMD2(Float($0.x), Float($0.y)) }
    }

    @ViewBuilder private func mesh(points: [SIMD2<Float>], size: CGSize) -> some View {
        if #available(iOS 18.0, macOS 15.0, *) {
            MeshGradient(width: 3, height: 3, points: points, colors: DuskParams.colors)
                .overlay(centerLift(points[4], size: size))
        } else {
            // Fallback: 4 radial layers + blur(60), breathing only (drag offset ignored)
            ZStack {
                DuskParams.colors[0]
                ForEach(Array([(1, 0.6), (3, 0.55), (7, 0.4), (4, 0.45)].enumerated()), id: \.offset) { _, l in
                    RadialGradient(colors: [DuskParams.colors[l.0], .clear],
                                   center: UnitPoint(x: CGFloat(points[l.0].x), y: CGFloat(points[l.0].y)),
                                   startRadius: 0, endRadius: max(size.width, size.height) * l.1)
                }
            }.blur(radius: 60)
        }
    }

    /// Press feedback: +6% luminance around the center point.
    private func centerLift(_ c: SIMD2<Float>, size: CGSize) -> some View {
        RadialGradient(colors: [.white.opacity(pressed ? DuskParams.pressLift : 0), .clear],
                       center: UnitPoint(x: CGFloat(c.x), y: CGFloat(c.y)),
                       startRadius: 0, endRadius: min(size.width, size.height) * 0.5)
            .blendMode(.plusLighter).allowsHitTesting(false)
    }

    private func drag(size: CGSize, short s: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { v in
                if !pressed { withAnimation(DuskParams.pressIn) { pressed = true } }
                if !hintGone { DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { withAnimation(.easeOut(duration: 0.3)) { hintGone = true } } }
                let cy = (size.height > size.width ? DuskParams.portraitCenterY : 0.5) * size.height
                var dx = v.location.x - size.width / 2, dy = v.location.y - cy
                let m = DuskParams.dragMax * s, l = hypot(dx, dy)
                if l > m { dx *= m / l; dy *= m / l }
                if reduceMotion { dragOffset = CGSize(width: dx, height: dy) }
                else { withAnimation(DuskParams.spring) { dragOffset = CGSize(width: dx, height: dy) } }
            }
            .onEnded { _ in
                withAnimation(DuskParams.pressOut) { pressed = false }
                if reduceMotion { dragOffset = .zero } else { withAnimation(DuskParams.spring) { dragOffset = .zero } }
            }
    }

    private func intro() {
        if reduceMotion { shown = true; textShown = [true, true, true]; return }
        withAnimation(DuskParams.intro) { shown = true }
        for i in 0..<3 {
            withAnimation(.timingCurve(0.22, 1, 0.36, 1, duration: DuskParams.textDur)
                .delay(DuskParams.textDelay + Double(i) * DuskParams.textStagger)) { textShown[i] = true }
        }
    }
}

private extension View {
    func rise(_ on: Bool) -> some View { opacity(on ? 1 : 0).offset(y: on ? 0 : 4) }
}

#Preview { DuskMeshView() }
