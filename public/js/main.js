import { Net } from './net.js';
import { Interior } from './interior.js';
import { SoftBody } from './softbody.js';
import {
  quadVertex,
  fluidAdvect,
  fluidDivergence,
  fluidPressure,
  fluidGradient,
  fluidSplat,
  background,
  cellVertex,
  cellFragment,
  haloVertex,
  haloFragment,
  shadowFragment,
  foodVertex,
  foodFragment,
  bubbleVertex,
  bubbleFragment,
  debrisVertex,
  debrisFragment,
  creatureVertex,
  creatureFragment,
  fusionVertex,
  fusionFragment,
  brightPass,
  blurPass,
  fieldFragment,
  blitFragment,
  composite
} from './shaders.js';

const WORLD = 4096;
const WORLD_CENTER = WORLD / 2;
const MAX_LIGHTS = 16;
const MAX_SPLATS = 28;
const SIM_HZ = 30;

const canvas = document.getElementById('culture');
const labelCanvas = document.getElementById('labels');
const labelContext = labelCanvas.getContext('2d');
const hud = document.getElementById('hud');
const intro = document.getElementById('intro');
const deathScreen = document.getElementById('death');
const joinForm = document.getElementById('joinForm');
const nameInput = document.getElementById('nameInput');
const swatches = document.getElementById('swatches');
const enterButton = document.getElementById('enterBtn');
const massLabel = document.getElementById('mass');
const bodyCountLabel = document.getElementById('bodyCount');
const rankLabel = document.getElementById('rank');
const specimenName = document.getElementById('specimenName');
const occupantsLabel = document.getElementById('occupants');
const onlineLabel = document.getElementById('online');
const ranksList = document.getElementById('ranks');
const killerLabel = document.getElementById('killer');
const respawnButton = document.getElementById('respawnBtn');
const statusBox = document.getElementById('status');
const boot = document.getElementById('boot');
const soundButton = document.getElementById('soundBtn');
const splitButton = document.getElementById('splitBtn');
const ejectButton = document.getElementById('ejectBtn');
const joystick = document.getElementById('joystick');
const joystickKnob = document.getElementById('joystickKnob');

const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
const zoomState = { value: 1, target: 1 };
const dprCap = coarsePointer ? 1.5 : 1.6;
const simResolution = coarsePointer ? 640 : 1024;
const RING_COUNT = coarsePointer ? 48 : 64;

const state = {
  me: null,
  hue: -1,
  joined: false,
  dead: false,
  roster: new Map(),
  cells: new Map(),
  food: new Map(),
  interiors: new Map(),
  splats: [],
  creatures: new Map(),
  ingestions: [],
  mergeGhosts: [],
  spitTints: [],
  camera: {
    x: WORLD_CENTER,
    y: WORLD_CENTER,
    width: 1200,
    height: 800,
    ox: 0,
    oy: 0,
    shake: 0
  },
  target: { x: WORLD_CENTER, y: WORLD_CENTER },
  joystick: { active: false, id: null, x: 0, y: 0, dx: 0, dy: 0 },
  lastInput: 0,
  lastView: 0,
  lastUi: 0,
  targetReady: false,
  time: 0,
  rank: 0,
  attractSeed: Math.random() * 100
};

const palette = [168, 190, 146, 96, 46, 16, 338, 312, 286, 256];

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function radiusFor(mass) {
  return 5.2 * Math.sqrt(Math.max(mass, 1));
}

function hslToRgb(hue, saturation, lightness) {
  const h = ((hue % 360) + 360) % 360 / 360;
  const s = clamp(saturation, 0, 1);
  const l = clamp(lightness, 0, 1);
  if (s === 0) {
    const v = l;
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hueToRgb = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [hueToRgb(h + 1 / 3), hueToRgb(h), hueToRgb(h - 1 / 3)];
}

function colorForHue(hue) {
  return hslToRgb(hue, 0.9, 0.58);
}

function worldHueAt(x, y) {
  const nx = x / WORLD;
  const ny = y / WORLD;
  const hue = 168
    + 82 * Math.sin(nx * 5.3 + 0.6)
    + 46 * Math.sin(ny * 4.1 - 0.35)
    + 24 * Math.sin((nx + ny) * 8.2 + 1.1)
    + 16 * Math.cos((nx - ny) * 10.4);
  return ((hue % 360) + 360) % 360;
}

function worldColorAt(x, y, saturation, lightness) {
  return hslToRgb(worldHueAt(x, y), saturation, lightness);
}

function cssColor(hue) {
  return `hsl(${Math.round(hue)} 76% 63%)`;
}

function vividColor(color) {
  const max = Math.max(color[0], color[1], color[2], 0.001);
  return [clamp(color[0] / max, 0, 1), clamp(color[1] / max, 0, 1), clamp(color[2] / max, 0, 1)];
}

function formatMass(mass) {
  if (mass >= 1000) return `${(mass / 1000).toFixed(2)}k`;
  return mass.toFixed(1);
}

function showStatus(text, duration = 2400) {
  statusBox.textContent = text;
  statusBox.classList.add('show');
  clearTimeout(showStatus.timer);
  showStatus.timer = setTimeout(() => statusBox.classList.remove('show'), duration);
}

function hexSeed(value) {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

let gl = null;
try {
  gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance',
    premultipliedAlpha: true
  });
} catch {
  gl = null;
}

if (!gl) {
  boot.innerHTML = '<span>This specimen needs WebGL 2.</span>';
  throw new Error('WebGL2 is not available');
}

const floatColor = gl.getExtension('EXT_color_buffer_float');
const floatLinear = gl.getExtension('OES_texture_float_linear');
gl.getExtension('EXT_float_blend');
gl.pixelStorei(gl.PACK_ALIGNMENT, 1);

if (!floatColor) {
  boot.innerHTML = '<span>This display cannot hold the culture. WebGL float buffers are unavailable.</span>';
  throw new Error('EXT_color_buffer_float is not available');
}

gl.disable(gl.DEPTH_TEST);
gl.disable(gl.CULL_FACE);
gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(info || 'shader compilation failed');
  }
  return shader;
}

function createProgram(vertexSource, fragmentSource) {
  const vertex = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(info || 'program link failed');
  }
  const uniforms = new Map();
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i += 1) {
    const info = gl.getActiveUniform(program, i);
    if (!info) continue;
    const name = info.name.replace(/\[0\]$/, '');
    uniforms.set(name, gl.getUniformLocation(program, info.name));
  }
  return { program, uniforms };
}

const programs = {
  advect: createProgram(quadVertex, fluidAdvect),
  divergence: createProgram(quadVertex, fluidDivergence),
  pressure: createProgram(quadVertex, fluidPressure),
  gradient: createProgram(quadVertex, fluidGradient),
  splat: createProgram(quadVertex, fluidSplat),
  background: createProgram(quadVertex, background),
  cell: createProgram(cellVertex, cellFragment),
  halo: createProgram(haloVertex, haloFragment),
  shadow: createProgram(haloVertex, shadowFragment),
  food: createProgram(foodVertex, foodFragment),
  bubble: createProgram(bubbleVertex, bubbleFragment),
  debris: createProgram(debrisVertex, debrisFragment),
  creature: createProgram(creatureVertex, creatureFragment),
  fusion: createProgram(fusionVertex, fusionFragment),
  bright: createProgram(quadVertex, brightPass),
  field: createProgram(quadVertex, fieldFragment),
  blur: createProgram(quadVertex, blurPass),
  blit: createProgram(quadVertex, blitFragment),
  composite: createProgram(quadVertex, composite)
};

const quadBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

const quadVAO = gl.createVertexArray();
gl.bindVertexArray(quadVAO);
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

function createRenderTarget(width, height, internalFormat, format, type, filter) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, null);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!complete) throw new Error('incomplete framebuffer');
  return { texture, framebuffer, width, height };
}

function createFloatPair(width, height) {
  const filter = floatLinear ? gl.LINEAR : gl.NEAREST;
  return [
    createRenderTarget(width, height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, filter),
    createRenderTarget(width, height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, filter)
  ];
}

