export const streakVertex = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aSegment;
layout(location = 2) in vec4 aShape;
layout(location = 3) in vec4 aTint;
uniform vec2 uCamera;
uniform vec2 uView;
out vec2 vLocal;
out vec4 vShape;
out vec4 vTint;
out float vLength;
void main() {
  vec2 a = aSegment.xy;
  vec2 b = aSegment.zw;
  vec2 axis = b - a;
  float len = max(length(axis), 0.001);
  vec2 dir = axis / len;
  vec2 normal = vec2(-dir.y, dir.x);
  float pad = aShape.x * 3.0;
  vec2 world = mix(a - dir * pad, b + dir * pad, aCorner.x * 0.5 + 0.5) + normal * aCorner.y * pad;
  vLocal = vec2(mix(-pad, len + pad, aCorner.x * 0.5 + 0.5), aCorner.y * pad);
  vShape = aShape;
  vTint = aTint;
  vLength = len;
  gl_Position = vec4((world - uCamera) / (uView * 0.5), 0.0, 1.0);
}`;

export const streakFragment = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec4 vShape;
in vec4 vTint;
in float vLength;
out vec4 outColor;

void main() {
  float width = vShape.x;
  float u = clamp(vLocal.x / vLength, 0.0, 1.0);
  float taper = vShape.z > 0.5 ? mix(0.35, 1.0, smoothstep(0.0, 0.25, u)) * mix(1.0, 0.15, smoothstep(0.82, 1.0, u)) : 1.0 - u * 0.6;
  float extent = width * taper;
  float outside = max(-vLocal.x, vLocal.x - vLength);
  float d = length(vec2(max(outside, 0.0), vLocal.y));
  float core = smoothstep(extent, extent * 0.25, d);
  float glow = exp(-d * d / (width * width * 4.0)) * vShape.y;
  float wobble = 0.85 + 0.15 * sin(vLocal.x * 0.09 + vShape.w * 6.28);
  vec3 col = vTint.rgb * (core * 1.1 + glow * 0.7) * wobble + vec3(0.9, 1.0, 1.0) * core * 0.25;
  float alpha = clamp(core + glow * 0.6, 0.0, 1.0) * vTint.a;
  outColor = vec4(col * alpha, alpha);
}`;
