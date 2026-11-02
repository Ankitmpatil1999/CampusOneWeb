import { computed, inject, signal } from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatInr } from '../../../Utils/format';
import type { IconName } from '../../../Utils/icons';
import { translate } from '../../../Utils/translate';
import type { Application, ContactCodeSent, Landing, SectionName } from '../admissions.api';
import { asProblem, fill, paise, problemText, savedAt, yearLabel } from '../admissions.store';
import { scrollTop } from '../Layout/AdmissionsFrame';
import { PaSkeleton } from '../Shared/AdmissionsUi';
import { FormState, type FormFiles } from './form.ctx';
import {
  CODE_FIELD,
  STEPS,
  blank,
  cardsOf,
  classSection,
  fieldOf,
  fromApp,
  joinMobile,
  keptOf,
  sectionOf,
  splitMobile,
  stepOf,
  tcRecordedOf,
  validateStep,
  type Draft,
  type RefDraft,
} from './form.state';
import { StepAddress, StepClass, StepPrevious, StepStudent } from './FormSteps';
import { StepDocs, StepParents, StepRefs, StepReview, primaryDefault } from './FormStepsMore';
import type { FamilyLookup } from '../../../Shared/FamilyFound';

/**
 * What the application form does with the server: the public API with the family's resume token
 * (p.form), or the console's for the school's counsellor filling the same form for a family
 * (client 2026-10-15: the in-app form has the public form's steps, fields, rules and behaviour).
 */
export interface WizardBackend extends FormFiles {
  /** ADM-004 / ADM-015: the draft, from the first step's section. */
  create(classSection: unknown, step: number): Promise<Application>;
  /** ADM-012 / ADM-014. */
  read(appId: string): Promise<Application>;
  /** ADM-005 / ADM-016: one section. */
  save(appId: string, section: SectionName, data: unknown, step: number): Promise<Application>;
  /** ADM-007 / ADM-026. */
  addReference(
    appId: string,
    body: { name: string; relation: string | null; mobile: string; email: string | null },
  ): Promise<Application>;
  /** ADM-008 / ADM-027. */
  removeReference(appId: string, refId: string): Promise<unknown>;
  /** ADM-009 / ADM-030: with the declaration and the consent to register the family's account. */
  submit(appId: string): Promise<{ readonly status: 'DRAFT' | 'SUBMITTED' }>;
  /** A one-time code to the primary contact's saved mobile (client 2026-10-27). */
  contactOtp(appId: string): Promise<ContactCodeSent>;
  /** The code entered: the application with its primary contact verified. */
  verifyContact(appId: string, challengeId: string, otp: string): Promise<Application>;
  /**
   * IDN-090 (client 2026-10-22): who a mobile belongs to at the school — the counsellor's console
   * only; the public form has none (it never shows another family's details).
   */
  familyLookup?(mobile: string): Promise<FamilyLookup>;
}

const REF_FIELD: Readonly<Record<string, string>> = {
  name: 'name',
  relation: 'rel',
  mobile: 'phone',
  email: 'email',
};
const sameRef = (a: RefDraft, b: RefDraft) =>
  a.name === b.name &&
  a.relation === b.relation &&
  a.cc === b.cc &&
  a.phone === b.phone &&
  a.email === b.email;

/** The step components and pieces the form's template uses. */
export const WIZARD_IMPORTS = [
  Icon,
  Modal,
  PaSkeleton,
  StepAddress,
  StepClass,
  StepDocs,
  StepParents,
  StepPrevious,
  StepRefs,
  StepReview,
  StepStudent,
];

/**
 * The form — the multi-step application (ADM-004…009; FR-ADM-04/05, CR-14, CR-12, CR-07): the
 * stepper, the step's card and its buttons, and an attached picture's pop-up. One template for the
 * family's page and the counsellor's.
 */
