// Lumen 012 · Ink — SwiftUI
// A single drop, slowly finding its way.
//
// Source only: not compiled, not run on a device.
//
// iOS 17+ with Metal: the web pipeline as compute kernels on a 128 grid (Jacobi 16).
// Otherwise: a CPU stable-fluids solver on a 96 × 64 grid (ink field 192 × 128), drawn as a bitmap.
// Numbers match ink.js. Positions are in card units (x 0…1 left→right, y 0…1 top→bottom);
// velocities in card widths (W) per second; times in ms unless noted.

import SwiftUI
import MetalKit
import GameController

// MARK: - Parameters (synced with ink.js)

enum InkP {
    static let bg = Color(red: 0x0B / 255, green: 0x0B / 255, blue: 0x0C / 255)
    static let paper = SIMD3<Float>(0xEC, 0xE8, 0xE1) / 255
    static let ink = SIMD3<Float>(0x14, 0x14, 0x16) / 255
    static let wMax: CGFloat = 760, wVw: CGFloat = 0.76, wVh: CGFloat = 1.2
    static let aspect: Float = 1.5, portraitCy: CGFloat = 0.46, radius: CGFloat = 4
    static let grainAlpha = 0.03
    static let label = Color(red: 0x8A / 255, green: 0x87 / 255, blue: 0x80 / 255)
    static let labelSize: CGFloat = 11, labelTracking: CGFloat = 0.08, insetR: CGFloat = 0.05
    // simulation
    static let gridLongMetal = 128, jacobiMetal = 16
    static let gridCPU = (96, 64), inkCPU = (192, 128), jacobiCPU = 16
    static let pressureWarm: Float = 0.8, vorticity: Float = 18
    static let velHalfLife: Float = 1200, inkHalfLife: Float = 9000
    /// Ink half-life while no pointer is involved; pointer play uses inkHalfLife. Eased between the two (half-time hlEase).
    static let inkHalfLifeAuto: Float = 3500, hlEase: Float = 250
    static let edgeMargin: Float = 0.06
    static let noiseAmp: Float = 0.06, noiseK = SIMD2<Float>(6, 13), noiseW = SIMD2<Float>(0.8, 0.2)
    static let noiseS = SIMD2<Float>(0.18, 0.42), noiseNorm: Float = 0.497
    // render
    static let absorbK: Float = 3.0, poolK: Float = 0.18, poolBlur: Float = 2
    static let fiberBase: Float = 0.92, fiberAmp: Float = 0.16, fiberScale = 24, maxDensity: Float = 0.92
    static let soakRate: Float = 0.15, soakFiber: Float = 0.15, soakStill: Float = 0.1, crisp: Float = 2.5
    // drops (no satellites)
    static let dropAmount: Float = 1.0, dropPeak: Float = 0.85, dropR: Float = 0.075, dropIn: Float = 180
    static let dropImpulse: Float = 0.2, burstR: Float = 0.028, dropGap: Double = 350
    // pointer stirring
    static let moveGain: Float = 1.4, moveR: Float = 0.035, moveMax: Float = 3.0
    // auto mode
    static let autoEvery: Double = 9000
    static let autoPts: [SIMD2<Float>] = [[0.50, 0.47], [0.62, 0.56], [0.50, 0.40]]
    static let stirAx: Float = 0.22, stirAy: Float = 0.14, stirPeriod: Float = 7000, stirForce: Float = 0.7, stirR: Float = 0.035
    static let stirIn: Double = 800, stirOut: Double = 300, idleFine: Double = 6000, idleCoarse: Double = 3000
    static let resumeDropDelay: Double = 800
    /// Auto stirrer: full force for stirHold ms after a drop, then a smoothstep down to 0 over stirFade ms.
    static let stirHold: Double = 3500, stirFade: Double = 1200
    // start
    static let prerun: Double = 600, stepMs: Double = 1000 / 60, maxDt: Double = 1000 / 30
    static let slowMs: Double = 20, slowRun = 30
}

// MARK: - Shared helpers

struct Mulberry32 {
    private var a: UInt32
    init(_ seed: UInt32) { a = seed }
    mutating func next() -> Float {
        a = a &+ 0x6D2B79F5
        var t = (a ^ (a >> 15)) &* (1 | a)
        t = (t &+ ((t ^ (t >> 7)) &* (61 | t))) ^ t
        return Float((t ^ (t >> 14))) / 4294967296
    }
}

@inline(__always) func smooth01(_ x: Float) -> Float { let t = min(1, max(0, x)); return t * t * (3 - 2 * t) }
@inline(__always) func smoothstep(_ a: Float, _ b: Float, _ x: Float) -> Float { smooth01((x - a) / (b - a)) }

/// Velocity fades to 0 within `m` card widths of every card edge (both axes), so ink stays on the paper.
@inline(__always) func edgeFade(_ x: Float, _ y: Float, _ m: Float) -> Float {
    let dx = min(x, 1 - x), dy = min(y, 1 - y) / InkP.aspect
    return smoothstep(0, m, dx) * smoothstep(0, m, dy)
}

/// Paper absorbency: one smooth value-noise octave, cells about W/24, Catmull-Rom between lattice points,
/// normalised to mean 0.5 and SD 0.22. No strokes, no lines.
func makeFiber(seed: UInt32, w: Int, h: Int, cells: Int = InkP.fiberScale) -> [Float] {
    var rnd = Mulberry32(seed ^ 0x9e3779b9)
    let cw = Float(w) / Float(cells)
    let gx = cells + 4, gy = Int((Float(h) / cw).rounded(.up)) + 4
    let lat = (0..<(gx * gy)).map { _ in rnd.next() }
    func cr(_ p0: Float, _ p1: Float, _ p2: Float, _ p3: Float, _ t: Float) -> Float {
        p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))
    }
    var v = [Float](repeating: 0, count: w * h)
    var sum: Float = 0, sum2: Float = 0
    for y in 0..<h {
        let fy = Float(y) / cw + 1, iy = Int(fy), ty = fy - Float(iy)
        for x in 0..<w {
            let fx = Float(x) / cw + 1, ix = Int(fx), tx = fx - Float(ix)
            var row = [Float](repeating: 0, count: 4)
            for k in 0..<4 { let o = (iy - 1 + k) * gx + ix - 1; row[k] = cr(lat[o], lat[o + 1], lat[o + 2], lat[o + 3], tx) }
            let val = cr(row[0], row[1], row[2], row[3], ty)
            v[y * w + x] = val; sum += val; sum2 += val * val
        }
    }
    let n = Float(w * h), mean = sum / n, sd = max(1e-5, (sum2 / n - mean * mean).squareRoot())
    return v.map { min(1, max(0, 0.5 + ($0 - mean) * 0.22 / sd)) }
}

// MARK: - Director: modes, drops, stirrer and pointer (same rules as ink.js)

/// The physics backends (Metal or CPU) implement these three operations.
protocol InkBackend: AnyObject {
    /// Blend the velocity toward `force` inside a gaussian of radius `r`, plus an optional wobbly radial impulse.
    func splatVel(x: Float, y: Float, fx: Float, fy: Float, r: Float, blend: Float, radial: Float, seed: Float)
    /// Add ink with the profile amount·(1 − q²)², q = distance / (r · low-order wobble).
    func splatInk(x: Float, y: Float, r: Float, amount: Float, seed: Float)
    /// Advance the fluid and the ink by dt ms. `bursts` are (x, y in W units, radius, amplitude); `inkHalfLife` is the current ink half-life in ms.
    func simulate(dtMs: Float, simT: Float, bursts: [SIMD4<Float>], inkHalfLife: Float)
    func clear()
}

final class InkDirector {
    enum Mode { case auto, manual }
    private(set) var simT: Double = 0
    private var rand: Mulberry32
    let seed: UInt32
    private var mode: Mode = .auto
    private var lastDropT: Double = -1e9, nextAutoT: Double = 0, autoIdx = 0
    private var autoT0: Double = 0                  // time of the last auto drop (or of the return to auto)
    private var inkHL: Float = InkP.inkHalfLifeAuto // current ink half-life, eased between the auto and the pointer value
    private var lastInputT: Double = -1e9, lastInputCoarse = false
    private var stirFrom: Float = 0, stirTo: Float = 0, stirT0: Double = 0, stirDur: Double = 1
    private var queue: [SIMD2<Float>] = []
    private struct Pour { var x, y, r, amount, s: Float; var t: Float }
    private var pours: [Pour] = []
    private struct Burst { var x, y: Float; var age: Float }
    private var bursts: [Burst] = []
    private struct Ptr { var x: Float = 0.5, y: Float = 0.5, px: Float = 0.5, py: Float = 0.5; var t: Double = 0, pt: Double = 0; var moved = false, inside = false, down = false }
    private var ptr = Ptr()
    private(set) var noiseSeed = SIMD2<Float>(0, 0)
    weak var backend: InkBackend?

