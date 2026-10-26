export const MAX_POINT_LIGHTS = 8;

export const lighting = `
layout(std140) uniform Lights {
  vec4 uLamp;
  vec4 uLampColor;
  vec4 uSpot;
  vec4 uSpotDir;
  vec4 uLightPoints[${String(MAX_POINT_LIGHTS)}];
  vec4 uLightColors[${String(MAX_POINT_LIGHTS)}];
  vec4 uCounts;
};

vec3 domeNormal(vec2 outward, float thick, vec2 bump) {
  return normalize(vec3(outward * (1.0 - thick) * 1.25 + bump, thick + 0.25));
}

vec3 lightTerm(vec3 albedo, vec3 n, float thick, vec3 l, vec3 color, float translucency) {
  float ndl = dot(n, l);
  float wrap = max(0.0, (ndl + 0.45) / 1.45);
  vec3 h = normalize(l + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, h), 0.0), 40.0) * 0.26;
  float back = max(0.0, 0.4 - ndl * 0.6) * (1.0 - thick) * translucency;
  return color * (albedo * wrap + albedo * albedo * back * 1.6 + spec);
}

vec3 shade(vec3 albedo, vec3 n, float thick, vec2 world, float translucency) {
  vec3 lit = albedo * 0.3;
  lit += lightTerm(albedo, n, thick, uLamp.xyz, uLampColor.rgb * uLamp.w, translucency);
  for (int i = 0; i < ${String(MAX_POINT_LIGHTS)}; i++) {
    if (float(i) >= uCounts.x) break;
    vec4 p = uLightPoints[i];
    vec2 delta = p.xy - world;
    float falloff = exp(-dot(delta, delta) / (p.z * p.z) * 1.4) * p.w;
    if (falloff < 0.01) continue;
    lit += lightTerm(albedo, n, thick, normalize(vec3(delta, p.z * 0.6)), uLightColors[i].rgb * falloff, translucency);
  }
  if (uSpot.w > 0.0) {
    float pool = (1.0 - smoothstep(0.6, 1.05, distance(world, uSpot.xy) / uSpot.z)) * uSpot.w;
    if (pool > 0.01) lit += lightTerm(albedo, n, thick, uSpotDir.xyz, vec3(1.0, 0.95, 0.84) * pool, translucency);
  }
  float fresnel = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
  return lit + vec3(0.6, 0.75, 0.72) * fresnel * 0.12;
}
`;
