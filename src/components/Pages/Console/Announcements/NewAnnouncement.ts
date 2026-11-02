import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Dictation, withPhrase } from '../../../Shared/Dictation';
import { Dropdown } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { t as tr } from '../../../Utils/t';
import { translate } from '../../../Utils/translate';
import { problemText } from '../Structure/academic-format';
import {
  AnnouncementsApi,
  type Announcement,
  type Category,
  type Channel,
  type Group,
  type NewAnnouncement as AnnouncementBody,
} from './announcements.api';
import { BODY, CHANNELS, GROUPS, TITLE } from './announcement-format';

type Field = 'title' | 'text' | 'category' | 'targets' | 'channels' | 'sendAt' | 'file';
const MAX_BYTES = 2 * 1024 * 1024;
const FIELD_OF: Readonly<Record<string, Field>> = {
  title: 'title',
  text: 'text',
  category: 'category',
  targets: 'targets',
  channels: 'channels',
  sendAt: 'sendAt',
  attachmentFileId: 'file',
};

/** "2026-10-05T09:00" for a datetime-local input, in the browser's time. */
function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * New announcement (prototype cc.an.new / cc.an.send; COM-002): title, message, category, the
 * groups, the channels switched on for the institution (one that's off can't be chosen, BR-70),
 * importance, acknowledgement, an optional send time and attachment. It is dispatched in the
 * background after a confirmation.
 */
