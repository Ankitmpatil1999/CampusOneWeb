/**
 * The school's announcements for the principal on the web (client 2026-10-13; COM-024, COM-026,
 * COM-027, COM-030, COM-031): every announcement with its delivery and acknowledgements, a new one
 * from the principal under the console's rules, and who has acknowledged with a reminder to the rest.
 */
import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { formatDate, formatTime } from '../../../Utils/format';
import { person } from '../Applications/app-format';
import { AnnouncementDrawer, type AckSource } from '../Announcements/AnnouncementDrawer';
import { audience, channelOf, stateOf } from '../Announcements/announcement-format';
import type {
  Announcement,
  AnnouncementList,
  NewAnnouncement as AnnouncementBody,
} from '../Announcements/announcements.api';
import { NewAnnouncement } from '../Announcements/NewAnnouncement';
import { problemText } from '../Structure/academic-format';
import { PrincipalApi } from './principal.api';

@Component({
  selector: 'rp-principal-announcements',
  imports: [AnnouncementDrawer, Empty, Icon, NewAnnouncement, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
      <rp-page-head
        title="School announcements"
        sub="Everything the school has sent, with delivery and acknowledgements — and your own announcements."
      >
        @if (canSend()) {
          <button
            type="button"
            class="btn btn-pri"
            id="pn-new"
            [disabled]="!list()"
            (click)="creating.set(true)"
          >
            <rp-icon name="megaphone" [size]="17" /><span>New announcement</span>
          </button>
        }
      </rp-page-head>

      @if (error() && !list()) {
        <div class="note tone-bad" role="alert" id="pn-error">
          <rp-icon name="alert" [size]="17" />
          <div class="grow">{{ error() }}</div>
          <button type="button" class="btn btn-sec btn-sm" (click)="load()">Try again</button>
        </div>
      } @else if (!list()) {
        <div class="card pad">
          <div class="sk" style="height: 260px; border-radius: 16px"></div>
        </div>
      } @else {
        <div class="tbl-wrap">
          <table class="tbl" id="pn-table">
            <thead>
              <tr>
                <th>Sent</th>
                <th>Announcement</th>
                <th>Category</th>
                <th>Dispatch</th>
                <th>Acknowledged</th>
              </tr>
            </thead>
            <tbody>
              @for (a of items(); track a.id) {
                <tr
                  tabindex="0"
                  [attr.aria-label]="a.title"
                  [class.t-muted]="!!a.withdrawn"
                  (click)="open.set(a)"
                  (keydown.enter)="open.set(a)"
                >
                  <td>
                    <span class="t-mono t-xs">{{ a.code }}</span>
                    <div class="cell-s">{{ when(a.dispatch.at ?? a.sendAt) }}</div>
                  </td>
                  <td>
                    <div class="row g6">
                      <b class="t-sb t-clip" style="max-width: 320px">{{ a.title }}</b>
                      @if (a.important) {
                        <span class="t-bad" title="High importance"
                          ><rp-icon name="alertc" [size]="14"
                        /></span>
                      }
                    </div>
                    <div class="cell-s">
                      {{ audience(a) }} · by {{ person(a.author) || 'The institution' }}
                    </div>
                  </td>
                  <td>
                    <span class="cc-cat" [style.--c]="a.category.colour">{{
                      a.category.label
                    }}</span>
                  </td>
                  <td>
                    @if (a.withdrawn) {
                      <span class="chip tone-neutral dot">Withdrawn</span>
                    } @else {
                      <span class="chip dot" [class]="'chip dot tone-' + state(a).tone">{{
                        state(a).l
                      }}</span>
                    }
                  </td>
                  <td>
                    @if (a.acknowledgements; as k) {
                      <span class="t-num">{{ k.acknowledged }} of {{ k.of }}</span>
                    } @else {
                      <span class="t-faint">{{
                        a.ackRequired ? 'After sending' : 'Not needed'
                      }}</span>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="5">
                    <rp-empty
                      icon="megaphone"
                      title="No announcements yet"
                      text="Announcements the school sends appear here."
                    />
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (next()) {
          <div class="row" style="justify-content: center">
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              id="pn-more"
              [class.is-busy]="loading()"
              [disabled]="loading()"
              (click)="load(true)"
            >
              <span>Show older announcements</span>
            </button>
          </div>
        }
      }
    </div>

    @if (open(); as a) {
      <rp-announcement-drawer
        [item]="a"
        [canSend]="canSend()"
        [via]="acks"
        (closed)="open.set(null)"
      />
    }
    @if (creating() && list(); as l) {
      <rp-new-announcement
        [categories]="l.categories"
        [enabled]="l.channels"
        [sender]="sender"
        (closed)="creating.set(false)"
        (saved)="created()"
      />
    }`,
})
export class PrincipalAnnouncements implements OnInit {
  private readonly api = inject(PrincipalApi);
  private readonly session = inject(SessionContext).console;
  protected readonly person = person;
  protected readonly audience = audience;
  protected readonly list = signal<AnnouncementList | null>(null);
  protected readonly items = signal<readonly Announcement[]>([]);
  protected readonly next = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly open = signal<Announcement | null>(null);
  protected readonly creating = signal(false);
  protected readonly canSend = computed(
    () => this.session()?.subTasks.includes('principal.announce') ?? false,
  );

  /** The principal's routes for acknowledgements and reminders (COM-030, COM-031). */
  protected readonly acks: AckSource = {
    acknowledgements: (id, q) => this.api.acknowledgements(id, q),
    remind: (id, channels) => this.api.remind(id, channels),
  };
  /** COM-024: the console's rules, sent as the principal. */
  protected readonly sender = (body: AnnouncementBody) => this.api.announce(body);

  ngOnInit() {
    void this.load();
  }

  async load(more = false) {
    this.loading.set(true);
    try {
      const l = await this.api.announcements({ cursor: more ? this.next() : null });
      this.list.set(l);
      this.items.set(more ? [...this.items(), ...l.items] : l.items);
      this.next.set(l.nextCursor);
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async created() {
    this.creating.set(false);
    await this.load();
  }

  protected state(a: Announcement) {
    return stateOf(a);
  }
  protected readonly channelOf = channelOf;
  protected when(iso: string) {
    return `${formatDate(iso)}, ${formatTime(iso)}`;
  }
}