const fluidSize = Math.min(simResolution, gl.getParameter(gl.MAX_TEXTURE_SIZE));
const velocityTargets = createFloatPair(fluidSize, fluidSize);
const dyeTargets = createFloatPair(fluidSize, fluidSize);
const pressureTargets = createFloatPair(fluidSize, fluidSize);
const divergenceTarget = createRenderTarget(fluidSize, fluidSize, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);
const CLIENT_FLOW_N = 64;
const fieldTarget = createRenderTarget(CLIENT_FLOW_N, CLIENT_FLOW_N, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
const fieldPixels = new Uint8Array(CLIENT_FLOW_N * CLIENT_FLOW_N * 4);
const clientFlow = new Float32Array(CLIENT_FLOW_N * CLIENT_FLOW_N * 2);
let clientFlowValid = false;
let fieldAccumulator = 0;
const texel = 1 / fluidSize;
let velocityIndex = 0;
let dyeIndex = 0;
let pressureIndex = 0;
let simAccumulator = 0;

let baseTarget = null;
let cellsTarget = null;
let brightTarget = null;
let blurTarget = null;
let screenWidth = 0;
let screenHeight = 0;
let pixelRatio = 1;
let lightCount = 0;

function createScreenTargets(width, height) {
  if (baseTarget) {
    for (const target of [baseTarget, cellsTarget, brightTarget, blurTarget]) {
      gl.deleteTexture(target.texture);
      gl.deleteFramebuffer(target.framebuffer);
    }
  }
  baseTarget = createRenderTarget(width, height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
  cellsTarget = createRenderTarget(width, height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
  const lowWidth = Math.max(1, Math.floor(width * 0.5));
  const lowHeight = Math.max(1, Math.floor(height * 0.5));
  brightTarget = createRenderTarget(lowWidth, lowHeight, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
  blurTarget = createRenderTarget(lowWidth, lowHeight, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  pixelRatio = Math.min(window.devicePixelRatio || 1, dprCap);
  const targetWidth = Math.max(1, Math.floor(width * pixelRatio));
  const targetHeight = Math.max(1, Math.floor(height * pixelRatio));
  if (targetWidth === screenWidth && targetHeight === screenHeight) return;
  screenWidth = targetWidth;
  screenHeight = targetHeight;
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  labelCanvas.width = targetWidth;
  labelCanvas.height = targetHeight;
  labelContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  createScreenTargets(targetWidth, targetHeight);
}

window.addEventListener('resize', resize);
resize();

function createInstancedVAO(attributes) {
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  for (const attribute of attributes) {
    gl.enableVertexAttribArray(attribute.location);
    gl.vertexAttribPointer(attribute.location, attribute.size, gl.FLOAT, false, attribute.stride * 4, attribute.offset * 4);
    gl.vertexAttribDivisor(attribute.location, 1);
  }
  gl.bindVertexArray(null);
  return { vao, buffer };
}

const haloMesh = createInstancedVAO([
  { location: 1, size: 4, stride: 8, offset: 0 },
  { location: 2, size: 4, stride: 8, offset: 4 }
]);
const shadowMesh = createInstancedVAO([
  { location: 1, size: 4, stride: 8, offset: 0 },
  { location: 2, size: 4, stride: 8, offset: 4 }
]);
const foodMesh = createInstancedVAO([
  { location: 1, size: 4, stride: 8, offset: 0 },
  { location: 2, size: 4, stride: 8, offset: 4 }
]);
const bubbleMesh = createInstancedVAO([
  { location: 1, size: 4, stride: 4, offset: 0 }
]);
const ingestMesh = createInstancedVAO([
  { location: 1, size: 4, stride: 8, offset: 0 },
  { location: 2, size: 4, stride: 8, offset: 4 }
]);
const debrisMesh = createInstancedVAO([
  { location: 1, size: 4, stride: 8, offset: 0 },
  { location: 2, size: 4, stride: 8, offset: 4 }
]);
const creatureMesh = createInstancedVAO([
  { location: 1, size: 4, stride: 12, offset: 0 },
  { location: 2, size: 4, stride: 12, offset: 4 },
  { location: 3, size: 4, stride: 12, offset: 8 }
]);

const haloData = new Float32Array(1024 * 8);
const shadowData = new Float32Array(1024 * 8);
const foodData = new Float32Array(2048 * 8);
const bubbleData = new Float32Array(128 * 4);
const ingestData = new Float32Array(128 * 8);
const debrisData = new Float32Array(512 * 8);
const creatureData = new Float32Array(128 * 12);
const foodUniformData = new Float32Array(8 * 4);
const organelleUniformData = new Float32Array(8 * 4);
const shapeData = new Float32Array(7 * 4);
const shapeDataA = new Float32Array(7 * 4);
const shapeDataB = new Float32Array(7 * 4);
const foodColorUniformData = new Float32Array(8 * 3);
const splatData = new Float32Array(MAX_SPLATS * 4);
const splatVelocityData = new Float32Array(MAX_SPLATS * 2);
const splatColorData = new Float32Array(MAX_SPLATS * 3);
const lightPositions = new Float32Array(MAX_LIGHTS * 2);
const lightColors = new Float32Array(MAX_LIGHTS * 3);
const lightRadii = new Float32Array(MAX_LIGHTS);
const lightIntensities = new Float32Array(MAX_LIGHTS);

const debris = [];
const bubbles = [];

function randomRange(low, high) {
  return low + Math.random() * (high - low);
}

function viewBounds(margin = 0) {
  const width = state.camera.width + margin * 2;
  const height = state.camera.height + margin * 2;
  return {
    left: state.camera.x - width / 2,
    right: state.camera.x + width / 2,
    top: state.camera.y + height / 2,
    bottom: state.camera.y - height / 2,
    width,
    height
  };
}

function spawnDebris(x, y, color, options = {}) {
  const custom = Boolean(color);
  const tint = color || worldColorAt(x, y, 0.68, options.type > 0.5 ? 0.45 : 0.36);
  debris.push({
    x,
    y,
    vx: options.vx ?? randomRange(-13, 13),
    vy: options.vy ?? randomRange(-13, 13),
    size: options.size ?? randomRange(1.5, 7),
    type: options.type ?? Math.random(),
    seed: Math.random(),
    color: tint,
    customColor: custom,
    life: options.life ?? randomRange(18, 50),
    maxLife: options.life ?? randomRange(18, 50),
    front: options.front ?? Math.random() < 0.3
  });
}

function spawnBubble(x, y, options = {}) {
  bubbles.push({
    x,
    y,
    vx: options.vx ?? randomRange(-4, 4),
    vy: options.vy ?? randomRange(3, 12),
    size: options.size ?? randomRange(5, 23),
    seed: Math.random() * 20,
    front: options.front ?? Math.random() < 0.35,
    life: randomRange(18, 40)
  });
}

function initDecor() {
  const bounds = viewBounds(240);
  for (let i = 0; i < 160; i += 1) {
    spawnDebris(randomRange(bounds.left, bounds.right), randomRange(bounds.bottom, bounds.top), null, {
      type: Math.random() < 0.72 ? 0 : 1
    });
  }
  for (let i = 0; i < 50; i += 1) {
    spawnBubble(randomRange(bounds.left, bounds.right), randomRange(bounds.bottom, bounds.top));
  }
}

function resetDecor() {
  debris.length = 0;
  bubbles.length = 0;
  initDecor();
}

function updateClientFlow(dt) {
  fieldAccumulator += dt;
  if (fieldAccumulator < 0.09) return;
  fieldAccumulator = 0;
  const program = programs.field;
  gl.useProgram(program.program);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fieldTarget.framebuffer);
  gl.viewport(0, 0, CLIENT_FLOW_N, CLIENT_FLOW_N);
  gl.disable(gl.BLEND);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, velocityTargets[velocityIndex].texture);
  gl.uniform1i(program.uniforms.get('uVelocity'), 0);
  gl.bindVertexArray(quadVAO);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.readPixels(0, 0, CLIENT_FLOW_N, CLIENT_FLOW_N, gl.RGBA, gl.UNSIGNED_BYTE, fieldPixels);
  const scale = WORLD / fluidSize;
  const flowScale = 1 / 0.004;
  for (let i = 0; i < CLIENT_FLOW_N * CLIENT_FLOW_N; i += 1) {
    const rawX = fieldPixels[i * 4] / 255;
    const rawY = fieldPixels[i * 4 + 1] / 255;
    clientFlow[i * 2] = (rawX - 0.5) * flowScale * scale;
    clientFlow[i * 2 + 1] = (rawY - 0.5) * flowScale * scale;
  }
  clientFlowValid = true;
}

function sampleClientFlow(x, y) {
  if (!clientFlowValid) return null;
  const gx = clamp(x / WORLD * (CLIENT_FLOW_N - 1), 0, CLIENT_FLOW_N - 1.001);
  const gy = clamp(y / WORLD * (CLIENT_FLOW_N - 1), 0, CLIENT_FLOW_N - 1.001);
  const x0 = gx | 0;
  const y0 = gy | 0;
  const fx = gx - x0;
  const fy = gy - y0;
  const i00 = (y0 * CLIENT_FLOW_N + x0) * 2;
  const i10 = i00 + 2;
  const i01 = i00 + CLIENT_FLOW_N * 2;
  const i11 = i01 + 2;
  const topX = clientFlow[i00] * (1 - fx) + clientFlow[i10] * fx;
  const topY = clientFlow[i00 + 1] * (1 - fx) + clientFlow[i10 + 1] * fx;
  const bottomX = clientFlow[i01] * (1 - fx) + clientFlow[i11] * fx;
  const bottomY = clientFlow[i01 + 1] * (1 - fx) + clientFlow[i11 + 1] * fx;
  return [topX * (1 - fy) + bottomX * fy, topY * (1 - fy) + bottomY * fy];
}

function applyParticleCohesion(dt) {
  for (let i = 0; i < bubbles.length; i += 1) {
    const a = bubbles[i];
    for (let j = i + 1; j < bubbles.length; j += 1) {
      const b = bubbles[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 0.001;
      if (distance > 135) continue;
      const force = (1 - distance / 135) * 0.011;
      a.vx += (dx / distance) * force;
      a.vy += (dy / distance) * force;
      b.vx -= (dx / distance) * force;
      b.vy -= (dy / distance) * force;
    }
  }
  for (let i = 0; i < debris.length; i += 1) {
    const a = debris[i];
    if (a.type > 0.5) continue;
    for (let j = i + 1; j < debris.length; j += 1) {
      const b = debris[j];
      if (b.type > 0.5) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 0.001;
      if (distance > 38) continue;
      const force = (1 - distance / 38) * 0.006;
      a.vx += (dx / distance) * force;
      a.vy += (dy / distance) * force;
      b.vx -= (dx / distance) * force;
      b.vy -= (dy / distance) * force;
    }
  }
}

function maintainDecor(dt) {
  const bounds = viewBounds(360);
  const time = state.time;
  for (let i = debris.length - 1; i >= 0; i -= 1) {
    const particle = debris[i];
    const fieldFlow = sampleClientFlow(particle.x, particle.y);
    if (fieldFlow) {
      particle.vx += (fieldFlow[0] - particle.vx) * dt * 1.6;
      particle.vy += (fieldFlow[1] - particle.vy) * dt * 1.6;
    } else {
      const flowX = Math.sin(particle.y * 0.006 + time * 0.11 + particle.seed * 7) * 7 + Math.cos(particle.x * 0.003 - time * 0.08) * 4;
      const flowY = Math.cos(particle.x * 0.005 - time * 0.09 + particle.seed * 9) * 5;
      particle.vx += flowX * dt * 0.35;
      particle.vy += flowY * dt * 0.35;
    }
    particle.vx += Math.sin(time * 0.21 + particle.seed * 8) * dt * 0.9;
    particle.vy += Math.cos(time * 0.17 + particle.seed * 11) * dt * 0.9;
    particle.vx *= Math.exp(-dt * 0.22);
    particle.vy *= Math.exp(-dt * 0.22);
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= dt;
    if (particle.life <= 0) {
      debris.splice(i, 1);
      continue;
    }
    if (particle.x < bounds.left || particle.x > bounds.right || particle.y < bounds.bottom || particle.y > bounds.top) {
      particle.x = randomRange(bounds.left, bounds.right);
      particle.y = randomRange(bounds.bottom, bounds.top);
      particle.vx = randomRange(-10, 10);
      particle.vy = randomRange(-10, 10);
      particle.life = randomRange(18, 50);
      particle.maxLife = 50;
      if (!particle.customColor) particle.color = worldColorAt(particle.x, particle.y, 0.68, particle.type > 0.5 ? 0.45 : 0.36);
    }
  }
  for (let i = bubbles.length - 1; i >= 0; i -= 1) {
    const bubble = bubbles[i];
    const fieldFlow = sampleClientFlow(bubble.x, bubble.y);
    if (fieldFlow) {
      bubble.vx += (fieldFlow[0] - bubble.vx) * dt * 1.15;
      bubble.vy += (fieldFlow[1] + 8 - bubble.vy) * dt * 1.15;
    } else {
      bubble.vx += Math.sin(bubble.y * 0.008 + time * 0.6 + bubble.seed) * dt * 2.4;
    }
    bubble.x += bubble.vx * dt;
    bubble.y += bubble.vy * dt;
    bubble.vx *= Math.exp(-dt * 0.5);
    bubble.life -= dt;
    if (bubble.life <= 0 || bubble.y < bounds.bottom || bubble.x < bounds.left || bubble.x > bounds.right) {
      bubble.x = randomRange(bounds.left, bounds.right);
      bubble.y = bounds.bottom + randomRange(0, bounds.height * 0.25);
      bubble.vx = randomRange(-4, 4);
      bubble.vy = randomRange(3, 12);
      bubble.size = randomRange(5, 23);
      bubble.life = randomRange(18, 40);
      bubble.front = Math.random() < 0.35;
    }
  }
  while (debris.length < 140) {
    spawnDebris(randomRange(bounds.left, bounds.right), randomRange(bounds.bottom, bounds.top), null, {
      type: Math.random() < 0.72 ? 0 : 1
    });
  }
  for (const cell of state.cells.values()) {
    for (const bubble of bubbles) {
      const dx = bubble.x - cell.x;
      const dy = bubble.y - cell.y;
      const distance = Math.hypot(dx, dy) || 0.001;
      const reach = cell.radius + bubble.size * 0.45;
      if (distance < reach) {
        const push = (reach - distance) / reach;
        bubble.x += (dx / distance) * push * 2.5;
        bubble.y += (dy / distance) * push * 2.5;
        bubble.vx += (dx / distance) * push * 18 + cell.vx * 0.04;
        bubble.vy += (dy / distance) * push * 18 + cell.vy * 0.04;
      }
    }
    for (const particle of debris) {
      if (particle.type > 0.5) continue;
      const dx = particle.x - cell.x;
      const dy = particle.y - cell.y;
      const distance = Math.hypot(dx, dy) || 0.001;
      const reach = cell.radius + particle.size * 0.4;
      if (distance < reach) {
        const push = (reach - distance) / reach;
        particle.x += (dx / distance) * push * 2.4;
        particle.y += (dy / distance) * push * 2.4;
        particle.vx += (dx / distance) * push * 12 + cell.vx * 0.03;
        particle.vy += (dy / distance) * push * 12 + cell.vy * 0.03;
      }
    }
  }
  applyParticleCohesion(dt);
  while (bubbles.length < 44) {
    spawnBubble(randomRange(bounds.left, bounds.right), randomRange(bounds.bottom, bounds.top));
  }
}

function interiorFor(cell) {
  let record = state.interiors.get(cell.id);
  if (!record) {
    const color = cell.hue >= 0 ? colorForHue(cell.hue) : null;
    const interior = new Interior(40, hexSeed(cell.id * 7919 + 17), color);
    record = {
      interior,
      texture: null,
      lastSeen: performance.now(),
      color,
      fluidColor: interior.averageColor(),
      colorTimer: 0
    };
    state.interiors.set(cell.id, record);
  }
  record.lastSeen = performance.now();
  return record;
}

function createInteriorTexture(record) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, record.interior.n, record.interior.n, 0, gl.RGBA, gl.UNSIGNED_BYTE, record.interior.textureData);
  record.texture = texture;
  return texture;
}

function syncInteriorTexture(record) {
  if (!record.texture) return createInteriorTexture(record);
  gl.bindTexture(gl.TEXTURE_2D, record.texture);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, record.interior.n, record.interior.n, gl.RGBA, gl.UNSIGNED_BYTE, record.interior.textureData);
  return record.texture;
}

function removeCell(cellId) {
  const visual = state.cells.get(cellId);
  if (visual) {
    if (visual.meshVAO) gl.deleteVertexArray(visual.meshVAO);
    if (visual.meshBuffer) gl.deleteBuffer(visual.meshBuffer);
  }
  state.cells.delete(cellId);
  const record = state.interiors.get(cellId);
  if (record) {
    if (record.texture) gl.deleteTexture(record.texture);
    state.interiors.delete(cellId);
  }
}

function startIngestion(cell, event, radius) {
  let dx = event.x - cell.x;
  let dy = event.y - cell.y;
  let distance = Math.hypot(dx, dy);
  if (distance < 0.001) {
    const angle = Math.random() * Math.PI * 2;
    dx = Math.cos(angle);
    dy = Math.sin(angle);
    distance = 1;
  }
  const angle = Math.atan2(dy, dx);
  const entryRadius = clamp(distance / Math.max(cell.radius, 1), 0.38, 0.72);
  const entryX = Math.cos(angle) * entryRadius;
  const entryY = Math.sin(angle) * entryRadius;
  const item = {
    cellId: cell.id,
    sx: event.x,
    sy: event.y,
    x: event.x,
    y: event.y,
    entryX,
    entryY,
    color: event.color,
    radius: Math.max(4, radius),
    phase: Math.random() * 10,
    life: 0.34,
    maxLife: 0.34
  };
  state.ingestions.push(item);
  if (state.ingestions.length > 64) state.ingestions.shift();
}

function mergeSoftBody(absorbed, survivor, event) {
  let record = state.interiors.get(absorbed.id);
  if (record) {
    state.interiors.delete(absorbed.id);
  } else {
    const color = colorForHue(absorbed.hue);
    record = {
      interior: new Interior(40, hexSeed(absorbed.id * 7919 + 17), color),
      texture: null,
      lastSeen: performance.now(),
      color,
      fluidColor: null,
      colorTimer: 0
    };
  }
  const hostRecord = interiorFor(survivor);
  const spread = clamp(absorbed.radius / Math.max(survivor.radius, 1), 0.1, 0.95);
  const localX = clamp((absorbed.x - survivor.x) / Math.max(survivor.radius, 1), -0.9, 0.9);
  const localY = clamp((absorbed.y - survivor.y) / Math.max(survivor.radius, 1), -0.9, 0.9);
  const hasGhost = Boolean(absorbed.soft && absorbed.meshData);
  if (hasGhost) {
    const ghost = {
      survivorId: survivor.id,
      cell: absorbed,
      record,
      startX: absorbed.x,
      startY: absorbed.y,
      startRadius: absorbed.radius,
      life: 0.34,
      maxLife: 0.34,
      mergeTimer: 0
    };
    state.cells.delete(absorbed.id);
    state.mergeGhosts.push(ghost);
    hostRecord.interior.mergeFrom(record.interior, localX, localY, 0.25, spread);
  } else {
    hostRecord.interior.mergeFrom(record.interior, localX, localY, 1.2, spread);
    hostRecord.interior.transferFoodFrom(record.interior, localX, localY, spread);
    hostRecord.fluidColor = hostRecord.interior.averageColor();
    syncInteriorTexture(hostRecord);
    if (record.texture) gl.deleteTexture(record.texture);
    removeCell(absorbed.id);
  }
  if (survivor.soft) survivor.soft.kickBody(0.22);
  state.splats.push({
    x: event.x,
    y: event.y,
    radius: Math.max(50, absorbed.radius * 1.4),
    color: event.color,
    strength: 0.14,
    vx: 0,
    vy: 0
  });
  for (let i = 0; i < 7; i += 1) {
    spawnDebris(event.x + randomRange(-9, 9), event.y + randomRange(-9, 9), event.color, {
      vx: randomRange(-35, 35),
      vy: randomRange(-35, 35),
      size: randomRange(1, 4),
      type: 0,
      life: randomRange(2.5, 6),
      front: Math.random() < 0.5
    });
  }
  if (survivor.pid === state.me || absorbed.pid === state.me) state.camera.shake = Math.max(state.camera.shake, 1.2);
}

function processEvent(event) {
  const cell = state.cells.get(event.cellId);
  if (event.kind === 1) {
    let foodRadius = 9;
    for (const [id, food] of state.food) {
      if (Math.hypot(food.x - event.x, food.y - event.y) < 55) {
        foodRadius = food.radius;
        state.food.delete(id);
        break;
      }
    }
    if (cell) {
      const record = interiorFor(cell);
      const localX = clamp((event.x - cell.x) / Math.max(cell.radius, 1), -0.82, 0.82);
      const localY = clamp((event.y - cell.y) / Math.max(cell.radius, 1), -0.82, 0.82);
      record.interior.addFood(localX, localY, event.color, 1.5, clamp(foodRadius / Math.max(cell.radius, 1), 0.02, 0.32), localX * 0.9, localY * 0.9);
      for (let i = 0; i < 2; i += 1) {
        spawnDebris(event.x + randomRange(-5, 5), event.y + randomRange(-5, 5), event.color, {
          vx: randomRange(-35, 35),
          vy: randomRange(-35, 35),
          size: randomRange(1, 3.4),
          type: 0,
          life: randomRange(2.5, 6),
          front: false
        });
      }
    }
    state.splats.push({ x: event.x, y: event.y, radius: 52, color: event.color, strength: 0.09, vx: 0, vy: 0 });
    if (cell && cell.pid === state.me) {
      state.camera.shake = Math.max(state.camera.shake, 0.3);
      playSfx('eat', 0.9);
    } else if (cell) {
      playSfx('eat', 0.2);
    }
  } else if (event.kind === 3) {
    let parent = state.cells.get(event.cellId);
    let child = state.cells.get(event.predatorId);
    if (!child && parent) {
      child = [...state.cells.values()].find((candidate) => candidate.pid === parent.pid && Math.hypot(candidate.x - event.x, candidate.y - event.y) < candidate.radius * 2.4);
    }
    if (parent && child && parent.id !== child.id) {
      const parentRecord = interiorFor(parent);
      const childRecord = interiorFor(child);
      let dx = child.x - parent.x;
      let dy = child.y - parent.y;
      const length = Math.hypot(dx, dy) || 1;
      dx /= length;
      dy /= length;
      parentRecord.interior.splitTo(childRecord.interior, dx, dy);
      parentRecord.fluidColor = parentRecord.interior.averageColor();
      childRecord.fluidColor = childRecord.interior.averageColor();
      if (parent.soft && child.soft) {
        parent.soft.forkTo(
          child.soft,
          parent.x,
          parent.y,
          parent.radius,
          child.x,
          child.y,
          child.radius,
          dx,
          dy
        );
      }
      syncInteriorTexture(parentRecord);
      syncInteriorTexture(childRecord);
      state.splats.push({ x: event.x, y: event.y, radius: Math.max(55, child.radius * 1.4), color: event.color, strength: 0.13, vx: 0, vy: 0 });
      for (let i = 0; i < 5; i += 1) {
        spawnDebris(event.x + randomRange(-8, 8), event.y + randomRange(-8, 8), event.color, {
          vx: randomRange(-30, 30),
          vy: randomRange(-30, 30),
          size: randomRange(1, 3.5),
          type: 0,
          life: randomRange(2.5, 6),
          front: Math.random() < 0.5
        });
      }
      if (parent.pid === state.me) {
        state.camera.shake = Math.max(state.camera.shake, 1.2);
        playSfx('split', 1);
      }
    }
  } else if (event.kind === 4) {
    const absorbed = state.cells.get(event.cellId);
    const survivor = state.cells.get(event.predatorId);
    if (absorbed && survivor && absorbed.id !== survivor.id) {
      if (absorbed.pid === state.me || survivor.pid === state.me) playSfx('merge', 1);
      mergeSoftBody(absorbed, survivor, event);
    } else {
      state.splats.push({ x: event.x, y: event.y, radius: 80, color: event.color, strength: 0.16, vx: 0, vy: 0 });
    }
  } else if (event.kind === 5) {
    const cell = state.cells.get(event.cellId);
    if (cell) {
      const record = interiorFor(cell);
      record.interior.drain(0.045);
      record.fluidColor = record.interior.averageColor();
      if (cell.soft) cell.soft.kickBody(0.06);
      if (cell.pid === state.me) playSfx('spit', 1);
      let nearest = null;
      let nearestDistance = 90;
      for (const food of state.food.values()) {
        const distance = Math.hypot(food.x - event.x, food.y - event.y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = food;
        }
      }
      if (nearest) {
        nearest.color = record.fluidColor;
        nearest.ejecta = true;
      }
      state.spitTints.push({ x: event.x, y: event.y, color: record.fluidColor, life: 2.2 });
      state.splats.push({ x: event.x, y: event.y, radius: 42, color: record.fluidColor, strength: 0.1, vx: 0, vy: 0 });
      for (let i = 0; i < 3; i += 1) {
        spawnDebris(event.x + randomRange(-6, 6), event.y + randomRange(-6, 6), record.fluidColor, {
          vx: randomRange(-25, 25),
          vy: randomRange(-25, 25),
          size: randomRange(1, 3),
          type: 0,
          life: randomRange(2, 5),
          front: false
        });
      }
      if (cell.pid === state.me) state.camera.shake = Math.max(state.camera.shake, 0.45);
    }
  } else if (event.kind >= 6 && event.kind <= 12) {
    const cell = state.cells.get(event.cellId);
    if (cell) {
      const record = interiorFor(cell);
      const localX = clamp((event.x - cell.x) / Math.max(cell.radius, 1), -0.72, 0.72);
      const localY = clamp((event.y - cell.y) / Math.max(cell.radius, 1), -0.72, 0.72);
      record.interior.addFood(localX, localY, event.color, 3, 0.2, localX * 0.9, localY * 0.9);
      record.interior.addDye(localX, localY, event.color, 0.09);
      state.splats.push({ x: event.x, y: event.y, radius: 58, color: event.color, strength: 0.08, vx: 0, vy: 0 });
      if (cell.pid === state.me) {
        playSfx('eat', 1);
        state.camera.shake = Math.max(state.camera.shake, 0.7);
      }
    }
  }
  if (state.splats.length > MAX_SPLATS) state.splats = state.splats.slice(-MAX_SPLATS);
}

function processSnapshot(snapshot) {
  const now = performance.now();
  const seen = new Set();
  for (const player of snapshot.players) {
    const meta = state.roster.get(player.id);
    for (const cell of player.cells) {
      seen.add(cell.id);
      let visual = state.cells.get(cell.id);
      if (!visual) {
        visual = {
          id: cell.id,
          pid: player.id,
          x: cell.x,
          y: cell.y,
          tx: cell.x,
          ty: cell.y,
          vx: cell.vx,
          vy: cell.vy,
          mass: cell.mass,
          radius: radiusFor(cell.mass),
          targetRadius: radiusFor(cell.mass),
          hue: meta?.hue ?? 168,
          name: meta?.name ?? 'organism',
          bot: meta?.bot ?? false,
          lastSeen: now,
          mergeReady: cell.mergeReady
        };
        visual.soft = new SoftBody(RING_COUNT, hexSeed(cell.id * 1013 + 71));
        visual.soft.reset(cell.x, cell.y, radiusFor(cell.mass));
        visual.meshData = new Float32Array((RING_COUNT + 2) * 5);
        visual.meshVAO = null;
        visual.meshBuffer = null;
        state.cells.set(cell.id, visual);
      }
      visual.pid = player.id;
      if (player.id === state.me && state.joined && !state.dead) {
        const errorX = cell.x - visual.tx;
        const errorY = cell.y - visual.ty;
        if (Math.hypot(errorX, errorY) > 140) {
          visual.tx += errorX * 0.45;
          visual.ty += errorY * 0.45;
        }
      } else {
        visual.tx = cell.x + cell.vx * 0.055;
        visual.ty = cell.y + cell.vy * 0.055;
      }
      visual.vx = cell.vx;
      visual.vy = cell.vy;
      visual.mass = cell.mass;
      visual.targetRadius = radiusFor(cell.mass);
      visual.hue = meta?.hue ?? visual.hue;
      visual.name = meta?.name ?? visual.name;
      visual.bot = meta?.bot ?? visual.bot;
      visual.lastSeen = now;
      visual.mergeReady = cell.mergeReady;
      if (player.id === state.me && !state.targetReady) {
        state.target.x = cell.x;
        state.target.y = cell.y;
        state.targetReady = true;
        state.camera.x = cell.x;
        state.camera.y = cell.y;
      }
    }
  }
  for (const [id, cell] of state.cells) {
    if (!seen.has(id) && now - cell.lastSeen > 850) removeCell(id);
  }
  for (const event of snapshot.events) processEvent(event);
}

function processCreature(message) {
  const now = performance.now();
  const seen = new Set();
  for (const creature of message.creatures) {
    seen.add(creature.id);
    let visual = state.creatures.get(creature.id);
    if (!visual) {
      visual = { id: creature.id, x: creature.x, y: creature.y, tx: creature.x, ty: creature.y, radius: creature.radius, kind: creature.kind, color: creature.color, angle: 0, targetAngle: creature.angle, phase: creature.phase, lastSeen: now };
      state.creatures.set(creature.id, visual);
    }
    visual.tx = creature.x;
    visual.ty = creature.y;
    visual.radius = creature.radius;
    visual.kind = creature.kind;
    visual.color = creature.color;
    visual.targetAngle = creature.angle;
    visual.phase = creature.phase;
    visual.lastSeen = now;
  }
  for (const [id, creature] of state.creatures) {
    if (!seen.has(id)) state.creatures.delete(id);
  }
}

function processFood(message) {
  const now = performance.now();
  const seen = new Set();
  for (const food of message.food) {
    seen.add(food.id);
    let visual = state.food.get(food.id);
    if (!visual) {
      visual = {
        id: food.id,
        x: food.x,
        y: food.y,
        tx: food.x,
        ty: food.y,
        radius: food.radius,
        targetRadius: food.radius,
        color: food.color,
        ejecta: food.ejecta,
        alpha: 0,
        targetAlpha: 1,
        lastSeen: now,
        phase: Math.random() * 10
      };
      state.food.set(food.id, visual);
    }
    visual.tx = food.x;
    visual.ty = food.y;
    visual.targetRadius = food.radius;
    visual.color = food.color;
    visual.ejecta = food.ejecta;
    visual.targetAlpha = 1;
    visual.lastSeen = now;
  }
  for (const [id, food] of state.food) {
    if (!seen.has(id)) {
      food.targetAlpha = 0;
      if (now - food.lastSeen > 2400 || food.alpha < 0.01) state.food.delete(id);
    }
  }
}

const net = new Net({
  onOpen: () => {
    if (!state.joined) showStatus('linked to the culture', 1400);
  },
  onClose: () => {
    showStatus('signal lost — rejoining', 3000);
  },
  onWelcome: (message) => {
    state.me = message.id;
    state.hue = message.hue;
    state.joined = true;
    state.dead = false;
    state.targetReady = false;
    deathScreen.hidden = true;
    intro.classList.add('leaving');
    hud.hidden = false;
    specimenName.textContent = message.name;
    resetDecor();
    startAmbience();
    showStatus('you are in the suspension', 1600);
  },
  onRoster: (players) => {
    const next = new Map();
    for (const player of players) next.set(player.id, player);
    state.roster = next;
    updateOccupancy();
  },
  onSnapshot: processSnapshot,
  onFood: processFood,
  onCreature: processCreature,
  onDead: (by) => {
    state.dead = true;
    killerLabel.textContent = by || 'the culture';
    deathScreen.hidden = false;
    state.camera.shake = 7;
    playSfx('death', 1);
    stopJoystick();
    showStatus('membrane compromised', 2200);
  },
  onRespawned: () => {
    state.dead = false;
    state.joined = true;
    state.targetReady = false;
    deathScreen.hidden = true;
    showStatus('re-entered the suspension', 1400);
  },
  onFull: () => {
    enterButton.disabled = false;
    enterButton.querySelector('span').textContent = 'Enter the suspension';
    showStatus('the culture is full', 2600);
  }
});

function updateOccupancy() {
  const count = state.roster.size;
  if (occupantsLabel) occupantsLabel.textContent = `${count} organisms`;
  if (onlineLabel) onlineLabel.textContent = `${count} organisms present`;
}

function buildSwatches() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem('squish.identity') || 'null');
  } catch {
    saved = null;
  }
  if (saved && typeof saved.name === 'string') nameInput.value = saved.name;
  return;
  for (const hue of palette) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.style.setProperty('--tint', cssColor(hue));
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-label', `Fluorophore ${hue}`);
    button.setAttribute('aria-checked', hue === Math.round(state.hue) ? 'true' : 'false');
    button.addEventListener('click', () => {
      state.hue = hue;
      for (const child of swatches.children) child.setAttribute('aria-checked', 'false');
      button.setAttribute('aria-checked', 'true');
    });
    swatches.appendChild(button);
  }
}

