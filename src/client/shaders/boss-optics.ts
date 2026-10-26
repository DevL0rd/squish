export const bossOptics = `
float relief(Sample s) {
  vec2 gradient = vec2(dFdx(s.d), dFdy(s.d));
  return dot(normalize(gradient + 1e-6), SHEAR);
}

float body(Sample s) {
  return smoothstep(s.pixel * 1.2, -s.pixel * 1.2, s.d);
}

float thickness(Sample s) {
  return sqrt(max(0.0, 1.0 - s.v * s.v));
}

vec3 behind(Sample s, float strength) {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 bend = s.side * s.v * min(s.r, 70.0) * strength / uView;
  return texture(uBackground, uv - bend).rgb;
}

float granules(vec2 q, float density, float size) {
  vec2 cell = floor(q);
  vec2 local = fract(q);
  float best = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 id = cell + offset;
      float present = step(hash21(id + 3.7), density);
      float d = length(local - offset - 0.15 - 0.7 * hash22(id));
      best = max(best, smoothstep(size, size * 0.35, d) * present);
    }
  }
  return best;
}

float ring(float d, float radius, float width) {
  return exp(-pow((d - radius) / width, 2.0));
}

vec3 compose(Sample s, vec3 tissue, float density) {
  float t = thickness(s);
  vec3 back = behind(s, 0.4) * vec3(0.92, 1.0, 0.96);
  vec3 col = mix(back, tissue, clamp(density * (0.22 + 0.5 * t), 0.0, 0.9));
  col += vec3(0.9, 0.97, 1.0) * max(relief(s), 0.0) * 0.16 * (1.0 - t);
  return col;
}
`;
