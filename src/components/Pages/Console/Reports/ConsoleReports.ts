import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { plural } from '../Fees/fee-format';
import { problemText } from '../Structure/academic-format';
import { AcademicYears, YearPicker } from '../Structure/academic-year';
import { ExportsApi, download } from './report-export';
import { periodText, reportIcon } from './report-format';
import { ReportDrawer } from './ReportDrawer';
import { ReportsApi, type Catalogue, type ReportEntry, type RunParams } from './reports.api';

/**
 * c.reports — Reports (SRS 24, FR-RPT-01, CR-13, CR-17; RPT-002…005; prototype c.reports): every
 * report the role may open, grouped by area, each with the screen that owns it and a CSV export of
 * the academic year in context (prepared off the request, then downloaded from a signed link). A
 * report's rows open in a drawer from its title.
 */
@Component({
  selector: 'rp-console-reports',
  imports: [Empty, Icon, PageHead, ReportDrawer, RouterLink, YearPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Reports"
        sub="Every report your role can open, grouped by area. Exports cover the academic year in context."
      >
        <rp-year-picker inputId="rep-year" />
      </rp-page-head>

      @if (loading() && !cat()) {
        <div class="stack g16" aria-busy="true" aria-label="Loading">
          <div class="sk" style="height: 44px; border-radius: 12px"></div>
          <div class="sk" style="height: 52px; border-radius: 12px"></div>
          <div class="cp-reps">
            @for (i of [1, 2, 3, 4, 5, 6]; track i) {
              <div class="sk" style="height: 116px; border-radius: 16px"></div>
            }
          </div>
        </div>
      } @else if (error() && !cat()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the reports" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="load()">
              <span>Try again</span>
            </button>
          </rp-empty>
        </div>
      } @else if (cat(); as c) {
        <div class="c-filters">
          <label class="search">
            <rp-icon name="search" [size]="16" />
            <input
              type="search"
              id="rep-q"
              placeholder="Find a report"
              aria-label="Find a report"
              autocomplete="off"
              [value]="q()"
              (input)="q.set($any($event.target).value)"
            />
          </label>
          <div class="pills" role="group" aria-label="Area">
            <button
              type="button"
              class="pill"
              [class.on]="!area()"
              [attr.aria-pressed]="!area()"
              (click)="area.set('')"
            >
              All<span class="n">{{ c.reports.length }}</span>
            </button>
            @for (a of c.areas; track a) {
              <button
                type="button"
                class="pill"
                [class.on]="area() === a"
                [attr.aria-pressed]="area() === a"
                (click)="area.set(a)"
              >
                {{ a }}<span class="n">{{ count(a) }}</span>
              </button>
            }
          </div>
        </div>
        <div class="note tone-info">
          <rp-icon name="calendar" [size]="17" />
          <div class="grow">
            Year in context: <b>{{ yearLabel() || '—' }}</b
            >. Change it from the academic-year control to export another year (CR-13). Exports are
            recorded in the activity log.
          </div>
        </div>
        @for (g of groups(); track g.area) {
          <section class="stack g8">
            <div class="sec-h">
              <h3>{{ g.area }}</h3>
              <span class="t-xs t-muted">{{ plural(g.items.length, 'report') }}</span>
            </div>
            <div class="cp-reps">
              @for (r of g.items; track r.id) {
                <div class="cp-rep" [attr.data-report]="r.id">
                  <span class="cp-rep-ic"><rp-icon [name]="icon(r.id)" [size]="18" /></span>
                  <div class="grow">
                    <b
                      ><button
                        type="button"
                        class="cp-rep-t"
                        style="all: unset; cursor: pointer"
                        [attr.aria-label]="'View ' + r.title"
                        (click)="view.set(r)"
                      >
                        {{ r.title }}
                      </button></b
                    >
                    <p>{{ r.description }}</p>
                    <span class="t-xs t-faint"
                      ><rp-icon name="clock" [size]="12" />
                      {{ exported()[r.id] ? 'Exported just now' : covers(r) }}</span
                    >
                  </div>
                  <div class="cp-rep-a">
                    <a class="btn btn-ghost btn-sm" [routerLink]="link(r)"><span>Open</span></a>
                    <button
                      type="button"
                      class="btn btn-sec btn-sm"
                      [class.is-busy]="busy() === r.id"
                      [disabled]="busy() === r.id"
                      (click)="exportIt(r)"
                    >
                      <rp-icon name="download" [size]="15" /><span>Export</span>
                    </button>
                  </div>
                </div>
              }
            </div>
          </section>
        } @empty {
          <div class="card pad">
            <rp-empty icon="report" title="No reports match" text="Try another word or area.">
              <button type="button" class="btn btn-sec btn-sm" (click)="reset()">
                <span>Show all</span>
              </button>
            </rp-empty>
          </div>
        }
      }
    </div>

    @if (view(); as r) {
      <rp-report-drawer
        [report]="r"
        [yearId]="years.selectedId()"
        [start]="rangeFrom()"
        [end]="rangeTo()"
        [exporting]="busy() === r.id"
        (closed)="view.set(null)"
        (exportIt)="exportIt(r, $event)"
      />
    }
  `,
})
export class ConsoleReports implements OnInit {
  private readonly api = inject(ReportsApi);
  private readonly exportsApi = inject(ExportsApi);
  private readonly overlays = inject(Overlays);
  protected readonly years = inject(AcademicYears);

  protected readonly plural = plural;
  protected readonly cat = signal<Catalogue | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly q = signal('');
  protected readonly area = signal('');
  protected readonly busy = signal('');
  protected readonly view = signal<ReportEntry | null>(null);
  protected readonly exported = signal<Readonly<Record<string, true>>>({});

  protected readonly yearLabel = computed(() => this.years.selected()?.label ?? '');
  /** A range report's default period: the year in context, up to today while it runs. */
  protected readonly rangeFrom = computed(() => this.years.selected()?.startsOn ?? '');
  protected readonly rangeTo = computed(() => {
    const end = this.years.selected()?.endsOn ?? '';
    const now = new Date().toISOString().slice(0, 10);
    return end && end > now ? now : end;
  });

  protected readonly filtered = computed(() => {
    const c = this.cat();
    if (!c) return [];
    const q = this.q().trim().toLowerCase();
    return c.reports.filter(
      (r) =>
        (!this.area() || r.area === this.area()) &&
        (!q || `${r.title} ${r.description} ${r.area}`.toLowerCase().includes(q)),
    );
  });
  protected readonly groups = computed(() => {
    const list = this.filtered();
    return (this.cat()?.areas ?? [])
      .map((area) => ({ area, items: list.filter((r) => r.area === area) }))
      .filter((g) => g.items.length);
  });

  ngOnInit() {
    void this.years.load();
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.cat.set(await this.api.catalogue());
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected count(a: string) {
    return this.cat()?.reports.filter((r) => r.area === a).length ?? 0;
  }
  protected icon(id: string) {
    return reportIcon(id);
  }
  protected covers(r: ReportEntry) {
    return periodText(r, this.yearLabel());
  }
  protected link(r: ReportEntry) {
    return '/console/' + r.screen.replace(/^c\./, '');
  }
  protected reset() {
    this.q.set('');
    this.area.set('');
  }

  /** The export's period: the year in context (CR-13), or its dates for a range report. */
  private params(r: ReportEntry): RunParams {
    const id = this.years.selectedId();
    if (r.period === 'year') return id ? { yearId: id } : {};
    if (r.period === 'range' && this.rangeFrom())
      return { from: this.rangeFrom(), to: this.rangeTo() };
    return {};
  }

  protected async exportIt(r: ReportEntry, p: RunParams = this.params(r)) {
    if (this.busy()) return;
    this.busy.set(r.id);
    try {
      const { exportId } = await this.api.exportReport(r.id, p);
      const x = await this.exportsApi.ready(exportId, 'console');
      if (x.file) download(x.file);
      this.exported.update((m) => ({ ...m, [r.id]: true }));
      const what = r.period === 'now' ? 'As it stands now' : this.yearLabel();
      this.overlays.toast('CSV export prepared', {
        sub: `${r.title} · ${what}${x.truncated ? ' · first rows only' : ''}`,
      });
    } catch (e) {
      this.overlays.toast("Couldn't export the report", { sub: problemText(e), tone: 'bad' });
    } finally {
      this.busy.set('');
    }
  }
}
