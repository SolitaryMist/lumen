#include <metal_stdlib>
#include <SwiftUI/SwiftUI.h>
using namespace metal;

// 8×8 Bayer. Same matrix as the web fragment shader.
constant float BAYER[64] = {
   0.0, 32.0,  8.0, 40.0,  2.0, 34.0, 10.0, 42.0,
  48.0, 16.0, 56.0, 24.0, 50.0, 18.0, 58.0, 26.0,
  12.0, 44.0,  4.0, 36.0, 14.0, 46.0,  6.0, 38.0,
  60.0, 28.0, 52.0, 20.0, 62.0, 30.0, 54.0, 22.0,
   3.0, 35.0, 11.0, 43.0,  1.0, 33.0,  9.0, 41.0,
  51.0, 19.0, 59.0, 27.0, 49.0, 17.0, 57.0, 25.0,
  15.0, 47.0,  7.0, 39.0, 13.0, 45.0,  5.0, 37.0,
  63.0, 31.0, 55.0, 23.0, 61.0, 29.0, 53.0, 21.0
};

static float thresh(float2 idx) {
    int ix = int(fmod(idx.x, 8.0));
    int iy = int(fmod(idx.y, 8.0));
    if (ix < 0) ix = 0; if (ix > 7) ix = 7;
    if (iy < 0) iy = 0; if (iy > 7) iy = 7;
    return (BAYER[iy * 8 + ix] + 0.5) / 64.0;
}

// position is y-down, in points. scale converts to device pixels.
// cellA / cellB are even device-pixel sizes. mixAmt cross-fades them.
static half4 ink(float2 frag, float cell, float2 center, float2 radius, float2 light, float bright) {
    half3 bg = half3(11.0 / 255.0, 11.0 / 255.0, 12.0 / 255.0);
    float side = max(2.0, floor(cell + 0.5));
    float2 idx = floor(frag / side);
    float2 mid = (idx + 0.5) * side;
    float2 p = (mid - center) / max(radius, float2(1.0));
    if (dot(p, p) > 1.0) return half4(bg, 1.0);
    float3 N = float3(p, sqrt(max(0.0, 1.0 - dot(p, p))));
    float3 L = normalize(float3(light, 0.9));
    float ndl = dot(N, L);
    float lum = (0.06 + 0.94 * max(ndl, 0.0) * smoothstep(-0.05, 0.25, ndl)) * bright;
    float3 H = normalize(L + float3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(N, H), 0.0), 40.0);
    if (lum <= thresh(idx)) return half4(bg, 1.0);
    if (spec > 0.55) return half4(1.0, 181.0 / 255.0, 71.0 / 255.0, 1.0);
    return half4(232.0 / 255.0, 230.0 / 255.0, 225.0 / 255.0, 1.0);
}

[[ stitchable ]] half4 ditherLight(
    float2 position,
    half4 color,
    float2 size,
    float2 light,
    float radius,
    float cellA,
    float cellB,
    float mixAmt,
    float bright,
    float scale
) {
    float2 frag = position * scale;
    float2 center = size * scale * 0.5;
    float2 rad = float2(max(round(radius * scale), 1.0));
    half4 a = ink(frag, max(cellA, 2.0), center, rad, light, bright);
    half4 b = ink(frag, max(cellB, 2.0), center, rad, light, bright);
    return mix(a, b, half(clamp(mixAmt, 0.0, 1.0)));
}
