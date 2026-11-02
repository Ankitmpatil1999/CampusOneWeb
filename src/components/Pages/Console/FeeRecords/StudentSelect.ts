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
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { gradeOf } from '../Coupons/StudentPicker';
import { MembersApi, type MemberRow } from '../Members/members.api';
import { FeeRecordsApi } from './fee-records.api';

export interface StudentOption {
  readonly id: string;
  readonly name: string;
  readonly admissionNo: string | null;
  readonly grade: string;
}

/**
 * A student dropdown with a search box (prototype ui.select with `search`: "Search a student"):
 * the active students of the institution, by name or admission number — from the member directory
 * (IDN-044, members.view), or for the fee forms from the fee students list (FEE-043, fees.edit), so
 * Accounts can bill a student without the directory (client 2026-10-15).
 */
@Component({
  selector: 'rp-student-select',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="dd" [class.open]="open()">
      <button
        #btn
        type="button"
        class="dd-btn"
        [id]="inputId() + '-b'"
        aria-haspopup="listbox"
        [attr.aria-expanded]="open()"
        [attr.aria-describedby]="inputId() + '-e'"
        (click)="toggle()"
        (keydown)="key($event)"
      >
        <span class="lbl" [class.ph]="!value()">{{
          value() ? label(value()!) : 'Search a student'
        }}</span>
        <span class="caret"><rp-icon name="down" [size]="16" /></span>
      </button>
    </div>
    @if (open()) {
      <div
        class="dd-menu open"
        role="listbox"
        aria-label="Student"
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
            aria-label="Search students"
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
            <span>{{ label(o) }}</span>
            <span class="sub">{{ o.grade }}</span>
            @if (o.id === value()?.id) {
              <span class="tick"><rp-icon name="check" [size]="15" /></span>
            }
          </button>
        } @empty {
          <div class="dd-none">
            {{ loading() ? 'Searching…' : note() || 'No students match' }}
          </div>
        }
      </div>
    }`,
})
export class StudentSelect {
  private readonly members = inject(MembersApi);
  private readonly fees = inject(FeeRecordsApi);

  readonly inputId = input('st-pick');
  /** Where the students come from: the member directory, or the fee students list. */
  readonly source = input<'members' | 'fees'>('members');
  readonly value = model<StudentOption | null>(null);
  /** Students who can't be chosen here (already registered, for example). */
  readonly exclude = input<readonly string[]>([]);

  private readonly btn = viewChild<ElementRef<HTMLButtonElement>>('btn');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  protected readonly open = signal(false);
  protected readonly q = signal('');
  protected readonly options = signal<readonly StudentOption[]>([]);
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

  protected label(o: StudentOption) {
    return o.admissionNo ? `${o.name} · ${o.admissionNo}` : o.name;
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
      const q = this.q().trim() || undefined;
      const items: readonly Pick<MemberRow, 'id' | 'name' | 'admissionNo' | 'grade'>[] = (
        this.source() === 'fees'
          ? await this.fees.students(q ? { q } : {})
          : await this.members.list({ kind: 'STUDENTS', status: 'ACTIVE', q, limit: 50 })
      ).items;
      if (n !== this.seq) return;
      const skip = new Set(this.exclude());
      this.options.set(
        items
          .filter((m) => !skip.has(m.id))
          .map((m) => ({ id: m.id, name: m.name, admissionNo: m.admissionNo, grade: gradeOf(m) })),
      );
      this.note.set('');
    } catch (e) {
      if (n === this.seq) {
        this.options.set([]);
        this.note.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  protected pick(o: StudentOption) {
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
