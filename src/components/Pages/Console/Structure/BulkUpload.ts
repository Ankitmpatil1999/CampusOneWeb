import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { newIdempotencyKey } from '../../../Utils/ids';
import { translate } from '../../../Utils/translate';
import { fileSize } from '../Applications/app-format';
import { plural, saveCsv } from '../Fees/fee-format';
import { problemText } from './academic-format';

const MAX_BYTES = 2 * 1024 * 1024;

/** One row of the server's check, as the dialog shows it. */
export interface UploadRow {
  readonly row: number;
  readonly cells: readonly string[];
  readonly accepted: boolean;
  /** Why the row was refused (register text). */
  readonly reason: string;
  /** What an accepted row does, when worth saying ("No change"). */
  readonly note?: string;
}

export interface UploadCheck {
  readonly accepted: number;
  readonly rejected: number;
  /** Rows imported (commit only). */
  readonly imported: number;
  readonly rows: readonly UploadRow[];
  /** What the accepted rows add up to, beside the counts ("3 new assignments · 1 replaced"). */
  readonly summary?: string;
}

/** Checks (commit false) or imports (commit true) the file; one Idempotency-Key per request. */
export type UploadFn = (file: File, commit: boolean, key: string) => Promise<UploadCheck>;

/**
 * The prototype's "upload → check → per-row result → import" dialog (cc bulkUpload): the columns and
 * a template, the spreadsheet (CSV, 2 MB, CR-07), "Check file" asks the server to check every row
 * without saving (commit=false), then "Import N …" imports the accepted rows (commit=true). A page
 * may put its own choices above the file (`bu-options`, e.g. "replace class teachers"); a change to
 * them asks for a new check. The template is the page's rows, or a file the server prepares.
 */
