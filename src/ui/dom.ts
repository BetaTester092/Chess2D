/** Minimal DOM helper — hyperscript style. */

export function h(
  tag: string,
  attrs: Record<string, unknown> | null = null,
  ...children: (Node | string | null | undefined | false)[]
): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v as string;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'html') {
      el.innerHTML = v as string;
    } else if (v === true) {
      el.setAttribute(k, '');
    } else {
      el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clearEl(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

let toastRoot: HTMLElement | null = null;

export function toast(message: string, kind: 'info' | 'error' = 'info', ms = 2200): void {
  if (!toastRoot) {
    toastRoot = h('div', { id: 'toast-root' });
    document.body.appendChild(toastRoot);
  }
  const t = h('div', { class: `toast ${kind === 'error' ? 'error' : ''}` }, message);
  toastRoot.appendChild(t);
  window.setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.25s ease';
    window.setTimeout(() => t.remove(), 260);
  }, ms);
}

/** Format remaining clock ms as m:ss (or s.t below 20s). */
export function formatClock(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