buildSwatches();

joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (state.joined) return;
  const name = nameInput.value.trim().slice(0, 16) || 'Unnamed organism';
  localStorage.setItem('squish.identity', JSON.stringify({ name }));
  enterButton.disabled = true;
  enterButton.querySelector('span').textContent = 'Entering…';
  net.join(name, -1);
});

nameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') event.stopPropagation();
});

respawnButton.addEventListener('click', () => {
  deathScreen.hidden = true;
  net.respawn();
});

splitButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  event.stopPropagation();
  net.split();
  if (navigator.vibrate) navigator.vibrate(8);
});

ejectButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  event.stopPropagation();
  net.eject();
  if (navigator.vibrate) navigator.vibrate(6);
});

splitButton.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
});

ejectButton.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
});

window.addEventListener('keydown', (event) => {
  if (event.target === nameInput) return;
  if (event.code === 'Space') {
    event.preventDefault();
    net.split();
    state.camera.shake = Math.max(state.camera.shake, 1.3);
  } else if (event.code === 'KeyW') {
    event.preventDefault();
    net.eject();
  } else if (event.code === 'KeyM') {
    toggleSound();
  }
});

function pointerWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const nx = (clientX - rect.left) / rect.width - 0.5;
  const ny = (clientY - rect.top) / rect.height - 0.5;
  return {
    x: state.camera.x + nx * state.camera.width,
    y: state.camera.y - ny * state.camera.height
  };
}

