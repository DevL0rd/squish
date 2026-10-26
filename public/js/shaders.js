const noise = `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = rot * p * 2.03 + 11.7;
    a *= 0.5;
  }
  return v;
}
`;

export const quadVertex = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const fluidAdvect = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uDt;
uniform float uDissipation;

void main() {
  vec2 velocity = texture(uVelocity, vUv).xy;
  vec2 coord = vUv - velocity * uDt * uTexel;
  coord = clamp(coord, uTexel * 0.5, vec2(1.0) - uTexel * 0.5);
  outColor = texture(uSource, coord) * uDissipation;
}`;

export const fluidDivergence = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVelocity;
uniform vec2 uTexel;

void main() {
  vec2 left = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).xy;
  vec2 right = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).xy;
  vec2 bottom = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).xy;
  vec2 top = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).xy;
  float divergence = 0.5 * (right.x - left.x + top.y - bottom.y);
  outColor = vec4(divergence, 0.0, 0.0, 1.0);
}`;

export const fluidPressure = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;

void main() {
  float left = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float right = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float bottom = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float top = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float divergence = texture(uDivergence, vUv).x;
  outColor = vec4((left + right + bottom + top - divergence) * 0.25, 0.0, 0.0, 1.0);
}`;

export const fluidGradient = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexel;

void main() {
  float left = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float right = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float bottom = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float top = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity -= 0.5 * vec2(right - left, top - bottom);
  outColor = vec4(velocity, 0.0, 1.0);
}`;

export const fluidSplat = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform int uCount;
uniform int uMode;
uniform vec4 uSplats[28];
uniform vec2 uSplatVelocity[28];
uniform vec3 uSplatColor[28];

void main() {
  vec4 contribution = vec4(0.0);
  for (int i = 0; i < 28; i++) {
    if (i >= uCount) break;
    vec4 splat = uSplats[i];
    vec2 delta = vUv - splat.xy;
    float dist = dot(delta, delta) / max(splat.z * splat.z, 0.000001);
    float falloff = exp(-dist * 2.2) * splat.w;
    if (falloff < 0.0001) continue;
    if (uMode == 0) {
      contribution.xy += uSplatVelocity[i] * falloff;
    } else {
      contribution.rgb += uSplatColor[i] * falloff;
    }
  }
  outColor = contribution;
}`;

export const background = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uCamera;
uniform vec2 uView;
uniform float uTime;
uniform float uWorld;
uniform sampler2D uDye;
uniform sampler2D uVelocity;
uniform int uLightCount;
uniform vec2 uLightPos[16];
uniform vec3 uLightColor[16];
uniform float uLightRadius[16];
uniform float uLightIntensity[16];
${noise}

void main() {
  vec2 world = uCamera + (vUv - 0.5) * uView;
  vec2 p = world / uWorld;
  vec2 flow = texture(uVelocity, p).xy * 0.0035;
  float t = uTime;
  float fogA = fbm(world * 0.00135 + vec2(t * 0.004, -t * 0.003) + flow);
  float fogB = fbm(world * 0.0048 + vec2(-t * 0.009, t * 0.006) - flow * 1.7);
  float fogC = fbm(world * 0.017 + vec2(t * 0.02, t * 0.013) + flow * 3.0);
  float depth = smoothstep(0.18, 0.9, fogA);
  vec3 col = vec3(0.0025, 0.007, 0.008);
  col += vec3(0.008, 0.024, 0.022) * depth * 0.72;
  col += vec3(0.012, 0.036, 0.032) * pow(fogB, 2.2) * 0.68;
  col += vec3(0.024, 0.05, 0.043) * pow(fogC, 3.0) * 0.3;
  float caustic = pow(max(0.0, sin(world.x * 0.0052 + fogB * 8.0 + t * 0.16) * sin(world.y * 0.0061 - fogA * 9.0 - t * 0.12)), 14.0);
  float caustic2 = pow(max(0.0, sin(world.x * 0.011 - fogC * 7.0 - t * 0.1) * sin(world.y * 0.009 + fogB * 6.0 + t * 0.09)), 9.0);
  col += vec3(0.05, 0.13, 0.1) * (caustic * 0.55 + caustic2 * 0.22);
  float shaft = smoothstep(0.65, 1.0, vUv.x) * smoothstep(0.95, 0.2, vUv.y) * 0.08;
  col += vec3(0.03, 0.07, 0.06) * shaft * (0.5 + fogB);
  float micro = fbm(world * 0.041 + vec2(t * 0.018, -t * 0.014));
  float micro2 = fbm(world * 0.087 - vec2(t * 0.03, t * 0.021));
  col += vec3(0.03, 0.065, 0.055) * pow(micro, 3.0) * 0.8;
  col += vec3(0.018, 0.045, 0.038) * pow(micro2, 4.0) * 0.9;
  vec4 dye = texture(uDye, p);
  vec3 dyeCol = dye.rgb;
  float density = dot(dyeCol, vec3(0.35, 0.5, 0.3));
  vec3 transmittance = exp(-dyeCol * 0.82);
  col *= mix(vec3(1.0), transmittance, 0.75);
  col += dyeCol * 0.12 + dyeCol * dyeCol * 0.075;
  col += vec3(0.02, 0.05, 0.045) * density * 0.08;
  float glow = exp(-dot(vUv - vec2(0.72, 0.58), vUv - vec2(0.72, 0.58)) * 4.5);
  col += vec3(0.008, 0.02, 0.018) * glow;
  for (int i = 0; i < 16; i++) {
    if (i >= uLightCount) break;
    vec2 delta = world - uLightPos[i];
    float radius = max(uLightRadius[i], 1.0);
    float falloff = exp(-dot(delta, delta) / (radius * radius) * 1.7);
    col += uLightColor[i] * falloff * uLightIntensity[i] * 0.075;
  }
  outColor = vec4(col, 1.0);
}`;

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
  float fres = pow(1.0 - dome, 2.6);
  vec3 skyRefl = bg * 0.85 + vec3(0.05, 0.07, 0.065);
  col += skyRefl * fres * 0.17;
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

