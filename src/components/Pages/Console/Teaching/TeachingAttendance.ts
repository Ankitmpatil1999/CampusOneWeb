/**
 * Attendance (Phase 10, teachers on the web; the app's m.t.att): the class teacher's daily register
 * for a date — Present, Late, Half day or Absent with a remark, "mark all present", approved leave and
 * reader taps shown, only changed rows sent (ATT-019/020) — and the teacher's own periods of the date,
 * each marked Present, Late or Absent once it has started (ATT-021/022).
 * By card (client 2026-10-13; ATT-028): with the NFC reader on this computer, a student who missed
 * the gate taps their card in class and today's attendance is recorded at once — on the "By card" tab
 * for any class the teacher teaches, and on the class teacher's register (CardTaker).
 */
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  type OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Dropdown } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDate } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { t as tr } from '../../../Utils/t';
import { problemText, t12, today } from '../Structure/academic-format';
import { CardTaker, type TapLine } from './CardTaker';
import {
  type CardTapResult,
  type ClassItem,
  ClassesApi,
  type DailyStatus,
  type MyPeriod,
  type Register,
  type Roster,
} from './classes.api';

type PeriodStatus = 'PRESENT' | 'LATE' | 'ABSENT';
interface Edit {
  readonly status?: DailyStatus;
  readonly remark?: string;
}
const DAILY: readonly DailyStatus[] = ['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT'];
const PERIOD: readonly PeriodStatus[] = ['PRESENT', 'LATE', 'ABSENT'];
/** The register answers these when the teacher is no class teacher (or has no classes). */
const NOT_CLASS_TEACHER = new Set(['ACA.CLASS_TEACHER_ONLY', 'ATT.NO_CLASSES']);

