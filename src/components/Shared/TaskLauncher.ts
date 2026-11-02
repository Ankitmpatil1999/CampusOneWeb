import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionContext } from '../../Context/SessionContext';
import { NavUi } from '../Utils/nav-ui';
import { pathOf, visibleNav, type NavGroup, type StaffSurface } from '../Utils/navigation';
import { t as tr } from '../Utils/t';
import { Icon } from './Icon';

/** The parent tasks in the order the dashboard shows them (prototype v4 TL_PRI). */
const RANK: Readonly<Record<StaffSurface, readonly string[]>> = {
  console: [
    'people',
    'payments',
    'finance',
    'controls',
    'academics',
    'attendance',
    'admissions',
    'transport',
    'comms',
    'settings',
    'reports',
  ],
  ops: ['tenants', 'money', 'gov', 'platform'],
};
/**
 * At most eight cards, two rows of four (client 2026-10-27); every other task waits under "More in
 * the menu".
 */
const MAX = 8;
/** A balanced palette by position — blue, purple, teal, orange, green: accent, gradient ends. */
const PALETTE = [
  ['#2563EB', '#3B82F6', '#1D4ED8'],
  ['#7C3AED', '#8B5CF6', '#6D28D9'],
  ['#0D9488', '#14B8A6', '#0F766E'],
  ['#EA580C', '#F97316', '#C2410C'],
  ['#16A34A', '#22C55E', '#15803D'],
] as const;

/**
 * The home's key tasks as colourful cards (prototype v4 RP.taskLauncher), straight under the
 * greeting with no heading of their own (client 2026-10-27): the person's top eight parent tasks
 * from their menu, ranked per surface. A single page (Reports) opens straight away; a
 * task with sub-tasks opens a panel under its row listing them (a person with one such task finds
 * it open). The rest are chips under "More in the menu" that open that task in the menu. Built from
 * the same role-filtered menu as the sidebar, so it never offers a page the role cannot open.
 */