    init(seed: UInt32) {
        self.seed = seed
        rand = Mulberry32(seed)
        noiseSeed = [rand.next() * 100, rand.next() * 100]
    }

    func reset(reduced: Bool) {
        rand = Mulberry32(seed)
        noiseSeed = [rand.next() * 100, rand.next() * 100]
        mode = .auto; lastDropT = -1e9; lastInputT = -1e9; queue.removeAll(); pours.removeAll(); bursts.removeAll()
        ptr = Ptr(); autoIdx = 0; nextAutoT = 0; autoT0 = 0; inkHL = InkP.inkHalfLifeAuto; simT = 0
        backend?.clear()
        prerun(reduced: reduced)
    }

    /// The first visible frame is a drop that has just burst: run the first 0.6 s offscreen.
    func prerun(reduced: Bool) {
        let n = Int((InkP.prerun / InkP.stepMs).rounded())
        for _ in 0..<n { step(InkP.stepMs) }
        stirFrom = 0; stirTo = reduced ? 0 : 1; stirT0 = simT; stirDur = InkP.stirIn
    }

    private func currentStir() -> Float {
        let k = stirDur > 0 ? Float(min(1, (simT - stirT0) / stirDur)) : 1
        let e = stirTo > stirFrom ? smooth01(k) : k
        return stirFrom + (stirTo - stirFrom) * e
    }
    private func setStir(_ to: Float, _ dur: Double) { stirFrom = currentStir(); stirTo = to; stirT0 = simT; stirDur = dur }

    private func drop(_ x: Float, _ y: Float) {
        let s = rand.next() * 100
        backend?.splatVel(x: x, y: y, fx: 0, fy: 0, r: InkP.burstR, blend: 0, radial: InkP.dropImpulse, seed: s)
        pours.append(Pour(x: x, y: y, r: InkP.dropR, amount: InkP.dropPeak * InkP.dropAmount, s: s, t: 0))
        bursts.insert(Burst(x: x, y: y / InkP.aspect, age: 0), at: 0)
        if bursts.count > 4 { bursts.removeLast(bursts.count - 4) }
        lastDropT = simT
    }

    private func easeOut(_ k: Float) -> Float { 1 - pow(1 - min(1, max(0, k)), 3) }

    func step(_ dtMs: Double) {
        let dt = Float(dtMs)
        while !queue.isEmpty { let q = queue.removeFirst(); drop(q.x, q.y) }
        if mode == .auto && simT >= nextAutoT {
            let p = InkP.autoPts[autoIdx % InkP.autoPts.count]
            drop(p.x, p.y); autoT0 = simT; autoIdx += 1; nextAutoT = simT + InkP.autoEvery
        }
        // each drop is poured in over 180 ms with an ease-out, never in one frame
        var i = pours.count - 1
        while i >= 0 {
            let k0 = easeOut(pours[i].t / InkP.dropIn), k1 = easeOut((pours[i].t + dt) / InkP.dropIn)
            backend?.splatInk(x: pours[i].x, y: pours[i].y, r: pours[i].r, amount: pours[i].amount * (k1 - k0), seed: pours[i].s)
            pours[i].t += dt
            if pours[i].t >= InkP.dropIn { pours.remove(at: i) }
            i -= 1
        }
        // auto stirrer: full force for stirHold ms after the drop, then a smoothstep down to 0 over stirFade ms
        let autoF = 1 - smooth01(Float((simT - autoT0 - InkP.stirHold) / InkP.stirFade))
        let gain = currentStir() * autoF
        inkHL += ((mode == .auto ? InkP.inkHalfLifeAuto : InkP.inkHalfLife) - inkHL) * (1 - pow(0.5, dt / InkP.hlEase))
        if gain > 0.001 {
            let w = 2 * Float.pi / InkP.stirPeriod, t = Float(simT)
            let sx = 0.5 + InkP.stirAx * sin(w * t), sy = 0.5 + InkP.stirAy * sin(2 * w * t)
            let vx = InkP.stirAx * w * cos(w * t) * 1000 * InkP.stirForce
            let vy = InkP.stirAy * 2 * w * cos(2 * w * t) * 1000 / InkP.aspect * InkP.stirForce
            backend?.splatVel(x: sx, y: sy, fx: vx, fy: vy, r: InkP.stirR, blend: gain * (1 - pow(0.5, dt / Float(InkP.stepMs))), radial: 0, seed: 0)
        }
        if ptr.moved {
            let dts = Float(max(1, ptr.t - ptr.pt) / 1000)
            var vx = (ptr.x - ptr.px) / dts * InkP.moveGain
            var vy = (ptr.y - ptr.py) / InkP.aspect / dts * InkP.moveGain
            let m = (vx * vx + vy * vy).squareRoot()
            if m > InkP.moveMax { vx *= InkP.moveMax / m; vy *= InkP.moveMax / m }
            backend?.splatVel(x: ptr.x, y: ptr.y, fx: vx, fy: vy, r: InkP.moveR, blend: 1, radial: 0, seed: 0)
            ptr.px = ptr.x; ptr.py = ptr.y; ptr.pt = ptr.t; ptr.moved = false
        }
        var b: [SIMD4<Float>] = []
        for br in bursts {
            let amp = InkP.dropImpulse * pow(0.5, br.age / InkP.velHalfLife)
            if amp >= 0.004 { b.append([br.x, br.y, InkP.burstR, amp]) }
        }
        backend?.simulate(dtMs: dt, simT: Float(simT), bursts: b, inkHalfLife: inkHL)
        for k in bursts.indices { bursts[k].age += dt }
        bursts.removeAll { InkP.dropImpulse * pow(0.5, $0.age / InkP.velHalfLife) < 0.004 }
        simT += dtMs
        if mode == .manual && simT - lastInputT > (lastInputCoarse ? InkP.idleCoarse : InkP.idleFine) {
            mode = .auto; setStir(1, InkP.stirIn); autoT0 = simT; nextAutoT = simT + InkP.resumeDropDelay
        }
    }

    // pointer, in card units
    private func takeOver(_ coarse: Bool) {
        lastInputT = simT; lastInputCoarse = coarse
        if mode != .manual { mode = .manual; setStir(0, InkP.stirOut) }
    }
    func move(_ x: Float, _ y: Float, coarse: Bool) {
        if !ptr.inside { ptr.px = x; ptr.py = y; ptr.pt = simT - 16 }
        ptr.inside = true; ptr.x = x; ptr.y = y; ptr.t = simT; ptr.moved = true
        takeOver(coarse)
    }
    func leave() { if !ptr.down { ptr.inside = false } }
    func press(_ x: Float, _ y: Float, coarse: Bool) {
        takeOver(coarse)
        ptr.down = true; ptr.inside = true
        ptr.x = x; ptr.px = x; ptr.y = y; ptr.py = y; ptr.t = simT; ptr.pt = simT
        if simT - lastDropT >= InkP.dropGap { queue.append([x, y]); lastDropT = simT }
    }
    func release() { ptr.down = false }
}

// MARK: - Metal backend (iOS 17+)

