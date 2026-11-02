/**
 * Messages (client 2026-10-12; the app's direct messages, COM-016…021): the teacher's conversations
 * — active or archived, newest first, with unread counts — one open beside the list with its
 * messages and a reply box, and a new message to anyone the school's rules allow (BR-71: their own
 * students and their parents, colleagues). Opening a conversation marks it read. New messages
 * arrive without a refresh (client 2026-10-14): the open conversation is checked every few seconds
 * and the list less often, while the page is in view.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type OnInit,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatTime, istBusinessDate } from '../../../Utils/format';
import { t as tr } from '../../../Utils/t';
import { problemText, today } from '../Structure/academic-format';
import {
  type Contact,
  type Contacts,
  type Conversation,
  type Conversations,
  type DmChild,
  type DmGroup,
  MeApi,
  type Thread,
} from './me.api';

const MAX_CHARS = 4000;

/**
 * Whose parent this is (client 2026-10-23): "Father of Chitra Rao (Grade 6 A), Arjun Rao (Grade 2
 * B)" — by relation, each child with their class.
 */
export function familyText(children: readonly DmChild[] | undefined): string {
  const by = new Map<string, string[]>();
  for (const c of children ?? []) {
    const rel = ['FATHER', 'MOTHER', 'GUARDIAN'].includes(c.relation) ? c.relation : 'OTHER';
    const who = c.classSection ? `${c.name} (${c.classSection})` : c.name;
    by.set(rel, [...(by.get(rel) ?? []), who]);
  }
  return [...by]
    .map(([rel, names]) =>
      tr(`ui.web.tch.my.msg.rel.${rel.toLowerCase()}`, { names: names.join(', ') }),
    )
    .join(' · ');
}

/** A contact's second line: the role, then a student's class or a parent's children. */
const contactSub = (c: Contact) =>
  [c.roleLabel, c.sub, familyText(c.children)].filter(Boolean).join(' · ');
/** How often the open conversation is checked for new messages, in ms. */
const THREAD_EVERY = 5_000;
/** The list is checked every this many thread checks (15 seconds). */
const LIST_EVERY = 3;

