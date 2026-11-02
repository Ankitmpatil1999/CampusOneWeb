import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  type OnInit,
} from '@angular/core';
import { Avatar } from '../../../Shared/Avatar';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { person } from '../Applications/app-format';
import { plural } from '../Fees/fee-format';
import { addDays, dRange, problemText, weekday } from '../Structure/academic-format';
import { StructureApi } from '../Structure/structure.api';
import { dlong } from '../Exams/exam-format';
import { TimetableApi, type ClashList } from '../Timetable/timetable.api';
import { LeaveApi, type LeaveDetail, type StaffLeave } from './leave.api';
import { dt, stateChip, timeline } from './leave-format';

const REMARKS_MIN = 5;
const REMARKS_MAX = 400;

/** "Period 3" → "P3" (the prototype's period ids); other names as they are. */
const periodShort = (name: string) => {
  const m = /^Period (\d+)$/i.exec(name.trim());
  return m ? `P${m[1]}` : name;
};

interface AffectedDay {
  readonly date: string;
  readonly n: number;
  readonly text: string;
}

/**
 * One teacher's leave request for the coordinator's first review (prototype cc.lv.open / lvBody /
 * cc.lv.dec; ACA-076, ACA-043): the request, the balance of its type, the classes affected day by
 * day, who else is away, the progress, and — while it waits — feedback with Recommend to principal
 * or Reject (feedback required). A coordinator's rejection closes the request (OI-ACA-51).
 */