function playerCenter() {
  let x = 0;
  let y = 0;
  let mass = 0;
  for (const cell of state.cells.values()) {
    if (cell.pid !== state.me) continue;
    x += cell.x * cell.mass;
    y += cell.y * cell.mass;
    mass += cell.mass;
  }
  if (mass <= 0) return null;
  return { x: x / mass, y: y / mass, mass };
}

function ownCells() {
  const cells = [];
  for (const cell of state.cells.values()) if (cell.pid === state.me) cells.push(cell);
  return cells;
}

function stopJoystick() {
  state.joystick.active = false;
  state.joystick.id = null;
  if (joystick) joystick.hidden = true;
  const center = playerCenter();
  if (center) {
    state.target.x = center.x;
    state.target.y = center.y;
  }
}

function beginJoystick(event) {
  if (event.pointerType === 'mouse') return false;
  if (event.clientX > window.innerWidth * 0.52) return false;
  if (!playerCenter()) return false;
  state.joystick.active = true;
  state.joystick.id = event.pointerId;
  state.joystick.x = event.clientX;
  state.joystick.y = event.clientY;
  state.joystick.dx = 0;
  state.joystick.dy = 0;
  joystick.hidden = false;
  joystick.style.left = `${event.clientX}px`;
  joystick.style.top = `${event.clientY}px`;
  joystickKnob.style.transform = 'translate(-50%, -50%)';
  return true;
}

function moveJoystick(event) {
  if (!state.joystick.active || event.pointerId !== state.joystick.id) return;
  let dx = event.clientX - state.joystick.x;
  let dy = event.clientY - state.joystick.y;
  const length = Math.hypot(dx, dy);
  const limit = 52;
  if (length > limit) {
    dx = dx / length * limit;
    dy = dy / length * limit;
  }
  state.joystick.dx = dx / limit;
  state.joystick.dy = dy / limit;
  joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}

const activePointers = new Map();
const pinch = { active: false, distance: 0, zoom: 1 };

canvas.addEventListener('pointerdown', (event) => {
  if (!intro.classList.contains('leaving') || state.dead) return;
  if (event.pointerType === 'mouse') {
    if (event.button !== 0) return;
    const world = pointerWorld(event.clientX, event.clientY);
    state.target.x = world.x;
    state.target.y = world.y;
    return;
  }
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size === 2) {
    stopJoystick();
    const [a, b] = [...activePointers.values()];
    pinch.active = true;
    pinch.distance = Math.hypot(a.x - b.x, a.y - b.y);
    pinch.zoom = zoomState.target;
    event.preventDefault();
    return;
  }
  if (activePointers.size > 2) return;
  if (beginJoystick(event)) {
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
  }
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  zoomState.target = clamp(zoomState.target * Math.exp(event.deltaY * 0.0012), 0.72, 1.5);
}, { passive: false });

canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'mouse') {
    const world = pointerWorld(event.clientX, event.clientY);
    state.target.x = world.x;
    state.target.y = world.y;
    return;
  }
  if (activePointers.has(event.pointerId)) {
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }
  if (pinch.active && activePointers.size === 2) {
    const [a, b] = [...activePointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch.distance > 8) {
      zoomState.target = clamp(pinch.zoom * (pinch.distance / Math.max(distance, 8)), 0.72, 1.5);
    }
    return;
  }
  moveJoystick(event);
});

window.addEventListener('pointermove', (event) => {
  if (event.pointerType !== 'mouse') moveJoystick(event);
});

window.addEventListener('pointerup', (event) => {
  activePointers.delete(event.pointerId);
  if (activePointers.size < 2) pinch.active = false;
  if (state.joystick.active && event.pointerId === state.joystick.id) stopJoystick();
});

window.addEventListener('pointercancel', (event) => {
  activePointers.delete(event.pointerId);
  if (activePointers.size < 2) pinch.active = false;
  if (state.joystick.active && event.pointerId === state.joystick.id) stopJoystick();
});

canvas.addEventListener('contextmenu', (event) => event.preventDefault());

let audio = null;
let soundMuted = false;

function startAmbience() {
  if (audio || soundMuted) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const master = context.createGain();
    master.gain.value = 0.6;
    master.connect(context.destination);
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 310;
    lowpass.Q.value = 0.8;
    lowpass.connect(master);
    const droneGain = context.createGain();
    droneGain.gain.value = 0.022;
    droneGain.connect(lowpass);
    const droneA = context.createOscillator();
    droneA.type = 'sine';
    droneA.frequency.value = 54;
    const droneB = context.createOscillator();
    droneB.type = 'sine';
    droneB.frequency.value = 81.7;
    const droneC = context.createOscillator();
    droneC.type = 'triangle';
    droneC.frequency.value = 108.6;
    droneA.connect(droneGain);
    droneB.connect(droneGain);
    droneC.connect(droneGain);
    droneA.start();
    droneB.start();
    droneC.start();
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    lfo.frequency.value = 0.06;
    lfoGain.gain.value = 3.4;
    lfo.connect(lfoGain);
    lfoGain.connect(droneB.frequency);
    lfo.start();
    const noiseBuffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
    const channel = noiseBuffer.getChannelData(0);
    for (let i = 0; i < channel.length; i += 1) channel[i] = (Math.random() * 2 - 1) * 0.7;
    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const noiseFilter = context.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 480;
    noiseFilter.Q.value = 0.7;
    const noiseGain = context.createGain();
    noiseGain.gain.value = 0.006;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);
    noise.start();
    audio = { context, master, droneA, droneB, droneC, lfo, noise, noiseBuffer };
    if (context.state === 'suspended') context.resume().catch(() => {});
    scheduleBubble();
  } catch {
    audio = null;
  }
}

const sfxTimes = new Map();

function playSfx(name, volume) {
  if (!audio || soundMuted) return;
  const context = audio.context;
  const now = context.currentTime;
  const last = sfxTimes.get(name) || 0;
  if (now - last < 0.05) return;
  sfxTimes.set(name, now);
  const level = clamp(volume ?? 1, 0, 1);
  const tone = (type, from, to, duration, gainValue, delay) => {
    const start = now + (delay || 0);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(to, 1), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(gainValue * level, 0.0002), start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(audio.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  };
  const hiss = (from, to, duration, gainValue, q) => {
    const source = context.createBufferSource();
    source.buffer = audio.noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q || 1.1;
    filter.frequency.setValueAtTime(from, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(to, 40), now + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(gainValue * level, 0.0002), now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audio.master);
    source.start(now);
    source.stop(now + duration + 0.02);
  };
  if (name === 'eat') {
    tone('sine', 210, 96, 0.13, 0.05);
    hiss(1400, 500, 0.07, 0.02, 1.6);
  } else if (name === 'split') {
    hiss(420, 2400, 0.26, 0.055, 0.9);
    tone('sine', 150, 70, 0.2, 0.035);
  } else if (name === 'spit') {
    tone('triangle', 420, 170, 0.1, 0.04);
    hiss(900, 260, 0.12, 0.02, 1.4);
  } else if (name === 'merge') {
    tone('sine', 128, 62, 0.42, 0.06);
    tone('sine', 760, 470, 0.28, 0.022, 0.03);
    hiss(620, 180, 0.34, 0.03, 0.8);
  } else if (name === 'death') {
    tone('sawtooth', 190, 46, 0.85, 0.06);
    hiss(500, 90, 0.9, 0.03, 0.7);
  }
}

function scheduleBubble() {
  if (!audio || soundMuted) return;
  const delay = 2600 + Math.random() * 5200;
  audio.timer = setTimeout(() => {
    if (!audio || soundMuted) return;
    const context = audio.context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(240 + Math.random() * 600, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(120 + Math.random() * 220, context.currentTime + 0.18);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.018, context.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.24);
    oscillator.connect(gain);
    gain.connect(audio.master);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.28);
    scheduleBubble();
  }, delay);
}