private let inkMetalSource = """
#include <metal_stdlib>
using namespace metal;

struct U {
  float4 burst[4];
  float4 paper; float4 inkc;
  float2 point; float2 force; float2 noiseK; float2 noiseW; float2 noiseS; float2 noiseSeed;
  float radius; float blend; float radial; float aspect; float seed; float amount; float dt; float eps;
  float decay; float edge; float time; float amp; float soak; float soakFiber; float soakStill; float pool;
  float sig; float crisp; float absorb; float fb; float fa; float maxD; float pressK;
  int burstN;
};

constexpr sampler LS(coord::normalized, address::clamp_to_edge, filter::linear);

inline float2 UVof(uint2 g, uint2 n) { return (float2(g) + 0.5) / float2(n); }
inline float4 RD(texture2d<float> t, int2 p) {
  int2 m = int2(t.get_width(), t.get_height()) - 1;
  return t.read(uint2(clamp(p, int2(0), m)));
}
inline float edgeFade(float2 uv, float aspect, float m) {
  float dx = min(uv.x, 1.0 - uv.x), dy = min(uv.y, 1.0 - uv.y) / aspect;
  return smoothstep(0.0, m, dx) * smoothstep(0.0, m, dy);
}
#define GUARD(o) uint2 n = uint2(o.get_width(), o.get_height()); if (g.x >= n.x || g.y >= n.y) return; float2 uv = UVof(g, n);

kernel void splatVel(texture2d<float> vel [[texture(0)]], texture2d<float, access::write> o [[texture(1)]],
                     constant U& u [[buffer(0)]], uint2 g [[thread_position_in_grid]]) {
  GUARD(o)
  float2 v = vel.read(g).xy;
  float2 d = float2(uv.x - u.point.x, (uv.y - u.point.y) / u.aspect);
  float k = exp(-dot(d, d) / (u.radius * u.radius));
  v = mix(v, u.force, k * u.blend);
  if (u.radial > 0.0) {
    float r = length(d), a = atan2(d.y, d.x), q = r / u.radius;
    // low orders only: a few long lobes rather than many short jets
    float wob = 1.0 + 0.2 * sin(a * 5.0 + u.seed) + 0.17 * sin(a * 8.0 + u.seed * 2.31);
    v += d / max(r, 1e-5) * u.radial * q * exp(0.5 * (1.0 - q * q)) * wob;
  }
  o.write(float4(v, 0, 1), g);
}

kernel void splatInk(texture2d<float> ink [[texture(0)]], texture2d<float, access::write> o [[texture(1)]],
                     constant U& u [[buffer(0)]], uint2 g [[thread_position_in_grid]]) {
  GUARD(o)
  float2 c = ink.read(g).xy;
  float2 d = float2(uv.x - u.point.x, (uv.y - u.point.y) / u.aspect);
  float r = length(d), a = atan2(d.y, d.x);
  float e = u.radius * (1.0 + 0.07 * sin(a * 3.0 + u.seed) + 0.05 * sin(a * 5.0 + u.seed * 1.7));
  float q = min(r / e, 1.0), k = 1.0 - q * q;
  c.x = min(c.x + u.amount * k * k, 1.6);
  o.write(float4(c, 0, 1), g);
}

kernel void curl(texture2d<float> vel [[texture(0)]], texture2d<float, access::write> o [[texture(1)]],
                 constant U& u [[buffer(0)]], uint2 g [[thread_position_in_grid]]) {
  GUARD(o)
  int2 p = int2(g);
  float L = RD(vel, p - int2(1, 0)).y, R = RD(vel, p + int2(1, 0)).y;
  float B = RD(vel, p - int2(0, 1)).x, T = RD(vel, p + int2(0, 1)).x;
  o.write(float4(0.5 * (R - L - T + B) * float(n.x), 0, 0, 1), g);
}

kernel void vorticity(texture2d<float> vel [[texture(0)]], texture2d<float> cu [[texture(1)]],
                      texture2d<float, access::write> o [[texture(2)]],
                      constant U& u [[buffer(0)]], uint2 g [[thread_position_in_grid]]) {
  GUARD(o)
  int2 p = int2(g);
  float L = abs(RD(cu, p - int2(1, 0)).x), R = abs(RD(cu, p + int2(1, 0)).x);
  float B = abs(RD(cu, p - int2(0, 1)).x), T = abs(RD(cu, p + int2(0, 1)).x);
  float C = cu.read(g).x;
  float2 nn = float2(T - B, R - L); nn /= length(nn) + 1e-5;
  float2 f = u.eps * (1.0 / float(n.x)) * C * float2(nn.x, -nn.y);
  float2 v = vel.read(g).xy + f * u.dt;
  o.write(float4(clamp(v, -8.0, 8.0), 0, 1), g);
}

kernel void divergence(texture2d<float> vel [[texture(0)]], texture2d<float, access::write> o [[texture(1)]],
                       constant U& u [[buffer(0)]], uint2 g [[thread_position_in_grid]]) {
  GUARD(o)
  int2 p = int2(g);
  float2 C = vel.read(g).xy;
  float L = RD(vel, p - int2(1, 0)).x, R = RD(vel, p + int2(1, 0)).x;
  float B = RD(vel, p - int2(0, 1)).y, T = RD(vel, p + int2(0, 1)).y;
  if (g.x == 0) L = -C.x;
  if (g.x == n.x - 1) R = -C.x;
  if (g.y == 0) B = -C.y;
  if (g.y == n.y - 1) T = -C.y;
  o.write(float4(0.5 * (R - L + T - B) * float(n.x), 0, 0, 1), g);
}

kernel void scaleP(texture2d<float> pr [[texture(0)]], texture2d<float, access::write> o [[texture(1)]],
                   constant U& u [[buffer(0)]], uint2 g [[thread_position_in_grid]]) {
  GUARD(o)
  o.write(pr.read(g) * u.pressK, g);
}

kernel void jacobi(texture2d<float> pr [[texture(0)]], texture2d<float> dv [[texture(1)]],
                   texture2d<float, access::write> o [[texture(2)]],
                   constant U& u [[buffer(0)]], uint2 g [[thread_position_in_grid]]) {
  GUARD(o)
  int2 p = int2(g);
  float h = 1.0 / float(n.x);
  float s = RD(pr, p - int2(1, 0)).x + RD(pr, p + int2(1, 0)).x + RD(pr, p - int2(0, 1)).x + RD(pr, p + int2(0, 1)).x;
  o.write(float4((s - dv.read(g).x * h * h) * 0.25, 0, 0, 1), g);
}

kernel void gradient(texture2d<float> pr [[texture(0)]], texture2d<float> vel [[texture(1)]],
                     texture2d<float, access::write> o [[texture(2)]],
                     constant U& u [[buffer(0)]], uint2 g [[thread_position_in_grid]]) {
  GUARD(o)
  int2 p = int2(g);
  float L = RD(pr, p - int2(1, 0)).x, R = RD(pr, p + int2(1, 0)).x;
  float B = RD(pr, p - int2(0, 1)).x, T = RD(pr, p + int2(0, 1)).x;
  float2 v = vel.read(g).xy - 0.5 * float(n.x) * float2(R - L, T - B);
  o.write(float4(v, 0, 1), g);
}

kernel void advectVel(texture2d<float> vel [[texture(0)]], texture2d<float, access::write> o [[texture(1)]],
                      constant U& u [[buffer(0)]], uint2 g [[thread_position_in_grid]]) {
  GUARD(o)
  float2 v = vel.read(g).xy;
  float2 c = uv - u.dt * float2(v.x, v.y * u.aspect);
  float2 nv = vel.sample(LS, c).xy * u.decay;
  if (g.x == 0 || g.x == n.x - 1) nv.x = 0.0;   // walls
  if (g.y == 0 || g.y == n.y - 1) nv.y = 0.0;
  nv *= edgeFade(uv, u.aspect, u.edge);          // soft 0.06W margin
  o.write(float4(nv, 0, 1), g);
}

// 3D simplex noise (Ashima / Stefan Gustavson), time as the third axis
inline float3 m289(float3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
inline float4 m289(float4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
inline float4 perm(float4 x) { return m289(((x * 34.0) + 10.0) * x); }
inline float4 tis(float4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(float3 v) {
  const float2 C = float2(1.0 / 6.0, 1.0 / 3.0);
  const float4 D = float4(0.0, 0.5, 1.0, 2.0);
  float3 i = floor(v + dot(v, C.yyy));
  float3 x0 = v - i + dot(i, C.xxx);
  float3 gg = step(x0.yzx, x0.xyz);
  float3 l = 1.0 - gg;
  float3 i1 = min(gg.xyz, l.zxy), i2 = max(gg.xyz, l.zxy);
  float3 x1 = x0 - i1 + C.xxx, x2 = x0 - i2 + C.yyy, x3 = x0 - D.yyy;
  i = m289(i);
  float4 p = perm(perm(perm(i.z + float4(0.0, i1.z, i2.z, 1.0)) + i.y + float4(0.0, i1.y, i2.y, 1.0)) + i.x + float4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  float3 ns = n_ * D.wyz - D.xzx;
  float4 j = p - 49.0 * floor(p * ns.z * ns.z);
  float4 x_ = floor(j * ns.z), y_ = floor(j - 7.0 * x_);
  float4 x = x_ * ns.x + ns.yyyy, y = y_ * ns.x + ns.yyyy;
  float4 h = 1.0 - abs(x) - abs(y);
  float4 b0 = float4(x.xy, y.xy), b1 = float4(x.zw, y.zw);
  float4 s0 = floor(b0) * 2.0 + 1.0, s1 = floor(b1) * 2.0 + 1.0;
  float4 sh = -step(h, float4(0.0));
  float4 a0 = b0.xzyw + s0.xzyw * sh.xxyy, a1 = b1.xzyw + s1.xzyw * sh.zzww;
  float3 p0 = float3(a0.xy, h.x), p1 = float3(a0.zw, h.y), p2 = float3(a1.xy, h.z), p3 = float3(a1.zw, h.w);
  float4 nr = tis(float4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= nr.x; p1 *= nr.y; p2 *= nr.z; p3 *= nr.w;
  float4 m = max(0.5 - float4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, float4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

kernel void psi(texture2d<float, access::write> o [[texture(0)]],
                constant U& u [[buffer(0)]], uint2 g [[thread_position_in_grid]]) {
  GUARD(o)
  float2 p = float2(uv.x, uv.y / u.aspect);
  float s = u.noiseW.x * snoise(float3(p * u.noiseK.x + u.noiseSeed, u.time * u.noiseS.x)) / u.noiseK.x
          + u.noiseW.y * snoise(float3(p * u.noiseK.y - u.noiseSeed.yx, u.time * u.noiseS.y + 7.3)) / u.noiseK.y;
  o.write(float4(s * u.amp, 0, 0, 1), g);
}

// ink transport: grid velocity + curl noise + drop sources, faded out at the 0.06W margin
kernel void vink(texture2d<float> vel [[texture(0)]], texture2d<float> ps [[texture(1)]],
                 texture2d<float, access::write> o [[texture(2)]],
                 constant U& u [[buffer(0)]], uint2 g [[thread_position_in_grid]]) {
  GUARD(o)
  int2 q = int2(g);
  float L = RD(ps, q - int2(1, 0)).x, R = RD(ps, q + int2(1, 0)).x;
  float B = RD(ps, q - int2(0, 1)).x, T = RD(ps, q + int2(0, 1)).x;
  float2 noise = float2((T - B) / (2.0 / float(n.y) / u.aspect), -(R - L) / (2.0 / float(n.x)));
  float2 p = float2(uv.x, uv.y / u.aspect);
  float2 acc = 0.0;
  for (int i = 0; i < u.burstN; i++) {
    float4 b = u.burst[i];
    float2 d = p - b.xy;
    float r = length(d), e = exp(-(r / b.z) * (r / b.z));
    // a source with a soft core: v = A R (1 - e^-q^2) / r
    acc += d / max(r * r, 1e-10) * b.w * b.z * (1.0 - e);
  }
  float2 gv = vel.sample(LS, uv).xy;
  o.write(float4((gv + noise + acc) * edgeFade(uv, u.aspect, u.edge), 0, length(gv)), g);
}

inline float2 trace(float2 uv, float2 v, float s, constant U& u) { return uv - s * u.dt * float2(v.x, v.y * u.aspect); }
inline float2 trace2(float2 uv, float2 v, float s, texture2d<float> vk, constant U& u) {
  return trace(uv, vk.sample(LS, trace(uv, v, 0.5 * s, u)).xy, s, u);
}

kernel void inkFwd(texture2d<float> ink [[texture(0)]], texture2d<float> vk [[texture(1)]],
                   texture2d<float, access::write> o [[texture(2)]],
                   constant U& u [[buffer(0)]], uint2 g [[thread_position_in_grid]]) {
  GUARD(o)
  float2 v = vk.sample(LS, uv).xy;
  o.write(float4(ink.sample(LS, trace2(uv, v, 1.0, vk, u)).x, ink.read(g).y, 0, 1), g);
}

// limited MacCormack, clamped to >= 0; then the paper soaks up still, wet ink (soaked ink stays put)
kernel void inkFix(texture2d<float> ink [[texture(0)]], texture2d<float> fw [[texture(1)]],
                   texture2d<float> vk [[texture(2)]], texture2d<float> fiber [[texture(3)]],
                   texture2d<float, access::write> o [[texture(4)]],
                   constant U& u [[buffer(0)]], uint2 g [[thread_position_in_grid]]) {
  GUARD(o)
  float4 k = vk.sample(LS, uv);
  float fwd = fw.read(g).x;
  float back = fw.sample(LS, trace2(uv, k.xy, -1.0, vk, u)).x;
  float2 here = ink.read(g).xy;
  float a = fwd + 0.5 * (here.x - back);
  float2 c = trace2(uv, k.xy, 1.0, vk, u) * float2(n) - 0.5;
  int2 i0 = int2(floor(c));
  float s00 = RD(ink, i0).x, s10 = RD(ink, i0 + int2(1, 0)).x, s01 = RD(ink, i0 + int2(0, 1)).x, s11 = RD(ink, i0 + int2(1, 1)).x;
  a = clamp(a, min(min(s00, s10), min(s01, s11)), max(max(s00, s10), max(s01, s11)));
  int2 p = int2(g);
  float n0 = RD(fw, p + int2(1, 0)).x, n1 = RD(fw, p - int2(1, 0)).x, n2 = RD(fw, p + int2(0, 1)).x, n3 = RD(fw, p - int2(0, 1)).x;
  a = clamp(a, min(min(min(n0, n1), min(n2, n3)), fwd), max(max(max(n0, n1), max(n2, n3)), fwd));
  a = max(a, 0.0);
  float fib = fiber.sample(LS, uv).x;
  float soak = u.soak * (0.6 + u.soakFiber * fib) * exp(-k.w / u.soakStill) * a * u.dt;
  float wet = max(a - soak, 0.0), dry = here.y + soak;
  o.write(float4(wet * u.decay, min(dry, 1.6) * u.decay, 0, 1), g);
}

// display-only unsharp (bounded by the 3x3 range) + edge pooling d' = d + 0.18 |grad d| on a ~2px gaussian
kernel void pool(texture2d<float> ink [[texture(0)]], texture2d<float, access::write> o [[texture(1)]],
                 constant U& u [[buffer(0)]], uint2 g [[thread_position_in_grid]]) {
  GUARD(o)
  int2 p = int2(g);
  #define D(dx, dy) (RD(ink, p + int2(dx, dy)).x + RD(ink, p + int2(dx, dy)).y)
  float c = max(D(0, 0), 0.0);
  float r = D(1, 0), l = D(-1, 0), t = D(0, 1), b = D(0, -1);
  float ne = D(1, 1), nw = D(-1, 1), se = D(1, -1), sw = D(-1, -1);
  float blur = (r + l + t + b) * 0.125 + (ne + nw + se + sw) * 0.0625 + c * 0.25;
  float lo = min(min(min(r, l), min(t, b)), min(min(ne, nw), min(min(se, sw), c)));
  float hi = max(max(max(r, l), max(t, b)), max(max(ne, nw), max(max(se, sw), c)));
  float d = clamp(c + u.crisp * (c - blur), lo, hi);
  float2 gs = 0.0; float wn = 0.0; float k2 = 0.5 / (u.sig * u.sig);
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    float2 o2 = float2(i, j);
    float w = exp(-dot(o2, o2) * k2);
    gs += w * o2 * D(i, j);
    wn += w * float(i * i);
  }
  #undef D
  float dp = min(d + u.pool * length(gs) / wn * clamp(d * 4.0, 0.0, 1.0), 1.0);
  o.write(float4(dp, 0, 0, 1), g);
}

kernel void display(texture2d<float> pl [[texture(0)]], texture2d<float> fiber [[texture(1)]],
                    texture2d<float, access::write> o [[texture(2)]],
                    constant U& u [[buffer(0)]], uint2 g [[thread_position_in_grid]]) {
  GUARD(o)
  float dp = clamp(pl.sample(LS, uv).x, 0.0, 1.0);
  dp *= u.fb + u.fa * fiber.sample(LS, uv).x;           // paper absorption, smooth noise only
  float cov = min(1.0 - exp(-u.absorb * dp), u.maxD);     // never pure black
  float3 col = mix(u.paper.rgb, u.inkc.rgb, cov);
  float2 q = float2(g);
  float n1 = fract(52.9829189 * fract(dot(q, float2(0.06711056, 0.00583715))));
  float n2 = fract(52.9829189 * fract(dot(q + 17.0, float2(0.00583715, 0.06711056))));
  col += (n1 + n2 - 1.0) / 255.0;
  o.write(float4(col, 1), g);
}
"""

