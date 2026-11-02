import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Empty } from '../Shared/Blocks';
import { Icon } from '../Shared/Icon';
import { Modal, Overlays } from '../Shared/Overlays';
import { ago } from '../Utils/dates';
import { ApiProblem } from '../Utils/problem';
import { translate } from '../Utils/translate';
import { ConsoleBell, type ConsoleNotification } from './notifications.api';

/**
 * The prototype's notifications drawer (shell.cnotifs): the latest notifications with the bell icon,
 * title and "body · 2 hr ago", unread ones highlighted; "Mark all as read" in the footer
 * (shell.cnread). A notification with a link marks itself read and opens the page it points to (a
 * teacher's member-app notice at its web page, notifications.api.ts).
 * Placed in the console frame (not the top bar) so the drawer covers the menu too.
 */
@Component({
  selector: 'rp-notifications',
  imports: [Empty, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (bell.open()) {
      <rp-modal title="Notifications" [drawer]="true" [slim]="true" (closed)="bell.open.set(false)">
        @if (bell.items().length) {
          <div class="list">
            @for (n of bell.items(); track n.id) {
              @if (bell.linkOf(n)) {
                <button type="button" class="li" [class.unread]="!n.read" (click)="go(n)">
                  <span class="li-ic"><rp-icon name="bell" [size]="18" /></span>
                  <span class="li-main"
                    ><span class="li-t">{{ bell.title(n) }}</span
                    ><span class="li-s">{{ n.body }} · {{ ago(n.at) }}</span></span
                  >
                </button>
              } @else {
                <div class="li" [class.unread]="!n.read">
                  <span class="li-ic"><rp-icon name="bell" [size]="18" /></span>
                  <span class="li-main"
                    ><span class="li-t">{{ bell.title(n) }}</span
                    ><span class="li-s">{{ n.body }} · {{ ago(n.at) }}</span></span
                  >
                </div>
              }
            }
          </div>
        } @else {
          <rp-empty
            icon="bell"
            title="No notifications"
            text="Approvals, job alerts and ticket updates will appear here."
          />
        }
        <ng-container modal-foot>
          <button
            type="button"
            class="btn btn-sec"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="markAll()"
          >
            <span>Mark all as read</span>
          </button>
        </ng-container>
      </rp-modal>
    }
  `,
})
export class Notifications {
  protected readonly bell = inject(ConsoleBell);
  private readonly overlays = inject(Overlays);
  private readonly router = inject(Router);
  protected readonly busy = signal(false);

  protected ago(iso: string) {
    return ago(iso);
  }

  protected async go(n: ConsoleNotification) {
    const to = this.bell.linkOf(n);
    if (!to) return;
    this.bell.open.set(false);
    if (!n.read) {
      try {
        await this.bell.markRead([n.id]);
      } catch {
        // Opening the page matters more; the notification stays unread.
      }
    }
    await this.router.navigateByUrl(to);
  }

  protected async markAll() {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.bell.markAll();
      this.bell.open.set(false);
      this.overlays.toast('All notifications marked as read');
    } catch (e) {
      this.overlays.toast('Not marked as read', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    } finally {
      this.busy.set(false);
    }
  }
}