@Component({
  selector: 'rp-task-launcher',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (top().length) {
      <section class="tl" [attr.data-tl]="surface()" aria-label="Tasks">
        <div #grid class="tl-grid" [class.has-sel]="!!sel()">
          @for (g of top(); track g.k; let i = $index) {
            @if (g.solo) {
              <a class="tl-card" [routerLink]="link(g.items[0]!.id)" [style]="vars(i)">
                <span class="tl-ic"><rp-icon [name]="g.icon" [size]="20" /></span>
                <span class="tl-t">{{ label(g) }}</span>
                <span class="tl-d">{{ g.about }}</span>
                <span class="tl-f"
                  ><span class="tl-n">Open</span
                  ><span class="tl-go"><rp-icon name="arrowr" [size]="16" /></span
                ></span>
              </a>
            } @else {
              <button
                type="button"
                class="tl-card"
                [class.on]="sel() === g.k"
                [attr.data-v]="g.k"
                [attr.aria-expanded]="sel() === g.k"
                [attr.aria-controls]="'tl-panel-' + surface()"
                [style]="vars(i)"
                (click)="pick(g.k)"
              >
                <span class="tl-ic"><rp-icon [name]="g.icon" [size]="20" /></span>
                <span class="tl-t">{{ label(g) }}</span>
                <span class="tl-d">{{ g.about }}</span>
                <span class="tl-f"
                  ><span class="tl-n"
                    >{{ g.items.length }} {{ g.items.length === 1 ? 'task' : 'tasks' }}</span
                  ><span class="tl-go"><rp-icon name="down" [size]="16" /></span
                ></span>
              </button>
            }
            <!-- The open task's panel sits under the row that holds its card. -->
            @if (panel(); as p) {
              @if (p.after === i) {
                <div
                  class="tl-panel tl-anim tl-in"
                  role="region"
                  [id]="'tl-panel-' + surface()"
                  [attr.aria-label]="label(p.g) + ' tasks'"
                  [style]="p.style"
                >
                  <div class="tl-ph">
                    <span class="tl-pic"><rp-icon [name]="p.g.icon" [size]="22" /></span>
                    <div class="grow" style="min-width: 0">
                      <h3>{{ label(p.g) }}</h3>
                      <p>{{ p.g.about }}</p>
                    </div>
                    <button
                      type="button"
                      class="iconbtn tl-close"
                      title="Close"
                      [attr.aria-label]="'Close ' + label(p.g)"
                      (click)="pick(p.g.k)"
                    >
                      <rp-icon name="x" [size]="18" />
                    </button>
                  </div>
                  <div class="tl-subs">
                    @for (x of p.g.items; track x.id) {
                      <a class="tl-sub" [routerLink]="link(x.id)">
                        <span class="tl-sic"><rp-icon [name]="x.icon" [size]="20" /></span>
                        <span class="tl-st"
                          ><b>{{ x.key ? t(x.key) : x.label }}</b
                          ><small>{{ x.about }}</small></span
                        >
                        <span class="tl-arrow"><rp-icon name="arrowr" [size]="17" /></span>
                      </a>
                    }
                  </div>
                </div>
              }
            }
          }
        </div>
        @if (more().length) {
          <div class="tl-more">
            <span class="tl-more-l"><rp-icon name="list" [size]="16" /> More in the menu</span>
            @for (g of more(); track g.k) {
              @if (g.solo) {
                <a class="tl-chip" [routerLink]="link(g.items[0]!.id)"
                  ><rp-icon [name]="g.icon" [size]="16" /><span>{{ label(g) }}</span></a
                >
              } @else {
                <button
                  type="button"
                  class="tl-chip"
                  [title]="'Open ' + label(g) + ' in the menu'"
                  (click)="ui.reveal(surface(), g.k)"
                >
                  <rp-icon [name]="g.icon" [size]="16" /><span>{{ label(g) }}</span>
                </button>
              }
            }
          </div>
        }
      </section>
      <div class="tl-h tl-glance"><h2>Today at a glance</h2></div>
    }
  `,
})
export class TaskLauncher {
  protected readonly t = tr;
  protected readonly ui = inject(NavUi);
  private readonly sessions = inject(SessionContext);
  readonly surface = input.required<StaffSurface>();
  private readonly grid = viewChild<ElementRef<HTMLElement>>('grid');
  /** Columns the grid shows at its width (its container queries decide). */
  private readonly cols = signal(4);

  private readonly ranked = computed(() => {
    const s = this.surface();
    const session = s === 'ops' ? this.sessions.ops() : this.sessions.console();
    const pri = RANK[s];
    const rank = (g: NavGroup) => {
      const i = pri.indexOf(g.k);
      return i < 0 ? 99 : i;
    };
    return visibleNav(s, session?.subTasks ?? [])
      .filter((g) => g.k !== 'dash')
      .sort((a, b) => rank(a) - rank(b));
  });
  protected readonly top = computed(() => this.ranked().slice(0, MAX));
  protected readonly more = computed(() => this.ranked().slice(MAX));
  /** The task whose panel is open: a person with a single task finds it open. */
  protected readonly sel = linkedSignal<string | null>(() => {
    const parents = this.top().filter((g) => !g.solo);
    return parents.length === 1 ? parents[0]!.k : null;
  });
  protected readonly panel = computed(() => {
    const top = this.top();
    const i = top.findIndex((g) => g.k === this.sel() && !g.solo);
    if (i < 0) return null;
    const cols = Math.max(1, Math.min(this.cols(), top.length));
    const col = i % cols;
    // The pointer under the chosen card: its column's middle (the grid's gap is 18 px; one column
    // on narrow screens puts it in the middle whatever the gap).
    const x = `calc((100% + 18px) * ${((col + 0.5) / cols).toFixed(4)} - 9px)`;
    return {
      g: top[i]!,
      after: Math.min(top.length - 1, Math.floor(i / cols) * cols + cols - 1),
      style: { ...this.vars(i), '--tl-x': x },
    };
  });

  constructor() {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const el = entries[0]?.target;
      if (!el) return;
      const n = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
      if (n) this.cols.set(n);
    });
    // The grid shows once the session's tasks are known.
    effect(() => {
      const el = this.grid()?.nativeElement;
      ro.disconnect();
      if (el) ro.observe(el);
    });
    inject(DestroyRef).onDestroy(() => ro.disconnect());
  }

  protected pick(k: string) {
    this.sel.set(this.sel() === k ? null : k);
  }

  protected vars(i: number): Record<string, string> {
    const [tc, g1, g2] = PALETTE[i % PALETTE.length]!;
    return { '--tc': tc, '--g1': g1, '--g2': g2 };
  }

  protected label(g: NavGroup) {
    return g.key ? tr(g.key) : g.group;
  }

  protected link(id: string) {
    const area = this.surface() === 'ops' ? '/backoffice' : '/console';
    const path = pathOf(id);
    return path === 'home' ? [area] : [area, path];
  }
}
