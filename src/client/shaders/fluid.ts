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
