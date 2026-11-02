import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { fixedOrigin, menuPlacement } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { person } from '../Applications/app-format';
import { gradeOf } from '../Coupons/StudentPicker';
import { MembersApi } from '../Members/members.api';
import { problemText } from '../Structure/academic-format';

export interface MemberOption {
  readonly id: string;
  readonly name: string;
  readonly sub: string;
}

/**
 * The calendar's "Individual" member (prototype cal-ind: a teacher, staff member, principal or
 * student): a dropdown with a search box over the active members (IDN-044), searched on the server
 * by name or number as the user types.
 */
@Component({
  selector: 'rp-member-select',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="dd" [class.open]="open()" [class.is-disabled]="disabled()">
      <button
        #btn
        type="button"
        class="dd-btn"
        [id]="inputId() + '-b'"
        [disabled]="disabled()"
        aria-haspopup="listbox"
        [attr.aria-expanded]="open()"
        [attr.aria-describedby]="inputId() + '-e'"
        (click)="toggle()"
        (keydown)="key($event)"
      >
        <span class="lbl" [class.ph]="!value()">{{ value()?.name ?? 'Choose a member' }}</span>
        <span class="caret"><rp-icon name="down" [size]="16" /></span>
      </button>
    </div>
    @if (open()) {
      <div
        class="dd-menu open"
        role="listbox"
        aria-label="Member"
        [style.left.px]="pos().left"
        [style.top.px]="pos().top"
        [style.width.px]="pos().width"
        (mousedown)="$event.stopPropagation()"
      >
        <div class="dd-search">
          <input
            #search
            type="text"
            placeholder="Search"
            aria-label="Search members"
            autocomplete="off"
            [value]="q()"
            (input)="setQ($event)"
            (keydown)="key($event)"
          />
        </div>
        @for (o of options(); track o.id; let i = $index) {
          <button
            type="button"
            class="dd-opt"
            role="option"
            [class.on]="o.id === value()?.id"
            [class.cur]="i === cursor()"
            [attr.aria-selected]="o.id === value()?.id"
            (mousedown)="$event.preventDefault()"
            (click)="pick(o)"
          >
            <span>{{ o.name }}</span>
            <span class="sub">{{ o.sub }}</span>
            @if (o.id === value()?.id) {
              <span class="tick"><rp-icon name="check" [size]="15" /></span>
            }
          </button>
        } @empty {
          <div class="dd-none">{{ loading() ? 'Searching…' : note() || 'No members match' }}</div>
        }
      </div>
    }`,
})
export class MemberSelect {
  private readonly members = inject(MembersApi);

  readonly inputId = input('cal-ind');
  readonly disabled = input(false);
  readonly value = model<MemberOption | null>(null);

  private readonly btn = viewChild<ElementRef<HTMLButtonElement>>('btn');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  protected readonly open = signal(false);
  protected readonly q = signal('');
  protected readonly options = signal<readonly MemberOption[]>([]);
  protected readonly loading = signal(false);
  protected readonly note = signal('');
  protected readonly cursor = signal(-1);
  protected readonly pos = signal({ left: 0, top: 0, width: 0 });
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const close = (e: Event) => {
      if (!this.open()) return;
      const b = this.btn()?.nativeElement;
      if (!(e.target instanceof Node) || !b?.contains(e.target)) this.open.set(false);
    };
    // Scrolling the page or a drawer moves the open menu with its button; it closes once the
    // button leaves the window (closing on every scroll lost the menu to a touchpad's glide, or to
    // the scroll that focusing the search box can cause).
    const follow = (e: Event) => {
      if (!this.open()) return;
      if (e.target instanceof Element && e.target.closest('.dd-menu')) return;
      const b = this.btn()?.nativeElement;
      const p = b ? menuPlacement(b) : null;
      if (p) this.pos.set({ left: p.left, top: p.top, width: p.width });
      else this.open.set(false);
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', follow, true);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', follow, true);
      clearTimeout(this.timer);
    });
  }

  protected toggle() {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    const b = this.btn()?.nativeElement;
    if (b) {
      const r = b.getBoundingClientRect();
      const o = fixedOrigin(b);
      this.pos.set({ left: r.left - o.left, top: r.bottom + 4 - o.top, width: r.width });
    }
    this.open.set(true);
    this.cursor.set(-1);
    if (!this.options().length) void this.load();
    setTimeout(() => this.search()?.nativeElement.focus({ preventScroll: true }), 30);
  }

  protected setQ(e: Event) {
    this.q.set((e.target as HTMLInputElement).value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(), 250);
  }

  private async load() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const r = await this.members.list({
        kind: 'ALL',
        status: 'ACTIVE',
        q: this.q().trim() || undefined,
        limit: 50,
      });
      if (n !== this.seq) return;
      this.options.set(
        r.items
          .filter((m) => m.kind === 'STUDENTS' || m.kind === 'STAFF')
          .map((m) => ({
            id: m.id,
            name: person(m.name),
            sub: m.kind === 'STUDENTS' ? gradeOf(m) : m.userType.name,
          })),
      );
      this.note.set('');
    } catch (e) {
      if (n === this.seq) {
        this.options.set([]);
        this.note.set(problemText(e));
      }
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  protected pick(o: MemberOption) {
    this.value.set(o);
    this.open.set(false);
    this.btn()?.nativeElement.focus();
  }

  protected key(e: KeyboardEvent) {
    const n = this.options().length;
    if (!this.open()) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggle();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.open.set(false);
      this.btn()?.nativeElement.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      this.cursor.set((this.cursor() + step + n) % Math.max(n, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = this.options()[this.cursor()];
      if (o) this.pick(o);
    }
  }
}