export const WIZARD_TEMPLATE = `
    @if (problem(); as p) {
      <div class="pa-narrow">
        <div class="card">
          <div class="empty error-state">
            <div class="empty-ic"><rp-icon name="wifioff" [size]="26" /></div>
            <h4>Couldn't load this</h4>
            <p>{{ p }}</p>
            <button type="button" class="btn btn-sec" (click)="home()">
              <rp-icon name="arrowl" [size]="17" /><span>{{ backLabel }}</span>
            </button>
          </div>
        </div>
      </div>
    } @else if (loading()) {
      <rp-pa-skel />
    } @else {
      @let d = f.d();
      @let S = steps[d.step]!;
      <div class="pa-form">
        <div class="pa-fhead">
          <div class="grow">
            <button type="button" class="linkbtn pa-crumb" (click)="home()">
              <rp-icon name="arrowl" [size]="14" /> {{ crumb }}
            </button>
            <h1>Application for admission</h1>
            <div class="pa-fchips">
              @if (f.year(); as y) {
                <span class="chip tone-brand">{{ yl(y.label) }}</span>
              }
              @if (f.cls(); as c) {
                <span class="chip tone-neutral">{{ c.name }}</span>
              }
              @if (f.mid()) {
                <span class="chip tone-accent dot">Mid-term admission</span>
              }
              @if (d.appNo) {
                <span class="pa-muted t-xs">Draft {{ d.appNo }}</span>
              }
            </div>
          </div>
          <div class="pa-fhead-a">
            <span class="pa-saved">
              @if (d.saved) {
                <rp-icon name="checkc" [size]="13" /> Saved {{ saved(d.saved) }}
              } @else {
                <rp-icon name="cloud" [size]="13" /> Not saved yet
              }
            </span>
            <button
              type="button"
              class="btn btn-sec"
              [class.is-busy]="busy() === 'save'"
              (click)="save()"
            >
              <span>Save draft</span>
            </button>
          </div>
        </div>
        <div class="pa-mprog">
          <div class="pa-mprog-t">
            <b>Step {{ d.step + 1 }} of {{ steps.length }} · {{ S.t }}</b
            ><span>{{ pct() }}%</span>
          </div>
          <div class="steps">
            @for (s of steps; track $index; let i = $index) {
              <span class="st" [class.done]="i < d.step" [class.on]="i === d.step"></span>
            }
          </div>
        </div>
        <div class="pa-grid">
          <aside class="pa-side">
            <nav class="stepper-v pa-stepper" aria-label="Application steps">
              @for (s of steps; track $index; let i = $index) {
                <button
                  type="button"
                  class="sv"
                  [class.on]="i === d.step"
                  [class.done]="isDone(i)"
                  [disabled]="i > d.maxStep"
                  [attr.aria-current]="i === d.step ? 'step' : 'false'"
                  (click)="goto(i)"
                >
                  <span class="n">
                    @if (isDone(i)) {
                      <rp-icon name="check" [size]="12" [stroke]="3" />
                    } @else {
                      {{ i + 1 }}
                    }
                  </span>
                  <span class="grow">{{ s.t }}</span>
                  @if (i === 5 && f.mid()) {
                    <span class="pa-need-dot" title="Needed for mid-term">•</span>
                  }
                </button>
              }
            </nav>
            <div class="pa-help">
              <rp-icon name="help" [size]="16" />
              <div>
                <b>{{ helpTitle }}</b><span>{{ helpText() }}</span>
              </div>
            </div>
          </aside>
          <section class="card pa-card" id="pa-card">
            <div class="pa-card-h">
              <span class="pa-sic"><rp-icon [name]="icon(S.icon)" [size]="20" /></span>
              <div class="grow">
                <div class="eyebrow">Step {{ d.step + 1 }} of {{ steps.length }}</div>
                <h2>{{ S.t }}</h2>
                <p>{{ S.hint }}</p>
              </div>
            </div>
            @for (k of [d.step]; track k) {
              <div class="pa-card-b" id="pa-body">
                @switch (k) {
                  @case (0) {
                    <rp-pa-step-class [f]="f" />
                  }
                  @case (1) {
                    <rp-pa-step-student [f]="f" />
                  }
                  @case (2) {
                    <rp-pa-step-address [f]="f" />
                  }
                  @case (3) {
                    <rp-pa-step-previous [f]="f" />
                  }
                  @case (4) {
                    <rp-pa-step-parents [f]="f" />
                  }
                  @case (5) {
                    <rp-pa-step-refs [f]="f" />
                  }
                  @case (6) {
                    <rp-pa-step-docs [f]="f" />
                  }
                  @default {
                    <rp-pa-step-review [f]="f" (edit)="goto($event)" />
                  }
                }
              </div>
            }
            <div class="pa-card-f">
              @if (d.step) {
                <button type="button" class="btn btn-ghost btn-lg" (click)="back()">
                  <rp-icon name="arrowl" [size]="17" /><span>Back</span>
                </button>
              } @else {
                <button type="button" class="btn btn-ghost btn-lg" (click)="home()">
                  <span>Cancel</span>
                </button>
              }
              <span class="grow"></span>
              <button
                type="button"
                class="btn btn-sec btn-lg pa-hide-sm"
                [class.is-busy]="busy() === 'save'"
                (click)="save()"
              >
                <span>Save draft</span>
              </button>
              @if (d.step === steps.length - 1) {
                <!-- Not before the primary contact's mobile is verified (client 2026-10-27). -->
                <button
                  type="button"
                  class="btn btn-pri btn-lg"
                  id="pa-next"
                  [class.is-busy]="busy() === 'next'"
                  [disabled]="!f.contactVerified()"
                  [attr.title]="f.contactVerified() ? null : 'Verify the primary contact’s mobile first'"
                  (click)="submit()"
                >
                  <span>{{ submitLabel() }}</span
                  ><rp-icon [name]="mandatory() || withAdmission() ? 'lock' : 'send'" [size]="15" />
                </button>
              } @else {
                <button
                  type="button"
                  class="btn btn-pri btn-lg"
                  id="pa-next"
                  [class.is-busy]="busy() === 'next'"
                  (click)="next()"
                >
                  <span>Continue</span><rp-icon name="arrowr" [size]="15" />
                </button>
              }
            </div>
          </section>
        </div>
      </div>
    }
    <!-- An attached picture opens in a pop-up, not a new tab (client 2026-10-14). -->
    @if (f.shown(); as s) {
      <rp-modal
        [title]="s.name || 'Attachment'"
        icon="image"
        [wide]="true"
        (closed)="f.closeShown()"
      >
        <div id="pa-doc-view">
          @if (s.url) {
            <img
              [src]="s.url"
              [alt]="s.name"
              style="display: block; max-width: 100%; max-height: 70vh; margin: 0 auto; border-radius: 12px"
            />
          } @else if (s.failed) {
            <div class="note tone-bad" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">Couldn't open the file. Please try again.</div>
            </div>
          } @else {
            <div class="sk" style="height: 320px; border-radius: 12px"></div>
          }
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" id="pa-doc-close" (click)="f.closeShown()">
            <span>Close</span>
          </button>
        </ng-container>
      </rp-modal>
    }
  `;

