import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, Kpi } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { ago } from '../../../Utils/dates';
import { formatDate, formatDateTime, istBusinessDate, titleCase } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import {
  addDays,
  inr,
  inrPaise,
  paiseOf,
  plural,
  refusal,
  samePerson,
  sumOf,
} from '../Settlements/settlement-format';
import { MismatchResolve } from './MismatchResolve';
import { ChargebackComplete, ReconNew } from './ReconForms';
import { StatementUpload, StatementView } from './StatementUpload';
import {
  CHARGEBACK_TONE,
  DEFAULT_LAYOUTS,
  MISMATCH_KIND,
  MISMATCH_KINDS,
  PLATFORM_TYPE,
  REFUND_SOURCE,
  REFUND_TONE,
  RESOLUTION,
  STATEMENT,
  STATEMENT_KINDS,
  chargebackStatus,
  difference,
  mismatchStatus,
  reasonLabel,
  refundStatus,
  signed,
  signedPaise,
} from './recon-format';
import {
  ReconApi,
  type BalanceCheck,
  type Chargeback,
  type Layouts,
  type Mismatch,
  type MismatchKind,
  type MisRow,
  type Pool,
  type Refund,
  type Statement,
  type StatementKind,
} from './recon.api';

type Tab = 'mismatches' | 'uploads' | 'refunds' | 'chargebacks' | 'pool' | 'snaps' | 'mis';
const PAGE = 12;
/** Days of closing balances in the daily snapshots (yesterday back). */
const SNAP_DAYS = 7;

interface Snap {
  readonly day: string;
  readonly opening: number | null;
  readonly closing: number | null;
  readonly ledger: number;
}

/**
 * o.recon — Reconciliation (SRS 15; REC-001…012, REC-018/019; prototype o.recon): the key figures,
 * then the mismatches found by statement uploads and their resolution, the uploads with the three
 * statement layouts, refunds (requested by one officer, processed by another), chargebacks, the pool
 * balances against the wallets, the daily closing balances against the ledger, and the MIS.
 */
