/**
 * Student leave (Phase 10, teachers on the web; the app's m.t.leave): the class teacher's leave
 * requests by status with the dates, school days, reason and document, approved or rejected with a
 * reason the family sees (ACA-055/056).
 */
import { ChangeDetectionStrategy, Component, type OnInit, inject, signal } from '@angular/core';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDate } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { t as tr } from '../../../Utils/t';
import { problemText } from '../Structure/academic-format';
import { ClassesApi, type LeaveList, type StudentLeave } from './classes.api';

type Filter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'all';
const FILTERS: readonly Filter[] = ['PENDING', 'APPROVED', 'REJECTED', 'all'];

@Component({
  selector: 'rp-teaching-leave',
  imports: [Empty, Icon, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    <rp-page-head [title]="t('ui.web.nav.leave')" [sub]="t('ui.web.tch.leave.sub')" />

    @if (error()) {
      <div class="note tone-bad" role="alert" id="tl-error">
        <rp-icon name="alert" [size]="17" />
        <div class="grow">{{ error() }}</div>
        <button type="button" class="btn btn-sec btn-sm" (click)="load()">
          {{ t('ui.web.tch.retry') }}
        </button>
      </div>
    } @else if (list()?.classTeacher === false) {
      <rp-empty icon="leaveic" [title]="t('ui.web.tch.leave.notClassTeacher')" />
    } @else {
      <div class="tabs" role="tablist" [attr.aria-label]="t('ui.web.nav.leave')">
        @for (f of filters; track f) {
          <button
            type="button"
            class="tab"
            role="tab"
            [id]="'tl-tab-' + f"
            [class.on]="filter() === f"
            [attr.aria-selected]="filter() === f"
            (click)="pick(f)"
          >
            {{ f === 'all' ? t('ui.web.tch.leave.all') : statusLabel(f) }}
            @if (list(); as l) {
              <span class="n">{{ count(l, f) }}</span>
            }
          </button>
        }
      </div>

      @if (loading()) {
        <div class="card pad">
          <div class="sk" style="height: 240px; border-radius: 16px"></div>
        </div>
      } @else if (!list()?.items?.length) {
        <rp-empty
          icon="leaveic"
          [title]="t('ui.web.tch.leave.empty')"
          [text]="t('ui.web.tch.leave.emptyText')"
        />
      } @else {
        <div class="stack g12" id="tl-list">
          @for (l of list()!.items; track l.id; let i = $index) {
            <div class="card pad stack g8" [id]="'tl-' + i">
              <div class="row g12 wrap">
                <div class="grow" style="min-width: 0">
                  <b>{{ l.student.name }}</b>
                  <span class="t-muted"> · {{ l.section.label }}</span>
                  @if (l.student.admissionNo) {
                    <span class="t-muted t-mono t-sm"> · {{ l.student.admissionNo }}</span>
                  }
                </div>
                <span class="chip dot" [class]="'tone-' + tone(l.status)">{{
                  statusLabel(l.status)
                }}</span>
              </div>
              <div class="t-sm">
                <b>{{ dates(l) }}</b> · {{ t('ui.web.tch.leave.days', { n: l.schoolDays }) }}
                <span class="t-muted t-mono"> · {{ l.reference }}</span>
              </div>
              <div>{{ l.reason }}</div>
              <div class="t-muted t-sm">
                @if (l.appliedBy) {
                  {{ t('ui.web.tch.leave.appliedBy', { name: l.appliedBy }) }}
                }
                @if (l.appliedAt) {
                  · {{ date(l.appliedAt) }}
                }
                @if (l.document) {
                  · {{ t('ui.web.tch.leave.document', { name: l.document.name }) }}
                }
              </div>
              @if (l.remarks) {
                <div class="t-sm">{{ t('ui.web.tch.leave.remarks', { text: l.remarks }) }}</div>
              }
              @if (l.status === 'PENDING') {
                <div class="row g8" style="justify-content: flex-end">
                  <button
                    type="button"
                    class="btn btn-sec btn-sm"
                    [id]="'tl-reject-' + i"
                    [disabled]="busy() === l.id"
                    (click)="decide(l, 'REJECTED')"
                  >
                    <rp-icon name="x" [size]="15" /><span>{{ t('ui.web.tch.leave.reject') }}</span>
                  </button>
                  <button
                    type="button"
                    class="btn btn-pri btn-sm"
                    [id]="'tl-approve-' + i"
                    [disabled]="busy() === l.id"
                    (click)="decide(l, 'APPROVED')"
                  >
                    <rp-icon name="check" [size]="15" /><span>{{
                      t('ui.web.tch.leave.approve')
                    }}</span>
                  </button>
                </div>
              }
            </div>
          }
        </div>
      }
    }
  </div>`,
})
export class TeachingLeave implements OnInit {
  private readonly api = inject(ClassesApi);
  private readonly overlays = inject(Overlays);
  protected readonly t = tr;
  protected readonly filters = FILTERS;
  protected readonly filter = signal<Filter>('PENDING');
  protected readonly list = signal<LeaveList | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal<string | null>(null);

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.list.set(await this.api.leaves(this.filter()));
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected pick(f: Filter) {
    if (f === this.filter()) return;
    this.filter.set(f);
    void this.load();
  }

  protected async decide(l: StudentLeave, decision: 'APPROVED' | 'REJECTED') {
    const approve = decision === 'APPROVED';
    const res = await this.overlays.confirm(
      approve
        ? {
            title: tr('ui.web.tch.leave.approveTitle', { name: l.student.name }),
            text: tr('ui.web.tch.leave.approveText', { dates: this.dates(l) }),
            ok: tr('ui.web.tch.leave.approve'),
            icon: 'check',
          }
        : {
            title: tr('ui.web.tch.leave.rejectTitle', { name: l.student.name }),
            text: tr('ui.web.tch.leave.rejectText'),
            ok: tr('ui.web.tch.leave.reject'),
            tone: 'bad',
            icon: 'x',
            reason: { label: tr('ui.web.tch.leave.rejectLabel'), min: 5, max: 200 },
          },
    );
    if (!res) return;
    this.busy.set(l.id);
    try {
      await this.api.decide(l.id, decision, res.reason ?? null);
      this.overlays.toast(tr(approve ? 'ui.web.tch.leave.approved' : 'ui.web.tch.leave.rejected'), {
        sub: tr('ui.web.tch.leave.toldSub', { name: l.student.name }),
      });
      await this.load();
    } catch (e) {
      const msg =
        e instanceof ApiProblem && e.errors.length ? e.errors[0]!.message : problemText(e);
      this.overlays.toast(msg, { tone: 'bad' });
      await this.load();
    } finally {
      this.busy.set(null);
    }
  }

  protected count(l: LeaveList, f: Filter) {
    return f === 'all'
      ? l.counts.all
      : l.counts[f.toLowerCase() as 'pending' | 'approved' | 'rejected'];
  }
  protected statusLabel(s: string) {
    return tr(`status.studentLeave.${s.toLowerCase()}`);
  }
  protected tone(s: string) {
    return s === 'APPROVED'
      ? 'ok'
      : s === 'REJECTED'
        ? 'bad'
        : s === 'PENDING'
          ? 'warn'
          : 'neutral';
  }
  protected dates(l: StudentLeave) {
    return l.from === l.to
      ? formatDate(l.from)
      : tr('ui.web.tch.leave.dates', { from: formatDate(l.from), to: formatDate(l.to) });
  }
  protected date(v: string) {
    return formatDate(v);
  }
}
