import { AdminAction, BOSS_NAMES, FoodVariety, INFECTIONS, type AdminCatalog } from '../../shared/protocol.ts';
import { adminOpen, adminPanel } from '../dom.ts';
import type { Net } from '../net.ts';

interface Command {
  readonly label: string;
  readonly action: number;
  readonly arg?: number;
}

interface Group {
  readonly title: string;
  readonly commands: readonly Command[];
}

function groups(catalog: AdminCatalog): readonly Group[] {
  return [
    {
      title: 'Events',
      commands: [
        ...BOSS_NAMES.map((label, arg) => ({ label, action: AdminAction.Boss, arg })),
        { label: 'Go to boss', action: AdminAction.Visit },
        { label: 'End boss', action: AdminAction.EndBoss },
        { label: 'Pipette on me', action: AdminAction.Pipette },
        { label: 'Rapid events', action: AdminAction.Rapid },
      ],
    },
    {
      title: 'Spawn at cursor',
      commands: catalog.species.map((label, arg) => ({ label, action: AdminAction.Creature, arg })),
    },
    {
      title: 'Food at cursor',
      commands: Object.entries(FoodVariety).map(([label, arg]) => ({ label, action: AdminAction.Food, arg })),
    },
    {
      title: 'Me',
      commands: [
        { label: '+250 mass', action: AdminAction.Mass },
        { label: 'Teleport to cursor (T)', action: AdminAction.Teleport },
        ...INFECTIONS.map((item, arg) => ({
          label: item.label.replace('Phage injection: ', ''),
          action: AdminAction.Infect,
          arg,
        })),
      ],
    },
  ];
}

function section(group: Group, net: Net): HTMLElement {
  const element = document.createElement('section');
  const title = document.createElement('div');
  title.className = 'label';
  title.textContent = group.title;
  const list = document.createElement('div');
  list.className = 'admin-grid';
  for (const command of group.commands) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = command.label;
    button.addEventListener('click', () => {
      net.admin(command.action, command.arg);
    });
    list.append(button);
  }
  element.append(title, list);
  return element;
}

function toggle(): void {
  adminPanel.hidden = !adminPanel.hidden;
}

let bound = false;

export function enableAdmin(catalog: AdminCatalog | null, net: Net): void {
  adminOpen.hidden = !catalog;
  if (!catalog) {
    adminPanel.hidden = true;
    return;
  }
  adminPanel.replaceChildren(...groups(catalog).map((group) => section(group, net)));
  if (bound) return;
  bound = true;
  adminOpen.addEventListener('click', toggle);
  window.addEventListener('keydown', (event) => {
    if (adminOpen.hidden || event.target instanceof HTMLInputElement) return;
    if (event.code === 'Backquote') toggle();
    else if (event.code === 'KeyT') net.admin(AdminAction.Teleport);
  });
}
