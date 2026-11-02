import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Amount } from '../../../Shared/Amount';
import { Icon } from '../../../Shared/Icon';
import { Modal } from '../../../Shared/Overlays';
import type { IconName } from '../../../Utils/icons';
import { formatDate, formatDateTime, formatInr } from '../../../Utils/format';
import { translate } from '../../../Utils/translate';
import { STRUCTURE_STATE, classList, headParts, money, paiseOf, shareBp } from './fee-format';
import type { FeeStructure, StructureVersion } from './fees.api';

interface Step {
  readonly t: string;
  readonly s: string;
  readonly state: 'done' | 'now';
  readonly icon: IconName;
}

/**
 * The fee structure drawer (prototype fsDrawer / fsFoot, cm.fs.open; FEE-003): the waiting or
 * "Returned by" note, the structure with its status, the totals, the heads and the instalments
 * (with the optional heads added), the versions, the approval steps and the assignment. The
 * footer edits it (an approved one needs re-approval), submits a draft and assigns it.
 */
@Component({
  selector: 'rp-fee-structure-drawer',
  imports: [Amount, Icon, Modal, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Fee structure"
      [sub]="'Version ' + v().no + ' · ' + structure().year.label"
      icon="layers"
      [drawer]="true"
      cls="cm-m"
      (closed)="closed.emit()"
    >
      @let s = structure();
      <div class="cm-dr">
        <div class="stack g16">
          @if (readOnly()) {
            <div class="note tone-info">
              <rp-icon name="lock" [size]="17" />
              <div class="grow">{{ readOnly() }}</div>
            </div>
          }
          @if (s.status === 'PENDING') {
            <div class="note tone-info">
              <rp-icon name="hourglass" [size]="17" />
              <div class="grow">
                Waiting for a checker{{ v().approval ? ' — request ' + v().approval!.no : ''
                }}{{ v().submittedAt ? ' submitted ' + when(v().submittedAt!) : '' }}. It can't be
                edited or assigned until it's approved.
              </div>
              <a
                class="btn btn-sec btn-xs note-a"
                routerLink="/console/approvals"
                [queryParams]="v().approval ? { open: v().approval!.id } : {}"
                ><span>Open approvals</span></a
              >
            </div>
          }
          @if (s.status === 'DRAFT' && v().returnedRemarks) {
            <div class="note tone-warn" id="fs-returned">
              <rp-icon name="alert" [size]="17" />
              <div class="grow">Returned by the checker: “{{ v().returnedRemarks }}”</div>
            </div>
          }
          @if (s.active && s.active.no !== v().no) {
            <div class="note tone-info">
              <rp-icon name="info" [size]="17" />
              <div class="grow">
                Version {{ s.active.no }} stays in use until version {{ v().no }} is approved.
              </div>
            </div>
          }

          <div class="cm-hero">
            <span class="li-ic"><rp-icon name="layers" [size]="20" /></span>
            <div class="grow">
              <div class="t-h3">{{ s.name }}</div>
              <div class="t-sm t-muted">{{ s.year.label }} · Classes {{ classes() || '—' }}</div>
            </div>
            <span [class]="'chip dot tone-' + state().tone">{{ state().l() }}</span>
          </div>

          <div class="c-grid k3">
            <div class="cm-tile">
              <span>Total (heads)</span><b class="t-num">{{ inr(v().total) }}</b>
            </div>
            <div class="cm-tile">
              <span>Optional</span
              ><b class="t-num">{{ optional() ? inr(v().optional) : 'None' }}</b>
            </div>
            <div class="cm-tile">
              <span>Late fine</span><b class="t-num">{{ inr(v().lateFine) }}</b>
            </div>
          </div>

          <div class="sec-h"><h3>Fee heads</h3></div>
          <div class="tbl-wrap">
            <table class="tbl dense" id="fs-heads-t">
              <thead>
                <tr>
                  <th>Head</th>
                  <th>Type</th>
                  <th class="r">Amount</th>
                </tr>
              </thead>
              <tbody>
                @for (h of v().heads; track h.headId) {
                  <tr>
                    <td>{{ h.name }}</td>
                    <td class="muted">{{ h.optional ? optionalFor(h.name) : 'Mandatory' }}</td>
                    <td class="r"><rp-amt [value]="h.amount" /></td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2">Total of mandatory heads</td>
                  <td class="r"><rp-amt [value]="v().total" /></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div class="sec-h"><h3>Instalments</h3></div>
          <div class="tbl-wrap">
            <table class="tbl dense" id="fs-inst-t">
              <thead>
                <tr>
                  <th>Instalment</th>
                  <th>Due</th>
                  <th class="r">Share</th>
                  <th class="r">Amount</th>
                  @if (optional()) {
                    <th class="r">With optional</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (x of v().instalments; track x.seq; let i = $index) {
                  <tr>
                    <td>{{ x.label }}</td>
                    <td>{{ date(x.dueDate) }}</td>
                    <td class="r t-num">{{ x.share }}%</td>
                    <td class="r"><rp-amt [value]="x.amount" /></td>
                    @if (optional()) {
                      <td class="r"><rp-amt [value]="withOptional()[i]!" /></td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>

          @if (s.versions.length > 1) {
            <div class="sec-h"><h3>Versions</h3></div>
            <div class="tbl-wrap">
              <table class="tbl dense" id="fs-versions">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Status</th>
                    <th class="r">Total</th>
                    <th>Approved</th>
                  </tr>
                </thead>
                <tbody>
                  @for (x of s.versions; track x.no) {
                    <tr>
                      <td class="t-num">{{ x.no }}</td>
                      <td>
                        <span [class]="'chip dot tone-' + stateOf(x.state).tone">{{
                          stateOf(x.state).l()
                        }}</span>
                      </td>
                      <td class="r"><rp-amt [value]="x.total" /></td>
                      <td>{{ x.activatedAt ? date(x.activatedAt) : '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }

          <div class="sec-h"><h3>Approval</h3></div>
          <div class="tl">
            @for (st of steps(); track st.t) {
              <div class="tl-i" [class.done]="st.state === 'done'" [class.now]="st.state === 'now'">
                <span class="tl-dot"><rp-icon [name]="st.icon" [size]="13" [stroke]="2.6" /></span>
                <div class="tl-c">
                  <div class="tl-t">{{ st.t }}</div>
                  @if (st.s) {
                    <div class="tl-s">{{ st.s }}</div>
                  }
                </div>
              </div>
            }
          </div>

          <div class="sec-h"><h3>Assignment</h3></div>
          @if (s.assigned.records) {
            <dl class="kv">
              <dt>Fee records created</dt>
              <dd>{{ num(s.assigned.records) }}</dd>
              <dt>Students</dt>
              <dd>{{ num(s.assigned.students) }}</dd>
            </dl>
          } @else {
            <p class="t-sm t-muted">Not assigned to students yet.</p>
          }
        </div>
      </div>

      <div modal-foot class="row g8">
        @if (editWhy()) {
          <span class="cp-why" [attr.title]="editWhy()"
            ><button type="button" class="btn btn-sec" disabled>
              <rp-icon name="edit" [size]="17" /><span>{{ editLabel() }}</span>
            </button></span
          >
        } @else {
          <button type="button" class="btn btn-sec" id="fs-edit" (click)="edit.emit()">
            <rp-icon name="edit" [size]="17" /><span>{{ editLabel() }}</span>
          </button>
        }
        @if (s.status === 'DRAFT') {
          @if (readOnly()) {
            <span class="cp-why" [attr.title]="readOnly()"
              ><button type="button" class="btn btn-soft" disabled>
                <rp-icon name="send" [size]="17" /><span>Submit for approval</span>
              </button></span
            >
          } @else {
            <button
              type="button"
              class="btn btn-soft"
              id="fs-send"
              [class.is-busy]="busy()"
              [disabled]="busy()"
              (click)="send.emit()"
            >
              <rp-icon name="send" [size]="17" /><span>Submit for approval</span>
            </button>
          }
        }
        @if (assignWhy()) {
          <span class="cp-why" [attr.title]="assignWhy()"
            ><button type="button" class="btn btn-pri" disabled>
              <rp-icon name="users" [size]="17" /><span>Assign to classes</span>
            </button></span
          >
        } @else {
          <button type="button" class="btn btn-pri" id="fs-assign" (click)="assign.emit()">
            <rp-icon name="users" [size]="17" /><span>Assign to classes</span>
          </button>
        }
      </div>
    </rp-modal>
  `,
})
export class FeeStructureDrawer {
  readonly structure = input.required<FeeStructure>();
  /** Why the structure can't be changed here (read-only role, no fees.edit); '' when it can. */
  readonly readOnly = input('');
  readonly busy = input(false);
  readonly closed = output<void>();
  readonly edit = output<void>();
  readonly send = output<void>();
  readonly assign = output<void>();

  protected readonly v = computed(() => this.structure().current);
  protected readonly state = computed(() => this.stateOf(this.structure().status));
  protected readonly classes = computed(() => classList(this.v().classes));
  protected readonly optional = computed(() => paiseOf(this.v().optional) > 0);
  protected readonly editLabel = computed(() =>
    this.structure().status === 'ACTIVE' ? 'Edit (needs re-approval)' : 'Edit',
  );
  protected readonly editWhy = computed(
    () =>
      this.readOnly() ||
      (this.structure().status === 'PENDING' ? translate('FEE.STRUCTURE_LOCKED') : ''),
  );
  /** An approved version is assigned (also while a newer draft of it is open). */
  protected readonly assignWhy = computed(
    () =>
      this.readOnly() ||
      (this.structure().status === 'ACTIVE' || this.structure().active
        ? ''
        : translate('FEE.STRUCTURE_NOT_APPROVED')),
  );
  /** Each instalment with the optional heads' parts added (the same formula as the server). */
  protected readonly withOptional = computed(() => {
    const v = this.v();
    const bps = v.instalments.map((x) => shareBp(x.share) ?? 0);
    const parts = v.heads.filter((h) => h.optional).map((h) => headParts(paiseOf(h.amount), bps));
    return v.instalments.map((x, i) =>
      money(paiseOf(x.amount) + parts.reduce((a, p) => a + (p[i] ?? 0), 0)),
    );
  });
  protected readonly steps = computed<Step[]>(() => {
    const v = this.v();
    const s = this.structure();
    const out: Step[] = [{ t: 'Created', s: this.when(v.createdAt), state: 'done', icon: 'check' }];
    out.push(
      v.submittedAt
        ? {
            t: `Submitted for approval${v.approval ? ` · ${v.approval.no}` : ''}`,
            s: this.when(v.submittedAt),
            state: 'done',
            icon: 'check',
          }
        : {
            t: 'Not yet submitted',
            s: 'Drafts are visible only in the console',
            state: 'now',
            icon: 'dot',
          },
    );
    if (s.status === 'ACTIVE' || v.activatedAt) {
      out.push({
        t: 'Approved',
        s: v.activatedAt ? this.when(v.activatedAt) : '',
        state: 'done',
        icon: 'checkc',
      });
    } else if (s.status === 'PENDING') {
      out.push({
        t: 'Waiting for a checker',
        s: 'A different person must approve it (maker-checker)',
        state: 'now',
        icon: 'dot',
      });
    }
    return out;
  });

  protected stateOf(s: FeeStructure['status'] | StructureVersion['state']) {
    return STRUCTURE_STATE[s];
  }
  /** Who uses an optional head (prototype: transport users, hostel students, opt-in). */
  protected optionalFor(name: string) {
    return name === 'Transport'
      ? 'Optional · transport users'
      : name === 'Hostel'
        ? 'Optional · hostel students'
        : 'Optional · opt-in';
  }
  protected inr(m: { amount: string }) {
    return formatInr(paiseOf(m));
  }
  protected date(d: string) {
    return formatDate(d);
  }
  protected when(d: string) {
    return formatDateTime(d);
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
}
