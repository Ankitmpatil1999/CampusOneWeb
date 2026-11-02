import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { Avatar } from '../../../Shared/Avatar';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { MembersApi, type ClassView, type MemberRow } from '../Members/members.api';

const SHOWN = 150;

/** "Grade 6 A" from a member row's class and section; "Not enrolled" without one. */
export const gradeOf = (s: Pick<MemberRow, 'grade'>) =>
  s.grade ? `${s.grade.class}${s.grade.section ? ' ' + s.grade.section : ''}` : 'Not enrolled';

/**
 * The student picker of the coupon forms (prototype CM.picker): class, section and search, "select
 * all shown", and the active students of the institution with a tick each (first 150 shown).
 */
@Component({
  selector: 'rp-student-picker',
  imports: [Avatar, Dropdown, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="cm-pk">
      <div class="cm-pk-f">
        <rp-dd
          [inputId]="'pk-' + key() + '-cls'"
          placeholder="All classes"
          [options]="classOptions()"
          [value]="cls()"
          (changed)="setClass($event)"
        />
        <rp-dd
          [inputId]="'pk-' + key() + '-sec'"
          placeholder="All sections"
          [options]="sectionOptions()"
          [value]="sec()"
          (changed)="setSection($event)"
        />
        <label class="search"
          ><rp-icon name="search" [size]="16" /><input
            type="search"
            [id]="'pk-' + key() + '-q'"
            placeholder="Search name or admission no."
            aria-label="Search students"
            autocomplete="off"
            [value]="q()"
            (input)="setQ($event)"
        /></label>
      </div>
      <div class="cm-pk-bar">
        <label class="chk"
          ><input
            type="checkbox"
            [id]="'pk-' + key() + '-all'"
            [checked]="allOn()"
            [disabled]="!shown().length"
            (change)="toggleAll()"
          /><span>Select all {{ num(shown().length) }} shown</span></label
        >
        <span class="grow"></span>
        <b class="t-num">{{ num(selected().length) }} selected</b>
        @if (selected().length) {
          <button type="button" class="linkbtn" (click)="selected.set([])">Clear</button>
        }
      </div>
      <div class="cm-pk-list" role="group" aria-label="Students">
        @if (loading() && !students().length) {
          <div class="cm-pk-none">Loading students…</div>
        } @else if (error()) {
          <div class="cm-pk-none">{{ error() }}</div>
        }
        @for (s of shown(); track s.id) {
          <label class="cm-pk-row" [class.on]="isOn(s.id)"
            ><input
              type="checkbox"
              [value]="s.id"
              [checked]="isOn(s.id)"
              (change)="toggle(s)"
            /><rp-av [name]="s.name" size="xs" /><span class="grow cm-pk-t"
              ><b>{{ s.name }}</b
              ><small>{{ s.admissionNo ?? '—' }} · {{ grade(s) }}</small></span
            ></label
          >
        } @empty {
          @if (!loading() && !error()) {
            <div class="cm-pk-none">No active students match. Change the class or search.</div>
          }
        }
      </div>
      @if (more()) {
        <div class="t-xs t-muted" style="padding: 6px 2px 0">
          Showing the first {{ shown().length }} — narrow by class, section or search.
        </div>
      }
    </div>
  `,
})
export class StudentPicker {
  private readonly members = inject(MembersApi);

  /** The id prefix of the controls (pk-<key>-cls …). */
  readonly key = input('ci');
  readonly classes = input<readonly ClassView[]>([]);
  readonly selected = model<readonly MemberRow[]>([]);

  protected readonly cls = signal('');
  protected readonly sec = signal('');
  protected readonly q = signal('');
  protected readonly students = signal<readonly MemberRow[]>([]);
  protected readonly more = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  private seq = 0;
  private qTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly classOptions = computed<DropdownOption[]>(() => [
    { v: '', l: 'All classes' },
    ...this.classes().map((c) => ({ v: c.id, l: c.name })),
  ]);
  protected readonly sectionOptions = computed<DropdownOption[]>(() => {
    const c = this.classes().find((x) => x.id === this.cls());
    return [
      { v: '', l: 'All sections' },
      ...(c?.sections ?? []).map((s) => ({ v: s.id, l: `Section ${s.name}` })),
    ];
  });
  protected readonly shown = computed(() => this.students().slice(0, SHOWN));
  protected readonly allOn = computed(
    () => this.shown().length > 0 && this.shown().every((s) => this.isOn(s.id)),
  );

  constructor() {
    void this.load();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.qTimer));
  }

  private async load() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const r = await this.members.list({
        kind: 'STUDENTS',
        status: 'ACTIVE',
        classId: this.cls() || undefined,
        sectionId: this.sec() || undefined,
        q: this.q().trim() || undefined,
        limit: 200,
      });
      if (n !== this.seq) return;
      this.students.set(r.items);
      this.more.set(r.items.length > SHOWN || r.nextCursor !== null);
      this.error.set('');
    } catch (e) {
      if (n === this.seq) {
        this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }
  protected setClass(v: string) {
    this.cls.set(v);
    this.sec.set('');
    void this.load();
  }
  protected setSection(v: string) {
    this.sec.set(v);
    void this.load();
  }
  protected setQ(e: Event) {
    this.q.set((e.target as HTMLInputElement).value);
    clearTimeout(this.qTimer);
    this.qTimer = setTimeout(() => void this.load(), 250);
  }
  protected isOn(id: string) {
    return this.selected().some((s) => s.id === id);
  }
  protected toggle(s: MemberRow) {
    this.selected.update((list) =>
      this.isOn(s.id) ? list.filter((x) => x.id !== s.id) : [...list, s],
    );
  }
  protected toggleAll() {
    const shown = this.shown();
    if (this.allOn()) {
      const ids = new Set(shown.map((s) => s.id));
      this.selected.update((list) => list.filter((s) => !ids.has(s.id)));
    } else {
      this.selected.update((list) => [
        ...list,
        ...shown.filter((s) => !list.some((x) => x.id === s.id)),
      ]);
    }
  }
  protected grade(s: MemberRow) {
    return gradeOf(s);
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
}
