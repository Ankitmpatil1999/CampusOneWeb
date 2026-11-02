/**
 * The prototype's two presentation helpers (v4: 98_pro_motion.js and 97_ocean_fx.js) on
 * the web's pages. They only set classes, CSS variables and a short-lived empty ripple span that
 * src/theme/campusone-ocean.css animates; they never change data, navigation or behaviour.
 *
 * - page entrance: a page the router opens rises in (`.c-page[style*="xfade"]`, as the prototype
 *   marks a page on navigation, never on a refresh);
 * - rp-swap: a page's content eases in after a tab, filter pill, segment or pager button;
 * - rp-open: a sheet, modal or drawer's content rises in as it opens;
 * - the menu (Dock style): --mag magnifies its icons around the cursor, rp-bounce bounces the icon
 *   of the page opened, rp-side-in slides the menu in when the console or back office appears;
 * - rp-spot (--mx/--my): a soft light follows the cursor across task cards, cards, tiles, lists
 *   and tables;
 * - rp-tilt (--rx/--ry/--gx/--gy): number tiles tilt towards the cursor;
 * - .rp-rip: a ripple spreads from where a button, row or task card is pressed.
 *
 * The prototype finds the page through its own renderer (RP.navs) and reruns the menu's reveal on
 * each repaint; here the page is the `.c-page` around the click and the menu is inserted once.
 */

const SWAP = '.tab,.pill,.seg>button,.pager button';
const SPOT = '.tl-card,.tl-sub,.kpi,.card,.list,.tbl-wrap,.ms-task,.ms-sched,.mc-ann,.wmini .wm';
const TILT = '.wcard,.kpi';
const RIP =
  '.btn,button.li,.li[data-go],.li[data-act],.ms-task,.pill,.m-tab:not(.center),.mc-day,' +
  '.ms-days button,.choice,.kid,.seg>button,.dd-opt,.persona-opt,.ms-cls,.wmini .wm,.tl-card,' +
  '.tl-sub,.tl-chip';
/** The prototype's page entrance (console: `animation: xfade .35s var(--ease-out) both`). */
const ENTER = 'xfade .35s var(--ease-out) both';
/** The menu's rows (parent tasks, single pages and sub-tasks). */
const ROWS = '.nv-solo,.nv-par,.nv-item';
/** Dock magnification (v4's gentler wave): peak growth and the spread of the wave in px. */
const MAG = 0.2;
const SIGMA = 34;

type Timed = HTMLElement & { _rpTimers?: Record<string, ReturnType<typeof setTimeout>> };

