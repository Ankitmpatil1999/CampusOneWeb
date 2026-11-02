import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  input,
  type OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Amount } from '../../../Shared/Amount';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatInr } from '../../../Utils/format';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { amountText, cleanTyped } from '../../../Utils/typing';
import type { ClassView } from '../Members/members.api';
import {
  classShort,
  money,
  paiseOf,
  paiseToInput,
  pctText,
  plural,
  rupeesToPaise,
  shareBp,
  structureTotals,
} from './fee-format';
import {
  FeesApi,
  type FeeHead,
  type FeeStructure,
  type StructureInput,
  type StructureSubmitted,
} from './fees.api';

interface HeadRow {
  readonly headId: string;
  readonly amount: string;
}
interface InstRow {
  readonly label: string;
  readonly due: string;
  readonly pct: string;
}
type Kind = 'heads' | 'optional';

/** An open academic year the editor offers (its dates when the role can read them, ACA-001). */
export interface EditorYear {
  readonly id: string;
  readonly label: string;
  readonly start?: string;
  readonly end?: string;
}

/** What the editor saved: the structure, and the submission when it was sent for approval. */
export interface StructureSaved {
  readonly structure: FeeStructure;
  readonly submitted: StructureSubmitted | null;
  /** Saved, but sending it for approval failed (the reason). */
  readonly submitError?: string;
}

const MAX_INSTALMENTS = 6;

/**
 * Create or edit a fee structure (prototype cm.fs.edit / fsFormBody / fsSummary; FEE-004, FEE-005,
 * FEE-006): name and academic year, the classes (a class already in another approved or pending
 * structure of the year is taken), the fee heads with their annual amounts, the optional heads,
 * the instalments with due dates and shares, and the late fine. The recomputed totals beside the
 * form use the API's one formula as you type; the total is never typed in. "Save as draft" saves;
 * "Submit for approval" saves and raises the approval (an administrator's own request applies
 * directly, ADR-0015). Editing an approved structure opens a new version for re-approval.
 */
