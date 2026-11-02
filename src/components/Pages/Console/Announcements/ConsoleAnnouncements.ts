import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Dropdown } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { formatDate, formatTime } from '../../../Utils/format';
import { person } from '../Applications/app-format';
import { taskAccess } from '../Attendance/attendance-format';
import { num, problemText } from '../Structure/academic-format';
import { AcademicYears, YearPicker } from '../Structure/academic-year';
import { AnnouncementDrawer } from './AnnouncementDrawer';
import {
  AnnouncementsApi,
  type Announcement,
  type AnnouncementList,
  type DispatchStatus,
} from './announcements.api';
import { DISPATCH, audience, channelOf, stateOf } from './announcement-format';
import { NewAnnouncement } from './NewAnnouncement';

type Pill = 'all' | DispatchStatus;

/**
 * c.announcements — Announcements (SRS 23.2, 23.3, 23.6, FR-COM-01…03, BR-70, CR-13; COM-001…006;
 * prototype c.announcements): the year's announcements with delivery and acknowledgement figures,
 * search, category and dispatch filters, an announcement's drawer and a new announcement.
 */
@Component({
  selector: 'rp-console-announcements',
  imports: [AnnouncementDrawer, Dropdown, Empty, Icon, Kpi, NewAnnouncement, PageHead, YearPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head title="Announcements" [sub]="sub()">
        @if (!access.denied()) {
          <span class="cp-why" [attr.title]="access.why('comms.send') || null"
            ><button
              type="button"
              class="btn btn-pri"
              id="an-new"
              [disabled]="!!access.why('comms.send') || !list()"
              (click)="creating.set(true)"
            >
              <rp-icon name="megaphone" [size]="17" /><span>New announcement</span>
            </button></span
          >
        }
      </rp-page-head>

      @if (access.denied()) {
        <rp-empty
          icon="lock"
          title="You don't have access to this page"
          [text]="access.deniedText()"
        />
      } @else if (loading() && !list()) {
        <div class="stack g16" aria-busy="true" aria-label="Loading">
          <div class="c-grid k4 cc-kp">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="sk" style="height: 104px; border-radius: 16px"></div>
            }
          </div>
          <div class="sk" style="height: 44px; border-radius: 12px"></div>
          <div class="sk" style="height: 360px; border-radius: 16px"></div>
        </div>
      } @else if (error() && !list()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the announcements" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="load()">
              <span>Try again</span>
            </button>
          </rp-empty>
        </div>
      } @else if (list(); as l) {
        @if (access.management()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">
              <b>Read-only.</b> Management can view announcements but not send them.
            </div>
          </div>
        }
        <div class="c-grid k4 cc-kp" id="an-kpis">
          <rp-kpi
            label="Sent this month"
            icon="megaphone"
            [value]="num(month())"
            [delta]="num(items().length) + ' this year'"
          />
          <rp-kpi
            label="Delivered"
            icon="checkc"
            tone="ok"
            [value]="num(sum('success'))"
            delta="Across all channels"
          />
          <rp-kpi
            label="Delivery failures"
            icon="alert"
            tone="bad"
            [value]="num(sum('failed'))"
            [delta]="num(sum('skipped')) + ' skipped'"
          />
          <rp-kpi
            label="Awaiting acknowledgement"
            icon="hand"
            tone="accent"
            [value]="num(awaiting())"
            [delta]="num(needAck()) + ' need it'"
          />
        </div>
        <div class="c-filters">
          <label class="search">
            <rp-icon name="search" [size]="16" />
            <input
              type="search"
              id="an-q"
              placeholder="Title, code or text"
              aria-label="Search announcements"
              autocomplete="off"
              [value]="q()"
              (input)="q.set($any($event.target).value)"
            />
          </label>
          <div class="fld">
            <rp-dd
              inputId="an-cat"
              placeholder="All categories"
              [options]="catOptions()"
              [value]="cat()"
              (changed)="cat.set($event)"
            />
          </div>
          <div class="pills" role="group" aria-label="Dispatch">
            @for (p of pills; track p.v) {
              <button
                type="button"
                class="pill"
                [class.on]="pill() === p.v"
                [attr.aria-pressed]="pill() === p.v"
                (click)="pill.set(p.v)"
              >
                {{ p.l() }}
              </button>
            }
          </div>
          <rp-year-picker inputId="an-year" />
        </div>
        <div class="tbl-wrap">
          <table class="tbl" id="an-table">
            <thead>
              <tr>
                <th>Sent</th>
                <th>Announcement</th>
                <th>Category</th>
                <th>Channels</th>
                <th>Dispatch</th>
                <th>Acknowledged</th>
              </tr>
            </thead>
            <tbody>
              @for (a of shown(); track a.id) {
                <tr
                  tabindex="0"
                  [attr.aria-label]="a.title"
                  [class.t-muted]="!!a.withdrawn"
                  (click)="open.set(a)"
                  (keydown.enter)="open.set(a)"
                >
                  <td>
                    <span class="t-mono t-xs">{{ a.code }}</span>
                    <div class="cell-s">{{ when(a.dispatch.at ?? a.sendAt) }}</div>
                  </td>
                  <td>
                    <div class="row g6">
                      <b class="t-sb t-clip" style="max-width: 280px">{{ a.title }}</b>
                      @if (a.important) {
                        <span class="t-bad" title="High importance"
                          ><rp-icon name="alertc" [size]="14"
                        /></span>
                      }
                      @if (a.ackRequired) {
                        <span class="t-muted" title="Acknowledgement required"
                          ><rp-icon name="hand" [size]="14"
                        /></span>
                      }
                    </div>
                    <div class="cell-s">
                      {{ audience(a) }} · by {{ person(a.author) || 'The institution' }}
                    </div>
                  </td>
                  <td>
                    <span class="cc-cat" [style.--c]="a.category.colour">{{
                      a.category.label
                    }}</span>
                  </td>
                  <td>
                    <div class="row g4">
                      @for (c of a.channels; track c) {
                        <span class="cc-ch" [attr.title]="channelOf(c).l"
                          ><rp-icon [name]="channelOf(c).icon" [size]="13"
                        /></span>
                      }
                    </div>
                  </td>
                  <td>
                    @if (a.withdrawn) {
                      <span class="chip tone-neutral dot">Withdrawn</span>
                    } @else {
                      <span class="chip dot" [class]="'chip dot tone-' + state(a).tone">{{
                        state(a).l
                      }}</span>
                    }
                    <div class="cell-s">{{ dispatchText(a) }}</div>
                  </td>
                  <td>
                    @if (a.acknowledgements; as k) {
                      <div class="cc-pbar">
                        <span class="t-num">{{ ackPct(k) }}%</span>
                        <div class="bar" [class.ok]="ackPct(k) >= 80" [class.warn]="ackPct(k) < 80">
                          <i [style.width.%]="ackPct(k)"></i>
                        </div>
                      </div>
                    } @else {
                      <span class="t-faint">{{
                        a.ackRequired ? 'After sending' : 'Not needed'
                      }}</span>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6">
                    <rp-empty
                      icon="megaphone"
                      [title]="
                        items().length
                          ? 'No announcements match'
                          : 'No announcements in ' + yearLabel()
                      "
                      [text]="
                        items().length
                          ? 'Try clearing the filters.'
                          : 'Send the first one to students, parents or staff.'
                      "
                    >
                      @if (items().length) {
                        <button type="button" class="btn btn-sec btn-sm" (click)="reset()">
                          <span>Clear filters</span>
                        </button>
                      }
                    </rp-empty>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (next()) {
          <div class="row" style="justify-content: center">
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              [class.is-busy]="loading()"
              [disabled]="loading()"
              (click)="more()"
            >
              <span>Show older announcements</span>
            </button>
          </div>
        }
      }
    </div>

    @if (open(); as a) {
      <rp-announcement-drawer
        [item]="a"
        [canSend]="!access.why('comms.send')"
        (closed)="open.set(null)"
        (changed)="replace($event)"
      />
    }
    @if (creating() && list(); as l) {
      <rp-new-announcement
        [categories]="l.categories"
        [enabled]="l.channels"
        [yearLabel]="yearLabel()"
        (closed)="creating.set(false)"
        (saved)="created($event)"
      />
    }
  `,
})
export class ConsoleAnnouncements {
  private readonly api = inject(AnnouncementsApi);
  private readonly years = inject(AcademicYears);
  protected readonly access = taskAccess(inject(SessionContext).console, 'comms.view');

  protected readonly num = num;
  protected readonly person = person;
  protected readonly audience = audience;
  protected readonly channelOf = channelOf;
  protected readonly pills: readonly { v: Pill; l: () => string }[] = [
    { v: 'all', l: () => 'All' },
    { v: 'QUEUED', l: DISPATCH.QUEUED.l },
    { v: 'PROCESSING', l: DISPATCH.PROCESSING.l },
    { v: 'COMPLETED', l: DISPATCH.COMPLETED.l },
    { v: 'FAILED', l: DISPATCH.FAILED.l },
  ];

  protected readonly list = signal<AnnouncementList | null>(null);
  protected readonly items = signal<readonly Announcement[]>([]);
  protected readonly next = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly q = signal('');
  protected readonly cat = signal('');
  protected readonly pill = signal<Pill>('all');
  protected readonly open = signal<Announcement | null>(null);
  protected readonly creating = signal(false);

  protected readonly yearLabel = computed(() => this.years.selected()?.label ?? '');
  protected readonly sub = computed(
    () =>
      `Messages to groups across channels, with delivery and acknowledgement tracking${this.yearLabel() ? ` · ${this.yearLabel()}` : ''}`,
  );
  protected readonly catOptions = computed(() => [
    { v: '', l: 'All categories' },
    ...(this.list()?.categories ?? []).map((c) => ({ v: c.code, l: c.label })),
  ]);
  protected readonly shown = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.items().filter(
      (a) =>
        (!this.cat() || a.category.code === this.cat()) &&
        (this.pill() === 'all' || a.dispatch.status === this.pill()) &&
        (!q || `${a.title} ${a.code} ${a.text}`.toLowerCase().includes(q)),
    );
  });
  /** Sent this calendar month (IST month of the dispatch). */
  protected readonly month = computed(() => {
    const m = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7);
    return this.items().filter(
      (a) =>
        a.dispatch.at &&
        new Date(new Date(a.dispatch.at).getTime() + 330 * 60_000).toISOString().slice(0, 7) === m,
    ).length;
  });
  protected readonly awaiting = computed(() =>
    this.items().reduce(
      (s, a) =>
        s +
        (a.acknowledgements && !a.withdrawn
          ? a.acknowledgements.of - a.acknowledgements.acknowledged
          : 0),
      0,
    ),
  );
  protected readonly needAck = computed(
    () => this.items().filter((a) => a.ackRequired && !a.withdrawn).length,
  );

  private refresh: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.refresh));
    void this.years.load();
    // The list is the year in context's (CR-13): read once the years are known, again on a change.
    effect(() => {
      this.years.selectedId();
      if (!this.years.loaded()) return;
      untracked(() => void this.load());
    });
  }

  async load(cursor: string | null = null) {
    if (this.access.denied()) return;
    this.loading.set(true);
    try {
      const r = await this.api.list({ yearId: this.years.selectedId(), cursor });
      this.list.set(r);
      this.items.set(cursor ? [...this.items(), ...r.items] : r.items);
      this.next.set(r.nextCursor);
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected more() {
    const c = this.next();
    if (c) void this.load(c);
  }
  protected reset() {
    this.q.set('');
    this.cat.set('');
    this.pill.set('all');
  }
  protected state(a: Announcement) {
    return stateOf(a);
  }
  protected when(iso: string) {
    return `${formatDate(iso)}, ${formatTime(iso)}`;
  }
  protected dispatchText(a: Announcement) {
    if (a.scheduled) return `Sends ${this.when(a.sendAt)}`;
    const d = a.dispatch;
    if (d.status === 'QUEUED' || d.status === 'PROCESSING')
      return `${num(d.success + d.failed + d.skipped)} of ${num(d.recipients)} so far`;
    const parts = [`${num(d.success)} sent`];
    if (d.failed) parts.push(`${num(d.failed)} failed`);
    if (d.skipped) parts.push(`${num(d.skipped)} skipped`);
    return parts.join(' · ');
  }
  protected sum(k: 'success' | 'failed' | 'skipped') {
    return this.items().reduce((s, a) => s + a.dispatch[k], 0);
  }
  protected ackPct(k: { acknowledged: number; of: number }) {
    return k.of ? Math.round((k.acknowledged * 100) / k.of) : 0;
  }
  protected replace(a: Announcement) {
    this.items.update((l) => l.map((x) => (x.id === a.id ? { ...x, ...a } : x)));
  }
  protected created(a: Announcement) {
    this.creating.set(false);
    this.items.update((l) => [a, ...l.filter((x) => x.id !== a.id)]);
    // The dispatch runs in the background: read the counts again shortly.
    clearTimeout(this.refresh);
    this.refresh = setTimeout(() => void this.load(), 2500);
  }
}
