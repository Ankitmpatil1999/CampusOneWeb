import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  type OnInit,
} from '@angular/core';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, Kpi } from '../../../Shared/Blocks';
import { type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDateTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { person } from '../Applications/app-format';
import { plural } from '../Fees/fee-format';
import { byLabel, num, problemText } from '../Structure/academic-format';
import { SearchSelect } from '../../../Shared/SearchSelect';
import type { ClassView } from '../Structure/structure.api';
import { EnrolmentsApi, type Outcome, type Rollover, type RolloverItem } from './enrolments.api';

type Filter = 'all' | 'flag' | 'chg';
const PAGE = 15;
const DECISION: Readonly<Record<Outcome, string>> = {
  PROMOTED: 'Promote',
  REPEATED: 'Hold back',
  LEFT: 'Leaving',
};

interface Place {
  readonly cls: ClassView;
  readonly sectionId: string;
  readonly next: ClassView | null;
}

/**
 * The roll-over into the next academic year (prototype rollView / cc.ro.*; ACA-031…033; CR-13,
 * RNG-ACA-451…455): the proposal drawn once from the class order (the same section name where it
 * exists; the final class leaves), amended per student — promote into a section, hold back or
 * leaving — and committed as a whole: enrolments in the next year, leavers recorded, families told.
 */
@Component({
  selector: 'rp-rollover-panel',
  imports: [Avatar, Empty, Icon, Kpi, Pager, SearchSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (denied()) {
      <div class="card pad">
        <rp-empty icon="lock" title="The roll-over isn't part of your role" [text]="denied()" />
      </div>
    } @else if (error()) {
      <div class="card pad">
        <rp-empty
          [icon]="nextNeeded() ? 'calendar' : 'alertc'"
          [title]="errTitle()"
          [text]="error()"
        >
          @if (!nextNeeded()) {
            <button type="button" class="btn btn-sec btn-sm" (click)="load()">
              <span>Try again</span>
            </button>
          }
        </rp-empty>
      </div>
    } @else if (!roll()) {
      <div class="stack g16" aria-busy="true" aria-label="Loading">
        <div class="sk" style="height: 64px; border-radius: 12px"></div>
        <div class="c-grid k4 cc-kp">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="sk" style="height: 104px; border-radius: 16px"></div>
          }
        </div>
        <div class="sk" style="height: 320px; border-radius: 16px"></div>
      </div>
    } @else if (roll()!.status === 'COMMITTED') {
      <div class="card pad stack g16" id="ro-done">
        <div class="row g12">
          <span class="li-ic" style="background: var(--ok-soft); color: var(--ok)"
            ><rp-icon name="checkc" [size]="20"
          /></span>
          <div class="grow">
            <h3 class="t-h3">Roll-over committed</h3>
            <p class="t-sm t-muted">
              {{ committedAt() }} · {{ roll()!.from.label }} → {{ roll()!.to.label }}
            </p>
          </div>
          <button type="button" class="btn btn-sec" (click)="viewNext.emit(roll()!.to.id)">
            <rp-icon name="arrowr" [size]="17" /><span>View {{ roll()!.to.label }} enrolment</span>
          </button>
        </div>
        <div class="c-grid k4 cc-kp">
          <rp-kpi
            label="Promoted"
            icon="trendup"
            tone="ok"
            [value]="num(roll()!.counts.promoted)"
          />
          <rp-kpi
            label="Held back"
            icon="undo"
            tone="warn"
            [value]="num(roll()!.counts.repeated)"
          />
          <rp-kpi label="Leaving" icon="logout" [value]="num(roll()!.counts.left)" />
          <rp-kpi
            label="Families notified"
            icon="bell"
            value="—"
            delta="Sent with each new placement"
          />
        </div>
        <p class="t-sm t-muted">
          Each student now holds one enrolment in {{ roll()!.to.label }}. Changes to
          {{ roll()!.from.label }} after it closes go through a correction approval.
        </p>
      </div>
    } @else {
      <div class="note tone-info">
        <rp-icon name="route" [size]="17" />
        <div class="grow">
          <b>How roll-over works.</b> The proposal moves each student to the next class in the class
          order, keeping the section where it exists. Amend any student — promote, hold back or mark
          as leaving — then commit once. Each student holds one enrolment per year.
        </div>
      </div>
      <div class="c-grid k4 cc-kp">
        <rp-kpi label="Promote" icon="trendup" tone="ok" [value]="num(roll()!.counts.promoted)" />
        <rp-kpi label="Hold back" icon="undo" tone="warn" [value]="num(roll()!.counts.repeated)" />
        <rp-kpi
          label="Leaving"
          icon="logout"
          [value]="num(roll()!.counts.left)"
          delta="Includes the final class"
        />
        <rp-kpi
          label="Need a look"
          icon="alert"
          [tone]="flagged().length ? 'bad' : 'ok'"
          [value]="num(flagged().length)"
          delta="Suspended students"
        />
      </div>
      <div class="c-filters">
        <div class="pills" role="group" aria-label="Show">
          <button
            type="button"
            class="pill"
            [class.on]="filter() === 'all'"
            [attr.aria-pressed]="filter() === 'all'"
            (click)="filter.set('all'); page.set(1)"
          >
            By class-section
          </button>
          <button
            type="button"
            class="pill"
            [class.on]="filter() === 'flag'"
            [attr.aria-pressed]="filter() === 'flag'"
            (click)="filter.set('flag'); page.set(1)"
          >
            Need a look<span class="n">{{ flagged().length }}</span>
          </button>
          <button
            type="button"
            class="pill"
            [class.on]="filter() === 'chg'"
            [attr.aria-pressed]="filter() === 'chg'"
            (click)="filter.set('chg'); page.set(1)"
          >
            Amended<span class="n">{{ amended().length }}</span>
          </button>
        </div>
        @if (filter() === 'all') {
          <div class="fld">
            <rp-search-select
              inputId="f-rk"
              placeholder="Choose a class-section"
              [options]="fromOptions()"
              [value]="fromSection()"
              (changed)="fromSection.set($event); page.set(1)"
            />
          </div>
        }
        <span class="fsum row g8"
          ><span class="cp-why" [attr.title]="readOnly() || null"
            ><button
              type="button"
              class="btn btn-pri"
              id="ro-commit"
              [class.is-busy]="committing()"
              [disabled]="!!readOnly() || committing() || !roll()!.items.length"
              (click)="commit()"
            >
              <rp-icon name="check" [size]="17" /><span>Commit roll-over</span>
            </button></span
          ></span
        >
      </div>
      <div class="tbl-wrap">
        <table class="tbl" id="ro-table">
          <thead>
            <tr>
              @for (c of sortCols; track c) {
                <th
                  class="sort"
                  [class.asc]="sort()?.k === c && sort()?.dir === 'asc'"
                  [class.desc]="sort()?.k === c && sort()?.dir === 'desc'"
                  (click)="sortBy(c)"
                >
                  {{ c === 'name' ? 'Student' : roll()!.from.label
                  }}<span class="sa" aria-hidden="true">{{
                    sort()?.k === c && sort()?.dir === 'desc' ? '↓' : '↑'
                  }}</span>
                </th>
              }
              <th>Note</th>
              <th>Decision</th>
              <th>{{ roll()!.to.label }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (r of shown(); track r.student.id) {
              <tr>
                <td>
                  <div class="cell-main">
                    <rp-av [name]="person(r.student.name)" size="sm" />
                    <div style="min-width: 0">
                      <div class="cell-t t-clip">{{ person(r.student.name) }}</div>
                      <div class="cell-s t-clip">{{ r.student.admissionNo || '—' }}</div>
                    </div>
                  </div>
                </td>
                <td>{{ r.from }}</td>
                <td>
                  @if (note(r); as n) {
                    <span class="t-sm" [class.t-warn]="n.warn" [class.t-muted]="!n.warn">{{
                      n.text
                    }}</span>
                  } @else {
                    <span class="t-faint">—</span>
                  }
                </td>
                <td>
                  <select
                    class="cc-nsel"
                    [disabled]="!!readOnly() || busy() === r.student.id"
                    [attr.aria-label]="'Decision for ' + person(r.student.name)"
                    (change)="decide(r, $event)"
                  >
                    @for (o of decisions(r); track o) {
                      <option [value]="o" [selected]="o === r.outcome">
                        {{ decisionLabel(o) }}
                      </option>
                    }
                  </select>
                </td>
                <td>
                  @switch (r.outcome) {
                    @case ('LEFT') {
                      <span class="t-faint">Not enrolled</span>
                    }
                    @case ('REPEATED') {
                      <b>{{ r.to?.label ?? r.from }}</b
                      >&ngsp;<span class="t-xs t-muted">again</span>
                    }
                    @default {
                      <div class="row g6">
                        <b>{{ placeOf(r)?.next?.name ?? r.to?.label }}</b>
                        @if (placeOf(r)?.next; as nx) {
                          <select
                            class="cc-nsel"
                            [disabled]="!!readOnly() || busy() === r.student.id"
                            [attr.aria-label]="'Section for ' + person(r.student.name)"
                            (change)="moveTo(r, $event)"
                          >
                            @for (s of nx.sections; track s.id) {
                              <option [value]="s.id" [selected]="s.id === r.to?.sectionId">
                                {{ s.name }}
                              </option>
                            }
                          </select>
                        }
                      </div>
                    }
                  }
                </td>
                <td>
                  @if (r.amended) {
                    <span class="chip dot tone-info">Amended</span>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6">
                  <rp-empty
                    icon="grad"
                    [title]="roll()!.items.length ? 'Nothing to show' : 'No students to roll over'"
                    [text]="
                      !roll()!.items.length
                        ? 'No one is enrolled in ' + roll()!.from.label + ' yet.'
                        : filter() === 'chg'
                          ? 'No student has been amended yet.'
                          : filter() === 'flag'
                            ? 'No student needs a look.'
                            : 'No student in this class-section.'
                    "
                  />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (rows().length > pageSize) {
        <rp-pager
          [total]="rows().length"
          [page]="page()"
          [size]="pageSize"
          (go)="page.set($event)"
        />
      } @else if (rows().length) {
        <div class="pager">
          <span>{{ plural(rows().length, 'student') }}</span>
        </div>
      }
    }
  `,
})
export class RolloverPanel implements OnInit {
  private readonly api = inject(EnrolmentsApi);
  private readonly overlays = inject(Overlays);

  readonly classes = input.required<readonly ClassView[]>();
  /** Why the role can't amend or commit ('' when it can). */
  readonly readOnly = input('');
  /** Why the role can't open the roll-over at all (no academics.year). */
  readonly denied = input('');
  readonly committed = output<Rollover>();
  readonly viewNext = output<string>();
  /** The proposal was loaded (its target year and status, for the tab). */
  readonly loaded = output<Rollover>();

  protected readonly pageSize = PAGE;
  protected readonly num = num;
  protected readonly plural = plural;
  protected readonly person = person;
  protected readonly roll = signal<Rollover | null>(null);
  protected readonly error = signal('');
  protected readonly nextNeeded = signal(false);
  protected readonly filter = signal<Filter>('all');
  protected readonly fromSection = signal('');
  protected readonly page = signal(1);
  protected readonly busy = signal('');
  protected readonly committing = signal(false);

  /** Each "Grade 7 B" label → its class, section and the next class in the order. */
  private readonly places = computed(() => {
    const sorted = [...this.classes()].sort((a, b) => a.order - b.order);
    const m = new Map<string, Place>();
    sorted.forEach((c, i) => {
      for (const s of c.sections) {
        m.set(`${c.name} ${s.name}`, { cls: c, sectionId: s.id, next: sorted[i + 1] ?? null });
      }
    });
    return m;
  });
  protected readonly fromOptions = computed<DropdownOption[]>(() =>
    [...new Set((this.roll()?.items ?? []).map((i) => i.from))]
      .sort((a, b) => {
        const x = this.places().get(a);
        const y = this.places().get(b);
        return x && y && x.cls.order !== y.cls.order ? x.cls.order - y.cls.order : byLabel(a, b);
      })
      .map((l) => ({ v: l, l })),
  );
  protected readonly flagged = computed(() =>
    (this.roll()?.items ?? []).filter(
      (i) => i.student.status === 'SUSPENDED' && i.outcome !== 'LEFT',
    ),
  );
  protected readonly amended = computed(() => (this.roll()?.items ?? []).filter((i) => i.amended));
  protected readonly rows = computed(() => {
    const f = this.filter();
    if (f === 'flag') return this.flagged();
    if (f === 'chg') return this.amended();
    const k = this.fromSection() || this.fromOptions()[0]?.v || '';
    return (this.roll()?.items ?? []).filter((i) => i.from === k);
  });
  protected readonly sortCols: readonly ('name' | 'from')[] = ['name', 'from'];
  protected readonly sort = signal<{ k: 'name' | 'from'; dir: 'asc' | 'desc' } | null>(null);
  private readonly sorted = computed(() => {
    const s = this.sort();
    if (!s) return this.rows();
    const val = (r: RolloverItem) => {
      if (s.k === 'name') return person(r.student.name);
      const p = this.placeOf(r);
      return `${String(p?.cls.order ?? 999).padStart(4, '0')} ${r.from}`;
    };
    return [...this.rows()].sort((a, b) => {
      const c = byLabel(val(a), val(b));
      return s.dir === 'desc' ? -c : c;
    });
  });
  protected readonly shown = computed(() =>
    this.sorted().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected sortBy(k: 'name' | 'from') {
    const s = this.sort();
    this.sort.set({ k, dir: s?.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
  }
  protected readonly errTitle = computed(() =>
    this.nextNeeded() ? 'Add the next academic year first' : "Couldn't load the roll-over",
  );
  protected readonly committedAt = computed(() => {
    const at = this.roll()?.committedAt;
    return at ? formatDateTime(at) : '';
  });

  ngOnInit() {
    if (!this.denied()) void this.load();
  }

  protected async load() {
    this.error.set('');
    this.nextNeeded.set(false);
    try {
      const r = await this.api.proposal();
      this.roll.set(r);
      this.loaded.emit(r);
    } catch (e) {
      this.nextNeeded.set(e instanceof ApiProblem && e.code === 'ACA.NEXT_YEAR_NEEDED');
      this.error.set(problemText(e));
    }
  }

  protected placeOf(r: RolloverItem) {
    return this.places().get(r.from) ?? null;
  }
  protected decisions(r: RolloverItem): Outcome[] {
    return this.placeOf(r)?.next ? ['PROMOTED', 'REPEATED', 'LEFT'] : ['REPEATED', 'LEFT'];
  }
  protected decisionLabel(o: Outcome) {
    return DECISION[o];
  }
  protected note(r: RolloverItem): { text: string; warn: boolean } | null {
    if (r.student.status === 'SUSPENDED')
      return { text: 'Suspended — decide before committing', warn: true };
    if (r.outcome === 'LEFT' && !r.amended && !this.placeOf(r)?.next) {
      return { text: 'Completes the final class', warn: false };
    }
    return null;
  }
  protected decide(r: RolloverItem, e: Event) {
    const el = e.target as HTMLSelectElement;
    const o = el.value as Outcome;
    const p = this.placeOf(r);
    if (o === 'LEFT') return void this.amend(r, o, null, el);
    if (o === 'REPEATED') return void this.amend(r, o, p?.sectionId ?? null, el);
    const next = p?.next;
    const same = next?.sections.find(
      (s) => s.name.toLowerCase() === r.from.slice(p!.cls.name.length + 1).toLowerCase(),
    );
    void this.amend(r, o, (same ?? next?.sections[0])?.id ?? null, el);
  }

  protected moveTo(r: RolloverItem, e: Event) {
    const el = e.target as HTMLSelectElement;
    void this.amend(r, 'PROMOTED', el.value, el, r.to?.sectionId ?? '');
  }

  /** Saves one student's decision; a refused change puts the select back. */
  private async amend(
    r: RolloverItem,
    outcome: Outcome,
    sectionId: string | null,
    el: HTMLSelectElement,
    was: string = r.outcome,
  ) {
    const roll = this.roll();
    if (!roll || this.readOnly()) return;
    this.busy.set(r.student.id);
    try {
      this.roll.set(
        await this.api.amend(roll.id, r.student.id, roll.version, { outcome, sectionId }),
      );
    } catch (e) {
      el.value = was;
      this.overlays.toast('Not saved', { tone: 'bad', sub: problemText(e) });
      if (e instanceof ApiProblem && (e.status === 412 || e.status === 428)) void this.load();
    } finally {
      this.busy.set('');
    }
  }

  protected async commit() {
    const roll = this.roll();
    if (!roll || this.readOnly() || this.committing()) return;
    const c = roll.counts;
    const sus = this.flagged().length;
    const ok = await this.overlays.confirm({
      title: `Commit the roll-over to ${roll.to.label}?`,
      text: `${num(c.promoted)} promoted, ${num(c.repeated)} held back and ${num(c.left)} leaving. This creates ${num(c.promoted + c.repeated)} enrolments in ${roll.to.label} and notifies each family.${sus ? ` ${plural(sus, 'suspended student')} ${sus === 1 ? 'is' : 'are'} included.` : ''} It can't be undone from here.`,
      ok: 'Commit roll-over',
      icon: 'grad',
    });
    if (!ok) return;
    this.committing.set(true);
    try {
      const out = await this.api.commit(roll.id, roll.version);
      this.roll.set(out);
      this.overlays.toast('Roll-over committed', {
        sub: `${plural(out.counts.promoted + out.counts.repeated, 'student')} enrolled in ${out.to.label}`,
      });
      this.committed.emit(out);
    } catch (e) {
      this.overlays.toast("Couldn't commit the roll-over", { tone: 'bad', sub: problemText(e) });
      if (e instanceof ApiProblem && (e.status === 409 || e.status === 412)) void this.load();
    } finally {
      this.committing.set(false);
    }
  }
}
