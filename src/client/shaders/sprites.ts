import { noise } from './noise.ts';

export const haloVertex = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aHalo;
layout(location = 2) in vec4 aTint;
uniform vec2 uCamera;
uniform vec2 uView;
out vec2 vLocal;
out vec4 vTint;
void main() {
  vLocal = aCorner;
  vTint = aTint;
  vec2 world = aHalo.xy + aCorner * aHalo.z;
  vec2 clip = (world - uCamera) / (uView * 0.5);
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

export const haloFragment = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec4 vTint;
out vec4 outColor;
void main() {
  float d = length(vLocal);
  if (d > 1.0) discard;
  float glow = exp(-d * d * 4.0) * 0.16 + exp(-d * d * 18.0) * 0.12;
  vec3 col = vTint.rgb * glow * vTint.a;
  outColor = vec4(col, 1.0);
}`;

export const shadowFragment = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec4 vTint;
out vec4 outColor;
void main() {
  float d = length(vLocal);
  if (d > 1.0) discard;
  float alpha = exp(-d * d * 3.4) * 0.42;
  outColor = vec4(0.0, 0.004, 0.004, alpha);
}`;

export const bubbleVertex = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aBubble;
uniform vec2 uCamera;
uniform vec2 uView;
out vec2 vLocal;
out vec4 vBubble;
void main() {
  vLocal = aCorner;
  vBubble = aBubble;
  vec2 world = aBubble.xy + aCorner * aBubble.z;
  vec2 clip = (world - uCamera) / (uView * 0.5);
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

export const bubbleFragment = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec4 vBubble;
out vec4 outColor;
uniform sampler2D uBackground;
uniform vec2 uResolution;
uniform vec2 uView;
uniform float uTime;

void main() {
  float d = length(vLocal);
  if (d > 1.0) discard;
  vec2 screenUv = gl_FragCoord.xy / uResolution;
  float z = sqrt(max(0.0, 1.0 - d * d));
  vec2 refract = -vLocal * (1.0 - z) * vBubble.z / uView * 0.6;
  vec3 bg;
  bg.r = texture(uBackground, clamp(screenUv + refract * 1.03, vec2(0.0), vec2(1.0))).r;
  bg.g = texture(uBackground, clamp(screenUv + refract, vec2(0.0), vec2(1.0))).g;
  bg.b = texture(uBackground, clamp(screenUv + refract * 0.97, vec2(0.0), vec2(1.0))).b;
  float shade = smoothstep(0.0, 0.9, z);
  float highlight = smoothstep(0.3, 0.0, length(vLocal - vec2(-0.32, 0.38)));
  float glow = smoothstep(0.3, 0.9, -dot(vLocal, vec2(-0.6, 0.8))) * (1.0 - z);
  vec3 col = mix(bg * 0.35, bg * 1.12, shade);
  col += vec3(0.85, 0.95, 0.9) * highlight * 0.45 + vec3(0.4, 0.6, 0.56) * glow * 0.2;
  float edge = 1.0 - smoothstep(0.92, 1.0, d);
  outColor = vec4(col, clamp((0.25 + (1.0 - shade) * 0.45 + highlight * 0.3) * edge, 0.0, 0.85));
}`;

export const debrisVertex = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aDebris;
layout(location = 2) in vec4 aTint;
uniform vec2 uCamera;
uniform vec2 uView;
out vec2 vLocal;
out vec4 vDebris;
out vec4 vTint;
void main() {
  vLocal = aCorner;
  vDebris = aDebris;
  vTint = aTint;
  vec2 world = aDebris.xy + aCorner * aDebris.z;
  vec2 clip = (world - uCamera) / (uView * 0.5);
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

export const debrisFragment = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec4 vDebris;
in vec4 vTint;
out vec4 outColor;
uniform float uTime;
${noise}

void main() {
  float d = length(vLocal);
  if (d > 1.0) discard;
  float type = vDebris.w;
  float seed = vTint.a;
  vec3 base = vTint.rgb;
  if (type < 1.5) {
    float n = fbm(vLocal * 2.6 + seed * 13.0 + uTime * 0.012);
    float shape = 0.62 + n * 0.22;
    float body = smoothstep(shape, shape - 0.22, d);
    float focus = smoothstep(0.0, 0.55, 1.0 - d);
    vec2 grad = vec2(fbm((vLocal + vec2(0.04, 0.0)) * 2.6 + seed * 13.0), fbm((vLocal + vec2(0.0, 0.04)) * 2.6 + seed * 13.0)) - n;
    float z = sqrt(max(0.0, 1.0 - d * d / (shape * shape)));
    float light = dot(normalize(vLocal * (1.0 - z) - grad * 6.0 + 1e-4), vec2(-0.6, 0.8));
    vec3 col = base * (0.45 + n * 0.6) * (0.75 + 0.45 * light * (1.0 - z * 0.5));
    outColor = vec4(col, body * focus * 0.5);
  } else {
    float bokeh = smoothstep(1.0, 0.2, d);
    vec3 col = base * (0.3 + 0.25 * smoothstep(0.9, 0.0, d));
    outColor = vec4(col, bokeh * 0.22);
  }
}`;
