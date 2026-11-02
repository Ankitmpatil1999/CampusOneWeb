/**
 * The academic year in context for the academics pages (CR-13; ACA-001). The prototype keeps one
 * year for the whole console (the top bar's year control, `RP.S.year`); here the academics pages
 * share it through this service and each shows the console's year dropdown in its filters, as
 * c.fees and c.feerecords do. A closed year is read-only: the pages show the prototype's banner
 * (RP.yearBanner) and refuse writes before the server does (ACA.YEAR_CLOSED).
 */
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  Injectable,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';

export interface AcademicYear {
  readonly id: string;
  readonly label: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly status: 'OPEN' | 'CLOSED';
  readonly current: boolean;
  readonly version: number;
}

/** The year block the academics APIs return with their lists. */
export interface YearRef {
  readonly id: string;
  readonly label: string;
  readonly startsOn?: string;
  readonly endsOn?: string;
  readonly closed?: boolean;
  readonly current?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AcademicYears {
  private readonly http = inject(HttpClient);

  readonly items = signal<readonly AcademicYear[]>([]);
  readonly loaded = signal(false);
  readonly error = signal('');
  /** The chosen year; empty means the institution's current year. */
  private readonly chosen = signal('');
  private pending: Promise<void> | null = null;

  readonly current = computed(() => this.items().find((y) => y.current) ?? null);
  readonly selected = computed(
    () => this.items().find((y) => y.id === this.chosen()) ?? this.current() ?? null,
  );
  /** The year id to send (empty: the server takes the current year). */
  readonly selectedId = computed(() => this.selected()?.id ?? '');
  readonly closed = computed(() => this.selected()?.status === 'CLOSED');
  readonly options = computed<DropdownOption[]>(() =>
    [...this.items()]
      .sort((a, b) => b.startsOn.localeCompare(a.startsOn))
      .map((y) => ({
        v: y.id,
        l: `Academic year ${y.label}`,
        ...(y.current ? { sub: 'Current' } : y.status === 'CLOSED' ? { sub: 'Closed' } : {}),
      })),
  );

  /** Loads the years once (ACA-001); `force` reloads them. */
  load(force = false): Promise<void> {
    if (this.loaded() && !force) return Promise.resolve();
    this.pending ??= this.fetch().finally(() => (this.pending = null));
    return this.pending;
  }

  private async fetch() {
    try {
      const r = await firstValueFrom(
        this.http.get<{ items: AcademicYear[] }>('/api/v1/console/academic-years'),
      );
      this.items.set(r.items);
      this.error.set('');
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.loaded.set(true);
    }
  }

  select(id: string) {
    this.chosen.set(id);
  }

  /** Back to the institution's current year (the banner's "Back to current year"). */
  toCurrent() {
    this.chosen.set('');
  }

  /** The year that starts after `y` (the roll-over target), if the institution has added it. */
  after(y: { endsOn: string } | null): AcademicYear | null {
    if (!y) return null;
    return (
      [...this.items()]
        .filter((x) => x.startsOn > y.endsOn)
        .sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0] ?? null
    );
  }

  /** The year that ended before `y` started (copying assignments from it). */
  before(y: { startsOn: string } | null): AcademicYear | null {
    if (!y) return null;
    return (
      [...this.items()]
        .filter((x) => x.endsOn < y.startsOn)
        .sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0] ?? null
    );
  }
}

/** The console's year dropdown (as c.feerecords): "Academic year 2026-27", Current / Closed. */
@Component({
  selector: 'rp-year-picker',
  imports: [Dropdown],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `@if (years.options().length > 1) {
    <div class="fld">
      <rp-dd
        [inputId]="inputId()"
        placeholder="Academic year"
        [options]="years.options()"
        [value]="years.selectedId()"
        (changed)="years.select($event)"
      />
    </div>
  }`,
})
export class YearPicker {
  protected readonly years = inject(AcademicYears);
  readonly inputId = input('ay-year');
}

/** RP.yearBanner: shown above a year-scoped page while a closed year is in context. */
@Component({
  selector: 'rp-year-banner',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `@if (years.closed()) {
    <div class="c-yr-banner" role="status">
      <rp-icon name="lock" [size]="15" />
      <span
        >You're viewing <b>{{ years.selected()?.label }}</b
        >, which is closed. Records are read-only; a correction needs coordinator + administrator
        approval.</span
      >
      @if (years.current()) {
        <button type="button" class="linkbtn" style="margin-left: auto" (click)="years.toCurrent()">
          Back to current year
        </button>
      }
    </div>
  }`,
})
export class YearBanner {
  protected readonly years = inject(AcademicYears);
}
