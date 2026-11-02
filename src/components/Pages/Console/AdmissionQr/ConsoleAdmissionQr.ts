import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDate, formatDateTime, istBusinessDate } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { yearStarted, type YearOption } from '../Applications/ConsoleApplications';
import { ApplicationsApi } from '../Applications/applications.api';
import { inr0, paiseOf, plural } from '../Fees/fee-format';
import { FeesApi, type EntryFeesRow } from '../Fees/fees.api';
import { AdmissionLinkEmail } from './AdmissionLinkEmail';
import { AdmissionLinkNew } from './AdmissionLinkNew';
import { AdmissionLinksApi, type AdmissionLinks } from './admission-links.api';
import { copyText } from '../../../Utils/clipboard';

/** The QR PNG's size: print-ready. */
const PNG_PX = 1024;

/**
 * c.admissionqr — Admission link & QR (SRS 19.2, FR-ADM-01, CR-14; INS-027…029; prototype
 * c.admissionqr): the link in use with its QR, the year the form opens on, the applications it has
 * brought, the application fee and how long the link works; copy, e-mail, download the QR (PNG,
 * print-ready) and replace the link (the old one stops working); and every link generated.
 */
@Component({
  selector: 'rp-console-admission-qr',
  imports: [AdmissionLinkEmail, AdmissionLinkNew, Empty, Icon, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Admission link & QR"
        sub="Share the public admission form. Families apply without signing in."
      />

      @if (!canView()) {
        <rp-empty
          icon="lock"
          title="This page isn't part of your role"
          text="The admission link is managed by the administrator. Pages your role can open are listed in the menu."
        />
      } @else {
        @if (readOnly()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow"><b>Read-only.</b> {{ readOnly() }}</div>
          </div>
        }
        @if (error()) {
          <div class="card pad">
            <rp-empty icon="alertc" title="Couldn't load the admission link" [text]="error()">
              <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                <span>Try again</span>
              </button>
            </rp-empty>
          </div>
        } @else if (!links()) {
          <div class="card pad"><rp-empty icon="hourglass" title="Loading…" /></div>
        } @else {
          <div class="stack g16">
            @if (current(); as q) {
              <div class="card cp-aq" id="aq-current">
                <div class="cp-aq-qr">
                  <div class="qr" [innerHTML]="qr()"></div>
                  <span class="t-xs t-muted">Scan to apply · {{ shortName() }}</span>
                </div>
                <div class="grow stack g12" style="min-width: 0">
                  <div class="row g8 wrap">
                    <h3 class="t-h3">{{ q.year ?? 'Every open year' }}</h3>
                    <span [class]="'chip dot tone-' + kind().tone">{{ kind().l }}</span>
                  </div>
                  <p class="t-sm t-muted" style="line-height: 1.5">{{ kind().text }}</p>
                  @if (q.expired) {
                    <div class="note tone-warn" id="aq-expired">
                      <rp-icon name="alert" [size]="17" />
                      <div class="grow">
                        This link stopped working on
                        {{ q.expiresAt ? date(q.expiresAt) : 'its last day' }}; families opening it
                        are told to ask the school. Replace it to take applications again.
                      </div>
                    </div>
                  }
                  <div class="cp-link">
                    <span class="t-mono t-clip" id="aq-url">{{ q.url }}</span
                    ><button type="button" class="iconbtn" aria-label="Copy link" (click)="copy()">
                      <rp-icon name="copy" [size]="16" />
                    </button>
                  </div>
                  <div class="cp-aqk" id="aq-kpis">
                    <div>
                      <b>{{ apps().total }}</b
                      ><span>applications</span>
                    </div>
                    <div>
                      <b>{{ apps().review }}</b
                      ><span>to review</span>
                    </div>
                    <div>
                      <b>{{ fee().v }}</b
                      ><span>{{ fee().l }}</span>
                    </div>
                    <div>
                      <b>{{ q.expiresAt ? date(q.expiresAt) : 'No end date' }}</b
                      ><span>link works until</span>
                    </div>
                  </div>
                  <div class="row g8 wrap">
                    <button type="button" class="btn btn-sec btn-sm" id="aq-copy" (click)="copy()">
                      <rp-icon name="copy" [size]="15" /><span>Copy link</span>
                    </button>
                    <span class="cp-why" [attr.title]="editWhy() || null"
                      ><button
                        type="button"
                        class="btn btn-sec btn-sm"
                        id="aq-mail"
                        [disabled]="!!editWhy()"
                        (click)="mailing.set(true)"
                      >
                        <rp-icon name="mail" [size]="15" /><span>E-mail link</span>
                      </button></span
                    >
                    <button
                      type="button"
                      class="btn btn-sec btn-sm"
                      id="aq-png"
                      [class.is-busy]="pngBusy()"
                      [disabled]="pngBusy()"
                      (click)="png()"
                    >
                      <rp-icon name="download" [size]="15" /><span>Download PNG</span>
                    </button>
                    <span class="cp-why" [attr.title]="editWhy() || null"
                      ><button
                        type="button"
                        class="btn btn-ghost btn-sm"
                        id="aq-replace"
                        [disabled]="!!editWhy()"
                        (click)="replacing.set(true)"
                      >
                        <rp-icon name="refresh" [size]="15" /><span>Replace link</span>
                      </button></span
                    >
                  </div>
                  <span class="t-xs t-faint"
                    >Generated {{ q.createdAt ? when(q.createdAt) : '' }}</span
                  >
                </div>
              </div>
            } @else {
              <div class="card pad-l" id="aq-none">
                <rp-empty
                  icon="qr"
                  title="No admission link yet"
                  text="Generate a link and QR to start taking applications on the public form."
                >
                  <span class="cp-why" [attr.title]="editWhy() || null"
                    ><button
                      type="button"
                      class="btn btn-pri btn-sm"
                      id="aq-gen"
                      [disabled]="!!editWhy()"
                      (click)="replacing.set(true)"
                    >
                      <rp-icon name="qr" [size]="15" /><span>Generate link</span>
                    </button></span
                  >
                </rp-empty>
              </div>
            }

            <section class="stack g8">
              <div class="sec-h">
                <h3>All links</h3>
                <span class="t-xs t-muted">Replaced links stop working and are kept here</span>
              </div>
              <div class="tbl-wrap">
                <table class="tbl" id="aq-table">
                  <thead>
                    <tr>
                      <th>Academic year</th>
                      <th>Link</th>
                      <th>Generated</th>
                      <th>Works until</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (l of all(); track l.id) {
                      <tr>
                        <td>{{ l.year ?? 'Every open year' }}</td>
                        <td>
                          @if (l.url) {
                            <span class="t-mono t-sm" style="overflow-wrap: anywhere">{{
                              l.url
                            }}</span>
                          } @else {
                            <span class="t-faint">No longer works</span>
                          }
                        </td>
                        <td>{{ l.createdAt ? date(l.createdAt) : '—' }}</td>
                        <td>
                          @if (l.expiresAt) {
                            {{ date(l.expiresAt) }}
                          } @else {
                            <span class="t-faint">—</span>
                          }
                        </td>
                        <td>
                          @if (l.status === 'ACTIVE') {
                            <span class="chip dot tone-ok">{{ active }}</span>
                          } @else {
                            <span class="chip dot tone-neutral">{{ replaced }}</span>
                            @if (l.replacedAt) {
                              <div class="t-xs t-muted">{{ date(l.replacedAt) }}</div>
                            }
                          }
                        </td>
                      </tr>
                    } @empty {
                      <tr>
                        <td colspan="5">
                          <rp-empty icon="qr" title="No links yet" />
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (all().length) {
                <div class="pager">
                  <span>{{ plural(all().length, 'link') }}</span>
                </div>
              }
            </section>
          </div>
        }
      }
    </div>

    @if (mailing() && current(); as q) {
      <rp-admission-link-email
        [link]="q"
        [institution]="institution()"
        [yearLabel]="q.year ?? ''"
        (closed)="mailing.set(false)"
        (sent)="mailing.set(false)"
      />
    }
    @if (replacing()) {
      <rp-admission-link-new
        [current]="current()"
        [years]="openYears()"
        (closed)="replacing.set(false)"
        (generated)="generated()"
      />
    }
  `,
})
export class ConsoleAdmissionQr {
  private readonly api = inject(AdmissionLinksApi);
  private readonly apps$ = inject(ApplicationsApi);
  private readonly feesApi = inject(FeesApi);
  private readonly overlays = inject(Overlays);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly session = inject(SessionContext).console;

  protected readonly plural = plural;
  protected readonly today = istBusinessDate(new Date());
  protected readonly active = translate('status.admission_link.active');
  protected readonly replaced = translate('status.admission_link.replaced');
  protected readonly noTask = "Your role doesn't include this task.";

  protected readonly links = signal<AdmissionLinks | null>(null);
  protected readonly error = signal('');
  protected readonly years = signal<readonly YearOption[]>([]);
  protected readonly fees = signal<readonly EntryFeesRow[]>([]);
  protected readonly counts = signal<{ total: number; review: number } | null>(null);
  protected readonly mailing = signal(false);
  protected readonly replacing = signal(false);
  protected readonly pngBusy = signal(false);

  protected readonly canView = computed(() => this.can('admqr.view'));
  protected readonly readOnly = computed(() =>
    this.session()?.roles.some((r) => r.readOnly)
      ? 'Management has read-only access. The administrator makes changes here.'
      : '',
  );
  protected readonly editWhy = computed(
    () => this.readOnly() || (this.can('admqr.edit') ? '' : this.noTask),
  );
  protected readonly institution = computed(
    () => this.session()?.institution.name ?? 'the institution',
  );
  protected readonly shortName = computed(
    () => this.session()?.institution.shortName || this.institution(),
  );
  protected readonly current = computed(() => this.links()?.current ?? null);
  protected readonly all = computed(() => {
    const l = this.links();
    return l ? [...(l.current ? [l.current] : []), ...l.history] : [];
  });
  protected readonly openYears = computed(() =>
    this.years().filter((y) => y.status !== 'CLOSED' && (!y.endsOn || y.endsOn >= this.today)),
  );
  /** The year the link opens on, when one is set and known. */
  protected readonly year = computed(() => {
    const label = this.current()?.year;
    return label ? (this.years().find((y) => y.label === label) ?? null) : null;
  });
  protected readonly qr = computed<SafeHtml>(() => {
    const q = this.current();
    if (!q?.qrSvg) return '';
    // Our own API draws the code (trusted markup); it is shown 168 px square (prototype ui.qr).
    return this.sanitizer.bypassSecurityTrustHtml(
      q.qrSvg.replace(
        /^\s*<svg\b/,
        `<svg width="168" height="168" role="img" aria-label="Admission QR for ${this.esc(this.shortName())}"`,
      ),
    );
  });
  protected readonly kind = computed(() => {
    const y = this.year();
    if (!this.current()?.year) {
      const open = this.openYears().map((x) => x.label);
      return {
        l: this.active,
        tone: 'ok',
        text: `The form offers every academic year open for admission${open.length ? ` (${open.join(', ')})` : ''}. Drafts can be resumed with the student's identity number or the mobile used.`,
      };
    }
    if (y && yearStarted(y, this.today)) {
      return {
        l: 'Mid-term admissions',
        tone: 'accent',
        text: 'The year has started, so these are mid-term applications: a joining date, a transfer certificate or an undertaking, and at least one reference (CR-14).',
      };
    }
    return {
      l: 'Admissions open',
      tone: 'ok',
      text: `Applications for the year${y?.startsOn ? ` starting ${formatDate(y.startsOn)}` : ''}. Drafts can be resumed with the student's identity number or the mobile used.`,
    };
  });
  protected readonly apps = computed(() => {
    const c = this.counts();
    return c
      ? { total: c.total.toLocaleString('en-IN'), review: c.review.toLocaleString('en-IN') }
      : { total: '—', review: '—' };
  });
  /** The application fee of the link's year (else the next intake's). */
  protected readonly fee = computed(() => {
    const label = this.current()?.year;
    const rows = this.fees();
    const row =
      (label ? rows.find((r) => r.year.label === label) : null) ??
      rows.find((r) => !r.year.current && r.year.status === 'OPEN') ??
      rows.find((r) => r.year.current);
    if (!row?.fees) return { v: '—', l: 'application fee' };
    return {
      v: inr0(paiseOf(row.fees.applicationFee)),
      l: `application fee${row.fees.applicationMandatory ? ' · required' : ''}`,
    };
  });

  constructor() {
    if (this.can('admqr.view')) {
      void this.load();
      void this.lookups();
    }
  }

  protected async load() {
    try {
      this.links.set(await this.api.links());
      this.error.set('');
      void this.loadCounts();
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  private async lookups() {
    if (this.can('academics.view')) {
      try {
        const r = await this.feesApi.academicYears();
        this.years.set(
          (r.items as readonly (YearOption & { status?: string; current?: boolean })[]).map(
            (y) => ({
              id: y.id,
              label: y.label,
              startsOn: y.startsOn ?? null,
              endsOn: y.endsOn ?? null,
              status: y.status ?? 'OPEN',
              current: !!y.current,
            }),
          ),
        );
      } catch {
        // The year choice then offers "Every open year" only.
      }
    }
    if (this.can('fees.view')) {
      try {
        const r = await this.feesApi.entryFees();
        this.fees.set(r.items);
        if (!this.years().length) {
          this.years.set(
            r.items.map((e) => ({
              id: e.year.id,
              label: e.year.label,
              startsOn: null,
              endsOn: null,
              status: e.year.status,
              current: e.year.current,
            })),
          );
        }
      } catch {
        // The fee tile then shows a dash.
      }
    }
    void this.loadCounts();
  }

  /** The applications of the link's year (all years when it opens on every year). */
  private async loadCounts() {
    if (!this.can('admissions.view') || !this.links()) return;
    const label = this.current()?.year;
    const y = label ? this.years().find((x) => x.label === label) : null;
    if (label && !y) return;
    try {
      const r = await this.apps$.list(y ? { yearId: y.id } : {});
      const total = Object.values(r.counts).reduce((a, b) => a + (b ?? 0), 0);
      this.counts.set({ total, review: r.counts.SUBMITTED ?? 0 });
    } catch {
      // The tiles then show a dash.
    }
  }

  protected async copy() {
    const url = this.current()?.url;
    if (!url) return;
    try {
      await copyText(url);
      this.overlays.toast('Link copied', { sub: url });
    } catch {
      this.overlays.toast("Couldn't copy the link", {
        tone: 'bad',
        sub: 'Select the link and copy it.',
      });
    }
  }

  /** The QR as a print-ready PNG, drawn in the browser from the API's SVG. */
  protected async png() {
    const q = this.current();
    if (!q?.qrSvg) return;
    this.pngBusy.set(true);
    const name = `${(this.shortName() || 'admissions').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-admissions${q.year ? '-' + q.year.replace(/[^0-9A-Za-z]+/g, '-') : ''}.png`;
    try {
      const svg = q.qrSvg.replace(/^\s*<svg\b/, `<svg width="${PNG_PX}" height="${PNG_PX}"`);
      const src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const img = new Image();
      await new Promise<void>((ok, bad) => {
        img.onload = () => ok();
        img.onerror = () => bad(new Error('qr'));
        img.src = src;
      });
      const c = document.createElement('canvas');
      c.width = PNG_PX;
      c.height = PNG_PX;
      const g = c.getContext('2d');
      if (!g) throw new Error('canvas');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, PNG_PX, PNG_PX);
      g.drawImage(img, 0, 0, PNG_PX, PNG_PX);
      URL.revokeObjectURL(src);
      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));
      if (!blob) throw new Error('png');
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      this.overlays.toast('QR downloaded', {
        sub: `${name} · ${PNG_PX} × ${PNG_PX} px, print-ready`,
      });
    } catch {
      this.overlays.toast("Couldn't make the PNG", {
        tone: 'bad',
        sub: 'Try again, or take a screenshot of the QR.',
      });
    } finally {
      this.pngBusy.set(false);
    }
  }

  protected generated() {
    this.replacing.set(false);
    this.counts.set(null);
    void this.load();
  }

  protected date(v: string) {
    return formatDate(v);
  }
  protected when(v: string) {
    return formatDateTime(v);
  }
  private esc(s: string) {
    return s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  }
  protected can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }
}
