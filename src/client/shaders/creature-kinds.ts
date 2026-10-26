export const creatureKinds = `
float sdEllipse(vec2 p, vec2 r) {
  float k = length(p / r);
  return (k - 1.0) * min(r.x, r.y);
}

float sdCapsule(vec2 p, float halfLength, float radius) {
  p.x = abs(p.x) - min(abs(p.x), halfLength);
  return length(p) - radius;
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float cilia(vec2 p, float d, float count, float wave) {
  float angle = atan(p.y, p.x);
  float beat = sin(angle * count + wave);
  float hair = smoothstep(0.55, 1.0, abs(sin(angle * count * 0.5 + wave * 0.5 + beat * 0.6)));
  return hair * smoothstep(0.075, 0.0, d) * step(0.0, d);
}

Organism paramecium(vec2 p, float t) {
  vec2 q = p - vec2(0.0, sin(p.x * 2.4 + t * 1.3) * 0.03);
  float d = sdEllipse(q, vec2(0.86, 0.34));
  d = -smin(-d, length(q - vec2(0.08, 0.36)) - 0.13, 0.08);
  Organism o;
  o.d = d;
  o.fringe = cilia(q, d, 150.0, (inState(8.0) ? 1.0 : -1.0) * t * 9.0);
  float macro = smoothstep(0.02, -0.02, sdEllipse(q - vec2(-0.05, 0.0), vec2(0.24, 0.14)));
  float micro = smoothstep(0.03, 0.0, length(q - vec2(0.16, -0.04)) - 0.04);
  vec2 cv = vec2(abs(q.x) - 0.56, q.y);
  float pump = 0.6 + 0.4 * sin(t * 2.0 + sign(q.x) * 1.5);
  float vacuole = smoothstep(0.02, -0.01, length(cv) - 0.07 * pump);
  float canals = smoothstep(0.012, 0.0, abs(sin(atan(cv.y, cv.x) * 4.0)) * length(cv)) * step(length(cv), 0.16);
  float foodDots = smoothstep(0.62, 0.8, vnoise(q * 9.0 + 3.1)) * step(d, -0.06);
  o.dense = macro * 0.55 + micro * 0.4 + foodDots * 0.35;
  o.clear = vacuole + canals * 0.5;
  o.pigment = foodDots;
  o.accent = vec3(0.0);
  return o;
}

Organism euglena(vec2 p, float t) {
  float bend = sin(t * 2.2 + p.x * 2.0) * 0.06;
  vec2 q = vec2(p.x, p.y - bend);
  float squirm = inState(5.0) ? 1.0 : 0.0;
  float taper = mix(0.24, 0.07, smoothstep(-0.2, 0.8, -q.x)) + sin(q.x * 6.0 - t * 4.0) * 0.08 * squirm;
  float d = sdEllipse(q, vec2(0.8, taper + 0.04));
  Organism o;
  o.d = d;
  vec2 f = q - vec2(0.8, 0.0);
  float whip = abs(f.y - sin(f.x * 14.0 - t * 16.0) * 0.07 * smoothstep(0.0, 0.3, f.x));
  o.fringe = smoothstep(0.018, 0.0, whip) * step(0.0, f.x) * step(f.x, 0.62);
  float plastids = smoothstep(0.34, 0.22, cellular(q * vec2(9.0, 13.0) + 7.0)) * step(d, -0.03);
  float eyespot = smoothstep(0.045, 0.02, length(q - vec2(0.6, 0.05)));
  float stripes = 0.5 + 0.5 * sin((q.x * 3.0 + q.y * 22.0) * 3.0);
  o.dense = plastids * 0.5 + stripes * 0.08;
  o.clear = smoothstep(0.06, 0.0, length(q - vec2(0.67, -0.03))) * 0.6;
  o.pigment = plastids;
  o.accent = vec3(0.9, 0.12, 0.05) * eyespot;
  return o;
}

Organism diatom(vec2 p, float t) {
  vec2 q = p;
  float lens = max(length(q - vec2(0.0, -0.62)), length(q - vec2(0.0, 0.62))) - 0.86;
  float d = max(lens, abs(q.x) - 0.9);
  Organism o;
  o.d = d;
  o.fringe = 0.0;
  float striae = smoothstep(0.35, 0.0, abs(fract(q.x * 16.0) - 0.5)) * smoothstep(0.03, 0.08, abs(q.y));
  float raphe = smoothstep(0.012, 0.0, abs(q.y)) * step(abs(q.x), 0.82);
  float nodule = smoothstep(0.06, 0.03, length(q));
  float plates = smoothstep(0.02, -0.02, abs(abs(q.y) - 0.1) - 0.05) * step(abs(q.x), 0.6);
  o.dense = striae * 0.35 + nodule * 0.5 + plates * 0.4;
  o.clear = raphe;
  o.pigment = plates;
  o.accent = vec3(0.0);
  return o;
}

Organism rotifer(vec2 p, float t) {
  float sway = sin(t * 1.4) * 0.05;
  vec2 q = vec2(p.x, p.y - sway * p.x);
  float trunk = sdEllipse(q - vec2(-0.05, 0.0), vec2(0.5, 0.3));
  float neck = sdEllipse(q - vec2(0.42, 0.0), vec2(0.2, 0.2));
  float foot = sdCapsule((q - vec2(-0.62, 0.0)), 0.18, 0.07);
  float d = smin(smin(trunk, neck, 0.12), foot, 0.08);
  float feeding = inState(4.0) ? 1.0 : 0.0;
  float retract = inState(2.0) ? 0.45 : 1.0;
  float crownSize = 0.12 * retract * (1.0 + 0.15 * feeding);
  float spin = 14.0 * (1.0 + 1.5 * feeding);
  vec2 left = q - vec2(0.6, 0.15) * vec2(1.0, retract);
  vec2 right = q - vec2(0.6, -0.15) * vec2(1.0, retract);
  float wheels = min(length(left), length(right)) - crownSize;
  d = smin(d, wheels, 0.06);
  Organism o;
  o.d = d;
  float spinL = sin(atan(left.y, left.x) * 18.0 - t * spin);
  float spinR = sin(atan(right.y, right.x) * 18.0 + t * spin);
  float outer = crownSize * 2.0;
  float crown = smoothstep(outer, crownSize * 1.08, length(left)) * smoothstep(crownSize * 0.83, crownSize * 1.08, length(left)) * step(0.4, spinL);
  crown += smoothstep(outer, crownSize * 1.08, length(right)) * smoothstep(crownSize * 0.83, crownSize * 1.08, length(right)) * step(0.4, spinR);
  o.fringe = crown;
  float mastax = smoothstep(0.1, 0.05, length(q - vec2(0.2, 0.0)));
  float gut = smoothstep(0.03, -0.03, sdEllipse(q - vec2(-0.1, 0.0), vec2(0.28, 0.13)));
  float toes = smoothstep(0.03, 0.0, abs(q.y) - 0.04) * step(q.x, -0.78) * step(-0.95, q.x);
  o.dense = mastax * 0.6 + gut * 0.3 + toes * 0.3;
  o.clear = 0.0;
  o.pigment = gut;
  o.accent = vec3(0.0);
  return o;
}

Organism bacillus(vec2 p, float t) {
  float split = inState(6.0) ? smoothstep(0.0, 1.0, stateProgress(1.6)) : 0.0;
  float tumble = inState(1.0) ? 1.0 : 0.0;
  float offset = 0.46 * split;
  float a = sdCapsule(p - vec2(-offset, 0.0), 0.3, 0.16);
  float b = sdCapsule(p - vec2(offset, 0.0), 0.3, 0.16);
  Organism o;
  o.d = smin(a, b, mix(0.14, 0.004, split));
  float tail = -0.46 - offset;
  vec2 f = p - vec2(tail, 0.0);
  float wave = sin(f.x * 18.0 + t * mix(22.0, 40.0, tumble)) * mix(0.05, 0.12, tumble);
  float whip = abs(f.y - wave - tumble * sin(t * 13.0) * f.x * 0.6);
  o.fringe = smoothstep(0.015, 0.0, whip) * step(-0.34, f.x) * step(f.x, 0.0) * 0.6;
  float septum = smoothstep(0.03, 0.0, abs(p.x)) * smoothstep(0.3, 0.7, split) * step(abs(p.y), 0.14);
  o.dense = smoothstep(0.6, 0.85, vnoise(p * 14.0)) * 0.3 + septum * 0.6;
  o.clear = 0.0;
  o.pigment = 0.0;
  o.accent = vec3(0.0);
  return o;
}

Organism coccus(vec2 p, float t) {
  float split = inState(6.0) ? smoothstep(0.0, 1.0, stateProgress(1.6)) : 0.0;
  float offset = 0.4 * split;
  float a = length(p - vec2(-offset, 0.0)) - 0.4;
  float b = length(p - vec2(offset, 0.0)) - 0.4;
  Organism o;
  o.d = smin(a, b, mix(0.18, 0.004, split));
  o.fringe = 0.0;
  float septum = smoothstep(0.035, 0.0, abs(p.x)) * smoothstep(0.25, 0.65, split) * step(abs(p.y), 0.3);
  o.dense = smoothstep(0.65, 0.9, vnoise(p * 12.0 + t * 0.2)) * 0.25 + septum * 0.5;
  o.clear = 0.0;
  o.pigment = 0.2;
  o.accent = vec3(0.0);
  return o;
}
`;
