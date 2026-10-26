export const bossMold = `
vec4 physarum(Sample s) {
  float inside = body(s);
  float flow = uProgress > 0.5 ? 1.0 : -1.0;
  float core = smoothstep(0.55, 0.15, abs(s.v));
  float pulse = 0.5 + 0.5 * sin(s.along * 0.05 - flow * uTime * 3.2);
  float stream = granules(vec2(s.along * 0.06 - flow * uTime * (1.2 + core * 2.4), s.v * 5.0), 0.6, 0.32) * core;
  float wall = smoothstep(0.55, 0.9, abs(s.v));
  float fan = smoothstep(0.86, 0.98, s.u);
  float lace = smoothstep(0.07, 0.0, abs(cellular(vec2(s.along * 0.04, s.v * 3.0) + uTime * 0.03) - 0.32));
  vec3 tissue = vec3(0.93, 0.74, 0.16) * (0.55 + 0.35 * pulse);
  tissue = mix(tissue, vec3(0.7, 0.5, 0.08), wall * 0.6);
  tissue += vec3(1.0, 0.9, 0.5) * stream * 0.35;
  tissue = mix(tissue, vec3(0.98, 0.86, 0.35), fan * lace * 0.8);
  float density = 0.55 + core * 0.25 + wall * 0.15 - fan * (1.0 - lace) * 0.3;
  vec3 col = compose(s, tissue, density);
  return vec4(col, inside * mix(0.88, 0.5 + lace * 0.4, fan));
}
`;