/** New message: find someone the school's rules let the teacher write to. */
@Component({
  selector: 'rp-message-to',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<rp-modal
    [title]="t('ui.web.tch.my.msg.newTitle')"
    [sub]="t('ui.web.tch.my.msg.newSub')"
    icon="chat"
    [drawer]="true"
    (closed)="closed.emit()"
  >
    <div class="stack g12" id="msg-to">
      <label class="search"
        ><rp-icon name="search" [size]="16" /><input
          type="search"
          id="msg-to-q"
          autocomplete="off"
          [placeholder]="t('ui.web.tch.my.msg.searchPh')"
          [value]="q()"
          (input)="search($event)"
      /></label>
      @if (data(); as d) {
        @if (d.allowed.length > 1) {
          <div class="pills" role="group">
            <button
              type="button"
              class="pill"
              [class.on]="!group()"
              (click)="group.set(null); load()"
            >
              {{ t('ui.web.tch.my.msg.everyone') }}
            </button>
            @for (g of d.allowed; track g) {
              <button
                type="button"
                class="pill"
                [class.on]="group() === g"
                (click)="group.set(g); load()"
              >
                {{ groupLabel(g) }}
              </button>
            }
          </div>
        }
      }
      @if (error()) {
        <div class="note tone-bad" role="alert">
          <rp-icon name="alertc" [size]="17" />
          <div class="grow">{{ error() }}</div>
        </div>
      }
      @for (g of found(); track g.group) {
        @if (g.items.length) {
          <div class="stack g4">
            <div class="t-xs t-muted">{{ groupLabel(g.group) }} · {{ g.total }}</div>
            <div class="card list">
              @for (c of g.items; track c.profileId) {
                <button type="button" class="li msg-contact" (click)="picked.emit(c)">
                  <span class="li-main"
                    ><span class="li-t">{{ c.name }}</span
                    ><span class="li-s">{{ sub(c) }}</span></span
                  >
                  <span class="li-r"><rp-icon name="right" [size]="16" /></span>
                </button>
              }
            </div>
          </div>
        }
      } @empty {
        @if (!loading()) {
          <p class="t-sm t-muted">{{ t('ui.web.tch.my.msg.noContacts') }}</p>
        }
      }
    </div>
  </rp-modal>`,
})
export class MessageTo implements OnInit {
  private readonly api = inject(MeApi);
  protected readonly t = tr;
  readonly closed = output<void>();
  readonly picked = output<Contact>();
  protected readonly q = signal('');
  protected readonly group = signal<DmGroup | null>(null);
  protected readonly data = signal<Contacts | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  /** The groups with anyone in them. */
  protected readonly found = computed(() =>
    (this.data()?.groups ?? []).filter((g) => g.items.length),
  );
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  ngOnInit() {
    void this.load();
  }

  async load() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const d = await this.api.contacts(this.q().trim(), this.group());
      if (n !== this.seq) return;
      this.data.set(d);
      this.error.set('');
    } catch (e) {
      if (n === this.seq) this.error.set(problemText(e));
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  protected search(e: Event) {
    this.q.set((e.target as HTMLInputElement).value);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(), 300);
  }
  protected groupLabel(g: DmGroup) {
    return groupLabel(g);
  }
  protected readonly sub = contactSub;
}

const groupLabel = (g: DmGroup | null) => (g ? tr(`ui.web.tch.my.msg.g.${g.toLowerCase()}`) : '');

@Component({
  selector: 'rp-teaching-messages',
  imports: [Empty, Icon, MessageTo, NgTemplateOutlet, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
      <rp-page-head [title]="t('ui.web.nav.messages')" [sub]="t('ui.web.tch.my.msg.sub')">
        <button type="button" class="btn btn-pri" id="msg-new" (click)="choosing.set(true)">
          <rp-icon name="plus" [size]="17" /><span>{{ t('ui.web.tch.my.msg.new') }}</span>
        </button>
      </rp-page-head>

      @if (error()) {
        <div class="note tone-bad" role="alert" id="msg-error">
          <rp-icon name="alert" [size]="17" />
          <div class="grow">{{ error() }}</div>
          <button type="button" class="btn btn-sec btn-sm" (click)="load()">
            {{ t('ui.web.tch.retry') }}
          </button>
        </div>
      }

      <div class="msg-grid">
        <div class="stack g8 msg-side">
          <div class="row g8">
            <div class="seg" role="radiogroup" style="flex: 1">
              <button
                type="button"
                role="radio"
                id="msg-active"
                [class.on]="!archived()"
                [attr.aria-checked]="!archived()"
                (click)="show(false)"
              >
                {{ t('ui.web.tch.my.msg.active') }}
                @if (list()?.counts?.unreadConversations) {
                  <span class="msg-unread">{{ list()!.counts.unreadConversations }}</span>
                }
              </button>
              <button
                type="button"
                role="radio"
                id="msg-archived"
                [class.on]="archived()"
                [attr.aria-checked]="archived()"
                (click)="show(true)"
              >
                {{ t('ui.web.tch.my.msg.archived') }}
              </button>
            </div>
            <button
              type="button"
              class="iconbtn"
              id="msg-refresh"
              [attr.aria-label]="t('ui.web.tch.my.msg.refresh')"
              [title]="t('ui.web.tch.my.msg.refresh')"
              (click)="load()"
            >
              <rp-icon name="refresh" [size]="16" />
            </button>
          </div>
          @if (loading() && !list()) {
            <div class="sk" style="height: 200px; border-radius: 16px"></div>
          } @else if (!list()?.items?.length) {
            <rp-empty
              icon="chats"
              [title]="t(archived() ? 'ui.web.tch.my.msg.noArchived' : 'ui.web.tch.my.msg.empty')"
              [text]="archived() ? '' : t('ui.web.tch.my.msg.emptyText')"
            />
          } @else {
            <div class="card list" id="msg-list">
              @for (c of list()!.items; track c.conversationId; let i = $index) {
                <button
                  type="button"
                  class="li"
                  [id]="'msg-c-' + i"
                  [class.on]="openId() === c.conversationId"
                  (click)="open(c.conversationId)"
                >
                  <span class="li-main"
                    ><span class="li-t" [style.font-weight]="c.unread ? 650 : null">{{
                      c.with.name
                    }}</span>
                    @if (family(c.with); as fam) {
                      <span class="li-s msg-family">{{ fam }}</span>
                    }
                    <span class="li-s">{{ preview(c) }}</span></span
                  >
                  <span class="li-r stack g4" style="align-items: flex-end">
                    <span class="t-xs t-muted">{{ when(c.lastMessage?.at ?? null) }}</span>
                    @if (c.unread) {
                      <span class="msg-unread">{{ c.unread }}</span>
                    }
                  </span>
                </button>
              }
            </div>
          }
        </div>

        <div class="card msg-main" id="msg-thread">
          @if (thread(); as th) {
            <div class="msg-head row g8">
              <div class="grow" style="min-width: 0">
                <b>{{ th.conversation.with.name }}</b>
                <div class="t-xs t-muted">{{ who(th.conversation.with) }}</div>
              </div>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                id="msg-archive"
                (click)="toggleArchive(th)"
              >
                <rp-icon name="archive" [size]="15" /><span>{{
                  t(
                    th.conversation.archived
                      ? 'ui.web.tch.my.msg.restore'
                      : 'ui.web.tch.my.msg.archive'
                  )
                }}</span>
              </button>
            </div>
            <div class="msg-body" id="msg-body">
              @if (th.olderCursor) {
                <button type="button" class="btn btn-ghost btn-sm" id="msg-older" (click)="older()">
                  {{ t('ui.web.tch.my.msg.older') }}
                </button>
              }
              @for (m of th.items; track m.id) {
                <div class="msg-b" [class.mine]="m.mine">
                  <div class="msg-t">{{ m.text }}</div>
                  <div class="msg-m">
                    {{ when(m.at) }}
                    @if (m.mine) {
                      · {{ t('ui.web.tch.my.msg.st.' + m.status.toLowerCase()) }}
                    }
                  </div>
                </div>
              }
            </div>
            <ng-container
              *ngTemplateOutlet="composer; context: { canSend: th.conversation.canSend }"
            />
          } @else if (newTo(); as to) {
            <div class="msg-head row g8">
              <div class="grow" style="min-width: 0">
                <b>{{ to.name }}</b>
                <div class="t-xs t-muted">{{ sub(to) }}</div>
              </div>
            </div>
            <div class="msg-body">
              <p class="t-sm t-muted">{{ t('ui.web.tch.my.msg.first', { name: to.name }) }}</p>
            </div>
            <ng-container *ngTemplateOutlet="composer; context: { canSend: true }" />
          } @else {
            <rp-empty
              icon="chat"
              [title]="t('ui.web.tch.my.msg.pick')"
              [text]="t('ui.web.tch.my.msg.pickText')"
            />
          }
        </div>
      </div>
    </div>

    <ng-template #composer let-canSend="canSend">
      @if (canSend) {
        <div class="msg-compose">
          <div class="fld" [class.invalid]="!!sendError()">
            <div class="fld-in">
              <textarea
                id="msg-text"
                rows="3"
                [attr.maxlength]="maxChars"
                [placeholder]="t('ui.web.tch.my.msg.typePh')"
                [value]="draft()"
                (input)="draft.set(val($event)); sendError.set('')"
                (keydown.control.enter)="send()"
              ></textarea>
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ sendError() }}</span>
            </div>
          </div>
          <div class="row g8">
            <span class="t-xs t-muted grow">{{ t('ui.web.tch.my.msg.hint') }}</span>
            <button
              type="button"
              class="btn btn-pri btn-sm"
              id="msg-send"
              [class.is-busy]="sending()"
              [disabled]="sending() || !draft().trim()"
              (click)="send()"
            >
              <rp-icon name="send" [size]="15" /><span>{{ t('ui.web.tch.my.msg.send') }}</span>
            </button>
          </div>
        </div>
      } @else {
        <div class="note tone-info" id="msg-closed">
          <rp-icon name="lock" [size]="17" />
          <div class="grow">{{ t('ui.web.tch.my.msg.cantSend') }}</div>
        </div>
      }
    </ng-template>

    @if (choosing()) {
      <rp-message-to (closed)="choosing.set(false)" (picked)="pickContact($event)" />
    }`,
})
export class TeachingMessages implements OnInit {
  private readonly api = inject(MeApi);
  private readonly overlays = inject(Overlays);
  protected readonly t = tr;
  protected readonly maxChars = MAX_CHARS;
  protected readonly archived = signal(false);
  protected readonly list = signal<Conversations | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly openId = signal<string | null>(null);
  protected readonly thread = signal<Thread | null>(null);
  /** Someone picked for a first message (no conversation yet). */
  protected readonly newTo = signal<Contact | null>(null);
  protected readonly draft = signal('');
  protected readonly sending = signal(false);
  protected readonly sendError = signal('');
  protected readonly choosing = signal(false);
  private readonly day = today();
  private readonly destroyRef = inject(DestroyRef);
  private polling = false;
  private polls = 0;

