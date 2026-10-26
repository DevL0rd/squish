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
