import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { REJECT_REASON, appName } from './app-format';
import { ApplicationsApi, type Application, type RejectReason } from './applications.api';

type Field = 'code' | 'rem';

/**
 * Reject an application (prototype cc.app.reject, drawn as its confirmation with the reason;
 * ADM-019, If-Match): the reason code and the remarks the family sees on the status page. A
 * rejected application can't pay fees or be approved later (BR-36).
 */
@Component({
  selector: 'rp-application-reject',
  imports: [Dropdown, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="ov fixed" (click)="close()" (keydown.escape)="close()" tabindex="-1">
      <div
        class="modal narrow"
        role="alertdialog"
        aria-modal="true"
        [attr.aria-label]="title()"
        (click)="$event.stopPropagation()"
        (keydown)="$event.stopPropagation()"
        tabindex="-1"
      >
        <div class="sh-b" style="padding-top: 18px" id="ar-form">
          <div class="m-center" style="padding-top: 6px">
            <div class="confirm-ic bad"><rp-icon name="alert" [size]="24" /></div>
            <h3 class="t-h3" style="font-family: var(--f-display); font-size: 18px">
              {{ title() }}
            </h3>
            <p class="t-sm t-muted" style="margin-top: 6px; max-width: 40ch; line-height: 1.55">
              The remarks are shown to the family when they check the application's status. A
              rejected application can't pay fees or be approved later.
            </p>
          </div>
          <div class="stack g12" style="margin-top: 16px">
            <div class="fld" [class.invalid]="err('code')">
              <label class="fld-l" for="ar-code-b">Reason<span class="req">*</span></label>
              <rp-dd
                inputId="ar-code"
                placeholder="Choose a reason"
                [options]="options"
                [value]="code()"
                (changed)="code.set($any($event)); clear('code')"
              />
              <div class="fld-e" id="ar-code-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('code') }}</span>
              </div>
            </div>
            <div class="fld" [class.invalid]="err('rem')">
              <label class="fld-l" for="ar-rem"
                >Reason shared with the family<span class="req">*</span></label
              >
              <div class="fld-in">
                <textarea
                  id="ar-rem"
                  rows="3"
                  maxlength="500"
                  placeholder="e.g. Age below the admissible band for the class sought"
                  aria-describedby="ar-rem-e"
                  [value]="rem()"
                  (input)="rem.set(val($event)); clear('rem')"
                ></textarea>
              </div>
              <div class="fld-e" id="ar-rem-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('rem') }}</span>
              </div>
            </div>
            @if (error()) {
              <div class="note tone-bad" role="alert">
                <rp-icon name="alertc" [size]="17" />
                <div class="grow">{{ error() }}</div>
              </div>
            }
          </div>
        </div>
        <div class="sh-f">
          <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="close()">
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-danger"
            id="ar-go"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="reject()"
          >
            <span>Reject application</span>
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ApplicationReject {
  private readonly api = inject(ApplicationsApi);
  private readonly overlays = inject(Overlays);

  readonly application = input.required<Application>();
  readonly closed = output<void>();
  readonly rejected = output<Application>();

  protected readonly options: readonly DropdownOption[] = (
    Object.keys(REJECT_REASON) as RejectReason[]
  ).map((k) => ({ v: k, l: REJECT_REASON[k] }));
  protected readonly code = signal<RejectReason | ''>('');
  protected readonly rem = signal('');
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  private readonly key = newIdempotencyKey();

  protected readonly title = computed(() => `Reject ${appName(this.application())}’s application?`);

  protected close() {
    if (!this.busy()) this.closed.emit();
  }
  protected err(f: Field) {
    return this.errors()[f] ?? '';
  }
  protected clear(f: Field) {
    if (this.errors()[f]) this.errors.update((e) => ({ ...e, [f]: '' }));
  }
  protected val(e: Event) {
    return (e.target as HTMLTextAreaElement).value;
  }

  protected async reject() {
    this.error.set('');
    const rem = this.rem().trim();
    const e: Partial<Record<Field, string>> = {};
    if (!this.code()) e.code = 'Choose a reason';
    if (!rem) e.rem = 'Enter a reason to continue';
    else if (rem.length < 5) e.rem = 'Write at least 5 characters';
    this.errors.set(e);
    const code = this.code();
    if (Object.values(e).some(Boolean) || !code) return;
    this.busy.set(true);
    try {
      const out = await this.api.reject(
        this.application(),
        { reasonCode: code, remarks: rem },
        this.key,
      );
      this.overlays.toast('Application rejected', {
        sub: `${out.applicationNo} · ${REJECT_REASON[code]}`,
      });
      this.rejected.emit(out);
    } catch (x) {
      if (x instanceof ApiProblem && x.errors.length) {
        const f: Partial<Record<Field, string>> = {};
        for (const y of x.errors) {
          if (y.field === 'reasonCode') f.code = y.message;
          if (y.field === 'remarks') f.rem = y.message;
        }
        this.errors.set(f);
        if (!Object.keys(f).length) this.error.set(x.detail);
      } else {
        this.error.set(x instanceof ApiProblem ? x.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
