import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  input,
  output,
  signal,
} from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal } from '../../../Shared/Overlays';
import { formatDate, formatDateTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { ProcessOverlay, runProcess, type ProcessState } from '../Settlements/Process';
import { plural } from '../Settlements/settlement-format';
import { STATEMENT, STATEMENT_KINDS, csvHeader, fileSize, missingColumns } from './recon-format';
import { ReconApi, type Layouts, type Statement, type StatementKind } from './recon.api';

/** CR-07: 2 MB at most. */
const MAX_BYTES = 2 * 1024 * 1024;

type Outcome =
  | { kind: 'done'; s: Statement }
  | { kind: 'header'; title: string; text: string }
  | { kind: 'rows'; rows: readonly { n: string; why: string }[]; text: string };

/**
 * Upload an external statement (prototype ob.rec.up; REC-001): the statement type with its
 * mandatory and optional columns, the CSV file (2 MB), then the checking overlay. The file is taken
 * whole or not at all: a missing column or rows in error are reported here and nothing is stored;
 * otherwise the rows are matched and the result says how many matched and what was flagged.
 */
@Component({
  selector: 'rp-rec-upload',
  imports: [Icon, Modal, ProcessOverlay],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!outcome() && !process()) {
      <rp-modal
        title="Upload an external statement"
        sub="Every row is checked first — one row in error rejects the file with each row's reason. The rows are then matched to platform records."
        icon="upload"
        [wide]="true"
        (closed)="closed.emit()"
      >
        <div class="stack g12">
          <div class="ob-cgrid" role="radiogroup" aria-label="Statement">
            @for (k of kinds; track k) {
              <div
                class="choice"
                [class.on]="kind() === k"
                tabindex="0"
                role="radio"
                [attr.aria-checked]="kind() === k"
                (click)="kind.set(k)"
                (keydown.enter)="kind.set(k)"
                (keydown.space)="$event.preventDefault(); kind.set(k)"
              >
                <span class="li-ic sm"><rp-icon [name]="label(k).icon" [size]="17" /></span>
                <span class="grow"
                  ><span class="t-h4" style="display: block">{{ label(k).l }}</span
                  ><span class="t-sm t-muted" style="display: block; margin-top: 1px"
                    >{{ layouts()[k].required.length }} mandatory columns</span
                  ></span
                ><span class="radio"></span>
              </div>
            }
          </div>
          <div class="card flat pad t-sm" id="ob-colhelp">
            <b>{{ label(kind()).l }}</b> — mandatory columns:
            @for (c of layouts()[kind()].required; track c) {
              <span class="tag">{{ c }}</span>
            }
            @if (optional().length) {
              <div class="t-xs t-muted mt8">Optional: {{ optional().join(', ') }}</div>
            }
            <div class="t-xs t-muted mt8">
              Columns in any order; matched on the {{ label(kind()).key }}. Dates as 2026-10-04,
              04-10-2026 or 04-Oct-2026; amounts in rupees.
            </div>
          </div>
          <div class="fld" [class.invalid]="fileErr()">
            <span class="fld-l">Statement file<span class="req">*</span></span>
            <label class="upl" [class.done]="!!file()" for="ob-rfile"
              ><span class="upl-ic"
                ><rp-icon [name]="file() ? 'checkc' : 'upload'" [size]="20" /></span
              ><span class="grow" style="min-width: 0"
                ><span class="t-h4 t-clip" style="display: block">{{
                  file()?.name ?? 'Choose a file'
                }}</span
                ><span class="t-xs t-muted">{{
                  file() ? size(file()!.size) + ' · ready to check' : 'CSV · up to 2 MB'
                }}</span></span
              ><input
                type="file"
                id="ob-rfile"
                accept=".csv,text/csv"
                aria-describedby="ob-rfile-e"
                (change)="pick($event)"
            /></label>
            <div class="fld-e" id="ob-rfile-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ fileErr() }}</span>
            </div>
          </div>
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="closed.emit()">
            <span>Cancel</span>
          </button>
          <button type="button" class="btn btn-pri" id="ob-rec-go" (click)="go()">
            <rp-icon name="scale" [size]="17" /><span>Validate and match</span>
          </button>
        </ng-container>
      </rp-modal>
    }
    @if (outcome(); as o) {
      @if (o.kind === 'done') {
        <rp-modal
          [title]="num(o.s.matched) + ' of ' + num(o.s.rows) + ' rows matched'"
          [sub]="label(o.s.kind).l + ' · ' + o.s.fileName"
          icon="checkc"
          [narrow]="false"
          (closed)="closed.emit()"
        >
          <div class="stack g12">
            <div class="note tone-ok">
              <rp-icon name="checkc" [size]="17" />
              <div class="grow">
                {{ okText }} Every row had its mandatory values{{
                  o.s.periodFrom ? ' · ' + period(o.s) : ''
                }}.
              </div>
            </div>
            @if (o.s.mismatches) {
              <div class="note tone-warn">
                <rp-icon name="alert" [size]="17" />
                <div class="grow">
                  <b>{{ plural(o.s.mismatches, 'mismatch') }}</b> flagged against platform records{{
                    o.s.mismatches > o.s.mismatchedRows
                      ? ', including platform records of these days that the statement doesn’t hold'
                      : ''
                  }}.
                </div>
              </div>
            } @else {
              <div class="note tone-ok">
                <rp-icon name="checkc" [size]="17" />
                <div class="grow">Every row matched a platform record.</div>
              </div>
            }
          </div>
          <ng-container modal-foot>
            <button type="button" class="btn btn-sec" (click)="closed.emit()">
              <span>Close</span>
            </button>
            @if (o.s.mismatches) {
              <button type="button" class="btn btn-pri" (click)="review.emit(o.s)">
                <span>Review mismatches</span>
              </button>
            }
          </ng-container>
        </rp-modal>
      }
      @if (o.kind === 'header') {
        <rp-modal title="The file was rejected" [sub]="file()?.name ?? ''" (closed)="closed.emit()">
          <div class="empty error-state">
            <div class="empty-ic"><rp-icon name="alert" [size]="26" /></div>
            <h4>{{ o.title }}</h4>
            <p>{{ o.text }}</p>
          </div>
          <ng-container modal-foot>
            <button type="button" class="btn btn-sec" (click)="again()">
              <span>Choose another file</span>
            </button>
            <button type="button" class="btn btn-pri" (click)="closed.emit()">
              <span>Close</span>
            </button>
          </ng-container>
        </rp-modal>
      }
      @if (o.kind === 'rows') {
        <rp-modal
          [title]="plural(o.rows.length, 'row') + ' need correcting'"
          [sub]="label(kind()).l + ' · ' + (file()?.name ?? '')"
          icon="alertc"
          [narrow]="false"
          (closed)="closed.emit()"
        >
          <div class="stack g12">
            <p class="t-sm">{{ o.text }}</p>
            <div class="tbl-wrap">
              <table class="tbl dense">
                <thead>
                  <tr>
                    <th style="width: 80px">Row</th>
                    <th>Why it was rejected</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of o.rows; track $index) {
                    <tr>
                      <td class="t-mono">Row {{ r.n }}</td>
                      <td>{{ r.why }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
          <ng-container modal-foot>
            <button type="button" class="btn btn-sec" (click)="closed.emit()">
              <span>Close</span>
            </button>
            <button type="button" class="btn btn-pri" (click)="again()">
              <rp-icon name="upload" [size]="17" /><span>Upload a corrected file</span>
            </button>
          </ng-container>
        </rp-modal>
      }
    }
    <rp-ob-process [state]="process()" />
  `,
})
export class StatementUpload implements OnInit {
  private readonly api = inject(ReconApi);

  readonly layouts = input.required<Layouts>();
  readonly preset = input<StatementKind>('GATEWAY');
  readonly closed = output<void>();
  /** A statement was stored (the page reloads). */
  readonly uploaded = output<Statement>();
  /** Open the mismatches this statement flagged. */
  readonly review = output<Statement>();

  protected readonly kinds = STATEMENT_KINDS;
  protected readonly okText = translate('REC.UPLOADED');
  protected readonly kind = signal<StatementKind>('GATEWAY');
  protected readonly file = signal<File | null>(null);
  protected readonly fileErr = signal('');
  protected readonly outcome = signal<Outcome | null>(null);
  protected readonly process = signal<ProcessState | null>(null);
  private started = false;

  protected readonly optional = computed(() => {
    const l = this.layouts()[this.kind()];
    return l.columns.filter((c) => !l.required.includes(c));
  });

  ngOnInit() {
    this.kind.set(this.preset());
  }

  protected pick(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    this.fileErr.set('');
    if (!f) return;
    if (f.size > MAX_BYTES) {
      this.file.set(null);
      input.value = '';
      this.fileErr.set('The file must be under 2 MB.');
      return;
    }
    if (!/\.csv$/i.test(f.name)) {
      this.file.set(null);
      input.value = '';
      this.fileErr.set('Choose the statement as a CSV file.');
      return;
    }
    this.file.set(f);
  }

  protected again() {
    this.outcome.set(null);
    this.file.set(null);
  }

  protected async go() {
    const f = this.file();
    if (!f) {
      this.fileErr.set('Choose a statement file');
      return;
    }
    if (this.started) return;
    this.started = true;
    const kind = this.kind();
    try {
      const s = await runProcess(
        this.process,
        {
          title: 'Checking the statement',
          icon: 'scale',
          sub: f.name,
          steps: [
            'File is within 2 MB',
            'Header row read · mandatory columns present',
            'Each row checked for mandatory values',
            'Rows matched to platform records',
            'Mismatches flagged for review',
          ],
        },
        () => this.api.upload(kind, f),
        (e) =>
          e instanceof ApiProblem
            ? e.code === 'REC.FILE_REJECTED'
              ? 'Rows in error — nothing stored'
              : e.errors[0]?.message || e.detail
            : translate('GEN.UNAVAILABLE'),
      );
      this.outcome.set({ kind: 'done', s });
      this.uploaded.emit(s);
    } catch (e) {
      await this.failed(e, f, kind);
    } finally {
      this.started = false;
    }
  }

  private async failed(e: unknown, f: File, kind: StatementKind) {
    if (!(e instanceof ApiProblem)) {
      this.fileErr.set(translate('GEN.UNAVAILABLE'));
      return;
    }
    const rows = e.errors.filter((x) => x.field.startsWith('rows.'));
    if (e.code === 'REC.FILE_REJECTED' && rows.length) {
      this.outcome.set({
        kind: 'rows',
        text: e.detail,
        rows: rows.map((r) => ({ n: r.field.slice(5), why: r.message })),
      });
      return;
    }
    const header = e.errors.find((x) => x.code === 'UPL.HEADER_MISMATCH');
    if (header) {
      const layout = this.layouts()[kind];
      const missing = await f
        .slice(0, 4096)
        .text()
        .then((t) => missingColumns(csvHeader(t), layout.required))
        .catch((): string[] => []);
      const what = this.label(kind).l.toLowerCase();
      this.outcome.set({
        kind: 'header',
        title:
          missing.length === 1
            ? `Column “${missing[0]}” is missing`
            : missing.length
              ? `Columns ${missing.map((c) => `“${c}”`).join(', ')} are missing`
              : header.message,
        text: `Every ${what} needs these columns: ${layout.required.join(', ')}. Nothing was stored — fix the header row and upload again.`,
      });
      return;
    }
    // A duplicate file, an empty file or too many rows: said on the file field.
    this.fileErr.set(e.errors.find((x) => x.field === 'file')?.message ?? e.detail);
  }

  protected label(k: StatementKind) {
    return STATEMENT[k];
  }
  protected size(b: number) {
    return fileSize(b);
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
  protected plural(n: number, w: string) {
    return plural(n, w);
  }
  protected period(s: Statement) {
    const f = s.periodFrom ?? '';
    const t = s.periodTo ?? '';
    return f === t ? `rows of ${this.day(f)}` : `rows from ${this.day(f)} to ${this.day(t)}`;
  }
  private day(d: string) {
    return d ? formatDate(d) : '';
  }
}

/** One uploaded statement (prototype ob.rec.upv): its counts, period and who uploaded it. */
@Component({
  selector: 'rp-rec-statement',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <rp-modal [title]="label()" [sub]="sub()" [narrow]="false" (closed)="closed.emit()">
      <div class="stack g12">
        <dl class="kv">
          <dt>Rows</dt>
          <dd>{{ num(u().rows) }}</dd>
          <dt>Matched</dt>
          <dd>{{ num(u().matched) }}</dd>
          <dt>Rows differing from the platform</dt>
          <dd>{{ num(u().mismatchedRows) }}</dd>
          <dt>Mismatches flagged</dt>
          <dd>{{ num(u().mismatches) }}</dd>
          <dt>Still open</dt>
          <dd>{{ num(u().openMismatches) }}</dd>
          <dt>Statement dates</dt>
          <dd>{{ period() }}</dd>
        </dl>
        @if (u().mismatches > u().mismatchedRows) {
          <div class="note tone-info">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              {{ plural(u().mismatches - u().mismatchedRows, 'platform record') }} of these days
              {{ u().mismatches - u().mismatchedRows === 1 ? 'is' : 'are' }} missing from the
              statement — closed automatically when a later statement holds them.
            </div>
          </div>
        }
      </div>
      <ng-container modal-foot>
        <button type="button" class="btn btn-sec" (click)="closed.emit()">
          <span>Close</span>
        </button>
        @if (u().mismatches) {
          <button type="button" class="btn btn-pri" (click)="review.emit(u())">
            <span>Review mismatches</span>
          </button>
        }
      </ng-container>
    </rp-modal>
  `,
})
export class StatementView {
  readonly u = input.required<Statement>();
  readonly closed = output<void>();
  readonly review = output<Statement>();
  protected readonly label = computed(() => STATEMENT[this.u().kind].l);
  protected readonly sub = computed(() => {
    const u = this.u();
    return [u.fileName, u.uploadedAt ? formatDateTime(u.uploadedAt) : '', u.uploadedBy ?? '']
      .filter(Boolean)
      .join(' · ');
  });
  protected readonly period = computed(() => {
    const u = this.u();
    if (!u.periodFrom) return '—';
    return u.periodFrom === u.periodTo
      ? formatDate(u.periodFrom)
      : `${formatDate(u.periodFrom)} – ${formatDate(u.periodTo ?? u.periodFrom)}`;
  });
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
  protected plural(n: number, w: string) {
    return plural(n, w);
  }
}
