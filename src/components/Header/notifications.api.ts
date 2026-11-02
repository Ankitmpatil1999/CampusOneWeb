/**
 * The bell (COM-009/010 console, COM-035/036 back office; prototype shell.cnotifs): the unread count
 * on the top bar and the notifications drawer. Loaded when the console or back office opens and every
 * minute while it stays open; titles come from the message register (NTF.*) with the English title as
 * the fallback.
 *
 * In-app notices on the web as in the app (client 2026-10-21): a teacher, principal or merchant on the
 * console also gets their member-app notices from this school here (the server adds them to the
 * console list). Their links are app paths, opened at the web page that does the same.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SessionContext } from '../../Context/SessionContext';
import { MESSAGES_EN } from '../Utils/messages.en';
import type { StaffSurface } from '../Utils/navigation';
import { translate } from '../Utils/translate';

export interface ConsoleNotification {
  readonly id: string;
  /** Where it was sent: the console's own, the member app's (a teacher's), or the back office's. */
  readonly surface?: 'CONSOLE' | 'MEMBER' | 'OPS';
  readonly category: string;
  readonly titleKey: string;
  readonly params: Readonly<Record<string, string | number>>;
  readonly title: string;
  readonly body: string;
  /** In-app address to open, e.g. /console/approvals?open=<id>, or an app path for MEMBER. */
  readonly link: string | null;
  readonly read: boolean;
  readonly at: string;
}

export interface NotificationList {
  readonly unread: number;
  readonly items: readonly ConsoleNotification[];
  readonly nextCursor: string | null;
}

const LISTS: Readonly<Record<StaffSurface, string>> = {
  console: '/api/v1/console/notifications',
  ops: '/api/v1/ops/notifications',
};
/** The prototype shows the latest 12. */
const SHOWN = 12;
const POLL_MS = 60_000;

/** A member-app path and the web page that does the same, for whoever holds the grant. */
const APP_PAGES: readonly (readonly [RegExp, string, string])[] = [
  [/^\/teacher\/student-leaves\b/, '/console/teaching-leave', 'teaching.view'],
  [/^\/teacher\/my-leave\b/, '/console/teaching-my-leave', 'teaching.view'],
  [/^\/teacher\/homework\b/, '/console/teaching-homework', 'teaching.view'],
  [/^\/teacher\/timetable\b/, '/console/teaching-timetable', 'teaching.view'],
  [/^\/principal\/approvals\b/, '/console/principal-leave', 'principal.view'],
  [/^\/messages\b/, '/console/teaching-messages', 'teaching.view'],
  [/^\/announcements\b/, '/console/teaching-notices', 'teaching.view'],
  [/^\/transactions\b/, '/console/business-collections', 'business.view'],
  [/^\/merchant\/settlements\b/, '/console/business-settlements', 'business.view'],
];

/**
 * The web address of a notice's link: a console or back-office address as it is; a member-app path at
 * its web page, else the person's notices page (null when there is none to open).
 */
export function webLinkOf(link: string | null, grants: readonly string[]): string | null {
  if (!link) return null;
  if (link.startsWith('/console/') || link.startsWith('/backoffice/')) return link;
  const path = link.split('?')[0] ?? link;
  const page = APP_PAGES.find(([re, , grant]) => re.test(path) && grants.includes(grant));
  if (page) return page[1];
  if (grants.includes('teaching.view')) return '/console/teaching-notices';
  if (grants.includes('business.view')) return '/console/business-notices';
  if (grants.includes('principal.view')) return '/console/principal';
  return null;
}

@Injectable({ providedIn: 'root' })
export class ConsoleBell {
  private readonly http = inject(HttpClient);
  private readonly sessions = inject(SessionContext);
  readonly unread = signal(0);
  readonly items = signal<readonly ConsoleNotification[]>([]);
  readonly open = signal(false);
  private surface: StaffSurface = 'console';
  private timer: ReturnType<typeof setInterval> | null = null;

  private get list() {
    return LISTS[this.surface];
  }

  /** Starts the bell for a signed-in console or back-office page: load now, then every minute. */
  start(surface: StaffSurface = 'console') {
    this.stop();
    if (surface !== this.surface) {
      this.unread.set(0);
      this.items.set([]);
    }
    this.surface = surface;
    void this.refresh();
    this.timer = setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) void this.refresh();
    }, POLL_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.open.set(false);
  }

  async refresh() {
    try {
      const r = await firstValueFrom(
        this.http.get<NotificationList>(this.list, { params: { limit: SHOWN } }),
      );
      this.unread.set(r.unread);
      this.items.set(r.items);
    } catch {
      // The bell keeps its last state; the next poll tries again.
    }
  }

  show() {
    this.open.set(true);
    void this.refresh();
  }

  /** Marks some notifications read (an opened link). */
  async markRead(ids: readonly string[]) {
    await firstValueFrom(this.http.post<void>(`${this.list}/read`, { ids }));
    const set = new Set(ids);
    const before = this.items().filter((n) => set.has(n.id) && !n.read).length;
    this.items.set(this.items().map((n) => (set.has(n.id) ? { ...n, read: true } : n)));
    this.unread.set(Math.max(0, this.unread() - before));
  }

  async markAll() {
    await firstValueFrom(this.http.post<void>(`${this.list}/read`, { all: true }));
    this.items.set(this.items().map((n) => ({ ...n, read: true })));
    this.unread.set(0);
  }

  /** Where a notification opens on the web (null: nothing to open). */
  linkOf(n: ConsoleNotification): string | null {
    if (n.surface !== 'MEMBER') return n.link;
    return webLinkOf(n.link, this.sessions.console()?.subTasks ?? []);
  }

  /** The register title in the user's language; the server's English title when the key is new. */
  title(n: ConsoleNotification) {
    return Object.prototype.hasOwnProperty.call(MESSAGES_EN, n.titleKey)
      ? translate(n.titleKey, n.params)
      : n.title;
  }
}
