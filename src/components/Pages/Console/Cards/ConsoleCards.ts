import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDate, titleCase } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { MembersApi, type MemberKind, type MemberRow } from '../Members/members.api';
import { ReadersApi } from '../Readers/readers.api';
import { CardDrawer } from './CardDrawer';
import { CardIssue } from './CardIssue';
import { CardReissue } from './CardReissue';
import {
  CARD_STATUS,
  MEMBER_STATUS,
  type Holder,
  detailOf,
  eligible,
  faceLine,
  firstName,
  holdersOf,
  maskToken,
  plural,
} from './card-format';
import { CardsApi, type Card, type CardReissued } from './cards.api';

type View = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'NONE';
type Who = '' | 'STUDENTS' | 'STAFF';
type SortKey = 'name' | 'token' | 'status' | 'issued' | 're' | 'ms' | 'type';
const PAGE = 12;
/** The most members of a kind the register reads to name the card holders (200 a page). */
const MEMBER_PAGES = 25;

/** A row: a card holder, or (the "without a card" view) an eligible member. */
interface Row {
  readonly id: string;
  readonly name: string;
  readonly member: MemberRow | undefined;
  readonly holder: Holder | null;
}

/**
 * c.cards — NFC cards (SRS 21.2, FR-ATT-01; ATT-004…007; prototype c.cards): the key figures, the
 * card register by member (the active card, else the latest; replaced cards stay on record), the
 * members without a card, the card drawer, block and reactivate with a reason (ATT-006), re-issue
 * (ATT-007) and the issue drawer — cards are written on the card-issue reader (ATT-004).
 */
