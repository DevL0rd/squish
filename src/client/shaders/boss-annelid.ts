export const bossAnnelid = `
float chaetae(Sample s, float segment) {
  float outside = step(0.0, s.d);
  float reach = smoothstep(s.r * 0.9, 0.0, s.d);
  float sway = sin(uTime * 3.0 + floor(s.along / 46.0)) * 0.12;
  float slant = abs(segment - 0.5 - s.d * (0.006 + sway * 0.01));
  return outside * reach * smoothstep(0.05, 0.0, slant);
}

vec4 oligochaete(Sample s) {
  float inside = body(s);
  float segment = fract(s.along / 46.0);
  float septum = smoothstep(0.05, 0.0, abs(segment - 0.5)) * inside;
  float pulse = 0.5 + 0.5 * sin(s.along * 0.03 + uTime * 4.0);
  float vessel = smoothstep(0.1, 0.03, abs(s.v - 0.32)) * pulse;
  float gut = smoothstep(0.42, 0.3, abs(s.v + 0.05)) * step(0.06, s.u);
  float squeeze = sin(s.along * 0.05 - uTime * 2.0);
  float sediment = granules(vec2(s.along * 0.07 - uTime * 0.5 + squeeze * 0.2, s.v * 5.0), 0.55, 0.38) * gut;
  float droplets = granules(vec2(s.along * 0.05, s.v * 4.0 + 13.0), 0.3, 0.28) * smoothstep(0.4, 0.75, abs(s.v));
  float lobe = smoothstep(0.06, 0.0, s.u);
  vec3 tissue = vec3(0.74, 0.6, 0.55);
  tissue = mix(tissue, vec3(0.3, 0.24, 0.17) + sediment * vec3(0.35, 0.3, 0.2), gut * 0.75);
  tissue = mix(tissue, vec3(0.78, 0.1, 0.08), vessel * 0.85);
  tissue = mix(tissue, vec3(0.98, 0.55, 0.15), droplets * 0.8);
  tissue -= septum * 0.12;
  float density = 0.32 + gut * 0.35 + vessel * 0.3 + droplets * 0.3;
  vec3 col = compose(s, tissue, density);
  float beat = 0.5 + 0.5 * sin(atan(s.v, s.u) * 30.0 - uTime * 20.0);
  float cilia = step(0.0, s.d) * smoothstep(s.r * 0.3, 0.0, s.d) * lobe * beat;
  float hairs = chaetae(s, segment);
  vec3 bristle = vec3(0.85, 0.82, 0.7);
  return vec4(mix(bristle, col, inside), max(inside * (0.58 + 0.24 * thickness(s)), max(hairs * 0.75, cilia * 0.4)));
}

vec4 slime(Sample s) {
  float inside = body(s);
  float sheen = fbm(vec2(s.along * 0.02, s.v * 2.0 + uTime * 0.05)) * 0.3;
  vec3 col = mix(behind(s, 0.6), vec3(0.6, 0.76, 0.66), 0.25) + sheen * 0.3;
  return vec4(col, inside * (0.2 + sheen * 0.2));
}
`;
