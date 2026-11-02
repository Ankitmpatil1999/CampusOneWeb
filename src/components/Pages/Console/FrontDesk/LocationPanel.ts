import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Empty, Kpi } from '../../../Shared/Blocks';
import { Dropdown } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { formatTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { AttendanceApi, type AttendanceType } from '../Attendance/attendance.api';
import { cooling } from '../Attendance/attendance-format';
import { num, problemText } from '../Structure/academic-format';
import { SearchSelect } from '../../../Shared/SearchSelect';
import { FrontDeskApi } from './frontdesk.api';
import { loadPeople, personOptions, type Person } from './frontdesk-format';

interface Result {
  readonly ok: boolean;
  readonly title: string;
  readonly sub: string;
}

/**
 * Location attendance (prototype locView / cc.loc.tap; ATT-013, ATT-018; FR-ATT-04, RC-38): the front
 * desk records a member at a place (method manual); within the place's cooling-off the same person
 * is not counted again. Each place shows today's check-ins, its readers and its cooling-off.
 */
@Component({
  selector: 'rp-location-panel',
  imports: [Dropdown, Empty, Icon, Kpi, SearchSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (loading() && !types()) {
      <div class="c-grid s12" aria-busy="true" aria-label="Loading">
        <div class="sk" style="height: 300px; border-radius: 16px"></div>
        <div class="sk" style="height: 300px; border-radius: 16px"></div>
      </div>
    } @else if (error()) {
      <div class="card pad">
        <rp-empty icon="alertc" title="Couldn't load the places" [text]="error()">
          <button type="button" class="btn btn-sec btn-sm" (click)="load()">
            <span>Try again</span>
          </button>
        </rp-empty>
      </div>
    } @else if (!types()?.length) {
      <rp-empty
        icon="layers"
        title="No attendance types yet"
        text="Add places such as the library or the sick room under Attendance → Attendance types."
      />
    } @else {
      <div class="c-grid s12">
        <div class="card pad stack g12" id="loc-form">
          <h3 class="t-h4">Record a visit</h3>
          <p class="t-sm t-muted">
            Records a member at a place, as a manual capture. Within the place's cooling-off the
            same person isn't counted again.
          </p>
          <div class="fld" [class.invalid]="typeError()">
            <label class="fld-l" for="lc-r-b">Place</label>
            <rp-dd
              inputId="lc-r"
              placeholder="Choose a place"
              [options]="typeOptions()"
              [value]="typeId()"
              [disabled]="!!why()"
              (changed)="typeId.set($event); typeError.set('')"
            />
            <div class="fld-e" id="lc-r-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ typeError() }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="memberError()">
            <label class="fld-l" for="lc-m-b">Member</label>
            <rp-search-select
              inputId="lc-m"
              [placeholder]="peopleLoading() ? 'Loading members…' : 'Choose'"
              [options]="memberOptions()"
              [value]="memberId()"
              [disabled]="!!why()"
              (changed)="memberId.set($event); memberError.set('')"
            />
            <div class="fld-e" id="lc-m-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ memberError() }}</span>
            </div>
          </div>
          @if (!why()) {
            <button
              type="button"
              class="btn btn-pri btn-block"
              id="lc-go"
              [class.is-busy]="busy()"
              [disabled]="busy()"
              (click)="record()"
            >
              <rp-icon name="nfc" [size]="17" /><span>Record visit</span>
            </button>
          }
          @if (result(); as r) {
            <div class="cc-tapres" [class.ok]="r.ok" [class.bad]="!r.ok" role="status">
              <span class="li-ic sm"><rp-icon [name]="r.ok ? 'checkc' : 'xc'" [size]="18" /></span>
              <div class="grow">
                <b>{{ r.title }}</b
                ><span>{{ r.sub }}</span>
              </div>
            </div>
          }
        </div>
        <div class="stack g12">
          <div class="c-grid k3" id="loc-kpis">
            @for (t of types() ?? []; track t.id) {
              <rp-kpi
                [label]="t.name"
                icon="nfc"
                [tone]="t.readers ? 'ok' : null"
                [value]="num(t.checkInsToday)"
                [delta]="readersText(t) + ' · cooling-off ' + cooling(t.cooldownSeconds)"
              />
            }
            <rp-kpi label="Visits today" icon="users" tone="brand" [value]="num(total())" />
          </div>
          <p class="t-xs t-muted">
            Location readers record visits by card tap; the reader and its purpose are kept with
            each record.
          </p>
        </div>
      </div>
    }
  `,
})
export class LocationPanel {
  private readonly api = inject(FrontDeskApi);
  private readonly attendance = inject(AttendanceApi);

  /** Why visits can't be recorded ('' when they can). */
  readonly why = input('');

  protected readonly num = num;
  protected readonly cooling = cooling;
  protected readonly types = signal<readonly AttendanceType[] | null>(null);
  private readonly people = signal<readonly Person[]>([]);
  protected readonly peopleLoading = signal(true);
  protected readonly typeId = signal('');
  protected readonly memberId = signal('');
  protected readonly typeError = signal('');
  protected readonly memberError = signal('');
  protected readonly result = signal<Result | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly typeOptions = computed(() =>
    (this.types() ?? []).map((t) => ({
      v: t.id,
      l: t.name,
      sub: `Cooling-off ${cooling(t.cooldownSeconds)}`,
    })),
  );
  protected readonly memberOptions = computed(() => personOptions(this.people()));
  protected readonly total = computed(() =>
    (this.types() ?? []).reduce((n, t) => n + t.checkInsToday, 0),
  );

  constructor() {
    void this.load();
    void this.loadPeople();
  }

  async load() {
    this.loading.set(true);
    try {
      const t = (await this.attendance.types()).items;
      this.types.set(t);
      if (!this.typeId() && t[0]) this.typeId.set(t[0].id);
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadPeople() {
    try {
      this.people.set(await loadPeople(this.attendance));
    } catch {
      // The member list stays empty; the error shows on recording.
    } finally {
      this.peopleLoading.set(false);
    }
  }

  protected readersText(t: AttendanceType) {
    return t.readers === 1 ? '1 reader' : `${num(t.readers)} readers`;
  }

  /** cc.loc.tap: record the member at the place (ATT-018). */
  protected async record() {
    let ok = true;
    if (!this.typeId()) {
      this.typeError.set('Choose a place');
      ok = false;
    }
    if (!this.memberId()) {
      this.memberError.set('Choose a member');
      ok = false;
    }
    if (!ok || this.why()) return;
    const who = this.people().find((p) => p.id === this.memberId());
    const place = this.types()?.find((t) => t.id === this.typeId());
    this.busy.set(true);
    try {
      const r = await this.api.location(this.typeId(), this.memberId());
      this.result.set({
        ok: true,
        title: `Recorded · ${r.location} · ${formatTime(r.at)}`,
        sub: `${who?.name ?? r.member.name}${who ? ' · ' + (who.admissionNo ?? who.type) : ''} · recorded at the front desk`,
      });
      void this.load();
    } catch (e) {
      const wait = e instanceof ApiProblem && e.code === 'ATT.LOCATION_WAIT';
      this.result.set({
        ok: false,
        title: wait ? 'Already recorded — cooling-off' : 'Not recorded',
        sub: wait
          ? `${problemText(e)} ${place ? `The cooling-off at ${place.name} is ${cooling(place.cooldownSeconds)}.` : ''}`.trim()
          : problemText(e),
      });
    } finally {
      this.busy.set(false);
    }
  }
}
