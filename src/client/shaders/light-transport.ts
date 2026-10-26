export const lightTransport = `
vec2 toUv(vec2 world) {
  return (world - uCamera) / uView + 0.5;
}

vec4 sampleOccluder(vec2 world) {
  return texture(uOccluder, toUv(world));
}

float lens(vec2 world, float spacing) {
  float centerAlpha = sampleOccluder(world).a;
  float around = sampleOccluder(world + vec2(spacing, 0.0)).a + sampleOccluder(world - vec2(spacing, 0.0)).a
    + sampleOccluder(world + vec2(0.0, spacing)).a + sampleOccluder(world - vec2(0.0, spacing)).a;
  return max(0.0, centerAlpha - around * 0.25);
}

vec3 transmit(vec2 world, vec2 light, float stopAt) {
  if (uSteps <= 0) return vec3(1.0);
  vec3 through = vec3(1.0);
  float focus = 0.0;
  bool clear = sampleOccluder(world).a < 0.5;
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  for (int k = 1; k <= 8; k++) {
    if (k > uSteps) break;
    vec2 p = mix(world, light, (float(k) - jitter) / float(uSteps));
    if (distance(p, light) < stopAt) break;
    vec4 hit = sampleOccluder(p);
    if (!clear) {
      clear = hit.a < 0.5;
      continue;
    }
    if (hit.a < 0.02) continue;
    vec3 tint = hit.rgb / max(hit.a, 1e-3);
    through *= mix(vec3(1.0), tint * 0.85, hit.a * 0.75);
    focus = max(focus, lens(p, 18.0));
  }
  return through * (1.0 + focus * 2.5);
}
`;