@Component({
  selector: 'rp-new-announcement',
  imports: [Dictation, Dropdown, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="New announcement"
      [sub]="
        (yearLabel() ? yearLabel() + ' · ' : '') +
        'dispatched in the background so you can keep working'
      "
      icon="megaphone"
      [drawer]="true"
      [wide]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="an-form">
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }
        <div class="c-form">
          <div class="full">
            <div class="fld" [class.invalid]="err('title')">
              <label class="fld-l" for="an-t"
                >Title<span class="req">*</span
                ><span class="count">{{ title().length }}/{{ limits.title.max }}</span></label
              >
              <div class="fld-in">
                <input
                  id="an-t"
                  type="text"
                  placeholder="e.g. Parent–teacher meeting on Saturday"
                  autocomplete="off"
                  aria-describedby="an-t-e"
                  [attr.maxlength]="limits.title.max"
                  [value]="title()"
                  (input)="title.set(val($event)); clear('title')"
                />
              </div>
              <div class="fld-e" id="an-t-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('title') }}</span>
              </div>
            </div>
          </div>
          <div class="full">
            <div class="fld" [class.invalid]="err('text')">
              <label class="fld-l" for="an-x"
                >Message<span class="req">*</span
                ><span class="count">{{ text().length }}/{{ limits.body.max }}</span></label
              >
              <div class="fld-in">
                <textarea
                  id="an-x"
                  rows="5"
                  placeholder="Write the message"
                  aria-describedby="an-x-e"
                  [attr.maxlength]="limits.body.max"
                  [value]="text()"
                  (input)="text.set(val($event)); clear('text')"
                ></textarea>
              </div>
              <!-- Speech to text for announcements (client 2026-10-14). -->
              <rp-dictate fid="an-x-speak" [disabled]="busy()" (heard)="addSpoken($event)" />
              <div class="fld-e" id="an-x-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('text') }}</span>
              </div>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('category')">
            <label class="fld-l" for="an-c">Category<span class="req">*</span></label>
            <rp-dd
              inputId="an-c"
              placeholder="Choose a category"
              [options]="categoryOptions()"
              [value]="category()"
              (changed)="category.set($event); clear('category')"
            />
            <div class="fld-e" id="an-c-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('category') }}</span>
            </div>
          </div>
          <div></div>
        </div>

        <div class="fs">
          <h4><rp-icon name="users" [size]="15" />Who receives it</h4>
          <div class="fs-b">
            <div class="cc-checks" id="an-groups">
              @for (g of groups; track g.v) {
                <label class="chk"
                  ><input
                    type="checkbox"
                    [id]="'an-g-' + g.v"
                    [checked]="picked().includes(g.v)"
                    [disabled]="g.v !== 'ALL' && picked().includes('ALL')"
                    (change)="toggleGroup(g.v)"
                  /><span>{{ g.l }}</span></label
                >
              }
            </div>
            <p class="t-sm t-muted mt8" [class.t-bad]="!!err('targets')">
              {{ err('targets') || groupsText() }}
            </p>
          </div>
        </div>

        <div class="fs">
          <h4><rp-icon name="send" [size]="15" />Channels</h4>
          <div class="fs-b">
            <div class="cc-checks" id="an-channels">
              @for (c of channelList; track c.v) {
                <span class="row g6"
                  ><label class="chk"
                    ><input
                      type="checkbox"
                      [id]="'an-ch-' + c.v"
                      [checked]="channels().includes(c.v)"
                      [disabled]="!enabled().includes(c.v)"
                      (change)="toggleChannel(c.v)"
                    /><span>{{ c.l }}</span></label
                  >
                  @if (!enabled().includes(c.v)) {
                    <span class="chip tone-warn">Off for this institution</span>
                  }
                </span>
              }
            </div>
            <p
              class="t-xs mt8"
              [class.t-muted]="!err('channels')"
              [class.t-bad]="!!err('channels')"
            >
              {{
                err('channels') ||
                  "A channel that's off for the institution can't be chosen; the platform team switches channels on."
              }}
            </p>
          </div>
        </div>

        <div class="c-form">
          <div class="li" style="min-height: 52px">
            <span class="li-ic sm"><rp-icon name="alertc" [size]="15" /></span>
            <span class="li-main"
              ><span class="li-t wrap">High importance</span
              ><span class="li-s wrap">Shown pinned and highlighted in the app</span></span
            >
            <button
              type="button"
              class="toggle"
              role="switch"
              id="an-imp"
              aria-label="High importance"
              [attr.aria-checked]="important()"
              (click)="important.set(!important())"
            ></button>
          </div>
          <div class="li" style="min-height: 52px">
            <span class="li-ic sm"><rp-icon name="hand" [size]="15" /></span>
            <span class="li-main"
              ><span class="li-t wrap">Ask for acknowledgement</span
              ><span class="li-s wrap">Recipients confirm they've read it</span></span
            >
            <button
              type="button"
              class="toggle"
              role="switch"
              id="an-ack"
              aria-label="Ask for acknowledgement"
              [attr.aria-checked]="ack()"
              (click)="ack.set(!ack())"
            ></button>
          </div>
          <div class="li" style="min-height: 52px">
            <span class="li-ic sm"><rp-icon name="clock" [size]="15" /></span>
            <span class="li-main"
              ><span class="li-t wrap">Send later</span
              ><span class="li-s wrap">Choose a time within the next 30 days</span></span
            >
            <button
              type="button"
              class="toggle"
              role="switch"
              id="an-later"
              aria-label="Send later"
              [attr.aria-checked]="later()"
              (click)="setLater(!later())"
            ></button>
          </div>
          @if (later()) {
            <div class="fld" [class.invalid]="err('sendAt')">
              <label class="fld-l" for="an-at">Send at<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="an-at"
                  type="datetime-local"
                  aria-describedby="an-at-e"
                  [min]="minAt"
                  [value]="sendAt()"
                  (change)="sendAt.set(val($event)); clear('sendAt')"
                />
              </div>
              <div class="fld-e" id="an-at-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('sendAt') }}</span>
              </div>
            </div>
          }
        </div>

        <div class="fld" [class.invalid]="err('file')">
          <span class="fld-l">Attachment<span class="opt">(optional)</span></span>
          <label class="upl" [class.done]="!!file()" for="an-file"
            ><span class="upl-ic"
              ><rp-icon [name]="file() ? 'checkc' : 'upload'" [size]="20" /></span
            ><span class="grow" style="min-width: 0"
              ><span class="t-h4 t-clip" style="display: block">{{
                file()?.name ?? 'Choose a file'
              }}</span
              ><span class="t-xs t-muted">{{
                file() ? kb(file()!.size) : 'PDF, JPG or PNG · up to 2 MB'
              }}</span></span
            ><input
              type="file"
              id="an-file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              aria-describedby="an-file-e"
              (change)="pick($event)"
          /></label>
          <div class="fld-e" id="an-file-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('file') }}</span>
          </div>
        </div>
      </div>
      <div modal-foot class="cc-foot">
        <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="an-send"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="send()"
        >
          <rp-icon name="send" [size]="17" /><span>{{
            later() ? 'Schedule announcement' : 'Send announcement'
          }}</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class NewAnnouncement {
  private readonly api = inject(AnnouncementsApi);
  private readonly overlays = inject(Overlays);

  readonly categories = input.required<readonly Category[]>();
  /** The channels switched on for the institution (COM-001). */
  readonly enabled = input.required<readonly Channel[]>();
  readonly yearLabel = input('');
  /** Sends it elsewhere than the console's announcements (the principal's, COM-024); same rules. */
  readonly sender = input<((body: AnnouncementBody) => Promise<Announcement>) | null>(null);
  readonly closed = output<void>();
  readonly saved = output<Announcement>();

  protected readonly limits = { title: TITLE, body: BODY };
  protected readonly groups = GROUPS;
  protected readonly channelList = CHANNELS;
  protected readonly minAt = localInput(new Date());

  protected readonly title = signal('');
  protected readonly text = signal('');
  protected readonly category = signal('');
  protected readonly picked = signal<readonly Group[]>([]);
  protected readonly channels = signal<readonly Channel[]>(['IN_APP']);
  protected readonly important = signal(false);
  protected readonly ack = signal(false);
  protected readonly later = signal(false);
  protected readonly sendAt = signal('');
  protected readonly file = signal<File | null>(null);
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  private readonly dictation = viewChild(Dictation);

  protected readonly categoryOptions = computed(() =>
    this.categories().map((c) => ({ v: c.code, l: c.label })),
  );
  protected readonly groupsText = computed(() => {
    const g = this.picked();
    if (!g.length) return 'Choose at least one group.';
    const names = g.map((x) => GROUPS.find((y) => y.v === x)?.l ?? x).join(', ');
    return `${g.includes('ALL') ? 'Every active member' : names} · ${this.channelText() || 'no channel'}`;
  });
  private readonly channelText = computed(() =>
    this.channels()
      .map((c) => CHANNELS.find((x) => x.v === c)?.l ?? c)
      .join(', '),
  );

  protected err(f: Field) {
    return this.errors()[f] ?? '';
  }
  protected clear(f: Field) {
    if (this.errors()[f]) this.errors.update((e) => ({ ...e, [f]: '' }));
    this.error.set('');
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  /** A phrase spoken (speech to text) joins the message, within its length. */
  protected addSpoken(text: string) {
    const next = withPhrase(this.text(), text);
    if (next.length > BODY.max) this.dictation()?.note(tr('ui.web.dictate.full'));
    this.text.set(next.slice(0, BODY.max));
    this.clear('text');
  }
  protected kb(n: number) {
    return n < 1024 * 1024
      ? `${Math.max(1, Math.round(n / 1024))} KB`
      : `${(n / 1048576).toFixed(1)} MB`;
  }

  protected toggleGroup(g: Group) {
    const cur = this.picked();
    this.picked.set(
      g === 'ALL'
        ? cur.includes('ALL')
          ? []
          : ['ALL']
        : cur.includes(g)
          ? cur.filter((x) => x !== g)
          : [...cur, g],
    );
    this.clear('targets');
  }
  protected toggleChannel(c: Channel) {
    const cur = this.channels();
    this.channels.set(cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]);
    this.clear('channels');
  }
  protected setLater(on: boolean) {
    this.later.set(on);
    if (on && !this.sendAt()) {
      const d = new Date(Date.now() + 86_400_000);
      d.setHours(9, 0, 0, 0);
      this.sendAt.set(localInput(d));
    }
    this.clear('sendAt');
  }
  protected pick(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0] ?? null;
    this.clear('file');
    if (f && f.size > MAX_BYTES) {
      this.file.set(null);
      this.errors.update((x) => ({ ...x, file: translate('FILE.TOO_LARGE', { limit: '2 MB' }) }));
      return;
    }
    this.file.set(f);
  }

  /** cc.an.send's checks, in the register's words. */
  private validate() {
    const e: Partial<Record<Field, string>> = {};
    const t = this.title().trim();
    const x = this.text().trim();
    if (t.length < TITLE.min || t.length > TITLE.max) e.title = translate('COM.TITLE', TITLE);
    if (x.length < BODY.min || x.length > BODY.max) e.text = translate('COM.BODY', BODY);
    if (!this.category()) e.category = translate('COM.CATEGORY');
    if (!this.picked().length) e.targets = translate('COM.TARGETS');
    if (!this.channels().length) e.channels = 'Choose at least one channel.';
    if (this.later()) {
      const at = new Date(this.sendAt()).getTime();
      if (
        !this.sendAt() ||
        Number.isNaN(at) ||
        at <= Date.now() ||
        at > Date.now() + 30 * 86_400_000
      )
        e.sendAt = translate('COM.SEND_AT');
    }
    this.errors.set(e);
    return Object.values(e).every((v) => !v);
  }

  protected async send() {
    if (this.busy() || !this.validate()) return;
    const at = this.later() ? new Date(this.sendAt()) : null;
    const to = this.picked()
      .map((g) => GROUPS.find((x) => x.v === g)?.l ?? g)
      .join(', ');
    const ok = await this.overlays.confirm({
      title: at ? 'Schedule this announcement?' : 'Send this announcement?',
      icon: 'send',
      text: `To ${to === 'All' ? 'every active member' : to} by ${this.channelText()}. ${
        at
          ? `It goes out on ${formatDate(at)} at ${formatTime(at)}.`
          : 'Sending runs in the background.'
      }`,
      ok: at ? 'Schedule' : 'Send now',
    });
    if (!ok) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const f = this.file();
      const attachmentFileId = f ? (await this.api.upload(f)).fileId : null;
      const send = this.sender() ?? ((b: AnnouncementBody) => this.api.create(b));
      const a = await send({
        title: this.title().trim(),
        text: this.text().trim(),
        category: this.category(),
        important: this.important(),
        ackRequired: this.ack(),
        targets: { groups: this.picked() },
        channels: this.channels(),
        ...(at ? { sendAt: at.toISOString() } : {}),
        ...(attachmentFileId ? { attachmentFileId } : {}),
      });
      this.overlays.toast(at ? 'Announcement scheduled' : 'Announcement queued for sending', {
        sub: `${a.code} · ${a.title}`,
      });
      this.saved.emit(a);
    } catch (e) {
      const fields: Partial<Record<Field, string>> = {};
      if (e instanceof ApiProblem)
        for (const x of e.errors) {
          const k = FIELD_OF[x.field.split('.')[0] ?? ''];
          if (k) fields[k] = x.message;
        }
      if (Object.keys(fields).length) this.errors.set(fields);
      else this.error.set(problemText(e));
    } finally {
      this.busy.set(false);
    }
  }
}