private struct InkUniforms {
    var burst: (SIMD4<Float>, SIMD4<Float>, SIMD4<Float>, SIMD4<Float>) = (.zero, .zero, .zero, .zero)
    var paper = SIMD4<Float>(InkP.paper, 1), inkc = SIMD4<Float>(InkP.ink, 1)
    var point = SIMD2<Float>.zero, force = SIMD2<Float>.zero
    var noiseK = InkP.noiseK, noiseW = InkP.noiseW, noiseS = InkP.noiseS, noiseSeed = SIMD2<Float>.zero
    var radius: Float = 0, blend: Float = 0, radial: Float = 0, aspect: Float = InkP.aspect
    var seed: Float = 0, amount: Float = 0, dt: Float = 0, eps: Float = InkP.vorticity
    var decay: Float = 1, edge: Float = InkP.edgeMargin, time: Float = 0, amp: Float = InkP.noiseAmp * InkP.noiseNorm
    var soak: Float = InkP.soakRate, soakFiber: Float = InkP.soakFiber, soakStill: Float = InkP.soakStill, pool: Float = InkP.poolK
    var sig: Float = 1, crisp: Float = InkP.crisp, absorb: Float = InkP.absorbK, fb: Float = InkP.fiberBase
    var fa: Float = InkP.fiberAmp, maxD: Float = InkP.maxDensity, pressK: Float = InkP.pressureWarm
    var burstN: Int32 = 0
}

