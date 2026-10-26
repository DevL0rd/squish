import { noise } from './noise.ts';

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