@Component({
  selector: 'rp-bulk-upload',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="title()"
      [sub]="sub()"
      icon="upload"
      [wide]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="bu-body">
        <div class="row between wrap g8">
          <span class="t-sm t-muted">{{ columns() }}</span>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            id="bu-template"
            [class.is-busy]="fetching()"
            [disabled]="fetching()"
            (click)="template()"
          >
            <rp-icon name="download" [size]="15" /><span>Download template</span>
          </button>
        </div>
        <ng-content select="[bu-options]" />
        <div class="fld" [class.invalid]="fileErr()">
          <span class="fld-l">Spreadsheet</span>
          <label class="upl" [class.done]="!!file()" for="bu-file"
            ><span class="upl-ic"
              ><rp-icon [name]="file() ? 'checkc' : 'upload'" [size]="20" /></span
            ><span class="grow" style="min-width: 0"
              ><span class="t-h4 t-clip" style="display: block">{{
                file()?.name ?? 'Choose a CSV file'
              }}</span
              ><span class="t-xs t-muted">{{
                file() ? size(file()!.size) + ' · ready to check' : 'CSV · up to 2 MB'
              }}</span></span
            ><input
              type="file"
              id="bu-file"
              accept=".csv,text/csv"
              aria-describedby="bu-file-e"
              [disabled]="busy()"
              (change)="pick($event)"
          /></label>
          <div class="fld-e" id="bu-file-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ fileErr() }}</span>
          </div>
        </div>
        @if (report(); as r) {
          <div class="stack g10" id="bu-report">
            <div class="row g8">
              <span class="chip dot tone-ok">{{ r.accepted }} ready</span>
              @if (r.rejected) {
                <span class="chip dot tone-bad">{{ r.rejected }} rejected</span>
              }
              @if (r.summary) {
                <span class="t-sm t-muted" id="bu-summary">{{ r.summary }}</span>
              }
            </div>
            <div class="tbl-wrap" style="max-height: 280px; overflow: auto">
              <table class="tbl dense" id="bu-rows">
                <thead>
                  <tr>
                    <th>Row</th>
                    @for (h of head(); track h) {
                      <th>{{ h }}</th>
                    }
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  @for (x of r.rows; track x.row) {
                    <tr>
                      <td class="t-num">{{ x.row }}</td>
                      @for (c of x.cells; track $index) {
                        <td>{{ c }}</td>
                      }
                      <td>
                        @if (x.accepted) {
                          <span class="chip dot tone-ok">Accepted</span>
                          @if (x.note) {
                            <div class="cell-s">{{ x.note }}</div>
                          }
                        } @else {
                          <span class="chip dot tone-bad">Rejected</span>
                          <div class="cell-s" style="white-space: normal">{{ x.reason }}</div>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
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
      <div modal-foot class="cc-foot">
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        @if (report(); as r) {
          <button
            type="button"
            class="btn btn-pri"
            id="bu-import"
            [class.is-busy]="busy()"
            [disabled]="busy() || !r.accepted"
            (click)="commit()"
          >
            <rp-icon name="check" [size]="17" /><span
              >Import {{ r.accepted }} {{ r.accepted === 1 ? noun() : nouns() }}</span
            >
          </button>
        } @else {
          <button
            type="button"
            class="btn btn-pri"
            id="bu-check"
            [class.is-busy]="busy()"
            [disabled]="busy() || !file()"
            (click)="check()"
          >
            <span>Check file</span>
          </button>
        }
      </div>
    </rp-modal>
  `,
})
export class BulkUpload {
  private readonly overlays = inject(Overlays);

  readonly title = input.required<string>();
  readonly sub = input('');
  /** "Columns: …" line. */
  readonly columns = input('');
  readonly noun = input('row');
  readonly nouns = input('rows');
  /** The result table's columns between "Row" and "Result". */
  readonly head = input<readonly string[]>([]);
  /** The template the "Download template" button saves. */
  readonly templateFile = input<{ name: string; rows: readonly (readonly string[])[] }>({
    name: 'template.csv',
    rows: [],
  });
  /** A template the server prepares (filled in with the year's data); used instead of templateFile. */
  readonly templateFn = input<(() => Promise<void>) | null>(null);
  /** The choices in `bu-options` the check ran with; a change asks for a new check. */
  readonly options = input<unknown>(null);
  readonly upload = input.required<UploadFn>();
  readonly closed = output<void>();
  readonly imported = output<UploadCheck>();

  protected readonly file = signal<File | null>(null);
  protected readonly fileErr = signal('');
  protected readonly report = signal<UploadCheck | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly fetching = signal(false);

  constructor() {
    effect(() => {
      this.options();
      untracked(() => this.report.set(null));
    });
  }

  protected pick(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0] ?? null;
    this.error.set('');
    this.fileErr.set('');
    this.report.set(null);
    if (f && f.size > MAX_BYTES) {
      this.file.set(null);
      this.fileErr.set(
        `This file is ${fileSize(f.size)}. The limit is 2 MB per file — choose a smaller file.`,
      );
      return;
    }
    this.file.set(f);
  }

  protected async template() {
    const fn = this.templateFn();
    if (!fn) {
      const t = this.templateFile();
      saveCsv(t.name, t.rows);
      return;
    }
    this.fetching.set(true);
    this.error.set('');
    try {
      await fn();
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.fetching.set(false);
    }
  }

  protected async check() {
    const f = this.file();
    if (!f) {
      this.fileErr.set(translate('UPL.FILE_REQUIRED'));
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      this.report.set(await this.upload()(f, false, newIdempotencyKey()));
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async commit() {
    const f = this.file();
    if (!f) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const r = await this.upload()(f, true, newIdempotencyKey());
      const n = r.imported;
      this.overlays.toast(`${plural(n, this.noun(), this.nouns())} imported`, {
        sub: r.rejected ? `${plural(r.rejected, 'row')} rejected` : 'All rows accepted',
      });
      this.imported.emit(r);
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected size(b: number) {
    return fileSize(b);
  }
}
