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
import { formatDate } from '../../../Utils/format';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { inr0, paiseOf, plural } from './fee-format';
import { FeesApi, type FeeAssignment, type FeeStructure } from './fees.api';

/**
 * Assign a structure to its classes (prototype cm.fs.assign / CM.assignPlan; FEE-007): the preview
 * comes from the server — students, records to create and the amount billed, the instalments
 * already past their due date (not raised), and per class the active students, those who already
 * have this year's records (skipped), the records and the amount. Nothing is written until the
 * records are created, after a confirmation.
 */
@Component({
  selector: 'rp-fee-assign',
  imports: [Amount, Empty, Icon, Kpi, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="'Assign ' + structure().name"
      sub="Review what will be created before anything is written."
      icon="users"
      [wide]="true"
      cls="cm-m"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      @if (plan(); as p) {
        <div class="stack g16" id="fa-plan">
          <div class="c-grid k3">
            <rp-kpi label="Students" icon="users" [value]="num(p.totals.students)" />
            <rp-kpi label="Records to create" icon="receipt" [value]="num(p.totals.records)" />
            <rp-kpi label="Amount billed" icon="rupee" [value]="whole(p.totals.amount)" />
          </div>
          @if (past().length) {
            <div class="note tone-warn">
              <rp-icon name="alert" [size]="17" />
              <div class="grow">
                @for (x of past(); track x.seq; let last = $last) {
                  <b>{{ x.label }}</b> (due {{ date(x.dueDate) }}){{ last ? '' : ', ' }}
                }
                {{ past().length === 1 ? 'is' : 'are' }} past
                {{ past().length === 1 ? 'its' : 'their' }} due date and won't be created — a fee
                record's due date can't be earlier than today. Record any amount still owed
                separately.
              </div>
            </div>
          }
          <div class="tbl-wrap">
            <table class="tbl dense" id="fa-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th class="r">Active students</th>
                  <th class="r">Already have records</th>
                  <th class="r">Records to create</th>
                  <th class="r">Amount</th>
                </tr>
              </thead>
              <tbody>
                @for (c of p.perClass; track c.class.id) {
                  <tr>
                    <td style="white-space: nowrap">
                      <b>{{ c.class.name }}</b>
                    </td>
                    <td class="r t-num">{{ num(c.students) }}</td>
                    <td class="r t-num">
                      @if (c.already) {
                        <span class="t-warn">{{ num(c.already) }} skipped</span>
                      } @else {
                        0
                      }
                    </td>
                    <td class="r t-num">{{ num(c.records) }}</td>
                    <td class="r"><rp-amt [value]="c.amount" /></td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td class="r t-num">{{ num(sum('students')) }}</td>
                  <td class="r t-num">{{ num(sum('already')) }}</td>
                  <td class="r t-num">{{ num(p.totals.records) }}</td>
                  <td class="r"><rp-amt [value]="p.totals.amount" /></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p class="t-xs t-muted" style="line-height: 1.5">
            Instalments created: {{ raised() || 'none' }}. Optional heads apply to students who use
            them. Students joining mid-term are charged the remaining instalments. Collection starts
            once fee consent is given, or through the auto-debit job.
          </p>
          @if (error()) {
            <div class="note tone-bad" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ error() }}</div>
            </div>
          }
        </div>
      } @else if (error()) {
        <div class="note tone-bad" role="alert">
          <rp-icon name="alertc" [size]="17" />
          <div class="grow">{{ error() }}</div>
          <button type="button" class="btn btn-sec btn-sm note-a" (click)="preview()">
            <span>Try again</span>
          </button>
        </div>
      } @else {
        <rp-empty icon="hourglass" title="Working out what will be created…" />
      }

      <div modal-foot class="row g8">
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="fa-create"
          [class.is-busy]="busy()"
          [disabled]="busy() || !plan()?.totals?.records"
          (click)="create()"
        >
          <span>{{
            plan()?.totals?.records
              ? 'Create ' + num(plan()!.totals.records) + ' fee records'
              : 'Nothing to create'
          }}</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class FeeAssign implements OnInit {
  private readonly api = inject(FeesApi);
  private readonly overlays = inject(Overlays);

  readonly structure = input.required<FeeStructure>();
  readonly closed = output<void>();
  readonly assigned = output<FeeAssignment>();

  protected readonly plan = signal<FeeAssignment | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  private readonly key = newIdempotencyKey();

  protected readonly past = computed(() => this.plan()?.instalments.filter((x) => !x.raised) ?? []);
  protected readonly raised = computed(() =>
    (this.plan()?.instalments ?? [])
      .filter((x) => x.raised)
      .map((x) => `${x.label} · ${formatDate(x.dueDate)}`)
      .join('; '),
  );

  ngOnInit() {
    void this.preview();
  }

  protected async preview() {
    this.error.set('');
    try {
      this.plan.set(await this.api.assign(this.structure().id, true));
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  protected async create() {
    const p = this.plan();
    if (!p?.totals.records) return;
    const ok = await this.overlays.confirm({
      title: `Create ${this.num(p.totals.records)} fee records?`,
      text: `${plural(p.totals.students, 'student')} in ${plural(p.perClass.length, 'class', 'classes')} will see these dues in the app.`,
      ok: 'Create records',
    });
    if (!ok) return;
    this.busy.set(true);
    this.error.set('');
    try {
      this.assigned.emit(await this.api.assign(this.structure().id, false, this.key));
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.busy.set(false);
    }
  }

  protected sum(k: 'students' | 'already') {
    return (this.plan()?.perClass ?? []).reduce((a, c) => a + c[k], 0);
  }
  protected whole(m: { amount: string }) {
    return inr0(paiseOf(m));
  }
  protected date(d: string) {
    return formatDate(d);
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
}