final class InkMetal: NSObject, InkBackend, MTKViewDelegate {
    let device: MTLDevice
    private let queue: MTLCommandQueue
    private var pipes: [String: MTLComputePipelineState] = [:]
    private struct Pair { var read: MTLTexture; var write: MTLTexture; mutating func swap() { (read, write) = (write, read) } }
    private var vel: Pair!, pres: Pair!, ink: Pair!
    private var divT: MTLTexture!, curlT: MTLTexture!, fwdT: MTLTexture!, psiT: MTLTexture!, vinkT: MTLTexture!, poolT: MTLTexture!, fiberT: MTLTexture!
    private var gridLong = InkP.gridLongMetal
    private var cmd: MTLCommandBuffer?
    private var u = InkUniforms()
    let director: InkDirector
    private(set) var reduced = false
    private var last: CFTimeInterval?
    private var slowRun = 0, frame = 0, perfLevel = 0
    private var cardPx = SIMD2<Int>(0, 0)

    init?(seed: UInt32) {
        guard let dev = MTLCreateSystemDefaultDevice(), let q = dev.makeCommandQueue(),
              let lib = try? dev.makeLibrary(source: inkMetalSource, options: nil) else { return nil }
        device = dev; queue = q
        director = InkDirector(seed: seed)
        super.init()
        for name in ["splatVel", "splatInk", "curl", "vorticity", "divergence", "scaleP", "jacobi", "gradient",
                     "advectVel", "psi", "vink", "inkFwd", "inkFix", "pool", "display"] {
            guard let f = lib.makeFunction(name: name), let p = try? dev.makeComputePipelineState(function: f) else { return nil }
            pipes[name] = p
        }
        director.backend = self
        u.noiseSeed = director.noiseSeed
    }

    private func tex(_ w: Int, _ h: Int, _ fmt: MTLPixelFormat) -> MTLTexture {
        let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: fmt, width: w, height: h, mipmapped: false)
        d.usage = [.shaderRead, .shaderWrite]; d.storageMode = .private
        return device.makeTexture(descriptor: d)!
    }
    private func pair(_ w: Int, _ h: Int, _ fmt: MTLPixelFormat) -> Pair { Pair(read: tex(w, h, fmt), write: tex(w, h, fmt)) }

    /// Allocates the fields for a card of `px` device pixels. Ink at half the card's pixels, at most 1024 wide.
    func allocate(cardPx px: SIMD2<Int>) {
        guard px != cardPx || vel == nil else { return }
        cardPx = px
        let gw = gridLong, gh = Int((Float(gridLong) / InkP.aspect).rounded())
        let iw = min(1024, max(64, px.x / 2)), ih = Int((Float(iw) / InkP.aspect).rounded())
        let pw = max(32, iw / 2), ph = Int((Float(pw) / InkP.aspect).rounded())
        vel = pair(gw, gh, .rg16Float); pres = pair(gw, gh, .r16Float)
        divT = tex(gw, gh, .r16Float); curlT = tex(gw, gh, .r16Float)
        ink = pair(iw, ih, .rg16Float); fwdT = tex(iw, ih, .rg16Float); poolT = tex(iw, ih, .r16Float)
        psiT = tex(pw, ph, .r16Float); vinkT = tex(pw, ph, .rgba16Float)
        let fw = 384, fh = 256
        let data = makeFiber(seed: director.seed, w: fw, h: fh).map { UInt8(($0 * 255).rounded()) }
        let fd = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .r8Unorm, width: fw, height: fh, mipmapped: false)
        fd.usage = .shaderRead
        fiberT = device.makeTexture(descriptor: fd)
        data.withUnsafeBytes { fiberT.replace(region: MTLRegionMake2D(0, 0, fw, fh), mipmapLevel: 0, withBytes: $0.baseAddress!, bytesPerRow: fw) }
        u.sig = max(0.6, InkP.poolBlur * Float(iw) / Float(px.x))
        clear()
        withCommands { director.reset(reduced: reduced) }
    }

    /// Reduce Motion: back to the still pre-run frame of the fresh drop, no simulation.
    func setReduced(_ r: Bool) {
        guard r != reduced else { return }
        reduced = r
        if vel != nil { withCommands { director.reset(reduced: r) } }
        last = nil
    }

    private func withCommands(_ body: () -> Void) {
        cmd = queue.makeCommandBuffer()
        body()
        cmd?.commit(); cmd = nil
    }

    private func run(_ name: String, _ ins: [MTLTexture], _ out: MTLTexture) {
        guard let c = cmd, let enc = c.makeComputeCommandEncoder(), let p = pipes[name] else { return }
        enc.setComputePipelineState(p)
        for (i, t) in ins.enumerated() { enc.setTexture(t, index: i) }
        enc.setTexture(out, index: ins.count)
        var uu = u
        enc.setBytes(&uu, length: MemoryLayout<InkUniforms>.stride, index: 0)
        let tw = p.threadExecutionWidth, th = max(1, p.maxTotalThreadsPerThreadgroup / tw)
        enc.dispatchThreads(MTLSize(width: out.width, height: out.height, depth: 1),
                            threadsPerThreadgroup: MTLSize(width: tw, height: th, depth: 1))
        enc.endEncoding()
    }

    // MARK: InkBackend
    func clear() {
        guard let c = queue.makeCommandBuffer(), let b = c.makeBlitCommandEncoder() else { return }
        for t in [vel.read, vel.write, pres.read, pres.write, ink.read, ink.write, fwdT!, divT!, curlT!] {
            let bytes = t.width * t.height * 8
            if let buf = device.makeBuffer(length: bytes, options: .storageModePrivate) {
                b.fill(buffer: buf, range: 0..<bytes, value: 0)
                let bpp = t.pixelFormat == .r16Float ? 2 : 4
                b.copy(from: buf, sourceOffset: 0, sourceBytesPerRow: t.width * bpp, sourceBytesPerImage: t.width * t.height * bpp,
                       sourceSize: MTLSize(width: t.width, height: t.height, depth: 1), to: t, destinationSlice: 0, destinationLevel: 0,
                       destinationOrigin: MTLOrigin(x: 0, y: 0, z: 0))
            }
        }
        b.endEncoding(); c.commit(); c.waitUntilCompleted()
    }

    func splatVel(x: Float, y: Float, fx: Float, fy: Float, r: Float, blend: Float, radial: Float, seed: Float) {
        u.point = [x, y]; u.force = [fx, fy]; u.radius = r; u.blend = blend; u.radial = radial; u.seed = seed
        run("splatVel", [vel.read], vel.write); vel.swap()
    }
    func splatInk(x: Float, y: Float, r: Float, amount: Float, seed: Float) {
        u.point = [x, y]; u.radius = r; u.amount = amount; u.seed = seed
        run("splatInk", [ink.read], ink.write); ink.swap()
    }
    func simulate(dtMs: Float, simT: Float, bursts: [SIMD4<Float>], inkHalfLife: Float) {
        u.dt = dtMs / 1000
        run("curl", [vel.read], curlT)
        run("vorticity", [vel.read, curlT], vel.write); vel.swap()
        run("divergence", [vel.read], divT)
        run("scaleP", [pres.read], pres.write); pres.swap()
        let jac = perfLevel > 0 ? 12 : InkP.jacobiMetal
        for _ in 0..<jac { run("jacobi", [pres.read, divT], pres.write); pres.swap() }
        run("gradient", [pres.read, vel.read], vel.write); vel.swap()
        u.decay = pow(0.5, dtMs / InkP.velHalfLife)
        run("advectVel", [vel.read], vel.write); vel.swap()
        u.time = simT / 1000
        run("psi", [], psiT)
        var b = bursts.prefix(4).map { $0 }
        u.burstN = Int32(b.count)
        while b.count < 4 { b.append(.zero) }
        u.burst = (b[0], b[1], b[2], b[3])
        run("vink", [vel.read, psiT], vinkT)
        run("inkFwd", [ink.read, vinkT], fwdT)
        u.decay = pow(0.5, dtMs / inkHalfLife)
        run("inkFix", [ink.read, fwdT, vinkT, fiberT], ink.write); ink.swap()
    }

    // MARK: MTKViewDelegate
    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {
        allocate(cardPx: [Int(size.width), Int(size.height)])
        if reduced || view.isPaused { view.setNeedsDisplay() }
    }

    func draw(in view: MTKView) {
        guard vel != nil, let drawable = view.currentDrawable else { return }
        let now = CACurrentMediaTime()
        var dtMs = last.map { ($0 - now) * -1000 } ?? InkP.stepMs
        last = now
        // perf fallback: 30 frames in a row over 20 ms halve the grid (once)
        if dtMs > InkP.slowMs && frame > 10 { slowRun += 1 } else { slowRun = 0 }
        if slowRun >= InkP.slowRun && perfLevel < 1 { perfLevel = 1; gridLong /= 2; let px = cardPx; cardPx = .zero; allocate(cardPx: px); slowRun = 0 }
        dtMs = min(max(dtMs, 0), InkP.maxDt)
        cmd = queue.makeCommandBuffer()
        if !reduced && dtMs > 0 { director.step(dtMs); frame += 1 }
        run("pool", [ink.read], poolT)
        run("display", [poolT, fiberT], drawable.texture)
        cmd?.present(drawable)
        cmd?.commit(); cmd = nil
    }
}