function toggleSound() {
  soundMuted = !soundMuted;
  soundButton.setAttribute('aria-pressed', String(soundMuted));
  soundButton.setAttribute('aria-label', soundMuted ? 'Unmute sound' : 'Mute sound');
  if (soundMuted) {
    if (audio) {
      audio.master.gain.setTargetAtTime(0.0001, audio.context.currentTime, 0.15);
      clearTimeout(audio.timer);
    }
  } else {
    startAmbience();
    if (audio) {
      audio.master.gain.setTargetAtTime(0.6, audio.context.currentTime, 0.3);
      scheduleBubble();
    }
  }
}

soundButton.addEventListener('click', toggleSound);

function updateCamera(dt) {
  const center = playerCenter();
  const time = state.time;
  let targetX;
  let targetY;
  let targetWidth;
  if (center && !state.dead) {
    const baseWidth = Math.max(390, Math.min(2100, canvas.clientWidth * 1.12));
    const zoom = Math.pow(Math.max(center.mass / 55, 1), 0.42);
    targetWidth = clamp(baseWidth * zoom * zoomState.value, 380, 3600);
    targetX = center.x;
    targetY = center.y;
    let vx = 0;
    let vy = 0;
    for (const cell of state.cells.values()) {
      if (cell.pid === state.me) {
        vx += cell.vx * cell.mass;
        vy += cell.vy * cell.mass;
      }
    }
    targetX += (vx / Math.max(center.mass, 1)) * 0.045;
    targetY += (vy / Math.max(center.mass, 1)) * 0.045;
  } else if (state.joined && state.dead) {
    targetX = state.camera.x;
    targetY = state.camera.y;
    targetWidth = state.camera.width;
  } else {
    let subject = null;
    for (const cell of state.cells.values()) {
      if (!subject || cell.radius > subject.radius) subject = cell;
    }
    const drift = time * 0.07 + state.attractSeed;
    const baseWidth = Math.max(500, Math.min(2200, canvas.clientWidth * 1.25));
    if (subject) {
      targetX = subject.x + Math.cos(drift) * subject.radius * 2.6;
      targetY = subject.y + Math.sin(drift * 0.89) * subject.radius * 2.6;
      targetWidth = clamp(baseWidth * 1.02 + subject.radius * 3.8, 580, 2600);
    } else {
      targetX = WORLD_CENTER + Math.cos(drift) * 780;
      targetY = WORLD_CENTER + Math.sin(drift * 0.83) * 420;
      targetWidth = baseWidth * 1.15;
    }
  }
  const aspect = screenWidth / Math.max(screenHeight, 1);
  zoomState.value += (zoomState.target - zoomState.value) * (1 - Math.exp(-dt * 9));
  const centerBlend = 1 - Math.exp(-dt * (state.joined ? 8.2 : 3.6));
  const widthBlend = 1 - Math.exp(-dt * 1.7);
  state.camera.x = lerp(state.camera.x, targetX, centerBlend);
  state.camera.y = lerp(state.camera.y, targetY, centerBlend);
  state.camera.width = lerp(state.camera.width, targetWidth, widthBlend);
  state.camera.height = state.camera.width / aspect;
  const halfW = state.camera.width / 2;
  const halfH = state.camera.height / 2;
  state.camera.x = state.camera.width >= WORLD ? WORLD_CENTER : clamp(state.camera.x, halfW, WORLD - halfW);
  state.camera.y = state.camera.height >= WORLD ? WORLD_CENTER : clamp(state.camera.y, halfH, WORLD - halfH);
  state.camera.shake *= Math.exp(-dt * 7);
  const tremor = state.joined ? 0.32 : 0.75;
  state.camera.ox = (Math.random() - 0.5) * state.camera.shake + Math.sin(time * 1.7) * tremor;
  state.camera.oy = (Math.random() - 0.5) * state.camera.shake + Math.cos(time * 1.31) * tremor;
}

function updateIngestions(dt) {
  for (let i = state.ingestions.length - 1; i >= 0; i -= 1) {
    const item = state.ingestions[i];
    const host = state.cells.get(item.cellId);
    if (!host) {
      state.ingestions.splice(i, 1);
      continue;
    }
    item.life -= dt;
    const progress = clamp(1 - item.life / item.maxLife, 0, 1);
    const ease = progress * progress * (3 - 2 * progress);
    const targetX = host.x + item.entryX * host.radius;
    const targetY = host.y + item.entryY * host.radius;
    item.x = lerp(item.sx, targetX, ease);
    item.y = lerp(item.sy, targetY, ease);
    item.alpha = item.life < 0.07 ? clamp(item.life / 0.07, 0, 1) : 1;
    if (item.life <= 0) {
      const record = interiorFor(host);
      const size = clamp(item.radius / Math.max(host.radius, 1), 0.02, 0.32);
      const tangentSign = Math.random() < 0.5 ? -1 : 1;
      const inward = 0.12;
      const swirl = 0.22 + size * 0.6;
      const vx = -item.entryX * inward + (-item.entryY * tangentSign) * swirl;
      const vy = -item.entryY * inward + (item.entryX * tangentSign) * swirl;
      record.interior.addFood(item.entryX, item.entryY, item.color, 1, size, vx, vy);
      record.interior.addDye(item.entryX, item.entryY, item.color, 0.07);
      if (host.soft) host.soft.kickBody(0.045);
      state.splats.push({ x: host.x, y: host.y, radius: host.radius * 1.3, color: item.color, strength: 0.08, vx: 0, vy: 0 });
      for (let j = 0; j < 2; j += 1) {
        spawnDebris(host.x + randomRange(-6, 6), host.y + randomRange(-6, 6), item.color, {
          vx: randomRange(-20, 20),
          vy: randomRange(-20, 20),
          size: randomRange(1, 2.8),
          type: 0,
          life: randomRange(2, 5),
          front: false
        });
      }
      state.ingestions.splice(i, 1);
    }
  }
}

function updateMergeGhosts(dt) {
  for (let i = state.mergeGhosts.length - 1; i >= 0; i -= 1) {
    const item = state.mergeGhosts[i];
    const survivor = state.cells.get(item.survivorId);
    if (!survivor) {
      if (item.cell.meshVAO) gl.deleteVertexArray(item.cell.meshVAO);
      if (item.cell.meshBuffer) gl.deleteBuffer(item.cell.meshBuffer);
      if (item.record.texture) gl.deleteTexture(item.record.texture);
      state.mergeGhosts.splice(i, 1);
      continue;
    }
    item.life -= dt;
    const progress = clamp(1 - item.life / item.maxLife, 0, 1);
    const ease = progress * progress * (3 - 2 * progress);
    const cell = item.cell;
    cell.x = lerp(item.startX, survivor.x, ease);
    cell.y = lerp(item.startY, survivor.y, ease);
    cell.radius = lerp(item.startRadius, survivor.radius * 0.28, ease);
    cell.vx = survivor.vx;
    cell.vy = survivor.vy;
    if (cell.soft) cell.soft.update(dt, cell.x, cell.y, cell.radius, survivor.vx, survivor.vy, [], sampleClientFlow);
    const simulated = item.record.interior.step(dt, cell);
    if (item.record.texture && (simulated || item.record.interior.dirty)) syncInteriorTexture(item.record);
    item.record.colorTimer = (item.record.colorTimer || 0) + dt;
    if (item.record.colorTimer > 0.16) {
      item.record.fluidColor = item.record.interior.averageColor();
      item.record.colorTimer = 0;
    }
    const hostRecord = interiorFor(survivor);
    const spread = clamp(item.startRadius / Math.max(survivor.radius, 1), 0.1, 0.95);
    item.mergeTimer += dt;
    if (item.mergeTimer > 0.09) {
      hostRecord.interior.mergeFrom(item.record.interior, (cell.x - survivor.x) / Math.max(survivor.radius, 1), (cell.y - survivor.y) / Math.max(survivor.radius, 1), 0.12, spread);
      item.mergeTimer = 0;
    }
    if (item.life <= 0) {
      hostRecord.interior.mergeFrom(item.record.interior, 0, 0, 1.1, spread);
      hostRecord.interior.transferFoodFrom(item.record.interior, 0, 0, spread);
      hostRecord.fluidColor = hostRecord.interior.averageColor();
      syncInteriorTexture(hostRecord);
      if (item.cell.meshVAO) gl.deleteVertexArray(item.cell.meshVAO);
      if (item.cell.meshBuffer) gl.deleteBuffer(item.cell.meshBuffer);
      if (item.record.texture) gl.deleteTexture(item.record.texture);
      state.mergeGhosts.splice(i, 1);
    }
  }
}

function updateSimulation(dt) {
  const now = performance.now();
  for (const cell of state.cells.values()) {
    if (cell.pid === state.me && state.joined && !state.dead && state.targetReady) {
      const dx = state.target.x - cell.tx;
      const dy = state.target.y - cell.ty;
      const distance = Math.hypot(dx, dy);
      if (distance > 2) {
        const speed = Math.max(120, Math.hypot(cell.vx, cell.vy) * 1.05);
        const step = Math.min(distance, speed * dt);
        cell.tx += (dx / distance) * step;
        cell.ty += (dy / distance) * step;
      }
    }
    cell.x = lerp(cell.x, cell.tx, 1 - Math.exp(-dt * 10.5));
    cell.y = lerp(cell.y, cell.ty, 1 - Math.exp(-dt * 10.5));
    cell.radius = lerp(cell.radius, cell.targetRadius, 1 - Math.exp(-dt * 6.2));
    const record = state.interiors.get(cell.id);
    if (record) record.lastSeen = now;
  }
  for (const creature of state.creatures.values()) {
    creature.x = lerp(creature.x, creature.tx, 1 - Math.exp(-dt * 9));
    creature.y = lerp(creature.y, creature.ty, 1 - Math.exp(-dt * 9));
    let diff = creature.targetAngle - creature.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    creature.angle += diff * (1 - Math.exp(-dt * 5));
  }
  const cellList = [...state.cells.values()];
  for (const cell of cellList) {
    if (!cell.soft) {
      cell.soft = new SoftBody(RING_COUNT, hexSeed(cell.id * 1013 + 71));
      cell.soft.reset(cell.x, cell.y, cell.radius);
    }
    const neighbors = [];
    for (const other of cellList) {
      if (other === cell) continue;
      const distance = Math.hypot(other.x - cell.x, other.y - cell.y);
      if (distance < (cell.radius + other.radius) * 1.35) neighbors.push(other);
    }
    cell.soft.update(dt, cell.x, cell.y, cell.radius, cell.vx, cell.vy, neighbors, sampleClientFlow);
  }
  for (const cell of state.cells.values()) {
    const visible = Math.abs(cell.x - state.camera.x) < state.camera.width * 0.75 + cell.radius * 3 &&
      Math.abs(cell.y - state.camera.y) < state.camera.height * 0.75 + cell.radius * 3;
    if (!visible && cell.pid !== state.me) continue;
    const record = interiorFor(cell);
    const simulated = record.interior.step(dt, cell);
    if (simulated || record.interior.dirty) syncInteriorTexture(record);
    record.colorTimer = (record.colorTimer || 0) + dt;
    if (record.colorTimer > 0.18) {
      const average = record.interior.averageColor();
      const previous = record.fluidColor || average;
      record.fluidColor = [
        previous[0] + (average[0] - previous[0]) * 0.25,
        previous[1] + (average[1] - previous[1]) * 0.25,
        previous[2] + (average[2] - previous[2]) * 0.25
      ];
      record.colorTimer = 0;
    }
  }
  for (const [id, record] of state.interiors) {
    if (now - record.lastSeen > 14000) {
      if (record.texture) gl.deleteTexture(record.texture);
      state.interiors.delete(id);
    }
  }
  for (let i = state.spitTints.length - 1; i >= 0; i -= 1) {
    const tint = state.spitTints[i];
    tint.life -= dt;
    if (tint.life <= 0) {
      state.spitTints.splice(i, 1);
      continue;
    }
    for (const food of state.food.values()) {
      if (!food.ejecta) continue;
      if (Math.hypot(food.x - tint.x, food.y - tint.y) < 130) food.color = tint.color;
    }
  }
  for (const food of state.food.values()) {
    food.x = lerp(food.x, food.tx, 1 - Math.exp(-dt * 8));
    food.y = lerp(food.y, food.ty, 1 - Math.exp(-dt * 8));
    food.radius = lerp(food.radius, food.targetRadius, 1 - Math.exp(-dt * 7));
    food.alpha = lerp(food.alpha, food.targetAlpha, 1 - Math.exp(-dt * 8));
  }
  updateIngestions(dt);
  updateMergeGhosts(dt);
  maintainDecor(dt);
  updateCamera(dt);
  if (state.joystick.active) {
    const center = playerCenter();
    if (center) {
      const length = Math.hypot(state.joystick.dx, state.joystick.dy);
      if (length > 0.08) {
        state.target.x = center.x + (state.joystick.dx / length) * 640;
        state.target.y = center.y + (state.joystick.dy / length) * 640;
      } else {
        state.target.x = center.x;
        state.target.y = center.y;
      }
    }
  }
  const nowMs = performance.now();
  if (state.joined && !state.dead && nowMs - state.lastInput > 52 && playerCenter()) {
    net.input(state.target.x, state.target.y);
    state.lastInput = nowMs;
  }
  if (nowMs - state.lastView > 900) {
    net.view(state.camera.x, state.camera.y);
    state.lastView = nowMs;
  }
}

