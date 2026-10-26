import { resize } from '../gl/screen.ts';
import { onSettings } from './settings.ts';

export function bindInterfaceSettings(): void {
  onSettings((current) => {
    document.body.classList.toggle('hide-board', !current.leaderboard);
    document.body.classList.toggle('hide-meals', !current.meals);
    document.body.classList.toggle('reduced-motion', current.reducedMotion);
    document.body.classList.toggle('joystick-right', current.joystick === 'right');
    resize();
  });
}
