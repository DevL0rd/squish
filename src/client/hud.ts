import { settings } from './ui/settings.ts';
import { clamp, type Rgb } from '../shared/math.ts';
import type { RosterEntry } from '../shared/protocol.ts';
import { cssColor, vividColor } from './color.ts';
import { bodyCountLabel, canvas, massLabel, occupantsLabel, onlineLabel, rankLabel, ranksList } from './dom.ts';
import { labelContext } from './gl/screen.ts';
import type { CellVisual } from './cell/cell.ts';
import { ownCells, state } from './state.ts';

const UI_INTERVAL = 240;
const COLOR_INTERVAL = 1800;
const BOARD_SIZE = 6;

interface Ranked extends RosterEntry {
  readonly mass: number;
}

let lastUi = 0;
let lastColorRefresh = 0;
let rosterColors = new Map<number, Rgb>();

function formatMass(mass: number): string {
  return mass >= 1000 ? `${(mass / 1000).toFixed(2)}k` : mass.toFixed(1);
}

export function updateOccupancy(): void {
  occupantsLabel.textContent = `${state.roster.size} organisms`;
  onlineLabel.textContent = `${state.roster.size} organisms present`;
}

function refreshRosterColors(now: number): void {
  if (now - lastColorRefresh < COLOR_INTERVAL) return;
  lastColorRefresh = now;
  const totals = new Map<number, [number, number, number, number]>();
  for (const cell of state.cells.values()) {
    const color = cell.fluidColor;
    const entry = totals.get(cell.pid) ?? [0, 0, 0, 0];
    totals.set(cell.pid, [entry[0] + color[0], entry[1] + color[1], entry[2] + color[2], entry[3] + 1]);
  }
  rosterColors = new Map(
    [...totals].map(([pid, [r, g, b, count]]) => [pid, vividColor([r / count, g / count, b / count])]),
  );
}

function rankPlayers(): Ranked[] {
  const masses = new Map(state.masses);
  const mine = ownCells().reduce((sum, cell) => sum + cell.mass, 0);
  if (mine > 0) masses.set(state.me, mine);
  return [...state.roster.values()]
    .filter((player) => masses.has(player.id))
    .map((player) => ({ ...player, mass: masses.get(player.id) ?? 0 }))
    .sort((a, b) => b.mass - a.mass);
}

function boardRow(player: Ranked, place: number): HTMLLIElement {
  const item = document.createElement('li');
  if (player.id === state.me) item.className = 'you';
  const rankNo = document.createElement('span');
  rankNo.className = 'rank-no';
  rankNo.textContent = String(place).padStart(2, '0');
  const name = document.createElement('span');
  name.className = 'name';
  const dot = document.createElement('span');
  dot.className = 'swatch-dot';
  const live = rosterColors.get(player.id);
  dot.style.color = live
    ? `rgb(${Math.round(live[0] * 255)} ${Math.round(live[1] * 255)} ${Math.round(live[2] * 255)})`
    : cssColor(player.hue);
  name.append(dot, document.createTextNode(player.name));
  const score = document.createElement('span');
  score.className = 'score';
  score.textContent = formatMass(player.mass);
  item.append(rankNo, name, score);
  return item;
}

function renderBoard(ranked: readonly Ranked[], rank: number): void {
  const visible = ranked.slice(0, BOARD_SIZE);
  const self = ranked[rank - 1];
  if (rank > BOARD_SIZE && self) visible.push(self);
  ranksList.replaceChildren(...visible.map((player) => boardRow(player, ranked.indexOf(player) + 1)));
}

export function updateUI(): void {
  const now = performance.now();
  if (now - lastUi < UI_INTERVAL) return;
  lastUi = now;
  const cells = ownCells();
  const first = cells[0];
  if (!state.targetReady && first) {
    state.target.x = first.x;
    state.target.y = first.y;
    state.targetReady = true;
  }
  const ranked = rankPlayers();
  const rank = ranked.findIndex((player) => player.id === state.me) + 1;
  massLabel.textContent = formatMass(cells.reduce((total, cell) => total + cell.mass, 0));
  bodyCountLabel.textContent = `${cells.length} ${cells.length === 1 ? 'body' : 'bodies'}`;
  rankLabel.textContent = rank ? `#${rank} of ${ranked.length}` : 'unranked';
  updateOccupancy();
  refreshRosterColors(now);
  renderBoard(ranked, rank);
}

function largestPerPlayer(): CellVisual[] {
  const largest = new Map<number, CellVisual>();
  for (const cell of state.cells.values()) {
    if (cell.pid === state.me) continue;
    const current = largest.get(cell.pid);
    if (!current || cell.radius > current.radius) largest.set(cell.pid, cell);
  }
  return [...largest.values()];
}

function drawLabel(cell: CellVisual, width: number, height: number): void {
  const { camera } = state;
  const x = ((cell.x - camera.x) / camera.width) * width + width / 2;
  const y = height / 2 - ((cell.y - camera.y) / camera.height) * height;
  const radius = (cell.radius / camera.width) * width;
  if (x < -80 || x > width + 80 || y < -80 || y > height + 80 || radius < 9) return;
  const alpha = clamp((radius - 9) / 26, 0.18, 0.74);
  const labelY = y + radius + 15;
  labelContext.font = '500 9px "Plex Mono", monospace';
  labelContext.fillStyle = `rgba(212, 232, 222, ${alpha})`;
  labelContext.fillText(cell.name, x, labelY);
  labelContext.beginPath();
  labelContext.fillStyle = `rgba(169, 237, 218, ${alpha * 0.55})`;
  labelContext.arc(x - labelContext.measureText(cell.name).width / 2 - 8, labelY, 1.6, 0, Math.PI * 2);
  labelContext.fill();
}

export function drawLabels(): void {
  if (!state.joined) return;
  if (!settings().names) {
    labelContext.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    return;
  }
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  labelContext.clearRect(0, 0, width, height);
  if (!state.cells.size) return;
  labelContext.save();
  labelContext.textAlign = 'center';
  labelContext.textBaseline = 'middle';
  for (const cell of largestPerPlayer()) drawLabel(cell, width, height);
  labelContext.restore();
}
