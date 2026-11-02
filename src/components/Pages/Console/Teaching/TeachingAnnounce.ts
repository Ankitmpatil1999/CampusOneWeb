/**
 * Class announcements (Phase 10, teachers on the web; the app's m.t.announce): what the teacher sent
 * their classes with the dispatch outcome and acknowledgements, a new one to a class in the app
 * (lengths from the platform's settings), and who has or hasn't acknowledged with a reminder
 * (COM-022/023/027…029).
 */
import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Dictation, withPhrase } from '../../../Shared/Dictation';
import { Dropdown } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDateTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { t as tr } from '../../../Utils/t';
import { problemText } from '../Structure/academic-format';
import { ClassesApi, type ClassItem } from './classes.api';
import { type AckRow, type AnnounceOptions, type ClassAnnouncement, WorkApi } from './work.api';

type Field = 'class' | 'title' | 'text';
const DEFAULT_LIMITS: AnnounceOptions['limits'] = {
  titleMin: 3,
  titleMax: 120,
  textMin: 10,
  textMax: 5000,
};

@Component({
  selector: 'rp-teaching-announce',
  imports: [Dictation, Dropdown, Empty, Icon, Modal, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    <rp-page-head [title]="t('ui.web.nav.announce')" [sub]="t('ui.web.tch.an.sub')">
      <button
        type="button"
        class="btn btn-pri"
        id="an-new"
        [disabled]="!classes().length"
        (click)="openForm()"
      >
        <rp-icon name="megaphone" [size]="17" /><span>{{ t('ui.web.tch.an.new') }}</span>
      </button>
    </rp-page-head>

    @if (loading()) {
      <div class="card pad"><div class="sk" style="height: 240px; border-radius: 16px"></div></div>
    } @else if (error()) {
      <div class="note tone-bad" role="alert" id="ta-an-error">
        <rp-icon name="alert" [size]="17" />
        <div class="grow">{{ error() }}</div>
        <button type="button" class="btn btn-sec btn-sm" (click)="load()">
          {{ t('ui.web.tch.retry') }}
        </button>
      </div>
    } @else if (!items().length) {
      <rp-empty
        icon="megaphone"
        [title]="t('ui.web.tch.an.empty')"
        [text]="t('ui.web.tch.an.emptyText')"
      />
    } @else {
      <div class="stack g12" id="an-list">
        @for (a of items(); track a.id; let i = $index) {
          <div class="card pad stack g8" [id]="'an-' + i">
            <div class="row g8 wrap">
              <b class="grow">{{ a.title }}</b>
              @if (a.withdrawn) {
                <span class="chip tone-bad">{{ t('ui.web.tch.an.withdrawn') }}</span>
              } @else {
                <span class="chip dot" [class]="'tone-' + tone(a.dispatch.status)">{{
                  dispatchLabel(a.dispatch.status)
                }}</span>
              }
            </div>
            <div class="t-sm t-muted">
              {{ a.classSection ?? '' }} · {{ dateTime(a.sendAt) }} · {{ a.code }}
            </div>
            <div class="t-sm" style="white-space: pre-line">{{ a.text }}</div>
            <div class="row g8 wrap t-sm">
              <span>{{ t('ui.web.tch.an.recipients', { n: a.dispatch.recipients }) }}</span>
              @if (a.acknowledgements; as k) {
                <span class="t-muted">·</span>
                <span>{{ t('ui.web.tch.an.acks', { n: k.acknowledged, total: k.of }) }}</span>
                <span class="grow"></span>
                <button
                  type="button"
                  class="btn btn-sec btn-sm"
                  [id]="'an-who-' + i"
                  (click)="openAcks(a)"
                >
                  {{ t('ui.web.tch.an.who') }}
                </button>
              }
            </div>
          </div>
        }
      </div>
    }

    @if (composing()) {
      <rp-modal
        [title]="t('ui.web.tch.an.new')"
        [sub]="t('ui.web.tch.an.formSub')"
        icon="megaphone"
        [drawer]="true"
        [slim]="true"
        [dismiss]="!busy()"
        (closed)="composing.set(false)"
      >
        <div class="stack g16" id="an-form">
          @if (formError()) {
            <div class="note tone-bad" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ formError() }}</div>
            </div>
          }
          <div class="fld" [class.invalid]="err('class')">
            <label class="fld-l" for="an-class-b"
              >{{ t('ui.web.tch.an.class') }}<span class="req">*</span></label
            >
            <rp-dd
              inputId="an-class"
              [placeholder]="t('ui.web.tch.an.pickClass')"
              [options]="classOptions()"
              [value]="sectionId()"
              (changed)="sectionId.set($event); clear('class')"
            />
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('class') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('title')">
            <label class="fld-l" for="an-t"
              >{{ t('ui.web.tch.an.title') }}<span class="req">*</span
              ><span class="count">{{ title().length }}/{{ limits().titleMax }}</span></label
            >
            <div class="fld-in">
              <input
                id="an-t"
                type="text"
                autocomplete="off"
                [attr.maxlength]="limits().titleMax"
                [placeholder]="t('ui.web.tch.an.titlePh')"
                [value]="title()"
                (input)="title.set(val($event)); clear('title')"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('title') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('text')">
            <label class="fld-l" for="an-x"
              >{{ t('ui.web.tch.an.text') }}<span class="req">*</span
              ><span class="count">{{ text().length }}/{{ limits().textMax }}</span></label
            >
            <div class="fld-in">
              <textarea
                id="an-x"
                rows="6"
                [attr.maxlength]="limits().textMax"
                [placeholder]="t('ui.web.tch.an.textPh')"
                [value]="text()"
                (input)="text.set(val($event)); clear('text')"
              ></textarea>
            </div>
            <!-- Speech to text for announcements (client 2026-10-14). -->
            <rp-dictate fid="an-x-speak" [disabled]="busy()" (heard)="addSpoken($event)" />
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('text') }}</span>
            </div>
          </div>
          <div class="li" style="min-height: 52px">
            <span class="li-ic sm"><rp-icon name="hand" [size]="15" /></span>
            <span class="li-main"
              ><span class="li-t wrap">{{ t('ui.web.tch.an.ack') }}</span
              ><span class="li-s wrap">{{ t('ui.web.tch.an.ackSub') }}</span></span
            >
            <button
              type="button"
              class="toggle"
              role="switch"
              id="an-ack"
              [attr.aria-label]="t('ui.web.tch.an.ack')"
              [attr.aria-checked]="ack()"
              (click)="ack.set(!ack())"
            ></button>
          </div>
        </div>
        <div modal-foot class="cc-foot">
          <button
            type="button"
            class="btn btn-ghost"
            [disabled]="busy()"
            (click)="composing.set(false)"
          >
            <span>{{ t('ui.web.tch.hw.cancel') }}</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            id="an-send"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="send()"
          >
            <rp-icon name="send" [size]="17" /><span>{{ t('ui.web.tch.an.send') }}</span>
          </button>
        </div>
      </rp-modal>
    }

    @if (acksOf(); as a) {
      <rp-modal
        [title]="a.title"
        [sub]="t('ui.web.tch.an.who')"
        icon="hand"
        [drawer]="true"
        [slim]="true"
        (closed)="acksOf.set(null)"
      >
        <div class="stack g12">
          <div class="tabs" role="tablist" [attr.aria-label]="t('ui.web.tch.an.who')">
            @for (v of ackTabs; track v) {
              <button
                type="button"
                class="tab"
                role="tab"
                [id]="'an-ack-' + v"
                [class.on]="acked() === v"
                [attr.aria-selected]="acked() === v"
                (click)="loadAcks(v)"
              >
                {{ t(v ? 'ui.web.tch.an.done' : 'ui.web.tch.an.pending') }}
              </button>
            }
          </div>
          @if (acks(); as rows) {
            <div class="stack g8" id="an-acks">
              @for (r of rows; track r.member.id) {
                <div
                  class="row g8 wrap"
                  style="padding: 8px 0; border-bottom: 1px solid var(--line)"
                >
                  <div class="grow">
                    <b>{{ r.member.name }}</b>
                    <div class="t-sm t-muted">
                      {{ r.member.type }}
                      @if (r.member.admissionNo) {
                        · {{ r.member.admissionNo }}
                      }
                    </div>
                  </div>
                  @if (r.acknowledgedAt) {
                    <span class="t-sm t-muted">{{
                      t('ui.web.tch.an.ackAt', { at: dateTime(r.acknowledgedAt) })
                    }}</span>
                  }
                </div>
              } @empty {
                <p class="t-muted">{{ t('ui.web.tch.an.nobody') }}</p>
              }
            </div>
          } @else {
            <div class="sk" style="height: 160px; border-radius: 16px"></div>
          }
        </div>
        <div modal-foot class="cc-foot">
          <button type="button" class="btn btn-ghost" (click)="acksOf.set(null)">
            <span>{{ t('ui.web.tch.close') }}</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            id="an-remind"
            [disabled]="busy() || a.dispatch.status !== 'COMPLETED' || !!a.withdrawn"
            (click)="remind(a)"
          >
            <rp-icon name="bell" [size]="17" /><span>{{ t('ui.web.tch.an.remind') }}</span>
          </button>
        </div>
      </rp-modal>
    }
  </div>`,
})
export class TeachingAnnounce implements OnInit {
  private readonly api = inject(WorkApi);
  private readonly classesApi = inject(ClassesApi);
  private readonly overlays = inject(Overlays);
  protected readonly t = tr;
  protected readonly items = signal<readonly ClassAnnouncement[]>([]);
  protected readonly classes = signal<readonly ClassItem[]>([]);
  protected readonly limits = signal(DEFAULT_LIMITS);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected readonly composing = signal(false);
  protected readonly sectionId = signal('');
  protected readonly title = signal('');
  protected readonly text = signal('');
  protected readonly ack = signal(false);
  protected readonly formError = signal('');
  private readonly errors = signal<Partial<Record<Field, string>>>({});
  private readonly dictation = viewChild(Dictation);

  protected readonly ackTabs = [false, true] as const;
  protected readonly acksOf = signal<ClassAnnouncement | null>(null);
  protected readonly acked = signal(false);
  protected readonly acks = signal<readonly AckRow[] | null>(null);

  protected readonly classOptions = computed(() =>
    this.classes().map((c) => ({
      v: c.id,
      l: c.label,
      sub: tr('ui.web.tch.hw.students', { n: c.students }),
    })),
  );

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const [list, classes] = await Promise.all([
        this.api.announcements(),
        this.classesApi.classes(),
      ]);
      this.items.set(list.items);
      this.classes.set(classes.items);
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async openForm() {
    this.sectionId.set(this.classes().length === 1 ? this.classes()[0]!.id : '');
    this.title.set('');
    this.text.set('');
    this.ack.set(false);
    this.errors.set({});
    this.formError.set('');
    this.composing.set(true);
    try {
      this.limits.set((await this.api.options()).limits);
    } catch {
      // The defaults stand in; the server checks the lengths again.
    }
  }

  protected err(f: Field) {
    return this.errors()[f] ?? '';
  }
  protected clear(f: Field) {
    this.errors.update((e) => ({ ...e, [f]: '' }));
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }

  /** A phrase spoken (speech to text) joins the message, within its length. */
  protected addSpoken(text: string) {
    const max = this.limits().textMax;
    const next = withPhrase(this.text(), text);
    if (next.length > max) this.dictation()?.note(tr('ui.web.dictate.full'));
    this.text.set(next.slice(0, max));
    this.clear('text');
  }

  protected async send() {
    const l = this.limits();
    const title = this.title().trim();
    const text = this.text().trim();
    const e: Partial<Record<Field, string>> = {};
    if (!this.sectionId()) e.class = tr('ui.web.tch.an.needClass');
    if (title.length < l.titleMin || title.length > l.titleMax) {
      e.title = tr('ui.web.tch.an.titleLen', { min: l.titleMin, max: l.titleMax });
    }
    if (text.length < l.textMin || text.length > l.textMax) {
      e.text = tr('ui.web.tch.an.textLen', { min: l.textMin, max: l.textMax });
    }
    this.errors.set(e);
    if (Object.keys(e).length || this.busy()) return;
    this.busy.set(true);
    try {
      await this.api.announce({
        classSectionId: this.sectionId(),
        title,
        text,
        ackRequired: this.ack(),
      });
      const section = this.classes().find((c) => c.id === this.sectionId())?.label ?? '';
      this.overlays.toast(tr('ui.web.tch.an.sent'), {
        sub: tr('ui.web.tch.an.sentSub', { section }),
      });
      this.composing.set(false);
      await this.refresh();
    } catch (err) {
      const f = err instanceof ApiProblem ? err.errors : [];
      const map: Record<string, Field> = { title: 'title', text: 'text', classSectionId: 'class' };
      const placed = f.filter((x) => map[x.field]);
      for (const x of placed) this.errors.update((m) => ({ ...m, [map[x.field]!]: x.message }));
      if (!placed.length) this.formError.set(problemText(err));
    } finally {
      this.busy.set(false);
    }
  }

  private async refresh() {
    try {
      this.items.set((await this.api.announcements()).items);
    } catch {
      // the list refreshes on the next visit
    }
  }

  protected openAcks(a: ClassAnnouncement) {
    this.acksOf.set(a);
    void this.loadAcks(false);
  }

  protected async loadAcks(acked: boolean) {
    const a = this.acksOf();
    if (!a) return;
    this.acked.set(acked);
    this.acks.set(null);
    try {
      this.acks.set((await this.api.acknowledgements(a.id, acked)).items);
    } catch (e) {
      this.acks.set([]);
      this.overlays.toast(problemText(e), { tone: 'bad' });
    }
  }

  protected async remind(a: ClassAnnouncement) {
    this.busy.set(true);
    try {
      const out = await this.api.remindAnnouncement(a.id);
      this.overlays.toast(tr('ui.web.tch.an.reminded'), {
        sub: tr('ui.web.tch.an.remindedSub', { n: out.reminded }),
      });
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
    } finally {
      this.busy.set(false);
    }
  }

  protected dispatchLabel(s: string) {
    return tr(`status.announcement.${s.toLowerCase()}`);
  }
  protected tone(s: string) {
    return s === 'COMPLETED' ? 'ok' : s === 'FAILED' ? 'bad' : 'info';
  }
  protected dateTime(v: string) {
    return formatDateTime(v);
  }
}