private struct InkMetalView: UIViewRepresentable {
    let engine: InkMetal
    let reduced: Bool
    func makeUIView(context: Context) -> MTKView {
        let v = MTKView(frame: .zero, device: engine.device)
        v.framebufferOnly = false               // the display kernel writes straight into the drawable
        v.colorPixelFormat = .bgra8Unorm
        v.preferredFramesPerSecond = 60
        v.delegate = engine
        v.isOpaque = true
        apply(v)
        return v
    }
    func updateUIView(_ v: MTKView, context: Context) { apply(v) }
    private func apply(_ v: MTKView) {
        engine.setReduced(reduced)
        // Reduce Motion: one still frame of the fresh drop, no simulation
        v.isPaused = reduced
        v.enableSetNeedsDisplay = reduced
        if reduced { v.setNeedsDisplay() }
    }
}

// MARK: - CPU backend (fallback): 96 × 64 velocity grid, 192 × 128 ink, on a background queue

final class InkCPU: InkBackend {
    let gw = InkP.gridCPU.0, gh = InkP.gridCPU.1, iw = InkP.inkCPU.0, ih = InkP.inkCPU.1
    private var u: [Float], v: [Float], u2: [Float], v2: [Float], p: [Float], p2: [Float], dv: [Float], cu: [Float]
    private var nu: [Float], nvv: [Float]         // curl-noise velocity on the grid
    private var wet: [Float], dry: [Float], fwd: [Float], tmp: [Float]
    private var kx: [Float], ky: [Float], ks: [Float]  // ink transport at ink resolution, |grid velocity|
    private let fiber: [Float]
    private var noiseNorm: Float = 1
    let director: InkDirector

    init(seed: UInt32) {
        let zg = [Float](repeating: 0, count: gw * gh), zi = [Float](repeating: 0, count: iw * ih)
        u = zg; v = zg; u2 = zg; v2 = zg; p = zg; p2 = zg; dv = zg; cu = zg; nu = zg; nvv = zg
        wet = zi; dry = zi; fwd = zi; tmp = zi; kx = zi; ky = zi; ks = zi
        fiber = makeFiber(seed: seed, w: iw, h: ih)
        director = InkDirector(seed: seed)
        director.backend = self
        calibrateNoise()
    }

    func clear() {
        for i in u.indices { u[i] = 0; v[i] = 0; p[i] = 0 }
        for i in wet.indices { wet[i] = 0; dry[i] = 0 }
    }

    // bilinear sample with texel centres, clamped
    @inline(__always) private func samp(_ a: [Float], _ w: Int, _ h: Int, _ x: Float, _ y: Float) -> Float {
        let fx = min(max(x * Float(w) - 0.5, 0), Float(w - 1)), fy = min(max(y * Float(h) - 0.5, 0), Float(h - 1))
        let x0 = Int(fx), y0 = Int(fy), x1 = min(x0 + 1, w - 1), y1 = min(y0 + 1, h - 1)
        let tx = fx - Float(x0), ty = fy - Float(y0)
        let a0 = a[y0 * w + x0] + (a[y0 * w + x1] - a[y0 * w + x0]) * tx
        let a1 = a[y1 * w + x0] + (a[y1 * w + x1] - a[y1 * w + x0]) * tx
        return a0 + (a1 - a0) * ty
    }
    @inline(__always) private func at(_ a: [Float], _ w: Int, _ h: Int, _ x: Int, _ y: Int) -> Float {
        a[min(max(y, 0), h - 1) * w + min(max(x, 0), w - 1)]
    }

    func splatVel(x: Float, y: Float, fx: Float, fy: Float, r: Float, blend: Float, radial: Float, seed: Float) {
        for j in 0..<gh { for i in 0..<gw {
            let ux = (Float(i) + 0.5) / Float(gw), uy = (Float(j) + 0.5) / Float(gh)
            let dx = ux - x, dy = (uy - y) / InkP.aspect
            let k = exp(-(dx * dx + dy * dy) / (r * r)) * blend
            let id = j * gw + i
            u[id] += (fx - u[id]) * k; v[id] += (fy - v[id]) * k
            if radial > 0 {
                let rr = (dx * dx + dy * dy).squareRoot(), a = atan2(dy, dx), q = rr / r
                let wob = 1 + 0.2 * sin(a * 5 + seed) + 0.17 * sin(a * 8 + seed * 2.31)
                let s = radial * q * exp(0.5 * (1 - q * q)) * wob / max(rr, 1e-5)
                u[id] += dx * s; v[id] += dy * s
            }
        } }
    }

    func splatInk(x: Float, y: Float, r: Float, amount: Float, seed: Float) {
        let x0 = max(0, Int((x - r * 1.2) * Float(iw))), x1 = min(iw - 1, Int((x + r * 1.2) * Float(iw)) + 1)
        let ry = r * 1.2 * InkP.aspect
        let y0 = max(0, Int((y - ry) * Float(ih))), y1 = min(ih - 1, Int((y + ry) * Float(ih)) + 1)
        guard x0 <= x1, y0 <= y1 else { return }
        for j in y0...y1 { for i in x0...x1 {
            let dx = (Float(i) + 0.5) / Float(iw) - x, dy = ((Float(j) + 0.5) / Float(ih) - y) / InkP.aspect
            let rr = (dx * dx + dy * dy).squareRoot(), a = atan2(dy, dx)
            let e = r * (1 + 0.07 * sin(a * 3 + seed) + 0.05 * sin(a * 5 + seed * 1.7))
            let q = min(rr / e, 1), k = 1 - q * q
            wet[j * iw + i] = min(wet[j * iw + i] + amount * k * k, 1.6)
        } }
    }

    // smooth 3D value noise (quintic), the CPU stand-in for simplex; its scale is calibrated below
    @inline(__always) private func hash(_ x: Int32, _ y: Int32, _ z: Int32) -> Float {
        var h = UInt32(bitPattern: x &* 374761393 &+ y &* 668265263 &+ z &* 2147483647)
        h = (h ^ (h >> 13)) &* 1274126177
        return Float(h ^ (h >> 16)) / 4294967296 * 2 - 1
    }
    private func vnoise(_ x: Float, _ y: Float, _ z: Float) -> Float {
        let xi = floor(x), yi = floor(y), zi = floor(z)
        let fx = x - xi, fy = y - yi, fz = z - zi
        func q(_ t: Float) -> Float { t * t * t * (t * (t * 6 - 15) + 10) }
        let ux = q(fx), uy = q(fy), uz = q(fz)
        let X = Int32(xi), Y = Int32(yi), Z = Int32(zi)
        func l(_ a: Float, _ b: Float, _ t: Float) -> Float { a + (b - a) * t }
        return l(l(l(hash(X, Y, Z), hash(X + 1, Y, Z), ux), l(hash(X, Y + 1, Z), hash(X + 1, Y + 1, Z), ux), uy),
                 l(l(hash(X, Y, Z + 1), hash(X + 1, Y, Z + 1), ux), l(hash(X, Y + 1, Z + 1), hash(X + 1, Y + 1, Z + 1), ux), uy), uz)
    }
    private func noiseField(t: Float, scale: Float) {
        let s = director.noiseSeed
        var ps = [Float](repeating: 0, count: gw * gh)
        for j in 0..<gh { for i in 0..<gw {
            let px = (Float(i) + 0.5) / Float(gw), py = (Float(j) + 0.5) / Float(gh) / InkP.aspect
            ps[j * gw + i] = (InkP.noiseW.x * vnoise(px * InkP.noiseK.x + s.x, py * InkP.noiseK.x + s.y, t * InkP.noiseS.x) / InkP.noiseK.x
                            + InkP.noiseW.y * vnoise(px * InkP.noiseK.y - s.y, py * InkP.noiseK.y - s.x, t * InkP.noiseS.y + 7.3) / InkP.noiseK.y) * scale
        } }
        let h = 1 / Float(gw)   // grid spacing in W, both axes
        for j in 0..<gh { for i in 0..<gw {
            nu[j * gw + i] = (at(ps, gw, gh, i, j + 1) - at(ps, gw, gh, i, j - 1)) / (2 * h)
            nvv[j * gw + i] = -(at(ps, gw, gh, i + 1, j) - at(ps, gw, gh, i - 1, j)) / (2 * h)
        } }
    }
    /// The value noise has its own scale: measure its RMS speed once and set it to 0.06 W/s.
    private func calibrateNoise() {
        noiseField(t: 0, scale: 1)
        var s2: Float = 0
        for k in nu.indices { s2 += nu[k] * nu[k] + nvv[k] * nvv[k] }
        let rms = (s2 / Float(nu.count)).squareRoot()
        noiseNorm = rms > 0 ? InkP.noiseAmp / rms : 0
    }

