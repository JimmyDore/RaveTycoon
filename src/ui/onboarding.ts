import { createCoachCursor, type CoachStep } from './coach-flow';
import { STR } from './strings';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Round "?" button for the top bar / night HUD. `pulse` draws attention until first opened. */
export function helpButton(pulse: boolean, onClick: () => void): HTMLButtonElement {
  const b = el('button', `help-btn${pulse ? ' pulse' : ''}`, STR.onboarding.helpShort) as HTMLButtonElement;
  b.type = 'button';
  b.title = STR.onboarding.help;
  b.setAttribute('aria-label', STR.onboarding.help);
  b.addEventListener('click', onClick);
  return b;
}

function howToSection(title: string, steps: readonly string[]): HTMLElement {
  const sec = el('section', 'howto-section');
  sec.append(el('h3', '', title));
  const ul = el('ul', 'howto-list');
  for (const s of steps) ul.append(el('li', 'howto-item', s));
  sec.append(ul);
  return sec;
}

/** Reopenable "Comment jouer" modal. Appends itself to <body>; `onClose` fires after it's removed. */
export function howToModal(onClose: () => void): void {
  const overlay = el('div', 'onboarding-modal');
  const panel = el('div', 'modal-panel');
  panel.append(el('h2', '', STR.onboarding.howToTitle));
  panel.append(howToSection(STR.onboarding.prepaTitle, STR.onboarding.prepaSteps));
  panel.append(howToSection(STR.onboarding.nuitTitle, STR.onboarding.nuitSteps));
  const close = el('button', 'btn accent', STR.onboarding.gotIt) as HTMLButtonElement;
  const dismiss = () => {
    overlay.remove();
    onClose();
  };
  close.addEventListener('click', dismiss);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });
  panel.append(close);
  overlay.append(panel);
  document.body.append(overlay);
}

export interface CoachHandle {
  stop(): void;
}

/**
 * Spotlight a sequence of elements with a tooltip. The ring follows the anchor's
 * bounding rect every frame, so it survives the full DOM re-renders that prep clicks trigger.
 */
export function mountCoach(steps: CoachStep[], onDone: () => void): CoachHandle {
  if (steps.length === 0) {
    onDone();
    return { stop() {} };
  }
  const cursor = createCoachCursor(steps);
  const ring = el('div', 'coach-ring');
  const tip = el('div', 'coach-tip');
  const txt = el('p', 'coach-text', '');
  const row = el('div', 'coach-actions');
  const skip = el('button', 'btn ghost small', STR.onboarding.skip) as HTMLButtonElement;
  const next = el('button', 'btn accent small', STR.onboarding.next) as HTMLButtonElement;
  row.append(skip, next);
  tip.append(txt, row);
  document.body.append(ring, tip);

  let raf = 0;
  let stopped = false;
  const finish = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    ring.remove();
    tip.remove();
    onDone();
  };
  const enter = () => {
    const step = cursor.current();
    if (!step) {
      finish();
      return;
    }
    step.onEnter?.();
    txt.textContent = step.text;
    next.textContent = cursor.index() === cursor.total() - 1 ? STR.onboarding.gotIt : STR.onboarding.next;
    cancelAnimationFrame(raf);
    const loop = () => {
      if (stopped) return;
      const anchor = document.querySelector(step.anchor) as HTMLElement | null;
      if (anchor && anchor.getBoundingClientRect().width > 0) {
        const r = anchor.getBoundingClientRect();
        ring.style.left = `${r.left - 6}px`;
        ring.style.top = `${r.top - 6}px`;
        ring.style.width = `${r.width + 12}px`;
        ring.style.height = `${r.height + 12}px`;
        ring.style.opacity = '1';
        const below = (step.placement ?? 'bottom') === 'bottom';
        tip.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - tip.offsetWidth - 8))}px`;
        tip.style.top = below ? `${r.bottom + 12}px` : `${Math.max(8, r.top - tip.offsetHeight - 12)}px`;
        tip.style.visibility = 'visible';
      } else {
        ring.style.opacity = '0';
        tip.style.visibility = 'hidden';
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
  };
  next.addEventListener('click', () => {
    cursor.next();
    enter();
  });
  skip.addEventListener('click', finish);
  enter();
  return { stop: finish };
}