/** Installs the helpers on the document; returns a function that removes them. */
export function installMotionFx(doc: Document): () => void {
  const win = doc.defaultView;
  if (!win) return () => undefined;
  const root = doc.documentElement;
  const reduced = () =>
    root.classList.contains('reduced') ||
    win.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const closest = (t: EventTarget | null, sel: string): HTMLElement | null =>
    t instanceof win.Element ? (t.closest(sel) as HTMLElement | null) : null;

  /** Restarts a class-driven animation and takes the class off after `ms`. */
  const flash = (el: HTMLElement | null, cls: string, ms: number) => {
    if (!el || reduced()) return;
    const timed = el as Timed;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    timed._rpTimers ??= {};
    clearTimeout(timed._rpTimers[cls]);
    timed._rpTimers[cls] = setTimeout(() => el.classList.remove(cls), ms);
  };
  const off: (() => void)[] = [];
  const on = <K extends keyof DocumentEventMap>(
    target: Document | Window,
    type: K,
    fn: (e: DocumentEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ) => {
    target.addEventListener(type, fn as EventListener, opts);
    off.push(() => target.removeEventListener(type, fn as EventListener, opts));
  };

  // ---------- page entrance and content swap ----------
  const enter = (page: HTMLElement) => {
    if (reduced()) return;
    page.style.animation = ENTER;
    // The browser rewrites the value (".35s" → "0.35s"): match the keyframes' name.
    setTimeout(() => {
      if (/\bxfade\b/.test(page.style.animation)) page.style.removeProperty('animation');
    }, 1000);
  };
  on(
    doc,
    'click',
    (e) => {
      const t = closest(e.target, SWAP);
      if (!t || t.closest('.ov') || t.closest('.dd-menu')) return;
      const page = t.closest<HTMLElement>('.c-page');
      requestAnimationFrame(() => {
        if (!page || /xfade/.test(page.getAttribute('style') ?? '')) return;
        flash(page, 'rp-swap', 600);
      });
    },
    { capture: true },
  );

  // ---------- menu: Dock magnification ----------
  let ptr: { x: number; y: number } | null = null;
  let magNav: HTMLElement | null = null;
  let raf = 0;
  const magnify = (nav: HTMLElement, y: number | null) => {
    nav.querySelectorAll<HTMLElement>(ROWS).forEach((item) => {
      if (y === null) {
        item.style.removeProperty('--mag');
        return;
      }
      const r = item.getBoundingClientRect();
      // A sub-task of a folded task has no box: it stays as it is.
      if (!r.height) {
        item.style.removeProperty('--mag');
        return;
      }
      const d = r.top + r.height / 2 - y;
      const m = 1 + MAG * Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
      if (m < 1.01) item.style.removeProperty('--mag');
      else item.style.setProperty('--mag', m.toFixed(3));
    });
  };
  const release = () => {
    if (magNav) magnify(magNav, null);
    magNav = null;
    ptr = null;
  };
  on(
    doc,
    'mousemove',
    (e) => {
      const nav = closest(e.target, '.c-side .c-nav');
      if (!nav || reduced()) {
        if (magNav) release();
        return;
      }
      if (magNav && magNav !== nav) magnify(magNav, null);
      magNav = nav;
      ptr = { x: e.clientX, y: e.clientY };
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (magNav && ptr) magnify(magNav, ptr.y);
        });
    },
    { passive: true },
  );
  on(doc, 'mouseleave', release);
  on(win, 'blur', release);

  // ---------- menu: launch bounce on the page opened ----------
  on(
    doc,
    'click',
    (e) => {
      const item = closest(e.target, '.c-side [data-tab]');
      if (!item || reduced()) return;
      item.style.setProperty('--rp-t', '0ms');
      flash(item, 'rp-bounce', 950);
    },
    { capture: true },
  );

  // ---------- pages, overlays and the menu as they are inserted ----------
  const inserted = (el: Element, sel: string): HTMLElement[] => {
    const own = el.matches(sel) ? [el as HTMLElement] : [];
    return el.firstElementChild ? [...own, ...el.querySelectorAll<HTMLElement>(sel)] : own;
  };
  const observer = new win.MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach((n) => {
        if (!(n instanceof win.Element)) return;
        inserted(n, '.c-page').forEach(enter);
        inserted(n, '.ov').forEach((ov) => flash(ov, 'rp-open', 700));
        inserted(n, '.c-side').forEach((side) => flash(side, 'rp-side-in', 1100));
      });
    }
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  off.push(() => observer.disconnect());

  // ---------- cursor light and tilt ----------
  let spot: HTMLElement | null = null;
  let tilt: HTMLElement | null = null;
  let last: PointerEvent | null = null;
  let fxRaf = 0;
  const clearSpot = () => {
    spot?.classList.remove('rp-spot');
    spot = null;
  };
  const clearTilt = () => {
    tilt?.classList.remove('rp-tilt');
    tilt = null;
  };
  const frame = () => {
    fxRaf = 0;
    const e = last;
    if (!e) return;
    const s = closest(e.target, SPOT);
    if (spot && spot !== s) clearSpot();
    if (s) {
      const r = s.getBoundingClientRect();
      s.style.setProperty('--mx', `${Math.round(e.clientX - r.left)}px`);
      s.style.setProperty('--my', `${Math.round(e.clientY - r.top)}px`);
      s.classList.add('rp-spot');
      spot = s;
    }
    const k = closest(e.target, TILT);
    if (tilt && tilt !== k) clearTilt();
    if (k) {
      const q = k.getBoundingClientRect();
      const px = (e.clientX - q.left) / q.width;
      const py = (e.clientY - q.top) / q.height;
      const max = k.classList.contains('wcard') ? 8 : 4;
      k.style.setProperty('--ry', `${((px - 0.5) * 2 * max).toFixed(2)}deg`);
      k.style.setProperty('--rx', `${((0.5 - py) * 2 * max).toFixed(2)}deg`);
      k.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
      k.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
      k.classList.add('rp-tilt');
      tilt = k;
    }
  };
  on(
    doc,
    'pointermove',
    (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (reduced()) {
        clearSpot();
        clearTilt();
        return;
      }
      last = e;
      if (!fxRaf) fxRaf = requestAnimationFrame(frame);
    },
    { passive: true },
  );
  const clearFx = () => {
    clearSpot();
    clearTilt();
  };
  on(doc, 'mouseleave', clearFx);
  on(win, 'blur', clearFx);

  // ---------- water ripple on press ----------
  on(
    doc,
    'pointerdown',
    (e) => {
      if (reduced() || e.button > 0) return;
      const h = closest(e.target, RIP);
      if (!h || (h as HTMLButtonElement).disabled || h.classList.contains('is-disabled')) return;
      const r = h.getBoundingClientRect();
      const d = Math.max(r.width, r.height) * 2.2;
      const s = doc.createElement('span');
      s.className = 'rp-rip';
      s.setAttribute('aria-hidden', 'true');
      s.style.width = s.style.height = `${d}px`;
      s.style.left = `${e.clientX - r.left - d / 2}px`;
      s.style.top = `${e.clientY - r.top - d / 2}px`;
      if (win.getComputedStyle(h).position === 'static') h.style.position = 'relative';
      h.classList.add('rp-rip-host');
      h.appendChild(s);
      setTimeout(() => {
        s.remove();
        if (!h.querySelector('.rp-rip')) h.classList.remove('rp-rip-host');
      }, 650);
    },
    { passive: true, capture: true },
  );

  return () => {
    off.forEach((f) => f());
    cancelAnimationFrame(raf);
    cancelAnimationFrame(fxRaf);
  };
}
