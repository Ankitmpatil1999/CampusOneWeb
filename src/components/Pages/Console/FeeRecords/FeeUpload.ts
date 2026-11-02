import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
  output,
  signal,
} from '@angular/core';
import { Amount } from '../../../Shared/Amount';
import { Empty, Kpi } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatDateTime, formatInr, titleCase } from '../../../Utils/format';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { paiseOf, plural, saveCsv } from '../Fees/fee-format';
import { FeeRecordsApi, type FeeUploadReport } from './fee-records.api';
import { splitText } from './record-format';

/** The template's columns (FEE-039), as the "Columns read" card lists them. */
const COLUMNS =
  'Student name, admission number, grade, section, total, instalments, late fine, due date, paid, paid date, reference, remarks.';
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Upload a fee sheet (prototype cm.fr.upload / CM.checkSheet; FEE-039, FEE-014, FEE-015, FEE-041):
 * the template, the sheet (CSV, 2 MB), then the server's row report — rows read, accepted,
 * rejected and the records to create, each row with its split into instalments, its due date and
 * its outcome — and the commit. Opened on an upload of the Uploads tab, it shows that report.
 */
@Component({
  selector: 'rp-fee-upload',
  imports: [Amount, Empty, Icon, Kpi, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Upload fee sheet"
      sub="Rows are validated one by one before anything is created."
      icon="upload"
      [wide]="true"
      cls="cm-xl cm-m"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      @if (report(); as r) {
        <div class="stack g16" id="fu-report">
          <div class="c-grid k4">
            <rp-kpi label="Rows read" icon="sheet" [value]="num(r.total)" />
            <rp-kpi label="Accepted" icon="checkc" tone="ok" [value]="num(r.accepted)" />
            <rp-kpi label="Rejected" icon="xc" tone="bad" [value]="num(r.rejected)" />
            <rp-kpi
              [label]="r.status === 'COMMITTED' ? 'Records created' : 'Records to create'"
              icon="receipt"
              [value]="num(r.status === 'COMMITTED' ? (r.recordsCreated ?? 0) : r.recordsPlanned)"
            />
          </div>
          <div class="t-sm t-muted">
            <rp-icon name="file" [size]="13" /> {{ r.fileName }}
            @if (r.uploadedAt) {
              · {{ when(r.uploadedAt) }}{{ r.uploadedBy ? ' · ' + person(r.uploadedBy) : '' }}
            }
          </div>
          <div class="tbl-wrap cm-scroll">
            <table class="tbl dense" id="fu-rows">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Student</th>
                  <th>Admission no.</th>
                  <th>Grade</th>
                  <th class="r">Total</th>
                  <th>Instalments</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                @for (x of r.rows; track x.row) {
                  <tr [class.cm-rej]="!x.accepted">
                    <td class="t-num">{{ x.row }}</td>
                    <td>{{ x.name || '—' }}</td>
                    <td>
                      <span class="t-mono">{{ x.admissionNo || '—' }}</span>
                    </td>
                    <td style="white-space: nowrap">{{ x.classSection || '—' }}</td>
                    <td class="r"><rp-amt [value]="x.total" /></td>
                    <td class="t-sm">
                      @if (x.accepted) {
                        {{ split(x.instalments) }}
                        <div class="cell-s">
                          Due {{ x.dueDate ? date(x.dueDate) : '—'
                          }}{{ x.dueDefaulted ? ' (default)' : '' }}
                        </div>
                      } @else {
                        —
                      }
                    </td>
                    <td>
                      @if (x.accepted) {
                        <span [class]="'chip dot tone-' + (x.paid ? 'info' : 'ok')">{{
                          x.paid ? 'Accepted · paid history' : 'Accepted'
                        }}</span>
                      } @else {
                        <span class="chip dot tone-bad">Rejected</span>
                        <div class="cell-s t-bad" style="white-space: normal">
                          {{ reasons(x.errors) }}
                        </div>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (r.status === 'COMMITTED') {
            <div class="note tone-ok">
              <rp-icon name="checkc" [size]="17" />
              <div class="grow">
                <b>{{ plural(r.recordsCreated ?? 0, 'fee record') }} created</b
                >{{ r.committedAt ? ' ' + when(r.committedAt) : '' }}.
              </div>
            </div>
          } @else if (r.rejected) {
            <div class="note tone-warn">
              <rp-icon name="alert" [size]="17" />
              <div class="grow">
                {{ plural(r.rejected, 'row') }} will be skipped. Fix them in the sheet and upload
                again — accepted rows won't be duplicated because repeats on the same day are
                refused.
              </div>
            </div>
          }
          @if (error()) {
            <div class="note tone-bad" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ error() }}</div>
            </div>
          }
        </div>
      } @else if (uploadId() && !error()) {
        <rp-empty icon="hourglass" title="Loading the row report…" />
      } @else {
        <div class="stack g16" id="fu-pick">
          <div class="fld" [class.invalid]="fileErr()">
            <span class="fld-l">Fee sheet<span class="req">*</span></span>
            <label class="upl" [class.done]="!!file()" for="fu-file"
              ><span class="upl-ic"
                ><rp-icon [name]="file() ? 'checkc' : 'upload'" [size]="20" /></span
              ><span class="grow" style="min-width: 0"
                ><span class="t-h4 t-clip" style="display: block">{{
                  file()?.name ?? 'Choose the fee sheet'
                }}</span
                ><span class="t-xs t-muted">{{
                  file()
                    ? size(file()!.size) + ' · ready to validate'
                    : 'CSV · one row per student · up to 2 MB'
                }}</span></span
              ><input
                type="file"
                id="fu-file"
                accept=".csv,text/csv"
                aria-describedby="fu-file-e"
                (change)="pick($event)"
            /></label>
            <div class="fld-e" id="fu-file-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ fileErr() }}</span>
            </div>
          </div>
          <div class="card flat pad">
            <b class="t-h4">Columns read</b>
            <p class="t-sm t-muted mt4" style="line-height: 1.55">{{ columns }}</p>
            <div class="row g8 mt12">
              <button
                type="button"
                class="btn btn-soft btn-sm"
                id="fu-template"
                [class.is-busy]="templateBusy()"
                [disabled]="templateBusy()"
                (click)="template()"
              >
                <rp-icon name="sheet" [size]="15" /><span>Download the template</span>
              </button>
              <span class="t-xs t-muted">With one example row.</span>
            </div>
          </div>
          <div class="note tone-info">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              Rows are split into equal instalments with any remainder on the last. A missing due
              date becomes the last day of the academic year. Rows marked paid are recorded as
              history — no collection is attempted.
            </div>
          </div>
          @if (error()) {
            <div class="note tone-bad" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ error() }}</div>
            </div>
          }
        </div>
      }

      <div modal-foot class="row g8">
        @if (report(); as r) {
          @if (uploadId()) {
            <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
              <span>Close</span>
            </button>
          } @else {
            <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="back()">
              <span>Back</span>
            </button>
          }
          <button type="button" class="btn btn-ghost" id="fu-csv" (click)="rowReport()">
            <rp-icon name="download" [size]="17" /><span>Download row report</span>
          </button>
          @if (r.status !== 'COMMITTED') {
            <button
              type="button"
              class="btn btn-pri"
              id="fu-commit"
              [class.is-busy]="busy()"
              [disabled]="busy() || !r.accepted || !!commitWhy()"
              [attr.title]="commitWhy() || null"
              (click)="commit()"
            >
              <rp-icon name="check" [size]="17" /><span
                >Create {{ num(r.recordsPlanned) }} records</span
              >
            </button>
          }
        } @else {
          <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            id="fu-validate"
            [class.is-busy]="busy()"
            [disabled]="busy() || !!uploadId()"
            (click)="validate()"
          >
            <rp-icon name="checksq" [size]="17" /><span>Validate sheet</span>
          </button>
        }
      </div>
    </rp-modal>
  `,
})
export class FeeUpload implements OnInit {
  private readonly api = inject(FeeRecordsApi);
  private readonly overlays = inject(Overlays);

  /** An upload of the Uploads tab to show (FEE-041); empty starts a new upload. */
  readonly uploadId = input('');
  /** Why this person can't create records (read-only, no fees.edit); '' when they can. */
  readonly commitWhy = input('');
  readonly closed = output<void>();
  readonly committed = output<{ created: number; skipped: number; fileName: string }>();
  /** A sheet was checked (a new upload is listed). */
  readonly validated = output<FeeUploadReport>();

  protected readonly columns = COLUMNS;
  protected readonly plural = plural;
  protected readonly file = signal<File | null>(null);
  protected readonly fileErr = signal('');
  protected readonly report = signal<FeeUploadReport | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly templateBusy = signal(false);
  private uploadKey = newIdempotencyKey();
  private readonly commitKey = newIdempotencyKey();

  protected readonly paidRows = computed(
    () => this.report()?.rows.filter((x) => x.accepted && x.paid).length ?? 0,
  );

  ngOnInit() {
    if (this.uploadId()) void this.loadReport();
  }

  private async loadReport() {
    try {
      this.report.set(await this.api.uploadReport(this.uploadId()));
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  protected pick(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0] ?? null;
    this.error.set('');
    this.fileErr.set('');
    if (f && f.size > MAX_BYTES) {
      this.file.set(null);
      this.fileErr.set('The fee sheet must be under 2 MB.');
      return;
    }
    this.file.set(f);
    this.uploadKey = newIdempotencyKey();
  }

  protected async template() {
    this.templateBusy.set(true);
    try {
      await this.api.template();
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.templateBusy.set(false);
    }
  }

  /** FEE-014: the server checks every row; nothing is created yet. */
  protected async validate() {
    const f = this.file();
    if (!f) {
      this.fileErr.set(translate('UPL.FILE_REQUIRED'));
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const r = await this.api.upload(f, this.uploadKey);
      this.report.set(r);
      this.validated.emit(r);
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.busy.set(false);
    }
  }

  protected back() {
    this.report.set(null);
    this.file.set(null);
    this.error.set('');
  }

  /** FEE-015: all rows when none was rejected, else the accepted rows. */
  protected async commit() {
    const r = this.report();
    if (!r?.accepted || this.commitWhy()) return;
    const ok = await this.overlays.confirm({
      title: `Create ${this.num(r.recordsPlanned)} fee records?`,
      text: `${plural(r.accepted, 'student')}; ${this.paidRows()} marked paid are recorded as history. ${plural(r.rejected, 'rejected row')} ${r.rejected === 1 ? 'is' : 'are'} skipped.`,
      ok: 'Create records',
    });
    if (!ok) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const out = await this.api.commit(r.id, r.rejected ? 'ACCEPTED' : 'ALL', this.commitKey);
      this.committed.emit({ ...out, fileName: r.fileName });
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.busy.set(false);
    }
  }

  /** The row report as CSV (prototype "Download row report"). */
  protected rowReport() {
    const r = this.report();
    if (!r) return;
    saveCsv(`${r.fileName.replace(/\.[^.]+$/, '')}_results.csv`, [
      [
        'Row',
        'Student',
        'Admission no.',
        'Grade',
        'Total',
        'Instalments',
        'Due date',
        'Outcome',
        'Reasons',
      ],
      ...r.rows.map((x) => [
        x.row,
        x.name,
        x.admissionNo,
        x.classSection,
        x.total.amount,
        x.instalments.map((i) => i.amount).join(' + '),
        x.dueDate ?? '',
        x.accepted ? (x.paid ? 'Accepted · paid history' : 'Accepted') : 'Rejected',
        x.errors.map((e) => `${e.column}: ${e.message}`).join('; '),
      ]),
    ]);
  }

  protected split(parts: readonly { amount: string }[]) {
    return splitText(parts.map((p) => formatInr(paiseOf(p))));
  }
  protected reasons(errors: readonly { column: string; message: string }[]) {
    return errors.map((e) => e.message).join('; ');
  }
  protected size(b: number) {
    return b >= 1_048_576
      ? `${(b / 1_048_576).toFixed(1)} MB`
      : `${Math.max(1, Math.round(b / 1024))} KB`;
  }
  protected date(d: string) {
    return formatDate(d);
  }
  protected when(d: string) {
    return formatDateTime(d);
  }
  /** Names are stored in capitals; shown in title case. */
  protected person(n: string) {
    return titleCase(n);
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
}