  ngOnInit() {
    void this.load();
    const timer = setInterval(() => void this.poll(), THREAD_EVERY);
    // Back to the page: catch up at once.
    const back = () => void this.poll(true);
    document.addEventListener('visibilitychange', back);
    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', back);
    });
  }

  /**
   * What's new since the last look, without the loading state: messages that arrived (or were
   * read) in the open conversation, and the list now and then or when the thread changed.
   * A failure stays quiet; the next check tries again.
   */
  private async poll(list = false) {
    if (document.visibilityState === 'hidden') return;
    if (this.polling || this.loading() || this.sending()) return;
    this.polling = true;
    const id = this.openId();
    const archived = this.archived();
    try {
      const fresh = id ? await this.api.thread(id) : null;
      const changed = fresh && id === this.openId() ? this.merge(fresh) : false;
      if (list || changed || ++this.polls % LIST_EVERY === 0) {
        const l = await this.api.conversations(archived);
        if (archived !== this.archived() || this.loading()) return;
        const open = this.openId();
        this.list.set({
          ...l,
          items: l.items.map((c) => (c.conversationId === open ? { ...c, unread: 0 } : c)),
        });
      }
    } catch {
      // Quiet: the page still shows what it had, and the next check tries again.
    } finally {
      this.polling = false;
    }
  }

  /** Joins the latest page to what is shown (older pages stay); true when anything changed. */
  private merge(fresh: Thread) {
    const cur = this.thread();
    if (!cur || cur.conversation.id !== fresh.conversation.id) return false;
    const was = new Map(cur.items.map((m) => [m.id, m.status]));
    const added = fresh.items.some((m) => !was.has(m.id));
    const changed =
      added ||
      fresh.items.some((m) => was.get(m.id) !== m.status) ||
      fresh.conversation.canSend !== cur.conversation.canSend ||
      fresh.conversation.archived !== cur.conversation.archived;
    if (!changed) return false;
    const ids = new Set(fresh.items.map((m) => m.id));
    this.thread.set({
      ...fresh,
      items: [...cur.items.filter((m) => !ids.has(m.id)), ...fresh.items],
      // Older pages already shown stay; the next older page is the one before them.
      olderCursor: cur.olderCursor,
    });
    if (added) this.scrollDown();
    return true;
  }

  async load() {
    this.loading.set(true);
    try {
      this.list.set(await this.api.conversations(this.archived()));
      this.error.set('');
      const id = this.openId();
      if (id) await this.refreshThread(id);
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected show(archived: boolean) {
    if (archived === this.archived()) return;
    this.archived.set(archived);
    void this.load();
  }

  /** Opening it marks the other side's messages read (COM-019). */
  protected async open(id: string) {
    this.newTo.set(null);
    this.openId.set(id);
    this.draft.set('');
    this.sendError.set('');
    await this.refreshThread(id);
    this.list.update((l) =>
      l
        ? {
            ...l,
            items: l.items.map((c) => (c.conversationId === id ? { ...c, unread: 0 } : c)),
          }
        : l,
    );
  }

  private async refreshThread(id: string) {
    try {
      this.thread.set(await this.api.thread(id));
      this.scrollDown();
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
    }
  }

  protected async older() {
    const th = this.thread();
    if (!th?.olderCursor) return;
    try {
      const page = await this.api.thread(th.conversation.id, th.olderCursor);
      this.thread.set({ ...page, items: [...page.items, ...th.items] });
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
    }
  }

  protected pickContact(c: Contact) {
    this.choosing.set(false);
    if (c.conversationId) {
      if (this.archived()) {
        this.archived.set(false);
        void this.load();
      }
      void this.open(c.conversationId);
      return;
    }
    this.openId.set(null);
    this.thread.set(null);
    this.draft.set('');
    this.sendError.set('');
    this.newTo.set(c);
  }

  protected async send() {
    const text = this.draft().trim();
    if (!text || this.sending()) return;
    if ([...text].length > MAX_CHARS) {
      this.sendError.set(tr('COM.DM_BODY', { max: MAX_CHARS }));
      return;
    }
    this.sending.set(true);
    try {
      const to = this.newTo();
      const th = this.thread();
      const out = to
        ? await this.api.start(to.profileId, text)
        : th
          ? await this.api.send(th.conversation.id, text)
          : null;
      if (!out) return;
      this.draft.set('');
      this.newTo.set(null);
      this.openId.set(out.conversationId);
      if (this.archived()) this.archived.set(false);
      await this.load();
    } catch (e) {
      this.sendError.set(problemText(e));
    } finally {
      this.sending.set(false);
    }
  }

  protected async toggleArchive(th: Thread) {
    const archive = !th.conversation.archived;
    try {
      await this.api.archive(th.conversation.id, archive);
      this.overlays.toast(
        tr(archive ? 'ui.web.tch.my.msg.archivedDone' : 'ui.web.tch.my.msg.restoredDone'),
        { sub: th.conversation.with.name },
      );
      this.openId.set(null);
      this.thread.set(null);
      await this.load();
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
    }
  }

  protected preview(c: Conversation) {
    const m = c.lastMessage;
    if (!m) return this.who(c.with);
    return m.mine ? tr('ui.web.tch.my.msg.you', { text: m.text }) : m.text;
  }
  protected who(w: Conversation['with']) {
    return [w.roleLabel, w.classSection, familyText(w.children)].filter(Boolean).join(' · ');
  }
  /** A parent's children, under their name in the list (client 2026-10-23). */
  protected family(w: Conversation['with']) {
    return familyText(w.children);
  }
  protected readonly sub = contactSub;
  /** Today's messages by the time, older ones by the date. */
  protected when(v: string | null) {
    if (!v) return '';
    return istBusinessDate(new Date(v)) === this.day ? formatTime(v) : formatDate(v);
  }
  protected val(e: Event) {
    return (e.target as HTMLTextAreaElement).value;
  }
  private scrollDown() {
    setTimeout(() => {
      const b = document.querySelector('#msg-body');
      if (b) b.scrollTop = b.scrollHeight;
    }, 0);
  }
}