function refreshRosterColors() {
  const now = performance.now();
  if (now - (state.colorRefresh || 0) < 1800) return;
  state.colorRefresh = now;
  const totals = new Map();
  for (const cell of state.cells.values()) {
    const record = state.interiors.get(cell.id);
    if (!record) continue;
    const color = record.fluidColor || record.interior.averageColor();
    const entry = totals.get(cell.pid) || [0, 0, 0, 0];
    entry[0] += color[0];
    entry[1] += color[1];
    entry[2] += color[2];
    entry[3] += 1;
    totals.set(cell.pid, entry);
  }
  const averaged = new Map();
  for (const [pid, entry] of totals) {
    const count = Math.max(entry[3], 1);
    averaged.set(pid, vividColor([entry[0] / count, entry[1] / count, entry[2] / count]));
  }
  state.rosterColor = averaged;
}

function updateUI(force = false) {
  const now = performance.now();
  if (!force && now - state.lastUi < 240) return;
  state.lastUi = now;
  const cells = ownCells();
  if (!state.targetReady && cells.length) {
    state.target.x = cells[0].x;
    state.target.y = cells[0].y;
    state.targetReady = true;
  }
  let mass = 0;
  for (const cell of cells) mass += cell.mass;
  const all = [];
  for (const player of state.roster.values()) {
    let playerMass = 0;
    let alive = false;
    for (const cell of state.cells.values()) {
      if (cell.pid === player.id) {
        playerMass += cell.mass;
        alive = true;
      }
    }
    if (alive) all.push({ ...player, mass: playerMass });
  }
  all.sort((a, b) => b.mass - a.mass);
  const rank = all.findIndex((player) => player.id === state.me);
  state.rank = rank >= 0 ? rank + 1 : 0;
  if (massLabel) massLabel.textContent = formatMass(mass);
  if (bodyCountLabel) bodyCountLabel.textContent = `${cells.length} ${cells.length === 1 ? 'body' : 'bodies'}`;
  if (rankLabel) rankLabel.textContent = state.rank ? `#${state.rank} of ${all.length}` : 'unranked';
  if (occupantsLabel) occupantsLabel.textContent = `${state.roster.size} organisms`;
  if (onlineLabel) onlineLabel.textContent = `${state.roster.size} organisms present`;
  refreshRosterColors();
  if (ranksList) {
    ranksList.innerHTML = '';
    const visible = all.slice(0, 6);
    if (state.rank > 6) {
      const self = all[state.rank - 1];
      if (self) visible.push(self);
    }
    for (const player of visible) {
      const item = document.createElement('li');
      if (player.id === state.me) item.className = 'you';
      const rankNo = document.createElement('span');
      rankNo.className = 'rank-no';
      rankNo.textContent = String(all.indexOf(player) + 1).padStart(2, '0');
      const name = document.createElement('span');
      name.className = 'name';
      const dot = document.createElement('span');
      dot.className = 'swatch-dot';
      const live = state.rosterColor ? state.rosterColor.get(player.id) : null;
      dot.style.color = live ? `rgb(${Math.round(live[0] * 255)} ${Math.round(live[1] * 255)} ${Math.round(live[2] * 255)})` : cssColor(player.hue);
      name.appendChild(dot);
      name.appendChild(document.createTextNode(player.name));
      const score = document.createElement('span');
      score.className = 'score';
      score.textContent = formatMass(player.mass);
      item.append(rankNo, name, score);
      ranksList.appendChild(item);
    }
  }
}

function clearLabels() {
  labelContext.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
}

function drawLabels() {
  if (!state.joined) return;
  clearLabels();
  if (!state.cells.size) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  labelContext.save();
  labelContext.textAlign = 'center';
  labelContext.textBaseline = 'middle';
  const largest = new Map();
  for (const cell of state.cells.values()) {
    if (cell.pid === state.me) continue;
    const current = largest.get(cell.pid);
    if (!current || cell.radius > current.radius) largest.set(cell.pid, cell);
  }
  for (const cell of largest.values()) {
    const screenX = (cell.x - state.camera.x) / state.camera.width * width + width / 2;
    const screenY = height / 2 - (cell.y - state.camera.y) / state.camera.height * height;
    const screenRadius = cell.radius / state.camera.width * width;
    if (screenX < -80 || screenX > width + 80 || screenY < -80 || screenY > height + 80) continue;
    if (screenRadius < 9) continue;
    const alpha = clamp((screenRadius - 9) / 26, 0.18, 0.74);
    labelContext.font = '500 9px "Plex Mono", monospace';
    labelContext.fillStyle = `rgba(212, 232, 222, ${alpha})`;
    const label = cell.name;
    const labelY = screenY + screenRadius + 15;
    labelContext.fillText(label, screenX, labelY);
    labelContext.beginPath();
    labelContext.fillStyle = `rgba(169, 237, 218, ${alpha * 0.55})`;
    labelContext.arc(screenX - labelContext.measureText(label).width / 2 - 8, labelY, 1.6, 0, Math.PI * 2);
    labelContext.fill();
  }
  labelContext.restore();
}

function seedFluid() {
  for (let pass = 0; pass < 8; pass += 1) {
    for (let i = 0; i < MAX_SPLATS; i += 1) {
      const x = Math.random() * WORLD;
      const y = Math.random() * WORLD;
      const color = worldColorAt(x, y, 0.82, 0.5);
      splatData[i * 4] = x / WORLD;
      splatData[i * 4 + 1] = y / WORLD;
      splatData[i * 4 + 2] = randomRange(0.012, 0.045);
      splatData[i * 4 + 3] = randomRange(0.25, 0.75);
      splatVelocityData[i * 2] = randomRange(-22, 22);
      splatVelocityData[i * 2 + 1] = randomRange(-22, 22);
      splatColorData[i * 3] = color[0] * 0.035;
      splatColorData[i * 3 + 1] = color[1] * 0.035;
      splatColorData[i * 3 + 2] = color[2] * 0.035;
    }
    splatFluid(0, MAX_SPLATS);
    splatFluid(1, MAX_SPLATS);
  }
}


function splatFluid(mode, count) {
  if (!count) return;
  const target = mode === 0 ? velocityTargets[velocityIndex] : dyeTargets[dyeIndex];
  const program = programs.splat;
  gl.useProgram(program.program);
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.viewport(0, 0, fluidSize, fluidSize);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.uniform1i(program.uniforms.get('uMode'), mode);
  gl.uniform1i(program.uniforms.get('uCount'), count);
  gl.uniform4fv(program.uniforms.get('uSplats'), splatData);
  gl.uniform2fv(program.uniforms.get('uSplatVelocity'), splatVelocityData);
  gl.uniform3fv(program.uniforms.get('uSplatColor'), splatColorData);
  gl.bindVertexArray(quadVAO);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.disable(gl.BLEND);
}

function buildSplats() {
  const center = { x: state.camera.x, y: state.camera.y };
  const candidates = [];
  for (const cell of state.cells.values()) {
    if (Math.abs(cell.x - center.x) > state.camera.width * 0.75 + cell.radius * 4) continue;
    if (Math.abs(cell.y - center.y) > state.camera.height * 0.75 + cell.radius * 4) continue;
    candidates.push(cell);
  }
  candidates.sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y));
  let count = 0;
  for (const cell of candidates) {
    const speed = Math.hypot(cell.vx, cell.vy);
    if (speed < 7) continue;
    const dirX = cell.vx / speed;
    const dirY = cell.vy / speed;
    const color = vividColor(cellFluidColor(cell));
    const emission = clamp(0.3 + speed / 700, 0.4, 1);
    const massScale = clamp(42 / cell.radius, 0.18, 1);
    const offset = Math.min(cell.radius * 0.5, 24);
    const behindX = cell.x - dirX * offset;
    const behindY = cell.y - dirY * offset;
    splatData[count * 4] = behindX / WORLD;
    splatData[count * 4 + 1] = behindY / WORLD;
    splatData[count * 4 + 2] = Math.max(0.0011, Math.min(cell.radius * 0.85, 44) / WORLD);
    splatData[count * 4 + 3] = 0.82;
    splatVelocityData[count * 2] = cell.vx * (fluidSize / WORLD) * 0.5;
    splatVelocityData[count * 2 + 1] = cell.vy * (fluidSize / WORLD) * 0.5;
    splatColorData[count * 3] = color[0] * 0.012 * emission * massScale;
    splatColorData[count * 3 + 1] = color[1] * 0.012 * emission * massScale;
    splatColorData[count * 3 + 2] = color[2] * 0.012 * emission * massScale;
    count += 1;
    if (count >= MAX_SPLATS) break;
  }
  for (const burst of state.splats) {
    if (count >= MAX_SPLATS) break;
    const color = burst.color;
    splatData[count * 4] = burst.x / WORLD;
    splatData[count * 4 + 1] = burst.y / WORLD;
    splatData[count * 4 + 2] = Math.max(0.0022, burst.radius / WORLD);
    splatData[count * 4 + 3] = burst.strength;
    splatVelocityData[count * 2] = burst.vx || 0;
    splatVelocityData[count * 2 + 1] = burst.vy || 0;
    splatColorData[count * 3] = color[0] * 0.22;
    splatColorData[count * 3 + 1] = color[1] * 0.22;
    splatColorData[count * 3 + 2] = color[2] * 0.22;
    count += 1;
  }
  state.splats = [];
  return count;
}


function stepFluid(dt) {
  const count = buildSplats();
  if (count > 0) {
    splatFluid(0, count);
    splatFluid(1, count);
  }
  gl.disable(gl.BLEND);
  let program = programs.advect;
  gl.useProgram(program.program);
  gl.bindFramebuffer(gl.FRAMEBUFFER, velocityTargets[1 - velocityIndex].framebuffer);
  gl.viewport(0, 0, fluidSize, fluidSize);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, velocityTargets[velocityIndex].texture);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, velocityTargets[velocityIndex].texture);
  gl.uniform1i(program.uniforms.get('uVelocity'), 0);
  gl.uniform1i(program.uniforms.get('uSource'), 1);
  gl.uniform2f(program.uniforms.get('uTexel'), texel, texel);
  gl.uniform1f(program.uniforms.get('uDt'), dt);
  gl.uniform1f(program.uniforms.get('uDissipation'), 0.992);
  gl.bindVertexArray(quadVAO);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  program = programs.divergence;
  gl.useProgram(program.program);
  gl.bindFramebuffer(gl.FRAMEBUFFER, divergenceTarget.framebuffer);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, velocityTargets[velocityIndex].texture);
  gl.uniform1i(program.uniforms.get('uVelocity'), 0);
  gl.uniform2f(program.uniforms.get('uTexel'), texel, texel);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  program = programs.pressure;
  gl.useProgram(program.program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, divergenceTarget.texture);
  gl.uniform1i(program.uniforms.get('uDivergence'), 0);
  gl.uniform2f(program.uniforms.get('uTexel'), texel, texel);
  const pressureIterations = coarsePointer ? 8 : 10;
  for (let iteration = 0; iteration < pressureIterations; iteration += 1) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, pressureTargets[1 - pressureIndex].framebuffer);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, pressureTargets[pressureIndex].texture);
    gl.uniform1i(program.uniforms.get('uPressure'), 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    pressureIndex = 1 - pressureIndex;
  }

  program = programs.gradient;
  gl.useProgram(program.program);
  gl.bindFramebuffer(gl.FRAMEBUFFER, velocityTargets[1 - velocityIndex].framebuffer);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, velocityTargets[velocityIndex].texture);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, pressureTargets[pressureIndex].texture);
  gl.uniform1i(program.uniforms.get('uVelocity'), 0);
  gl.uniform1i(program.uniforms.get('uPressure'), 1);
  gl.uniform2f(program.uniforms.get('uTexel'), texel, texel);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  velocityIndex = 1 - velocityIndex;

  program = programs.advect;
  gl.useProgram(program.program);
  gl.bindFramebuffer(gl.FRAMEBUFFER, dyeTargets[1 - dyeIndex].framebuffer);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, velocityTargets[velocityIndex].texture);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, dyeTargets[dyeIndex].texture);
  gl.uniform1i(program.uniforms.get('uVelocity'), 0);
  gl.uniform1i(program.uniforms.get('uSource'), 1);
  gl.uniform2f(program.uniforms.get('uTexel'), texel, texel);
  gl.uniform1f(program.uniforms.get('uDt'), dt);
  gl.uniform1f(program.uniforms.get('uDissipation'), 0.997);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  dyeIndex = 1 - dyeIndex;
  updateClientFlow(dt);
}

