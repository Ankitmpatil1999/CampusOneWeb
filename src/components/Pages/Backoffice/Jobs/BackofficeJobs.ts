import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SessionContext } from '../../../../Context/SessionContext';
import { Card, Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { newIdempotencyKey } from '../../../Utils/ids';
import { formatDate, formatTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';

interface JobRun {
  readonly id: string;
  readonly jobId: string;
  readonly period: string;
  readonly trigger: 'SCHEDULE' | 'MANUAL' | 'CATCH_UP';
  readonly status: 'STARTED' | 'SUCCESS' | 'PARTIAL_FAILURE' | 'FAILED';
  readonly processed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly startedAt: string;
  readonly endedAt: string | null;
}

interface JobRunLog extends JobRun {
  readonly items: readonly {
    readonly institution: string | null;
    readonly status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    readonly processed: number;
    readonly failed: number;
    readonly note: string | null;
    readonly errorCode: string | null;
  }[];
}

interface Job {
  readonly id: string;
  readonly name: string;
  readonly module: string;
  readonly ref: string;
  readonly time: string | null;
  readonly scheduleNote: string | null;
  readonly scheduleLabel: string | null;
  readonly scheduleDetail: string | null;
  readonly scheduled: boolean;
  readonly money: boolean;
  readonly phase: number;
  readonly unit: string;
  readonly does: string;
  readonly window: string;
  readonly previous: string;
  readonly twice: string;
  readonly available: boolean;
  readonly lastRun: JobRun | null;
}

const ITEM: Record<JobRunLog['items'][number]['status'], { label: string; tone: string }> = {
  SUCCESS: { label: 'Completed', tone: 'ok' },
  FAILED: { label: 'Failed', tone: 'bad' },
  SKIPPED: { label: 'Skipped', tone: 'neutral' },
};

const STATUS: Record<JobRun['status'], { label: string; tone: string }> = {
  STARTED: { label: 'Running', tone: 'info' },
  SUCCESS: { label: 'Completed', tone: 'ok' },
  PARTIAL_FAILURE: { label: 'Partially completed', tone: 'warn' },
  FAILED: { label: 'Failed', tone: 'bad' },
};

/** The rules every process follows (prototype o.jobs; RNG-GOV-021/024). */
const RULES = [
  ['Schedule and time zone', 'Each process states its time in IST and the window it covers.'],
  ['Previous run incomplete', 'The next run completes the missed period first.'],
  [
    'Run twice',
    'A second run for the same period changes nothing that is already done (idempotent).',
  ],
  [
    'Institution status',
    'Only Active and Trial institutions are processed; others are recorded as skipped.',
  ],
  [
    'Failure',
    'Recorded with the institution and reason; operations are alerted, never swallowed (RNG-GOV-021).',
  ],
] as const;

/**
 * o.jobs — Scheduled processing (SRS 26.6, RNG-GOV-021/024/025; GOV-001…004; prototype o.jobs): every
 * process with its schedule, last run and status, the details of each, recent runs and the rules they
 * follow. A process runs once its module brings the runner (Phases 3–8); until then its row says so.
 */
@Component({
  selector: 'rp-backoffice-jobs',
  imports: [Card, Empty, Icon, Modal, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Scheduled processing"
        sub="Seven processes run without a user, in this order every night (IST); the tuition retry runs through the day and auto-absent marking at each institution's cut-off."
      />
      @if (loading()) {
        <div class="card pad"><rp-empty icon="hourglass" title="Loading…" /></div>
      } @else if (error()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the processes" [text]="error()" />
        </div>
      } @else {
        @if (failed().length) {
          <div class="note tone-bad">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">
              <b>{{ failedNames() }}</b> did not complete for every institution. Re-running is safe
              because institutions already completed for the period are skipped and nothing posts
              twice.
            </div>
          </div>
        } @else if (anyRun()) {
          <div class="note tone-ok">
            <rp-icon name="checkc" [size]="17" />
            <div class="grow">
              Every money job completed its last run for every active institution.
            </div>
          </div>
        } @else {
          <div class="note tone-info">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              No process has run yet. Subscription billing runs every night; the others start with
              their modules (Phases 3–8). Their schedules and rules are fixed now (RNG-GOV-024).
            </div>
          </div>
        }
        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>Process</th>
                <th>Schedule</th>
                <th>Last run</th>
                <th>Status</th>
                <th class="r">Processed</th>
                <th class="r">Failed · skipped</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (j of jobs(); track j.id) {
                <tr tabindex="0" (click)="open.set(j)" (keydown.enter)="open.set(j)">
                  <td>
                    <div class="stack g4" style="gap: 1px">
                      <span class="cell-t">{{ j.name }}</span>
                      <span class="cell-s">
                        @if (j.money) {
                          <b class="t-accent">Money</b> ·
                        }
                        {{ j.module }} · {{ j.ref }}
                      </span>
                    </div>
                  </td>
                  <td>
                    @if (j.time) {
                      <div class="stack g4" style="gap: 1px">
                        <span class="cell-t"
                          ><span class="t-num">{{ j.time }}</span></span
                        ><span class="cell-s">daily · IST</span>
                      </div>
                    } @else if (j.scheduled) {
                      <div class="stack g4" style="gap: 1px" [attr.title]="j.scheduleNote">
                        <span class="cell-t">{{ j.scheduleLabel }}</span
                        ><span class="cell-s">{{ j.scheduleDetail }}</span>
                      </div>
                    } @else {
                      <span class="chip tone-warn dot" [attr.title]="j.scheduleNote"
                        >Not scheduled</span
                      >
                    }
                  </td>
                  <td>
                    @if (j.lastRun; as r) {
                      <div class="stack g4" style="gap: 1px">
                        <span class="cell-t">{{ day(r.startedAt) }}</span
                        ><span class="cell-s"
                          >{{ r.trigger === 'MANUAL' ? 'manual' : 'scheduled' }} · period
                          {{ r.period }}</span
                        >
                      </div>
                    } @else {
                      <span class="t-muted">Never</span>
                    }
                  </td>
                  <td>
                    @if (j.lastRun; as r) {
                      <span class="chip dot" [class]="'tone-' + status(r).tone">{{
                        status(r).label
                      }}</span>
                    } @else if (!j.available) {
                      <span class="chip tone-info">Arrives in Phase {{ j.phase }}</span>
                    } @else {
                      <span class="t-muted">No runs</span>
                    }
                  </td>
                  <td class="r">
                    @if (j.lastRun; as r) {
                      <span class="ob-nw"
                        >{{ r.processed }} <span class="t-xs t-muted">{{ j.unit }}</span></span
                      >
                    } @else {
                      —
                    }
                  </td>
                  <td class="r ob-nw">
                    @if (j.lastRun; as r) {
                      {{ r.failed }} · {{ r.skipped }}
                    } @else {
                      —
                    }
                  </td>
                  <td>
                    <div class="row-acts">
                      <button
                        type="button"
                        class="btn btn-soft btn-xs"
                        [disabled]="!j.available || !canRun() || running()"
                        [attr.title]="runTitle(j)"
                        (click)="$event.stopPropagation(); run(j)"
                      >
                        <rp-icon name="play" [size]="15" /><span>Run</span>
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (!canRun()) {
          <div class="note tone-warn">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">
              You can read runs and logs. Your role doesn't hold “Run a job now”. Ask a Platform
              Administrator to grant it in Roles & tasks.
            </div>
          </div>
        }
        <div class="c-grid s21">
          <rp-card title="Recent runs" icon="history" [plainIcon]="true">
            @if (recent().length) {
              <div class="tbl-wrap" style="border: 0; border-radius: 0">
                <table class="tbl dense">
                  <thead>
                    <tr>
                      <th>Started</th>
                      <th>Process</th>
                      <th>Trigger</th>
                      <th>Status</th>
                      <th class="r">Processed</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of recent(); track r.id) {
                      <tr
                        tabindex="0"
                        (click)="openById(r.jobId)"
                        (keydown.enter)="openById(r.jobId)"
                      >
                        <td class="ob-nw">{{ day(r.startedAt) }}</td>
                        <td>{{ nameOf(r.jobId) }}</td>
                        <td>
                          @if (r.trigger === 'MANUAL') {
                            <span class="chip tone-info">Manual</span>
                          } @else {
                            <span class="t-muted">{{ triggerText(r.trigger) }}</span>
                          }
                        </td>
                        <td>
                          <span class="chip dot" [class]="'tone-' + status(r).tone">{{
                            status(r).label
                          }}</span>
                        </td>
                        <td class="r">{{ r.processed }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <rp-empty
                icon="history"
                title="No runs yet"
                text="Each run appears here with its trigger, status and counts."
              />
            }
          </rp-card>
          <rp-card title="Rules every process follows" icon="shieldck" [plainIcon]="true">
            <div class="stack g8 t-sm">
              @for (r of rules; track r[0]) {
                <div class="ob-rule">
                  <rp-icon name="check" [size]="14" />
                  <div>
                    <b>{{ r[0] }}</b
                    ><span>{{ r[1] }}</span>
                  </div>
                </div>
              }
            </div>
          </rp-card>
        </div>
      }
    </div>

    @if (open(); as j) {
      <rp-modal
        [title]="j.name"
        [sub]="j.module + ' · ' + j.ref"
        [drawer]="true"
        (closed)="open.set(null)"
      >
        <div class="stack g16">
          <div class="row wrap g8">
            @if (j.money) {
              <span class="chip tone-accent">Money depends on this</span>
            }
            @if (j.time) {
              <span class="tag"><rp-icon name="clock" [size]="12" />{{ j.time }} IST daily</span>
            } @else if (!j.scheduled) {
              <span class="chip tone-warn dot">Not scheduled</span>
            }
            @if (!j.available) {
              <span class="chip tone-info">Arrives in Phase {{ j.phase }}</span>
            }
          </div>
          @if (j.scheduleNote) {
            <div class="note" [class]="j.scheduled ? 'tone-info' : 'tone-warn'">
              <rp-icon [name]="j.scheduled ? 'info' : 'alert'" [size]="17" />
              <div class="grow">{{ j.scheduleNote }}</div>
            </div>
          }
          <div class="fs">
            <h4><rp-icon name="filetext" [size]="15" /> What it does and how it behaves</h4>
            <div class="fs-b">
              <dl class="kv">
                <dt>Does</dt>
                <dd>{{ j.does }}</dd>
                <dt>Schedule</dt>
                <dd>
                  {{
                    j.time ? j.time + ' daily · Asia/Kolkata' : (j.scheduleNote ?? 'Not scheduled')
                  }}
                </dd>
                <dt>Window</dt>
                <dd>{{ j.window }}</dd>
                <dt>If the previous run didn't complete</dt>
                <dd>{{ j.previous }}</dd>
                <dt>If run twice for the same period</dt>
                <dd>{{ j.twice }}</dd>
                <dt>Specified in</dt>
                <dd>{{ j.module }} · {{ j.ref }}</dd>
              </dl>
            </div>
          </div>
          @if (log(); as l) {
            <div class="fs">
              <h4>
                <rp-icon name="building" [size]="15" /> Last run by institution ·
                {{ periodText(l.period) }}
              </h4>
              <div class="fs-b" style="padding: 0">
                <div class="tbl-wrap" style="border: 0; border-radius: 0">
                  <table class="tbl dense">
                    <thead>
                      <tr>
                        <th>Institution</th>
                        <th>Status</th>
                        <th class="r">{{ j.unit }}</th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (p of l.items; track $index) {
                        <tr>
                          <td>{{ p.institution ?? 'Platform' }}</td>
                          <td>
                            <span
                              class="chip"
                              [class.dot]="p.status !== 'SKIPPED'"
                              [class]="'tone-' + itemStatus(p.status).tone"
                              >{{ itemStatus(p.status).label }}</span
                            >
                          </td>
                          <td class="r">{{ p.processed || '—' }}</td>
                          <td class="t-sm t-muted">{{ p.note ?? '' }}</td>
                        </tr>
                      } @empty {
                        <tr>
                          <td colspan="4" class="t-muted">No institution was due.</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          }
          @if (runs().length) {
            <div class="fs">
              <h4><rp-icon name="history" [size]="15" /> Runs</h4>
              <div class="fs-b" style="padding: 0">
                <div class="tbl-wrap" style="border: 0; border-radius: 0">
                  <table class="tbl dense">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th>Trigger</th>
                        <th>Started</th>
                        <th class="r">Took</th>
                        <th>Status</th>
                        <th class="r">Processed</th>
                        <th class="r">Failed</th>
                        <th class="r">Skipped</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (x of runs(); track x.id) {
                        <tr>
                          <td class="ob-nw">{{ periodText(x.period) }}</td>
                          <td>{{ triggerText(x.trigger) }}</td>
                          <td class="ob-nw">{{ day(x.startedAt) }}</td>
                          <td class="r t-num">{{ took(x) }}</td>
                          <td>
                            <span class="chip dot" [class]="'tone-' + status(x).tone">{{
                              status(x).label
                            }}</span>
                          </td>
                          <td class="r">{{ x.processed }}</td>
                          <td class="r">
                            @if (x.failed) {
                              <b class="t-bad">{{ x.failed }}</b>
                            } @else {
                              0
                            }
                          </td>
                          <td class="r">{{ x.skipped }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          } @else if (j.available) {
            <div class="card pad">
              <rp-empty icon="timer" title="This process hasn't run yet" />
            </div>
          }
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="open.set(null)">
            <span>Close</span>
          </button>
          @if (j.available) {
            <button
              type="button"
              class="btn btn-pri"
              [disabled]="!canRun() || running()"
              [attr.title]="runTitle(j)"
              (click)="run(j)"
            >
              <rp-icon name="play" [size]="16" /><span>Run now</span>
            </button>
          }
        </ng-container>
      </rp-modal>
    }
  `,
})
export class BackofficeJobs {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionContext).ops;
  private readonly overlays = inject(Overlays);
  protected readonly rules = RULES;
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly jobs = signal<readonly Job[]>([]);
  protected readonly open = signal<Job | null>(null);
  protected readonly recent = signal<readonly JobRun[]>([]);
  protected readonly runs = signal<readonly JobRun[]>([]);
  protected readonly log = signal<JobRunLog | null>(null);
  protected readonly running = signal(false);
  protected readonly canRun = computed(
    () => this.session()?.subTasks.includes('jobs.run') ?? false,
  );
  protected readonly failed = computed(() =>
    this.jobs().filter((j) => j.money && j.lastRun && j.lastRun.status !== 'SUCCESS'),
  );
  protected readonly failedNames = computed(() =>
    this.failed()
      .map((j) => j.name)
      .join(', '),
  );
  protected readonly anyRun = computed(() => this.jobs().some((j) => j.lastRun));

  constructor() {
    void this.load();
    effect(() => {
      const j = this.open();
      this.runs.set([]);
      this.log.set(null);
      if (j?.available) void this.loadRuns(j);
    });
  }

  private async load() {
    try {
      const r = await firstValueFrom(this.http.get<{ items: Job[] }>('/api/v1/ops/jobs'));
      this.jobs.set(r.items);
      // Recent runs of the processes that have a runner (GOV-002), newest first.
      const lists = await Promise.all(
        r.items
          .filter((j) => j.available)
          .map((j) =>
            firstValueFrom(
              this.http.get<{ items: JobRun[] }>(`/api/v1/ops/jobs/${j.id}/runs`),
            ).then((x) => x.items),
          ),
      );
      this.recent.set(
        lists
          .flat()
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
          .slice(0, 10),
      );
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadRuns(j: Job) {
    try {
      const r = await firstValueFrom(
        this.http.get<{ items: JobRun[] }>(`/api/v1/ops/jobs/${j.id}/runs`),
      );
      if (this.open()?.id !== j.id) return;
      this.runs.set(r.items);
      const last = r.items[0];
      if (last) {
        const l = await firstValueFrom(this.http.get<JobRunLog>(`/api/v1/ops/job-runs/${last.id}`));
        if (this.open()?.id === j.id) this.log.set(l);
      }
    } catch {
      // The drawer still shows what the process does.
    }
  }

  /** GOV-004: a manual run for today, recorded with the reason (prototype ob.job.run). */
  protected async run(j: Job) {
    if (!j.available || !this.canRun() || this.running()) return;
    const ok = await this.overlays.confirm({
      title: `Run ${j.name} now?`,
      text: `Runs for today. What is already done for the period is skipped, so ${
        j.money ? 'no money is posted twice' : 'nothing is done twice'
      }. The run is recorded as a manual run by you.`,
      ok: 'Run now',
      tone: j.money ? 'warn' : 'brand',
      icon: 'play',
      reason: {
        label: 'Reason (recorded with the run)',
        placeholder: 'e.g. Checking renewals after a plan change',
        min: 5,
      },
    });
    if (!ok) return;
    this.running.set(true);
    try {
      const r = await firstValueFrom(
        this.http.post<JobRunLog>(
          `/api/v1/ops/jobs/${j.id}/runs`,
          { reason: ok.reason ?? '' },
          { headers: { 'Idempotency-Key': newIdempotencyKey() } },
        ),
      );
      const done = r.items.filter((i) => i.status === 'SUCCESS').length;
      const failed = r.failed ? ` · ${r.failed} failed` : '';
      this.overlays.toast(done ? `${j.name} completed` : `${j.name} — nothing to do`, {
        sub: done
          ? `${done} ${j.unit} processed · ${r.skipped} skipped${failed}`
          : `Nothing was due for ${this.periodText(r.period)} — nothing recreated`,
        tone: r.status === 'SUCCESS' ? (done ? 'ok' : 'info') : 'bad',
      });
      await this.load();
      const fresh = this.jobs().find((x) => x.id === j.id);
      if (this.open() && fresh) this.open.set(fresh);
    } catch (e) {
      this.overlays.toast('Not run', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    } finally {
      this.running.set(false);
    }
  }

  protected openById(id: string) {
    const j = this.jobs().find((x) => x.id === id);
    if (j) this.open.set(j);
  }

  protected nameOf(id: string) {
    return this.jobs().find((x) => x.id === id)?.name ?? id;
  }

  protected periodText(p: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(p) ? formatDate(p) : p;
  }

  protected triggerText(t: JobRun['trigger']) {
    return t === 'MANUAL' ? 'Manual' : t === 'CATCH_UP' ? 'Catch-up' : 'Schedule';
  }

  protected took(r: JobRun) {
    if (!r.endedAt) return '—';
    const sec = Math.max(1, Math.round((Date.parse(r.endedAt) - Date.parse(r.startedAt)) / 1000));
    return `${sec} s`;
  }

  protected itemStatus(st: JobRunLog['items'][number]['status']) {
    return ITEM[st];
  }

  protected status(r: JobRun) {
    return STATUS[r.status];
  }

  protected day(iso: string) {
    return `${formatDate(iso)} · ${formatTime(iso)}`;
  }

  protected runTitle(j: Job): string | null {
    if (!j.available) return `Arrives with its module in Phase ${j.phase}`;
    if (!this.canRun()) return "Your role doesn't hold “Run a job now”";
    return null;
  }
}