@Component({
  selector: 'rp-teaching-attendance',
  imports: [CardTaker, Dropdown, Empty, Icon, Kpi, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    <rp-page-head [title]="t('ui.web.nav.attendance')" [sub]="t('ui.web.tch.att.sub')" />

    <div class="tabs" role="tablist" [attr.aria-label]="t('ui.web.nav.attendance')">
      @if (classTeacher() !== false) {
        <button
          type="button"
          class="tab"
          role="tab"
          id="ta-tab-reg"
          [class.on]="tab() === 'reg'"
          [attr.aria-selected]="tab() === 'reg'"
          (click)="switchTab('reg')"
        >
          {{ t('ui.web.tch.att.register') }}
        </button>
      }
      <button
        type="button"
        class="tab"
        role="tab"
        id="ta-tab-per"
        [class.on]="tab() === 'per'"
        [attr.aria-selected]="tab() === 'per'"
        (click)="switchTab('per')"
      >
        {{ t('ui.web.tch.att.periods') }}
      </button>
      <button
        type="button"
        class="tab"
        role="tab"
        id="ta-tab-card"
        [class.on]="tab() === 'card'"
        [attr.aria-selected]="tab() === 'card'"
        (click)="switchTab('card')"
      >
        {{ t('ui.web.tch.card.tab') }}
      </button>
    </div>

    <div class="card pad row g16 wrap" style="align-items: end">
      @if (tab() !== 'card') {
        <div class="fld" style="width: 200px">
          <label class="fld-l" for="ta-date">{{ t('ui.web.tch.att.date') }}</label>
          <div class="fld-in">
            <input
              id="ta-date"
              type="date"
              [max]="todayIso"
              [value]="date()"
              (change)="setDate($event)"
            />
          </div>
        </div>
      }
      @if (tab() === 'reg' && (reg()?.sections?.length ?? 0) > 1) {
        <div class="fld" style="width: 240px">
          <label class="fld-l" for="ta-class-b">{{ t('ui.web.tch.att.class') }}</label>
          <rp-dd
            inputId="ta-class"
            [options]="sectionOptions()"
            [value]="reg()!.section.id"
            (changed)="pickSection($event)"
          />
        </div>
      }
      @if (tab() === 'card') {
        <div class="grow t-muted" id="ta-card-why" style="min-width: 220px; align-self: center">
          {{ t('ui.web.tch.card.why', { date: todayLabel }) }}
        </div>
        @if (cardOptions().length > 1) {
          <div class="fld" style="width: 240px">
            <label class="fld-l" for="ta-cclass-b">{{ t('ui.web.tch.att.class') }}</label>
            <rp-dd
              inputId="ta-cclass"
              [options]="cardOptions()"
              [value]="cardSection() ?? ''"
              (changed)="pickCardSection($event)"
            />
          </div>
        }
      }
    </div>

    @if (loading()) {
      <div class="card pad"><div class="sk" style="height: 280px; border-radius: 16px"></div></div>
    } @else if (error()) {
      <div class="note tone-bad" role="alert" id="ta-error">
        <rp-icon name="alert" [size]="17" />
        <div class="grow">{{ error() }}</div>
        <button type="button" class="btn btn-sec btn-sm" (click)="load()">
          {{ t('ui.web.tch.retry') }}
        </button>
      </div>
    } @else if (tab() === 'card') {
      @if (!cardOptions().length) {
        <rp-empty icon="users" [title]="t('ui.web.tch.card.noClasses')" />
      } @else if (cardRoster(); as ro) {
        <rp-card-taker [handle]="dayTap" />
        <div class="card">
          <div class="tbl-wrap">
            <table class="tbl" id="ta-cgrid">
              <thead>
                <tr>
                  <th>{{ t('ui.web.tch.roster.admission') }}</th>
                  <th>{{ t('ui.web.tch.roster.name') }}</th>
                  <th>{{ t('ui.web.tch.card.today') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (s of ro.items; track s.id) {
                  <tr>
                    <td class="t-mono t-sm">{{ s.admissionNo ?? '—' }}</td>
                    <td>
                      <div class="row g8 wrap">
                        <b>{{ s.name }}</b>
                        @if (cardTapped()[s.id]) {
                          <span class="chip dot tone-ok">{{ t('ui.web.tch.card.tag') }}</span>
                        }
                      </div>
                    </td>
                    <td>
                      @if (s.attendanceToday; as st) {
                        <span [class]="'chip dot tone-' + toneName(st)">{{ status(st) }}</span>
                      } @else {
                        <span class="t-faint">{{ t('ui.web.tch.att.notMarked') }}</span>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="3" class="t-muted">{{ t('ui.web.tch.roster.empty') }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    } @else if (tab() === 'reg') {
      @if (reg(); as r) {
        @if (r.sunday) {
          <div class="note tone-info" id="ta-sunday">
            <rp-icon name="info" [size]="17" />
            <div class="grow">{{ t('ui.web.tch.att.sunday') }}</div>
          </div>
        } @else if (r.holiday) {
          <div class="note tone-info" id="ta-holiday">
            <rp-icon name="calendar" [size]="17" />
            <div class="grow">{{ t('ui.web.tch.att.holiday', { name: r.holiday }) }}</div>
          </div>
        }
        <div class="c-grid k4 cc-kp" id="ta-kpis">
          <rp-kpi
            [label]="status('PRESENT')"
            [value]="'' + counts().present"
            icon="checkc"
            tone="ok"
          />
          <rp-kpi [label]="status('LATE')" [value]="'' + counts().late" icon="clock" tone="warn" />
          <rp-kpi [label]="status('ABSENT')" [value]="'' + counts().absent" icon="xc" tone="bad" />
          <rp-kpi
            [label]="t('ui.web.tch.att.notMarked')"
            [value]="'' + counts().notMarked"
            icon="hourglass"
            tone="info"
            [small]="t('ui.web.tch.att.marked', { n: counts().marked, total: rows().length })"
          />
        </div>
        @if (canTapToday() && rows().length) {
          <rp-card-taker [handle]="dailyTap" (active)="onCard($event)" />
          @if (cardUsed() && counts().notMarked) {
            <div class="note tone-info" id="ta-card-rest">
              <rp-icon name="info" [size]="17" />
              <div class="grow">{{ t('ui.web.tch.card.restHint') }}</div>
            </div>
          }
        }
        @if (!rows().length) {
          <rp-empty icon="users" [title]="t('ui.web.tch.roster.empty')" />
        } @else {
          <div class="card">
            <div class="tbl-wrap">
              <table class="tbl" id="ta-grid">
                <thead>
                  <tr>
                    <th>{{ t('ui.web.tch.roster.admission') }}</th>
                    <th>{{ t('ui.web.tch.roster.name') }}</th>
                    <th>{{ t('ui.web.nav.attendance') }}</th>
                    <th>{{ t('ui.web.tch.att.remark') }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of rows(); track row.id; let i = $index) {
                    <tr [class.sel]="row.changed">
                      <td class="t-mono t-sm">{{ row.admissionNo ?? '—' }}</td>
                      <td>
                        <div class="row g8 wrap">
                          <b>{{ row.name }}</b>
                          @if (row.onLeave) {
                            <span class="chip dot tone-violet">{{
                              t('ui.web.tch.att.onLeave')
                            }}</span>
                          }
                          @if (row.reader) {
                            <span class="chip">{{ t('ui.web.tch.att.auto') }}</span>
                          }
                        </div>
                      </td>
                      <td>
                        <div
                          class="seg"
                          role="radiogroup"
                          style="width: max-content"
                          [attr.aria-label]="t('ui.web.tch.att.statusOf', { name: row.name })"
                          [id]="'ta-s-' + i"
                        >
                          @for (s of daily; track s) {
                            <button
                              type="button"
                              role="radio"
                              [class.on]="row.status === s"
                              [attr.aria-checked]="row.status === s"
                              [style.background]="row.status === s ? 'var(--surface)' : null"
                              [style.box-shadow]="row.status === s ? 'var(--shadow-1)' : null"
                              [style.color]="row.status === s ? toneOf(s) : null"
                              [disabled]="closed()"
                              (click)="setStatus(row.id, s)"
                            >
                              {{ status(s) }}
                            </button>
                          }
                        </div>
                      </td>
                      <td>
                        <div class="fld-in" style="min-width: 160px">
                          <input
                            [id]="'ta-r-' + i"
                            maxlength="200"
                            [attr.aria-label]="t('ui.web.tch.att.remarkOf', { name: row.name })"
                            [value]="row.remark"
                            [disabled]="closed()"
                            (input)="setRemark(row.id, $event)"
                          />
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="row g12 wrap" style="padding: 14px 18px; border-top: 1px solid var(--line)">
              @if (dirty()) {
                <span class="chip dot tone-warn" id="ta-unsaved">{{
                  t('ui.web.tch.att.unsaved')
                }}</span>
              }
              <span class="grow"></span>
              @if (cardUsed()) {
                <button
                  type="button"
                  class="btn btn-sec"
                  id="ta-rest-absent"
                  [disabled]="closed() || !counts().notMarked"
                  (click)="restAbsent()"
                >
                  <rp-icon name="xc" [size]="17" /><span>{{
                    t('ui.web.tch.card.restAbsent')
                  }}</span>
                </button>
              }
              <button
                type="button"
                class="btn btn-sec"
                id="ta-all"
                [disabled]="closed() || !counts().notMarked"
                (click)="allPresent()"
              >
                <rp-icon name="checksq" [size]="17" /><span>{{
                  t('ui.web.tch.att.allPresent')
                }}</span>
              </button>
              <button
                type="button"
                class="btn btn-pri"
                id="ta-save"
                [disabled]="closed() || !dirty() || saving()"
                (click)="save()"
              >
                <rp-icon name="check" [size]="17" /><span>{{ t('ui.web.tch.att.save') }}</span>
              </button>
            </div>
          </div>
        }
      }
    } @else if (slot(); as p) {
      <div class="card">
        <div class="card-h row g12 wrap">
          <button type="button" class="btn btn-ghost btn-sm" id="ta-back" (click)="closeSlot()">
            <rp-icon name="left" [size]="16" /><span>{{ t('ui.web.tch.att.back') }}</span>
          </button>
          <span class="t-h4 grow">{{
            t('ui.web.tch.att.periodTitle', {
              period: p.period.name,
              subject: p.subject.name,
              section: p.section.label,
            })
          }}</span>
        </div>
        <div class="card-b stack g12">
          <div class="note tone-info">
            <rp-icon name="info" [size]="17" />
            <div class="grow">{{ t('ui.web.tch.att.periodNote') }}</div>
          </div>
          @if (roster(); as ro) {
            <div class="tbl-wrap">
              <table class="tbl" id="ta-pgrid">
                <thead>
                  <tr>
                    <th>{{ t('ui.web.tch.roster.admission') }}</th>
                    <th>{{ t('ui.web.tch.roster.name') }}</th>
                    <th>{{ t('ui.web.nav.attendance') }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (s of ro.items; track s.id; let i = $index) {
                    <tr>
                      <td class="t-mono t-sm">{{ s.admissionNo ?? '—' }}</td>
                      <td>
                        <b>{{ s.name }}</b>
                      </td>
                      <td>
                        <div
                          class="seg"
                          role="radiogroup"
                          style="width: max-content"
                          [attr.aria-label]="t('ui.web.tch.att.statusOf', { name: s.name })"
                          [id]="'ta-p-' + i"
                        >
                          @for (v of period; track v) {
                            <button
                              type="button"
                              role="radio"
                              [class.on]="mark(s.id) === v"
                              [attr.aria-checked]="mark(s.id) === v"
                              [style.background]="mark(s.id) === v ? 'var(--surface)' : null"
                              [style.box-shadow]="mark(s.id) === v ? 'var(--shadow-1)' : null"
                              [style.color]="mark(s.id) === v ? toneOf(v) : null"
                              (click)="setMark(s.id, v)"
                            >
                              {{ status(v) }}
                            </button>
                          }
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="sk" style="height: 200px; border-radius: 16px"></div>
          }
        </div>
        <div class="row g12" style="padding: 14px 18px; border-top: 1px solid var(--line)">
          <span class="grow"></span>
          <button
            type="button"
            class="btn btn-pri"
            id="ta-psave"
            [disabled]="!roster()?.items?.length || saving()"
            (click)="savePeriod()"
          >
            <rp-icon name="check" [size]="17" /><span>{{ t('ui.web.tch.att.periodSave') }}</span>
          </button>
        </div>
      </div>
    } @else {
      @if (classTeacher() === false) {
        <div class="note tone-info" id="ta-not-ct">
          <rp-icon name="info" [size]="17" />
          <div class="grow">
            <b>{{ t('ui.web.tch.att.notClassTeacher') }}</b>
            {{ t('ui.web.tch.att.notClassTeacherText') }}
            {{ t('ui.web.tch.card.gotoText') }}
          </div>
          <button
            type="button"
            class="btn btn-pri btn-sm"
            id="ta-goto-card"
            (click)="switchTab('card')"
          >
            <rp-icon name="nfc" [size]="16" /><span>{{ t('ui.web.tch.card.goto') }}</span>
          </button>
        </div>
      }
      <div class="card">
        <div class="card-b stack g8" id="ta-periods">
          @for (p of periods(); track p.slotId; let i = $index) {
            <div
              class="row g12 wrap"
              style="padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line)"
            >
              <span class="t-mono t-sm" style="width: 150px">{{ range(p) }}</span>
              <span
                style="width: 10px; height: 10px; border-radius: 50%; flex: none"
                [style.background]="p.subject.colour || 'var(--brand)'"
              ></span>
              <div class="grow" style="min-width: 0">
                <b>{{ p.period.name }} · {{ p.subject.name }}</b
                ><span class="t-muted"> · {{ p.section.label }}</span>
                <div class="t-muted t-sm">
                  {{ t('ui.web.tch.att.captured', { n: p.captured, total: p.students }) }}
                </div>
              </div>
              @if (p.state === 'NOW') {
                <span class="chip dot tone-brand">{{ t('ui.web.tch.today.now') }}</span>
              }
              <button
                type="button"
                class="btn btn-sm"
                [class.btn-pri]="p.state !== 'LATER'"
                [class.btn-sec]="p.state === 'LATER'"
                [id]="'ta-take-' + i"
                [disabled]="p.state === 'LATER'"
                (click)="openSlot(p)"
              >
                {{
                  p.state === 'LATER'
                    ? t('ui.web.tch.att.opensAt', { time: time(p.period.startsAt) })
                    : t('ui.web.tch.att.take')
                }}
              </button>
            </div>
          } @empty {
            <p class="t-muted" style="margin: 0">{{ t('ui.web.tch.att.noPeriods') }}</p>
          }
        </div>
      </div>
    }
  </div>`,
})
export class TeachingAttendance implements OnInit {
  private readonly api = inject(ClassesApi);
  private readonly overlays = inject(Overlays);
  protected readonly t = tr;
  protected readonly daily = DAILY;
  protected readonly period = PERIOD;
  protected readonly todayIso = today();

  protected readonly tab = signal<'reg' | 'per' | 'card'>('reg');
  protected readonly date = signal(today());
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  /** null until the register answers; false when the teacher is no class teacher. */
  protected readonly classTeacher = signal<boolean | null>(null);

  protected readonly reg = signal<Register | null>(null);
  private readonly edits = signal<Readonly<Record<string, Edit>>>({});
  protected readonly periods = signal<readonly MyPeriod[]>([]);
  protected readonly slot = signal<MyPeriod | null>(null);
  protected readonly roster = signal<Roster | null>(null);
  private readonly marks = signal<Readonly<Record<string, PeriodStatus>>>({});
  /** Taking the register by card (ATT-028): used on this register. */
  protected readonly cardUsed = signal(false);
  protected readonly canTapToday = computed(() => this.date() === this.todayIso && !this.closed());
  /** The "By card" tab: the classes the teacher teaches, the chosen one today, who tapped here. */
  protected readonly todayLabel = formatDate(today());
  private readonly cardClasses = signal<readonly ClassItem[]>([]);
  protected readonly cardSection = signal<string | null>(null);
  protected readonly cardRoster = signal<Roster | null>(null);
  protected readonly cardTapped = signal<Readonly<Record<string, true>>>({});
  protected readonly cardOptions = computed(() =>
    this.cardClasses().map((c) => ({ v: c.id, l: c.label })),
  );

  protected readonly sectionOptions = computed(() =>
    (this.reg()?.sections ?? []).map((s) => ({ v: s.id, l: s.label })),
  );
  /** Sunday or a holiday: the register is shown but not changed. */
  protected readonly closed = computed(() => !!this.reg()?.sunday || !!this.reg()?.holiday);
  protected readonly rows = computed(() => {
    const e = this.edits();
    return (this.reg()?.items ?? []).map((it) => {
      const ed = e[it.student.id];
      const status = ed?.status ?? it.status;
      const remark = ed?.remark ?? it.remark ?? '';
      return {
        id: it.student.id,
        name: it.student.name,
        admissionNo: it.student.admissionNo,
        status,
        remark,
        onLeave: it.onApprovedLeave,
        reader: !!it.method && it.method !== 'MANUAL',
        changed: !!status && (status !== it.status || remark.trim() !== (it.remark ?? '')),
      };
    });
  });
  protected readonly dirty = computed(() => this.rows().some((r) => r.changed));
  protected readonly counts = computed(() => {
    const rows = this.rows();
    const n = (s: DailyStatus) => rows.filter((r) => r.status === s).length;
    const notMarked = rows.filter((r) => !r.status).length;
    return {
      present: n('PRESENT'),
      late: n('LATE'),
      half: n('HALF_DAY'),
      absent: n('ABSENT'),
      notMarked,
      marked: rows.length - notMarked,
    };
  });

  ngOnInit() {
    void this.load();
  }

  /** Unsaved register changes are not lost by closing the tab without a warning. */
  @HostListener('window:beforeunload', ['$event'])
  protected beforeUnload(e: BeforeUnloadEvent) {
    if (this.dirty()) e.preventDefault();
  }

  async load(sectionId: string | null = this.reg()?.section.id ?? null) {
    this.cardUsed.set(false);
    this.loading.set(true);
    this.error.set('');
    try {
      if (this.tab() === 'reg') await this.loadRegister(sectionId);
      else if (this.tab() === 'card') await this.loadCard();
      else this.periods.set((await this.api.periods(this.date())).items);
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadRegister(sectionId: string | null) {
    try {
      this.reg.set(await this.api.register(sectionId, this.date()));
      this.edits.set({});
      this.classTeacher.set(true);
    } catch (e) {
      if (!(e instanceof ApiProblem) || !NOT_CLASS_TEACHER.has(e.code)) throw e;
      // Not a class teacher: the periods are their attendance.
      this.classTeacher.set(false);
      this.reg.set(null);
      this.tab.set('per');
      this.periods.set((await this.api.periods(this.date())).items);
    }
  }

  private async leaveRegister() {
    if (!this.dirty()) return true;
    return !!(await this.overlays.confirm({
      title: tr('ui.web.tch.att.unsaved'),
      text: tr('ui.web.tch.att.discard'),
      ok: tr('ui.web.tch.att.discardOk'),
      tone: 'bad',
      icon: 'alert',
    }));
  }

  protected async switchTab(tab: 'reg' | 'per' | 'card') {
    if (tab === this.tab() || !(await this.leaveRegister())) return;
    this.closeSlot();
    this.tab.set(tab);
    await this.load();
  }

  protected async setDate(e: Event) {
    const input = e.target as HTMLInputElement;
    const v = input.value;
    if (!v || v > this.todayIso || !(await this.leaveRegister())) {
      input.value = this.date();
      return;
    }
    this.date.set(v);
    this.closeSlot();
    await this.load();
  }

  protected async pickSection(id: string) {
    if (id === this.reg()?.section.id || !(await this.leaveRegister())) return;
    await this.load(id);
  }

  protected setStatus(id: string, status: DailyStatus) {
    this.edits.update((e) => ({ ...e, [id]: { ...e[id], status } }));
  }

  protected setRemark(id: string, e: Event) {
    const remark = (e.target as HTMLInputElement).value;
    this.edits.update((x) => ({ ...x, [id]: { ...x[id], remark } }));
  }

  protected allPresent() {
    const add: Record<string, Edit> = {};
    for (const r of this.rows())
      if (!r.status) add[r.id] = { ...this.edits()[r.id], status: 'PRESENT' };
    this.edits.update((e) => ({ ...e, ...add }));
  }

  protected async save() {
    const r = this.reg();
    if (!r || !this.dirty() || this.closed()) return;
    const c = this.counts();
    const ok = await this.overlays.confirm({
      title: tr('ui.web.tch.att.saveTitle', { date: formatDate(r.date) }),
      text: tr('ui.web.tch.att.saveText', {
        present: c.present,
        late: c.late,
        half: c.half,
        absent: c.absent,
      }),
      ok: tr('ui.web.tch.att.saveOk'),
      icon: 'calcheck',
    });
    if (!ok) return;
    const entries = this.rows()
      .filter((x) => x.changed && x.status)
      .map((x) => ({ studentId: x.id, status: x.status!, remark: x.remark.trim() || null }));
    this.saving.set(true);
    try {
      await this.api.saveRegister(r.section.id, r.date, entries);
      this.overlays.toast(tr('ui.web.tch.att.saved'), {
        sub: tr('ui.web.tch.att.savedSub', { section: r.section.label, date: formatDate(r.date) }),
      });
      this.edits.set({});
      await this.load(r.section.id);
    } catch (e) {
      const msg =
        e instanceof ApiProblem && e.errors.length ? e.errors[0]!.message : problemText(e);
      this.overlays.toast(msg, { tone: 'bad' });
    } finally {
      this.saving.set(false);
    }
  }

  // --- periods ---------------------------------------------------------------------------------------
  protected async openSlot(p: MyPeriod) {
    if (p.state === 'LATER') return;
    this.slot.set(p);
    this.roster.set(null);
    this.marks.set({});
    try {
      this.roster.set(await this.api.roster(p.section.id));
    } catch (e) {
      this.slot.set(null);
      this.overlays.toast(problemText(e), { tone: 'bad' });
    }
  }

  protected closeSlot() {
    this.slot.set(null);
    this.roster.set(null);
  }

  protected mark(id: string): PeriodStatus {
    return this.marks()[id] ?? 'PRESENT';
  }

  protected setMark(id: string, v: PeriodStatus) {
    this.marks.update((m) => ({ ...m, [id]: v }));
  }

  protected async savePeriod() {
    const p = this.slot();
    const ro = this.roster();
    if (!p || !ro?.items.length) return;
    this.saving.set(true);
    try {
      await this.api.markPeriod(
        p.slotId,
        this.date(),
        ro.items.map((s) => ({ studentId: s.id, status: this.mark(s.id) })),
      );
      this.overlays.toast(tr('ui.web.tch.att.periodSaved'), {
        sub: tr('ui.web.tch.att.periodTitle', {
          period: p.period.name,
          subject: p.subject.name,
          section: p.section.label,
        }),
      });
      this.closeSlot();
      await this.load();
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
    } finally {
      this.saving.set(false);
    }
  }

  // --- by card (ATT-028) --------------------------------------------------------------------------------
  protected onCard(on: boolean) {
    if (on) this.cardUsed.set(true);
  }

  private line(out: CardTapResult): TapLine {
    const status = this.status(out.status);
    return out.result === 'MARKED'
      ? { tone: 'ok', name: out.student.name, text: tr('ui.web.tch.card.marked', { status }) }
      : { tone: 'info', name: out.student.name, text: tr('ui.web.tch.card.already', { status }) };
  }

  /** A card for the class register: the row shows the recorded status, any unsaved edit dropped. */
  protected readonly dailyTap = async (cardToken: string): Promise<TapLine> => {
    const r = this.reg();
    if (!r) return { tone: 'bad', name: null, text: '' };
    try {
      const out = await this.api.cardTap({
        cardToken,
        mode: 'DAILY',
        classSectionId: r.section.id,
      });
      this.reg.update((x) =>
        x
          ? {
              ...x,
              items: x.items.map((it) =>
                it.student.id === out.student.id
                  ? {
                      ...it,
                      status: out.status,
                      method: out.result === 'ALREADY' && it.method ? it.method : 'NFC',
                    }
                  : it,
              ),
            }
          : x,
      );
      this.edits.update((e) => {
        const rest = { ...e };
        delete rest[out.student.id];
        return rest;
      });
      return this.line(out);
    } catch (e) {
      return { tone: 'bad', name: null, text: problemText(e) };
    }
  };

  // --- the "By card" tab ------------------------------------------------------------------------------
  private async loadCard() {
    if (!this.cardClasses().length) this.cardClasses.set((await this.api.classes()).items);
    const id = this.cardSection() ?? this.cardClasses()[0]?.id ?? null;
    this.cardSection.set(id);
    this.cardRoster.set(id ? await this.api.roster(id) : null);
  }

  protected async pickCardSection(id: string) {
    if (id === this.cardSection()) return;
    this.cardSection.set(id);
    this.cardTapped.set({});
    await this.load();
  }

  /** A card on the "By card" tab: today's attendance for a student of the chosen class. */
  protected readonly dayTap = async (cardToken: string): Promise<TapLine> => {
    const sectionId = this.cardSection();
    if (!sectionId) return { tone: 'bad', name: null, text: '' };
    try {
      const out = await this.api.cardTap({ cardToken, mode: 'DAILY', classSectionId: sectionId });
      this.cardRoster.update((r) =>
        r
          ? {
              ...r,
              items: r.items.map((it) =>
                it.id === out.student.id ? { ...it, attendanceToday: out.status } : it,
              ),
            }
          : r,
      );
      if (out.result === 'MARKED')
        this.cardTapped.update((t) => ({ ...t, [out.student.id]: true }));
      return this.line(out);
    } catch (e) {
      return { tone: 'bad', name: null, text: problemText(e) };
    }
  };

  protected restAbsent() {
    const add: Record<string, Edit> = {};
    for (const r of this.rows())
      if (!r.status) add[r.id] = { ...this.edits()[r.id], status: 'ABSENT' };
    this.edits.update((e) => ({ ...e, ...add }));
  }

  // --- labels ----------------------------------------------------------------------------------------
  protected status(code: string) {
    return tr(`status.attendance.${code === 'HALF_DAY' ? 'halfDay' : code.toLowerCase()}`);
  }
  protected toneName(code: string) {
    return code === 'PRESENT' ? 'ok' : code === 'ABSENT' ? 'bad' : 'warn';
  }
  protected toneOf(code: string) {
    return code === 'PRESENT' ? 'var(--ok)' : code === 'ABSENT' ? 'var(--bad)' : 'var(--warn)';
  }
  protected time(v: string) {
    return t12(v);
  }
  protected range(p: MyPeriod) {
    return `${t12(p.period.startsAt)} – ${t12(p.period.endsAt)}`;
  }
}