function setViewUniforms(program) {
  gl.uniform2f(program.uniforms.get('uCamera'), state.camera.x + state.camera.ox, state.camera.y + state.camera.oy);
  gl.uniform2f(program.uniforms.get('uView'), state.camera.width, state.camera.height);
}

function buildLights() {
  const candidates = [];
  for (const cell of state.cells.values()) {
    if (Math.abs(cell.x - state.camera.x) > state.camera.width * 0.65 + cell.radius) continue;
    if (Math.abs(cell.y - state.camera.y) > state.camera.height * 0.65 + cell.radius) continue;
    candidates.push(cell);
  }
  candidates.sort((a, b) => b.radius - a.radius);
  lightCount = Math.min(MAX_LIGHTS, candidates.length);
  for (let i = 0; i < lightCount; i += 1) {
    const cell = candidates[i];
    const color = vividColor(cellFluidColor(cell));
    lightPositions[i * 2] = cell.x;
    lightPositions[i * 2 + 1] = cell.y;
    lightColors[i * 3] = color[0];
    lightColors[i * 3 + 1] = color[1];
    lightColors[i * 3 + 2] = color[2];
    lightRadii[i] = cell.radius * 3.2;
    lightIntensities[i] = clamp(cell.radius / 60, 0.4, 1.6);
  }
}

function drawBase(time) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, baseTarget.framebuffer);
  gl.viewport(0, 0, screenWidth, screenHeight);
  gl.disable(gl.BLEND);
  gl.clearColor(0.002, 0.006, 0.006, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const program = programs.background;
  gl.useProgram(program.program);
  setViewUniforms(program);
  gl.uniform1f(program.uniforms.get('uTime'), time);
  gl.uniform1f(program.uniforms.get('uWorld'), WORLD);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, dyeTargets[dyeIndex].texture);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, velocityTargets[velocityIndex].texture);
  gl.uniform1i(program.uniforms.get('uDye'), 0);
  gl.uniform1i(program.uniforms.get('uVelocity'), 1);
  buildLights();
  gl.uniform1i(program.uniforms.get('uLightCount'), lightCount);
  gl.uniform2fv(program.uniforms.get('uLightPos'), lightPositions);
  gl.uniform3fv(program.uniforms.get('uLightColor'), lightColors);
  gl.uniform1fv(program.uniforms.get('uLightRadius'), lightRadii);
  gl.uniform1fv(program.uniforms.get('uLightIntensity'), lightIntensities);
  gl.bindVertexArray(quadVAO);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  drawCreatures(time);
  drawFood(time);
  drawDebris(false, time);
  drawShadows();
  drawHalos();
}

function cellFluidColor(cell) {
  const record = interiorFor(cell);
  if (!record.fluidColor) record.fluidColor = record.interior.averageColor();
  return record.fluidColor;
}

function drawShadows() {
  if (!state.cells.size) return;
  let count = 0;
  for (const cell of state.cells.values()) {
    if (Math.abs(cell.x - state.camera.x) > state.camera.width * 0.75 + cell.radius * 2) continue;
    if (Math.abs(cell.y - state.camera.y) > state.camera.height * 0.75 + cell.radius * 2) continue;
    const index = count * 8;
    shadowData[index] = cell.x;
    shadowData[index + 1] = cell.y;
    shadowData[index + 2] = cell.radius * 1.7;
    shadowData[index + 3] = 1;
    shadowData[index + 4] = 0;
    shadowData[index + 5] = 0;
    shadowData[index + 6] = 0;
    shadowData[index + 7] = 1;
    count += 1;
    if (count >= 1024) break;
  }
  if (!count) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, shadowMesh.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, shadowData.subarray(0, count * 8), gl.DYNAMIC_DRAW);
  gl.bindVertexArray(shadowMesh.vao);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const program = programs.shadow;
  gl.useProgram(program.program);
  setViewUniforms(program);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  gl.disable(gl.BLEND);
}

function drawHalos() {
  if (!state.cells.size) return;
  let count = 0;
  for (const cell of state.cells.values()) {
    if (Math.abs(cell.x - state.camera.x) > state.camera.width * 0.75 + cell.radius * 2) continue;
    if (Math.abs(cell.y - state.camera.y) > state.camera.height * 0.75 + cell.radius * 2) continue;
    const color = vividColor(cellFluidColor(cell));
    const index = count * 8;
    haloData[index] = cell.x;
    haloData[index + 1] = cell.y;
    haloData[index + 2] = cell.radius * 2.0;
    haloData[index + 3] = 0.34;
    haloData[index + 4] = color[0];
    haloData[index + 5] = color[1];
    haloData[index + 6] = color[2];
    haloData[index + 7] = 0.3;
    count += 1;
    if (count >= 1024) break;
  }
  if (!count) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, haloMesh.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, haloData.subarray(0, count * 8), gl.DYNAMIC_DRAW);
  gl.bindVertexArray(haloMesh.vao);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  const program = programs.halo;
  gl.useProgram(program.program);
  setViewUniforms(program);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  gl.disable(gl.BLEND);
}

function drawCreatures(time) {
  if (!state.creatures.size) return;
  let count = 0;
  const camera = state.camera;
  for (const creature of state.creatures.values()) {
    if (Math.abs(creature.x - camera.x) > camera.width * 0.62 + 60) continue;
    if (Math.abs(creature.y - camera.y) > camera.height * 0.62 + 60) continue;
    const index = count * 12;
    creatureData[index] = creature.x;
    creatureData[index + 1] = creature.y;
    creatureData[index + 2] = creature.radius * 2.1;
    creatureData[index + 3] = creature.kind;
    creatureData[index + 4] = creature.color[0];
    creatureData[index + 5] = creature.color[1];
    creatureData[index + 6] = creature.color[2];
    creatureData[index + 7] = creature.angle;
    creatureData[index + 8] = creature.phase + time;
    creatureData[index + 9] = 0;
    creatureData[index + 10] = 0;
    creatureData[index + 11] = 0;
    count += 1;
    if (count >= 128) break;
  }
  if (!count) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, creatureMesh.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, creatureData.subarray(0, count * 12), gl.DYNAMIC_DRAW);
  gl.bindVertexArray(creatureMesh.vao);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const program = programs.creature;
  gl.useProgram(program.program);
  setViewUniforms(program);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  gl.disable(gl.BLEND);
}

function drawFood(time) {
  let count = 0;
  const camera = state.camera;
  for (const food of state.food.values()) {
    if (food.alpha < 0.015) continue;
    if (Math.abs(food.x - camera.x) > camera.width * 0.65 + 80) continue;
    if (Math.abs(food.y - camera.y) > camera.height * 0.65 + 80) continue;
    const index = count * 8;
    foodData[index] = food.x;
    foodData[index + 1] = food.y;
    foodData[index + 2] = food.radius * 2.1;
    foodData[index + 3] = food.phase;
    foodData[index + 4] = food.color[0];
    foodData[index + 5] = food.color[1];
    foodData[index + 6] = food.color[2];
    foodData[index + 7] = 1;
    count += 1;
    if (count >= 2048) break;
  }
  if (!count) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, foodMesh.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, foodData.subarray(0, count * 8), gl.DYNAMIC_DRAW);
  gl.bindVertexArray(foodMesh.vao);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const program = programs.food;
  gl.useProgram(program.program);
  setViewUniforms(program);
  gl.uniform1f(program.uniforms.get('uTime'), time);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  gl.disable(gl.BLEND);
}

function drawDebris(front, time) {
  let count = 0;
  const camera = state.camera;
  for (const particle of debris) {
    if (particle.front !== front) continue;
    if (Math.abs(particle.x - camera.x) > camera.width * 0.7 + 100) continue;
    if (Math.abs(particle.y - camera.y) > camera.height * 0.7 + 100) continue;
    const index = count * 8;
    debrisData[index] = particle.x;
    debrisData[index + 1] = particle.y;
    debrisData[index + 2] = particle.size;
    debrisData[index + 3] = particle.type;
    debrisData[index + 4] = particle.color[0];
    debrisData[index + 5] = particle.color[1];
    debrisData[index + 6] = particle.color[2];
    debrisData[index + 7] = particle.seed;
    count += 1;
    if (count >= 512) break;
  }
  if (!count) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, debrisMesh.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, debrisData.subarray(0, count * 8), gl.DYNAMIC_DRAW);
  gl.bindVertexArray(debrisMesh.vao);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const program = programs.debris;
  gl.useProgram(program.program);
  setViewUniforms(program);
  gl.uniform1f(program.uniforms.get('uTime'), time);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  gl.disable(gl.BLEND);
}

function drawBubbles(front) {
  let count = 0;
  const camera = state.camera;
  for (const bubble of bubbles) {
    if (bubble.front !== front) continue;
    if (Math.abs(bubble.x - camera.x) > camera.width * 0.7 + 80) continue;
    if (Math.abs(bubble.y - camera.y) > camera.height * 0.7 + 80) continue;
    const index = count * 4;
    bubbleData[index] = bubble.x;
    bubbleData[index + 1] = bubble.y;
    bubbleData[index + 2] = bubble.size;
    bubbleData[index + 3] = bubble.seed;
    count += 1;
    if (count >= 128) break;
  }
  if (!count) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, bubbleMesh.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, bubbleData.subarray(0, count * 4), gl.DYNAMIC_DRAW);
  gl.bindVertexArray(bubbleMesh.vao);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const program = programs.bubble;
  gl.useProgram(program.program);
  setViewUniforms(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, baseTarget.texture);
  gl.uniform1i(program.uniforms.get('uBackground'), 0);
  gl.uniform2f(program.uniforms.get('uResolution'), screenWidth, screenHeight);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  gl.disable(gl.BLEND);
}

function clearCellLayer() {
  gl.bindFramebuffer(gl.FRAMEBUFFER, cellsTarget.framebuffer);
  gl.viewport(0, 0, screenWidth, screenHeight);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

function ensureCellMesh(cell) {
  if (cell.meshVAO) return;
  const buffer = gl.createBuffer();
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const stride = 5 * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 2 * 4);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 4 * 4);
  gl.bindVertexArray(null);
  cell.meshVAO = vao;
  cell.meshBuffer = buffer;
}

function organelleTint(color) {
  return [
    color[0] * 0.45 + 0.16,
    color[1] * 0.45 + 0.2,
    color[2] * 0.45 + 0.2
  ];
}

function uploadOrganelles(program, interior, color) {
  const items = interior.organelleData();
  const count = Math.min(8, items.length);
  organelleUniformData.fill(0);
  for (let i = 0; i < count; i += 1) {
    const item = items[i];
    organelleUniformData[i * 4] = item.x;
    organelleUniformData[i * 4 + 1] = item.y;
    organelleUniformData[i * 4 + 2] = item.radius;
    organelleUniformData[i * 4 + 3] = item.type;
  }
  gl.uniform1i(program.uniforms.get('uOrganelleCount'), count);
  gl.uniform4fv(program.uniforms.get('uOrganelle'), organelleUniformData);
  gl.uniform3f(program.uniforms.get('uOrganelleColor'), color[0], color[1], color[2]);
}

function fillShape(cell, target) {
  const count = Math.min(cell.soft.count, 64);
  const harmonics = 7;
  for (let k = 0; k < harmonics; k += 1) {
    target[k * 4] = 0;
    target[k * 4 + 1] = 0;
    target[k * 4 + 2] = 0;
    target[k * 4 + 3] = 0;
  }
  const inv = 1 / count;
  for (let i = 0; i < count; i += 1) {
    const radiusValue = Math.hypot(cell.soft.px[i], cell.soft.py[i]);
    const angle = (i * inv) * Math.PI * 2;
    target[0] += radiusValue * inv;
    for (let k = 1; k < harmonics; k += 1) {
      target[k * 4] += radiusValue * Math.cos(k * angle) * 2 * inv;
      target[k * 4 + 1] += radiusValue * Math.sin(k * angle) * 2 * inv;
    }
  }
  return harmonics;
}