/**
 * The form's behaviour, shared by the family's page and the counsellor's: each step is checked here
 * with the register's wording, saved as a section of the draft on "Continue", and checked again by
 * the server; the review step submits with the declaration. The pages say where the form lives
 * (the backend, the way back, what follows a submission).
 */
export abstract class AdmissionWizard {
  protected readonly overlays = inject(Overlays);
  protected readonly f: FormState;
  protected readonly steps = STEPS;
  protected readonly loading = signal(true);
  protected readonly busy = signal<'next' | 'save' | null>(null);
  protected readonly loadProblem = signal<string | null>(null);
  protected readonly problem = computed(() => this.outerProblem() ?? this.loadProblem());
  protected readonly pct = computed(() => Math.round((100 * this.f.d().step) / (STEPS.length - 1)));
  /**
   * The fees are paid on submitting: the family's online, or at the desk by a counsellor who
   * collects them (client 2026-10-23: the in-app form as the public form).
   */
  private readonly paysOnSubmit = computed(() => !this.f.counsellor || this.f.collects());
  /** The application fee is paid online to submit (client 2026-10-13): no "Pay later". */
  protected readonly mandatory = computed(
    () => this.paysOnSubmit() && paise(this.f.year()?.fees?.applicationFee) > 0,
  );
  /** The family chose to pay the admission fee now too, and the year has one. */
  protected readonly withAdmission = computed(() => {
    const d = this.f.d();
    return this.paysOnSubmit() && d.payAdmission && paise(this.f.year()?.fees?.admissionFee) > 0;
  });
  /** What is paid now, in one payment: the fees chosen "Pay now". */
  protected readonly submitLabel = computed(() => {
    const fees = this.f.year()?.fees;
    const total =
      (this.mandatory() ? paise(fees?.applicationFee) : 0) +
      (this.withAdmission() ? paise(fees?.admissionFee) : 0);
    if (!total) return 'Submit application';
    return this.mandatory()
      ? `Pay ${formatInr(total)} and submit`
      : `Submit and pay ${formatInr(total)}`;
  });

