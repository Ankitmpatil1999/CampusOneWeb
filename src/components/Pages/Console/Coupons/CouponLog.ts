import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDate, formatDateTime, formatTime } from '../../../Utils/format';
import { translate } from '../../../Utils/translate';
import { plural } from '../Allowances/allowance-format';
import { dshort, shortId } from './coupon-format';
import type { CouponIssuance, CouponIssueResult } from './coupons.api';

const PAGE = 12;

/**
 * The "Issuance log" tab (prototype cpnLog, cm.clog.open; SRS 11.2; CPN-009): every issuance with
 * its types, range, students, coupons created and duplicates skipped; a row opens the issuance
 * drawer. Per-student counts are shown for an issuance made in this session (the issue result);
 * the log itself keeps only the totals.
 */
@Component({
  selector: 'rp-coupon-log',
  imports: [Empty, Icon, Modal, Pager],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (error()) {
      <div class="card pad">
        <rp-empty icon="alertc" title="Couldn't load the issuance log" [text]="error()">
          <button type="button" class="btn btn-sec btn-sm" (click)="reload.emit()">
            <span>Try again</span>
          </button>
        </rp-empty>
      </div>
    } @else {
      <div>
        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>Issuance</th>
                <th>Issued</th>
                <th>Types</th>
                <th>Range</th>
                <th class="r">Students</th>
                <th class="r">Coupons</th>
                <th class="r">Skipped</th>
              </tr>
            </thead>
            <tbody>
              @if (loading() && !items().length) {
                <tr>
                  <td colspan="7"><rp-empty icon="hourglass" title="Loading…" /></td>
                </tr>
              }
              @for (x of shown(); track x.id) {
                <tr tabindex="0" (click)="openId.set(x.id)" (keydown.enter)="openId.set(x.id)">
                  <td>
                    <span class="t-mono" [title]="x.id">{{ short(x.id) }}</span>
                  </td>
                  <td>
                    <div class="cell-t t-num" style="font-weight: 550">{{ date(x.issuedAt) }}</div>
                    <div class="cell-s">{{ time(x.issuedAt) }}</div>
                  </td>
                  <td>
                    @for (t of x.types; track t.id) {
                      <span class="cm-tchip"
                        ><rp-icon name="ticket" [size]="12" />{{ t.name || 'Removed type' }}</span
                      >
                      {{ ' ' }}
                    }
                  </td>
                  <td>
                    {{ dshort(x.from) }} – {{ date(x.to) }}
                    <div class="cell-s">{{ x.excludedDates.length }} excluded</div>
                  </td>
                  <td class="r">{{ num(x.students) }}</td>
                  <td class="r">{{ num(x.created) }}</td>
                  <td class="r">{{ num(x.skipped) }}</td>
                </tr>
              } @empty {
                @if (!loading()) {
                  <tr>
                    <td colspan="7"><rp-empty icon="history" title="No issuances yet" /></td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
        @if (items().length > pageSize) {
          <rp-pager
            [total]="items().length"
            [page]="page()"
            [size]="pageSize"
            (go)="page.set($event)"
          />
        } @else if (items().length) {
          <div class="pager">
            <span>{{ count(items().length, 'issuance') }}</span>
          </div>
        }
      </div>
    }

    @if (open(); as x) {
      <rp-modal
        [title]="'Issuance ' + short(x.id)"
        [sub]="dt(x.issuedAt)"
        icon="ticket"
        [drawer]="true"
        [slim]="true"
        cls="cm-m"
        [foot]="false"
        (closed)="openId.set(null)"
      >
        <div class="cm-dr">
          <div class="stack g16">
            <div class="c-grid k3">
              <div class="cm-tile">
                <span>Students</span><b class="t-num">{{ num(x.students) }}</b>
              </div>
              <div class="cm-tile">
                <span>Coupons created</span><b class="t-num">{{ num(x.created) }}</b>
              </div>
              <div class="cm-tile">
                <span>Duplicates skipped</span><b class="t-num">{{ num(x.skipped) }}</b>
              </div>
            </div>
            <dl class="kv">
              <dt>Types</dt>
              <dd>{{ typeNames(x) }}</dd>
              <dt>From</dt>
              <dd>{{ date(x.from) }}</dd>
              <dt>To</dt>
              <dd>{{ date(x.to) }}</dd>
              <dt>Excluded dates</dt>
              <dd>{{ excluded(x) }}</dd>
              @if (x.refused) {
                <dt>Students refused</dt>
                <dd>{{ num(x.refused) }}</dd>
              }
            </dl>
            <div class="sec-h"><h3>Per student</h3></div>
            @if (perStudent(x.id); as per) {
              <div class="tbl-wrap cm-scroll">
                <table class="tbl dense">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th class="r">Coupons</th>
                      <th class="r">Skipped</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (s of per.slice(0, 200); track s.studentId) {
                      <tr [class.cm-rej]="!!s.refused">
                        <td>
                          {{ s.name || 'Unknown student' }}
                          @if (s.refused) {
                            <div class="cell-s t-bad">{{ refusal(s.refused) }}</div>
                          }
                        </td>
                        <td class="r t-num">{{ s.created }}</td>
                        <td class="r t-num">{{ s.skipped }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <rp-empty
                icon="users"
                title="Per-student counts aren't available"
                [text]="
                  'This issuance covered ' +
                  num(x.students) +
                  ' students; the log keeps only its totals.'
                "
              />
            }
          </div>
        </div>
      </rp-modal>
    }
  `,
})
export class CouponLogTab {
  readonly items = input<readonly CouponIssuance[]>([]);
  readonly loading = input(false);
  readonly error = input('');
  /** Issue results of this session by issuance id (the per-student counts). */
  readonly results = input<ReadonlyMap<string, CouponIssueResult>>(new Map());
  readonly reload = output<void>();

  protected readonly pageSize = PAGE;
  protected readonly page = signal(1);
  readonly openId = signal<string | null>(null);

  protected readonly shown = computed(() =>
    this.items().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly open = computed(
    () => this.items().find((x) => x.id === this.openId()) ?? null,
  );

  protected perStudent(id: string) {
    return this.results().get(id)?.perStudent ?? null;
  }
  protected typeNames(x: CouponIssuance) {
    return x.types.map((t) => t.name || 'Removed type').join(', ');
  }
  protected excluded(x: CouponIssuance) {
    return x.excludedDates.length ? x.excludedDates.map((d) => dshort(d)).join(', ') : 'None';
  }
  /** The per-student refusal in register wording (CPN.HOLD_MAX has no type in the result). */
  protected refusal(code: string) {
    return code === 'CPN.HOLD_MAX' ? 'Over a holding maximum — nothing issued' : translate(code);
  }
  protected short(id: string) {
    return shortId(id);
  }
  protected dshort(d: string) {
    return dshort(d);
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected time(v: string) {
    return formatTime(v);
  }
  protected dt(v: string) {
    return formatDateTime(v);
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
  protected count(n: number, noun: string) {
    return plural(n, noun);
  }
}
