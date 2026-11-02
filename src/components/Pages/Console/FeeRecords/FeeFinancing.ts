import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Amount } from '../../../Shared/Amount';
import { Avatar } from '../../../Shared/Avatar';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatInr } from '../../../Utils/format';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { money, paiseOf, plural } from '../Fees/fee-format';
import { StudentSelect, type StudentOption } from './StudentSelect';
import { FeeRecordsApi, type FinancingList, type FinancingRegistration } from './fee-records.api';
import { FINANCING_STATUS } from './record-format';

/**
 * The financing partner tab (prototype frFin, cm.fin.new; FEE-024, FEE-025): the registrations
 * with the partner — sync status and the partner's reason, when registered, the outstanding fees —
 * and registering a student (their unpaid records of the current year; one live registration per
 * student). A financed record is never collected from the wallet.
 */
@Component({
  selector: 'rp-fee-financing',
  imports: [Amount, Avatar, Empty, Icon, Modal, StudentSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="note tone-info">
      <rp-icon name="handshake" [size]="17" />
      <div class="grow">
        Students registered with the financing partner are never debited from the wallet for fees.
        The partner fetches fee details over an authenticated, IP-restricted interface; its
        decisions and payments arrive by signed webhook and are processed exactly once.
      </div>
    </div>
    <div class="row between">
      <b class="t-h4"
        >Registrations{{ list()?.partner ? ' · ' + list()!.partner.name : '' }}
        @if (list()?.partner?.mode === 'test') {
          <span class="chip tone-warn" style="margin-left: 6px">Test partner</span>
        }
      </b>
      @if (editWhy()) {
        <span class="cp-why" [attr.title]="editWhy()"
          ><button type="button" class="btn btn-sec btn-sm" disabled>
            <rp-icon name="plus" [size]="15" /><span>Register a student</span>
          </button></span
        >
      } @else {
        <button
          type="button"
          class="btn btn-sec btn-sm"
          id="fin-new"
          (click)="registering.set(true)"
        >
          <rp-icon name="plus" [size]="15" /><span>Register a student</span>
        </button>
      }
    </div>
    @if (error()) {
      <div class="card pad">
        <rp-empty icon="alertc" title="Couldn't load the registrations" [text]="error()">
          <button type="button" class="btn btn-sec btn-sm" (click)="reload.emit()">
            <span>Try again</span>
          </button>
        </rp-empty>
      </div>
    } @else {
      <div class="tbl-wrap">
        <table class="tbl" id="fin-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Sync status</th>
              <th>Registered</th>
              <th class="r">Outstanding fees</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @if (!list()) {
              <tr>
                <td colspan="5"><rp-empty icon="hourglass" title="Loading…" /></td>
              </tr>
            }
            @for (g of list()?.items ?? []; track g.id) {
              <tr>
                <td>
                  <div class="cell-main">
                    <rp-av [name]="g.student.name" size="sm" />
                    <div style="min-width: 0">
                      <div class="cell-t t-clip">{{ g.student.name }}</div>
                      <div class="cell-s">
                        {{ g.student.admissionNo ?? 'No admission no.' }} ·
                        {{ plural(g.records.length, 'record') }}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <span [class]="'chip dot tone-' + state(g).tone">{{ state(g).l() }}</span>
                  @if (g.failureReason) {
                    <div class="cell-s t-bad" style="white-space: normal; max-width: 38ch">
                      {{ g.failureReason }}
                    </div>
                  }
                </td>
                <td>{{ g.createdAt ? date(g.createdAt) : '—' }}</td>
                <td class="r"><rp-amt [value]="outstanding(g)" /></td>
                <td>
                  <div class="row g4 end">
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs"
                      [attr.aria-label]="'Fee records of ' + g.student.name"
                      (click)="records.emit({ id: g.student.id, name: g.student.name })"
                    >
                      <rp-icon name="receipt" [size]="15" /><span>Fee records</span>
                    </button>
                  </div>
                </td>
              </tr>
            } @empty {
              @if (list()) {
                <tr>
                  <td colspan="5">
                    <rp-empty
                      icon="handshake"
                      title="No students registered"
                      text="Register a student to have the partner finance their fees."
                    />
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
      @if (list()?.items?.length) {
        <div class="pager">
          <span>{{ plural(list()!.items.length, 'student') }}</span>
        </div>
      }
    }

    @if (registering()) {
      <rp-modal
        title="Register with the financing partner"
        sub="One registration per student. The student's details and unpaid fee records of the current year are shared with the partner."
        icon="handshake"
        cls="cm-m"
        [narrow]="false"
        [dismiss]="!busy()"
        (closed)="registering.set(false)"
      >
        <div class="stack g12">
          <div class="fld" [class.invalid]="studentErr()">
            <label class="fld-l" for="fi-stu-b">Student<span class="req">*</span></label>
            <rp-student-select
              inputId="fi-stu"
              source="fees"
              [exclude]="registered()"
              [value]="student()"
              (valueChange)="student.set($event); studentErr.set('')"
            />
            <div class="fld-e" id="fi-stu-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ studentErr() }}</span>
            </div>
          </div>
        </div>
        <div modal-foot class="row g8">
          <button
            type="button"
            class="btn btn-sec"
            [disabled]="busy()"
            (click)="registering.set(false)"
          >
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            id="fi-save"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="register()"
          >
            <span>Register</span>
          </button>
        </div>
      </rp-modal>
    }
  `,
})
export class FeeFinancing {
  private readonly api = inject(FeeRecordsApi);
  private readonly overlays = inject(Overlays);

  readonly list = input<FinancingList | null>(null);
  readonly error = input('');
  /** Why this person can't register (read-only, no fees.edit); '' when they can. */
  readonly editWhy = input('');
  readonly reload = output<void>();
  readonly registeredOne = output<FinancingRegistration>();
  /** Show a student's fee records. */
  readonly records = output<{ id: string; name: string }>();

  protected readonly plural = plural;
  protected readonly registering = signal(false);
  protected readonly student = signal<StudentOption | null>(null);
  protected readonly studentErr = signal('');
  protected readonly busy = signal(false);
  private key = newIdempotencyKey();

  /** Students with a live registration (pending or approved) can't register again. */
  protected readonly registered = computed(() =>
    (this.list()?.items ?? []).filter((g) => g.status !== 'FAILED').map((g) => g.student.id),
  );

  protected state(g: FinancingRegistration) {
    return FINANCING_STATUS[g.status];
  }
  protected outstanding(g: FinancingRegistration) {
    return money(g.records.reduce((a, r) => a + paiseOf(r.outstanding), 0));
  }
  protected date(d: string) {
    return formatDate(d);
  }

  /** FEE-025 after a confirmation (prototype cm.fin.new). */
  protected async register() {
    const st = this.student();
    if (!st) {
      this.studentErr.set('Choose the student');
      return;
    }
    const ok = await this.overlays.confirm({
      title: `Register ${st.name}?`,
      text: `${st.name}'s unpaid fee records of the current year are shared with the partner. Once the partner approves, they're marked Financed and won't be collected from the wallet.`,
      ok: 'Register',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const g = await this.api.register(st.id, this.key);
      this.key = newIdempotencyKey();
      this.registering.set(false);
      this.student.set(null);
      const total = g.records.reduce((a, r) => a + paiseOf(r.outstanding), 0);
      this.overlays.toast('Registered with the partner', {
        sub: `${st.name} · ${plural(g.records.length, 'record')} (${formatInr(total)})${g.sent ? '' : ' · the partner will be told once connected'}`,
        tone: 'ok',
      });
      this.registeredOne.emit(g);
    } catch (e) {
      this.studentErr.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.busy.set(false);
    }
  }
}
