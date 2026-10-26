export const bossNematode = `
float pharynx(Sample s, float head, out float grinder) {
  float pump = 0.5 + 0.5 * sin(uTime * 14.0);
  vec2 q = vec2((s.u - head) * s.total / s.r, s.v);
  float radius = 0.44 + 0.07 * pump;
  float d = length(q / vec2(1.25, 1.0)) / radius;
  grinder = smoothstep(0.45, 0.15, d) * (0.5 + 0.5 * sin(atan(q.y, q.x) * 3.0 + uTime * 14.0));
  float corpus = smoothstep(0.26, 0.17, abs(s.v)) * step(s.u, head) * smoothstep(0.004, 0.02, s.u);
  return max(smoothstep(1.0, 0.85, d), corpus * 0.85);
}

float eggs(Sample s, out float shell, out float embryo) {
  float zone = smoothstep(0.38, 0.42, s.u) * smoothstep(0.66, 0.62, s.u);
  float pitch = s.r * 1.3;
  float id = floor(s.along / pitch);
  vec2 q = vec2((fract(s.along / pitch) - 0.5) * 1.3, s.v + (hash21(vec2(id, 1.0)) - 0.5) * 0.35);
  float d = length(q / vec2(0.55, 0.38));
  float present = zone * step(0.25, hash21(vec2(id, 3.0)));
  shell = ring(d, 0.94, 0.05) * present;
  float cells = cellular(q * (4.0 + floor(hash21(vec2(id, 5.0)) * 3.0)) + id * 7.0 + uTime * 0.02);
  embryo = smoothstep(0.05, 0.0, cells - 0.18) * smoothstep(0.9, 0.7, d) * present;
  return smoothstep(1.0, 0.9, d) * present;
}

vec4 nematode(Sample s) {
  float inside = body(s);
  float head = 0.11;
  float grinder;
  float pharyngeal = pharynx(s, head, grinder);
  float annuli = smoothstep(0.7, 1.0, sin(s.along * 1.3)) * 0.5;
  float alae = smoothstep(0.06, 0.0, abs(abs(s.v) - 0.8));
  float drift = sin(s.along * 0.01) * 0.06;
  float squeeze = sin(s.along * 0.02 - uTime * 2.2) * 0.08;
  float width = 0.44 + squeeze;
  float tube = smoothstep(head + 0.02, head + 0.045, s.u) * smoothstep(0.95, 0.92, s.u);
  float gut = smoothstep(width, width - 0.08, abs(s.v + drift)) * tube;
  float lumen = smoothstep(0.09, 0.02, abs(s.v + drift)) * gut;
  vec2 flow = vec2(s.along * 0.085 - uTime * 0.35, s.v * 6.0);
  float sharp = granules(flow, 0.6, 0.3) * gut;
  float deep = granules(flow * 0.45 + 7.0, 0.5, 0.5) * gut;
  float shell;
  float embryo;
  float egg = eggs(s, shell, embryo);
  float muscle = smoothstep(0.55, 0.95, abs(s.v)) * (0.5 + 0.5 * sin(s.along * 0.012 - uTime * 3.0));
  vec3 tissue = vec3(0.64, 0.62, 0.52);
  tissue = mix(tissue, vec3(0.44, 0.35, 0.21) + sharp * vec3(0.45, 0.4, 0.26) + deep * 0.12, gut * 0.85);
  tissue = mix(tissue, vec3(0.12, 0.1, 0.07), lumen * 0.6);
  tissue = mix(tissue, vec3(0.7, 0.68, 0.58) * (0.75 + 0.35 * grinder), pharyngeal);
  tissue = mix(tissue, vec3(0.58, 0.6, 0.52) - embryo * 0.3, egg * 0.6);
  tissue += shell * 0.3 - annuli * 0.05 - alae * 0.06 - muscle * 0.04;
  float density = 0.32 + gut * 0.38 + pharyngeal * 0.4 + egg * 0.12;
  vec3 col = compose(s, tissue, density);
  col += vec3(1.0, 0.95, 0.78) * sharp * 0.22;
  float mouth = smoothstep(0.02, 0.0, s.u) * smoothstep(0.45, 0.1, abs(s.v));
  col = mix(col, vec3(0.05, 0.04, 0.03), mouth);
  return vec4(col, inside * (0.6 + 0.24 * thickness(s)));
}
`;
