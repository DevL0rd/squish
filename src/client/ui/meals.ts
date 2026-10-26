import { digestionRate, type Rgb, digestSpeed } from '../../shared/math.ts';
import { digestFill, digestLabel, mealsList, pigmentDot, pigmentLabel } from '../dom.ts';
import { ownCells } from '../state.ts';

const FOOD_NAMES = ['algal cell', 'plant fragment', 'detritus', 'pollen grain', 'cytoplasm vesicle'];
const CREATURE_NAMES = [
  'paramecium',
  'euglena',
  'diatom',
  'rotifer',
  'bacillus',
  'coccus',
  'halteria',
  'volvox',
  'stentor',
  'tardigrade',
  'bdellovibrio',
  'virus',
  'bacteriophage',
];
const HUES = ['crimson', 'amber', 'chartreuse', 'viridian', 'teal', 'azure', 'indigo', 'violet', 'magenta', 'crimson'];
const MAX_MEALS = 6;
const DIGEST_TIME = 10;

interface Meal {
  readonly name: string;
  readonly color: Rgb;
  readonly amount: number;
  readonly bonus: number;
}

const meals: Meal[] = [];
let load = 0;

export function foodName(variety: number): string {
  return FOOD_NAMES[variety] ?? 'morsel';
}

export function creatureName(kind: number): string {
  return CREATURE_NAMES[kind] ?? 'organism';
}

function rgb(color: Rgb): string {
  return `rgb(${Math.round(color[0] * 255)} ${Math.round(color[1] * 255)} ${Math.round(color[2] * 255)})`;
}

function row(meal: Meal): HTMLLIElement {
  const item = document.createElement('li');
  const dot = document.createElement('span');
  dot.className = 'meal-dot';
  dot.style.color = rgb(meal.color);
  const name = document.createElement('span');
  name.textContent = meal.name;
  const gain = document.createElement('span');
  gain.className = 'meal-gain';
  gain.textContent = `${meal.amount < 0 ? '−' : '+'}${Math.abs(meal.amount).toFixed(1)}`;
  if (meal.bonus > 1.05) {
    const bonus = document.createElement('span');
    bonus.className = 'meal-bonus';
    bonus.textContent = `×${meal.bonus.toFixed(1)}`;
    gain.append(bonus);
  }
  item.append(dot, name, gain);
  return item;
}

export function recordMeal(meal: Meal, weight = 1): void {
  meals.unshift(meal);
  meals.length = Math.min(meals.length, MAX_MEALS);
  load += meal.amount * weight;
  mealsList.replaceChildren(...meals.map(row));
}

export function resetMeals(): void {
  meals.length = 0;
  load = 0;
}

function hueName(color: Rgb): string {
  const max = Math.max(...color);
  const min = Math.min(...color);
  if (max - min < 0.08) return 'neutral cytoplasm';
  const [r, g, b] = color;
  const span = max - min;
  let raw = (r - g) / span + 4;
  if (max === r) raw = ((g - b) / span) % 6;
  else if (max === g) raw = (b - r) / span + 2;
  const hue = (((raw * 60) % 360) + 360) % 360;
  return `${HUES[Math.round(hue / 40)] ?? 'neutral'} cytoplasm`;
}

export function updateMeals(dt: number): void {
  const cells = ownCells();
  if (!cells.length) return;
  const biggest = Math.max(...cells.map((cell) => cell.radius));
  load *= Math.exp((-dt * digestionRate(biggest)) / DIGEST_TIME);
  const mass = cells.reduce((sum, cell) => sum + cell.mass, 0);
  const speed = digestSpeed(load, mass);
  digestLabel.textContent = `speed ${Math.round(speed * 100)}%`;
  digestFill.style.width = `${Math.round((1 - speed) * 100)}%`;
  const mix = cells.reduce<[number, number, number]>(
    (sum, cell) => [sum[0] + cell.fluidColor[0], sum[1] + cell.fluidColor[1], sum[2] + cell.fluidColor[2]],
    [0, 0, 0],
  );
  const average: Rgb = [mix[0] / cells.length, mix[1] / cells.length, mix[2] / cells.length];
  pigmentDot.style.color = rgb(average.map((value) => Math.min(1, value * 2.2)) as unknown as Rgb);
  pigmentLabel.textContent = hueName(average);
}
