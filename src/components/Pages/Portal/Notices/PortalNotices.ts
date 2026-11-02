import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { formatDateTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { PortalApi, type Notice } from '../portal.api';
import { LIFECYCLE_EVENTS, PageHead, byWho, eventOf, statusWord } from '../Shared/PortalUi';

/**
 * s.notices — notices and history (FR-SAS-11; SAS-019; prototype s.notices): every lifecycle change
 * with who made it, when and why, filtered to the lifecycle changes or everything. Each change is
 * e-mailed to both contacts; the log of those e-mails arrives with the notification centre.
 */
@Component({
  selector: 'rp-portal-notices',
  imports: [Empty, Icon, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-sp-head
      title="Notices & history"
      sub="Every lifecycle change — activation, suspension, reactivation, cancellation, plan change — with who made it, when and why. Each one is e-mailed to your contacts."
    />
    <div class="c-grid s21" style="align-items: start">
      <section class="stack g8">
        <div class="row between wrap g8">
          <div class="sec-h"><h3>History</h3></div>
          <div class="pills">
            <button
              type="button"
              class="pill"
              [class.on]="filter() === 'Lifecycle'"
              (click)="filter.set('Lifecycle')"
            >
              Lifecycle changes
            </button>
            <button
              type="button"
              class="pill"
              [class.on]="filter() === 'All'"
              (click)="filter.set('All')"
            >
              Everything
            </button>
          </div>
        </div>
        <div class="card pad">
          @if (error()) {
            <rp-empty icon="wifioff" title="Couldn't load the history" [text]="error()" />
          } @else if (items()) {
            @if (rows().length) {
              <div class="tl">
                @for (h of rows(); track $index) {
                  <div class="tl-i" [class]="'tl-i ' + h.state">
                    <span class="tl-dot"
                      ><rp-icon [name]="h.icon" [size]="13" [stroke]="2.6"
                    /></span>
                    <div class="tl-c">
                      <div class="tl-t">{{ h.title }}</div>
                      <div class="tl-s">{{ h.sub }}</div>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <rp-empty icon="history" title="Nothing yet" />
            }
          } @else {
            <div class="stack g12">
              @for (i of [1, 2, 3, 4]; track i) {
                <div class="sk" style="height: 40px; border-radius: 8px"></div>
              }
            </div>
          }
        </div>
      </section>
      <section class="stack g8">
        <div class="sec-h"><h3>E-mails to your contacts</h3></div>
        <div class="card">
          <rp-empty
            icon="mail"
            title="No e-mails listed yet"
            text="Every lifecycle change is e-mailed to your primary and secondary contacts. A log of those e-mails will appear here."
          />
        </div>
      </section>
    </div>
  `,
})
export class PortalNotices {
  private readonly api = inject(PortalApi);
  protected readonly items = signal<readonly Notice[] | null>(null);
  protected readonly error = signal('');
  protected readonly filter = signal<'Lifecycle' | 'All'>('Lifecycle');

  protected readonly rows = computed(() =>
    (this.items() ?? [])
      .filter((h) => this.filter() === 'All' || LIFECYCLE_EVENTS.has(h.action))
      .map((h) => {
        const e = eventOf(h.action);
        const move = h.from && h.to && h.from !== h.to;
        return {
          title: `${e.title}${move ? ` · ${statusWord(h.from)} → ${statusWord(h.to)}` : ''}`,
          sub: `${formatDateTime(h.at)} · ${byWho(h.by)}${h.reason ? ` — ${h.reason}` : ''}`,
          state: e.state,
          icon: e.icon,
        };
      }),
  );

  constructor() {
    void this.load();
  }

  private async load() {
    try {
      this.items.set((await this.api.notices()).items);
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }
}