function drawCellQuad(program, cell) {
  fillShape(cell, shapeData);
  let extent = shapeData[0];
  for (let k = 1; k < 7; k += 1) extent += Math.hypot(shapeData[k * 4], shapeData[k * 4 + 1]);
  gl.uniform2f(program.uniforms.get('uCenter'), cell.soft.cx, cell.soft.cy);
  gl.uniform1f(program.uniforms.get('uExtent'), extent * 1.03 + 2);
  gl.uniform4fv(program.uniforms.get('uShape'), shapeData);
  gl.bindVertexArray(quadVAO);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function drawFusionBridges(time) {
  const cells = [...state.cells.values()];
  const pairs = [];
  for (let i = 0; i < cells.length; i += 1) {
    const a = cells[i];
    for (let j = i + 1; j < cells.length; j += 1) {
      const b = cells[j];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance > a.radius + b.radius + 20) continue;
      pairs.push([a, b]);
      if (pairs.length >= 12) break;
    }
    if (pairs.length >= 12) break;
  }
  if (!pairs.length) return;
  const program = programs.fusion;
  gl.useProgram(program.program);
  setViewUniforms(program);
  gl.uniform2f(program.uniforms.get('uResolution'), screenWidth, screenHeight);
  gl.uniform1f(program.uniforms.get('uTime'), time);
  gl.uniform1f(program.uniforms.get('uOpacity'), 1);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, baseTarget.texture);
  gl.uniform1i(program.uniforms.get('uBackground'), 0);
  gl.uniform1i(program.uniforms.get('uInteriorA'), 1);
  gl.uniform1i(program.uniforms.get('uInteriorB'), 2);
  gl.bindVertexArray(quadVAO);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  for (const [a, b] of pairs) {
    const recordA = interiorFor(a);
    const recordB = interiorFor(b);
    if (!recordA.texture) createInteriorTexture(recordA);
    if (!recordB.texture) createInteriorTexture(recordB);
    const colorA = vividColor(recordA.fluidColor || recordA.interior.averageColor());
    const colorB = vividColor(recordB.fluidColor || recordB.interior.averageColor());
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, recordA.texture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, recordB.texture);
    gl.uniform2f(program.uniforms.get('uCenterA'), a.soft.cx, a.soft.cy);
    gl.uniform2f(program.uniforms.get('uCenterB'), b.soft.cx, b.soft.cy);
    gl.uniform1f(program.uniforms.get('uRadiusA'), a.radius);
    gl.uniform1f(program.uniforms.get('uRadiusB'), b.radius);
    gl.uniform3f(program.uniforms.get('uColorA'), colorA[0], colorA[1], colorA[2]);
    gl.uniform3f(program.uniforms.get('uColorB'), colorB[0], colorB[1], colorB[2]);
    const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius;
    gl.uniform1f(program.uniforms.get('uOpacity'), clamp(1 - gap / 16, 0, 1));
    fillShape(a, shapeDataA);
    fillShape(b, shapeDataB);
    gl.uniform4fv(program.uniforms.get('uShapeA'), shapeDataA);
    gl.uniform4fv(program.uniforms.get('uShapeB'), shapeDataB);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  gl.disable(gl.BLEND);
}

function drawCellBodies(time) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, cellsTarget.framebuffer);
  gl.viewport(0, 0, screenWidth, screenHeight);
  const program = programs.cell;
  gl.useProgram(program.program);
  setViewUniforms(program);
  gl.uniform2f(program.uniforms.get('uResolution'), screenWidth, screenHeight);
  gl.uniform1f(program.uniforms.get('uTime'), time);
  gl.uniform1f(program.uniforms.get('uOpacity'), 1);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, baseTarget.texture);
  gl.uniform1i(program.uniforms.get('uBackground'), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.uniform1i(program.uniforms.get('uInterior'), 1);
  const cells = [...state.cells.values()].sort((a, b) => a.radius - b.radius);
  for (const cell of cells) {
    if (Math.abs(cell.x - state.camera.x) > state.camera.width * 0.7 + cell.radius * 1.4) continue;
    if (Math.abs(cell.y - state.camera.y) > state.camera.height * 0.7 + cell.radius * 1.4) continue;
    const record = interiorFor(cell);
    if (!record.texture) createInteriorTexture(record);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, record.texture);
    const color = vividColor(record.fluidColor || cellFluidColor(cell));
    gl.uniform1f(program.uniforms.get('uRadius'), cell.radius);
    gl.uniform3f(program.uniforms.get('uColor'), color[0], color[1], color[2]);
    gl.uniform1f(program.uniforms.get('uSeed'), (cell.id % 997) * 0.137);
    const foodItems = record.interior.foodData();
    const foodCount = Math.min(8, foodItems.length);
    gl.uniform1i(program.uniforms.get('uFoodCount'), foodCount);
    foodUniformData.fill(0);
    foodColorUniformData.fill(0);
    for (let i = 0; i < foodCount; i += 1) {
      const item = foodItems[i];
      foodUniformData[i * 4] = item.x;
      foodUniformData[i * 4 + 1] = item.y;
      foodUniformData[i * 4 + 2] = item.size;
      foodUniformData[i * 4 + 3] = item.alpha;
      foodColorUniformData[i * 3] = item.color[0];
      foodColorUniformData[i * 3 + 1] = item.color[1];
      foodColorUniformData[i * 3 + 2] = item.color[2];
    }
    gl.useProgram(program.program);
    gl.uniform4fv(program.uniforms.get('uFood'), foodUniformData);
    gl.uniform3fv(program.uniforms.get('uFoodColor'), foodColorUniformData);
    uploadOrganelles(program, record.interior, organelleTint(color));
    drawCellQuad(program, cell);
  }
  gl.disable(gl.BLEND);
}

function drawIngestions(time) {
  if (!state.ingestions.length) return;
  let count = 0;
  const camera = state.camera;
  for (const item of state.ingestions) {
    if (Math.abs(item.x - camera.x) > camera.width * 0.7 + 60) continue;
    if (Math.abs(item.y - camera.y) > camera.height * 0.7 + 60) continue;
    const index = count * 8;
    ingestData[index] = item.x;
    ingestData[index + 1] = item.y;
    ingestData[index + 2] = item.radius * 2.1;
    ingestData[index + 3] = item.phase;
    ingestData[index + 4] = item.color[0];
    ingestData[index + 5] = item.color[1];
    ingestData[index + 6] = item.color[2];
    ingestData[index + 7] = item.alpha;
    count += 1;
    if (count >= 128) break;
  }
  if (!count) return;
  gl.bindFramebuffer(gl.FRAMEBUFFER, cellsTarget.framebuffer);
  gl.viewport(0, 0, screenWidth, screenHeight);
  gl.bindBuffer(gl.ARRAY_BUFFER, ingestMesh.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, ingestData.subarray(0, count * 8), gl.DYNAMIC_DRAW);
  gl.bindVertexArray(ingestMesh.vao);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const program = programs.food;
  gl.useProgram(program.program);
  setViewUniforms(program);
  gl.uniform1f(program.uniforms.get('uTime'), time);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  gl.disable(gl.BLEND);
}

function drawMergeGhosts(time) {
  if (!state.mergeGhosts.length) return;
  const program = programs.cell;
  gl.useProgram(program.program);
  setViewUniforms(program);
  gl.uniform2f(program.uniforms.get('uResolution'), screenWidth, screenHeight);
  gl.uniform1f(program.uniforms.get('uTime'), time);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, baseTarget.texture);
  gl.uniform1i(program.uniforms.get('uBackground'), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.uniform1i(program.uniforms.get('uInterior'), 1);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  for (const item of state.mergeGhosts) {
    const cell = item.cell;
    const record = item.record;
    if (!record.texture) createInteriorTexture(record);
    if (!cell.soft) continue;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, record.texture);
    gl.uniform1f(program.uniforms.get('uRadius'), cell.radius);
    const ghostColor = vividColor(record.fluidColor || record.interior.averageColor());
    gl.uniform3f(program.uniforms.get('uColor'), ghostColor[0], ghostColor[1], ghostColor[2]);
    gl.uniform1f(program.uniforms.get('uSeed'), (cell.id % 997) * 0.137);
    gl.uniform1f(program.uniforms.get('uOpacity'), clamp(item.life / item.maxLife, 0, 1));
    const foodItems = record.interior.foodData();
    const foodCount = Math.min(8, foodItems.length);
    gl.uniform1i(program.uniforms.get('uFoodCount'), foodCount);
    foodUniformData.fill(0);
    foodColorUniformData.fill(0);
    for (let i = 0; i < foodCount; i += 1) {
      const food = foodItems[i];
      foodUniformData[i * 4] = food.x;
      foodUniformData[i * 4 + 1] = food.y;
      foodUniformData[i * 4 + 2] = food.size;
      foodUniformData[i * 4 + 3] = food.alpha;
      foodColorUniformData[i * 3] = food.color[0];
      foodColorUniformData[i * 3 + 1] = food.color[1];
      foodColorUniformData[i * 3 + 2] = food.color[2];
    }
    gl.uniform4fv(program.uniforms.get('uFood'), foodUniformData);
    gl.uniform3fv(program.uniforms.get('uFoodColor'), foodColorUniformData);
    uploadOrganelles(program, record.interior, organelleTint(ghostColor));
    drawCellQuad(program, cell);
  }
  gl.disable(gl.BLEND);
}

window.__squish = { state, interiorFor };

function drawCellLayer(time) {
  clearCellLayer();
  drawBubbles(false);
  drawFusionBridges(time);
  drawCellBodies(time);
  drawMergeGhosts(time);
  drawIngestions(time);
  drawBubbles(true);
  drawDebris(true, time);
}

function compositeCells() {
  gl.bindFramebuffer(gl.FRAMEBUFFER, baseTarget.framebuffer);
  gl.viewport(0, 0, screenWidth, screenHeight);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const program = programs.blit;
  gl.useProgram(program.program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, cellsTarget.texture);
  gl.uniform1i(program.uniforms.get('uSource'), 0);
  gl.uniform1f(program.uniforms.get('uAlpha'), 1);
  gl.bindVertexArray(quadVAO);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.disable(gl.BLEND);
}

function drawBloom() {
  let program = programs.bright;
  gl.useProgram(program.program);
  gl.bindFramebuffer(gl.FRAMEBUFFER, brightTarget.framebuffer);
  gl.viewport(0, 0, brightTarget.width, brightTarget.height);
  gl.disable(gl.BLEND);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, baseTarget.texture);
  gl.uniform1i(program.uniforms.get('uScene'), 0);
  gl.uniform2f(program.uniforms.get('uTexel'), 1 / screenWidth, 1 / screenHeight);
  gl.bindVertexArray(quadVAO);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  program = programs.blur;
  gl.useProgram(program.program);
  gl.bindFramebuffer(gl.FRAMEBUFFER, blurTarget.framebuffer);
  gl.viewport(0, 0, blurTarget.width, blurTarget.height);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, brightTarget.texture);
  gl.uniform1i(program.uniforms.get('uSource'), 0);
  gl.uniform2f(program.uniforms.get('uDirection'), 1 / blurTarget.width, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  gl.bindFramebuffer(gl.FRAMEBUFFER, brightTarget.framebuffer);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, blurTarget.texture);
  gl.uniform1i(program.uniforms.get('uSource'), 0);
  gl.uniform2f(program.uniforms.get('uDirection'), 0, 1 / blurTarget.height);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function drawFinal() {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, screenWidth, screenHeight);
  gl.disable(gl.BLEND);
  const program = programs.composite;
  gl.useProgram(program.program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, baseTarget.texture);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, brightTarget.texture);
  gl.uniform1i(program.uniforms.get('uScene'), 0);
  gl.uniform1i(program.uniforms.get('uBloom'), 1);
  gl.uniform2f(program.uniforms.get('uResolution'), screenWidth, screenHeight);
  gl.uniform1f(program.uniforms.get('uTime'), state.time);
  gl.bindVertexArray(quadVAO);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function renderFrame(dt) {
  simAccumulator += dt;
  if (simAccumulator >= 1 / SIM_HZ) {
    stepFluid(1 / SIM_HZ);
    simAccumulator = 0;
  }
  drawBase(state.time);
  drawCellLayer(state.time);
  compositeCells();
  drawBloom();
  drawFinal();
}

function loop() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - loop.last) / 1000 || 0.016);
  loop.last = now;
  state.time += dt;
  updateSimulation(dt);
  renderFrame(dt);
  drawLabels();
  updateUI();
  requestAnimationFrame(loop);
}

loop.last = performance.now();


resetDecor();
seedFluid();
requestAnimationFrame(loop);

document.fonts.ready.then(() => {
  boot.classList.add('done');
});

setTimeout(() => {
  boot.classList.add('done');
}, 2500);

window.addEventListener('beforeunload', () => {
  net.close();
});
