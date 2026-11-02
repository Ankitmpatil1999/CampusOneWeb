/**
 * Notices (client 2026-10-12; the app's notices and bell, COM-011…015): the school's announcements
 * sent to the teacher — acknowledged here when the school asks for it — and the teacher's own
 * notifications (a leave decided, a message received …), marked read one by one or all at once.
 */
import { ChangeDetectionStrategy, Component, type OnInit, inject, signal } from '@angular/core';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDate, formatTime } from '../../../Utils/format';
import { t as tr } from '../../../Utils/t';
import { problemText } from '../Structure/academic-format';
import { MeApi, type Notice, type Notices, type Notification, type Notifications } from './me.api';

type Tab = 'notices' | 'bell';

@Component({
  selector: 'rp-teaching-notices',
  imports: [Empty, Icon, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    <rp-page-head [title]="t('ui.web.nav.notices')" [sub]="t('ui.web.tch.my.notices.sub')">
      @if (tab() === 'bell' && (bell()?.unread ?? 0) > 0) {
        <button type="button" class="btn btn-sec" id="nt-read-all" (click)="readAll()">
          <rp-icon name="checkc" [size]="17" /><span>{{ t('ui.web.tch.my.notices.readAll') }}</span>
        </button>
      }
    </rp-page-head>

    <div class="tabs" role="tablist" [attr.aria-label]="t('ui.web.nav.notices')">
      <button
        type="button"
        class="tab"
        role="tab"
        id="nt-tab-notices"
        [class.on]="tab() === 'notices'"
        [attr.aria-selected]="tab() === 'notices'"
        (click)="tab.set('notices')"
      >
        {{ t('ui.web.tch.my.notices.school') }}
        @if (notices()?.unacknowledged) {
          <span class="n">{{ notices()!.unacknowledged }}</span>
        }
      </button>
      <button
        type="button"
        class="tab"
        role="tab"
        id="nt-tab-bell"
        [class.on]="tab() === 'bell'"
        [attr.aria-selected]="tab() === 'bell'"
        (click)="tab.set('bell')"
      >
        {{ t('ui.web.tch.my.notices.bell') }}
        @if (bell()?.unread) {
          <span class="n">{{ bell()!.unread }}</span>
        }
      </button>
    </div>

    @if (error()) {
      <div class="note tone-bad" role="alert" id="nt-error">
        <rp-icon name="alert" [size]="17" />
        <div class="grow">{{ error() }}</div>
        <button type="button" class="btn btn-sec btn-sm" (click)="load()">
          {{ t('ui.web.tch.retry') }}
        </button>
      </div>
    } @else if (loading()) {
      <div class="card pad"><div class="sk" style="height: 240px; border-radius: 16px"></div></div>
    } @else if (tab() === 'notices') {
      @if (!notices()?.items?.length) {
        <rp-empty
          icon="megaphone"
          [title]="t('ui.web.tch.my.notices.empty')"
          [text]="t('ui.web.tch.my.notices.emptyText')"
        />
      } @else {
        <div class="stack g12" id="nt-list">
          @for (n of notices()!.items; track n.id; let i = $index) {
            <div class="card pad stack g8" [id]="'nt-' + i">
              <div class="row g8 wrap">
                <b class="grow" style="min-width: 0">{{ n.title }}</b>
                @if (n.important) {
                  <span class="chip tone-bad">{{ t('ui.web.tch.my.notices.important') }}</span>
                }
                @if (n.category; as c) {
                  <span class="chip tone-neutral">{{ c.label }}</span>
                }
              </div>
              <div class="t-muted t-sm">
                {{ from(n) }}
                @if (n.sentAt) {
                  · {{ when(n.sentAt) }}
                }
                <span class="t-mono"> · {{ n.code }}</span>
              </div>
              <div style="white-space: pre-line">{{ n.text }}</div>
              @if (n.ackRequired) {
                <div class="row g8 wrap" style="justify-content: flex-end">
                  @if (n.acknowledged) {
                    <span class="chip dot tone-ok">{{
                      t('ui.web.tch.my.notices.acked', { date: when(n.acknowledgedAt) })
                    }}</span>
                  } @else {
                    <button
                      type="button"
                      class="btn btn-pri btn-sm"
                      [id]="'nt-ack-' + i"
                      [disabled]="busy() === n.id"
                      (click)="acknowledge(n)"
                    >
                      <rp-icon name="check" [size]="15" /><span>{{
                        t('ui.web.tch.my.notices.ack')
                      }}</span>
                    </button>
                  }
                </div>
              }
            </div>
          }
          @if (notices()!.nextCursor) {
            <button type="button" class="btn btn-sec" id="nt-more" (click)="more()">
              {{ t('ui.web.tch.my.more') }}
            </button>
          }
        </div>
      }
    } @else {
      @if (!bell()?.items?.length) {
        <rp-empty
          icon="bell"
          [title]="t('ui.web.tch.my.notices.bellEmpty')"
          [text]="t('ui.web.tch.my.notices.bellEmptyText')"
        />
      } @else {
        <div class="card list" id="nt-bell">
          @for (n of bell()!.items; track n.id; let i = $index) {
            <button
              type="button"
              class="li"
              [id]="'nt-n-' + i"
              [class.unread]="!n.read"
              [style.font-weight]="n.read ? null : 600"
              (click)="read(n)"
            >
              <span class="li-ic sm"><rp-icon [name]="n.read ? 'bell' : 'dot'" [size]="16" /></span>
              <span class="li-main"
                ><span class="li-t">{{ n.title }}</span>
                @if (n.body) {
                  <span class="li-s">{{ n.body }}</span>
                }
              </span>
              <span class="li-r t-xs t-muted">{{ when(n.at) }}</span>
            </button>
          }
        </div>
        @if (bell()!.nextCursor) {
          <button type="button" class="btn btn-sec" id="nt-bell-more" (click)="moreBell()">
            {{ t('ui.web.tch.my.more') }}
          </button>
        }
      }
    }
  </div>`,
})
export class TeachingNotices implements OnInit {
  private readonly api = inject(MeApi);
  private readonly overlays = inject(Overlays);
  protected readonly t = tr;
  protected readonly tab = signal<Tab>('notices');
  protected readonly notices = signal<Notices | null>(null);
  protected readonly bell = signal<Notifications | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal<string | null>(null);

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const [n, b] = await Promise.all([this.api.notices(), this.api.notifications()]);
      this.notices.set(n);
      this.bell.set(b);
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async more() {
    const cur = this.notices();
    if (!cur?.nextCursor) return;
    try {
      const next = await this.api.notices(cur.nextCursor);
      this.notices.set({ ...next, items: [...cur.items, ...next.items] });
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
    }
  }

  protected async moreBell() {
    const cur = this.bell();
    if (!cur?.nextCursor) return;
    try {
      const next = await this.api.notifications(cur.nextCursor);
      this.bell.set({ ...next, items: [...cur.items, ...next.items] });
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
    }
  }

  /** COM-013: once; the school sees who has acknowledged. */
  protected async acknowledge(n: Notice) {
    this.busy.set(n.id);
    try {
      const out = await this.api.acknowledge(n.id);
      this.notices.update((c) =>
        c
          ? {
              ...c,
              unacknowledged: Math.max(0, c.unacknowledged - 1),
              items: c.items.map((x) => (x.id === n.id ? out : x)),
            }
          : c,
      );
      this.overlays.toast(tr('ui.web.tch.my.notices.ackDone'), { sub: n.title });
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
    } finally {
      this.busy.set(null);
    }
  }

  protected async read(n: Notification) {
    if (n.read) return;
    try {
      await this.api.markRead({ ids: [n.id] });
      this.bell.update((c) =>
        c
          ? {
              ...c,
              unread: Math.max(0, c.unread - 1),
              items: c.items.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
            }
          : c,
      );
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
    }
  }

  protected async readAll() {
    try {
      await this.api.markRead({ all: true });
      this.bell.update((c) =>
        c ? { ...c, unread: 0, items: c.items.map((x) => ({ ...x, read: true })) } : c,
      );
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
    }
  }

  protected from(n: Notice) {
    const who = n.author ?? tr('ui.web.tch.my.notices.school');
    return n.classSection ? `${who} · ${n.classSection}` : who;
  }
  protected when(v: string | null) {
    return v ? `${formatDate(v)} ${formatTime(v)}` : '';
  }
}
