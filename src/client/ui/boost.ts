import { boostButton, boostMeter } from '../dom.ts';

export function showBoost(charge: number): void {
  const pips = boostMeter.querySelectorAll<HTMLElement>('.boost-pip');
  pips.forEach((pip, index) => {
    const fill = Math.max(0, Math.min(1, charge - index));
    pip.style.setProperty('--fill', String(fill));
    pip.classList.toggle('ready', fill >= 1);
  });
  boostMeter.classList.toggle('ready', charge >= 1);
  boostButton.disabled = charge < 1;
}
