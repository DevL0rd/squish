import { noise } from './noise.ts';

export const cellVertex = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
uniform vec2 uCamera;
uniform vec2 uView;
uniform vec2 uCenter;
uniform float uExtent;
out vec2 vWorld;
void main() {
  vec2 world = uCenter + aCorner * uExtent;
  vec2 clip = (world - uCamera) / (uView * 0.5);
  gl_Position = vec4(clip, 0.0, 1.0);
  vWorld = world;
}`;

export const cellFragment = `#version 300 es
precision highp float;
in vec2 vWorld;
out vec4 outColor;
uniform sampler2D uBackground;
uniform sampler2D uInterior;
uniform vec2 uResolution;
uniform vec2 uView;
uniform float uRadius;
uniform vec2 uCenter;
uniform vec4 uShape[7];
uniform vec3 uColor;
uniform float uTime;
uniform float uSeed;
uniform float uOpacity;
uniform int uFoodCount;
uniform vec4 uFood[8];
uniform vec3 uFoodColor[8];
uniform int uOrganelleCount;
uniform vec4 uOrganelle[8];
uniform vec3 uOrganelleColor;
${noise}

void main() {
  vec2 offset = vWorld - uCenter;
  float dist = length(offset);
  float angle = atan(offset.y, offset.x);
  float boundary = uShape[0].x;
  for (int i = 1; i < 7; i++) {
    float k = float(i);
    boundary += uShape[i].x * cos(k * angle) + uShape[i].y * sin(k * angle);
  }
  boundary = max(boundary, 0.001);
  float r = dist / boundary;
  if (r > 1.0) discard;
  vec2 dir = dist > 0.0001 ? offset / dist : vec2(1.0, 0.0);
  float rr = min(r, 0.9995);
  vec2 local2 = dir * rr;
  float dome = sqrt(max(0.0, 1.0 - rr * rr));
  vec3 N = normalize(vec3(dir, dome * 0.58 + 0.12));
  vec2 nWarp = vec2(fbm(local2 * 2.2 + uSeed * 2.3), fbm(local2 * 2.2 - uSeed * 1.3 + 7.1));
  N.xy += (vec2(fbm(local2 * 5.5 + nWarp * 1.2 + uSeed * 4.1 + uTime * 0.03), fbm(local2 * 5.5 - nWarp * 1.2 - uSeed * 2.7 - uTime * 0.025)) - 0.5) * 0.11;
  N = normalize(N);
  vec2 screenUv = gl_FragCoord.xy / uResolution;
  vec2 refract = vec2(0.0);
  float ca = 0.0;
  vec3 bg;
  bg.r = texture(uBackground, clamp(screenUv + refract * (1.0 + ca), vec2(0.0), vec2(1.0))).r;
  bg.g = texture(uBackground, clamp(screenUv + refract, vec2(0.0), vec2(1.0))).g;
  bg.b = texture(uBackground, clamp(screenUv + refract * (1.0 - ca), vec2(0.0), vec2(1.0))).b;
  vec2 local = dir * r;
  vec2 warp = vec2(fbm(local * 1.35 + uSeed * 3.1 + uTime * 0.021), fbm(local * 1.35 - uSeed * 1.9 + 4.7 - uTime * 0.018));
  vec2 flow = vec2(fbm(local * 2.1 + warp * 1.35 + uTime * 0.045), fbm(local * 2.1 - warp * 1.35 - uTime * 0.038));
  vec2 fine = vec2(fbm(local * 4.6 + warp * 0.9 + uSeed * 5.0 - uTime * 0.09), fbm(local * 4.6 - warp * 0.9 - uSeed * 2.0 + uTime * 0.07));
  vec2 iuv = local * 0.5 + 0.5 + (flow - 0.5) * 0.1 * (0.35 + 0.65 * r) + (fine - 0.5) * 0.03;
  vec3 dye = texture(uInterior, clamp(iuv, vec2(0.015), vec2(0.985))).rgb;
  vec3 absorb = exp(-dye * vec3(1.45, 1.25, 1.05));
  vec3 transmitted = bg * mix(vec3(0.44, 0.52, 0.47), vec3(1.0), 0.22 + dome * 0.78) * absorb;
  vec3 visible = 1.0 - exp(-dye * 2.4);
  vec3 inner = visible * (0.68 + 0.32 * dome);
  vec3 col = transmitted * 0.95 + inner * 0.82;
  col += uColor * (0.012 + 0.028 * dome);
  for (int i = 0; i < 8; i++) {
    if (i >= uFoodCount) break;
    vec4 food = uFood[i];
    float fd = length((local - food.xy) / max(food.z, 0.002));
    float body = smoothstep(1.0, 0.65, fd);
    float core = smoothstep(0.55, 0.0, fd);
    float fringe = smoothstep(0.8, 1.05, fd) * (1.0 - smoothstep(1.02, 1.22, fd));
    vec3 fc = uFoodColor[i];
    col += fc * (body * 0.5 + core * 0.45 + fringe * 0.28) * food.w;
    col += vec3(0.8, 0.92, 0.84) * core * 0.16 * food.w;
  }
  for (int i = 0; i < 8; i++) {
    if (i >= uOrganelleCount) break;
    vec4 organelle = uOrganelle[i];
    float d = length(local - organelle.xy) / max(organelle.z, 0.001);
    float density = organelle.w < 0.5 ? 0.7 : (organelle.w < 1.5 ? 0.2 : 0.36);
    float body = smoothstep(1.06, 0.68, d);
    float rim = smoothstep(0.62, 0.9, d) * (1.0 - smoothstep(0.9, 1.06, d));
    vec3 deep = uOrganelleColor * (0.2 + 0.42 * (1.0 - min(d, 1.0)));
    col = mix(col, deep, body * density);
    col += uOrganelleColor * rim * density * 0.16;
  }
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 L1 = normalize(vec3(-0.55, 0.62, 0.6));
  vec3 L2 = normalize(vec3(0.5, -0.34, 0.74));
  float diffuse = max(dot(N, L1), 0.0);
  float diffuse2 = max(dot(N, L2), 0.0);
  col *= 0.72 + diffuse * 0.34 + diffuse2 * 0.1;
  float spec1 = pow(max(dot(N, normalize(L1 + V)), 0.0), 220.0);
  float spec2 = pow(max(dot(N, normalize(L2 + V)), 0.0), 74.0);
  col += vec3(1.0, 0.99, 0.95) * spec1 * 1.25;
  col += mix(uColor, vec3(1.0, 0.99, 0.97), 0.6) * spec2 * 0.35;
  vec3 puddleN = normalize(vec3(N.x * 0.6, N.y, N.z));
  float sheen = pow(max(dot(puddleN, normalize(L1 + V)), 0.0), 24.0);
  float sheen2 = pow(max(dot(puddleN, normalize(L2 + V)), 0.0), 9.0);
  float fresnel = pow(1.0 - dome, 2.6);
  vec3 skyRefl = bg * 0.85 + vec3(0.05, 0.07, 0.065);
  col += skyRefl * fresnel * 0.17;
  col += vec3(1.0, 0.995, 0.96) * sheen * 0.55;
  col += mix(uColor, vec3(1.0, 0.99, 0.97), 0.55) * sheen2 * 0.1;
  float rimBand = smoothstep(0.8, 0.965, r) * (1.0 - smoothstep(0.965, 1.0, r));
  float rimLight = pow(max(dot(normalize(vec3(dir, 0.3)), normalize(vec3(-0.55, 0.62, 0.42))), 0.0), 2.0);
  col += vec3(0.82, 0.96, 0.92) * rimBand * rimLight * 0.12;
  col *= 1.0 - smoothstep(0.88, 1.0, r) * 0.14;
  float surfaceNoise = fbm(dir * 17.0 + uSeed * 8.0 + uTime * 0.05);
  col += (surfaceNoise - 0.5) * 0.03;
  float edge = smoothstep(1.0, 0.945, r);
  float alpha = edge * 0.74 * uOpacity;
  outColor = vec4(col, alpha);
}`;