    func simulate(dtMs: Float, simT: Float, bursts: [SIMD4<Float>], inkHalfLife: Float) {
        let dt = dtMs / 1000, h = 1 / Float(gw), invH = Float(gw)
        // vorticity confinement
        for j in 0..<gh { for i in 0..<gw {
            cu[j * gw + i] = 0.5 * (at(v, gw, gh, i + 1, j) - at(v, gw, gh, i - 1, j) - at(u, gw, gh, i, j + 1) + at(u, gw, gh, i, j - 1)) * invH
        } }
        for j in 0..<gh { for i in 0..<gw {
            let L = abs(at(cu, gw, gh, i - 1, j)), R = abs(at(cu, gw, gh, i + 1, j))
            let B = abs(at(cu, gw, gh, i, j - 1)), T = abs(at(cu, gw, gh, i, j + 1))
            var nx = T - B, ny = R - L
            let len = (nx * nx + ny * ny).squareRoot() + 1e-5; nx /= len; ny /= len
            let c = cu[j * gw + i], id = j * gw + i
            u[id] = min(8, max(-8, u[id] + InkP.vorticity * h * c * nx * dt))
            v[id] = min(8, max(-8, v[id] - InkP.vorticity * h * c * ny * dt))
        } }
        // projection: divergence (walls), warm-started Jacobi, gradient subtraction
        for j in 0..<gh { for i in 0..<gw {
            let id = j * gw + i
            let L = i == 0 ? -u[id] : u[id - 1], R = i == gw - 1 ? -u[id] : u[id + 1]
            let B = j == 0 ? -v[id] : v[id - gw], T = j == gh - 1 ? -v[id] : v[id + gw]
            dv[id] = 0.5 * (R - L + T - B) * invH
            p[id] *= InkP.pressureWarm
        } }
        for _ in 0..<InkP.jacobiCPU {
            for j in 0..<gh { for i in 0..<gw {
                p2[j * gw + i] = (at(p, gw, gh, i - 1, j) + at(p, gw, gh, i + 1, j) + at(p, gw, gh, i, j - 1) + at(p, gw, gh, i, j + 1) - dv[j * gw + i] * h * h) * 0.25
            } }
            swap(&p, &p2)
        }
        for j in 0..<gh { for i in 0..<gw {
            let id = j * gw + i
            u[id] -= 0.5 * invH * (at(p, gw, gh, i + 1, j) - at(p, gw, gh, i - 1, j))
            v[id] -= 0.5 * invH * (at(p, gw, gh, i, j + 1) - at(p, gw, gh, i, j - 1))
        } }
        // advection with decay, walls and the soft 0.06W margin
        let vd = pow(0.5, dtMs / InkP.velHalfLife)
        for j in 0..<gh { for i in 0..<gw {
            let id = j * gw + i
            let x = (Float(i) + 0.5) / Float(gw), y = (Float(j) + 0.5) / Float(gh)
            let cx = x - dt * u[id], cy = y - dt * v[id] * InkP.aspect
            let f = edgeFade(x, y, InkP.edgeMargin) * vd
            u2[id] = (i == 0 || i == gw - 1) ? 0 : samp(u, gw, gh, cx, cy) * f
            v2[id] = (j == 0 || j == gh - 1) ? 0 : samp(v, gw, gh, cx, cy) * f
        } }
        swap(&u, &u2); swap(&v, &v2)
        // ink transport at ink resolution: grid + curl noise + drop sources, faded at the margin
        noiseField(t: simT / 1000, scale: noiseNorm)
        for j in 0..<ih { for i in 0..<iw {
            let x = (Float(i) + 0.5) / Float(iw), y = (Float(j) + 0.5) / Float(ih)
            let gx = samp(u, gw, gh, x, y), gy = samp(v, gw, gh, x, y)
            var ax = gx + samp(nu, gw, gh, x, y), ay = gy + samp(nvv, gw, gh, x, y)
            let px = x, py = y / InkP.aspect
            for b in bursts {
                let dx = px - b.x, dy = py - b.y, r2 = max(dx * dx + dy * dy, 1e-10)
                let e = exp(-r2 / (b.z * b.z)), s = b.w * b.z * (1 - e) / r2
                ax += dx * s; ay += dy * s
            }
            let f = edgeFade(x, y, InkP.edgeMargin), id = j * iw + i
            kx[id] = ax * f; ky[id] = ay * f; ks[id] = (gx * gx + gy * gy).squareRoot()
        } }
        // limited MacCormack (RK2 departure points), clamped to >= 0, then soak and decay
        func tr(_ x: Float, _ y: Float, _ s: Float) -> (Float, Float) {
            let mx = x - 0.5 * s * dt * samp(kx, iw, ih, x, y), my = y - 0.5 * s * dt * samp(ky, iw, ih, x, y) * InkP.aspect
            return (x - s * dt * samp(kx, iw, ih, mx, my), y - s * dt * samp(ky, iw, ih, mx, my) * InkP.aspect)
        }
        for j in 0..<ih { for i in 0..<iw {
            let x = (Float(i) + 0.5) / Float(iw), y = (Float(j) + 0.5) / Float(ih)
            let (sx, sy) = tr(x, y, 1)
            fwd[j * iw + i] = samp(wet, iw, ih, sx, sy)
        } }
        let idc = pow(0.5, dtMs / inkHalfLife)
        for j in 0..<ih { for i in 0..<iw {
            let id = j * iw + i
            let x = (Float(i) + 0.5) / Float(iw), y = (Float(j) + 0.5) / Float(ih)
            let (bx, by) = tr(x, y, -1)
            var a = fwd[id] + 0.5 * (wet[id] - samp(fwd, iw, ih, bx, by))
            let (sx, sy) = tr(x, y, 1)
            let cx = sx * Float(iw) - 0.5, cy = sy * Float(ih) - 0.5
            let x0 = Int(floor(cx)), y0 = Int(floor(cy))
            let s00 = at(wet, iw, ih, x0, y0), s10 = at(wet, iw, ih, x0 + 1, y0), s01 = at(wet, iw, ih, x0, y0 + 1), s11 = at(wet, iw, ih, x0 + 1, y0 + 1)
            a = min(max(a, min(s00, s10, s01, s11)), max(s00, s10, s01, s11))
            let n0 = at(fwd, iw, ih, i + 1, j), n1 = at(fwd, iw, ih, i - 1, j), n2 = at(fwd, iw, ih, i, j + 1), n3 = at(fwd, iw, ih, i, j - 1)
            a = min(max(a, min(n0, n1, n2, n3, fwd[id])), max(n0, n1, n2, n3, fwd[id]))
            a = max(a, 0)
            let soak = InkP.soakRate * (0.6 + InkP.soakFiber * fiber[id]) * exp(-ks[id] / InkP.soakStill) * a * dt
            tmp[id] = max(a - soak, 0) * idc
            dry[id] = min(dry[id] + soak, 1.6) * idc
        } }
        swap(&wet, &tmp)
    }

