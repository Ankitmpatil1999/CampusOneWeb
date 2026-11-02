import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PortalSubscription } from '../portal.api';
import { inr, paiseOf } from './PortalUi';

interface Meter {
  readonly label: string;
  readonly used: string;
  readonly max: string;
  readonly pct: number;
  readonly tone: string;
  readonly over: string;
  readonly note: string;
}

const num = (v: number) => v.toLocaleString('en-IN');

/**
 * SP.usage — usage this cycle against the plan's allowances. SMS and WhatsApp are counted from the
 * communication log, which arrives with messaging (Phase 8): until then they show "—".
 */
@Component({
  selector: 'rp-sp-usage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="stack g16">
    @for (m of meters(); track m.label) {
      <div class="sp-use">
        <div class="row between">
          <b>{{ m.label }}</b
          ><span class="t-num t-sm"
            ><b>{{ m.used }}</b
            ><span class="t-muted">&nbsp;/ {{ m.max }}</span></span
          >
        </div>
        <div [class]="'bar ' + m.tone"><i [style.width.%]="m.pct"></i></div>
        <span class="t-xs">
          @if (m.over) {
            <span style="color: var(--bad)"
              >{{ m.over }} above the allowance — billed at the end of the cycle</span
            >
          } @else {
            {{ m.note }}
          }
        </span>
      </div>
    }
    <p class="t-xs t-muted">
      How active members and storage are counted is still being defined
      <span class="srs" title="SRS reference">OI-SAS-03</span>.
    </p>
  </div>`,
})
export class Usage {
  readonly summary = input.required<PortalSubscription>();

  protected readonly meters = computed<Meter[]>(() => {
    const s = this.summary();
    const a = s.plan?.allowances ?? { members: 0, sms: 0, whatsapp: 0, storageGb: 0 };
    const meter = (
      label: string,
      used: number | null,
      max: number,
      fmt: (v: number) => string,
      note: string,
    ): Meter => {
      const pct = max && used !== null ? Math.min(100, (used * 100) / max) : 0;
      const over = !!max && used !== null && used > max;
      return {
        label,
        used: used === null ? '—' : fmt(used),
        max: max ? fmt(max) : 'not in plan',
        pct: max ? pct : 0,
        tone: over ? 'bad' : pct > 85 ? 'warn' : 'ok',
        over: over ? fmt((used ?? 0) - max) : '',
        note,
      };
    };
    const gb = (v: number) => `${v.toFixed(1)} GB`;
    const sms = inr(paiseOf(s.billing.smsOverage));
    const wa = inr(paiseOf(s.billing.whatsappOverage));
    const later = s.usage.sms === null ? 'Counted once messaging arrives · ' : '';
    return [
      meter(
        'Active members',
        s.usage.members,
        a.members,
        num,
        `${num(Math.max(0, a.members - s.usage.members))} more before you'd need a bigger plan`,
      ),
      meter('SMS this month', s.usage.sms, a.sms, num, `${later}Above the allowance: ${sms} each`),
      meter(
        'WhatsApp this month',
        s.usage.whatsapp,
        a.whatsapp,
        num,
        a.whatsapp
          ? `${later}Above the allowance: ${wa} each`
          : 'Upgrade to send WhatsApp messages',
      ),
      meter(
        'Storage',
        s.usage.storageBytes / 1024 ** 3,
        a.storageGb,
        gb,
        'Documents, photos and uploads',
      ),
    ];
  });
}
