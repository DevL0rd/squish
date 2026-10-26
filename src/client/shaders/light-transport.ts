export const lightTransport = `
const float SHADOW_LENGTH = 140.0;

vec2 toUv(vec2 world) {
  return (world - uCamera) / uView + 0.5;
}

vec4 sampleOccluder(vec2 world) {
  return texture(uOccluder, toUv(world));
}

vec4 softOccluder(vec2 world, float spread) {
  return 0.25 * (sampleOccluder(world + vec2(spread, 0.0)) + sampleOccluder(world - vec2(spread, 0.0))
    + sampleOccluder(world + vec2(0.0, spread)) + sampleOccluder(world - vec2(0.0, spread)));
}

vec3 transmit(vec2 world, vec2 light, float stopAt) {
  if (uSteps <= 0) return vec3(1.0);
  vec2 toward = light - world;
  float span = min(length(toward) - stopAt, SHADOW_LENGTH);
  if (span <= 0.0) return vec3(1.0);
  vec2 dir = normalize(toward);
  int steps = uSteps * 2;
  float stride = span / float(steps);
  vec3 through = vec3(1.0);
  bool clear = sampleOccluder(world).a < 0.5;
  for (int k = 1; k <= 16; k++) {
    if (k > steps) break;
    vec2 p = world + dir * stride * float(k);
    vec4 hit = softOccluder(p, 3.0 + stride * float(k) * 0.06);
    if (!clear) {
      clear = hit.a < 0.5;
      continue;
    }
    if (hit.a < 0.02) continue;
    vec3 tint = hit.rgb / max(hit.a, 1e-3);
    through *= mix(vec3(1.0), tint * 0.85, hit.a * 0.75 / float(steps) * 4.0);
  }
  return through;
}
`;
