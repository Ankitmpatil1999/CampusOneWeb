import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { num, problemText } from '../../Console/Structure/academic-format';
import {
  LanguagesApi,
  type Language,
  type LanguageList,
  type TranslationPage,
  type TranslationRow,
} from './languages.api';

type Tab = 'langs' | 'tr' | 'miss';
type TrFilter = 'all' | 'missing';
const TEXT_MAX = 2000;

/**
 * o.languages — Languages (FR-PLT-01, NFR-40, OI-FIN-28; IDN-070…074; prototype o.languages): the
 * languages members can choose with their coverage, switching one on or off, the default (the
 * fallback) and adding one; every label by screen with its translation and an editor that keeps the
 * placeholders; and what is still missing in each language.
 */
@Component({
  selector: 'rp-backoffice-languages',
  imports: [Empty, Icon, Modal, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Languages"
        sub="Languages members can choose, the translation of every label by screen, and what shows when a translation is missing."
      >
        @if (canEdit()) {
          <button type="button" class="btn btn-pri" id="lg-add" (click)="openAdd()">
            <rp-icon name="plus" [size]="17" /><span>Add language</span>
          </button>
        }
      </rp-page-head>

      @if (!canEdit()) {
        <rp-empty
          icon="lock"
          title="This page isn't part of your role"
          text="Languages and translations are managed by the platform administrator. Pages your role can open are listed in the menu."
        />
      } @else if (loading() && !list()) {
        <div class="stack g16" aria-busy="true" aria-label="Loading">
          <div class="sk" style="height: 44px; border-radius: 12px"></div>
          <div class="sk" style="height: 360px; border-radius: 16px"></div>
        </div>
      } @else if (error() && !list()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the languages" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="load()">
              <span>Try again</span>
            </button>
          </rp-empty>
        </div>
      } @else if (list(); as l) {
        <div class="tabs" role="tablist" aria-label="Languages">
          <button
            type="button"
            class="tab"
            role="tab"
            id="lg-tab-langs"
            [class.on]="tab() === 'langs'"
            [attr.aria-selected]="tab() === 'langs'"
            (click)="tab.set('langs')"
          >
            Languages<span class="n">{{ l.items.length }}</span>
          </button>
          <button
            type="button"
            class="tab"
            role="tab"
            id="lg-tab-tr"
            [class.on]="tab() === 'tr'"
            [attr.aria-selected]="tab() === 'tr'"
            (click)="showTranslations()"
          >
            Translations<span class="n">{{ num(l.keys) }}</span>
          </button>
          <button
            type="button"
            class="tab"
            role="tab"
            id="lg-tab-miss"
            [class.on]="tab() === 'miss'"
            [attr.aria-selected]="tab() === 'miss'"
            (click)="tab.set('miss')"
          >
            Missing translations<span class="n">{{ num(missingTotal()) }}</span>
          </button>
        </div>

        @switch (tab()) {
          @case ('langs') {
            <div class="tbl-wrap">
              <table class="tbl" id="lg-langs">
                <thead>
                  <tr>
                    <th>Language</th>
                    <th>Translated</th>
                    <th>Default</th>
                    <th>Available to members</th>
                  </tr>
                </thead>
                <tbody>
                  @for (g of l.items; track g.code) {
                    <tr>
                      <td>
                        <div class="stack" style="gap: 1px">
                          <span class="cell-t"
                            >{{ g.name }} <span class="t-muted">· {{ g.nativeName }}</span></span
                          >
                          <span class="cell-s"
                            >code <span class="t-mono">{{ g.code }}</span></span
                          >
                        </div>
                      </td>
                      <td>
                        <div class="stack g4" style="min-width: 140px">
                          <span class="t-xs t-muted t-num"
                            >{{ cover(g) }}% · {{ num(done(g)) }} of {{ num(l.keys) }} keys
                            @if (g.translations.machine) {
                              · {{ num(g.translations.machine) }} machine
                            }
                          </span>
                          <div class="bar" [class]="'bar ' + coverTone(g)">
                            <i [style.width.%]="cover(g)"></i>
                          </div>
                        </div>
                      </td>
                      <td>
                        @if (g.isDefault) {
                          <span class="chip tone-brand">Default · fallback</span>
                        } @else {
                          <span
                            class="cp-why"
                            [attr.title]="g.enabled ? null : 'Switch it on first'"
                            ><button
                              type="button"
                              class="btn btn-ghost btn-xs"
                              [class.is-busy]="busy() === g.code + ':def'"
                              [disabled]="!g.enabled || !!busy()"
                              (click)="makeDefault(g)"
                            >
                              <span>Make default</span>
                            </button></span
                          >
                        }
                      </td>
                      <td>
                        <div class="row g8">
                          <button
                            type="button"
                            class="toggle"
                            role="switch"
                            [attr.aria-checked]="g.enabled"
                            [attr.aria-label]="'Enable ' + g.name"
                            [attr.title]="g.isDefault ? translate('I18N.DEFAULT_ENABLED') : null"
                            [disabled]="g.isDefault || !!busy()"
                            (click)="toggle(g)"
                          ></button>
                          <span class="t-sm" [class.t-muted]="!g.enabled">{{
                            g.enabled ? 'Enabled' : 'Disabled'
                          }}</span>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="note tone-info">
              <rp-icon name="info" [size]="17" />
              <div class="grow">
                A language that's switched off isn't offered to members. A label that isn't
                translated shows in the default language — never as a raw key.
              </div>
            </div>
          }
          @case ('tr') {
            <div class="c-filters">
              <div class="fld">
                <div class="fld-in">
                  <select
                    id="lg-tl"
                    aria-label="Language"
                    (change)="setLang($any($event.target).value)"
                  >
                    @for (g of others(); track g.code) {
                      <option [value]="g.code" [selected]="lang() === g.code">
                        {{ g.name }} · {{ g.nativeName }}{{ g.enabled ? '' : ' (disabled)' }}
                      </option>
                    }
                  </select>
                </div>
              </div>
              <label class="search">
                <rp-icon name="search" [size]="16" />
                <input
                  type="search"
                  id="lg-tq"
                  placeholder="Key or text"
                  aria-label="Key or text"
                  autocomplete="off"
                  [value]="q()"
                  (input)="q.set($any($event.target).value)"
                  (keydown.enter)="loadTr()"
                />
              </label>
              <div class="pills" role="group" aria-label="Show">
                <button
                  type="button"
                  class="pill"
                  [class.on]="filter() === 'all'"
                  [attr.aria-pressed]="filter() === 'all'"
                  (click)="setFilter('all')"
                >
                  All
                </button>
                <button
                  type="button"
                  class="pill"
                  [class.on]="filter() === 'missing'"
                  [attr.aria-pressed]="filter() === 'missing'"
                  (click)="setFilter('missing')"
                >
                  Missing<span class="n">{{ num(missingOf(lang())) }}</span>
                </button>
              </div>
              <div class="fld">
                <div class="fld-in">
                  <select
                    id="lg-scr"
                    aria-label="Screen"
                    (change)="setScreen($any($event.target).value)"
                  >
                    <option value="" [selected]="!screen()">Every screen</option>
                    @for (s of screens(); track s) {
                      <option [value]="s" [selected]="screen() === s">{{ s }}</option>
                    }
                  </select>
                </div>
              </div>
            </div>
            @if (trError()) {
              <div class="note tone-bad" role="alert">
                <rp-icon name="alertc" [size]="17" />
                <div class="grow">{{ trError() }}</div>
              </div>
            }
            @if (trLoading() && !tr()) {
              <div class="sk" style="height: 360px; border-radius: 16px" aria-busy="true"></div>
            } @else if (tr(); as t) {
              <div class="tbl-wrap">
                <table class="tbl" id="lg-tr">
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>English (default)</th>
                      <th>{{ langName(lang()) }}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of rows(); track r.key) {
                      <tr tabindex="0" (click)="edit(r)" (keydown.enter)="edit(r)">
                        <td>
                          <div class="stack" style="gap: 1px">
                            <span class="cell-t"
                              ><span class="t-mono t-sm">{{ r.key }}</span></span
                            >
                            <span class="cell-s">{{ r.screen }}</span>
                          </div>
                        </td>
                        <td>
                          <span class="t-sm">{{ r.en }}</span>
                        </td>
                        <td>
                          @if (r.texts[lang()]; as x) {
                            <span class="t-sm" [attr.lang]="lang()">{{ x.text }}</span>
                            @if (x.source === 'MACHINE') {
                              <span class="tag" style="margin-left: 6px">Machine</span>
                            }
                          } @else {
                            <span class="t-sm t-warn">Missing — shows in English</span>
                          }
                        </td>
                        <td>
                          <div class="row-acts">
                            <button
                              type="button"
                              class="btn btn-soft btn-xs"
                              (click)="$event.stopPropagation(); edit(r)"
                            >
                              <span>Edit</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    } @empty {
                      <tr>
                        <td colspan="4">
                          <rp-empty
                            icon="lang"
                            title="No labels match"
                            text="Try another word or screen."
                          />
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="row between">
                <span class="t-xs t-muted"
                  >{{ num(rows().length) }} of {{ num(t.total) }} labels</span
                >
                @if (trNext()) {
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm"
                    [class.is-busy]="trLoading()"
                    [disabled]="trLoading()"
                    (click)="moreTr()"
                  >
                    <span>Show more</span>
                  </button>
                }
              </div>
            }
          }
          @case ('miss') {
            <div class="tbl-wrap">
              <table class="tbl" id="lg-miss">
                <thead>
                  <tr>
                    <th>Language</th>
                    <th class="r">Keys</th>
                    <th class="r">Reviewed</th>
                    <th class="r">Machine</th>
                    <th class="r">Missing</th>
                  </tr>
                </thead>
                <tbody>
                  @for (g of others(); track g.code) {
                    <tr>
                      <td>
                        <b class="t-sb">{{ g.name }}</b>
                        @if (!g.enabled) {
                          <span class="t-muted"> (off)</span>
                        }
                      </td>
                      <td class="r t-num">{{ num(l.keys) }}</td>
                      <td class="r t-num">{{ num(g.translations.reviewed) }}</td>
                      <td class="r t-num">{{ num(g.translations.machine) }}</td>
                      <td class="r">
                        @if (g.translations.missing) {
                          <button
                            type="button"
                            class="linkbtn"
                            [class.t-bad]="g.enabled"
                            (click)="showMissing(g.code)"
                          >
                            {{ num(g.translations.missing) }} missing
                          </button>
                        } @else {
                          <rp-icon name="check" [size]="15" class="t-ok" />
                        }
                      </td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td class="r t-num">{{ num(l.keys) }}</td>
                    <td class="r t-num">{{ num(sum('reviewed')) }}</td>
                    <td class="r t-num">{{ num(sum('machine')) }}</td>
                    <td class="r t-num">{{ num(sum('missing')) }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            @if (worst(); as w) {
              <div class="note tone-warn">
                <rp-icon name="alert" [size]="17" />
                <div class="grow">
                  {{ w.name }} has {{ num(w.translations.missing) }} labels without a translation.
                  Until they're translated, a {{ w.name }}-speaking member sees the
                  {{ defaultName() }} labels — the fallback — and never raw key text.
                </div>
              </div>
            }
          }
        }
      }
    </div>

    @if (editing(); as r) {
      <rp-modal
        [title]="langName(lang()) + ' · ' + r.key"
        [sub]="'Screen: ' + r.screen"
        icon="lang"
        [narrow]="false"
        [dismiss]="!saving()"
        (closed)="editing.set(null)"
      >
        <div class="stack g12">
          <div>
            <div class="eyebrow" style="margin-bottom: 6px">English (default)</div>
            <div class="card flat pad t-md">{{ r.en }}</div>
          </div>
          <div class="fld" [class.invalid]="editErr()">
            <label class="fld-l" for="lg-tr-v"
              >{{ langName(lang()) }} ({{ nativeOf(lang()) }})<span class="count"
                >{{ draft().length }}/{{ textMax }}</span
              ></label
            >
            <div class="fld-in">
              <textarea
                id="lg-tr-v"
                rows="3"
                aria-describedby="lg-tr-v-e"
                [attr.lang]="lang()"
                [attr.maxlength]="textMax"
                [value]="draft()"
                (input)="draft.set($any($event.target).value); editErr.set('')"
              ></textarea>
            </div>
            <div class="fld-e" id="lg-tr-v-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ editErr() }}</span>
            </div>
            @if (r.placeholders.length) {
              <div class="fld-h">Keep {{ placeholdersText(r) }} exactly as written.</div>
            } @else {
              <div class="fld-h">Saved as a reviewed translation.</div>
            }
          </div>
        </div>
        <div modal-foot class="row g8">
          <button
            type="button"
            class="btn btn-sec"
            [disabled]="saving()"
            (click)="editing.set(null)"
          >
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            id="lg-tr-save"
            [class.is-busy]="saving()"
            [disabled]="saving()"
            (click)="saveTr(r)"
          >
            <span>Save translation</span>
          </button>
        </div>
      </rp-modal>
    }

    @if (adding()) {
      <rp-modal
        title="Add a language"
        sub="New languages start disabled, so members don't see them until the labels are translated."
        [dismiss]="!saving()"
        (closed)="adding.set(false)"
      >
        <div class="stack g12" id="lg-new">
          @if (addError()) {
            <div class="note tone-bad" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ addError() }}</div>
            </div>
          }
          <div class="fld" [class.invalid]="newErr('code')">
            <label class="fld-l" for="lg-nl-c">Language code<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="lg-nl-c"
                type="text"
                placeholder="e.g. or"
                maxlength="3"
                autocomplete="off"
                aria-describedby="lg-nl-c-e"
                [value]="nl().code"
                (input)="setNew('code', $any($event.target).value)"
              />
            </div>
            <div class="fld-e" id="lg-nl-c-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ newErr('code') }}</span>
            </div>
            <div class="fld-h">2–3 lowercase letters (ISO 639)</div>
          </div>
          <div class="fld" [class.invalid]="newErr('name')">
            <label class="fld-l" for="lg-nl-n">Name in English<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="lg-nl-n"
                type="text"
                placeholder="e.g. Odia"
                maxlength="40"
                autocomplete="off"
                aria-describedby="lg-nl-n-e"
                [value]="nl().name"
                (input)="setNew('name', $any($event.target).value)"
              />
            </div>
            <div class="fld-e" id="lg-nl-n-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ newErr('name') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="newErr('native')">
            <label class="fld-l" for="lg-nl-v"
              >Name in the language<span class="req">*</span></label
            >
            <div class="fld-in">
              <input
                id="lg-nl-v"
                type="text"
                placeholder="e.g. ଓଡ଼ିଆ"
                maxlength="40"
                autocomplete="off"
                aria-describedby="lg-nl-v-e"
                [value]="nl().native"
                (input)="setNew('native', $any($event.target).value)"
              />
            </div>
            <div class="fld-e" id="lg-nl-v-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ newErr('native') }}</span>
            </div>
          </div>
        </div>
        <div modal-foot class="row g8">
          <button
            type="button"
            class="btn btn-sec"
            [disabled]="saving()"
            (click)="adding.set(false)"
          >
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            id="lg-nl-go"
            [class.is-busy]="saving()"
            [disabled]="saving()"
            (click)="add()"
          >
            <span>Add language</span>
          </button>
        </div>
      </rp-modal>
    }
  `,
})
export class BackofficeLanguages implements OnInit {
  private readonly api = inject(LanguagesApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).ops;

  protected readonly num = num;
  protected readonly translate = translate;
  protected readonly textMax = TEXT_MAX;

  protected readonly list = signal<LanguageList | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal('');
  protected readonly tab = signal<Tab>('langs');

  protected readonly lang = signal('');
  protected readonly q = signal('');
  protected readonly filter = signal<TrFilter>('all');
  protected readonly screen = signal('');
  protected readonly tr = signal<TranslationPage | null>(null);
  protected readonly rows = signal<readonly TranslationRow[]>([]);
  protected readonly trNext = signal<string | null>(null);
  protected readonly trLoading = signal(false);
  protected readonly trError = signal('');

  protected readonly editing = signal<TranslationRow | null>(null);
  protected readonly draft = signal('');
  protected readonly editErr = signal('');
  protected readonly saving = signal(false);

  protected readonly adding = signal(false);
  protected readonly nl = signal({ code: '', name: '', native: '' });
  private readonly nlErrors = signal<Partial<Record<'code' | 'name' | 'native', string>>>({});
  protected readonly addError = signal('');

  protected readonly canEdit = computed(
    () => !this.session() || (this.session()?.subTasks.includes('lang.edit') ?? false),
  );
  protected readonly others = computed(() =>
    (this.list()?.items ?? []).filter((l) => !l.isDefault),
  );
  protected readonly screens = computed(() => this.tr()?.screens ?? []);
  protected readonly missingTotal = computed(() =>
    this.others()
      .filter((l) => l.enabled)
      .reduce((s, l) => s + l.translations.missing, 0),
  );
  protected readonly worst = computed(
    () =>
      [...this.others()]
        .filter((l) => l.enabled && l.translations.missing)
        .sort((a, b) => b.translations.missing - a.translations.missing)[0] ?? null,
  );
  protected readonly defaultName = computed(
    () => this.list()?.items.find((l) => l.isDefault)?.name ?? 'English',
  );

  ngOnInit() {
    if (!this.canEdit()) return;
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const l = await this.api.list();
      this.list.set(l);
      if (!this.lang()) this.lang.set(l.items.find((x) => !x.isDefault && x.enabled)?.code ?? '');
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected done(g: Language) {
    return g.isDefault
      ? (this.list()?.keys ?? 0)
      : g.translations.reviewed + g.translations.machine;
  }
  protected cover(g: Language) {
    const k = this.list()?.keys ?? 0;
    return k ? Math.round((this.done(g) * 100) / k) : 0;
  }
  protected coverTone(g: Language) {
    const c = this.cover(g);
    return c >= 100 ? 'ok' : c >= 60 ? 'warn' : 'bad';
  }
  protected missingOf(code: string) {
    return this.list()?.items.find((l) => l.code === code)?.translations.missing ?? 0;
  }
  protected langName(code: string) {
    return this.list()?.items.find((l) => l.code === code)?.name ?? code;
  }
  protected nativeOf(code: string) {
    return this.list()?.items.find((l) => l.code === code)?.nativeName ?? code;
  }
  protected sum(k: 'reviewed' | 'machine' | 'missing') {
    return this.others().reduce((s, l) => s + l.translations[k], 0);
  }

  private replace(g: Language) {
    this.list.update((l) =>
      l
        ? {
            ...l,
            items: l.items.map((x) =>
              x.code === g.code ? g : g.isDefault ? { ...x, isDefault: false } : x,
            ),
          }
        : l,
    );
  }

  /** ob.lang.t: IDN-072 (the default stays switched on, I18N.DEFAULT_ENABLED). */
  protected async toggle(g: Language) {
    if (g.isDefault) return;
    if (g.enabled) {
      const ok = await this.overlays.confirm({
        title: `Switch ${g.name} off?`,
        text: `Members who chose ${g.name} see ${this.defaultName()} until it's switched on again.`,
        ok: 'Switch off',
        tone: 'warn',
        icon: 'lang',
      });
      if (!ok) return;
    }
    this.busy.set(g.code);
    try {
      const r = await this.api.update(g.code, { enabled: !g.enabled }, g.version);
      this.replace({ ...g, ...r });
      this.overlays.toast(`${g.name} ${g.enabled ? 'switched off' : 'switched on'}`, {
        sub: g.enabled ? 'No longer offered to members' : 'Members can choose it now',
      });
    } catch (e) {
      this.overlays.toast(`Couldn't change ${g.name}`, { sub: problemText(e), tone: 'bad' });
    } finally {
      this.busy.set('');
    }
  }

  /** ob.lang.def: the default language is the fallback for every missing label. */
  protected async makeDefault(g: Language) {
    const ok = await this.overlays.confirm({
      title: `Make ${g.name} the default?`,
      text: `Labels missing in a member's language then show in ${g.name}.`,
      ok: 'Make default',
      icon: 'lang',
    });
    if (!ok) return;
    this.busy.set(`${g.code}:def`);
    try {
      const r = await this.api.update(g.code, { isDefault: true }, g.version);
      this.replace({ ...g, ...r, isDefault: true });
      this.overlays.toast(`${g.name} is the default language`);
      // The former default changed too (its version with it).
      void this.load();
    } catch (e) {
      this.overlays.toast(`Couldn't change the default`, { sub: problemText(e), tone: 'bad' });
    } finally {
      this.busy.set('');
    }
  }

  // --- translations ---------------------------------------------------------------------------------
  protected showTranslations() {
    this.tab.set('tr');
    if (!this.tr()) void this.loadTr();
  }
  protected showMissing(code: string) {
    this.lang.set(code);
    this.filter.set('missing');
    this.tab.set('tr');
    void this.loadTr();
  }
  protected setLang(code: string) {
    this.lang.set(code);
    if (this.filter() === 'missing') void this.loadTr();
  }
  protected setFilter(f: TrFilter) {
    this.filter.set(f);
    void this.loadTr();
  }
  protected setScreen(s: string) {
    this.screen.set(s);
    void this.loadTr();
  }

  async loadTr(cursor: string | null = null) {
    this.trLoading.set(true);
    try {
      const r = await this.api.translations({
        screen: this.screen(),
        q: this.q().trim(),
        missingIn: this.filter() === 'missing' ? this.lang() : '',
        cursor,
      });
      this.tr.set(r);
      this.rows.set(cursor ? [...this.rows(), ...r.items] : r.items);
      this.trNext.set(r.nextCursor);
      this.trError.set('');
    } catch (e) {
      this.trError.set(problemText(e));
    } finally {
      this.trLoading.set(false);
    }
  }
  protected moreTr() {
    const c = this.trNext();
    if (c) void this.loadTr(c);
  }

  protected edit(r: TranslationRow) {
    this.draft.set(r.texts[this.lang()]?.text ?? '');
    this.editErr.set('');
    this.editing.set(r);
  }
  protected placeholdersText(r: TranslationRow) {
    return r.placeholders.map((p) => `{${p}}`).join(' ');
  }

  /** ob.tr.save: IDN-074 — the placeholders kept, up to 2,000 characters. */
  protected async saveTr(r: TranslationRow) {
    const v = this.draft().trim();
    const lang = this.lang();
    if (!v || v.length > TEXT_MAX) {
      this.editErr.set(translate('I18N.TEXT_LENGTH'));
      return;
    }
    const used = [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    if (used.join(',') !== [...r.placeholders].sort().join(',')) {
      this.editErr.set(
        translate('I18N.PLACEHOLDERS', {
          lang: this.langName(lang),
          names: this.placeholdersText(r) || '—',
        }),
      );
      return;
    }
    this.saving.set(true);
    try {
      const was = r.texts[lang];
      await this.api.save(r.key, { [lang]: v }, { [lang]: was?.version ?? null });
      const next: TranslationRow = {
        ...r,
        texts: {
          ...r.texts,
          [lang]: {
            text: v,
            source: 'HUMAN',
            reviewedAt: new Date().toISOString(),
            version: (was?.version ?? 0) + 1,
          },
        },
      };
      this.rows.update((l) =>
        this.filter() === 'missing'
          ? l.filter((x) => x.key !== r.key)
          : l.map((x) => (x.key === r.key ? next : x)),
      );
      this.editing.set(null);
      this.overlays.toast('Translation saved', { sub: `${this.langName(lang)} · ${r.key}` });
      void this.load();
    } catch (e) {
      this.editErr.set(
        e instanceof ApiProblem && e.errors.length ? e.errors[0]!.message : problemText(e),
      );
    } finally {
      this.saving.set(false);
    }
  }

  // --- new language ---------------------------------------------------------------------------------
  protected openAdd() {
    this.nl.set({ code: '', name: '', native: '' });
    this.nlErrors.set({});
    this.addError.set('');
    this.adding.set(true);
  }
  protected newErr(k: 'code' | 'name' | 'native') {
    return this.nlErrors()[k] ?? '';
  }
  protected setNew(k: 'code' | 'name' | 'native', v: string) {
    this.nl.update((x) => ({ ...x, [k]: v }));
    this.nlErrors.update((e) => ({ ...e, [k]: '' }));
    this.addError.set('');
  }

  /** ob.lang.add: IDN-071 — the language starts switched off. */
  protected async add() {
    const n = this.nl();
    const code = n.code.trim();
    const e: Partial<Record<'code' | 'name' | 'native', string>> = {};
    if (!/^[a-z]{2,3}$/.test(code)) e.code = translate('I18N.LANGUAGE_CODE');
    else if (this.list()?.items.some((l) => l.code === code))
      e.code = translate('I18N.LANGUAGE_EXISTS');
    if (!n.name.trim()) e.name = translate('I18N.LANGUAGE_CODE');
    if (!n.native.trim()) e.native = translate('I18N.LANGUAGE_CODE');
    this.nlErrors.set(e);
    if (Object.values(e).some((x) => x)) return;
    this.saving.set(true);
    try {
      await this.api.add({ code, name: n.name.trim(), native: n.native.trim() });
      this.adding.set(false);
      this.overlays.toast(`${n.name.trim()} added`, {
        sub: 'Switched off until its labels are translated',
      });
      void this.load();
    } catch (err) {
      if (err instanceof ApiProblem && err.code === 'I18N.LANGUAGE_EXISTS')
        this.nlErrors.set({ code: problemText(err) });
      else this.addError.set(problemText(err));
    } finally {
      this.saving.set(false);
    }
  }
}
