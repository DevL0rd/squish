import { noise } from './noise.ts';

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
  vec4 sum = texture(uSource, vUv) * 0.227027;
  sum += texture(uSource, vUv + uDirection * 1.384615) * 0.316216;
  sum += texture(uSource, vUv - uDirection * 1.384615) * 0.316216;
  sum += texture(uSource, vUv + uDirection * 3.230769) * 0.070270;
  sum += texture(uSource, vUv - uDirection * 3.230769) * 0.070270;
  outColor = sum;
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

export const shiftFragment = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSource;
uniform vec2 uOffset;
void main() {
  vec2 uv = vUv + uOffset;
  bool inside = all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
  outColor = inside ? texture(uSource, uv) : vec4(0.0);
}`;

export const composite = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uResolution;
uniform float uTime;
uniform float uBloomStrength;
uniform float uGrain;
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
  vec3 col = scene + bloom * 0.55 * uBloomStrength;
  col = aces(col * 1.5);
  float vig = smoothstep(1.25, 0.3, length(centered * 0.86));
  col *= mix(0.64, 1.0, vig);
  float grain = hash21(gl_FragCoord.xy + fract(uTime) * 173.0) - 0.5;
  col += grain * 0.026 * uGrain;
  col = pow(col, vec3(0.94));
  outColor = vec4(col, 1.0);
}`;
