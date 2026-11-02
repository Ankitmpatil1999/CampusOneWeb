import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { Icon } from '../../../Shared/Icon';
import { formatInr } from '../../../Utils/format';
import { translate } from '../../../Utils/translate';
import type { OpenYear } from '../admissions.api';
import {
  AdmissionsContext,
  bornRange,
  date,
  dshort,
  fileSize,
  paise,
  problemText,
  yearLabel,
} from '../admissions.store';
import { PaSkeleton, PaTimeline, type TimelineItem } from '../Shared/AdmissionsUi';
import { ResumePanel } from './ResumePanel';

/**
 * p.admission — the landing of the school's admission link (ADM-001; FR-ADM-01…03, FR-ACA-01,
 * CR-14): the open years with their entry fees, the age bands, what to keep ready, and "Resume an
 * application".
 */
@Component({
  selector: 'rp-admission-landing',
  imports: [Icon, PaSkeleton, PaTimeline, ResumePanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (ctx.error(); as e) {
      <div class="pa-narrow">
        <div class="card">
          <div class="empty error-state">
            <div class="empty-ic"><rp-icon name="link" [size]="26" /></div>
            <h4>Couldn't load this</h4>
            <p>{{ text(e) }}</p>
            @if (e.status === 0 || e.status >= 500) {
              <button type="button" class="btn btn-sec" (click)="reload()">
                <rp-icon name="refresh" [size]="17" /><span>Try again</span>
              </button>
            }
          </div>
        </div>
      </div>
    } @else if (!landing()) {
      <rp-pa-skel />
    } @else {
      @let l = landing()!;
      <div class="pa-land">
        <section class="pa-hero">
          <div class="pa-hero-t">
            @if (next(); as n) {
              <span class="pa-kicker"
                ><rp-icon name="sparkles" [size]="14" /> Admissions open for {{ yl(n.label) }}</span
              >
            }
            <h1>A place for your child at {{ l.institution.name }}</h1>
            <p>
              Apply online in about 15 minutes. Save your progress at any time and come back later —
              nothing is lost.
            </p>
            <div class="pa-cta">
              <button
                type="button"
                class="btn btn-pri btn-lg"
                [disabled]="!next()"
                (click)="apply(next())"
              >
                <span>Start an application</span><rp-icon name="arrowr" [size]="15" />
              </button>
              <button type="button" class="btn btn-sec btn-lg" (click)="openResume()">
                <rp-icon name="history" [size]="17" /><span>Resume an application</span>
              </button>
            </div>
            <div class="pa-hero-links">
              <button type="button" class="linkbtn" (click)="track()">
                Track an application<rp-icon name="right" [size]="14" />
              </button>
            </div>
          </div>
          <aside class="pa-glance card">
            <div class="eyebrow">At a glance</div>
            <dl class="kv">
              <dt>Classes</dt>
              <dd>{{ classRange() || '—' }}</dd>
              <dt>Application fee</dt>
              <dd>
                @if (next()?.fees; as f) {
                  {{ inr(f.applicationFee) }} <small class="pa-muted">online</small>
                } @else {
                  <span class="t-faint">—</span>
                }
              </dd>
              <dt>Admission fee</dt>
              <dd>
                @if (next()?.fees; as f) {
                  {{ inr(f.admissionFee) }} <small class="pa-muted">after approval</small>
                } @else {
                  <span class="t-faint">—</span>
                }
              </dd>
              <dt>Campus</dt>
              <dd>
                @if (l.institution.city) {
                  {{ l.institution.city }}
                } @else {
                  <span class="t-faint">—</span>
                }
              </dd>
            </dl>
            <div class="pa-glance-f">
              <rp-icon name="shieldck" [size]="15" /><span
                >Payments are processed by a secure gateway. The school never sees your card or bank
                details.</span
              >
            </div>
          </aside>
        </section>

        @if (resume()) {
          <rp-pa-resume [link]="link()" (closed)="closeResume()" (startNew)="apply(next())" />
        }

        <section>
          <div class="pa-sec">
            <h2>Open academic years</h2>
            <p>Choose the year your child will join.</p>
          </div>
          @if (l.years.length) {
            <div class="pa-years">
              @for (y of l.years; track y.id) {
                @let cur = y.kind === 'MID_TERM';
                <article class="card pa-year" [class.mid]="cur">
                  <div class="pa-year-h">
                    <div>
                      <div class="eyebrow">{{ cur ? 'This year' : 'Next year' }}</div>
                      <h3>{{ yl(y.label) }}</h3>
                    </div>
                    <span class="chip dot lg" [class]="cur ? 'tone-accent' : 'tone-ok'">{{
                      cur ? 'Mid-term admissions' : 'Regular admissions'
                    }}</span>
                  </div>
                  <p>
                    @if (cur) {
                      For children joining during the year, after {{ d(y.startsOn) }}. A transfer
                      certificate (or an undertaking to hand it in by a date) and at least one
                      reference are needed.
                    } @else {
                      The session starts on {{ d(y.startsOn) }}.{{
                        classRange() ? ' ' + classRange() + '.' : ''
                      }}
                    }
                  </p>
                  <dl class="pa-fees">
                    <div>
                      <dt>Application fee</dt>
                      <dd>{{ y.fees ? inr(y.fees.applicationFee) : '—' }}</dd>
                      <small>{{
                        y.fees?.applicationMandatory ? 'Paid online to submit' : 'Optional'
                      }}</small>
                    </div>
                    <div>
                      <dt>Admission fee</dt>
                      <dd>{{ y.fees ? inr(y.fees.admissionFee) : '—' }}</dd>
                      <small>After approval · online or at the accounts desk</small>
                    </div>
                  </dl>
                  <button
                    type="button"
                    class="btn btn-lg btn-block"
                    [class.btn-sec]="cur"
                    [class.btn-pri]="!cur"
                    (click)="apply(y)"
                  >
                    <span>{{
                      cur ? 'Apply for mid-term admission' : 'Apply for ' + yl(y.label)
                    }}</span
                    ><rp-icon name="arrowr" [size]="15" />
                  </button>
                </article>
              }
            </div>
          } @else {
            <div class="card">
              <div class="empty">
                <div class="empty-ic"><rp-icon name="calendar" [size]="26" /></div>
                <h4>No open academic years</h4>
                <p>{{ notOpen }}</p>
              </div>
            </div>
          }
        </section>

        <section class="pa-two">
          <div class="card pa-box">
            <h3>
              <rp-icon name="calendar" [size]="17" /> Key dates{{
                next() ? ' · ' + yl(next()!.label) : ''
              }}
            </h3>
            <rp-pa-tl [items]="dates()" />
          </div>
          <div class="card pa-box">
            <h3><rp-icon name="route" [size]="17" /> How it works</h3>
            <ol class="pa-how">
              <li>
                <b>Fill in the form</b
                ><span>About 15 minutes. Save a draft whenever you like.</span>
              </li>
              <li>
                <b>Pay the application fee online</b
                ><span
                  >UPI, card or net banking. Your application is submitted as soon as the payment
                  succeeds.</span
                >
              </li>
              <li>
                <b>Meet the admissions counsellor</b
                ><span>We review the application and invite you for a short interaction.</span>
              </li>
              <li>
                <b>Confirm the seat</b
                ><span>After approval, pay the admission fee online or at the accounts desk.</span>
              </li>
            </ol>
          </div>
        </section>

        <section class="pa-two">
          <div class="card pa-box">
            <h3><rp-icon name="user" [size]="17" /> Age on 1 June {{ startYear() }}</h3>
            <p class="pa-muted">
              Each class accepts a five-year age band. For a mid-term admission the age is measured
              on the joining date instead.
            </p>
            <div class="pa-ages">
              @for (c of ages(); track c.id) {
                <div>
                  <b>{{ c.name }}</b>
                  @if (c.band) {
                    <span>{{ c.band }}</span>
                    <small>{{ c.born }}</small>
                  } @else {
                    <span>—</span>
                  }
                </div>
              }
            </div>
          </div>
          <div class="card pa-box">
            <h3><rp-icon name="clip" [size]="17" /> Keep these ready</h3>
            <ul class="pa-need">
              <li>
                <rp-icon name="image" [size]="16" /><span>A passport-size photo of your child</span>
              </li>
              <li><rp-icon name="filetext" [size]="16" /><span>Birth certificate</span></li>
              <li>
                <rp-icon name="home" [size]="16" /><span
                  >Address proof (utility bill, rent agreement or passport)</span
                >
              </li>
              <li>
                <rp-icon name="book" [size]="16" /><span
                  >Last report card, for Grade 1 and above</span
                >
              </li>
              <li>
                <rp-icon name="file" [size]="16" /><span
                  >Transfer certificate, for a mid-term admission</span
                >
              </li>
            </ul>
            <div class="note tone-info">
              <rp-icon name="upload" [size]="17" />
              <div class="grow">
                {{ types() }}. <b>Each file can be up to {{ maxSize() }}.</b>
              </div>
            </div>
          </div>
        </section>
      </div>
    }
  `,
})
export class AdmissionLanding {
  protected readonly ctx = inject(AdmissionsContext);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly panel = viewChild(ResumePanel);

  protected readonly link = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('linkToken') ?? '')),
    { initialValue: '' },
  );
  protected readonly landing = this.ctx.landing;
  protected readonly resume = signal(false);
  protected readonly notOpen = translate('ADM.YEAR_NOT_OPEN');

  /** The year a new application starts with: the first regular year, else the first open one. */
  protected readonly next = computed(() => {
    const ys = this.landing()?.years ?? [];
    return ys.find((y) => y.kind === 'REGULAR') ?? ys[0] ?? null;
  });
  protected readonly startYear = computed(() =>
    Number((this.next()?.startsOn ?? `${new Date().getFullYear()}`).slice(0, 4)),
  );
  protected readonly classRange = computed(() => {
    const cs = this.landing()?.classes ?? [];
    if (!cs.length) return '';
    return cs.length === 1 ? cs[0]!.name : `${cs[0]!.name} to ${cs.at(-1)!.name}`;
  });
  protected readonly ages = computed(() =>
    (this.landing()?.classes ?? []).map((c) => {
      if (!c.ageBand) return { id: c.id, name: c.name, band: '', born: '' };
      const r = bornRange(c.ageBand, this.startYear());
      return {
        id: c.id,
        name: c.name,
        band: `${c.ageBand.min}–${c.ageBand.max} yrs`,
        born: `Born ${dshort(r.from)} ${r.from.slice(0, 4)} – ${dshort(r.to)} ${r.to.slice(0, 4)}`,
      };
    }),
  );
  /**
   * Key dates: the API gives the year's start; the application window, interaction and decision
   * dates are not published by ADM-001, so they show "—".
   */
  protected readonly dates = computed<TimelineItem[]>(() => {
    const n = this.next();
    return [
      { title: 'Applications open', sub: 'Open now', state: 'done' },
      { title: 'Last date to apply', sub: '—', state: 'now' },
      { title: 'Interaction with the child and parents', sub: '—' },
      { title: 'Decisions by SMS and e-mail', sub: '—' },
      { title: 'Session begins', sub: n ? date(n.startsOn) : '—' },
    ];
  });
  protected readonly types = computed(() => {
    const t = this.landing()?.rules.documents.types ?? ['PDF', 'JPG', 'PNG'];
    return t.length > 1 ? `${t.slice(0, -1).join(', ')} or ${t.at(-1)}` : (t[0] ?? '');
  });
  protected readonly maxSize = computed(() =>
    fileSize(this.landing()?.rules.documents.maxBytes ?? 2 * 1024 * 1024).replace('.0 ', ' '),
  );

  constructor() {
    const link = this.route.snapshot.paramMap.get('linkToken') ?? '';
    void this.ctx.load(link);
    if (this.route.snapshot.queryParamMap.get('resume') === '1') this.resume.set(true);
  }

  protected yl(l: string) {
    return yearLabel(l);
  }
  protected d(v: string) {
    return date(v);
  }
  protected inr(m: Parameters<typeof paise>[0]) {
    return formatInr(paise(m));
  }
  protected text(e: unknown) {
    return problemText(e);
  }

  protected reload() {
    this.ctx.clear();
    void this.ctx.load(this.link());
  }

  protected openResume() {
    if (this.resume()) this.panel()?.reveal();
    else this.resume.set(true);
  }

  protected closeResume() {
    this.resume.set(false);
  }

  protected apply(y: OpenYear | null) {
    if (!y) return;
    void this.router.navigate(['/admissions', this.link(), 'apply'], {
      queryParams: { year: y.id },
    });
  }

  protected track() {
    void this.router.navigate(['/admissions', this.link(), 'status']);
  }
}
