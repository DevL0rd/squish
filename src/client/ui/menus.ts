import {
  guide,
  guideClose,
  guideOpen,
  settingsButton,
  settingsClose,
  settingsDialog,
  settingsOpen,
  settingsReset,
} from '../dom.ts';
import { buildSettingsPanel } from './settings-panel.ts';
import { resetSettings } from './settings.ts';

function openSettings(): void {
  guide.classList.remove('open');
  if (!settingsDialog.open) settingsDialog.showModal();
}

export function menuOpen(): boolean {
  return settingsDialog.open || guide.classList.contains('open');
}

export function bindMenus(): void {
  buildSettingsPanel();
  guideOpen.addEventListener('click', () => {
    guide.classList.toggle('open');
  });
  guideClose.addEventListener('click', () => {
    guide.classList.remove('open');
  });
  settingsOpen.addEventListener('click', openSettings);
  settingsButton.addEventListener('click', openSettings);
  settingsClose.addEventListener('click', () => {
    settingsDialog.close();
  });
  settingsReset.addEventListener('click', resetSettings);
  settingsDialog.addEventListener('click', (event) => {
    if (event.target === settingsDialog) settingsDialog.close();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') guide.classList.remove('open');
  });
}
