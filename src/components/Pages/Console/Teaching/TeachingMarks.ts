/**
 * Marks (Phase 10, teachers on the web — client request 2026-10-05: "marks upload is a very tough job
 * in the mobile application"). The teacher picks an exam of their sections and subjects (ACA-052) and
 * enters the whole class on one screen: typing with Enter / arrows to move down, pasting a column from
 * a spreadsheet, or downloading the class as a CSV sheet, filling it in Excel and uploading it back
 * (read in the browser and shown before anything changes). Saving sends the whole grid with its
 * version (ACA-053); publishing tells students and families (ACA-054). The server checks the teacher's
 * assignment, the range and that the exam was held, as in the app.
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
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDate } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { t as tr } from '../../../Utils/t';
import { problemText } from '../Structure/academic-format';
import {
  type CellProblem,
  type SheetResult,
  marksSheet,
  pastedColumn,
  readCell,
  readSheet,
} from './marks-csv';
import { type MarkEntry, MarksApi, type MarksGrid, type TeacherExam } from './marks.api';

interface Edit {
  readonly raw: string;
  readonly absent: boolean;
}
const MAX_SHEET_BYTES = 2 * 1024 * 1024;

@Component({
  selector: 'rp-teaching-marks',
  imports: [Dropdown, Empty, Icon, Kpi, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    <rp-page-head [title]="t('ui.web.nav.marks')" [sub]="t('ui.web.tch.marks.sub')">
      @if (grid(); as g) {
        <button type="button" class="btn btn-sec" id="tm-download" (click)="download()">
          <rp-icon name="download" [size]="17" /><span>{{ t('ui.web.tch.marks.download') }}</span>
        </button>
        <label
          class="btn btn-sec"
          [class.is-disabled]="readOnly()"
          [attr.aria-disabled]="readOnly()"
          for="tm-upload"
        >
          <rp-icon name="upload" [size]="17" /><span>{{ t('ui.web.tch.marks.upload') }}</span>
        </label>
        <input
          id="tm-upload"
          type="file"
          accept=".csv,text/csv"
          hidden
          [disabled]="readOnly()"
          (change)="upload($event)"
        />
        <span [attr.title]="publishWhy() || null"
          ><button
            type="button"
            class="btn btn-sec"
            id="tm-publish"
            [disabled]="!!publishWhy() || publishing()"
            (click)="publish()"
          >
            <rp-icon name="megaphone" [size]="17" /><span>{{ t('ui.web.tch.marks.publish') }}</span>
          </button></span
        >
        <button
          type="button"
          class="btn btn-pri"
          id="tm-save"
          [disabled]="!dirty() || saving() || readOnly()"
          (click)="save()"
        >
          <rp-icon name="check" [size]="17" /><span>{{ t('ui.web.tch.marks.save') }}</span>
        </button>
      }
    </rp-page-head>

    @if (loading()) {
      <div class="card pad"><div class="sk" style="height: 120px; border-radius: 16px"></div></div>
    } @else if (error()) {
      <div class="note tone-bad" role="alert" id="tm-error">
        <rp-icon name="alert" [size]="17" />
        <div class="grow">{{ error() }}</div>
        <button type="button" class="btn btn-sec btn-sm" (click)="load()">
          {{ t('ui.web.tch.marks.retry') }}
        </button>
      </div>
    } @else if (!exams().length) {
      <rp-empty
        icon="award"
        [title]="t('ui.web.tch.marks.emptyTitle')"
        [text]="t('ui.web.tch.marks.emptyText')"
      />
    } @else {
      <div class="card pad stack g12">
        <div class="fld" style="max-width: 560px">
          <label class="fld-l" for="tm-exam-b">{{ t('ui.web.tch.marks.exam') }}</label>
          <rp-dd
            inputId="tm-exam"
            [placeholder]="t('ui.web.tch.marks.pick')"
            [options]="examOptions()"
            [value]="examId()"
            (changed)="pick($event)"
          />
        </div>
      </div>

      @if (!examId()) {
        <rp-empty
          icon="clipcheck"
          [title]="t('ui.web.tch.marks.chooseTitle')"
          [text]="t('ui.web.tch.marks.chooseText')"
        />
      } @else if (gridLoading()) {
        <div class="card pad">
          <div class="sk" style="height: 240px; border-radius: 16px"></div>
        </div>
      } @else if (grid(); as g) {
        <div class="c-grid k4 cc-kp" id="tm-kpis">
          <rp-kpi
            [label]="t('ui.web.tch.marks.kStudents')"
            [value]="'' + g.rows.length"
            icon="users"
            tone="brand"
            [small]="t('ui.web.tch.marks.kOutOf', { max: g.maxMarks, pass: g.passMarks })"
          />
          <rp-kpi
            [label]="t('ui.web.tch.marks.kEntered')"
            [value]="g.summary.entered + ' / ' + g.rows.length"
            icon="clipcheck"
            tone="info"
          />
          <rp-kpi
            [label]="t('ui.web.tch.marks.kAverage')"
            [value]="g.summary.average === null ? '—' : '' + g.summary.average"
            icon="gauge"
            tone="accent"
          />
          <rp-kpi
            [label]="t('ui.web.tch.marks.kPassed')"
            [value]="'' + g.summary.passed"
            icon="trophy"
            tone="ok"
            [small]="t('ui.web.tch.marks.kBelow', { n: g.summary.failed })"
          />
        </div>

        @if (!g.held) {
          <div class="note tone-warn" id="tm-notheld">
            <rp-icon name="clock" [size]="17" />
            <div class="grow">{{ t('ui.web.tch.marks.notHeld') }}</div>
          </div>
        } @else if (exam()?.published; as p) {
          <div class="note tone-info" id="tm-published">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">{{ t('ui.web.tch.marks.published', { date: date(p.at) }) }}</div>
          </div>
        } @else {
          <div class="note tone-info">
            <rp-icon name="bulb" [size]="17" />
            <div class="grow">{{ t('ui.web.tch.marks.pasteTip') }}</div>
          </div>
        }

        @if (sheet(); as s) {
          <div class="card pad stack g12" id="tm-sheet">
            <div class="row g8 wrap">
              <rp-icon name="sheet" [size]="18" />
              <b class="grow">{{ t('ui.web.tch.marks.sheetRead', { file: s.file }) }}</b>
              <span class="chip tone-ok">{{
                t('ui.web.tch.marks.sheetMatched', { n: s.result.values.size })
              }}</span>
              @if (s.result.blank) {
                <span class="chip">{{
                  t('ui.web.tch.marks.sheetBlank', { n: s.result.blank })
                }}</span>
              }
              @if (s.result.problems.length) {
                <span class="chip tone-warn">{{
                  t('ui.web.tch.marks.sheetProblems', { n: s.result.problems.length })
                }}</span>
              }
            </div>
            @if (s.result.problems.length) {
              <ul class="stack g4" id="tm-sheet-problems" style="margin: 0; padding-left: 18px">
                @for (p of s.result.problems; track p.line) {
                  <li class="t-sm">{{ why(p, g.maxMarks) }}</li>
                }
              </ul>
            }
            <div class="row g8">
              <button
                type="button"
                class="btn btn-pri btn-sm"
                id="tm-sheet-apply"
                [disabled]="!s.result.values.size"
                (click)="applySheet()"
              >
                {{ t('ui.web.tch.marks.sheetApply', { n: s.result.values.size }) }}
              </button>
              <button type="button" class="btn btn-sec btn-sm" (click)="sheet.set(null)">
                {{ t('ui.web.tch.marks.sheetDiscard') }}
              </button>
            </div>
          </div>
        }

        @if (dirty()) {
          <div class="note tone-warn" id="tm-unsaved">
            <rp-icon name="edit" [size]="17" />
            <div class="grow">{{ t('ui.web.tch.marks.unsaved', { n: dirty() }) }}</div>
          </div>
        }

        <div class="card">
          <div class="tbl-wrap">
            <table class="tbl" id="tm-grid">
              <thead>
                <tr>
                  <th style="width: 48px">{{ t('ui.web.tch.marks.colNo') }}</th>
                  <th>{{ t('ui.web.tch.marks.colAdmission') }}</th>
                  <th>{{ t('ui.web.tch.marks.colStudent') }}</th>
                  <th style="width: 150px">{{ t('ui.web.tch.marks.colMarks') }}</th>
                  <th style="width: 90px">{{ t('ui.web.tch.marks.colAbsent') }}</th>
                  <th>{{ t('ui.web.tch.marks.colStatus') }}</th>
                  <th>{{ t('ui.web.tch.marks.colResult') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (r of rows(); track r.id; let i = $index) {
                  <tr [class.sel]="r.changed">
                    <td class="t-muted">{{ i + 1 }}</td>
                    <td class="t-mono t-sm">{{ r.admissionNo ?? '—' }}</td>
                    <td>
                      <b>{{ r.name }}</b>
                    </td>
                    <td>
                      <div class="fld" [class.invalid]="!!r.error" style="margin: 0">
                        <div class="fld-in" style="height: 34px">
                          <input
                            [id]="'tm-m-' + i"
                            type="text"
                            inputmode="decimal"
                            autocomplete="off"
                            [attr.aria-label]="t('ui.web.tch.marks.marksOf', { name: r.name })"
                            [attr.aria-invalid]="!!r.error"
                            [attr.aria-describedby]="r.error ? 'tm-e-' + i : null"
                            [disabled]="readOnly() || r.absent"
                            [value]="r.raw"
                            (input)="type(r.id, $event)"
                            (keydown)="move($event, i)"
                            (paste)="paste($event, i)"
                          />
                          <span class="t-muted t-sm" style="padding-right: 8px"
                            >/ {{ g.maxMarks }}</span
                          >
                        </div>
                        @if (r.error) {
                          <div class="fld-e" [id]="'tm-e-' + i" role="alert">
                            <rp-icon name="alertc" [size]="14" /><span>{{ r.error }}</span>
                          </div>
                        }
                      </div>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        [id]="'tm-a-' + i"
                        [attr.aria-label]="t('ui.web.tch.marks.absentOf', { name: r.name })"
                        [checked]="r.absent"
                        [disabled]="readOnly()"
                        (change)="toggleAbsent(r.id, $event)"
                      />
                    </td>
                    <td>
                      @if (r.status) {
                        <span
                          class="chip dot"
                          [class.tone-ok]="r.status === 'VALID'"
                          [class.tone-info]="r.status !== 'VALID'"
                          >{{ statusLabel(r.status) }}</span
                        >
                      } @else {
                        <span class="t-muted">—</span>
                      }
                    </td>
                    <td>
                      @if (r.absent) {
                        <span class="t-muted">{{ t('ui.web.tch.marks.absent') }}</span>
                      } @else if (r.value !== null) {
                        <span
                          [class.t-ok]="r.value >= g.passMarks"
                          [class.t-bad]="r.value < g.passMarks"
                          >{{
                            r.value >= g.passMarks
                              ? t('ui.web.tch.marks.pass')
                              : t('ui.web.tch.marks.fail')
                          }}</span
                        >
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      } @else if (gridError()) {
        <div class="note tone-bad" role="alert" id="tm-grid-error">
          <rp-icon name="alert" [size]="17" />
          <div class="grow">{{ gridError() }}</div>
          <button type="button" class="btn btn-sec btn-sm" (click)="openGrid(examId())">
            {{ t('ui.web.tch.marks.retry') }}
          </button>
        </div>
      }
    }
  </div>`,
})
export class TeachingMarks implements OnInit {
  private readonly api = inject(MarksApi);
  private readonly overlays = inject(Overlays);
  protected readonly t = tr;

  protected readonly exams = signal<readonly TeacherExam[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly examId = signal('');
  protected readonly grid = signal<MarksGrid | null>(null);
  protected readonly gridLoading = signal(false);
  protected readonly gridError = signal('');
  protected readonly edits = signal<Readonly<Record<string, Edit>>>({});
  protected readonly saving = signal(false);
  protected readonly publishing = signal(false);
  protected readonly sheet = signal<{ file: string; result: SheetResult } | null>(null);

  protected readonly exam = computed(
    () => this.exams().find((e) => e.id === this.examId()) ?? null,
  );
  protected readonly examOptions = computed<DropdownOption[]>(() =>
    this.exams().map((e) => ({
      v: e.id,
      l: tr('ui.web.tch.marks.option', {
        exam: e.name.name,
        subject: e.subject.name,
        section: e.section.label,
      }),
      sub: e.published
        ? tr('ui.web.tch.marks.optPublished')
        : e.date && e.date > today()
          ? tr('ui.web.tch.marks.optNotHeld')
          : tr('ui.web.tch.marks.optEntered', {
              n: e.marks.entered,
              total: e.marks.students,
            }),
    })),
  );
  protected readonly readOnly = computed(() => {
    const g = this.grid();
    return !g || !g.held || !!this.exam()?.published;
  });

  /** The grid as shown: the saved marks with the teacher's edits and each cell's problem. */
  protected readonly rows = computed(() => {
    const g = this.grid();
    if (!g) return [];
    const edits = this.edits();
    return g.rows.map((r) => {
      const saved: Edit = {
        raw: r.absent || r.marks === null ? '' : String(r.marks),
        absent: r.absent,
      };
      const e = edits[r.student.id] ?? saved;
      const cell = e.absent ? null : readCell(e.raw, g.maxMarks);
      const problem = cell === 'format' || cell === 'range' ? cell : null;
      return {
        id: r.student.id,
        name: r.student.name,
        admissionNo: r.student.admissionNo,
        raw: e.raw,
        absent: e.absent,
        status: r.status,
        changed: e.raw !== saved.raw || e.absent !== saved.absent,
        value: cell && typeof cell === 'object' && 'marks' in cell ? cell.marks : null,
        error: problem ? this.cellText(problem, g.maxMarks) : '',
      };
    });
  });
  protected readonly dirty = computed(() => this.rows().filter((r) => r.changed).length);
  /** Why publishing isn't possible now ('' when it is). */
  protected readonly publishWhy = computed(() => {
    const g = this.grid();
    if (!g || !g.held) return tr('ui.web.tch.marks.optNotHeld');
    if (this.exam()?.published) return tr('ui.web.tch.marks.optPublished');
    if (this.dirty()) return tr('ui.web.tch.marks.publishUnsaved');
    const missing = g.rows.filter((r) => r.status === null).length;
    return missing || !g.rows.length ? tr('ui.web.tch.marks.publishMissing', { n: missing }) : '';
  });

  ngOnInit() {
    void this.load();
  }

  /** Unsaved marks are not lost by closing the tab without a warning. */
  @HostListener('window:beforeunload', ['$event'])
  protected beforeUnload(e: BeforeUnloadEvent) {
    if (this.dirty()) e.preventDefault();
  }

  async load() {
    this.loading.set(true);
    try {
      this.exams.set((await this.api.exams()).items);
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async pick(id: string) {
    if (id === this.examId()) return;
    if (this.dirty()) {
      const ok = await this.overlays.confirm({
        title: tr('ui.web.tch.marks.leaveTitle'),
        text: tr('ui.web.tch.marks.leaveText'),
        ok: tr('ui.web.tch.marks.leaveOk'),
        tone: 'warn',
        icon: 'alert',
      });
      if (!ok) return;
    }
    this.examId.set(id);
    await this.openGrid(id);
  }

  async openGrid(id: string) {
    this.gridLoading.set(true);
    this.grid.set(null);
    this.edits.set({});
    this.sheet.set(null);
    try {
      const r = await this.api.grid(id);
      this.exams.set(r.items);
      this.grid.set(r.grid);
      this.gridError.set('');
    } catch (e) {
      this.gridError.set(problemText(e));
    } finally {
      this.gridLoading.set(false);
    }
  }

  protected type(id: string, e: Event) {
    const raw = (e.target as HTMLInputElement).value;
    this.edits.update((m) => ({ ...m, [id]: { raw, absent: false } }));
  }

  protected toggleAbsent(id: string, e: Event) {
    const absent = (e.target as HTMLInputElement).checked;
    const cur = this.rows().find((r) => r.id === id);
    this.edits.update((m) => ({ ...m, [id]: { raw: absent ? '' : (cur?.raw ?? ''), absent } }));
  }

  /** Enter and ArrowDown go to the next student, ArrowUp back (as in a spreadsheet). */
  protected move(e: KeyboardEvent, i: number) {
    let to: number;
    if (e.key === 'Enter' || e.key === 'ArrowDown') to = i + 1;
    else if (e.key === 'ArrowUp') to = i - 1;
    else return;
    e.preventDefault();
    if (to < 0) return;
    const next = document.getElementById(`tm-m-${to}`) as HTMLInputElement | null;
    next?.focus();
    next?.select();
  }

  /** A column pasted from a spreadsheet fills this student and the ones below. */
  protected paste(e: ClipboardEvent, i: number) {
    const values = pastedColumn(e.clipboardData?.getData('text') ?? '');
    if (values.length < 2) return;
    e.preventDefault();
    const rows = this.rows();
    const max = this.grid()?.maxMarks ?? 0;
    let n = 0;
    this.edits.update((m) => {
      const out = { ...m };
      values.forEach((v, k) => {
        const r = rows[i + k];
        if (!r) return;
        const cell = readCell(v, max);
        if (typeof cell === 'object' && 'blank' in cell) return;
        out[r.id] =
          typeof cell === 'object' && 'absent' in cell
            ? { raw: '', absent: true }
            : { raw: v, absent: false };
        n++;
      });
      return out;
    });
    this.overlays.toast(tr('ui.web.tch.marks.pasted', { n }));
  }

  protected download() {
    const g = this.grid();
    const ex = this.exam();
    if (!g || !ex) return;
    const shown = g.rows.map((r) => {
      const v = this.rows().find((x) => x.id === r.student.id);
      return { ...r, absent: !!v?.absent, marks: v?.value ?? null };
    });
    const csv = marksSheet(shown, [
      tr('ui.web.tch.marks.sheetNo'),
      tr('ui.web.tch.marks.sheetStudent'),
      tr('ui.web.tch.marks.sheetMarks'),
    ]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ex.name.name}-${ex.subject.name}-${ex.section.label}.csv`.replace(
      /[\\/:*?"<>|\s]+/g,
      '-',
    );
    a.click();
    URL.revokeObjectURL(url);
  }

  protected async upload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const g = this.grid();
    if (!file || !g) return;
    if (file.size > MAX_SHEET_BYTES) {
      this.overlays.toast(tr('ui.web.tch.marks.sheetTooBig'), { tone: 'bad' });
      return;
    }
    if (!/\.csv$/i.test(file.name) && !/csv|text\/plain/.test(file.type)) {
      this.overlays.toast(tr('ui.web.tch.marks.sheetNotCsv'), { tone: 'bad' });
      return;
    }
    const text = await readText(file);
    this.sheet.set({ file: file.name, result: readSheet(text, g.rows, g.maxMarks) });
  }

  protected applySheet() {
    const s = this.sheet();
    if (!s) return;
    this.edits.update((m) => {
      const out = { ...m };
      for (const [id, v] of s.result.values) {
        out[id] =
          'absent' in v ? { raw: '', absent: true } : { raw: String(v.marks), absent: false };
      }
      return out;
    });
    this.sheet.set(null);
    this.overlays.toast(tr('ui.web.tch.marks.sheetApplied', { n: s.result.values.size }), {
      sub: tr('ui.web.tch.marks.sheetAppliedSub'),
    });
  }

  protected async save() {
    const g = this.grid();
    if (!g) return;
    const rows = this.rows();
    if (rows.some((r) => r.error)) {
      this.overlays.toast(tr('ui.web.tch.marks.fixFirst'), { tone: 'bad' });
      return;
    }
    const marks: MarkEntry[] = rows.flatMap((r): MarkEntry[] =>
      r.absent
        ? [{ studentId: r.id, absent: true }]
        : r.value !== null
          ? [{ studentId: r.id, marks: r.value }]
          : [],
    );
    this.saving.set(true);
    try {
      const out = await this.api.save(g.examId, marks, g.version);
      this.grid.set(out);
      this.edits.set({});
      this.overlays.toast(tr('ui.web.tch.marks.saved'), {
        sub: tr('ui.web.tch.marks.savedSub', {
          n: out.summary.entered,
          avg: out.summary.average ?? '—',
        }),
      });
      void this.refreshList();
    } catch (e) {
      if (e instanceof ApiProblem && e.status === 412) {
        this.overlays.toast(tr('ui.web.tch.marks.conflict'), {
          tone: 'bad',
          sub: tr('ui.web.tch.marks.conflictSub'),
        });
        await this.openGrid(g.examId);
      } else {
        const msg =
          e instanceof ApiProblem && e.errors.length ? e.errors[0]!.message : problemText(e);
        this.overlays.toast(msg, { tone: 'bad' });
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected async publish() {
    const g = this.grid();
    if (!g || this.publishWhy()) return;
    const ok = await this.overlays.confirm({
      title: tr('ui.web.tch.marks.publishTitle'),
      text: tr('ui.web.tch.marks.publishText'),
      ok: tr('ui.web.tch.marks.publishOk'),
      icon: 'megaphone',
    });
    if (!ok) return;
    this.publishing.set(true);
    try {
      await this.api.publish(g.examId);
      this.overlays.toast(tr('ui.web.tch.marks.publishedToast'), {
        sub: tr('ui.web.tch.marks.publishedSub'),
      });
      await this.openGrid(g.examId);
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
    } finally {
      this.publishing.set(false);
    }
  }

  private async refreshList() {
    try {
      this.exams.set((await this.api.exams()).items);
    } catch {
      // the counts refresh on the next visit
    }
  }

  protected statusLabel(s: string) {
    return tr(`status.mark.${s.toLowerCase()}`);
  }

  protected date(v: string) {
    return formatDate(v);
  }

  protected why(p: SheetResult['problems'][number], max: number) {
    const key = {
      unknown: 'ui.web.tch.marks.whyUnknown',
      duplicate: 'ui.web.tch.marks.whyDuplicate',
      format: 'ui.web.tch.marks.whyFormat',
      range: 'ui.web.tch.marks.whyRange',
      noAdmissionNo: 'ui.web.tch.marks.whyNoAdmission',
    }[p.reason];
    return tr(key, { line: p.line, no: p.admissionNo, max });
  }

  private cellText(p: CellProblem, max: number) {
    return p === 'range'
      ? tr('ui.web.tch.marks.cellRange', { max })
      : tr('ui.web.tch.marks.cellFormat');
  }
}

/** A chosen file's text (FileReader: every browser has it). */
function readText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error ?? new Error('read'));
    r.readAsText(file);
  });
}

/** Today in India (exam dates are school days). */
function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}