@Component({
  selector: 'rp-backoffice-recon',
  imports: [
    ChargebackComplete,
    Empty,
    Icon,
    Kpi,
    MismatchResolve,
    NgTemplateOutlet,
    Pager,
    ReconNew,
    StatementUpload,
    StatementView,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <div class="c-ph">
        <div class="c-pt">
          <h1>Reconciliation</h1>
          <p>
            Match external statements to platform transactions, resolve mismatches, and keep pool
            accounts equal to wallet balances.
          </p>
        </div>
        <div class="c-pa">
          <span class="cp-why" [attr.title]="can('recon.upload') ? null : why('recon.upload')"
            ><button
              type="button"
              class="btn btn-pri"
              id="ob-rec-up"
              [disabled]="!can('recon.upload')"
              (click)="openUpload()"
            >
              <rp-icon name="upload" [size]="17" /><span>Upload statement</span>
            </button></span
          >
        </div>
      </div>

      @if (error()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load reconciliation" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="reload()">
              <span>Try again</span>
            </button>
          </rp-empty>
        </div>
      } @else if (!loaded()) {
        <div class="stack g16" aria-busy="true" aria-label="Loading">
          <div class="c-grid k4">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="sk" style="height: 104px; border-radius: 16px"></div>
            }
          </div>
          <div class="sk" style="height: 44px; border-radius: 12px"></div>
          <div class="stack g8">
            @for (i of [1, 2, 3, 4, 5, 6, 7]; track i) {
              <div class="sk" style="height: 40px; border-radius: 8px"></div>
            }
          </div>
        </div>
      } @else {
        <div class="c-grid k4">
          <rp-kpi
            label="Open mismatches"
            [value]="num(openMismatches().length)"
            icon="scale"
            [tone]="openMismatches().length ? 'warn' : 'ok'"
            [delta]="num(mismatches().length - openMismatches().length) + ' resolved'"
          />
          <rp-kpi
            label="Refunds pending"
            [value]="num(pendingRefunds().length)"
            icon="undo"
            [delta]="total(pendingRefunds())"
          />
          <rp-kpi
            label="Chargebacks raised"
            [value]="num(raised().length)"
            icon="alert"
            [tone]="raised().length ? 'bad' : null"
            [delta]="
              awaiting().length
                ? plural(awaiting().length, 'case') + ' awaiting the outcome'
                : 'Accept or dispute each one'
            "
          />
          <rp-kpi
            label="Last statement"
            [value]="last() ? since(last()!.uploadedAt) : '—'"
            icon="upload"
            [delta]="
              last() ? label(last()!.kind) + ' · ' + num(last()!.matched) + ' rows matched' : ''
            "
          />
        </div>

        <div class="tabs" role="tablist" aria-label="Reconciliation">
          @for (t of tabs(); track t.v) {
            <button
              type="button"
              class="tab"
              role="tab"
              [class.on]="tab() === t.v"
              [attr.aria-selected]="tab() === t.v"
              (click)="go(t.v)"
            >
              {{ t.l }}
              @if (t.n !== null) {
                <span class="n">{{ t.n }}</span>
              }
            </button>
          }
        </div>

        @switch (tab()) {
          @case ('mismatches') {
            <div class="c-filters">
              <div class="pills" role="group" aria-label="Status">
                @for (p of mmPills; track p) {
                  <button
                    type="button"
                    class="pill"
                    [class.on]="mst() === p"
                    [attr.aria-pressed]="mst() === p"
                    (click)="mst.set(p); page.set(1)"
                  >
                    {{ p === 'ALL' ? 'All' : mmStatus(p) }}<span class="n">{{ mmCount(p) }}</span>
                  </button>
                }
              </div>
              <div class="fld">
                <div class="fld-in">
                  <select
                    id="ob-mk"
                    aria-label="Kind"
                    (change)="mk.set(value($event)); page.set(1)"
                  >
                    <option value="">Every kind</option>
                    @for (k of mmKinds; track k) {
                      <option [value]="k" [selected]="mk() === k">{{ kind(k).l }}</option>
                    }
                  </select>
                </div>
              </div>
              @if (statementFilter(); as s) {
                <span class="tag"
                  >{{ s.fileName }}
                  <button
                    type="button"
                    class="linkbtn"
                    aria-label="Show every statement"
                    (click)="stmt.set(null)"
                  >
                    <rp-icon name="x" [size]="12" /></button
                ></span>
              }
            </div>
            <div class="tbl-wrap">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>Mismatch</th>
                    <th>Transaction</th>
                    <th>Kind</th>
                    <th>Platform</th>
                    <th>Statement</th>
                    <th class="r">Difference</th>
                    <th>Found in</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (m of pageOf(mmRows()); track m.id) {
                    <tr tabindex="0" (click)="resolving.set(m)" (keydown.enter)="resolving.set(m)">
                      <td>
                        <div class="stack g4" style="gap: 1px">
                          <span class="cell-t"
                            ><span class="t-mono">{{
                              m.statement.key ?? m.platform?.reference ?? '—'
                            }}</span></span
                          ><span class="cell-s">{{ dt(m.createdAt) }}</span>
                        </div>
                      </td>
                      <td>
                        <div class="stack g4" style="gap: 1px">
                          <span class="cell-t">
                            @if (m.platform?.reference; as r) {
                              <span
                                class="t-mono t-clip"
                                style="max-width: 190px; display: inline-block; vertical-align: bottom"
                                [attr.title]="r"
                                >{{ r }}</span
                              >
                            } @else {
                              <span class="t-muted">—</span>
                            }
                          </span>
                          <span class="cell-s">{{
                            m.institution?.name ?? 'Institution not identified'
                          }}</span>
                        </div>
                      </td>
                      <td>
                        <span [class]="'chip tone-' + kind(m.kind).tone">{{ kind(m.kind).l }}</span>
                      </td>
                      <td>
                        @if (m.platform; as p) {
                          <div class="stack g4" style="gap: 1px">
                            <span class="cell-t">{{ p.amount ? money(p.amount) : '—' }}</span
                            ><span class="cell-s">{{ platformType(p.type) }}</span>
                          </div>
                        } @else {
                          <span class="t-muted">Not on platform</span>
                        }
                      </td>
                      <td>
                        @if (m.statement.amount; as a) {
                          <div class="stack g4" style="gap: 1px">
                            <span class="cell-t">{{ money(a) }}</span
                            ><span class="cell-s">{{ outcome(m.statement.status) }}</span>
                          </div>
                        } @else {
                          <span class="t-muted">Not in statement</span>
                        }
                      </td>
                      <td class="r">
                        @if (diff(m); as d) {
                          <b class="t-warn">{{ d }}</b>
                        } @else if (m.kind === 'STATUS') {
                          <span class="t-muted">status only</span>
                        } @else {
                          —
                        }
                      </td>
                      <td>
                        <div class="stack g4" style="gap: 1px">
                          <span
                            class="cell-t t-clip"
                            style="max-width: 120px; display: block"
                            [attr.title]="m.statement.fileName"
                            >{{ m.statement.fileName }}</span
                          ><span class="cell-s">{{
                            m.statement.rowNo ? 'row ' + m.statement.rowNo : label(m.statement.kind)
                          }}</span>
                        </div>
                      </td>
                      <td>
                        <div class="stack" style="gap: 2px; align-items: flex-start">
                          <span
                            class="chip dot"
                            [class]="m.status === 'OPEN' ? 'tone-warn' : 'tone-ok'"
                            >{{ mmStatus(m.status) }}</span
                          >
                          @if (m.resolution) {
                            <span class="cell-s">{{ resolution(m.resolution) }}</span>
                          }
                        </div>
                      </td>
                      <td>
                        @if (m.status === 'OPEN') {
                          <div class="row-acts">
                            <button
                              type="button"
                              class="btn btn-soft btn-xs"
                              [disabled]="!can('recon.resolve')"
                              [attr.title]="can('recon.resolve') ? null : why('recon.resolve')"
                              (click)="$event.stopPropagation(); resolving.set(m)"
                            >
                              <span>Resolve</span>
                            </button>
                          </div>
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="9">
                        <rp-empty
                          icon="checkc"
                          [title]="mst() === 'OPEN' ? 'No open mismatches' : 'No mismatches'"
                          [text]="
                            uploads().length
                              ? 'Every uploaded row matched a platform transaction.'
                              : 'Upload a bank or gateway statement to check it against the platform.'
                          "
                        />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <ng-container
              *ngTemplateOutlet="pagerT; context: { n: mmRows().length, w: 'mismatch' }"
            />
            <div class="note tone-info">
              <rp-icon name="info" [size]="17" />
              <div class="grow">
                A mismatch is resolved with remarks — explained, adjusted, or by requesting a refund
                or raising a chargeback. Money moves only when that request is decided, through the
                ledger; a refund or chargeback taken from a merchant already settled is deducted in
                its next settlement.
              </div>
            </div>
          }
          @case ('uploads') {
            <div class="c-grid k3">
              @for (k of kinds; track k) {
                <div class="card pad ob-stype">
                  <div class="row g8">
                    <rp-icon [name]="statementOf(k).icon" [size]="18" /><b class="t-sm">{{
                      statementOf(k).l
                    }}</b>
                  </div>
                  <p class="t-xs t-muted mt8">
                    <b>Mandatory:</b> {{ layouts()[k].required.join(', ') }}
                  </p>
                  @if (optionalOf(k).length) {
                    <p class="t-xs t-muted">Optional: {{ optionalOf(k).join(', ') }}</p>
                  }
                  <button
                    type="button"
                    class="btn btn-soft btn-xs"
                    [disabled]="!can('recon.upload')"
                    (click)="openUpload(k)"
                  >
                    <rp-icon name="upload" [size]="15" /><span>Upload</span>
                  </button>
                </div>
              }
            </div>
            <div class="tbl-wrap">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>Upload</th>
                    <th>Statement</th>
                    <th class="r">Rows</th>
                    <th class="r">Matched</th>
                    <th class="r">Rows differing</th>
                    <th class="r">Mismatches</th>
                    <th>Result</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  @for (u of pageOf(uploads()); track u.id) {
                    <tr tabindex="0" (click)="viewing.set(u)" (keydown.enter)="viewing.set(u)">
                      <td>
                        <div class="stack g4" style="gap: 1px">
                          <span class="cell-t t-clip" style="max-width: 220px; display: block">{{
                            u.fileName
                          }}</span
                          ><span class="cell-s">{{ dt(u.uploadedAt) }}</span>
                        </div>
                      </td>
                      <td>
                        <div class="stack g4" style="gap: 1px">
                          <span class="cell-t">{{ label(u.kind) }}</span
                          ><span class="cell-s">{{ period(u) }}</span>
                        </div>
                      </td>
                      <td class="r">{{ num(u.rows) }}</td>
                      <td class="r">{{ num(u.matched) }}</td>
                      <td class="r">
                        @if (u.mismatchedRows) {
                          <b class="t-bad">{{ num(u.mismatchedRows) }}</b>
                        } @else {
                          0
                        }
                      </td>
                      <td class="r">{{ num(u.mismatches) }}</td>
                      <td>
                        <div class="stack" style="gap: 2px; align-items: flex-start">
                          <span class="chip dot tone-ok">Completed</span>
                          @if (u.openMismatches) {
                            <span class="cell-s"
                              >{{ plural(u.openMismatches, 'mismatch') }} open</span
                            >
                          }
                        </div>
                      </td>
                      <td>{{ u.uploadedBy ?? '—' }}</td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="8">
                        <rp-empty
                          icon="upload"
                          title="No statements uploaded yet"
                          text="Upload the sponsor bank's credit statement, the payout bank's statement or the gateway's statement as CSV. A file is taken whole or not at all."
                        />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <ng-container
              *ngTemplateOutlet="pagerT; context: { n: uploads().length, w: 'upload' }"
            />
          }
          @case ('refunds') {
            <div class="c-filters">
              <span class="fsum" style="margin-left: 0"
                >Requested by one officer, processed or rejected by another</span
              >
              <button
                type="button"
                class="btn btn-sec btn-sm"
                style="margin-left: auto"
                [disabled]="!can('recon.resolve')"
                (click)="creating.set('refund')"
              >
                <rp-icon name="plus" [size]="15" /><span>Request a refund</span>
              </button>
            </div>
            <div class="tbl-wrap">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>Requested</th>
                    <th>Original transaction</th>
                    <th class="r">Amount</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of pageOf(refunds()); track r.id) {
                    <tr>
                      <td>
                        <div class="stack g4" style="gap: 1px">
                          <span class="cell-t">{{ dt(r.requested.at) }}</span
                          ><span class="cell-s">{{ r.institution.name }}</span>
                        </div>
                      </td>
                      <td>
                        <div class="stack g4" style="gap: 1px">
                          <span class="cell-t"
                            ><span
                              class="t-mono t-clip"
                              style="max-width: 230px; display: inline-block; vertical-align: bottom"
                              [attr.title]="r.originalReference"
                              >{{ r.originalReference }}</span
                            ></span
                          ><span class="cell-s">{{ r.from.name }} → {{ r.to.name }}</span>
                        </div>
                      </td>
                      <td class="r">
                        <b class="t-num">{{ money(r.amount) }}</b>
                      </td>
                      <td style="min-width: 200px; white-space: normal">
                        <div class="stack g4" style="gap: 1px">
                          <span class="t-sm">{{ r.reason }}</span
                          ><span class="cell-s"
                            >{{ source(r.source)
                            }}{{ r.requested.by ? ' · ' + r.requested.by : '' }}</span
                          >
                        </div>
                      </td>
                      <td>
                        <div class="stack" style="gap: 2px; align-items: flex-start">
                          <span [class]="'chip dot tone-' + refundTone(r)">{{
                            refundLabel(r)
                          }}</span>
                          @if (r.refundReference) {
                            <span class="cell-s t-mono">{{ r.refundReference }}</span>
                          } @else if (r.status === 'REQUESTED') {
                            <span class="cell-s">ledger refund not yet posted</span>
                          } @else if (r.decided?.remarks; as dr) {
                            <span class="cell-s">{{ dr }}</span>
                          }
                        </div>
                      </td>
                      <td>
                        @if (r.status === 'REQUESTED') {
                          <div class="row-acts">
                            <button
                              type="button"
                              class="btn btn-soft btn-xs"
                              [disabled]="!!refundWhy(r)"
                              [attr.title]="refundWhy(r) || null"
                              (click)="decideRefund(r, 'PROCESS')"
                            >
                              <span>Mark processed</span>
                            </button>
                            <button
                              type="button"
                              class="btn btn-ghost btn-xs"
                              [disabled]="!!refundWhy(r)"
                              [attr.title]="refundWhy(r) || null"
                              (click)="decideRefund(r, 'REJECT')"
                            >
                              <span>Reject</span>
                            </button>
                          </div>
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="6">
                        <rp-empty
                          icon="undo"
                          title="No refunds"
                          text="Refunds are requested from a mismatch, a grievance or here, and posted when another officer processes them."
                        />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <ng-container
              *ngTemplateOutlet="pagerT; context: { n: refunds().length, w: 'refund' }"
            />
            <div class="note tone-info">
              <rp-icon name="info" [size]="17" />
              <div class="grow">
                Processing posts a ledger refund — the wallet that was credited pays the payer back
                — and tells the payer. The original transaction is never changed.
              </div>
            </div>
          }
          @case ('chargebacks') {
            <div class="c-filters">
              <span class="fsum" style="margin-left: 0"
                >Raised → accepted or disputed → completed</span
              >
              <button
                type="button"
                class="btn btn-sec btn-sm"
                style="margin-left: auto"
                [disabled]="!can('recon.chargeback')"
                (click)="creating.set('chargeback')"
              >
                <rp-icon name="plus" [size]="15" /><span>Raise a chargeback</span>
              </button>
            </div>
            <div class="tbl-wrap">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Transaction</th>
                    <th class="r">Amount</th>
                    <th>Type · code</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (c of pageOf(chargebacks()); track c.id) {
                    <tr>
                      <td>
                        <div class="stack g4" style="gap: 1px">
                          <span class="cell-t">{{ dt(c.raised.at) }}</span
                          ><span class="cell-s">raised by {{ c.raised.by ?? '—' }}</span>
                        </div>
                      </td>
                      <td>
                        <div class="stack g4" style="gap: 1px">
                          <span class="cell-t"
                            ><span
                              class="t-mono t-clip"
                              style="max-width: 230px; display: inline-block; vertical-align: bottom"
                              [attr.title]="c.originalReference"
                              >{{ c.originalReference }}</span
                            ></span
                          ><span class="cell-s"
                            >{{ c.institution.name }} · {{ c.wallet.name }}</span
                          >
                        </div>
                      </td>
                      <td class="r">
                        <b class="t-num">{{ money(c.amount) }}</b>
                      </td>
                      <td>
                        <div class="stack g4" style="gap: 1px">
                          <span class="cell-t">{{ reason(c.reasonCode) ?? 'Chargeback' }}</span
                          ><span class="cell-s">Reason code {{ c.reasonCode }}</span>
                        </div>
                      </td>
                      <td>
                        <div class="stack" style="gap: 2px; align-items: flex-start">
                          <span [class]="'chip dot tone-' + cbTone(c)">{{ cbLabel(c) }}</span>
                          @if (c.status === 'COMPLETED') {
                            <span class="cell-s"
                              >{{
                                c.outcome === 'REVERSED'
                                  ? 'reversed' +
                                    (c.reversalReference ? ' · ' + c.reversalReference : '')
                                  : 'upheld — nothing moved'
                              }}{{ c.completed?.at ? ' · ' + date(c.completed!.at!) : '' }}</span
                            >
                          } @else if (c.remarks) {
                            <span
                              class="cell-s t-clip"
                              style="max-width: 220px; display: block"
                              [attr.title]="c.remarks"
                              >{{ c.remarks }}</span
                            >
                          }
                        </div>
                      </td>
                      <td>
                        <div class="row-acts">
                          @if (c.status === 'RAISED') {
                            <button
                              type="button"
                              class="btn btn-soft btn-xs"
                              [disabled]="!can('recon.chargeback')"
                              (click)="decideChargeback(c, 'ACCEPT')"
                            >
                              <span>Accept</span>
                            </button>
                            <button
                              type="button"
                              class="btn btn-ghost btn-xs"
                              [disabled]="!can('recon.chargeback')"
                              (click)="decideChargeback(c, 'DISPUTE')"
                            >
                              <span>Dispute</span>
                            </button>
                          } @else if (c.status === 'ACCEPTED' || c.status === 'DISPUTED') {
                            <button
                              type="button"
                              class="btn btn-soft btn-xs"
                              [disabled]="!can('recon.chargeback')"
                              (click)="completing.set(c)"
                            >
                              <span>Record completion</span>
                            </button>
                          }
                        </div>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="6">
                        <rp-empty
                          icon="alert"
                          title="No chargebacks"
                          text="A chargeback is raised from a mismatch or here, against a movement that credited a wallet."
                        />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <ng-container
              *ngTemplateOutlet="pagerT; context: { n: chargebacks().length, w: 'chargeback' }"
            />
            <div class="note tone-info">
              <rp-icon name="info" [size]="17" />
              <div class="grow">
                Chargebacks move from <b>Raised</b> to <b>Accepted</b> or <b>Disputed</b>, then to
                <b>Completed</b> when the scheme’s outcome arrives: reversed — the credited wallet
                is debited to the chargeback clearing account — or upheld, when nothing moves.
              </div>
            </div>
          }
          @case ('pool') {
            <div class="c-filters">
              <div class="fld">
                <div class="fld-in">
                  <input
                    id="ob-pool-d"
                    type="date"
                    aria-label="As of"
                    [max]="today"
                    [value]="poolDate()"
                    (change)="setPoolDate($event)"
                  />
                </div>
              </div>
              <span class="fsum">{{
                poolDate() === today
                  ? 'Now · stored wallet balances'
                  : 'Closing balances of ' + date(poolDate())
              }}</span>
            </div>
            @if (poolError()) {
              <div class="card pad">
                <rp-empty
                  icon="alertc"
                  title="Couldn't load the pool balances"
                  [text]="poolError()"
                />
              </div>
            } @else {
              <div class="tbl-wrap">
                <table class="tbl">
                  <thead>
                    <tr>
                      <th>Institution</th>
                      <th class="r">Sum of wallet balances</th>
                      <th class="r">Platform accounts</th>
                      <th class="r">Funds in pool account</th>
                      <th class="r">Difference</th>
                      <th>Explanation</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (p of pools(); track p.institution.id) {
                      <tr>
                        <td>
                          <div class="stack g4" style="gap: 1px">
                            <span class="cell-t">{{ p.institution.name }}</span
                            ><span class="cell-s"
                              >received {{ signed(p.received) }} · paid out
                              {{ signed(p.paidOut) }}</span
                            >
                          </div>
                        </td>
                        <td class="r">
                          @if (p.wallets; as w) {
                            {{ signed(w) }}
                          } @else {
                            <span class="t-muted" title="No roll-over that day">—</span>
                          }
                        </td>
                        <td class="r">
                          <span [attr.title]="others(p) || null">{{ otherSum(p) }}</span>
                        </td>
                        <td class="r">{{ signed(p.poolExpected) }}</td>
                        <td class="r">
                          @if (signedPaise(p.difference)) {
                            <b class="t-warn">{{ signed(p.difference) }}</b>
                          } @else {
                            <span class="t-ok"
                              ><rp-icon name="check" [size]="13" /> {{ zero }}</span
                            >
                          }
                        </td>
                        <td>
                          @if (signedPaise(p.difference)) {
                            <span class="t-sm"
                              >Stored balances differ from the ledger — investigate; never corrected
                              automatically</span
                            >
                          } @else {
                            <span class="t-muted">Balanced</span>
                          }
                        </td>
                      </tr>
                    } @empty {
                      <tr>
                        <td colspan="6">
                          <rp-empty icon="database" title="No institutions" />
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
            <div class="note tone-info">
              <rp-icon name="info" [size]="17" />
              <div class="grow">
                The pool account holds the money behind every campus and allowance wallet of an
                institution: what it received, less payouts and chargebacks, per the ledger. A
                difference must be explained — never silently corrected. The bank’s own balance is
                compared once its balance feed is connected.
              </div>
            </div>
          }
          @case ('snaps') {
            <div class="c-filters">
              <div class="fld">
                <div class="fld-in">
                  <select id="ob-sn" aria-label="Institution" (change)="setSnapInst($event)">
                    @for (i of institutions(); track i.id) {
                      <option [value]="i.id" [selected]="snapInst() === i.id">{{ i.name }}</option>
                    }
                  </select>
                </div>
              </div>
              <span class="fsum">From the nightly 23:30 roll-over</span>
            </div>
            @if (snapError()) {
              <div class="card pad">
                <rp-empty
                  icon="alertc"
                  title="Couldn't load the closing balances"
                  [text]="snapError()"
                />
              </div>
            } @else {
              <div class="tbl-wrap">
                <table class="tbl">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th class="r">Opening</th>
                      <th class="r">Closing (stored)</th>
                      <th class="r">Ledger-derived</th>
                      <th class="r">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of snaps(); track r.day) {
                      <tr>
                        <td>{{ date(r.day) }}</td>
                        <td class="r">{{ r.opening === null ? '—' : paise(r.opening) }}</td>
                        <td class="r">
                          @if (r.closing === null) {
                            <span class="t-muted" title="The roll-over didn't run that day"
                              >No roll-over</span
                            >
                          } @else {
                            <b>{{ paise(r.closing) }}</b>
                          }
                        </td>
                        <td class="r">{{ paise(r.ledger) }}</td>
                        <td class="r">
                          @if (r.closing !== null && r.closing !== r.ledger) {
                            <b class="t-bad">{{ paise(r.ledger - r.closing) }}</b>
                          } @else if (r.closing !== null) {
                            <span class="t-ok"><rp-icon name="check" [size]="13" /></span>
                          } @else {
                            —
                          }
                        </td>
                      </tr>
                    } @empty {
                      <tr>
                        <td colspan="5"><rp-empty icon="hourglass" title="Loading…" /></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
            @if (check(); as c) {
              @if (c.differences.length) {
                <div class="note tone-warn">
                  <rp-icon name="alert" [size]="17" />
                  <div class="grow">
                    <b>{{ plural(c.differences.length, 'wallet') }}</b> differ from the ledger:
                    @for (d of c.differences.slice(0, 5); track d.walletId; let lst = $last) {
                      {{ d.walletNo }} stored {{ money(d.stored) }}, ledger-derived
                      {{ d.ledgerNegative ? '−' : '' }}{{ money(d.ledger) }}{{ lst ? '' : ';' }}
                    }
                    . Investigate; the stored balance is not corrected automatically.
                  </div>
                </div>
              } @else {
                <div class="note tone-ok">
                  <rp-icon name="checkc" [size]="17" />
                  <div class="grow">
                    Every wallet’s stored balance equals its ledger-derived balance ({{
                      plural(c.checked, 'wallet')
                    }}
                    checked {{ since(c.checkedAt) }}).
                  </div>
                </div>
              }
            }
          }
          @case ('mis') {
            <div class="c-filters">
              <div class="ob-drange">
                <div class="fld">
                  <div class="fld-in">
                    <input
                      id="ob-misf"
                      type="date"
                      aria-label="From"
                      [max]="today"
                      [value]="misFrom()"
                      (change)="setMis('from', $event)"
                    />
                  </div>
                </div>
                <span class="t-muted">to</span>
                <div class="fld">
                  <div class="fld-in">
                    <input
                      id="ob-mist"
                      type="date"
                      aria-label="To"
                      [max]="today"
                      [value]="misTo()"
                      (change)="setMis('to', $event)"
                    />
                  </div>
                </div>
              </div>
              <span class="fsum"
                >By institution · transactions by status, collections, credits, settlements</span
              >
            </div>
            @if (misError()) {
              <div class="note tone-bad">
                <rp-icon name="alertc" [size]="17" />
                <div class="grow">{{ misError() }}</div>
              </div>
            } @else {
              <div class="tbl-wrap">
                <table class="tbl dense">
                  <thead>
                    <tr>
                      <th>Institution</th>
                      <th class="r">Successful</th>
                      <th class="r">Failed</th>
                      <th class="r">Pending</th>
                      <th class="r">Merchant collections</th>
                      <th class="r">Bank credits</th>
                      <th class="r">Settled (net)</th>
                      <th class="r">Paid out</th>
                      <th class="r">Refunds</th>
                      <th class="r">Chargebacks</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of mis(); track r.institution.id) {
                      <tr>
                        <td>{{ r.institution.name }}</td>
                        <td class="r">
                          {{ money(r.transactions.success.amount)
                          }}<span class="cell-s" style="display: block">{{
                            num(r.transactions.success.count)
                          }}</span>
                        </td>
                        <td class="r">
                          {{ money(r.transactions.failure.amount)
                          }}<span class="cell-s" style="display: block">{{
                            num(r.transactions.failure.count)
                          }}</span>
                        </td>
                        <td class="r">
                          {{ money(r.transactions.pending.amount)
                          }}<span class="cell-s" style="display: block">{{
                            num(r.transactions.pending.count)
                          }}</span>
                        </td>
                        <td class="r">
                          {{ money(r.merchantCollections.amount)
                          }}<span class="cell-s" style="display: block">{{
                            num(r.merchantCollections.count)
                          }}</span>
                        </td>
                        <td class="r">
                          {{ money(r.bankCredits.amount)
                          }}<span class="cell-s" style="display: block">{{
                            num(r.bankCredits.count)
                          }}</span>
                        </td>
                        <td class="r">
                          {{ money(r.settlements.net)
                          }}<span class="cell-s" style="display: block">{{
                            plural(r.settlements.count, 'settlement')
                          }}</span>
                        </td>
                        <td class="r">{{ money(r.settlements.paidOut) }}</td>
                        <td class="r">
                          {{ money(r.refunds.amount)
                          }}<span class="cell-s" style="display: block">{{
                            num(r.refunds.count)
                          }}</span>
                        </td>
                        <td class="r">
                          {{ money(r.chargebacks.amount)
                          }}<span class="cell-s" style="display: block">{{
                            num(r.chargebacks.count)
                          }}</span>
                        </td>
                      </tr>
                    } @empty {
                      <tr>
                        <td colspan="10">
                          <rp-empty icon="chart" title="Nothing in this range" />
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          }
        }
      }
    </div>

    <ng-template #pagerT let-n="n" let-w="w">
      @if (n > pageSize) {
        <rp-pager [total]="n" [page]="page()" [size]="pageSize" (go)="page.set($event)" />
      } @else if (n) {
        <div class="pager">
          <span>{{ plural(n, w) }}</span>
        </div>
      }
    </ng-template>

    @if (uploading(); as k) {
      <rp-rec-upload
        [layouts]="layouts()"
        [preset]="k"
        (closed)="uploading.set(null)"
        (uploaded)="reload()"
        (review)="review($event)"
      />
    }
    @if (resolving(); as m) {
      <rp-rec-resolve
        [m]="m"
        [canResolve]="can('recon.resolve')"
        [canChargeback]="true"
        [why]="why('recon.resolve')"
        (closed)="resolving.set(null)"
        (resolved)="resolved($event)"
        (stale)="resolving.set(null); reload()"
      />
    }
    @if (viewing(); as u) {
      <rp-rec-statement [u]="u" (closed)="viewing.set(null)" (review)="review($event)" />
    }
    @if (creating(); as k) {
      <rp-rec-new [kind]="k" (closed)="creating.set(null)" (created)="created(k)" />
    }
    @if (completing(); as c) {
      <rp-rec-cb-complete
        [c]="c"
        (closed)="completing.set(null)"
        (completed)="completed($event)"
        (stale)="completing.set(null); reload()"
      />
    }
  `,
})
export class BackofficeRecon {
  private readonly api = inject(ReconApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).ops;

  protected readonly pageSize = PAGE;
  protected readonly today = istBusinessDate();
  protected readonly kinds = STATEMENT_KINDS;
  protected readonly mmKinds = MISMATCH_KINDS;
  protected readonly mmPills = ['OPEN', 'RESOLVED', 'ALL'] as const;
  protected readonly zero = inrPaise(0);

  protected readonly loaded = signal(false);
  protected readonly error = signal('');
  protected readonly tab = signal<Tab>('mismatches');
  protected readonly page = signal(1);

  protected readonly uploads = signal<readonly Statement[]>([]);
  protected readonly layouts = signal<Layouts>(DEFAULT_LAYOUTS);
  protected readonly mismatches = signal<readonly Mismatch[]>([]);
  protected readonly refunds = signal<readonly Refund[]>([]);
  protected readonly chargebacks = signal<readonly Chargeback[]>([]);

  protected readonly mst = signal<'OPEN' | 'RESOLVED' | 'ALL'>('OPEN');
  protected readonly mk = signal('');
  protected readonly stmt = signal<string | null>(null);

  protected readonly pools = signal<readonly Pool[]>([]);
  protected readonly poolDate = signal(this.today);
  protected readonly poolError = signal('');
  protected readonly snapInst = signal('');
  protected readonly snaps = signal<readonly Snap[]>([]);
  protected readonly snapError = signal('');
  protected readonly check = signal<BalanceCheck | null>(null);
  protected readonly mis = signal<readonly MisRow[]>([]);
  protected readonly misFrom = signal(`${this.today.slice(0, 8)}01`);
  protected readonly misTo = signal(this.today);
  protected readonly misError = signal('');

  protected readonly uploading = signal<StatementKind | null>(null);
  protected readonly resolving = signal<Mismatch | null>(null);
  protected readonly viewing = signal<Statement | null>(null);
  protected readonly creating = signal<'refund' | 'chargeback' | null>(null);
  protected readonly completing = signal<Chargeback | null>(null);
  private busy = false;
  private seq = 0;
  private snapSeq = 0;

  protected readonly me = computed(() => titleCase(this.session()?.name ?? ''));
  protected readonly openMismatches = computed(() =>
    this.mismatches().filter((m) => m.status === 'OPEN'),
  );
  protected readonly pendingRefunds = computed(() =>
    this.refunds().filter((r) => r.status === 'REQUESTED'),
  );
  protected readonly raised = computed(() =>
    this.chargebacks().filter((c) => c.status === 'RAISED'),
  );
  protected readonly awaiting = computed(() =>
    this.chargebacks().filter((c) => c.status === 'ACCEPTED' || c.status === 'DISPUTED'),
  );
  protected readonly last = computed(() => this.uploads()[0] ?? null);
  protected readonly statementFilter = computed(
    () => this.uploads().find((u) => u.id === this.stmt()) ?? null,
  );
  protected readonly institutions = computed(() =>
    this.pools().map((p) => ({ id: p.institution.id, name: p.institution.name })),
  );
  protected readonly tabs = computed(() => {
    const out: { v: Tab; l: string; n: number | null }[] = [];
    if (this.can('recon.resolve')) {
      out.push({ v: 'mismatches', l: 'Mismatches', n: this.openMismatches().length });
    }
    if (this.can('recon.upload')) {
      out.push({ v: 'uploads', l: 'Statement uploads', n: this.uploads().length });
    }
    if (this.can('recon.resolve'))
      out.push({ v: 'refunds', l: 'Refunds', n: this.refunds().length });
    if (this.can('recon.chargeback')) {
      out.push({ v: 'chargebacks', l: 'Chargebacks', n: this.chargebacks().length });
    }
    if (this.can('recon.upload')) {
      out.push(
        { v: 'pool', l: 'Pool balances', n: null },
        { v: 'snaps', l: 'Daily snapshots', n: null },
        { v: 'mis', l: 'MIS', n: null },
      );
    }
    return out;
  });
  protected readonly mmRows = computed(() => {
    const st = this.mst();
    const k = this.mk();
    const s = this.stmt();
    return this.mismatches().filter(
      (m) =>
        (st === 'ALL' || m.status === st) && (!k || m.kind === k) && (!s || m.statement.id === s),
    );
  });

  constructor() {
    const q = inject(ActivatedRoute).snapshot.queryParamMap;
    const t = q.get('tab') as Tab | null;
    void this.reload().then(() => {
      const tabs = this.tabs().map((x) => x.v);
      this.go(t && tabs.includes(t) ? t : (tabs[0] ?? 'mismatches'));
    });
  }

  protected can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }
  protected why(sub: string) {
    return refusal(this.session()?.role.name ?? '', sub);
  }

  /** Each list the role may read, in parallel. */
  protected async reload() {
    const n = ++this.seq;
    try {
      const [up, mm, rf, cb] = await Promise.all([
        this.can('recon.upload') ? this.api.uploads() : Promise.resolve(null),
        this.can('recon.resolve') ? this.api.mismatches() : Promise.resolve([]),
        this.can('recon.resolve') ? this.api.refunds() : Promise.resolve([]),
        this.can('recon.chargeback') ? this.api.chargebacks() : Promise.resolve([]),
      ]);
      if (n !== this.seq) return;
      if (up) {
        this.uploads.set(up.items);
        this.layouts.set(up.layouts);
      }
      this.mismatches.set(mm);
      this.refunds.set(rf);
      this.chargebacks.set(cb);
      this.error.set('');
      this.loaded.set(true);
      if (this.can('recon.upload') && !this.pools().length) void this.loadPools();
    } catch (e) {
      if (n === this.seq) {
        this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    }
  }

  protected go(t: Tab) {
    this.tab.set(t);
    this.page.set(1);
    if (t === 'pool') void this.loadPools();
    if (t === 'snaps') void this.loadSnaps();
    if (t === 'mis') void this.loadMis();
  }

  // --- pool, snapshots and MIS -------------------------------------------------------------------------
  private async loadPools() {
    try {
      const date = this.poolDate() === this.today ? undefined : this.poolDate();
      const r = await this.api.pool(date ? { date } : {});
      this.pools.set(r.items);
      this.poolError.set('');
      // The snapshots open on the institution holding the most (the one worth checking first).
      const top = [...r.items].sort(
        (a, b) => signedPaise(b.walletsPerLedger) - signedPaise(a.walletsPerLedger),
      )[0];
      if (!this.snapInst() && top) this.snapInst.set(top.institution.id);
    } catch (e) {
      this.poolError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }
  protected setPoolDate(e: Event) {
    const v = this.value(e);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    this.poolDate.set(v);
    void this.loadPools();
  }

  /** The last days' closing balances (REC-011 per date) and the wallet check (REC-012). */
  private async loadSnaps() {
    if (!this.pools().length) await this.loadPools();
    const id = this.snapInst();
    if (!id) return;
    const n = ++this.snapSeq;
    this.snaps.set([]);
    this.check.set(null);
    this.snapError.set('');
    try {
      const days = Array.from({ length: SNAP_DAYS + 1 }, (_, i) => addDays(this.today, -1 - i));
      const [rows, check] = await Promise.all([
        Promise.all(days.map((date) => this.api.pool({ date, institutionId: id }))),
        this.api.balanceCheck(id),
      ]);
      if (n !== this.snapSeq) return;
      const closing = rows.map((r) => {
        const p = r.items[0];
        return {
          closing: p?.wallets ? signedPaise(p.wallets) : null,
          ledger: signedPaise(p?.walletsPerLedger),
        };
      });
      this.snaps.set(
        days.slice(0, SNAP_DAYS).map((day, i) => ({
          day,
          opening: closing[i + 1]?.closing ?? null,
          closing: closing[i]!.closing,
          ledger: closing[i]!.ledger,
        })),
      );
      this.check.set(check);
    } catch (e) {
      if (n === this.snapSeq) {
        this.snapError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    }
  }
  protected setSnapInst(e: Event) {
    this.snapInst.set(this.value(e));
    void this.loadSnaps();
  }

  private async loadMis() {
    try {
      const r = await this.api.mis(this.misFrom(), this.misTo());
      this.mis.set(r.items);
      this.misError.set('');
    } catch (e) {
      this.misError.set(
        e instanceof ApiProblem ? (e.errors[0]?.message ?? e.detail) : translate('GEN.UNAVAILABLE'),
      );
    }
  }
  protected setMis(k: 'from' | 'to', e: Event) {
    const v = this.value(e);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    (k === 'from' ? this.misFrom : this.misTo).set(v);
    if (this.misFrom() > this.misTo()) {
      this.misError.set('The start date is after the end date — nothing can match.');
      return;
    }
    void this.loadMis();
  }

  // --- uploads -----------------------------------------------------------------------------------------
  protected openUpload(k: StatementKind = 'GATEWAY') {
    if (!this.can('recon.upload')) return;
    this.uploading.set(k);
  }
  protected review(s: Statement) {
    this.uploading.set(null);
    this.viewing.set(null);
    this.stmt.set(s.id);
    this.mst.set('OPEN');
    this.mk.set('');
    this.go('mismatches');
  }

  // --- mismatches --------------------------------------------------------------------------------------
  protected resolved(m: Mismatch) {
    this.resolving.set(null);
    this.overlays.toast(`Mismatch resolved · ${RESOLUTION[m.resolution ?? 'EXPLAINED']}`, {
      sub:
        m.resolution === 'REFUND'
          ? 'The refund waits for another officer to process it'
          : m.resolution === 'CHARGEBACK'
            ? 'The chargeback stays Raised until accepted or disputed'
            : 'Recorded with your remarks',
    });
    void this.reload();
  }

  // --- refunds -----------------------------------------------------------------------------------------
  protected refundWhy(r: Refund) {
    if (!this.can('recon.resolve')) return this.why('recon.resolve');
    if (samePerson(r.requested.by, this.me())) {
      return 'You requested this refund — another officer processes or rejects it.';
    }
    return '';
  }
  protected async decideRefund(r: Refund, decision: 'PROCESS' | 'REJECT') {
    if (this.busy || this.refundWhy(r)) return;
    const ok = await this.overlays.confirm(
      decision === 'PROCESS'
        ? {
            title: 'Mark the refund as processed?',
            text: `Posts a ledger refund of ${inr(r.amount)} referencing ${r.originalReference} — ${r.from.name} pays ${r.to.name} back — and tells the payer.`,
            ok: 'Mark processed',
            reason: {
              label: 'Remarks (recorded)',
              placeholder: 'e.g. Checked against the gateway statement',
              min: 3,
              max: 500,
            },
          }
        : {
            title: 'Reject the refund?',
            text: `Nothing moves. ${r.to.name} isn’t paid back for ${r.originalReference}.`,
            ok: 'Reject refund',
            tone: 'bad',
            reason: {
              label: 'Remarks (recorded)',
              placeholder: 'e.g. The member received the goods',
              min: 3,
              max: 500,
            },
          },
    );
    if (!ok) return;
    this.busy = true;
    try {
      const out = await this.api.decideRefund(r, decision, ok.reason ?? '');
      this.overlays.toast(decision === 'PROCESS' ? 'Refund processed' : 'Refund rejected', {
        sub:
          decision === 'PROCESS'
            ? `Ledger refund ${out.refundReference ?? ''} · ${inr(out.amount)} back to ${out.to.name}`
            : 'Recorded with your remarks',
      });
    } catch (e) {
      this.overlays.toast(decision === 'PROCESS' ? 'Not processed' : 'Not rejected', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    } finally {
      this.busy = false;
      void this.reload();
    }
  }

  // --- chargebacks -------------------------------------------------------------------------------------
  protected async decideChargeback(c: Chargeback, decision: 'ACCEPT' | 'DISPUTE') {
    if (this.busy || !this.can('recon.chargeback')) return;
    const ok = await this.overlays.confirm(
      decision === 'ACCEPT'
        ? {
            title: 'Accept the chargeback?',
            text: `${inr(c.amount)} on ${c.originalReference}. An accepted chargeback can only be completed as reversed — the money is taken from ${c.wallet.name}’s wallet.`,
            ok: 'Accept chargeback',
            tone: 'warn',
            reason: {
              label: 'Remarks (recorded)',
              placeholder: 'e.g. Duplicate debit confirmed',
              min: 3,
              max: 500,
            },
          }
        : {
            title: 'Dispute the chargeback?',
            text: `${inr(c.amount)} on ${c.originalReference}. The case stays open until the scheme decides; it is then completed as reversed or upheld.`,
            ok: 'Dispute chargeback',
            reason: {
              label: 'Remarks (recorded)',
              placeholder: 'e.g. Delivery receipt sent to the gateway',
              min: 3,
              max: 500,
            },
          },
    );
    if (!ok) return;
    this.busy = true;
    try {
      await this.api.decideChargeback(c, decision, ok.reason ?? '');
      this.overlays.toast(decision === 'ACCEPT' ? 'Chargeback accepted' : 'Chargeback disputed', {
        sub: 'Record the completion when the outcome arrives',
      });
    } catch (e) {
      this.overlays.toast('Not changed', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    } finally {
      this.busy = false;
      void this.reload();
    }
  }
  protected completed(c: Chargeback) {
    this.completing.set(null);
    this.overlays.toast('Chargeback completed', {
      sub:
        c.outcome === 'REVERSED'
          ? `${inr(c.amount)} reversed${c.reversalReference ? ' · ' + c.reversalReference : ''}`
          : 'Upheld — nothing moved',
    });
    void this.reload();
  }
  protected created(k: 'refund' | 'chargeback') {
    this.creating.set(null);
    this.overlays.toast(k === 'refund' ? 'Refund requested' : 'Chargeback raised', {
      sub:
        k === 'refund'
          ? 'Another officer processes or rejects it'
          : 'Accept or dispute it when the scheme’s case arrives',
    });
    void this.reload();
  }

  // --- formatting --------------------------------------------------------------------------------------
  protected pageOf<T>(list: readonly T[]) {
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    const p = Math.min(this.page(), pages);
    return list.slice((p - 1) * PAGE, p * PAGE);
  }
  protected mmCount(p: 'OPEN' | 'RESOLVED' | 'ALL') {
    const s = this.stmt();
    const list = s ? this.mismatches().filter((m) => m.statement.id === s) : this.mismatches();
    return p === 'ALL' ? list.length : list.filter((m) => m.status === p).length;
  }
  protected mmStatus(s: 'OPEN' | 'RESOLVED') {
    return mismatchStatus(s);
  }
  protected kind(k: MismatchKind) {
    return MISMATCH_KIND[k];
  }
  protected diff(m: Mismatch) {
    const d = difference(m);
    return d ? (d < 0 ? '−' : '+') + inrPaise(Math.abs(d)) : '';
  }
  /** A statement outcome as written ("SUCCESS") in sentence case; a VA credit has none. */
  protected outcome(s: string | null) {
    return s ? s.charAt(0) + s.slice(1).toLowerCase() : 'Credited';
  }
  protected resolution(r: Mismatch['resolution']) {
    return r ? RESOLUTION[r] : '';
  }
  protected platformType(t: string) {
    return PLATFORM_TYPE[t] ?? t;
  }
  protected label(k: StatementKind) {
    return STATEMENT[k].l;
  }
  protected statementOf(k: StatementKind) {
    return STATEMENT[k];
  }
  protected optionalOf(k: StatementKind) {
    const l = this.layouts()[k];
    return l.columns.filter((c) => !l.required.includes(c));
  }
  protected period(u: Statement) {
    if (!u.periodFrom) return '';
    return u.periodFrom === u.periodTo
      ? formatDate(u.periodFrom)
      : `${formatDate(u.periodFrom)} – ${formatDate(u.periodTo ?? u.periodFrom)}`;
  }
  protected source(s: string) {
    return REFUND_SOURCE[s] ?? s;
  }
  protected refundTone(r: Refund) {
    return REFUND_TONE[r.status];
  }
  protected refundLabel(r: Refund) {
    return refundStatus(r.status);
  }
  protected cbTone(c: Chargeback) {
    return c.status === 'COMPLETED' && c.outcome === 'UPHELD'
      ? 'neutral'
      : CHARGEBACK_TONE[c.status];
  }
  protected cbLabel(c: Chargeback) {
    return chargebackStatus(c.status);
  }
  protected reason(code: string) {
    return reasonLabel(code);
  }
  protected others(p: Pool) {
    return p.otherAccounts
      .map((o) => `${o.kind.replace(/_/g, ' ').toLowerCase()}: ${signed(o.balance)}`)
      .join(' · ');
  }
  protected otherSum(p: Pool) {
    return inrPaise(p.otherAccounts.reduce((a, o) => a + signedPaise(o.balance), 0));
  }
  protected signed(m: Pool['received'] | null) {
    return signed(m);
  }
  protected signedPaise(m: Pool['received'] | null) {
    return signedPaise(m);
  }
  protected total(list: readonly { amount: { amount: string } }[]) {
    return inrPaise(sumOf(list, (x) => x.amount));
  }
  protected money(m: { amount: string }) {
    return inr(m);
  }
  protected paise(p: number) {
    return inrPaise(p);
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
  protected plural(n: number, w: string) {
    return plural(n, w);
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected dt(v: string | null) {
    return v ? formatDateTime(v) : '—';
  }
  protected since(v: string | null) {
    return v ? ago(v) : '—';
  }
  protected value(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected readonly paiseOf = paiseOf;
}