export const foodVertex = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aBody;
layout(location = 2) in vec4 aTint;
uniform vec2 uCamera;
uniform vec2 uView;
out vec2 vLocal;
out vec4 vTint;
out float vPhase;
void main() {
  vLocal = aCorner;
  vTint = aTint;
  vPhase = aBody.w;
  vec2 world = aBody.xy + aCorner * aBody.z;
  vec2 clip = (world - uCamera) / (uView * 0.5);
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

export const foodFragment = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec4 vTint;
in float vPhase;
out vec4 outColor;
uniform float uTime;
${noise}

void main() {
  vec2 p = vLocal;
  float seed = vPhase;
  float rotation = seed * 1.71;
  mat2 rotate = mat2(cos(rotation), -sin(rotation), sin(rotation), cos(rotation));
  vec2 q = rotate * p;
  float elongation = 0.72 + 0.62 * fract(seed * 0.618 + 0.17);
  q.x /= elongation;
  float d = length(q);
  float angle = atan(q.y, q.x);
  float grain = fbm(q * 4.6 + seed * 7.0);
  float fine = fbm(q * 10.0 - seed * 3.0 + uTime * 0.025);
  float shape = 0.48 + 0.06 * sin(angle * 3.0 + seed * 9.0) + 0.035 * sin(angle * 5.0 - seed * 4.0) + (grain - 0.5) * 0.11;
  float body = smoothstep(shape, shape - 0.06, d);
  float rim = smoothstep(shape - 0.13, shape, d) * (1.0 - smoothstep(shape, shape + 0.025, d));
  float core = smoothstep(shape * 0.5, 0.0, d);
  float glow = exp(-d * d * 4.0) * (0.55 + 0.45 * grain);
  vec3 col = vTint.rgb * (0.15 + 0.42 * grain + 0.4 * core) * body;
  col += vTint.rgb * rim * 0.5;
  col += vTint.rgb * glow * 0.13;
  col += vec3(0.72, 0.9, 0.82) * smoothstep(0.11, 0.0, length(q - vec2(-0.08, 0.06))) * 0.18;
  col *= 0.9 + 0.1 * sin(uTime * 1.2 + seed * 6.0);
  float alpha = clamp(body * 0.72 + rim * 0.45 + glow * 0.16 + fine * 0.05, 0.0, 0.94) * vTint.a;
  outColor = vec4(col, alpha);
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
  vec2 normal = vLocal;
  vec2 refract = vec2(0.0);
  vec3 bg;
  bg.r = texture(uBackground, clamp(screenUv + refract * 1.03, vec2(0.0), vec2(1.0))).r;
  bg.g = texture(uBackground, clamp(screenUv + refract, vec2(0.0), vec2(1.0))).g;
  bg.b = texture(uBackground, clamp(screenUv + refract * 0.97, vec2(0.0), vec2(1.0))).b;
  float rim = smoothstep(0.72, 0.96, d) * (1.0 - smoothstep(0.97, 1.0, d));
  float innerRim = smoothstep(0.68, 0.78, d) * (1.0 - smoothstep(0.8, 0.9, d));
  float highlight = smoothstep(0.24, 0.0, length(vLocal - vec2(-0.32, 0.38)));
  vec3 col = bg * 1.04;
  col += vec3(0.35, 0.6, 0.54) * rim * 0.55;
  col += vec3(0.12, 0.24, 0.21) * innerRim * 0.4;
  col += vec3(0.85, 0.95, 0.9) * highlight * 0.55;
  float alpha = rim * 0.55 + innerRim * 0.12 + highlight * 0.35 + 0.035;
  outColor = vec4(col, clamp(alpha, 0.0, 0.85));
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
    vec3 col = base * (0.5 + n * 0.8);
    col += base * smoothstep(0.78, 0.95, d) * 0.6;
    outColor = vec4(col, body * focus * 0.5);
  } else {
    float bokeh = smoothstep(0.92, 0.65, d);
    float ring = smoothstep(0.5, 0.78, d) * (1.0 - smoothstep(0.8, 0.98, d));
    vec3 col = base * (bokeh * 0.25 + ring * 0.55);
    outColor = vec4(col, (bokeh * 0.16 + ring * 0.26) * 0.8);
  }
}`;

export const fieldFragment = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVelocity;
void main() {
  vec2 velocity = texture(uVelocity, vUv).xy;
  vec2 encoded = clamp(velocity * 0.004 + 0.5, 0.0, 1.0);
  outColor = vec4(encoded, 0.0, 1.0);
}`;

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