@Component({
  selector: 'rp-console-cards',
  imports: [Avatar, CardDrawer, CardIssue, CardReissue, Empty, Icon, Kpi, PageHead, Pager],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="NFC cards"
        sub="Issue, block, reactivate and re-issue member cards. Cards are written and verified on the card-issue reader."
      >
        @if (canView()) {
          <button
            type="button"
            class="btn btn-sec"
            id="cards-export"
            [disabled]="!holders().length"
            (click)="exportList()"
          >
            <rp-icon name="download" [size]="17" /><span>Export</span>
          </button>
          @if (why()) {
            <span class="cp-why" [attr.title]="why()"
              ><button type="button" class="btn btn-pri" disabled>
                <rp-icon name="plus" [size]="17" /><span>Issue a card</span>
              </button></span
            >
          } @else {
            <button type="button" class="btn btn-pri" id="cards-issue" (click)="issue(null)">
              <rp-icon name="plus" [size]="17" /><span>Issue a card</span>
            </button>
          }
        }
      </rp-page-head>

      @if (!canView()) {
        <rp-empty
          icon="lock"
          title="This page isn't part of your role"
          text="NFC cards are managed by the institution administrator. Pages your role can open are listed in the menu."
        />
      } @else {
        <div class="c-grid k4">
          <rp-kpi label="Active cards" icon="nfc" [value]="fig(counts().active)" />
          <rp-kpi
            [label]="inactiveLabel"
            icon="shieldx"
            tone="bad"
            [value]="fig(counts().inactive)"
          />
          <rp-kpi
            label="Re-issued at least once"
            icon="refresh"
            tone="info"
            [value]="fig(counts().reissued)"
          />
          <rp-kpi
            label="Without a card"
            icon="card"
            tone="accent"
            [value]="membersKnown() ? fig(counts().without) : '—'"
            delta="Active students, teachers and staff"
          />
        </div>

        <div class="c-filters">
          <label class="search"
            ><rp-icon name="search" [size]="16" /><input
              type="search"
              id="cards-q"
              placeholder="Search member, admission no. or token"
              aria-label="Search cards"
              autocomplete="off"
              [value]="q()"
              (input)="q.set(val($event)); page.set(1)"
          /></label>
          <div class="pills" role="group" aria-label="Cards">
            @for (p of viewPills(); track p.v) {
              <button
                type="button"
                class="pill"
                [class.on]="view() === p.v"
                [attr.aria-pressed]="view() === p.v"
                (click)="setView(p.v)"
              >
                {{ p.l }}<span class="n">{{ p.n }}</span>
              </button>
            }
          </div>
          <div class="pills" role="group" aria-label="Members">
            @for (p of whoPills; track p.v) {
              <button
                type="button"
                class="pill"
                [class.on]="who() === p.v"
                [attr.aria-pressed]="who() === p.v"
                (click)="who.set(p.v); page.set(1)"
              >
                {{ p.l }}
              </button>
            }
          </div>
        </div>

        @if (why() && readOnly()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow"><b>Read-only.</b> {{ readOnly() }}</div>
          </div>
        }

        @if (error()) {
          <div class="card pad">
            <rp-empty icon="alertc" title="Couldn't load the cards" [text]="error()">
              <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                <span>Try again</span>
              </button>
            </rp-empty>
          </div>
        } @else {
          <div class="tbl-wrap">
            <table class="tbl" id="cards-table">
              <thead>
                <tr>
                  @for (c of columns(); track c.k) {
                    <th
                      [class.sort]="c.sort"
                      [class.r]="c.r"
                      [class.asc]="c.sort && sort().k === c.k && sort().dir === 'asc'"
                      [class.desc]="c.sort && sort().k === c.k && sort().dir === 'desc'"
                      [attr.aria-sort]="ariaSort(c)"
                      (click)="c.sort && sortBy(c.k)"
                    >
                      @if (c.sort) {
                        <button
                          type="button"
                          class="cp-th"
                          (click)="$event.stopPropagation(); sortBy(c.k)"
                        >
                          {{ c.l
                          }}<span class="sa" aria-hidden="true">{{
                            sort().k === c.k && sort().dir === 'desc' ? '↓' : '↑'
                          }}</span>
                        </button>
                      } @else {
                        {{ c.l }}
                      }
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @if (loading() && !cards().length) {
                  <tr>
                    <td [attr.colspan]="columns().length">
                      <rp-empty icon="hourglass" title="Loading…" />
                    </td>
                  </tr>
                }
                @for (r of shown(); track r.id) {
                  <tr tabindex="0" (click)="openRow(r)" (keydown.enter)="openRow(r)">
                    <td>
                      <div class="cell-main">
                        <rp-av [name]="r.name" size="sm" />
                        <div style="min-width: 0">
                          <div class="cell-t">{{ r.name }}</div>
                          <div class="cell-s">{{ detail(r) }}</div>
                        </div>
                      </div>
                    </td>
                    @if (view() === 'NONE') {
                      <td>{{ r.member?.userType?.name ?? '—' }}</td>
                      <td>
                        @if (r.holder; as h) {
                          <span [class]="'chip dot tone-' + cardStatus(h).tone">{{
                            cardStatus(h).l()
                          }}</span>
                          <span class="t-mono t-xs"> {{ token(h) }}</span>
                        } @else {
                          <span class="t-faint">No card</span>
                        }
                      </td>
                    } @else {
                      <td>
                        <span class="t-mono">{{ token(r.holder!) }}</span>
                      </td>
                      <td>
                        <span [class]="'chip dot tone-' + cardStatus(r.holder!).tone">{{
                          cardStatus(r.holder!).l()
                        }}</span>
                        @if (reissuing(r.holder!)) {
                          <span class="t-xs t-muted" title="A new card is being written"
                            >re-issue</span
                          >
                        }
                      </td>
                      <td>{{ date(r.holder!.current.issuedAt) }}</td>
                      <td class="r">{{ r.holder!.current.reissueCount }}</td>
                      <td>
                        @if (r.member; as m) {
                          <span [class]="'chip dot tone-' + memberStatus(m).tone">{{
                            memberStatus(m).l
                          }}</span>
                        } @else {
                          <span class="t-faint">—</span>
                        }
                      </td>
                    }
                    <td>
                      @if (!why()) {
                        <div class="row-acts">
                          @if (!r.holder) {
                            <button
                              type="button"
                              class="btn btn-soft btn-xs"
                              (click)="$event.stopPropagation(); issue(r.id)"
                              (keydown.enter)="$event.stopPropagation()"
                            >
                              <rp-icon name="plus" [size]="15" /><span>Issue</span>
                            </button>
                          } @else if (r.holder.current.status === 'ACTIVE') {
                            <button
                              type="button"
                              class="btn btn-ghost btn-xs"
                              (click)="$event.stopPropagation(); block(r.holder)"
                              (keydown.enter)="$event.stopPropagation()"
                            >
                              <span>Block</span>
                            </button>
                            <button
                              type="button"
                              class="btn btn-ghost btn-xs"
                              (click)="$event.stopPropagation(); reissueOf.set(r.holder)"
                              (keydown.enter)="$event.stopPropagation()"
                            >
                              <span>Re-issue</span>
                            </button>
                          } @else {
                            <button
                              type="button"
                              class="btn btn-soft btn-xs"
                              (click)="$event.stopPropagation(); reactivate(r.holder)"
                              (keydown.enter)="$event.stopPropagation()"
                            >
                              <span>Reactivate</span>
                            </button>
                            <button
                              type="button"
                              class="btn btn-ghost btn-xs"
                              (click)="$event.stopPropagation(); reissueOf.set(r.holder)"
                              (keydown.enter)="$event.stopPropagation()"
                            >
                              <span>Re-issue</span>
                            </button>
                          }
                        </div>
                      }
                    </td>
                  </tr>
                } @empty {
                  @if (!loading()) {
                    <tr>
                      <td [attr.colspan]="columns().length">
                        <rp-empty
                          icon="card"
                          [title]="
                            view() === 'NONE' ? 'Every active member has a card' : 'No cards match'
                          "
                          text="Try a different search or view."
                        />
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
          @if (rows().length > pageSize) {
            <rp-pager
              [total]="rows().length"
              [page]="page()"
              [size]="pageSize"
              (go)="page.set($event)"
            />
          } @else if (rows().length) {
            <div class="pager">
              <span>{{ plural(rows().length, view() === 'NONE' ? 'member' : 'card') }}</span>
            </div>
          }
        }
        <p class="t-xs t-muted">
          <rp-icon name="info" [size]="12" /> A member holds one active card. Re-issuing needs a
          reason, adds one to the re-issue count and keeps the previous token on record (FR-ATT-01).
        </p>
      }
    </div>

    @if (openHolder(); as h) {
      <rp-card-drawer
        [holder]="h"
        [member]="memberOf(h.memberId)"
        [line]="faceLineOf(h.memberId)"
        [why]="why()"
        (closed)="openId.set(null)"
        (block)="block($event)"
        (reactivate)="reactivate($event)"
        (reissue)="reissueOf.set($event)"
      />
    }
    @if (issuing()) {
      <rp-card-issue
        [members]="members()"
        [holders]="holderMap()"
        [memberId]="issueFor()"
        [writers]="writers()"
        [noWriter]="noWriter()"
        [short]="short()"
        [why]="why()"
        (closed)="issuing.set(false)"
        (reissue)="issuing.set(false); reissueOf.set($event)"
        (reactivate)="issuing.set(false); reactivate($event)"
        (issued)="issued($event)"
      />
    }
    @if (reissueOf(); as h) {
      <rp-card-reissue
        [holder]="h"
        [writers]="writers()"
        (closed)="reissueOf.set(null)"
        (reissued)="reissued($event)"
      />
    }
  `,
  styles: `
    .cp-th {
      font: inherit;
      color: inherit;
      text-transform: inherit;
      letter-spacing: inherit;
      background: none;
      border: 0;
      padding: 0;
      cursor: pointer;
    }
    .cp-th:focus-visible {
      outline: 2px solid var(--brand-3);
      outline-offset: 2px;
      border-radius: 4px;
    }
  `,
})
export class ConsoleCards {
  private readonly api = inject(CardsApi);
  private readonly membersApi = inject(MembersApi);
  private readonly readers = inject(ReadersApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  protected readonly pageSize = PAGE;
  protected readonly plural = plural;
  protected readonly inactiveLabel = translate('status.card.inactive');
  protected readonly whoPills: readonly { v: Who; l: string }[] = [
    { v: '', l: 'Everyone' },
    { v: 'STUDENTS', l: 'Students' },
    { v: 'STAFF', l: 'Staff' },
  ];

  protected readonly q = signal('');
  protected readonly view = signal<View>('ALL');
  protected readonly who = signal<Who>('');
  protected readonly page = signal(1);
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' }>({ k: 'name', dir: 'asc' });
  protected readonly cards = signal<readonly Card[]>([]);
  protected readonly members = signal<readonly MemberRow[]>([]);
  protected readonly membersKnown = signal(false);
  /** The card-issue readers' names; null when they can't be listed (no readers.view). */
  private readonly writerNames = signal<readonly string[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly openId = signal<string | null>(null);
  protected readonly issuing = signal(false);
  protected readonly issueFor = signal<string | null>(null);
  protected readonly reissueOf = signal<Holder | null>(null);

  protected readonly canView = computed(
    () => this.session()?.subTasks.includes('cards.view') ?? false,
  );
  protected readonly readOnly = computed(() =>
    this.session()?.roles.some((r) => r.readOnly)
      ? 'Management has read-only access. The administrator makes changes here.'
      : '',
  );
  protected readonly why = computed(
    () =>
      this.readOnly() ||
      (this.session()?.subTasks.includes('cards.edit')
        ? ''
        : "Your role doesn't include this task."),
  );
  protected readonly short = computed(() => this.session()?.institution.shortName ?? '');
  protected readonly writers = computed(() => (this.writerNames() ?? []).join(', '));
  protected readonly noWriter = computed(() => this.writerNames()?.length === 0);

  protected readonly holders = computed(() => holdersOf(this.cards()));
  protected readonly holderMap = computed(
    () => new Map(this.holders().map((h) => [h.memberId, h] as const)),
  );
  private readonly memberMap = computed(
    () => new Map(this.members().map((m) => [m.id, m] as const)),
  );
  /** Eligible members without an active card (prototype "Without a card"). */
  private readonly without = computed(() =>
    this.members().filter(
      (m) => eligible(m) && this.holderMap().get(m.id)?.current.status !== 'ACTIVE',
    ),
  );
  protected readonly counts = computed(() => {
    const h = this.holders();
    return {
      active: h.filter((x) => x.current.status === 'ACTIVE').length,
      inactive: h.filter((x) => x.current.status !== 'ACTIVE').length,
      reissued: h.filter((x) => x.current.reissueCount > 0).length,
      without: this.without().length,
      all: h.length,
    };
  });
  protected readonly viewPills = computed(() => {
    const c = this.counts();
    return [
      { v: 'ALL' as const, l: 'All cards', n: c.all },
      { v: 'ACTIVE' as const, l: CARD_STATUS.ACTIVE.l(), n: c.active },
      { v: 'INACTIVE' as const, l: CARD_STATUS.INACTIVE.l(), n: c.inactive },
      ...(this.membersKnown() ? [{ v: 'NONE' as const, l: 'Without a card', n: c.without }] : []),
    ];
  });
  protected readonly columns = computed(() =>
    this.view() === 'NONE'
      ? [
          { k: 'name' as SortKey, l: 'Member', r: false, sort: true },
          { k: 'type' as SortKey, l: 'User type', r: false, sort: true },
          { k: 'cs' as const, l: 'Card', r: false, sort: false },
          { k: 'a' as const, l: '', r: false, sort: false },
        ]
      : [
          { k: 'name' as SortKey, l: 'Member', r: false, sort: true },
          { k: 'token' as SortKey, l: 'Card token', r: false, sort: true },
          { k: 'status' as SortKey, l: 'Card status', r: false, sort: true },
          { k: 'issued' as SortKey, l: 'Issued', r: false, sort: true },
          { k: 're' as SortKey, l: 'Re-issues', r: true, sort: true },
          { k: 'ms' as SortKey, l: 'Member status', r: false, sort: true },
          { k: 'a' as const, l: '', r: false, sort: false },
        ],
  );
  protected readonly rows = computed<Row[]>(() => {
    const v = this.view();
    const mm = this.memberMap();
    let list: Row[] =
      v === 'NONE'
        ? this.without().map((m) => ({
            id: m.id,
            name: titleCase(m.name),
            member: m,
            holder: this.holderMap().get(m.id) ?? null,
          }))
        : this.holders()
            .filter(
              (h) =>
                v === 'ALL' ||
                (v === 'ACTIVE' ? h.current.status === 'ACTIVE' : h.current.status !== 'ACTIVE'),
            )
            .map((h) => ({ id: h.memberId, name: h.name, member: mm.get(h.memberId), holder: h }));
    const w = this.who();
    if (w) list = list.filter((r) => r.member?.kind === w);
    const q = this.q().trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.member?.admissionNo ?? '').toLowerCase().includes(q) ||
          (r.member?.employeeNo ?? '').toLowerCase().includes(q) ||
          (!!r.holder && r.holder.current.token.toLowerCase().endsWith(q.replace(/^•+/, ''))),
      );
    }
    const s = this.sort();
    const get = (r: Row): string | number => {
      const c = r.holder?.current;
      switch (s.k) {
        case 'token':
          return c ? c.token.slice(-4) : '';
        case 'status':
          return c?.status ?? '';
        case 'issued':
          return c ? new Date(c.issuedAt).getTime() : 0;
        case 're':
          return c?.reissueCount ?? 0;
        case 'ms':
          return r.member?.status ?? '';
        case 'type':
          return r.member?.userType.name ?? '';
        default:
          return r.name;
      }
    };
    return [...list].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const c =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'en', { numeric: true });
      return s.dir === 'desc' ? -c : c;
    });
  });
  protected readonly shown = computed(() =>
    this.rows().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly openHolder = computed(() => {
    const id = this.openId();
    return id ? (this.holderMap().get(id) ?? null) : null;
  });

  constructor() {
    void this.load();
    void this.lookups();
  }

  protected async load() {
    if (!this.canView()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      this.cards.set(await this.api.all());
      this.error.set('');
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Students and staff (class, user type, member status) and the card-issue readers. */
  private async lookups() {
    if (!this.canView()) return;
    if (this.can('members.view')) {
      try {
        const kinds: MemberKind[] = ['STUDENTS', 'STAFF'];
        const lists = await Promise.all(kinds.map((k) => this.allMembers(k)));
        this.members.set(lists.flat());
        this.membersKnown.set(true);
      } catch {
        // Names come from the cards; class, type and the "without a card" view stay hidden.
      }
    }
    if (this.can('readers.view')) {
      try {
        const r = await this.readers.list({ purpose: 'CARD_ISSUE', status: 'ACTIVE' });
        this.writerNames.set(r.items.map((t) => t.name));
      } catch {
        // Unknown: the steps then don't name the reader.
      }
    }
  }

  private async allMembers(kind: MemberKind) {
    const out: MemberRow[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < MEMBER_PAGES; i++) {
      const page = await this.membersApi.list({ kind, limit: 200, cursor });
      out.push(...page.items);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return out;
  }

  // --- actions ---------------------------------------------------------------------------------------
  protected openRow(r: Row) {
    if (r.holder && this.view() !== 'NONE') this.openId.set(r.id);
    else if (!this.why()) this.issue(r.id);
    else if (r.holder) this.openId.set(r.id);
  }

  protected issue(memberId: string | null) {
    if (this.why()) return;
    this.issueFor.set(memberId);
    this.issuing.set(true);
  }

  protected async block(h: Holder) {
    if (this.why()) return;
    const tok = maskToken(h.current.token);
    const r = await this.overlays.confirm({
      title: `Block ${firstName(h.name)}'s card?`,
      text: `Card ${tok} is refused at gates, readers and counters until it's reactivated. The wallet isn't affected.`,
      ok: 'Block card',
      tone: 'warn',
      icon: 'shieldx',
      reason: {
        label: 'Reason',
        placeholder: 'e.g. Reported lost at the bus stop',
        min: 3,
        max: 300,
      },
    });
    if (!r) return;
    if (await this.setStatus(h, 'BLOCK', r.reason ?? '')) {
      this.overlays.toast('Card blocked', { sub: `${h.name} · ${tok}` });
    }
  }

  protected async reactivate(h: Holder) {
    if (this.why()) return;
    const m = this.memberOf(h.memberId);
    if (m && m.status !== 'ACTIVE') {
      this.overlays.toast('Activate the member first', {
        sub: `${h.name} is ${m.status.toLowerCase()}, so the card stays inactive.`,
        tone: 'warn',
      });
      return;
    }
    const r = await this.overlays.confirm({
      title: `Reactivate ${firstName(h.name)}'s card?`,
      text: `Card ${maskToken(h.current.token)} works again at gates, readers and counters.`,
      ok: 'Reactivate card',
      icon: 'check',
      reason: {
        label: 'Reason',
        placeholder: 'e.g. Found and handed back to the office',
        min: 3,
        max: 300,
      },
    });
    if (!r) return;
    if (await this.setStatus(h, 'REACTIVATE', r.reason ?? '')) {
      this.overlays.toast('Card reactivated', { sub: h.name });
    }
  }

  private async setStatus(h: Holder, action: 'BLOCK' | 'REACTIVATE', reason: string) {
    try {
      const c = await this.api.status(h.current.id, { action, reason });
      this.cards.update((list) => list.map((x) => (x.id === c.id ? c : x)));
      return true;
    } catch (e) {
      this.overlays.toast(action === 'BLOCK' ? "Couldn't block the card" : "Couldn't reactivate", {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
      return false;
    } finally {
      void this.load();
    }
  }

  protected reissued(r: { holder: Holder; code: CardReissued }) {
    const mins = Math.max(
      1,
      Math.round((new Date(r.code.pairingForWrite.expiresAt).getTime() - Date.now()) / 60_000),
    );
    this.openId.set(null);
    this.overlays.toast('New card authorised', {
      sub: `${r.holder.name} · write it within ${mins} minutes`,
    });
    void this.load();
  }

  protected issued(r: { name: string; card: Card }) {
    this.issuing.set(false);
    this.overlays.toast('Card issued', { sub: `${r.name} · ${maskToken(r.card.token)} verified` });
    void this.load();
  }

  // --- export ----------------------------------------------------------------------------------------
  /** The register as a CSV (prototype "Export · NFC card register"). */
  protected exportList() {
    const q = (v: string) =>
      /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : /^[=+\-@]/.test(v) ? `'${v}` : v;
    const head = [
      'Member',
      'Admission / employee no.',
      'Class or user type',
      'Card token',
      'Card status',
      'Issued',
      'Re-issues',
      'Member status',
    ];
    const rows = this.holders().map((h) => {
      const m = this.memberOf(h.memberId);
      return [
        h.name,
        m?.admissionNo ?? m?.employeeNo ?? '',
        m ? detailOf(m) : '',
        maskToken(h.current.token),
        CARD_STATUS[h.current.status].l(),
        formatDate(h.current.issuedAt),
        String(h.current.reissueCount),
        m ? (MEMBER_STATUS[m.status]?.l ?? m.status) : '',
      ];
    });
    const lines = [head, ...rows].map((r) => r.map(q).join(','));
    const blob = new Blob([String.fromCharCode(0xfeff) + lines.join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nfc-card-register.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    this.overlays.toast('NFC card register exported', {
      sub: `${plural(rows.length, 'row')} · CSV`,
    });
  }

  // --- table -----------------------------------------------------------------------------------------
  protected setView(v: View) {
    this.view.set(v);
    this.page.set(1);
    if (v === 'NONE' && ['token', 'status', 'issued', 're', 'ms'].includes(this.sort().k)) {
      this.sort.set({ k: 'name', dir: 'asc' });
    }
  }
  protected sortBy(k: SortKey | 'cs' | 'a') {
    if (k === 'cs' || k === 'a') return;
    const s = this.sort();
    this.sort.set({ k, dir: s.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
    this.page.set(1);
  }
  protected ariaSort(c: { k: string; sort: boolean }) {
    if (!c.sort) return null;
    const s = this.sort();
    return s.k === c.k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  // --- formatting ------------------------------------------------------------------------------------
  protected can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }
  protected memberOf(id: string) {
    return this.memberMap().get(id);
  }
  protected faceLineOf(id: string) {
    return [this.short(), faceLine(this.memberOf(id))].filter(Boolean).join(' · ');
  }
  protected detail(r: Row) {
    return r.member ? detailOf(r.member) : '—';
  }
  protected token(h: Holder) {
    return maskToken(h.current.token);
  }
  protected cardStatus(h: Holder) {
    return CARD_STATUS[h.current.status];
  }
  protected memberStatus(m: MemberRow) {
    return MEMBER_STATUS[m.status] ?? { l: m.status, tone: 'neutral' };
  }
  /** A card made inactive by a re-issue: the new card is still to be written. */
  protected reissuing(h: Holder) {
    return h.current.status !== 'ACTIVE' && /^Re-issue/i.test(h.current.statusReason ?? '');
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected fig(n: number) {
    return this.loading() && !this.cards().length ? '—' : n.toLocaleString('en-IN');
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
}