  /** The crumb back, the error page's button and the help box (the page's words). */
  protected abstract readonly crumb: string;
  protected abstract readonly backLabel: string;
  protected abstract readonly helpTitle: string;
  protected abstract helpText(): string;

  /** What each step's section looked like when last saved (to save only what changed). */
  private savedJson: Record<number, string> = {};

  /**
   * @param backend the server this form talks to
   * @param counsellor the school's counsellor fills the form for a family (the console)
   */
  constructor(
    protected readonly backend: WizardBackend,
    counsellor: boolean,
  ) {
    this.f = new FormState(backend, counsellor, backend.familyLookup?.bind(backend) ?? null);
    this.f.contact = {
      send: () => this.sendContactCode(),
      confirm: (challengeId, otp) => this.confirmContact(challengeId, otp),
    };
  }
  /** A problem the page itself has (a link that no longer works); null when none. */
  protected outerProblem(): string | null {
    return null;
  }
  /** The draft now exists: remember it, so a reload opens it again. */
  protected abstract remember(appId: string): void;
  /** Leaves the form (Cancel, the crumb). */
  protected abstract leave(): Promise<void>;
  /** The application can't be found any more (the family's token ran out). */
  protected abstract lost(): void;
  /** The application isn't a draft any more: where it is shown. */
  protected abstract notDraft(appId: string | null): void;
  /** After the submission: the confirmation, or the payment. */
  protected abstract submitted(
    appId: string,
    out: { readonly status: 'DRAFT' | 'SUBMITTED' },
    withAdmission: boolean,
  ): Promise<void>;
  /** Back at the top of the page. */
  protected toTop() {
    scrollTop();
  }

  /** Opens the form: an application to finish, or a new one for a year. */
  protected async start(
    l: Landing,
    appId: string | null,
    yearId: string | null,
  ): Promise<Application | null> {
    this.f.landing.set(l);
    let opened: Application | null = null;
    if (appId) {
      try {
        const a = await this.backend.read(appId);
        if (a.status !== 'DRAFT') {
          this.loading.set(false);
          return a;
        }
        opened = a;
        this.f.view.set(a);
        this.f.d.set(fromApp(a));
        this.snapshot();
      } catch (e) {
        const p = asProblem(e);
        if (p.status === 404 && p.code === 'ADM.NOT_FOUND') {
          this.lost();
          return null;
        }
        this.loadProblem.set(problemText(e));
      }
    } else {
      const y =
        l.years.find((x) => x.id === yearId) ??
        l.years.find((x) => x.id === l.preselectedYearId) ??
        l.years.find((x) => x.kind === 'REGULAR') ??
        l.years[0] ??
        null;
      this.f.d.set(blank(y));
    }
    this.loading.set(false);
    return opened;
  }

  protected yl(l: string) {
    return yearLabel(l);
  }
  protected saved(v: string) {
    return savedAt(v);
  }
  protected icon(n: string) {
    return n as IconName;
  }

  /** Prototype stepper: earlier steps, and those reached before, show a tick. */
  protected isDone(i: number) {
    const d = this.f.d();
    return i < d.step || (i < d.maxStep && i !== d.step);
  }

  // --- checks -----------------------------------------------------------------------------------