export const creatureVertex = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aBody;
layout(location = 2) in vec4 aTint;
layout(location = 3) in vec4 aMotion;
uniform vec2 uCamera;
uniform vec2 uView;
out vec2 vLocal;
out vec4 vTint;
out vec4 vBody;
out float vPhase;
void main() {
  float angle = aTint.a;
  float c = cos(-angle);
  float s = sin(-angle);
  vec2 corner = vec2(aCorner.x * c - aCorner.y * s, aCorner.x * s + aCorner.y * c);
  vec2 world = aBody.xy + corner * aBody.z;
  vec2 clip = (world - uCamera) / (uView * 0.5);
  gl_Position = vec4(clip, 0.0, 1.0);
  vLocal = corner;
  vTint = aTint;
  vBody = aBody;
  vPhase = aMotion.x;
}`;

export const creatureFragment = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec4 vTint;
in vec4 vBody;
in float vPhase;
out vec4 outColor;

void main() {
  float kind = vBody.w;
  vec2 p = vLocal;
  float r = length(p);
  float angle = atan(p.y, p.x);
  float body = 0.0;
  float detail = 0.0;
  float fringe = 0.0;
  vec3 tint = vTint.rgb;
  if (kind < 0.5) {
    vec2 q = vec2(p.x, p.y / 0.62);
    float d = length(q);
    body = smoothstep(1.0, 0.9, d);
    float beat = sin(angle * 26.0 + vPhase * 6.0) * 0.5 + 0.5;
    fringe = smoothstep(1.12, 0.98, d) * (1.0 - smoothstep(0.98, 0.92, d)) * beat;
    detail = smoothstep(0.5, 0.0, length(p - vec2(0.24, -0.12))) * 0.55;
    tint *= 0.8 + 0.2 * beat;
  } else if (kind < 1.5) {
    float taper = 1.0 - 0.42 * smoothstep(-0.9, 0.9, p.x);
    float d = length(vec2(p.x, p.y / max(taper, 0.2)));
    body = smoothstep(1.0, 0.86, d);
    float tail = 1.0 - smoothstep(0.0, 0.06, abs(p.y - sin((p.x + 1.2) * 7.0 + vPhase * 5.0) * 0.16));
    fringe = tail * step(0.9, p.x) * (1.0 - step(2.2, p.x));
    detail = smoothstep(0.16, 0.0, length(p - vec2(-0.55, 0.16))) * 0.8;
    tint *= 0.85 + 0.15 * sin(vPhase * 2.0);
  } else if (kind < 2.5) {
    body = smoothstep(1.0, 0.92, r);
    detail = 0.35 * (0.5 + 0.5 * sin(angle * 14.0 + vPhase * 0.6));
    fringe = smoothstep(1.0, 0.86, r) * (1.0 - smoothstep(0.86, 0.74, r)) * 0.7;
    detail += smoothstep(0.28, 0.0, r) * 0.5;
  } else if (kind < 4.5) {
    vec2 q = vec2(p.x / 1.15, p.y / 0.52);
    float d = length(q);
    body = smoothstep(1.0, 0.86, d);
    float capsule = smoothstep(0.42, 0.8, abs(p.x)) * (1.0 - smoothstep(0.86, 1.0, abs(p.x)));
    detail = capsule * 0.35;
    float wave = sin((p.x - 0.9) * 9.0 - vPhase * 7.0) * 0.1;
    float tail = 1.0 - smoothstep(0.0, 0.05, abs(p.y - wave));
    fringe = tail * step(0.95, p.x) * (1.0 - step(2.1, p.x));
    body = max(body, smoothstep(1.0, 0.8, length(vec2(p.x, p.y / 0.9))) * 0.0);
  } else if (kind < 5.5) {
    body = smoothstep(1.0, 0.82, r);
    detail = smoothstep(0.55, 0.0, r) * 0.5;
    fringe = smoothstep(1.0, 0.9, r) * (1.0 - smoothstep(0.9, 0.8, r)) * 0.6;
  } else {
    vec2 q = vec2(p.x, (p.y - 0.12) / 0.85);
    float d = length(q);
    body = smoothstep(1.0, 0.9, d);
    float corona = smoothstep(1.02, 0.86, d) * (1.0 - smoothstep(0.86, 0.7, d));
    float spin = 0.5 + 0.5 * sin(angle * 18.0 - vPhase * 8.0);
    fringe = corona * spin;
    float foot = 1.0 - smoothstep(0.05, 0.11, abs(p.y + 0.72)) * step(-0.2, p.x) * step(p.x, 0.2) * step(0.6, p.y);
    body = max(body, foot);
    detail = smoothstep(0.3, 0.0, length(p - vec2(0.0, 0.1))) * 0.4;
  }
  if (body <= 0.001 && fringe <= 0.001) discard;
  vec3 col = tint * (0.34 + 0.62 * body) + tint * detail * 0.65;
  col += vec3(0.4, 0.56, 0.5) * fringe * 1.1;
  col += vec3(0.55, 0.66, 0.6) * smoothstep(1.0, 0.9, r) * (1.0 - smoothstep(0.9, 0.78, r)) * 0.18;
  float alpha = max(body * 0.55, fringe * 0.55) * smoothstep(1.08, 0.92, max(r, body));
  outColor = vec4(col, clamp(alpha, 0.0, 0.92));
}`;