@Component({
  selector: 'rp-fee-structure-editor',
  imports: [Amount, Icon, Modal, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="structure() ? 'Edit ' + structure()!.name : 'New fee structure'"
      sub="Heads, instalments and late fine. Totals are recomputed as you type."
      icon="layers"
      [wide]="true"
      cls="cm-xl cm-m"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="cm-fs" id="fs-form">
        <div class="stack g16 cm-fs-main">
          <div id="fs-err" #errBox>
            @if (errors().length) {
              <div class="note tone-bad" role="alert">
                <rp-icon name="alertc" [size]="17" />
                <div class="grow">
                  <b>{{ plural(errors().length, 'thing') }} to fix before this can be saved:</b>
                  <ul class="cm-errs">
                    @for (e of errors().slice(0, 8); track $index) {
                      <li>{{ e.msg }}</li>
                    }
                  </ul>
                </div>
              </div>
            } @else if (error()) {
              <div class="note tone-bad" role="alert">
                <rp-icon name="alertc" [size]="17" />
                <div class="grow">{{ error() }}</div>
              </div>
            }
          </div>
          @if (structure()?.status === 'ACTIVE') {
            <div class="note tone-warn">
              <rp-icon name="alert" [size]="17" />
              <div class="grow">
                This structure is approved. Saving sends it for approval again; fee records already
                created keep their amounts.
              </div>
            </div>
          }
          @if (classesError()) {
            <div class="note tone-warn">
              <rp-icon name="alert" [size]="17" />
              <div class="grow">{{ classesError() }}</div>
            </div>
          }

          <div class="c-form">
            <div class="fld">
              <label class="fld-l" for="fs-name">Structure name<span class="req">*</span></label>
              <div class="fld-in" [class.cm-bad]="bad('name')">
                <input
                  id="fs-name"
                  maxlength="60"
                  placeholder="e.g. Secondary 2026-27"
                  autocomplete="off"
                  [value]="name()"
                  (input)="name.set(val($event)); unmark('name')"
                />
              </div>
            </div>
            <div class="fld">
              <label class="fld-l" for="fs-year">Academic year<span class="req">*</span></label>
              <div class="fld-in">
                <select
                  id="fs-year"
                  [disabled]="!!structure()"
                  [value]="yearId()"
                  (change)="pickYear(val($event))"
                >
                  @for (y of years(); track y.id) {
                    <option [value]="y.id" [selected]="y.id === yearId()">{{ y.label }}</option>
                  }
                </select>
              </div>
            </div>
          </div>

          <div class="fs">
            <h4>
              <rp-icon name="school" [size]="16" /> Classes
              <span class="t-xs t-muted" style="font-weight: 500; margin-left: auto"
                >{{ classIds().length }} selected</span
              >
            </h4>
            <div class="fs-b">
              <div class="cm-clsgrid" [class.cm-badbox]="bad('classes')">
                @for (c of classes(); track c.id) {
                  @let t = taken().get(c.id);
                  @let on = classIds().includes(c.id);
                  <label
                    class="cm-clschip"
                    [class.on]="on"
                    [class.taken]="!!t && !on"
                    [attr.title]="t ? 'Already in ' + t : null"
                    ><input
                      type="checkbox"
                      [value]="c.id"
                      [checked]="on"
                      [disabled]="!!t && !on"
                      (change)="toggleClass(c.id, $event)"
                    /><span>{{ c.name }}</span>
                    @if (t) {
                      <small>{{ t }}</small>
                    }
                  </label>
                } @empty {
                  <span class="t-sm t-muted">No classes yet — add them in Classes & subjects.</span>
                }
              </div>
            </div>
          </div>

          <div class="fs" id="fs-heads" [class.cm-badbox]="bad('heads')">
            <h4>
              <rp-icon name="list" [size]="16" /> Fee heads<span class="grow"></span>
              <button
                type="button"
                class="btn btn-ghost btn-xs"
                id="fs-add-head"
                (click)="add('heads')"
              >
                <rp-icon name="plus" [size]="15" /><span>Add head</span>
              </button>
            </h4>
            <div class="fs-b">
              <table class="cm-ed">
                <thead>
                  <tr>
                    <th>Head</th>
                    <th class="r">Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (h of mandatory(); track $index; let i = $index) {
                    <ng-container
                      *ngTemplateOutlet="headRow; context: { $implicit: h, i: i, kind: 'heads' }"
                    />
                  } @empty {
                    <tr>
                      <td colspan="3" class="t-sm t-muted">No heads yet.</td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td class="r t-num" id="fs-htot">{{ inr(sums().total) }}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div class="fs">
            <h4>
              <rp-icon name="plus" [size]="16" /> Optional heads<span class="grow"></span>
              <button
                type="button"
                class="btn btn-ghost btn-xs"
                id="fs-add-opt"
                (click)="add('optional')"
              >
                <rp-icon name="plus" [size]="15" /><span>Add optional head</span>
              </button>
            </h4>
            <div class="fs-b">
              @if (optional().length) {
                <table class="cm-ed">
                  <thead>
                    <tr>
                      <th>Head</th>
                      <th class="r">Amount</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (h of optional(); track $index; let i = $index) {
                      <ng-container
                        *ngTemplateOutlet="
                          headRow;
                          context: { $implicit: h, i: i, kind: 'optional' }
                        "
                      />
                    }
                  </tbody>
                </table>
                <p class="fld-h mt8">
                  Charged only to students who use them — Transport to transport users, Hostel to
                  hostel students.
                </p>
              } @else {
                <p class="t-sm t-muted">None. Add Transport or Hostel if some students pay them.</p>
              }
            </div>
          </div>

          <div class="fs" id="fs-inst" [class.cm-badbox]="bad('inst')">
            <h4>
              <rp-icon name="calendar" [size]="16" /> Instalments
              <span
                class="cm-pct-inline"
                id="fs-pct"
                [class.ok]="sums().pctOk"
                [class.bad]="!sums().pctOk"
                >{{ sums().pctText }}% of 100%</span
              ><span class="grow"></span>
              <button
                type="button"
                class="btn btn-ghost btn-xs"
                id="fs-add-inst"
                [disabled]="inst().length >= maxInstalments()"
                [attr.title]="
                  inst().length >= maxInstalments()
                    ? 'At most ' + maxInstalments() + ' instalments'
                    : null
                "
                (click)="addInstalment()"
              >
                <rp-icon name="plus" [size]="15" /><span>Add instalment</span>
              </button>
            </h4>
            <div class="fs-b">
              <table class="cm-ed">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Due date</th>
                    <th class="r">Share</th>
                    <th class="r">Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (x of inst(); track $index; let i = $index) {
                    <tr>
                      <td>
                        <input
                          maxlength="30"
                          aria-label="Instalment label"
                          [class.cm-bad]="bad('inst.' + i + '.label')"
                          [value]="x.label"
                          (input)="setInst(i, 'label', $event)"
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          aria-label="Due date"
                          [class.cm-bad]="bad('inst.' + i + '.due')"
                          [attr.min]="year()?.start ?? null"
                          [attr.max]="year()?.end ?? null"
                          [value]="x.due"
                          (input)="setInst(i, 'due', $event)"
                          (change)="setInst(i, 'due', $event)"
                        />
                      </td>
                      <td class="r">
                        <div class="cm-amt-in pct" [class.cm-bad]="bad('inst.' + i + '.pct')">
                          <input
                            inputmode="decimal"
                            aria-label="Share in percent"
                            [value]="x.pct"
                            (input)="setInst(i, 'pct', $event)"
                          /><span>%</span>
                        </div>
                      </td>
                      <td class="r t-num">{{ inr(sums().instalments[i] ?? 0) }}</td>
                      <td class="cm-rx">
                        <button
                          type="button"
                          class="iconbtn"
                          aria-label="Remove instalment"
                          [disabled]="inst().length <= 1"
                          (click)="removeInstalment(i)"
                        >
                          <rp-icon name="trash" [size]="16" />
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
              <p class="fld-h mt8">
                Due dates belong to the structure; instalments due before the day it is assigned
                aren't raised. Up to {{ maxInstalments() }} instalments.
              </p>
            </div>
          </div>

          <div class="c-form">
            <div class="fld" id="fs-fine">
              <label class="fld-l" for="fs-fine-i">Late fine</label>
              <div class="fld-in" [class.cm-bad]="bad('fine')">
                <span class="pre">₹</span>
                <input
                  id="fs-fine-i"
                  inputmode="decimal"
                  [value]="fine()"
                  (input)="fine.set(amountOf($event)); unmark('fine')"
                />
              </div>
              <div class="fld-h">
                Added once to an instalment paid after its due date. Not part of the total.
              </div>
            </div>
          </div>
        </div>

        <aside class="cm-fs-side" id="fs-sum">
          <div class="card pad stack g12">
            <div class="row between">
              <b class="t-h4">Recomputed totals</b><span class="chip tone-brand dot">Live</span>
            </div>
            <div>
              <div class="t-xs t-muted">Total of mandatory heads</div>
              <div><rp-amt [value]="moneyOf(sums().total)" cls="big cm-total" /></div>
              @if (sums().optional) {
                <div class="t-sm t-muted mt4">
                  + {{ inr(sums().optional) }} optional ·
                  {{ inr(sums().total + sums().optional) }} with all optional heads
                </div>
              }
            </div>
            <div class="cm-pct" [class.ok]="sums().pctOk" [class.bad]="!sums().pctOk">
              <rp-icon [name]="sums().pctOk ? 'checkc' : 'alertc'" [size]="14" /><span
                >Instalment shares total <b class="t-num">{{ sums().pctText }}%</b
                >{{ sums().pctOk ? '' : ' — they must total 100%' }}</span
              >
            </div>
            <div class="cm-sum-ins">
              @for (x of inst(); track $index; let i = $index) {
                <div>
                  <span class="grow t-clip"
                    >{{ x.label || 'Instalment ' + (i + 1)
                    }}<small
                      >{{ x.due ? date(x.due) : 'No due date' }} · {{ x.pct || 0 }}%</small
                    ></span
                  ><b class="t-num">{{ inr(sums().instalments[i] ?? 0) }}</b>
                </div>
              }
            </div>
            <div class="row between t-sm">
              <span class="t-muted">Late fine (once, if overdue)</span
              ><b class="t-num">{{ inr(finePaise() ?? 0) }}</b>
            </div>
            <p class="t-xs t-muted" style="line-height: 1.5">
              The total is worked out from the heads and can't be typed in. Whole rupees per
              instalment; any remainder goes on the last one.
            </p>
          </div>
        </aside>
      </div>

      <div modal-foot class="row g8">
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        @if (structure()?.status !== 'ACTIVE') {
          <button
            type="button"
            class="btn btn-ghost"
            id="fs-draft"
            [disabled]="busy()"
            (click)="save(true)"
          >
            <span>Save as draft</span>
          </button>
        }
        <button
          type="button"
          class="btn btn-pri"
          id="fs-submit"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save(false)"
        >
          <rp-icon name="send" [size]="17" /><span>Submit for approval</span>
        </button>
      </div>
    </rp-modal>

    <ng-template #headRow let-h let-i="i" let-kind="kind">
      <tr>
        <td>
          <select
            aria-label="Fee head"
            [value]="h.headId"
            (change)="setHead(kind, i, 'headId', $event)"
          >
            @for (o of headOptions(h.headId); track o.id) {
              <option [value]="o.id" [selected]="o.id === h.headId">{{ o.name }}</option>
            }
          </select>
        </td>
        <td class="r">
          <div class="cm-amt-in" [class.cm-bad]="bad(kind + '.' + i)">
            <span>₹</span
            ><input
              inputmode="decimal"
              placeholder="0.00"
              [attr.aria-label]="headName(h.headId) + ' amount'"
              [value]="h.amount"
              (input)="setHead(kind, i, 'amount', $event)"
            />
          </div>
        </td>
        <td class="cm-rx">
          <button
            type="button"
            class="iconbtn"
            title="Remove"
            [attr.aria-label]="'Remove ' + headName(h.headId)"
            (click)="remove(kind, i)"
          >
            <rp-icon name="trash" [size]="16" />
          </button>
        </td>
      </tr>
    </ng-template>
  `,
})
export class FeeStructureEditor implements OnInit {
  private readonly api = inject(FeesApi);
  private readonly overlays = inject(Overlays);

  /** The structure being edited; null creates a new one. */
  readonly structure = input<FeeStructure | null>(null);
  /** The open academic years (a closed year's fees can't change). */
  readonly years = input.required<readonly EditorYear[]>();
  /** The year the page shows; a new structure starts in it. */
  readonly pageYearId = input('');
  /** The structures of the page's year (classes already taken, names already used). */
  readonly structures = input<readonly FeeStructure[]>([]);
  readonly classes = input<readonly ClassView[]>([]);
  readonly classesError = input('');
  readonly heads = input.required<readonly FeeHead[]>();
  readonly maxInstalments = input(MAX_INSTALMENTS);
  readonly closed = output<void>();
  readonly saved = output<StructureSaved>();

  private readonly errBox = viewChild<ElementRef<HTMLElement>>('errBox');
  protected readonly plural = plural;
  protected readonly name = signal('');
  protected readonly yearId = signal('');
  protected readonly classIds = signal<readonly string[]>([]);
  protected readonly mandatory = signal<readonly HeadRow[]>([]);
  protected readonly optional = signal<readonly HeadRow[]>([]);
  protected readonly inst = signal<readonly InstRow[]>([]);
  protected readonly fine = signal('0');
  protected readonly errors = signal<readonly { key: string; msg: string }[]>([]);
  protected readonly marks = signal<ReadonlySet<string>>(new Set());
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  /** The structures of another year, fetched when the year is changed. */
  private readonly otherYear = signal<readonly FeeStructure[] | null>(null);
  /** Saved once already (a retry after a failed submission updates instead of creating). */
  private created: FeeStructure | null = null;
  private readonly createKey = newIdempotencyKey();
  private readonly submitKey = newIdempotencyKey();

  protected readonly year = computed(() => this.years().find((y) => y.id === this.yearId()));
  private readonly sameYear = computed(() =>
    this.yearId() === this.pageYearId() ? this.structures() : (this.otherYear() ?? []),
  );
  /** Classes served by another structure of the year that is approved or waiting for approval. */
  protected readonly taken = computed(() => {
    const me = this.structure()?.id ?? this.created?.id;
    const out = new Map<string, string>();
    for (const s of this.sameYear()) {
      if (s.id === me) continue;
      const versions = [s.active, s.current].filter(
        (v): v is NonNullable<typeof v> => !!v && (v.state === 'ACTIVE' || v.state === 'PENDING'),
      );
      for (const v of versions) for (const c of v.classes) out.set(c.id, s.name);
    }
    return out;
  });
  protected readonly finePaise = computed(() => rupeesToPaise(this.fine() || '0'));
  protected readonly sums = computed(() => {
    const bps = this.inst().map((x) => shareBp(x.pct) ?? 0);
    const amount = (h: HeadRow) => rupeesToPaise(h.amount) ?? 0;
    const t = structureTotals(
      [
        ...this.mandatory().map((h) => ({ amount: amount(h), optional: false })),
        ...this.optional().map((h) => ({ amount: amount(h), optional: true })),
      ],
      bps,
    );
    const pct = bps.reduce((a, b) => a + b, 0);
    return { ...t, pctOk: pct === 10_000, pctText: pctText(pct) };
  });

  ngOnInit() {
    const s = this.structure();
    const open = this.years();
    if (s) {
      const v = s.current;
      this.name.set(s.name);
      this.yearId.set(s.year.id);
      this.classIds.set(v.classes.map((c) => c.id));
      const row = (h: (typeof v.heads)[number]) => ({
        headId: h.headId,
        amount: paiseToInput(paiseOf(h.amount)),
      });
      this.mandatory.set(v.heads.filter((h) => !h.optional).map(row));
      this.optional.set(v.heads.filter((h) => h.optional).map(row));
      this.inst.set(v.instalments.map((x) => ({ label: x.label, due: x.dueDate, pct: x.share })));
      this.fine.set(paiseToInput(paiseOf(v.lateFine)));
      return;
    }
    this.yearId.set(
      open.some((y) => y.id === this.pageYearId()) ? this.pageYearId() : (open[0]?.id ?? ''),
    );
    const byName = (n: string) => this.activeHeads().find((h) => h.name === n)?.id;
    const first = [byName('Tuition'), byName('Annual')].filter((x): x is string => !!x);
    const fallback = this.activeHeads()
      .map((h) => h.id)
      .filter((id) => !first.includes(id));
    this.mandatory.set(
      [...first, ...fallback].slice(0, 2).map((headId) => ({ headId, amount: '' })),
    );
    this.inst.set([
      { label: 'Instalment 1', due: '', pct: '50' },
      { label: 'Instalment 2', due: '', pct: '50' },
    ]);
  }

  // --- the form ------------------------------------------------------------------------------------
  protected activeHeads() {
    return this.heads().filter((h) => h.status === 'ACTIVE');
  }
  /** A row's choices: the active heads, and its own head even when deactivated since. */
  protected headOptions(current: string) {
    const list = this.activeHeads();
    const own = this.heads().find((h) => h.id === current);
    return own && !list.includes(own) ? [own, ...list] : list;
  }
  protected headName(id: string) {
    return this.heads().find((h) => h.id === id)?.name ?? 'Head';
  }
  protected list(kind: Kind) {
    return kind === 'heads' ? this.mandatory : this.optional;
  }
  protected add(kind: Kind) {
    const used = [...this.mandatory(), ...this.optional()].map((h) => h.headId);
    const pref = kind === 'optional' ? ['Transport', 'Hostel'] : [];
    const free = this.activeHeads().filter((h) => !used.includes(h.id));
    const next =
      free.find((h) => pref.includes(h.name)) ?? free[0] ?? this.activeHeads()[0] ?? undefined;
    if (!next) return;
    this.list(kind).update((l) => [...l, { headId: next.id, amount: '' }]);
    this.unmark('heads');
  }
  protected remove(kind: Kind, i: number) {
    this.list(kind).update((l) => l.filter((_, n) => n !== i));
    this.marks.set(new Set());
  }
  protected setHead(kind: Kind, i: number, k: keyof HeadRow, e: Event) {
    const v = k === 'amount' ? this.amountOf(e) : this.val(e);
    this.list(kind).update((l) => l.map((h, n) => (n === i ? { ...h, [k]: v } : h)));
    this.unmark(`${kind}.${i}`);
  }
  protected addInstalment() {
    if (this.inst().length >= this.maxInstalments()) return;
    this.inst.update((l) => [...l, { label: `Instalment ${l.length + 1}`, due: '', pct: '' }]);
    this.unmark('inst');
  }
  protected removeInstalment(i: number) {
    if (this.inst().length <= 1) return;
    this.inst.update((l) => l.filter((_, n) => n !== i));
    this.marks.set(new Set());
  }
  protected setInst(i: number, k: keyof InstRow, e: Event) {
    const v = this.val(e);
    this.inst.update((l) => l.map((x, n) => (n === i ? { ...x, [k]: v } : x)));
    this.unmark(`inst.${i}.${k}`);
  }
  protected toggleClass(id: string, e: Event) {
    const on = (e.target as HTMLInputElement).checked;
    this.classIds.update((l) =>
      on ? [...l.filter((x) => x !== id), id] : l.filter((x) => x !== id),
    );
    this.unmark('classes');
  }
  protected async pickYear(id: string) {
    this.yearId.set(id);
    this.classIds.set([]);
    this.otherYear.set(null);
    if (id === this.pageYearId()) return;
    try {
      const r = await this.api.structures({ yearId: id });
      if (this.yearId() === id) this.otherYear.set(r.items);
    } catch {
      // The server still refuses a class that is taken (FEE.CLASS_TAKEN).
    }
  }

  protected bad(key: string) {
    return this.marks().has(key);
  }
  protected unmark(key: string) {
    if (!this.marks().has(key)) return;
    const next = new Set(this.marks());
    next.delete(key);
    this.marks.set(next);
  }

  // --- checks (prototype fsValidate) -------------------------------------------------------------
  private validate(): { key: string; msg: string }[] {
    const out: { key: string; msg: string }[] = [];
    const add = (key: string, msg: string) => out.push({ key, msg });
    const y = this.year();
    const name = this.name().trim();
    const me = this.structure()?.id ?? this.created?.id;
    if (!name) add('name', 'Enter a name for the structure.');
    else if (
      this.sameYear().some((s) => s.id !== me && s.name.toLowerCase() === name.toLowerCase())
    ) {
      add('name', translate('FEE.STRUCTURE_NAME_TAKEN', { name, year: y?.label ?? '' }));
    }
    if (!this.classIds().length) add('classes', 'Choose at least one class.');
    const clash = this.classIds().find((c) => this.taken().has(c));
    if (clash) {
      add(
        'classes',
        translate('FEE.CLASS_TAKEN', {
          class: this.classes().find((c) => c.id === clash)?.name ?? '',
          structure: this.taken().get(clash) ?? '',
          year: y?.label ?? '',
        }),
      );
    }
    if (!this.mandatory().length) add('heads', 'Add at least one fee head.');
    const ids = [...this.mandatory(), ...this.optional()].map((h) => h.headId);
    const dup = ids.find((h, i) => ids.indexOf(h) !== i);
    if (dup) add('heads', translate('FEE.HEAD_REPEATED', { name: this.headName(dup) }));
    this.mandatory().forEach((h, i) => {
      const p = rupeesToPaise(h.amount);
      if (!p) {
        add(
          `heads.${i}`,
          `Enter an amount above ₹0 for ${this.headName(h.headId)} (up to 2 decimals).`,
        );
      }
    });
    this.optional().forEach((h, i) => {
      if (!rupeesToPaise(h.amount)) {
        add(`optional.${i}`, `Enter an amount above ₹0 for optional ${this.headName(h.headId)}.`);
      }
    });
    const inst = this.inst();
    if (!inst.length) add('inst', 'Add at least one instalment.');
    if (inst.length > this.maxInstalments()) {
      add('inst', translate('FEE.INSTALMENTS_MAX', { max: this.maxInstalments() }));
    }
    inst.forEach((x, i) => {
      const label = x.label.trim() || `instalment ${i + 1}`;
      if (!x.label.trim()) add(`inst.${i}.label`, `Name instalment ${i + 1}.`);
      if (!x.due) add(`inst.${i}.due`, `Choose the due date for ${label}.`);
      else {
        if (y?.start && y.end && (x.due < y.start || x.due > y.end)) {
          add(
            `inst.${i}.due`,
            translate('FEE.DUE_OUTSIDE_YEAR', {
              label,
              year: y.label,
              from: formatDate(y.start),
              to: formatDate(y.end),
            }),
          );
        }
        const prev = inst[i - 1];
        if (prev?.due && x.due <= prev.due) {
          add(
            `inst.${i}.due`,
            translate('FEE.DUE_ORDER', {
              label,
              previous: prev.label.trim() || `instalment ${i}`,
            }),
          );
        }
      }
      if (shareBp(x.pct) === null) add(`inst.${i}.pct`, `Enter a share above 0% for ${label}.`);
    });
    const sm = this.sums();
    if (inst.length && !sm.pctOk) {
      add('inst', translate('FEE.SHARES_NOT_100', { total: sm.pctText }));
    }
    const fine = this.finePaise();
    if (fine === null) add('fine', 'Enter the late fine as an amount, or 0 for none.');
    else if (sm.instalments.length && fine > Math.min(...sm.instalments)) {
      add('fine', translate('FEE.FINE_TOO_HIGH', { max: formatInr(Math.min(...sm.instalments)) }));
    }
    return out;
  }

  private body(): StructureInput {
    const head = (optional: boolean) => (h: HeadRow) => ({
      headId: h.headId,
      amount: money(rupeesToPaise(h.amount) ?? 0),
      optional,
    });
    return {
      yearId: this.yearId(),
      name: this.name().trim(),
      classIds: this.classIds(),
      heads: [...this.mandatory().map(head(false)), ...this.optional().map(head(true))],
      instalments: this.inst().map((x) => ({
        label: x.label.trim(),
        dueDate: x.due,
        share: x.pct.trim(),
      })),
      lateFine: money(this.finePaise() ?? 0),
      total: money(this.sums().total),
    };
  }

  protected async save(asDraft: boolean) {
    this.error.set('');
    const errs = this.validate();
    this.errors.set(errs);
    this.marks.set(new Set(errs.map((e) => e.key)));
    if (errs.length) {
      this.errBox()?.nativeElement.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    const y = this.year();
    const name = this.name().trim();
    const ok = await this.overlays.confirm(
      asDraft
        ? {
            title: 'Save as draft?',
            text: "Drafts aren't visible to parents and can't be assigned until approved.",
            ok: 'Save draft',
          }
        : {
            title: `Submit ${name} for approval?`,
            text: `${y?.label ?? ''} · ${plural(this.classIds().length, 'class', 'classes')} · total ${formatInr(this.sums().total)} in ${plural(this.inst().length, 'instalment')}. A different person must approve it before it can be assigned (maker-checker).`,
            ok: 'Submit for approval',
          },
    );
    if (!ok) return;
    this.busy.set(true);
    let saved: FeeStructure | null = null;
    try {
      const existing = this.created ?? this.structure();
      saved = existing
        ? await this.api.update(existing, this.body())
        : await this.api.create(this.body(), this.createKey);
      this.created = saved;
      if (asDraft) {
        this.saved.emit({ structure: saved, submitted: null });
        return;
      }
      const sent = await this.api.submit(saved.id, null, this.submitKey);
      this.saved.emit({ structure: sent.structure, submitted: sent });
    } catch (e) {
      if (saved) {
        this.saved.emit({
          structure: saved,
          submitted: null,
          submitError: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        });
        return;
      }
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  private fail(e: unknown) {
    if (!(e instanceof ApiProblem)) {
      this.error.set(translate('GEN.UNAVAILABLE'));
      return;
    }
    if (e.status === 412) {
      this.error.set('Someone else changed this structure. Close it and open it again.');
      return;
    }
    if (e.errors.length) {
      const key = (f: string) =>
        f === 'name'
          ? 'name'
          : f === 'classIds'
            ? 'classes'
            : f.startsWith('heads')
              ? 'heads'
              : f.startsWith('instalments')
                ? 'inst'
                : f === 'lateFine'
                  ? 'fine'
                  : f;
      this.errors.set(e.errors.map((x) => ({ key: key(x.field), msg: x.message })));
      this.marks.set(new Set(e.errors.map((x) => key(x.field))));
      return;
    }
    this.error.set(e.detail);
  }

  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  /** An amount: numbers only, in the box too (client 2026-10-14). */
  protected amountOf(e: Event) {
    return cleanTyped(e.target as HTMLInputElement, amountText);
  }
  protected inr(p: number) {
    return formatInr(p);
  }
  protected moneyOf(p: number) {
    return money(p);
  }
  protected date(d: string) {
    return formatDate(d);
  }
  protected short(n: string) {
    return classShort(n);
  }
}
