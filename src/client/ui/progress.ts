import { ATTACKS } from '../../shared/protocol.ts';
import { attackLabel, defenseLabel, ejectButton, levelLabel } from '../dom.ts';

const BUTTON_LABELS = ['Spit', 'Volley', 'Dart', 'Pulse', 'Bomb'] as const;

export function showProgress(level: number, defense: number): void {
  levelLabel.textContent = `Lv ${String(level)}`;
  attackLabel.textContent = ATTACKS[level - 1] ?? '';
  ejectButton.textContent = BUTTON_LABELS[level - 1] ?? 'Spit';
  ejectButton.setAttribute('aria-label', ATTACKS[level - 1] ?? 'Spit');
  defenseLabel.textContent = `shield ${String(Math.round(defense * 100))}%`;
  defenseLabel.classList.toggle('active', defense > 0);
}
