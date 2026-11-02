import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { Dropdown } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { PATTERNS } from '../../../Utils/patterns';
import { ApiProblem } from '../../../Utils/problem';
import { AttendanceApi } from '../Attendance/attendance.api';
import { problemText } from '../Structure/academic-format';
import { SearchSelect } from '../../../Shared/SearchSelect';
import { FrontDeskApi, type Visitor } from './frontdesk.api';
import { PURPOSES, loadPeople, personOptions, type Person } from './frontdesk-format';

type Field = 'name' | 'mobile' | 'purpose' | 'host';
const NAME = /^[A-Za-zÀ-ÿ.'-]+(?:\s[A-Za-zÀ-ÿ.'-]+)*$/;

/**
 * Check in a visitor (prototype cc.vis.new / cc.vis.save; ATT-016): name, mobile (kept encrypted,
 * shown masked), purpose and whom they are here to see.
 */
@Component({
  selector: 'rp-visitor-drawer',
  imports: [Dropdown, Icon, Modal, SearchSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Check in a visitor"
      sub="The visit stays open until they check out"
      icon="userplus"
      [drawer]="true"
      [slim]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="vis-form">
        <div class="c-form">
          <div class="full">
            <div class="fld" [class.invalid]="err('name')">
              <label class="fld-l" for="vi-n">Visitor's name<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="vi-n"
                  type="text"
                  maxlength="80"
                  autocomplete="off"
                  aria-describedby="vi-n-e"
                  [value]="name()"
                  (input)="name.set(val($event)); clear('name')"
                />
              </div>
              <div class="fld-e" id="vi-n-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('name') }}</span>
              </div>
            </div>
          </div>
          <div class="full">
            <div class="fld" [class.invalid]="err('mobile')">
              <label class="fld-l" for="vi-m">Mobile<span class="req">*</span></label>
              <div class="fld-in">
                <span class="pre">+91</span
                ><input
                  id="vi-m"
                  type="tel"
                  inputmode="numeric"
                  maxlength="10"
                  autocomplete="off"
                  aria-describedby="vi-m-e"
                  [value]="mobile()"
                  (input)="mobile.set(digits($event)); clear('mobile')"
                />
              </div>
              <div class="fld-e" id="vi-m-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('mobile') }}</span>
              </div>
            </div>
          </div>
          <div class="full">
            <div class="fld" [class.invalid]="err('purpose')">
              <label class="fld-l" for="vi-p-b">Purpose<span class="req">*</span></label>
              <rp-dd
                inputId="vi-p"
                placeholder="Choose"
                [options]="purposes"
                [value]="purpose()"
                (changed)="purpose.set($event); clear('purpose')"
              />
              <div class="fld-e" id="vi-p-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('purpose') }}</span>
              </div>
            </div>
          </div>
          <div class="full">
            <div class="fld" [class.invalid]="err('host')">
              <label class="fld-l" for="vi-h-b">Meeting<span class="req">*</span></label>
              <rp-search-select
                inputId="vi-h"
                [placeholder]="hostsLoading() ? 'Loading staff…' : 'Who are they here to see?'"
                [options]="hostOptions()"
                [value]="host()"
                (changed)="host.set($event); clear('host')"
              />
              <div class="fld-e" id="vi-h-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('host') }}</span>
              </div>
            </div>
          </div>
        </div>
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }
        <p class="t-xs t-muted">
          The mobile number is stored encrypted and shown masked. No identity-document number is
          recorded.
        </p>
      </div>
      <div modal-foot class="cc-foot">
        <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="vi-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <rp-icon name="check" [size]="17" /><span>Check in</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class VisitorDrawer {
  private readonly api = inject(FrontDeskApi);
  private readonly attendance = inject(AttendanceApi);
  private readonly overlays = inject(Overlays);

  readonly closed = output<void>();
  readonly checkedIn = output<Visitor>();

  protected readonly purposes = PURPOSES.map((p) => ({ v: p, l: p }));
  protected readonly name = signal('');
  protected readonly mobile = signal('');
  protected readonly purpose = signal('');
  protected readonly host = signal('');
  private readonly hosts = signal<readonly Person[]>([]);
  protected readonly hostsLoading = signal(true);
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly hostOptions = computed(() => [
    { v: 'Front office', l: 'Front office', sub: 'Enquiries at the desk' },
    ...personOptions(this.hosts()),
  ]);

  constructor() {
    void this.loadHosts();
  }

  private async loadHosts() {
    try {
      this.hosts.set(await loadPeople(this.attendance, ['TEACHER', 'STAFF']));
    } catch {
      // Only the front office can be chosen.
    } finally {
      this.hostsLoading.set(false);
    }
  }

  protected err(f: Field) {
    return this.errors()[f] ?? '';
  }
  protected clear(f: Field) {
    if (this.errors()[f]) this.errors.update((e) => ({ ...e, [f]: '' }));
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected digits(e: Event) {
    const el = e.target as HTMLInputElement;
    const v = el.value.replace(/\D/g, '').slice(0, 10);
    if (v !== el.value) el.value = v;
    return v;
  }

  /** The prototype's checks (cc.vis.save), then ATT-016. */
  protected async save() {
    const e: Partial<Record<Field, string>> = {};
    const name = this.name().trim().replace(/\s+/g, ' ');
    if (!name) e.name = "Enter the visitor's name";
    else if (!NAME.test(name)) e.name = 'Use letters only';
    else if (name.length < 2 || name.length > 80) e.name = 'Use 2–80 characters';
    if (!this.mobile()) e.mobile = 'Enter a mobile number';
    else if (!PATTERNS.mobile.test(this.mobile()))
      e.mobile = 'Enter a valid 10-digit mobile number';
    if (!this.purpose()) e.purpose = 'Choose a purpose';
    if (!this.host()) e.host = "Choose who they're meeting";
    this.errors.set(e);
    if (Object.values(e).some(Boolean)) return;
    const host = this.hostOptions().find((o) => o.v === this.host())?.l ?? this.host();
    this.busy.set(true);
    this.error.set('');
    try {
      const v = await this.api.record({
        name,
        mobile: this.mobile(),
        purpose: this.purpose(),
        toMeet: host,
      });
      this.overlays.toast('Visitor checked in', { sub: `${v.name} · meeting ${host}` });
      this.checkedIn.emit(v);
    } catch (x) {
      this.error.set(x instanceof ApiProblem ? x.detail : problemText(x));
    } finally {
      this.busy.set(false);
    }
  }
}
