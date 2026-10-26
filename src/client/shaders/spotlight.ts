export const spotFragment = `#version 300 es
precision highp float;
in vec2 vWorld;
out vec4 outColor;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uPhase;
uniform float uProgress;
uniform float uTime;

void main() {
  float d = distance(vWorld, uCenter) / uRadius;
  float focus = abs(uPhase - 1.0) < 0.5 ? uProgress : 0.0;
  float strike = abs(uPhase - 2.0) < 0.5 ? 1.0 - uProgress : 0.0;
  float fade = abs(uPhase - 3.0) < 0.5 ? 1.0 - uProgress : 1.0;
  float pool = smoothstep(1.0, mix(0.55, 0.85, focus), d);
  float iris = exp(-pow((d - mix(1.0, 0.92, focus)) / 0.03, 2.0)) * (0.3 + focus * 0.8);
  float flicker = 0.92 + 0.08 * sin(uTime * 23.0) * sin(uTime * 7.0);
  float light = (pool * (0.16 + 0.3 * focus) + iris * 0.25 + strike * pool * 0.6) * fade * flicker;
  if (light < 0.002) discard;
  outColor = vec4(vec3(1.0, 0.96, 0.86) * light, light);
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
  float t = clamp(along / TAPER, 0.0, 1.0);
  float radius = mix(3.0, 36.0, 1.0 - pow(1.0 - t, 2.4));
  float pixel = uView.y / uResolution.y;
  float blur = pixel * 1.1 + max(along + lift, 0.0) * 0.016;
  if (along < -blur * 3.0 || across > radius + blur * 3.0 || along > LENGTH) discard;
  float wall = max(1.1, radius * 0.2);
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
  liquid *= innerCover * smoothstep(0.18, 0.26, uProgress) * (1.0 - smoothstep(0.9, 0.98, uProgress));
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