    /// Pooling, paper absorption and colour, into RGBA8 at ink resolution.
    func renderRGBA() -> [UInt8] {
        var out = [UInt8](repeating: 255, count: iw * ih * 4)
        func D(_ i: Int, _ j: Int) -> Float { at(wet, iw, ih, i, j) + at(dry, iw, ih, i, j) }
        let sig: Float = 0.6, k2 = 0.5 / (sig * sig)
        for j in 0..<ih { for i in 0..<iw {
            let c = max(D(i, j), 0)
            var lo = c, hi = c, blur = c * 0.25
            for (dx, dy, w) in [(1, 0, Float(0.125)), (-1, 0, 0.125), (0, 1, 0.125), (0, -1, 0.125), (1, 1, 0.0625), (-1, 1, 0.0625), (1, -1, 0.0625), (-1, -1, 0.0625)] {
                let s = D(i + dx, j + dy); blur += s * w; lo = min(lo, s); hi = max(hi, s)
            }
            let d = min(max(c + InkP.crisp * (c - blur), lo), hi)
            var gx: Float = 0, gy: Float = 0, wn: Float = 0
            for b in -2...2 { for a in -2...2 {
                let w = exp(-Float(a * a + b * b) * k2), s = D(i + a, j + b)
                gx += w * Float(a) * s; gy += w * Float(b) * s; wn += w * Float(a * a)
            } }
            var dp = min(d + InkP.poolK * (gx * gx + gy * gy).squareRoot() / wn * min(max(d * 4, 0), 1), 1)
            dp = min(max(dp, 0), 1) * (InkP.fiberBase + InkP.fiberAmp * fiber[j * iw + i])
            let cov = min(1 - exp(-InkP.absorbK * dp), InkP.maxDensity)
            let col = InkP.paper + (InkP.ink - InkP.paper) * cov
            let o = (j * iw + i) * 4
            out[o] = UInt8(min(255, max(0, col.x * 255))); out[o + 1] = UInt8(min(255, max(0, col.y * 255)))
            out[o + 2] = UInt8(min(255, max(0, col.z * 255)))
        } }
        return out
    }
}

/// Drives the CPU solver on a background queue and publishes a bitmap to the main thread.
final class InkCPUModel: ObservableObject {
    @Published var image: CGImage?
    private let sim: InkCPU
    private let work = DispatchQueue(label: "lumen.ink.sim", qos: .userInteractive)
    private var timer: DispatchSourceTimer?
    private var last: CFTimeInterval?

    init(seed: UInt32) { sim = InkCPU(seed: seed) }

    func start(reduced: Bool) {
        stop()
        work.async { [weak self] in
            guard let self else { return }
            self.sim.director.reset(reduced: reduced)
            self.publish()
            if reduced { return }   // Reduce Motion: the still pre-run frame only
            let t = DispatchSource.makeTimerSource(queue: self.work)
            t.schedule(deadline: .now(), repeating: .milliseconds(16))
            t.setEventHandler { [weak self] in self?.tick() }
            self.timer = t; t.resume()
        }
    }
    func stop() { timer?.cancel(); timer = nil; last = nil }

    private func tick() {
        let now = CACurrentMediaTime()
        let dt = min(max(last.map { (now - $0) * 1000 } ?? InkP.stepMs, 0), InkP.maxDt)
        last = now
        sim.director.step(dt)
        publish()
    }
    private func publish() {
        let px = sim.renderRGBA()
        let w = sim.iw, h = sim.ih
        guard let prov = CGDataProvider(data: Data(px) as CFData),
              let img = CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4,
                                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
                                provider: prov, decode: nil, shouldInterpolate: true, intent: .defaultIntent) else { return }
        DispatchQueue.main.async { self.image = img }
    }

    // pointer, forwarded to the solver queue
    func press(_ x: Float, _ y: Float, coarse: Bool) { work.async { self.sim.director.press(x, y, coarse: coarse) } }
    func move(_ x: Float, _ y: Float, coarse: Bool) { work.async { self.sim.director.move(x, y, coarse: coarse) } }
    func release() { work.async { self.sim.director.release() } }
    func leave() { work.async { self.sim.director.leave() } }
}

// MARK: - View

/// Holds the engine for the life of the view: Metal on iOS 17+, the CPU solver otherwise.
final class InkEngine: ObservableObject {
    let metal: InkMetal?
    let cpu: InkCPUModel?
    init(seed: UInt32) {
        var m: InkMetal? = nil
        if #available(iOS 17, *) { m = InkMetal(seed: seed) }
        metal = m
        cpu = m == nil ? InkCPUModel(seed: seed) : nil
    }
    func press(_ x: Float, _ y: Float, coarse: Bool) { if let metal { metal.director.press(x, y, coarse: coarse) } else { cpu?.press(x, y, coarse: coarse) } }
    func move(_ x: Float, _ y: Float, coarse: Bool) { if let metal { metal.director.move(x, y, coarse: coarse) } else { cpu?.move(x, y, coarse: coarse) } }
    func release() { if let metal { metal.director.release() } else { cpu?.release() } }
    func leave() { if let metal { metal.director.leave() } else { cpu?.leave() } }
}

private struct InkCPUSurface: View {
    @ObservedObject var model: InkCPUModel
    let reduced: Bool
    var body: some View {
        Canvas { ctx, sz in
            if let img = model.image {
                ctx.draw(Image(decorative: img, scale: 1), in: CGRect(origin: .zero, size: sz))
            } else {
                ctx.fill(Path(CGRect(origin: .zero, size: sz)),
                         with: .color(Color(red: Double(InkP.paper.x), green: Double(InkP.paper.y), blue: Double(InkP.paper.z))))
            }
        }
        .onAppear { model.start(reduced: reduced) }
        .onChange(of: reduced) { r in model.start(reduced: r) }   // Reduce Motion: still frame only
        .onDisappear { model.stop() }
    }
}

public struct InkView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @StateObject private var engine: InkEngine
    @State private var pressing = false

    public init(seed: UInt32 = UInt32.random(in: 0...UInt32.max)) {
        _engine = StateObject(wrappedValue: InkEngine(seed: seed))
    }

    public var body: some View {
        GeometryReader { geo in
            let size = geo.size
            let portrait = size.height > size.width
            let W = floor(min(InkP.wMax, InkP.wVw * size.width, InkP.wVh * size.height))
            let H = (W * 2 / 3).rounded()
            let inset = (InkP.insetR * W).rounded()
            ZStack {
                InkP.bg.ignoresSafeArea()
                ZStack(alignment: .topLeading) {
                    surface
                    Image("grain", bundle: nil)
                        .resizable(resizingMode: .tile)
                        .opacity(InkP.grainAlpha)
                        .allowsHitTesting(false)
                    label("LUMEN").padding(.leading, inset).padding(.top, inset)
                    label("Nº 012").frame(maxWidth: .infinity, alignment: .trailing).padding(.trailing, inset).padding(.top, inset)
                    label("Ink").frame(maxHeight: .infinity, alignment: .bottom).padding(.leading, inset).padding(.bottom, inset)
                }
                .frame(width: W, height: H)
                .clipShape(RoundedRectangle(cornerRadius: InkP.radius, style: .continuous))
                .contentShape(Rectangle())
                .gesture(drag(W: W, H: H))
                .onContinuousHover(coordinateSpace: .local) { phase in
                    guard !reduceMotion else { return }
                    switch phase {
                    case .active(let p): engine.move(Float(p.x / W), Float(p.y / H), coarse: false)
                    case .ended: engine.leave()
                    }
                }
                .position(x: size.width / 2, y: size.height * (portrait ? InkP.portraitCy : 0.5))
                .accessibilityElement()
                .accessibilityLabel("Ink drop on paper")
            }
        }
    }

    @ViewBuilder private var surface: some View {
        if let metal = engine.metal {
            InkMetalView(engine: metal, reduced: reduceMotion)
        } else if let cpu = engine.cpu {
            InkCPUSurface(model: cpu, reduced: reduceMotion)
        }
    }

    private func label(_ s: String) -> some View {
        Text(s)
            .font(.custom("JetBrainsMono-Regular", size: InkP.labelSize))
            .tracking(InkP.labelSize * InkP.labelTracking)
            .foregroundStyle(InkP.label)
            .allowsHitTesting(false)
    }

    // A connected mouse or trackpad counts as a fine pointer (6 s idle before auto resumes); otherwise 3 s.
    private var coarse: Bool { GCMouse.current == nil }

    private func drag(W: CGFloat, H: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .onChanged { g in
                guard !reduceMotion else { return }
                let x = Float(g.location.x / W), y = Float(g.location.y / H)
                if !pressing { pressing = true; engine.press(x, y, coarse: coarse) } else { engine.move(x, y, coarse: coarse) }
            }
            .onEnded { _ in pressing = false; engine.release() }
    }
}

#Preview { InkView(seed: 12) }
