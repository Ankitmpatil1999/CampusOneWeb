import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { plural, saveCsv } from '../Fees/fee-format';
import { fileSize } from './app-format';
import { ApplicationsApi, type ImportReport } from './applications.api';

const MAX_BYTES = 2 * 1024 * 1024;
/** The template's columns (ADM-029; client 2026-10-21: the public admission form's), in words. */
const COLUMNS =
  'the admission form’s fields — class, section and admission number, the student, the address, the parents and guardians, school transport (route and stop) — then your school’s own form fields. Columns marked * are required. Each student is set up as an approved admission: the Student user type in the Academics department, enrolled in the class and section, with a wallet, VAN and the class’s fee structure, and the bus route allocated when one is given.';

/**
 * Upload existing students (prototype cc.app.upload; FR-ADM-10; ADM-029, ADM-020): the template,
 * the sheet (CSV, 2 MB), then the row report. Each row is checked like the form; a passing row is
 * enrolled straight away (the member, wallets, guardian link and enrolment with an Approved
 * application, in its own transaction) and a refused row is reported with its reasons.
 */
@Component({
  selector: 'rp-student-import',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Upload existing students"
      [sub]="
        'Seed student profiles and class mappings for ' +
        yearLabel() +
        ' from a spreadsheet. Every row is checked and reported (FR-ADM-10).'
      "
      icon="upload"
      [wide]="true"
      cls="cm-m"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="si-body">
        @if (report(); as r) {
          <div class="stack g10" id="si-report">
            <div class="row g8">
              <span class="chip dot tone-ok">{{ r.imported }} imported</span>
              <span class="chip dot tone-bad">{{ r.rejected }} rejected</span>
              <span class="t-sm t-muted">{{ fileName() }}</span>
            </div>
            <div class="tbl-wrap" style="max-height: 300px; overflow: auto">
              <table class="tbl dense" id="si-rows">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Student</th>
                    <th>Application no.</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  @for (x of r.rows; track x.row) {
                    <tr [class.cm-rej]="x.outcome === 'REJECTED'">
                      <td class="t-num">{{ x.row }}</td>
                      <td>{{ x.name }}</td>
                      <td>
                        @if (x.applicationNo) {
                          <span class="t-mono t-sm">{{ x.applicationNo }}</span>
                        } @else {
                          <span class="t-faint">—</span>
                        }
                      </td>
                      <td>
                        @if (x.outcome === 'IMPORTED') {
                          <span class="chip dot tone-ok">Imported</span>
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
            @if (r.rejected) {
              <div class="note tone-warn">
                <rp-icon name="alert" [size]="17" />
                <div class="grow">
                  {{ plural(r.rejected, 'row') }} {{ r.rejected === 1 ? 'was' : 'were' }} not
                  imported. Fix {{ r.rejected === 1 ? 'it' : 'them' }} in the sheet and upload only
                  {{ r.rejected === 1 ? 'that row' : 'those rows' }} again, so imported students
                  aren't added twice.
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="row between wrap g8">
            <span class="t-sm t-muted">Columns: {{ columns }}</span>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              id="si-template"
              [class.is-busy]="templateBusy()"
              [disabled]="templateBusy()"
              (click)="template()"
            >
              <rp-icon name="download" [size]="15" /><span>Download template</span>
            </button>
          </div>
          <div class="fld" [class.invalid]="fileErr()">
            <span class="fld-l">Spreadsheet</span>
            <label class="upl" [class.done]="!!file()" for="si-file"
              ><span class="upl-ic"
                ><rp-icon [name]="file() ? 'checkc' : 'upload'" [size]="20" /></span
              ><span class="grow" style="min-width: 0"
                ><span class="t-h4 t-clip" style="display: block">{{
                  file()?.name ?? 'Choose a CSV file'
                }}</span
                ><span class="t-xs t-muted">{{
                  file() ? size(file()!.size) + ' · ready to import' : 'CSV · up to 2 MB'
                }}</span></span
              ><input
                type="file"
                id="si-file"
                accept=".csv,text/csv"
                aria-describedby="si-file-e"
                (change)="pick($event)"
            /></label>
            <div class="fld-e" id="si-file-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ fileErr() }}</span>
            </div>
          </div>
          <div class="note tone-info">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              Rows that pass are enrolled straight away for {{ yearLabel() }} with their parent's
              account linked; rows that don't are reported here and nothing is saved for them.
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
      <div modal-foot class="row g8">
        @if (report()) {
          <button type="button" class="btn btn-ghost" id="si-csv" (click)="rowReport()">
            <rp-icon name="download" [size]="17" /><span>Download row report</span>
          </button>
          <button type="button" class="btn btn-pri" (click)="closed.emit()">
            <span>Done</span>
          </button>
        } @else {
          <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
            <span>Cancel</span>
          </button>
          <span class="cp-why" [attr.title]="file() ? null : 'Choose a file first'"
            ><button
              type="button"
              class="btn btn-pri"
              id="si-go"
              [class.is-busy]="busy()"
              [disabled]="busy() || !file()"
              (click)="go()"
            >
              <span>Check and import</span>
            </button></span
          >
        }
      </div>
    </rp-modal>
  `,
})
export class StudentImport {
  private readonly api = inject(ApplicationsApi);
  private readonly overlays = inject(Overlays);

  /** The current academic year (students are enrolled in it). */
  readonly yearLabel = input('the current year');
  readonly closed = output<void>();
  readonly imported = output<ImportReport>();

  protected readonly columns = COLUMNS;
  protected readonly plural = plural;
  protected readonly file = signal<File | null>(null);
  protected readonly fileName = signal('');
  protected readonly fileErr = signal('');
  protected readonly report = signal<ImportReport | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly templateBusy = signal(false);
  private key = newIdempotencyKey();

  protected pick(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0] ?? null;
    this.error.set('');
    this.fileErr.set('');
    if (f && f.size > MAX_BYTES) {
      this.file.set(null);
      this.fileErr.set('The file must be under 2 MB.');
      return;
    }
    this.file.set(f);
    this.key = newIdempotencyKey();
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

  protected async go() {
    const f = this.file();
    if (!f) {
      this.fileErr.set(translate('UPL.FILE_REQUIRED'));
      return;
    }
    const ok = await this.overlays.confirm({
      title: 'Import the students in this sheet?',
      text: `Every row of ${f.name} is checked; the rows that pass are enrolled for ${this.yearLabel()} straight away.`,
      ok: 'Check and import',
    });
    if (!ok) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const r = await this.api.import(f, this.key);
      this.fileName.set(f.name);
      this.report.set(r);
      this.overlays.toast(`${plural(r.imported, 'student')} imported`, {
        tone: r.imported ? 'ok' : 'warn',
        sub: r.rejected ? `${plural(r.rejected, 'row')} rejected — see the report` : f.name,
      });
      this.imported.emit(r);
    } catch (e) {
      this.key = newIdempotencyKey();
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.busy.set(false);
    }
  }

  /** The row report as CSV. */
  protected rowReport() {
    const r = this.report();
    if (!r) return;
    saveCsv(`${this.fileName().replace(/\.[^.]+$/, '') || 'students'}_results.csv`, [
      ['Row', 'Student', 'Application no.', 'Result', 'Reasons'],
      ...r.rows.map((x) => [
        x.row,
        x.name,
        x.applicationNo ?? '',
        x.outcome === 'IMPORTED' ? 'Imported' : 'Rejected',
        x.errors.map((e) => `${e.column}: ${e.message}`).join('; '),
      ]),
    ]);
  }

  protected reasons(errors: readonly { column: string; message: string }[]) {
    return errors.map((e) => `${e.column}: ${e.message}`).join('; ');
  }
  protected size(b: number) {
    return fileSize(b);
  }
}
