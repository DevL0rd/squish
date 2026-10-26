import { lightTransport } from './light-transport.ts';

export const lightsFragment = `#version 300 es
precision highp float;
in vec2 vWorld;
out vec4 outColor;
uniform sampler2D uOccluder;
uniform vec2 uCamera;
uniform vec2 uView;
uniform int uSteps;
uniform int uLightCount;
uniform vec2 uLightPos[16];
uniform vec3 uLightColor[16];
uniform float uLightRadius[16];
uniform float uLightIntensity[16];
uniform float uLightBody[16];

${lightTransport}

void main() {
  vec3 col = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= uLightCount) break;
    vec2 delta = vWorld - uLightPos[i];
    float radius = max(uLightRadius[i], 1.0);
    float falloff = exp(-dot(delta, delta) / (radius * radius) * 1.7);
    if (falloff < 0.01) continue;
    col += uLightColor[i] * falloff * uLightIntensity[i] * 0.075 * transmit(vWorld, uLightPos[i], uLightBody[i] * 1.85);
  }
  outColor = vec4(col, 0.0);
}`;
