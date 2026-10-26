import { noise } from './noise.ts';

export const fusionVertex = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
uniform vec2 uCamera;
uniform vec2 uView;
uniform vec2 uCenterA;
uniform vec2 uCenterB;
uniform float uRadiusA;
uniform float uRadiusB;
out vec2 vWorld;
void main() {
  vec2 center = (uCenterA + uCenterB) * 0.5;
  vec2 halfSize = abs(uCenterB - uCenterA) * 0.5 + vec2(max(uRadiusA, uRadiusB) * 1.32 + 26.0);
  vec2 world = center + aPos * halfSize;
  vec2 clip = (world - uCamera) / (uView * 0.5);
  gl_Position = vec4(clip, 0.0, 1.0);
  vWorld = world;
}`;

export const fusionFragment = `#version 300 es
precision highp float;
in vec2 vWorld;
out vec4 outColor;
uniform sampler2D uBackground;
uniform sampler2D uInteriorA;
uniform sampler2D uInteriorB;
uniform vec2 uResolution;
uniform vec2 uCenterA;
uniform vec2 uCenterB;
uniform float uRadiusA;
uniform float uRadiusB;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec4 uShapeA[7];
uniform vec4 uShapeB[7];
uniform float uOpacity;
uniform float uTime;
${noise}

float boundary(vec2 offset, vec4 shape[7]) {
  float angle = atan(offset.y, offset.x);
  float value = shape[0].x;
  for (int i = 1; i < 7; i++) {
    float k = float(i);
    value += shape[i].x * cos(k * angle) + shape[i].y * sin(k * angle);
  }
  return max(value, 0.001);
}

float softMin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

void main() {
  vec2 offsetA = vWorld - uCenterA;
  vec2 offsetB = vWorld - uCenterB;
  float rA = length(offsetA) / boundary(offsetA, uShapeA);
  float rB = length(offsetB) / boundary(offsetB, uShapeB);
  float dA = (rA - 1.0) * uRadiusA;
  float dB = (rB - 1.0) * uRadiusB;
  float d = softMin(dA, dB, min(uRadiusA, uRadiusB) * 0.34);
  float feather = max(1.1, min(uRadiusA, uRadiusB) * 0.055);
  if (d > feather) discard;
  float weight = clamp(0.5 + (dB - dA) / max(min(uRadiusA, uRadiusB) * 1.5, 1.0), 0.0, 1.0);
  vec3 dyeA = texture(uInteriorA, clamp(offsetA / max(uRadiusA, 1.0) * 0.5 + 0.5, vec2(0.015), vec2(0.985))).rgb;
  vec3 dyeB = texture(uInteriorB, clamp(offsetB / max(uRadiusB, 1.0) * 0.5 + 0.5, vec2(0.015), vec2(0.985))).rgb;
  vec3 dye = mix(dyeA, dyeB, weight);
  vec3 tint = mix(uColorA, uColorB, weight);
  vec2 screenUv = gl_FragCoord.xy / uResolution;
  vec3 bg = texture(uBackground, screenUv).rgb;
  vec3 absorb = exp(-dye * vec3(1.45, 1.25, 1.05));
  vec3 visible = 1.0 - exp(-dye * 2.4);
  vec3 col = bg * 0.72 * absorb + visible * 0.86;
  col += tint * 0.014;
  float rim = smoothstep(feather * 0.4, -feather * 0.2, d) * smoothstep(-feather * 2.4, -feather * 0.6, d);
  vec2 dir = normalize(offsetA + offsetB + vec2(0.0001));
  float rimLight = pow(max(dot(normalize(vec3(dir, 0.3)), normalize(vec3(-0.55, 0.62, 0.42))), 0.0), 2.0);
  col += vec3(0.82, 0.96, 0.92) * rim * rimLight * 0.18;
  col *= 1.0 - smoothstep(-feather * 0.9, 0.0, d) * 0.18;
  float alpha = smoothstep(feather, 0.0, d) * 0.92 * uOpacity;
  outColor = vec4(col, alpha);
}`;
