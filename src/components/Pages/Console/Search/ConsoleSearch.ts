import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { titleCase } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { SearchApi, type MemberHit, type SearchResults } from './search.api';

const STATUS: Readonly<Record<MemberHit['status'], { label: string; tone: string }>> = {
  ACTIVE: { label: 'Active', tone: 'ok' },
  INACTIVE: { label: 'Inactive', tone: 'neutral' },
  SUSPENDED: { label: 'Suspended', tone: 'bad' },
};
/** The server returns at most this many members (IDN-059); a full page is shown as "8+". */
const SEARCH_LIMIT = 8;
const TYPE_DELAY_MS = 300;

type SortKey = 'name' | 'number' | 'userType' | 'status';

/**
 * c.search — Search (SRS 5.2, IDN-059; prototype c.search): the top bar's search opens here with
 * `?q=`. Members are found by name, admission or employee number, or mobile and open in the
 * members page. Payment references arrive with the wallet (Phase 3).
 */
@Component({
  selector: 'rp-console-search',
  imports: [Avatar, Empty, Icon, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head title="Search" [sub]="sub()" />
      <div class="c-filters">
        <label class="search cp-bigsearch"
          ><rp-icon name="search" [size]="16" /><input
            type="search"
            id="q"
            placeholder="Name, admission no., mobile, reference or ticket id"
            autocomplete="off"
            aria-label="Search"
            [value]="text()"
            (input)="typed($event)"
            (keydown.enter)="submit()"
        /></label>
      </div>
      @if (query().length < 2) {
        <rp-empty
          icon="search"
          title="Type at least two characters"
          text="Search by a member's name, admission or employee number, mobile, a transaction reference (e.g. PAY…, CRD…) or a ticket id (TKT-…)."
        />
      } @else {
        <div class="note tone-info">
          <rp-icon name="receipt" [size]="17" />
          <div class="grow">
            <b>Payment references arrive with the wallet (Phase 3).</b> Until then, search finds
            members by name, admission or employee number, or mobile.
          </div>
        </div>
        @if (error()) {
          <div class="card pad">
            <rp-empty icon="alertc" title="Couldn't search" [text]="error()">
              <button type="button" class="btn btn-sec btn-sm" (click)="run(query())">
                <span>Try again</span>
              </button>
            </rp-empty>
          </div>
        } @else if (results(); as r) {
          @if (!r.data.members.length) {
            <rp-empty
              icon="search"
              [title]="'Nothing matches “' + r.q + '”'"
              text="Check the spelling, or search by admission number, mobile or a full reference."
            />
          } @else {
            <section class="stack g8">
              <div class="sec-h">
                <h3>Members · {{ r.data.members.length }}{{ full() ? '+' : '' }}</h3>
              </div>
              <div class="tbl-wrap">
                <table class="tbl">
                  <thead>
                    <tr>
                      @for (c of cols; track c.k) {
                        <th
                          [class.sort]="c.sort"
                          [class.asc]="c.sort && sort()?.k === c.k && sort()?.dir === 'asc'"
                          [class.desc]="c.sort && sort()?.k === c.k && sort()?.dir === 'desc'"
                          (click)="c.sort && sortBy(c.k)"
                        >
                          {{ c.l }}
                          @if (c.sort) {
                            <span class="sa">{{
                              sort()?.k === c.k && sort()?.dir === 'desc' ? '↓' : '↑'
                            }}</span>
                          }
                        </th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (m of members(); track m.id) {
                      <tr tabindex="0" (click)="open(m)" (keydown.enter)="open(m)">
                        <td>
                          <div class="cell-main">
                            <rp-av [name]="name(m)" size="sm" />
                            <div>
                              <div class="cell-t">{{ name(m) }}</div>
                              <div class="cell-s">{{ m.memberNo }}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span class="t-mono">{{ m.number ?? '—' }}</span>
                        </td>
                        <td>{{ m.userType }}</td>
                        <td>{{ m.detail }}</td>
                        <td>
                          <span [class]="'chip dot tone-' + status(m).tone">{{
                            status(m).label
                          }}</span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="pager">
                <span
                  >{{ r.data.members.length }} member{{
                    r.data.members.length === 1 ? '' : 's'
                  }}</span
                >
              </div>
            </section>
          }
        } @else if (loading()) {
          <div class="card pad"><rp-empty icon="hourglass" title="Searching…" /></div>
        }
      }
    </div>
  `,
})
export class ConsoleSearch {
  private readonly api = inject(SearchApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly cols: readonly { k: SortKey | 'detail'; l: string; sort: boolean }[] = [
    { k: 'name', l: 'Name', sort: true },
    { k: 'number', l: 'Admission / employee no.', sort: true },
    { k: 'userType', l: 'User type', sort: true },
    { k: 'detail', l: 'Grade / department', sort: false },
    { k: 'status', l: 'Status', sort: true },
  ];

  /** What is in the search box. */
  protected readonly text = signal('');
  /** The search in the address (?q=), trimmed. */
  protected readonly query = signal('');
  /** The last answer and the search it belongs to (kept on screen while the next one loads). */
  protected readonly results = signal<{ q: string; data: SearchResults } | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' } | null>(null);
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly sub = computed(() => {
    const q = this.query();
    return q
      ? `Results for “${q}” — limited to what your role can open`
      : 'Search members, transaction references and tickets';
  });
  protected readonly full = computed(
    () => (this.results()?.data.members.length ?? 0) >= SEARCH_LIMIT,
  );
  protected readonly members = computed(() => {
    const list = [...(this.results()?.data.members ?? [])];
    const s = this.sort();
    if (!s) return list;
    const get = (m: MemberHit) =>
      s.k === 'name'
        ? m.name
        : s.k === 'number'
          ? (m.number ?? '')
          : s.k === 'userType'
            ? m.userType
            : STATUS[m.status].label;
    list.sort((a, b) => {
      const r = get(a).localeCompare(get(b), 'en', { numeric: true });
      return s.dir === 'desc' ? -r : r;
    });
    return list;
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      const q = (p.get('q') ?? '').trim();
      if (q !== this.text().trim()) this.text.set(q);
      void this.run(q);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected async run(q: string) {
    this.query.set(q);
    const n = ++this.seq;
    if (q.length < 2) {
      this.results.set(null);
      this.loading.set(false);
      this.error.set('');
      return;
    }
    this.loading.set(true);
    try {
      const data = await this.api.search(q);
      if (n !== this.seq) return;
      this.results.set({ q, data });
      this.error.set('');
    } catch (e) {
      if (n !== this.seq) return;
      this.results.set(null);
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  /** Typing searches after a short pause; the address keeps the search (back and reload work). */
  protected typed(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    this.text.set(v);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.go(v), TYPE_DELAY_MS);
  }

  protected submit() {
    clearTimeout(this.timer);
    this.go(this.text());
  }

  private go(v: string) {
    const q = v.trim();
    if (q === this.query()) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: q || null },
      replaceUrl: true,
    });
  }

  protected sortBy(k: string) {
    const key = k as SortKey;
    const s = this.sort();
    this.sort.set({ k: key, dir: s?.k === key && s.dir === 'asc' ? 'desc' : 'asc' });
  }

  protected open(m: MemberHit) {
    void this.router.navigate(['/console/members'], { queryParams: { open: m.id } });
  }

  protected name(m: MemberHit) {
    return titleCase(m.name);
  }
  protected status(m: MemberHit) {
    return STATUS[m.status];
  }
}
