import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Card, Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import type { IconName } from '../../../Utils/icons';
import { Overlays } from '../../../Shared/Overlays';
import { formatDateTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { PartnersApi, type MessagingChannel } from './partners.api';

const CHANNELS: Readonly<Record<MessagingChannel['channel'], { l: string; icon: IconName }>> = {
  IN_APP: { l: 'In-app', icon: 'bell' },
  SMS: { l: 'SMS', icon: 'chat' },
  EMAIL: { l: 'E-mail', icon: 'mail' },
  WHATSAPP: { l: 'WhatsApp', icon: 'chat' },
  PUSH: { l: 'Phone push', icon: 'phone' },
};

/**
 * The platform's messaging channels (SRS 18; INT-009/010; docs/02 o.partners): each channel with the
 * provider the server is configured with and the platform switch. A channel without a provider can't
 * be switched on, and in-app messages can't be switched off; the server refuses both. Phone push
 * (client 2026-10-19/21) needs PUSH_PROVIDER=fcm on the API server (docs/runbooks/push-notifications.md).
 */
@Component({
  selector: 'rp-messaging-channels',
  imports: [Card, Empty, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-card title="Messaging channels" icon="send" [plainIcon]="true" [flush]="true">
      <span card-right class="srs" title="Endpoint reference">INT-009/010</span>
      @if (error()) {
        <div class="pad">
          <rp-empty icon="alertc" title="Couldn't load the channels" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="load()">
              <span>Try again</span>
            </button>
          </rp-empty>
        </div>
      } @else if (!items().length) {
        <div class="pad"><rp-empty icon="hourglass" title="Loading…" /></div>
      } @else {
        <div class="tbl-wrap">
          <table class="tbl" id="ob-channels">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Provider</th>
                <th>Platform switch</th>
              </tr>
            </thead>
            <tbody>
              @for (c of items(); track c.channel) {
                <tr [attr.data-channel]="c.channel">
                  <td>
                    <div class="row g8">
                      <rp-icon [name]="meta(c).icon" [size]="16" />
                      <b>{{ meta(c).l }}</b>
                    </div>
                  </td>
                  <td>
                    @if (c.integrated) {
                      <span class="t-mono">{{ c.provider }}</span>
                      @if (c.testMode) {
                        <span class="chip tone-warn" style="margin-left: 6px">Test mode</span>
                      }
                    } @else {
                      <span class="t-muted">Not set up on the server</span>
                    }
                    @if (c.updatedAt) {
                      <span class="t-xs t-muted" style="display: block"
                        >Changed {{ dt(c.updatedAt) }}</span
                      >
                    }
                  </td>
                  <td>
                    <div class="row g8">
                      <button
                        type="button"
                        class="toggle"
                        role="switch"
                        [attr.aria-checked]="c.enabled"
                        [attr.aria-label]="'Switch ' + meta(c).l + ' on or off'"
                        [attr.title]="why(c)"
                        [disabled]="!!why(c) || busy() === c.channel || readOnly()"
                        (click)="toggle(c)"
                      ></button>
                      <span class="t-sm" [class.t-muted]="!c.enabled">{{
                        c.enabled ? 'On' : 'Off'
                      }}</span>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (pushHint()) {
          <div class="pad">
            <div class="note tone-info">
              <rp-icon name="info" [size]="17" />
              <div class="grow">
                Phone push needs a Firebase project on the API server: set
                <span class="t-mono">PUSH_PROVIDER=fcm</span> and
                <span class="t-mono">PUSH_FCM_SERVICE_ACCOUNT_FILE</span> in its
                <span class="t-mono">.env</span>, restart it, then switch Phone push on here.
              </div>
            </div>
          </div>
        }
      }
    </rp-card>
  `,
})
export class MessagingChannels {
  private readonly api = inject(PartnersApi);
  private readonly overlays = inject(Overlays);
  /** True when the operator's role can't change channels (the page explains why). */
  readonly readOnly = input(false);
  protected readonly items = signal<readonly MessagingChannel[]>([]);
  protected readonly error = signal('');
  protected readonly busy = signal<string | null>(null);
  protected readonly pushHint = signal(false);

  constructor() {
    void this.load();
  }

  protected meta(c: MessagingChannel) {
    return CHANNELS[c.channel] ?? { l: c.channel, icon: 'send' as IconName };
  }

  protected dt(iso: string) {
    return formatDateTime(iso);
  }

  /** Why the switch can't be used, or null. */
  protected why(c: MessagingChannel): string | null {
    if (c.channel === 'IN_APP') return 'In-app messages are always on';
    if (!c.integrated && !c.enabled) return `${this.meta(c).l} has no provider on the server yet`;
    return null;
  }

  async load() {
    this.error.set('');
    try {
      const r = await this.api.channels();
      this.items.set(r.items);
      this.pushHint.set(r.items.some((c) => c.channel === 'PUSH' && !c.integrated));
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  protected async toggle(c: MessagingChannel) {
    if (this.busy() || this.why(c)) return;
    this.busy.set(c.channel);
    try {
      const out = await this.api.setChannel(c, !c.enabled);
      this.items.set(this.items().map((x) => (x.channel === c.channel ? out : x)));
      this.overlays.toast(`${this.meta(c).l} switched ${out.enabled ? 'on' : 'off'}`);
    } catch (e) {
      this.overlays.toast('Not changed', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
      await this.load();
    } finally {
      this.busy.set(null);
    }
  }
}
