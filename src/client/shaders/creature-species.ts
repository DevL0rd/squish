export const creatureSpecies = `
float hairs(vec2 p, float count, float inner, float outer, float twist) {
  float angle = atan(p.y, p.x);
  float r = length(p);
  float line = smoothstep(0.9, 1.0, cos(angle * count + twist + r * 2.0));
  return line * smoothstep(inner - 0.02, inner + 0.02, r) * smoothstep(outer, outer - 0.08, r);
}

Organism halteria(vec2 p, float t) {
  Organism o;
  o.d = length(p) - 0.4;
  float jitter = sin(t * 30.0) * 0.05 + (inState(2.0) ? (1.0 - stateProgress(0.22)) * 0.9 : 0.0);
  o.fringe = hairs(p, 14.0, 0.4, 0.82, jitter) * 0.8 + hairs(p - vec2(0.3, 0.0), 26.0, 0.12, 0.3, t * 9.0);
  o.dense = smoothstep(0.62, 0.85, vnoise(p * 12.0 + 2.0)) * 0.4 + smoothstep(0.16, 0.08, length(p - vec2(-0.08, 0.04))) * 0.4;
  o.clear = smoothstep(0.08, 0.04, length(p - vec2(-0.22, -0.12)));
  o.pigment = 0.15;
  o.accent = vec3(0.0);
  return o;
}

Organism volvox(vec2 p, float t) {
  Organism o;
  float r = length(p);
  o.d = r - 0.84;
  vec2 spin = mat2(cos(t * 0.3), -sin(t * 0.3), sin(t * 0.3), cos(t * 0.3)) * p;
  float surface = smoothstep(0.3, 0.6, r / 0.84);
  float zooids = smoothstep(0.2, 0.08, cellular(spin * 26.0)) * surface;
  float daughters = 0.0;
  for (int i = 0; i < 3; i++) {
    float a = float(i) * 2.1 + t * 0.2;
    vec2 at = vec2(cos(a), sin(a)) * 0.38;
    daughters += smoothstep(0.19, 0.15, length(spin - at));
  }
  o.fringe = 0.0;
  o.dense = daughters * 0.55;
  o.clear = (1.0 - surface) * 0.15;
  o.pigment = zooids * 0.9 + daughters * 0.7;
  o.accent = vec3(0.0);
  return o;
}

Organism stentor(vec2 p, float t) {
  Organism o;
  float ball = inState(5.0) ? smoothstep(0.0, 1.0, stateProgress(0.35)) : (inState(0.0) ? 1.0 - smoothstep(0.0, 1.0, stateProgress(0.9)) : 0.0);
  float open = inState(4.0) ? smoothstep(0.0, 1.0, stateProgress(1.2)) : 0.0;
  float x = p.x;
  float width = mix(0.07, mix(0.3, 0.42, open), smoothstep(-0.85, 0.65, x));
  float body = max(abs(p.y) - width, abs(x) - 0.82);
  vec2 discSize = vec2(0.12, mix(0.28, 0.44, open));
  float disc = sdEllipse(p - vec2(0.68, 0.0), discSize);
  float trumpet = smin(body, disc, 0.1);
  o.d = mix(trumpet, length(p - vec2(0.1, 0.0)) - 0.42, ball);
  vec2 rim = (p - vec2(0.68, 0.0)) / discSize;
  float ring = smoothstep(0.85, 1.0, length(rim)) * smoothstep(1.25, 1.05, length(rim));
  o.fringe = ring * step(0.2, sin(atan(rim.y, rim.x) * 30.0 - t * mix(6.0, 16.0, open))) * (1.0 - ball);
  float stripes = smoothstep(0.6, 1.0, sin(p.y / max(width, 0.05) * 18.0)) * step(o.d, 0.0) * (1.0 - ball);
  float beads = 0.0;
  for (int i = 0; i < 6; i++) {
    float k = float(i) / 5.0;
    vec2 bead = mix(vec2(mix(-0.4, 0.45, k), sin(k * 7.0) * 0.08), vec2(0.1 + (k - 0.5) * 0.3, sin(k * 7.0) * 0.12), ball);
    beads += smoothstep(0.07, 0.04, length(p - bead));
  }
  o.dense = beads * 0.6 + ball * 0.2;
  o.clear = 0.0;
  o.pigment = stripes * 0.9 + ball * 0.5;
  o.accent = vec3(0.0);
  return o;
}

Organism tardigrade(vec2 p, float t) {
  Organism o;
  float gait = sin(t * 3.0);
  float body = sdCapsule(p, 0.5, 0.3);
  float head = length(p - vec2(0.72, 0.0)) - 0.17;
  float legs = 1e3;
  for (int i = 0; i < 4; i++) {
    float lx = mix(-0.5, 0.42, float(i) / 3.0);
    float swing = gait * (mod(float(i), 2.0) * 2.0 - 1.0) * 0.05;
    legs = min(legs, length((p - vec2(lx + swing, 0.36)) * vec2(1.6, 1.0)) - 0.1);
    legs = min(legs, length((p - vec2(lx - swing, -0.36)) * vec2(1.6, 1.0)) - 0.1);
  }
  o.d = smin(smin(body, head, 0.1), legs, 0.06);
  float segments = smoothstep(0.03, 0.0, abs(fract(p.x * 3.2 + 0.5) - 0.5)) * step(o.d, -0.03) * 0.5;
  float gut = smoothstep(0.03, -0.03, sdEllipse(p - vec2(-0.05, 0.0), vec2(0.42, 0.14)));
  float eyes = smoothstep(0.035, 0.015, length(vec2(p.x - 0.74, abs(p.y) - 0.07)));
  o.fringe = 0.0;
  o.dense = gut * 0.45 + segments * 0.2 + eyes * 0.8;
  o.clear = 0.0;
  o.pigment = gut;
  o.accent = vec3(0.0);
  return o;
}

Organism bdellovibrio(vec2 p, float t) {
  Organism o;
  vec2 q = p - vec2(0.0, (p.x * p.x - 0.2) * 0.35);
  o.d = sdCapsule(q, 0.32, 0.17);
  vec2 f = p - vec2(-0.48, 0.0);
  float whip = abs(f.y - sin(f.x * 16.0 + t * 30.0) * 0.06);
  o.fringe = smoothstep(0.02, 0.0, whip) * step(f.x, 0.0) * step(-0.5, f.x);
  o.dense = 0.25;
  o.clear = 0.0;
  o.pigment = 0.4;
  o.accent = vec3(0.0);
  return o;
}

Organism virus(vec2 p, float t) {
  Organism o;
  float r = length(p);
  float angle = atan(p.y, p.x);
  float capsid = r - 0.5;
  float spikes = 0.0;
  for (int i = 0; i < 18; i++) {
    float a = float(i) / 18.0 * 6.2832 + sin(t * 0.4 + float(i)) * 0.04;
    vec2 dir = vec2(cos(a), sin(a));
    float along = clamp(dot(p, dir), 0.5, 0.74);
    float stalk = length(p - dir * along) - 0.025;
    float head = length(p - dir * 0.76) - 0.07;
    spikes = max(spikes, smoothstep(0.02, -0.02, min(stalk, head)));
  }
  o.d = capsid;
  o.fringe = spikes;
  float facets = smoothstep(0.04, 0.0, abs(fract(angle * 3.0 / 6.2832 + r * 1.5) - 0.5) - 0.44);
  o.dense = facets * 0.4 + smoothstep(0.35, 0.0, r) * 0.4;
  o.clear = 0.0;
  o.pigment = 0.6;
  o.accent = vec3(0.0);
  return o;
}

float hexagon(vec2 p, float r) {
  p = abs(p);
  return max(p.x * 0.866 + p.y * 0.5, p.y) - r;
}

float segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

Organism bacteriophage(vec2 p, float t) {
  Organism o;
  float latch = inState(7.0) ? stateProgress(1.0) : 0.0;
  float squeeze = smoothstep(0.15, 0.7, latch);
  float plateX = 0.38;
  float sheathLength = mix(0.5, 0.24, squeeze);
  float sheathStart = plateX - 0.02 - sheathLength;
  float headX = sheathStart - 0.3;
  float head = hexagon((p - vec2(headX, 0.0)).yx * vec2(1.0, 0.82), 0.25);
  float sheathWidth = mix(0.065, 0.11, squeeze);
  float sheath = max(abs(p.y) - sheathWidth, abs(p.x - (sheathStart + sheathLength * 0.5)) - sheathLength * 0.5);
  float tube = max(abs(p.y) - 0.028, abs(p.x - plateX * 0.5 - squeeze * 0.06) - plateX * 0.5 - squeeze * 0.06);
  float plate = max(abs(p.y) - 0.15, abs(p.x - plateX) - 0.025);
  o.d = min(min(head, sheath), min(tube, plate));
  float legs = 1e3;
  for (int i = -1; i <= 1; i += 2) {
    float side = float(i);
    float spread = mix(0.34, 0.42, latch) + sin(t * 3.0 + side) * 0.02 * (1.0 - latch);
    vec2 knee = vec2(plateX - 0.1, side * spread);
    vec2 foot = vec2(plateX + mix(0.12, 0.2, latch), side * (spread + 0.12));
    legs = min(legs, segment(p, vec2(plateX, side * 0.12), knee));
    legs = min(legs, segment(p, knee, foot));
    legs = min(legs, segment(p, vec2(plateX, side * 0.06), vec2(plateX + 0.14, side * 0.2)));
  }
  o.fringe = smoothstep(0.022, 0.0, legs);
  float rings = step(sheath, 0.0) * smoothstep(0.35, 0.9, sin(p.x * mix(90.0, 150.0, squeeze)));
  float dna = step(head, 0.0) * (1.0 - smoothstep(0.3, 1.0, latch));
  o.dense = dna * 0.7 + rings * 0.35;
  o.clear = step(head, 0.0) * smoothstep(0.4, 1.0, latch) * 0.5;
  o.pigment = dna * 0.4;
  o.accent = vec3(0.0);
  return o;
}
`;
