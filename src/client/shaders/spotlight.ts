import { lightTransport } from './light-transport.ts';

export const spotFragment = `#version 300 es
precision highp float;
in vec2 vWorld;
out vec4 outColor;
uniform sampler2D uOccluder;
uniform vec2 uCamera;
uniform vec2 uView;
uniform vec2 uCenter;
uniform vec2 uLight;
uniform float uRadius;
uniform float uPhase;
uniform float uProgress;
uniform float uTime;
uniform int uSteps;

${lightTransport}

void main() {
  float d = distance(vWorld, uCenter) / uRadius;
  float focus = abs(uPhase - 1.0) < 0.5 ? uProgress : 0.0;
  float strike = abs(uPhase - 2.0) < 0.5 ? 1.0 - uProgress : 0.0;
  float fade = abs(uPhase - 3.0) < 0.5 ? 1.0 - uProgress : 1.0;
  float softness = mix(0.4, 0.14, focus);
  float pool = 1.0 - smoothstep(1.0 - softness, 1.0 + softness * 0.3, d);
  float core = exp(-d * d * 2.4);
  float flicker = 0.94 + 0.06 * sin(uTime * 23.0) * sin(uTime * 7.0);
  float amount = (pool * (0.14 + 0.28 * focus) + core * 0.07 + strike * pool * 0.5) * fade * flicker;
  if (amount < 0.002) discard;
  vec3 lit = transmit(vWorld, vWorld + uLight * 300.0, 0.0);
  vec3 warm = vec3(1.0, 0.95, 0.84);
  vec3 rim = vec3(0.78, 0.88, 1.0);
  vec3 col = mix(rim, warm, smoothstep(1.05, 0.6, d)) * amount * lit;
  outColor = vec4(col, 0.0);
}`;

export const needleFragment = `#version 300 es
precision highp float;
in vec2 vWorld;
out vec4 outColor;
uniform sampler2D uBackground;
uniform vec2 uTip;
uniform vec2 uDirection;
uniform float uProgress;
uniform vec3 uFluid;
uniform float uGift;
uniform float uTool;
uniform vec2 uResolution;
uniform vec2 uView;

const float LENGTH = 1500.0;
const float TAPER = 640.0;

float band(float x, float width) {
  return exp(-x * x / (width * width));
}

void main() {
  float plunge = smoothstep(0.0, 0.25, uProgress) * (1.0 - smoothstep(0.82, 1.0, uProgress));
  float lift = mix(1200.0, 0.0, plunge);
  vec2 tip = uTip + uDirection * lift;
  vec2 normal = vec2(-uDirection.y, uDirection.x);
  vec2 p = vWorld - tip;
  float along = dot(p, uDirection);
  float side = dot(p, normal);
  float across = abs(side);
  float holder = step(0.5, uTool) * step(uTool, 1.5);
  float knife = step(1.5, uTool);
  float taper = mix(TAPER, 380.0, max(holder, knife));
  float t = clamp(along / taper, 0.0, 1.0);
  float tipRadius = mix(mix(3.0, 30.0, holder), 1.2, knife);
  float baseRadius = mix(mix(36.0, 48.0, holder), 30.0, knife);
  float radius = mix(tipRadius, baseRadius, 1.0 - pow(1.0 - t, mix(2.4, 1.2, knife)));
  float pixel = uView.y / uResolution.y;
  float blur = pixel * 1.1 + max(along + lift, 0.0) * 0.016;
  if (along < -blur * 3.0 || across > radius + blur * 3.0 || along > LENGTH) discard;
  float wall = mix(max(1.1, radius * 0.2), radius, knife);
  float inner = radius - wall;
  float outerCover = 1.0 - smoothstep(radius - blur, radius + blur, across);
  float innerCover = 1.0 - smoothstep(inner - blur, inner + blur, max(across, 0.0));
  outerCover *= smoothstep(-blur * 2.0, blur, along);
  innerCover *= smoothstep(-blur, blur * 2.0, along);
  float focus = 1.0 / (1.0 + blur / (pixel * 4.0));
  float spread = blur * 1.2 + 0.7;
  vec3 fringe = vec3(
    band(across - radius - blur * 0.7, spread),
    band(across - radius, spread),
    band(across - radius + blur * 0.7, spread)
  );
  float rimInner = band(across - inner, spread) * step(0.5, inner);
  float streak = band(side - radius * 0.42, radius * 0.1 + blur) * innerCover;
  float fill = smoothstep(0.25, 0.8, uProgress);
  float top = LENGTH * 0.55;
  float level = uGift > 0.5 ? mix(top, -6.0, fill) : mix(-6.0, top, fill);
  float curve = across * across / (inner + 1.0) * 0.4;
  float meniscus = level + (uGift > 0.5 ? curve : -curve);
  float liquid = uGift > 0.5
    ? smoothstep(meniscus - blur, meniscus + blur, along)
    : 1.0 - smoothstep(meniscus - blur, meniscus + blur, along);
  liquid *= (1.0 - max(holder, knife)) * innerCover * smoothstep(0.18, 0.26, uProgress) * (1.0 - smoothstep(0.9, 0.98, uProgress));
  float meniscusLine = band(along - meniscus, 1.4 + blur) * innerCover * step(0.2, uProgress);
  vec2 uv = gl_FragCoord.xy / uResolution;
  float bend = across / max(radius, 1.0);
  vec2 shift = normal * sign(side) * bend * bend * radius * 0.7 / uView;
  vec3 behind = texture(uBackground, uv - shift).rgb;
  vec3 glass = vec3(0.78, 0.9, 1.0);
  vec3 col = behind * 0.6 * outerCover + vec3(0.015, 0.022, 0.026) * (outerCover - innerCover);
  col += fringe * glass * 0.6 * focus + glass * rimInner * 0.22 * focus;
  col += vec3(0.92, 0.98, 1.0) * streak * 0.16 * focus;
  col = mix(col, uFluid * 0.38 + behind * 0.35, liquid * 0.7);
  col += (uFluid * 0.35 + glass * 0.25) * meniscusLine;
  float touch = band(length(p), 7.0 + blur * 2.0) * smoothstep(0.18, 0.3, uProgress) * (1.0 - smoothstep(0.8, 0.95, uProgress));
  col += vec3(0.85, 1.0, 1.0) * touch * 0.4;
  float alpha = clamp(outerCover * 0.5 + fringe.g * 0.45 * focus + liquid * 0.3 + touch * 0.3, 0.0, 1.0);
  alpha *= 1.0 - smoothstep(LENGTH * 0.7, LENGTH, along);
  outColor = vec4(col, alpha * plunge);
}`;