@Component({
  selector: 'rp-leave-drawer',
  imports: [Avatar, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @let l = view();
    <rp-modal
      [title]="l.reference + ' · ' + person(l.staff.name)"
      [sub]="l.typeLabel + ' · ' + range(l)"
      icon="plane"
      [drawer]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="lv-body">
        <div class="row g12">
          <rp-av [name]="person(l.staff.name)" size="lg" />
          <div class="grow">
            <b class="t-h4" style="display: block">{{ person(l.staff.name) }}</b>
            <span class="t-sm t-muted">{{ meta() || l.staff.type }}</span>
          </div>
          <span [class]="'chip dot tone-' + chip().tone">{{ chip().l }}</span>
        </div>
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }
        <div class="c-grid k2">
          <div class="fs">
            <h4><rp-icon name="plane" [size]="16" />Request</h4>
            <div class="fs-b">
              <dl class="kv" id="lv-req">
                <dt>Type</dt>
                <dd>{{ l.typeLabel }}</dd>
                <dt>Dates</dt>
                <dd>{{ range(l) }}</dd>
                <dt>Working days</dt>
                <dd>{{ l.days }}</dd>
                <dt>Reason</dt>
                <dd>{{ l.reason }}</dd>
                <dt>Applied</dt>
                <dd>{{ dt(l.appliedAt) }}</dd>
              </dl>
            </div>
          </div>
          <div class="fs">
            <h4><rp-icon name="hourglass" [size]="16" />Balance</h4>
            <div class="fs-b">
              @if (detail()?.balance; as b) {
                <dl class="kv" id="lv-bal">
                  <dt>{{ b.label }}</dt>
                  <dd>{{ b.left }} of {{ b.total }} days left</dd>
                  @if (waiting()) {
                    <dt>After this request</dt>
                    <dd>{{ after() }} days</dd>
                  }
                </dl>
                @if (waiting() && b.left < l.days) {
                  <div class="note tone-warn" style="margin-top: 10px">
                    <rp-icon name="alertc" [size]="17" />
                    <div class="grow">The request is longer than the remaining balance.</div>
                  </div>
                }
              } @else if (loading()) {
                <div class="sk" style="height: 64px; border-radius: 10px" aria-busy="true"></div>
              } @else {
                <p class="t-sm t-muted">The balance isn't available.</p>
              }
            </div>
          </div>
        </div>

        <div class="fs">
          <h4><rp-icon name="grid" [size]="16" />Classes affected</h4>
          <div class="fs-b">
            @if (loading()) {
              <div class="sk" style="height: 64px; border-radius: 10px" aria-busy="true"></div>
            } @else if (affected(); as days) {
              @if (days.length) {
                <div class="stack g8" id="lv-affected">
                  @for (d of days; track d.date) {
                    <div class="stack g4">
                      <b class="t-sm"
                        >{{ long(d.date) }}
                        <span class="t-muted t-m">· {{ plural(d.n, 'period') }}</span></b
                      >
                      <span class="t-sm t-muted">{{ d.text }}</span>
                    </div>
                  }
                  <p class="t-xs t-muted">{{ plural(total(), 'period') }} need a substitute.</p>
                </div>
              } @else {
                <p class="t-sm t-muted">No timetabled periods on these dates.</p>
              }
            } @else if (detail(); as d) {
              <p class="t-sm t-muted">
                {{
                  d.periodsAffected
                    ? plural(d.periodsAffected, 'period') + ' need a substitute.'
                    : 'No timetabled periods on these dates.'
                }}
              </p>
            }
          </div>
        </div>

        @if (others().length) {
          <div class="note tone-info">
            <rp-icon name="users" [size]="17" />
            <div class="grow">Also away on these dates: {{ others().join(', ') }}.</div>
          </div>
        }

        <div class="fs">
          <h4><rp-icon name="history" [size]="16" />Progress</h4>
          <div class="fs-b">
            <div class="tl" id="lv-progress">
              @for (t of steps(); track $index) {
                <div
                  class="tl-i"
                  [class.done]="t.state === 'done'"
                  [class.now]="t.state === 'now'"
                  [class.bad]="t.state === 'bad'"
                >
                  <span class="tl-dot"><rp-icon [name]="t.icon" [size]="13" [stroke]="2.6" /></span>
                  <div class="tl-c">
                    <div class="tl-t">{{ t.title }}</div>
                    @if (t.sub) {
                      <div class="tl-s">{{ t.sub }}</div>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        </div>

        @if (canDecide()) {
          <div class="fld" [class.invalid]="feedbackError()">
            <label class="fld-l" for="lv-fb">Feedback to the teacher and principal</label>
            <div class="fld-in">
              <textarea
                id="lv-fb"
                rows="3"
                [attr.maxlength]="remarksMax"
                placeholder="e.g. Substitution arranged with Ashok Murthy"
                aria-describedby="lv-fb-e lv-fb-h"
                [value]="feedback()"
                (input)="feedback.set(val($event)); feedbackError.set('')"
              ></textarea>
            </div>
            <div class="fld-e" id="lv-fb-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ feedbackError() }}</span>
            </div>
            <div class="fld-h" id="lv-fb-h">
              Required when you reject; optional when you recommend.
            </div>
          </div>
        }
      </div>
      <div modal-foot class="cc-foot">
        @if (l.state === 'PENDING') {
          <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="closed.emit()">
            <span>Close</span>
          </button>
          <span class="cp-why" [attr.title]="decideWhy() || null"
            ><button
              type="button"
              class="btn btn-danger-o"
              id="lv-reject"
              [disabled]="!!decideWhy() || busy() || !detail()"
              (click)="decide('REJECTED')"
            >
              <rp-icon name="xc" [size]="17" /><span>Reject</span>
            </button></span
          >
          <span class="cp-why" [attr.title]="decideWhy() || null"
            ><button
              type="button"
              class="btn btn-pri"
              id="lv-recommend"
              [class.is-busy]="busy()"
              [disabled]="!!decideWhy() || busy() || !detail()"
              (click)="decide('APPROVED')"
            >
              <rp-icon name="send" [size]="17" /><span>Recommend to principal</span>
            </button></span
          >
        } @else {
          <button type="button" class="btn btn-sec" (click)="closed.emit()">
            <span>Close</span>
          </button>
        }
      </div>
    </rp-modal>
  `,
})
export class LeaveDrawer implements OnInit {
  private readonly api = inject(LeaveApi);
  private readonly timetable = inject(TimetableApi);
  private readonly structure = inject(StructureApi);
  private readonly overlays = inject(Overlays);

  readonly leave = input.required<StaffLeave>();
  /** Department, employee number and subjects of the teacher ('' when unknown). */
  readonly meta = input('');
  /** Other teachers away on these dates ("Mahesh Reddy (approved)"). */
  readonly others = input<readonly string[]>([]);
  /** Why the signed-in user can't decide ('' when they can). */
  readonly decideWhy = input('');
  /** The timetable can be read (academics.view) — the classes affected are listed day by day. */
  readonly timetableReadable = input(true);
  readonly closed = output<void>();
  readonly decided = output<LeaveDetail>();

  protected readonly person = person;
  protected readonly plural = plural;
  protected readonly remarksMax = REMARKS_MAX;
  protected readonly detail = signal<LeaveDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly feedback = signal('');
  protected readonly feedbackError = signal('');
  private readonly week = signal<ClashList['teacherWeek']>(null);
  private readonly bell = signal<readonly { id: string; name: string; startsAt: string }[]>([]);

  /** The request as last read (the detail once loaded, else the list's row). */
  protected readonly view = computed<StaffLeave>(() => this.detail() ?? this.leave());
  protected readonly chip = computed(() => stateChip(this.view().state));
  protected readonly steps = computed(() => timeline(this.view()));
  protected readonly waiting = computed(
    () => this.view().state === 'PENDING' || this.view().state === 'WITH_PRINCIPAL',
  );
  protected readonly after = computed(() =>
    Math.max(0, (this.detail()?.balance?.left ?? 0) - this.view().days),
  );
  protected readonly canDecide = computed(
    () => this.view().state === 'PENDING' && !this.decideWhy(),
  );
  /** The days of the request with the teacher's timetabled periods ("P1 Grade 7 B · …"). */
  protected readonly affected = computed<AffectedDay[] | null>(() => {
    const w = this.week();
    if (!w) return null;
    const l = this.view();
    const order = new Map(
      [...this.bell()]
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .map((p, i) => [p.id, i]),
    );
    const short = new Map(this.bell().map((p) => [p.id, periodShort(p.name)]));
    const out: AffectedDay[] = [];
    for (let d = l.from; d <= l.to; d = addDays(d, 1)) {
      const wd = weekday(d);
      const slots = w
        .filter((x) => x.day === wd)
        .sort((a, b) => (order.get(a.periodId) ?? 0) - (order.get(b.periodId) ?? 0));
      if (!slots.length) continue;
      out.push({
        date: d,
        n: slots.length,
        text: slots
          .map((s) => `${short.get(s.periodId) ?? ''} ${s.section.label}`.trim())
          .join(' · '),
      });
    }
    return out;
  });
  protected readonly total = computed(() => (this.affected() ?? []).reduce((n, d) => n + d.n, 0));

  ngOnInit() {
    void this.load();
    if (this.timetableReadable()) void this.loadWeek();
  }

  async load() {
    this.loading.set(true);
    try {
      this.detail.set(await this.api.detail(this.leave().id));
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadWeek() {
    try {
      const [w, p] = await Promise.all([
        this.timetable.clashes(undefined, this.leave().staff.id),
        this.structure.periods(),
      ]);
      this.bell.set(p.items);
      this.week.set(w.teacherWeek ?? []);
    } catch {
      // The count of periods from the request is shown instead.
    }
  }

  protected range(l: StaffLeave) {
    return dRange(l.from, l.to);
  }
  protected dt(v: string | null) {
    return dt(v);
  }
  protected long(d: string) {
    return dlong(d);
  }
  protected val(e: Event) {
    return (e.target as HTMLTextAreaElement).value;
  }

  /** prototype cc.lv.dec: check the feedback, confirm, then record the coordinator's decision. */
  protected async decide(decision: 'APPROVED' | 'REJECTED') {
    const d = this.detail();
    if (!d || this.busy() || this.decideWhy()) return;
    const remarks = this.feedback().trim();
    if ((decision === 'REJECTED' && remarks.length < REMARKS_MIN) || remarks.length > REMARKS_MAX) {
      this.feedbackError.set(
        translate('ACA.DECISION_REMARKS', { min: REMARKS_MIN, max: REMARKS_MAX }),
      );
      return;
    }
    this.feedbackError.set('');
    const who = person(d.staff.name);
    const what = d.typeLabel.toLowerCase();
    const ok = await this.overlays.confirm(
      decision === 'REJECTED'
        ? {
            title: 'Reject this leave?',
            text: `${who}'s ${what} is not recommended and the request closes. ${who} is told, with your feedback.`,
            ok: 'Reject leave',
            tone: 'bad',
          }
        : {
            title: 'Recommend this leave?',
            text: `${who}'s ${what} goes to the principal marked recommended. The principal gives the final decision.`,
            ok: 'Recommend leave',
          },
    );
    if (!ok) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const out = await this.api.decide(d.id, d.version, decision, remarks || null);
      this.detail.set(out);
      this.feedback.set('');
      this.overlays.toast(decision === 'REJECTED' ? 'Leave rejected' : 'Leave recommended', {
        sub:
          decision === 'REJECTED'
            ? `${out.reference} · ${who} is told`
            : `${out.reference} · sent to the principal`,
      });
      this.decided.emit(out);
    } catch (x) {
      if (x instanceof ApiProblem && x.errors.some((f) => f.field === 'remarks')) {
        this.feedbackError.set(x.errors.find((f) => f.field === 'remarks')!.message);
      } else {
        this.error.set(problemText(x));
      }
      // Changed meanwhile (412) or already decided (409): show the request as it is now.
      if (x instanceof ApiProblem && (x.status === 409 || x.status === 412)) void this.load();
    } finally {
      this.busy.set(false);
    }
  }
}
