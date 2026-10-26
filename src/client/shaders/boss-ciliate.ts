export const bossCiliate = `
float macronucleus(Sample s) {
  float pitch = s.r * 0.55;
  vec2 q = vec2(fract(s.along / pitch) - 0.5, (s.v - 0.14 * sin(s.along * 0.004)) * s.r / pitch);
  float d = length(q);
  float bead = smoothstep(0.36, 0.3, d) * 0.45 + ring(d, 0.33, 0.035);
  return bead * smoothstep(0.08, 0.12, s.u) * smoothstep(0.86, 0.8, s.u);
}

float vacuole(Sample s, out float edge) {
  float cycle = fract(uTime / 8.0);
  float size = 0.2 + 0.55 * smoothstep(0.0, 0.9, cycle) * (1.0 - smoothstep(0.92, 1.0, cycle));
  vec2 q = vec2((s.u - 0.95) * s.total / s.r, s.v);
  float d = length(q) / size;
  edge = ring(d, 1.0, 0.08);
  return smoothstep(1.0, 0.92, d);
}

vec4 spirostomum(Sample s) {
  float inside = body(s);
  float warn = abs(uState - 1.0) < 0.5 ? uProgress : 0.0;
  float coiled = abs(uState - 3.0) < 0.5 || abs(uState - 2.0) < 0.5 ? 1.0 : 0.0;
  float kinety = smoothstep(0.72, 1.0, sin(s.v * 24.0 + s.along * 0.05));
  float myoneme = coiled * smoothstep(0.5, 1.0, sin(s.along * 0.24 + s.v * 3.0));
  float bead = macronucleus(s);
  float edge;
  float bubble = vacuole(s, edge);
  float swirl = s.v > 0.0 ? 1.0 : -1.0;
  float food = granules(vec2(s.along * 0.018 + uTime * 0.18 * swirl, s.v * 3.0), 0.32, 0.32);
  float fine = granules(vec2(s.along * 0.12 - uTime * 0.4 * swirl, s.v * 9.0), 0.55, 0.24);
  float groove = smoothstep(0.1, 0.0, abs(s.v - 0.62 + s.u * 0.4)) * smoothstep(0.55, 0.42, s.u);
  vec3 tissue = vec3(0.74, 0.66, 0.5);
  tissue -= kinety * 0.05 + myoneme * 0.16 + groove * 0.12;
  tissue = mix(tissue, vec3(0.86, 0.8, 0.68), bead * 0.6);
  tissue = mix(tissue, vec3(0.32, 0.2, 0.1), food * 0.75);
  tissue += fine * 0.12;
  float density = 0.26 + bead * 0.15 + food * 0.35 - bubble * 0.2 + coiled * 0.2;
  vec3 col = compose(s, tissue, density);
  col = mix(col, behind(s, 0.9), bubble * 0.6);
  col += vec3(0.85, 0.95, 1.0) * edge * 0.35 + vec3(1.0, 0.95, 0.75) * warn * 0.22 * inside;
  float beat = 0.5 + 0.5 * sin(s.along * 0.25 - uTime * mix(9.0, 40.0, warn));
  float hair = smoothstep(0.3, 1.0, fract(s.along * 0.7 + s.d * 0.04));
  float fringe = step(0.0, s.d) * smoothstep(s.r * 0.22, 0.0, s.d) * (0.35 + 0.65 * beat) * hair;
  vec3 cilia = mix(vec3(0.82, 0.88, 0.8), vec3(1.0, 0.95, 0.7), warn);
  return vec4(mix(cilia, col, inside), max(inside * (0.6 + 0.24 * thickness(s)), fringe * (0.3 + 0.6 * warn)));
}
`;