  private check(step: number, show = true): boolean {
    const facts = this.f.facts();
    if (!facts) return false;
    if (step === 4 && !this.f.d().primary) {
      const p = primaryDefault(this.f.d());
      if (p) this.f.put('primary', p);
    }
    const e = validateStep(step, this.f.d(), facts);
    if (!show) return !Object.keys(e).length;
    this.f.errors.set(e);
    if (Object.keys(e).length) {
      this.reveal();
      return false;
    }
    return true;
  }

  /** Scrolls the first invalid field into view and puts the cursor in it. */
  private reveal() {
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(
        '#pa-card .fld.invalid, #pa-card .pa-referr.on',
      );
      el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      el?.querySelector<HTMLElement>('input:not([type=file]), textarea, .dd-btn')?.focus({
        preventScroll: true,
      });
    }, 30);
  }

  // --- saving -----------------------------------------------------------------------------------

  private json(step: number, d: Draft = this.f.d()) {
    if (step === 5)
      return JSON.stringify(d.refs.map((r) => [r.id, r.name, r.relation, r.cc, r.phone, r.email]));
    const s = sectionOf(step, d, this.f.mid());
    return s ? JSON.stringify(s.data) : '';
  }

  private snapshot() {
    for (let i = 0; i < 7; i++) this.savedJson[i] = this.json(i);
  }

  /** Saves one step's section (ADM-004 for the first, ADM-005 after); false when refused. */
  private async persist(step: number, advance: boolean): Promise<boolean> {
    const d = this.f.d();
    const mid = this.f.mid();
    const reach = advance ? Math.min(STEPS.length - 1, step + 1) : step;
    let section: SectionName | null = null;
    try {
      if (!d.appId) {
        section = 'class';
        const a = await this.backend.create(classSection(d, mid), reach);
        this.took(a);
        this.f.edit((x) => {
          x.appId = a.id;
          x.appNo = a.applicationNo;
        });
        this.savedJson[0] = this.json(0);
        this.remember(a.id);
        return true;
      }
      if (step === 5) return await this.saveRefs(d.appId);
      const s = sectionOf(step, d, mid);
      if (!s) return true;
      section = s.section;
      const v = await this.backend.save(d.appId, s.section, s.data, reach);
      this.took(v);
      this.savedJson[step] = this.json(step, d);
      return true;
    } catch (e) {
      this.serverErrors(e, section);
      return false;
    }
  }

  private took(v: Application) {
    this.f.view.set(v);
    this.f.edit((x) => {
      x.saved = v.updatedAt;
      x.tcRecorded = tcRecordedOf(v.tc);
      x.kept = keptOf(v);
      x.cards = cardsOf(v);
    });
  }

  /** References (ADM-007/008): removed ones are deleted, new or changed ones are added. */
  private async saveRefs(appId: string): Promise<boolean> {
    const d = this.f.d();
    const kept = new Set(d.refs.map((r) => r.id).filter(Boolean));
    const out: RefDraft[] = [];
    let ok = true;
    try {
      for (const s of d.savedRefs) {
        if (s.id && !kept.has(s.id)) await this.backend.removeReference(appId, s.id);
      }
      for (const [i, r] of d.refs.entries()) {
        const before = d.savedRefs.find((s) => s.id === r.id);
        if (!ok || (r.id && before && sameRef(r, before))) {
          out.push(r);
          continue;
        }
        if (r.id) await this.backend.removeReference(appId, r.id);
        try {
          const v = await this.backend.addReference(appId, {
            name: r.name.trim(),
            relation: r.relation.trim() || null,
            mobile: joinMobile(r.cc, r.phone),
            email: r.email.trim().toLowerCase() || null,
          });
          const added = v.references.at(-1)!;
          out.push({ ...r, id: added.id });
        } catch (e) {
          ok = false;
          out.push({ ...r, id: null });
          const p = asProblem(e);
          const errs: Record<string, string> = {};
          for (const x of p.errors) {
            errs[`pa-ref${i}-${REF_FIELD[x.field] ?? 'name'}`] = fill(x.message, x.params ?? {});
          }
          if (!p.errors.length) errs['pa-referr'] = problemText(p);
          this.f.errors.set(errs);
          this.reveal();
        }
      }
      const v = await this.backend.read(appId);
      this.took(v);
      const saved = v.references.map((x) => {
        const m = splitMobile(x.mobile);
        return {
          id: x.id,
          name: x.name,
          relation: x.relation ?? '',
          cc: m.cc,
          phone: m.n,
          email: x.email ?? '',
        };
      });
      this.f.edit((x) => {
        x.refs = out.map((r) => saved.find((s) => s.id === r.id) ?? r);
        x.savedRefs = saved;
      });
      if (ok) this.savedJson[5] = this.json(5);
      return ok;
    } catch (e) {
      this.serverErrors(e, null);
      return false;
    }
  }

  /** The server's refusal on the form: field errors where they belong, the step they are on. */
  private serverErrors(e: unknown, section: SectionName | null) {
    const p = asProblem(e);
    if (p.status === 404 && p.code === 'ADM.NOT_FOUND') {
      this.lost();
      return;
    }
    const errs: Record<string, string> = {};
    for (const x of p.errors) {
      const id = fieldOf(x.field, section);
      if (id) errs[id] = fill(x.message, x.params ?? {});
    }
    if (!p.errors.length && CODE_FIELD[p.code]) errs[CODE_FIELD[p.code]!] = problemText(p);
    if (p.code === 'ADM.NOT_DRAFT' || p.code === 'ADM.NOT_EDITABLE') {
      this.overlays.toast(problemText(p), { tone: 'warn' });
      this.notDraft(this.f.d().appId);
      return;
    }
    const ids = Object.keys(errs);
    if (!ids.length) {
      this.overlays.toast('Not saved', { tone: 'bad', sub: problemText(p) });
      return;
    }
    this.f.errors.set(errs);
    const step = Math.min(...ids.map(stepOf));
    if (step !== this.f.d().step) {
      this.f.edit((x) => {
        x.step = step;
      });
      this.overlays.toast(`Check step ${step + 1}: ${STEPS[step]!.t}`, {
        tone: 'warn',
        sub: 'Something there is missing or needs a fix',
      });
      this.toTop();
    }
    this.reveal();
  }

  // --- actions ----------------------------------------------------------------------------------

  protected async save() {
    if (this.busy()) return;
    const step = this.f.d().step;
    if (!this.check(step)) {
      this.overlays.toast('Not saved', { tone: 'warn', sub: translate('VALIDATION.FAILED') });
      return;
    }
    this.busy.set('save');
    const ok = await this.persist(step, false);
    this.busy.set(null);
    if (!ok) return;
    const d = this.f.d();
    const primary = d.primary || primaryDefault(d);
    if (this.f.counsellor) {
      this.overlays.toast('Draft saved', {
        sub: d.appNo ? `${d.appNo} · finish it any time from Applications` : undefined,
      });
      return;
    }
    // The draft is found again by the primary contact's mobile (client 2026-10-12).
    const key = primary && d[primary].mobile;
    this.overlays.toast(
      'Draft saved',
      key
        ? { sub: "Resume any time with the primary contact's mobile number" }
        : { tone: 'warn', sub: "Add the primary contact's mobile number so you can find it later" },
    );
  }

  protected async next() {
    if (this.busy()) return;
    const step = this.f.d().step;
    if (!this.check(step)) return;
    this.busy.set('next');
    const ok = await this.persist(step, true);
    this.busy.set(null);
    if (!ok) return;
    this.move(Math.min(STEPS.length - 1, step + 1));
  }

  private move(to: number) {
    this.f.errors.set({});
    this.f.edit((x) => {
      x.step = to;
      x.maxStep = Math.max(x.maxStep, to);
    });
    this.toTop();
    if (to !== STEPS.length - 1) {
      setTimeout(() => {
        document
          .querySelector<HTMLElement>(
            '#pa-body input:not([type=hidden]):not([type=file]):not([type=checkbox]), #pa-body .dd-btn',
          )
          ?.focus({ preventScroll: true });
      }, 380);
    }
  }

  protected back() {
    const step = this.f.d().step;
    if (step) this.move(step - 1);
  }

  /** The stepper: steps reached before; a changed, valid step is saved on the way. */
  protected async goto(i: number) {
    const d = this.f.d();
    if (i > d.maxStep || i === d.step || this.busy()) return;
    if (
      d.appId &&
      d.step < 7 &&
      this.json(d.step) !== this.savedJson[d.step] &&
      this.check(d.step, false)
    ) {
      this.busy.set('next');
      await this.persist(d.step, false);
      this.busy.set(null);
    }
    this.move(i);
  }

  /** Cancel or the crumb: a changed, valid step is saved first. */
  protected async home() {
    const d = this.f.d();
    if (
      d.appId &&
      d.step < 7 &&
      !this.loading() &&
      this.json(d.step) !== this.savedJson[d.step] &&
      this.check(d.step, false)
    ) {
      await this.persist(d.step, false);
    }
    await this.leave();
  }

  protected enter(e: Event) {
    const t = e.target as HTMLElement;
    // inputs of the step card only (prototype: Enter continues)
    if (
      !t.closest?.('#pa-card') ||
      t.tagName !== 'INPUT' ||
      (t as HTMLInputElement).type === 'checkbox'
    )
      return;
    e.preventDefault();
    if (this.f.d().step === STEPS.length - 1) void this.submit();
    else void this.next();
  }

  /** Back to a step with what is missing there shown. */
  private fix(i: number, e: Record<string, string>) {
    this.f.edit((x) => {
      x.step = i;
    });
    this.f.errors.set(e);
    this.overlays.toast(`Check step ${i + 1}: ${STEPS[i]!.t}`, {
      tone: 'warn',
      sub: 'Something there is missing or needs a fix',
    });
    this.toTop();
    this.reveal();
  }

  // --- the primary contact's mobile (client 2026-10-27) ---------------------------------------------

  /**
   * "Verify": the code goes to the mobile the server has, so a changed Parents & guardians step is
   * checked and saved first (a new number or primary contact is then unverified until confirmed).
   */
  private async sendContactCode(): Promise<ContactCodeSent | null> {
    const d = this.f.d();
    if (!d.appId || this.busy()) return null;
    if (this.json(4) !== this.savedJson[4]) {
      if (!this.check(4, d.step === 4)) {
        if (d.step !== 4) this.fix(4, validateStep(4, this.f.d(), this.f.facts()!));
        return null;
      }
      this.busy.set('save');
      const ok = await this.persist(4, false);
      this.busy.set(null);
      if (!ok) return null;
    }
    this.f.clear('pa-cv');
    return this.backend.contactOtp(d.appId);
  }

  private async confirmContact(challengeId: string, otp: string) {
    const id = this.f.d().appId;
    if (!id) return;
    this.took(await this.backend.verifyContact(id, challengeId, otp));
    this.f.clear('pa-cv');
  }

  /** ADM-009: every step checked again, the changed ones saved, then the declaration. */
  protected async submit() {
    if (this.busy()) return;
    const last = STEPS.length - 1;
    if (!this.check(last)) return;
    const facts = this.f.facts()!;
    for (let i = 0; i < last; i++) {
      const e = validateStep(i, this.f.d(), facts);
      if (Object.keys(e).length) return this.fix(i, e);
    }
    this.busy.set('next');
    try {
      for (let i = 0; i < last; i++) {
        if (this.json(i) !== this.savedJson[i] && !(await this.persist(i, false))) return;
      }
      const d = this.f.d();
      if (!d.appId) return this.lost();
      // Only with the primary contact's mobile verified (client 2026-10-27); saving a changed
      // number above asks for it again.
      if (!this.f.contactVerified()) {
        this.f.fail('pa-cv', 'Verify the primary contact’s mobile number before submitting.');
        this.reveal();
        return;
      }
      const out = await this.backend.submit(d.appId);
      await this.submitted(d.appId, out, this.withAdmission());
    } catch (e) {
      this.serverErrors(e, null);
      // The server has the number unverified after all: its view, so "Verify" is offered again.
      const id = this.f.d().appId;
      if (id && asProblem(e).code === 'ADM.CONTACT_NOT_VERIFIED') {
        await this.backend.read(id).then(
          (v) => this.took(v),
          () => undefined,
        );
      }
    } finally {
      this.busy.set(null);
    }
  }
}
