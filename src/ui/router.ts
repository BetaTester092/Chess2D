import { h, clearEl } from './dom';

export type ScreenId = 'welcome' | 'menu' | 'setup' | 'game' | 'stats' | 'settings';

type Render = (container: HTMLElement, params?: Record<string, unknown>) => void;

const screens = new Map<ScreenId, Render>();
let current: ScreenId | null = null;
let container: HTMLElement | null = null;

export function registerScreen(id: ScreenId, render: Render): void {
  screens.set(id, render);
}

export function initRouter(el: HTMLElement): void {
  container = el;
}

export function navigate(id: ScreenId, params?: Record<string, unknown>): void {
  if (!container) return;
  const render = screens.get(id);
  if (!render) return;
  current = id;
  clearEl(container);
  const screenEl = h('div', { class: `screen screen-${id}` });
  container.appendChild(screenEl);
  render(screenEl, params);
}

export function currentScreen(): ScreenId | null {
  return current;
}
