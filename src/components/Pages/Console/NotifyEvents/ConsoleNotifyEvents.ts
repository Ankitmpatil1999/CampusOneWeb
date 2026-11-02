import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { NotifyEventsApi, type NotifyEvent, type NotifyEventChange } from './notify-events.api';

type Choice = { email: boolean; alert: boolean };

/**
 * c.notifyevents — Notification settings (client 2026-10-16: the e-mail trigger configuration of the
 * earlier application; COM-032/033). For each event the Institution Administrator chooses whether its
 * in-app notice is also e-mailed (to the student and parents, or whoever it is for) and whether it
 * raises the phone alert. Every event is on until switched off; the in-app notice is always kept.
 */
@Component({
  selector: 'rp-console-notify-events',
  imports: [Empty, Icon, PageHead, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Notification settings"
        sub="Choose which notices are also e-mailed and which raise the alert on the phone. Every notice always stays in the app."
      />
      @if (!canView()) {
        <rp-empty
          icon="lock"
          title="This page isn't part of your role"
          text="Notification settings are managed by the institution administrator. Pages your role can open are listed in the menu."
        />
      } @else if (failed()) {
        <div class="card pad">
          <rp-empty
            icon="alertc"
            title="Couldn't load the notification settings"
            [text]="failed()"
          />
        </div>
      } @else if (!loaded()) {
        <div class="card pad"><rp-empty icon="hourglass" title="Loading…" /></div>
      } @else {
        @if (!emailChannel()) {
          <div class="note tone-warn" id="ne-email-off">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              E-mail is switched off for your school, so nothing is e-mailed whatever you choose
              here. Switch it on under
              <a routerLink="/console/institution">Institution &amp; features</a> → Notification
              channels.
            </div>
          </div>
        }
        <div class="tbl-wrap">
          <table class="tbl" id="ne-table">
            <thead>
              <tr>
                <th>Event</th>
                <th class="t-center" style="width: 120px">E-mail</th>
                <th class="t-center" style="width: 120px">Phone alert</th>
              </tr>
            </thead>
            <tbody>
              @for (e of items(); track e.event) {
                <tr [attr.data-event]="e.event">
                  <td>
                    <div class="t-sb">{{ e.label }}</div>
                    <div class="t-xs t-muted">{{ e.description }}</div>
                  </td>
                  <td class="t-center">
                    <button
                      type="button"
                      class="toggle"
                      role="switch"
                      [id]="'ne-email-' + e.event"
                      [attr.aria-checked]="value(e).email"
                      [attr.aria-label]="'E-mail: ' + e.label"
                      [attr.title]="editWhy() || null"
                      [disabled]="!!editWhy()"
                      (click)="flip(e, 'email')"
                    ></button>
                  </td>
                  <td class="t-center">
                    <button
                      type="button"
                      class="toggle"
                      role="switch"
                      [id]="'ne-alert-' + e.event"
                      [attr.aria-checked]="value(e).alert"
                      [attr.aria-label]="'Phone alert: ' + e.label"
                      [attr.title]="editWhy() || null"
                      [disabled]="!!editWhy()"
                      (click)="flip(e, 'alert')"
                    ></button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="t-xs t-muted" style="margin: 10px 2px 14px">
          E-mails go to the student and their parents, a parent without the app too, in your
          school's name. Each one is in the Communication report.
        </p>
        <div class="row end g8">
          @if (dirty()) {
            <button type="button" class="btn btn-ghost" id="ne-undo" (click)="undo()">
              <span>Undo changes</span>
            </button>
          }
          <span class="cp-why" [attr.title]="editWhy() || null"
            ><button
              type="button"
              class="btn btn-pri"
              id="ne-save"
              [class.is-busy]="busy()"
              [disabled]="!!editWhy() || busy() || !dirty()"
              (click)="save()"
            >
              <rp-icon name="check" [size]="17" /><span>Save changes</span>
            </button></span
          >
        </div>
      }
    </div>
  `,
})
export class ConsoleNotifyEvents {
  private readonly session = inject(SessionContext).console;
  private readonly api = inject(NotifyEventsApi);
  private readonly overlays = inject(Overlays);

  protected readonly items = signal<readonly NotifyEvent[]>([]);
  protected readonly emailChannel = signal(true);
  protected readonly loaded = signal(false);
  protected readonly failed = signal('');
  protected readonly busy = signal(false);
  /** Changed switches, by event, until saved. */
  protected readonly edits = signal<Readonly<Record<string, Choice>>>({});

  protected readonly canView = computed(
    () => this.session()?.subTasks.includes('config.view') ?? false,
  );
  protected readonly editWhy = computed(() =>
    this.session()?.roles.some((r) => r.readOnly)
      ? 'Management has read-only access.'
      : this.session()?.subTasks.includes('config.edit')
        ? ''
        : "Your role doesn't include this task.",
  );
  private readonly changed = computed(() =>
    this.items().filter((e) => {
      const v = this.edits()[e.event];
      return !!v && (v.email !== e.email || v.alert !== e.alert);
    }),
  );
  protected readonly dirty = computed(() => this.changed().length > 0);

  constructor() {
    void this.load();
  }

  private async load() {
    if (!this.canView()) return;
    try {
      this.show(await this.api.list());
    } catch (e) {
      this.failed.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  private show(v: { emailChannel: boolean; items: readonly NotifyEvent[] }) {
    this.items.set(v.items);
    this.emailChannel.set(v.emailChannel);
    this.edits.set({});
    this.loaded.set(true);
  }

  protected value(e: NotifyEvent): Choice {
    return this.edits()[e.event] ?? { email: e.email, alert: e.alert };
  }

  protected flip(e: NotifyEvent, k: keyof Choice) {
    if (this.editWhy()) return;
    const v = this.value(e);
    this.edits.set({ ...this.edits(), [e.event]: { ...v, [k]: !v[k] } });
  }

  protected undo() {
    this.edits.set({});
  }

  protected async save() {
    if (this.busy() || !this.dirty()) return;
    const changes: NotifyEventChange[] = this.changed().map((e) => ({
      event: e.event,
      version: e.version,
      ...this.edits()[e.event]!,
    }));
    this.busy.set(true);
    try {
      this.show(await this.api.update(changes));
      this.overlays.toast('Notification settings saved', {
        sub: `${changes.length} event${changes.length === 1 ? '' : 's'} changed`,
      });
    } catch (e) {
      const stale = e instanceof ApiProblem && e.status === 412;
      this.overlays.toast('Not saved', {
        sub: stale
          ? 'Someone changed these settings meanwhile. The page shows them now; make your changes again.'
          : e instanceof ApiProblem
            ? e.detail
            : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
      if (stale) await this.load();
    } finally {
      this.busy.set(false);
    }
  }
}