export const brightPass = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform vec2 uTexel;

void main() {
  vec3 sum = vec3(0.0);
  sum += texture(uScene, vUv + vec2(-uTexel.x, -uTexel.y)).rgb;
  sum += texture(uScene, vUv + vec2(0.0, -uTexel.y)).rgb;
  sum += texture(uScene, vUv + vec2(uTexel.x, -uTexel.y)).rgb;
  sum += texture(uScene, vUv + vec2(-uTexel.x, 0.0)).rgb;
  sum += texture(uScene, vUv).rgb * 2.0;
  sum += texture(uScene, vUv + vec2(uTexel.x, 0.0)).rgb;
  sum += texture(uScene, vUv + vec2(-uTexel.x, uTexel.y)).rgb;
  sum += texture(uScene, vUv + vec2(0.0, uTexel.y)).rgb;
  sum += texture(uScene, vUv + vec2(uTexel.x, uTexel.y)).rgb;
  vec3 color = sum / 10.0;
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color *= smoothstep(0.55, 1.25, luma);
  outColor = vec4(color, 1.0);
}`;

export const blurPass = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSource;
uniform vec2 uDirection;

void main() {
  vec3 sum = texture(uSource, vUv).rgb * 0.227027;
  sum += texture(uSource, vUv + uDirection * 1.384615).rgb * 0.316216;
  sum += texture(uSource, vUv - uDirection * 1.384615).rgb * 0.316216;
  sum += texture(uSource, vUv + uDirection * 3.230769).rgb * 0.070270;
  sum += texture(uSource, vUv - uDirection * 3.230769).rgb * 0.070270;
  outColor = vec4(sum, 1.0);
}`;


export const blitFragment = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSource;
uniform float uAlpha;
void main() {
  vec4 color = texture(uSource, vUv);
  outColor = vec4(color.rgb, color.a * uAlpha);
}`;

export const composite = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uResolution;
uniform float uTime;
${noise}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 centered = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  float ca = 0.0022 * dot(centered, centered);
  vec3 scene;
  scene.r = texture(uScene, uv + centered * ca * 0.35).r;
  scene.g = texture(uScene, uv).g;
  scene.b = texture(uScene, uv - centered * ca * 0.35).b;
  vec3 bloom = texture(uBloom, uv).rgb;
  vec3 col = scene + bloom * 0.55;
  col = aces(col * 1.5);
  float vig = smoothstep(1.25, 0.3, length(centered * 0.86));
  col *= mix(0.64, 1.0, vig);
  float grain = hash21(gl_FragCoord.xy + fract(uTime) * 173.0) - 0.5;
  col += grain * 0.026;
  col = pow(col, vec3(0.94));
  outColor = vec4(col, 1.0);
}`;
