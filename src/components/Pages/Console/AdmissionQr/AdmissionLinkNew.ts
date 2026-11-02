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
import type { DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { istBusinessDate } from '../../../Utils/format';
import { newIdempotencyKey } from '../../../Utils/ids';
import { isRealDate } from '../../../Utils/patterns';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { SelectField, TextField } from '../Applications/AppFields';
import { yearStarted, type YearOption } from '../Applications/ConsoleApplications';
import { AdmissionLinksApi, type AdmissionLink } from './admission-links.api';

/**
 * Generate the admission link, or replace the current one (prototype cp.aq.gen / cp.aq.replace;
 * INS-028): the academic year the form opens on (or every open year) and, optionally, the last day
 * the link works. Replacing stops the current link and QR straight away; drafts already started
 * are kept and can be resumed.
 */
@Component({
  selector: 'rp-admission-link-new',
  imports: [Icon, Modal, SelectField, TextField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="replacing() ? 'Replace this link?' : 'Generate the admission link'"
      [sub]="
        replacing()
          ? 'A new link and QR are made; the current ones stop working.'
          : 'Families open the public form from the link or the QR.'
      "
      [icon]="replacing() ? 'refresh' : 'qr'"
      cls="cm-m"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="ql-form">
        @if (replacing()) {
          <div class="note tone-warn">
            <rp-icon name="alert" [size]="17" />
            <div class="grow">
              The current link and QR stop working straight away; anyone opening them sees a note to
              ask the school for the new one. Drafts already started are kept and can be resumed.
            </div>
          </div>
        }
        <rp-sf
          fid="ql-year"
          label="Academic year the form opens on"
          [options]="yearOptions()"
          [value]="yearId()"
          (valueChange)="yearId.set($event)"
          hint="The family can still choose another year that's open."
        />
        <rp-tf
          fid="ql-exp"
          label="Link works until"
          type="date"
          [opt]="true"
          [min]="tomorrow"
          hint="Leave it empty to keep the link working until it is replaced."
          [error]="expErr()"
          [value]="exp()"
          (valueChange)="exp.set($event); expErr.set('')"
        />
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }
      </div>
      <div modal-foot class="row g8">
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="ql-go"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="go()"
        >
          <rp-icon [name]="replacing() ? 'refresh' : 'qr'" [size]="17" /><span>{{
            replacing() ? 'Replace link' : 'Generate link'
          }}</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class AdmissionLinkNew implements OnInit {
  private readonly api = inject(AdmissionLinksApi);
  private readonly overlays = inject(Overlays);

  /** The link in use (replace) or null (generate). */
  readonly current = input<AdmissionLink | null>(null);
  /** Years open for admission. */
  readonly years = input<readonly YearOption[]>([]);
  readonly closed = output<void>();
  readonly generated = output<AdmissionLink>();

  protected readonly today = istBusinessDate(new Date());
  protected readonly tomorrow = new Date(Date.now() + 86_400_000 + 330 * 60_000)
    .toISOString()
    .slice(0, 10);
  protected readonly yearId = signal('');
  protected readonly exp = signal('');
  protected readonly expErr = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  private readonly key = newIdempotencyKey();

  protected readonly replacing = computed(() => !!this.current());
  protected readonly yearOptions = computed<DropdownOption[]>(() => [
    { v: '', l: 'Every open year', sub: 'The family chooses' },
    ...this.years().map((y) => ({
      v: y.id,
      l: y.label,
      sub: yearStarted(y, this.today) ? 'Mid-term admissions' : 'Admissions open',
    })),
  ]);

  ngOnInit() {
    const label = this.current()?.year;
    const y = label ? this.years().find((x) => x.label === label) : null;
    if (y) this.yearId.set(y.id);
  }

  protected async go() {
    this.error.set('');
    const d = this.exp();
    if (d && !isRealDate(d)) {
      this.expErr.set(translate('VALIDATION.DATE'));
      return;
    }
    if (d && d <= this.today) {
      this.expErr.set('Choose a day after today');
      return;
    }
    this.busy.set(true);
    try {
      const out = await this.api.generate(
        {
          yearId: this.yearId() || null,
          // The link works to the end of the chosen day in India.
          expiresAt: d ? new Date(`${d}T23:59:59+05:30`).toISOString() : null,
        },
        this.key,
      );
      const y = this.years().find((x) => x.id === this.yearId());
      this.overlays.toast(this.replacing() ? 'New link generated' : 'Link and QR generated', {
        sub: `${y?.label ?? 'Every open year'}${this.replacing() ? ' · the old link no longer works' : ''}`,
      });
      this.generated.emit(out);
    } catch (x) {
      if (x instanceof ApiProblem && x.errors.some((e) => e.field === 'expiresAt')) {
        this.expErr.set('Choose a day after today');
      } else {
        this.error.set(x instanceof ApiProblem ? x.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
