import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Avatar } from '../../../Shared/Avatar';
import { StaffPasswordsPanel, type ShownStaffPassword } from './StaffPasswordsPanel';
import { Card, Empty } from '../../../Shared/Blocks';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatMobile, istBusinessDate } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { PATTERNS } from '../../../Utils/patterns';
import { translate } from '../../../Utils/translate';
import { cleanTyped, onlyDigits } from '../../../Utils/typing';
import {
  InstitutionSetupApi,
  type CustomField,
  type UserType,
} from '../Institution/institution.api';
import {
  MembersApi,
  type ClassView,
  type Eligibility,
  type UploadReport,
} from '../Members/members.api';
import { FamilyFound, type FamilyLookup } from '../../../Shared/FamilyFound';
import { StaffAccountsApi, roleFits, type ConsoleRole } from '../Members/staff-accounts.api';

type Tab = 'Single' | 'Staff' | 'Update';
/** The role dropdown's "No console role" (client 2026-10-22). */
const NO_ROLE = 'NONE';
type Step = 'check' | 'form' | 'done';
const MOBILE = /^[6-9]\d{9}$/;
/** The platform's one e-mail rule (client 2026-10-15), on what is typed in lower case. */
const isEmail = (v: string) => PATTERNS.email.test(v.trim().toLowerCase());
const NAME = /^[A-Za-z][A-Za-z .'-]*$/;
const STAFF = ['TEACHER', 'STAFF', 'PRINCIPAL', 'MANAGEMENT', 'CREW', 'OTHER'];

interface Person {
  ut: string;
  dept: string;
  first: string;
  last: string;
  gender: string;
  dob: string;
  email: string;
  joined: string;
  adm: string;
  cls: string;
  sec: string;
  own: string;
  pcn: string;
  pce: string;
  rel: string;
  emp: string;
  /** A staff member's console role id, NO_ROLE, or '' while not chosen. */
  role: string;
}

const blank = (today: string): Person => ({
  ut: '',
  dept: '',
  first: '',
  last: '',
  gender: '',
  dob: '',
  email: '',
  joined: today,
  adm: '',
  cls: '',
  sec: '',
  own: '',
  pcn: '',
  pce: '',
  rel: '',
  emp: '',
  role: '',
});

/**
 * c.onboard — Onboard members (SRS 6.18–6.22; IDN-047…053; prototype c.onboard; FR-IDN-15, BR-01,
 * BR-02, CR-12). One member in three steps (check the mobile, details, done), and staff — one, or a
 * spreadsheet checked row by row before anything is created — with a temporary password for new
 * accounts. Members are no longer uploaded in bulk here (client 2026-10-23): existing students come
 * in through Applications. Wallets are opened by the wallet module (Phase 3).
 */
@Component({
  selector: 'rp-console-onboard',
  imports: [
    Avatar,
    Card,
    Dropdown,
    Empty,
    FamilyFound,
    Icon,
    NgTemplateOutlet,
    StaffPasswordsPanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <div class="c-ph">
        <div class="c-pt">
          <h1>Onboard members</h1>
          <p>
            Add people one at a time, from a spreadsheet, or as staff. Every profile gets a campus
            wallet and an allowance wallet.
          </p>
        </div>
      </div>
      <div class="tabs">
        @for (t of tabs; track t.v) {
          <button type="button" class="tab" [class.on]="tab() === t.v" (click)="tab.set(t.v)">
            <rp-icon [name]="t.icon" [size]="15" />{{ t.l }}
          </button>
        }
      </div>
      @if (why() && tab() !== 'Update') {
        <div class="note tone-info">
          <rp-icon name="lock" [size]="17" />
          <div class="grow"><b>Read-only.</b> {{ why() }}</div>
        </div>
      }

      @switch (tab()) {
        @case ('Single') {
          @switch (step()) {
            @case ('check') {
              <div class="c-grid s21">
                <div class="card pad-l stack g16" style="align-self: start">
                  <ng-container *ngTemplateOutlet="stepper; context: { $implicit: 0 }" />
                  <div>
                    <h3 class="t-h3">Check the mobile number first</h3>
                    <p class="t-sm t-muted mt4" style="line-height: 1.5">
                      Use the member's own mobile, or a parent's mobile for a child without a phone.
                      We check whether a CampusOne account exists and whether it's already used here.
                    </p>
                  </div>
                  <div class="cp-chk">
                    <div class="fld" [class.invalid]="err('mobile')">
                      <label class="fld-l" for="cp-ob-mob"
                        >Mobile number<span class="req">*</span></label
                      >
                      <div class="fld-in">
                        <span class="pre">+91</span>
                        <input
                          id="cp-ob-mob"
                          inputmode="numeric"
                          maxlength="10"
                          placeholder="10-digit mobile"
                          [value]="mobile()"
                          (input)="setMobile($event)"
                        />
                      </div>
                      <div class="fld-e" role="alert">
                        <rp-icon name="alertc" [size]="14" /><span>{{ err('mobile') }}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      class="btn btn-pri"
                      [class.is-busy]="busy()"
                      [disabled]="!!why()"
                      (click)="check()"
                    >
                      <rp-icon name="search" [size]="17" /><span>Check eligibility</span>
                    </button>
                  </div>
                  @if (chk(); as c) {
                    <div
                      class="note"
                      [class]="
                        'note tone-' + (c.eligible ? (c.profiles.length ? 'brand' : 'ok') : 'bad')
                      "
                    >
                      <rp-icon [name]="c.eligible ? 'checkc' : 'alertc'" [size]="17" />
                      <div class="grow">{{ checkText(c) }}</div>
                    </div>
                    @if (c.eligible) {
                      <!-- The family or staff member on this mobile (client 2026-10-22). -->
                      <rp-family-found
                        [mobiles]="[mobile()]"
                        [lookup]="lookup"
                        (use)="useFound($event)"
                      />
                      <div class="row end">
                        <button type="button" class="btn btn-pri" (click)="toForm()">
                          <span>Continue</span><rp-icon name="arrowr" [size]="17" />
                        </button>
                      </div>
                    }
                  }
                </div>
                <div class="stack g16">
                  <rp-card title="What gets created" icon="info">
                    <div class="list plain">
                      <div class="li">
                        <span class="li-ic sm"><rp-icon name="user" [size]="16" /></span
                        ><span class="li-main"
                          ><span class="li-t wrap">An institution profile</span
                          ><span class="li-s wrap"
                            >With a member ID, user type and department</span
                          ></span
                        >
                      </div>
                      <div class="li">
                        <span class="li-ic sm"><rp-icon name="wallet" [size]="16" /></span
                        ><span class="li-main"
                          ><span class="li-t wrap">A campus wallet and an allowance wallet</span
                          ><span class="li-s wrap"
                            >Opened by the wallet module (Phase 3)</span
                          ></span
                        >
                      </div>
                      <div class="li">
                        <span class="li-ic sm"><rp-icon name="link" [size]="16" /></span
                        ><span class="li-main"
                          ><span class="li-t wrap">A link to a CampusOne account</span
                          ><span class="li-s wrap"
                            >Found by mobile number, or linked when the number signs up</span
                          ></span
                        >
                      </div>
                    </div>
                  </rp-card>
                  <rp-card title="Other ways to onboard" icon="layers">
                    <div class="stack g8">
                      <button type="button" class="btn btn-sec" (click)="tab.set('Staff')">
                        <rp-icon name="briefcase" [size]="17" /><span>Onboard staff</span>
                      </button>
                    </div>
                  </rp-card>
                </div>
              </div>
            }
            @case ('form') {
              <div class="stack g16 cp-obf">
                <div class="card pad stack g12">
                  <ng-container *ngTemplateOutlet="stepper; context: { $implicit: 1 }" />
                  <div class="row g8 wrap">
                    <span
                      class="chip"
                      [class]="
                        'chip tone-' +
                        (chk()?.profiles?.length ? 'brand' : chk()?.account ? 'info' : 'ok')
                      "
                      ><rp-icon name="phone" [size]="12" />{{ fmtMobile(mobile()) }}</span
                    ><span class="t-sm t-muted">{{ chkLine() }}</span
                    ><span class="grow"></span
                    ><button type="button" class="linkbtn cp-lk" (click)="step.set('check')">
                      Change number
                    </button>
                  </div>
                </div>
                <ng-container *ngTemplateOutlet="membership" />
                <div class="fs">
                  <h4>Person</h4>
                  <div class="fs-b">
                    <div class="c-form c3">
                      <ng-container
                        *ngTemplateOutlet="
                          text;
                          context: {
                            k: 'first',
                            l: 'First name',
                            req: true,
                            ph: 'As on the birth certificate',
                          }
                        "
                      />
                      <ng-container
                        *ngTemplateOutlet="text; context: { k: 'last', l: 'Last name', req: false }"
                      />
                      <div class="fld" [class.invalid]="err('gender')">
                        <label class="fld-l" for="cp-ob-gender-b"
                          >Gender<span class="req">*</span></label
                        >
                        <rp-dd
                          inputId="cp-ob-gender"
                          [options]="genders"
                          [value]="p().gender"
                          placeholder="Select"
                          (changed)="set('gender', $event)"
                        />
                        <div class="fld-e" role="alert">
                          <rp-icon name="alertc" [size]="14" /><span>{{ err('gender') }}</span>
                        </div>
                      </div>
                      <ng-container
                        *ngTemplateOutlet="
                          text;
                          context: {
                            k: 'dob',
                            l: 'Date of birth',
                            req: isStudent(),
                            type: 'date',
                            hint: 'Required for students',
                          }
                        "
                      />
                    </div>
                    <p class="t-xs t-muted mt8">
                      <rp-icon name="lock" [size]="11" /> Name, date of birth, gender and admission
                      number become display-only once saved; later changes go through a correction
                      request (CR-06).
                    </p>
                  </div>
                </div>
                @if (isStudent()) {
                  <div class="fs">
                    <h4>Student</h4>
                    <div class="fs-b">
                      <div class="c-form c3">
                        <ng-container
                          *ngTemplateOutlet="
                            text;
                            context: {
                              k: 'adm',
                              l: 'Admission number',
                              req: true,
                              ph: 'TVPS/2026/0001',
                              hint: 'Unique in the institution',
                            }
                          "
                        />
                        <div class="fld" [class.invalid]="err('cls')">
                          <label class="fld-l" for="cp-ob-cls-b"
                            >Grade · {{ yearLabel() }}<span class="req">*</span></label
                          >
                          <rp-dd
                            inputId="cp-ob-cls"
                            [options]="gradeOptions()"
                            [value]="p().cls"
                            placeholder="Select"
                            (changed)="setGrade($event)"
                          />
                          <div class="fld-e" role="alert">
                            <rp-icon name="alertc" [size]="14" /><span>{{ err('cls') }}</span>
                          </div>
                        </div>
                        <div class="fld" [class.invalid]="err('sec')">
                          <label class="fld-l" for="cp-ob-sec-b"
                            >Section<span class="req">*</span></label
                          >
                          <rp-dd
                            inputId="cp-ob-sec"
                            [options]="sectionOptions()"
                            [value]="p().sec"
                            placeholder="Select"
                            (changed)="set('sec', $event)"
                          />
                          <div class="fld-e" role="alert">
                            <rp-icon name="alertc" [size]="14" /><span>{{ err('sec') }}</span>
                          </div>
                        </div>
                        <ng-container
                          *ngTemplateOutlet="
                            text;
                            context: {
                              k: 'own',
                              l: ownMobile.label,
                              req: false,
                              hint: ownMobile.hint,
                            }
                          "
                        />
                      </div>
                    </div>
                  </div>
                  <div class="fs">
                    <h4>Primary contact</h4>
                    <div class="fs-b">
                      <div class="c-form">
                        <ng-container
                          *ngTemplateOutlet="
                            text;
                            context: { k: 'pcn', l: 'Name', req: true, lock: !!existingParent() }
                          "
                        />
                        <div class="fld">
                          <label class="fld-l" for="cp-ob-pcm">Mobile</label>
                          <div class="fld-in">
                            <input id="cp-ob-pcm" readonly [value]="fmtMobile(mobile())" />
                          </div>
                          <div class="fld-h">The number you checked</div>
                        </div>
                        <ng-container
                          *ngTemplateOutlet="
                            text;
                            context: {
                              k: 'pce',
                              l: 'E-mail',
                              req: !existingParent(),
                              type: 'email',
                              lock: !!existingParent(),
                            }
                          "
                        />
                        <div class="fld" [class.invalid]="err('rel')">
                          <label class="fld-l" for="cp-ob-rel-b"
                            >Relation<span class="req">*</span></label
                          >
                          <rp-dd
                            inputId="cp-ob-rel"
                            [options]="relations"
                            [value]="p().rel"
                            placeholder="Select"
                            (changed)="set('rel', $event)"
                          />
                          <div class="fld-e" role="alert">
                            <rp-icon name="alertc" [size]="14" /><span>{{ err('rel') }}</span>
                          </div>
                        </div>
                      </div>
                      @if (existingParent(); as ep) {
                        <p class="t-xs t-muted mt8">
                          {{ ep.name }} is already a parent here; the student is linked to them.
                        </p>
                      }
                    </div>
                  </div>
                } @else {
                  <div class="fs">
                    <h4>Contact</h4>
                    <div class="fs-b">
                      <div class="c-form">
                        <div class="fld">
                          <label class="fld-l" for="cp-ob-mob2">Mobile</label>
                          <div class="fld-in">
                            <input id="cp-ob-mob2" readonly [value]="fmtMobile(mobile())" />
                          </div>
                          <div class="fld-h">The account key</div>
                        </div>
                        <ng-container
                          *ngTemplateOutlet="
                            text;
                            context: { k: 'email', l: 'E-mail', req: isParent(), type: 'email' }
                          "
                        />
                      </div>
                    </div>
                  </div>
                }
                <ng-container *ngTemplateOutlet="customFields" />
                <div class="row end g8">
                  <button type="button" class="btn btn-ghost" (click)="step.set('check')">
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    class="btn btn-pri"
                    [class.is-busy]="busy()"
                    [disabled]="!!why()"
                    (click)="create()"
                  >
                    <rp-icon name="check" [size]="17" /><span>Create member</span>
                  </button>
                </div>
              </div>
            }
            @case ('done') {
              @if (created(); as c) {
                <div class="card pad-l stack g16 cp-narrow">
                  <ng-container *ngTemplateOutlet="stepper; context: { $implicit: 2 }" />
                  <div class="row g12">
                    <span
                      class="confirm-ic"
                      style="margin: 0; background: var(--ok-soft); color: var(--ok)"
                      ><rp-icon name="checkc" [size]="24"
                    /></span>
                    <div>
                      <h3 class="t-h3">{{ c.name }} is onboarded</h3>
                      <p class="t-sm t-muted">{{ c.detail }} · {{ yearLabel() }}</p>
                    </div>
                  </div>
                  <dl class="kv">
                    <dt>Member ID</dt>
                    <dd class="t-mono">{{ c.memberNo }}</dd>
                    @if (c.adm) {
                      <dt>Admission number</dt>
                      <dd class="t-mono">{{ c.adm }}</dd>
                    }
                    <dt>Wallets</dt>
                    <dd>Opened by the wallet module (Phase 3)</dd>
                    <dt>Account</dt>
                    <dd>{{ c.account }}</dd>
                  </dl>
                  <div class="row g8 wrap">
                    <button type="button" class="btn btn-sec" (click)="openMember(c.id)">
                      <rp-icon name="user" [size]="17" /><span>Open member</span>
                    </button>
                    <button type="button" class="btn btn-pri" (click)="again()">
                      <rp-icon name="userplus" [size]="17" /><span>Onboard another</span>
                    </button>
                  </div>
                </div>
              }
            }
          }
        }
        @case ('Staff') {
          @if (report() && report()!.kind === 'STAFF') {
            <ng-container *ngTemplateOutlet="reportView" />
          } @else {
            <div class="c-grid s21">
              <div class="stack g16">
                <div class="fs">
                  <h4><rp-icon name="briefcase" [size]="15" /> Staff member</h4>
                  <div class="fs-b">
                    <div class="c-form">
                      <ng-container *ngTemplateOutlet="typeDept" />
                      <!-- The console role given with the profile (client 2026-10-22). -->
                      @if (canRoles()) {
                        <div class="fld" [class.invalid]="err('role')">
                          <label class="fld-l" for="cp-sf-role-b"
                            >Console role<span class="req">*</span></label
                          >
                          <rp-dd
                            inputId="cp-sf-role"
                            [options]="roleOptions()"
                            [value]="p().role"
                            placeholder="Select"
                            (changed)="set('role', $event)"
                          />
                          <div class="fld-h" id="cp-sf-role-h">
                            What they can open when they sign in to the console. Change it later
                            under Console access, in the member's Account tab.
                          </div>
                          <div class="fld-e" role="alert">
                            <rp-icon name="alertc" [size]="14" /><span>{{ err('role') }}</span>
                          </div>
                        </div>
                      }
                      <ng-container
                        *ngTemplateOutlet="
                          text;
                          context: { k: 'first', l: 'First name', req: true }
                        "
                      />
                      <ng-container
                        *ngTemplateOutlet="text; context: { k: 'last', l: 'Last name', req: false }"
                      />
                      <div class="fld" [class.invalid]="err('gender')">
                        <label class="fld-l" for="cp-sf-gender-b"
                          >Gender<span class="req">*</span></label
                        >
                        <rp-dd
                          inputId="cp-sf-gender"
                          [options]="genders"
                          [value]="p().gender"
                          placeholder="Select"
                          (changed)="set('gender', $event)"
                        />
                        <div class="fld-e" role="alert">
                          <rp-icon name="alertc" [size]="14" /><span>{{ err('gender') }}</span>
                        </div>
                      </div>
                      <ng-container
                        *ngTemplateOutlet="
                          text;
                          context: { k: 'dob', l: 'Date of birth', req: true, type: 'date' }
                        "
                      />
                      <div class="fld" [class.invalid]="err('mobile')">
                        <label class="fld-l" for="cp-sf-mob"
                          >Mobile<span class="req">*</span></label
                        >
                        <div class="fld-in">
                          <span class="pre">+91</span>
                          <input
                            id="cp-sf-mob"
                            inputmode="numeric"
                            maxlength="10"
                            [value]="mobile()"
                            (input)="setMobile($event)"
                          />
                        </div>
                        <div class="fld-h">Refused if already registered as staff here</div>
                        <div class="fld-e" role="alert">
                          <rp-icon name="alertc" [size]="14" /><span>{{ err('mobile') }}</span>
                        </div>
                      </div>
                      <ng-container
                        *ngTemplateOutlet="
                          text;
                          context: { k: 'email', l: 'Work e-mail', req: true, type: 'email' }
                        "
                      />
                      <ng-container
                        *ngTemplateOutlet="
                          text;
                          context: { k: 'joined', l: 'Date of joining', req: true, type: 'date' }
                        "
                      />
                      <ng-container
                        *ngTemplateOutlet="
                          text;
                          context: {
                            k: 'emp',
                            l: 'Employee ID',
                            req: false,
                            hint: 'Generated (EMP…) when left blank',
                          }
                        "
                      />
                    </div>
                  </div>
                </div>
                <ng-container *ngTemplateOutlet="customFields" />
                <div class="row end g8">
                  <button type="button" class="btn btn-sec" (click)="template('staff')">
                    <rp-icon name="download" [size]="17" /><span>Staff template</span>
                  </button>
                  <button
                    type="button"
                    class="btn btn-pri"
                    [class.is-busy]="busy()"
                    [disabled]="!!why()"
                    (click)="createStaff()"
                  >
                    <rp-icon name="check" [size]="17" /><span>Onboard staff member</span>
                  </button>
                </div>
              </div>
              <div class="stack g16">
                @if (staffDone(); as d) {
                  <rp-card title="Onboarded" icon="checkc">
                    <div class="stack g12">
                      <div class="row g12">
                        <rp-av [name]="d.name" size="lg" />
                        <div>
                          <b>{{ d.name }}</b>
                          <div class="t-sm t-muted">{{ d.type }}</div>
                        </div>
                      </div>
                      <dl class="kv">
                        <dt>Employee ID</dt>
                        <dd class="t-mono">{{ d.employeeNo }}</dd>
                        <dt>Member ID</dt>
                        <dd class="t-mono">{{ d.memberNo }}</dd>
                        <dt>Account</dt>
                        <dd>{{ d.note }}</dd>
                        <dt>Console role</dt>
                        <dd id="cp-sf-done-role">{{ d.role ?? 'None' }}</dd>
                      </dl>
                      <button type="button" class="btn btn-sec btn-sm" (click)="openMember(d.id)">
                        <span>Open member</span>
                      </button>
                    </div>
                  </rp-card>
                }
                <rp-card title="How staff onboarding differs" icon="info">
                  <div class="list plain">
                    <div class="li">
                      <span class="li-ic sm"><rp-icon name="hash" [size]="16" /></span
                      ><span class="li-main"
                        ><span class="li-t wrap">A unique employee ID is generated</span
                        ><span class="li-s wrap"
                          >EMP followed by a number, unless you give one</span
                        ></span
                      >
                    </div>
                    <div class="li">
                      <span class="li-ic sm"><rp-icon name="key" [size]="16" /></span
                      ><span class="li-main"
                        ><span class="li-t wrap">A CampusOne account is provisioned</span
                        ><span class="li-s wrap"
                          >When none exists, a temporary password is e-mailed to the work address
                          and changed at first sign-in</span
                        ></span
                      >
                    </div>
                    <div class="li">
                      <span class="li-ic sm"><rp-icon name="key" [size]="16" /></span
                      ><span class="li-main"
                        ><span class="li-t wrap">The console role is given with the profile</span
                        ><span class="li-s wrap"
                          >It opens their menus at sign-in. Choose No console role for staff who
                          don't use the console</span
                        ></span
                      >
                    </div>
                    <div class="li">
                      <span class="li-ic sm"><rp-icon name="shieldx" [size]="16" /></span
                      ><span class="li-main"
                        ><span class="li-t wrap">Some numbers are refused</span
                        ><span class="li-s wrap"
                          >Numbers already registered as staff here, or used by a member of another
                          institution</span
                        ></span
                      >
                    </div>
                  </div>
                </rp-card>
                @if (!why()) {
                  <rp-card title="Many staff at once" icon="sheet">
                    <p class="t-sm t-muted" id="cp-bu-roles" style="margin: 0 0 12px">
                      @if (canRoles()) {
                        Write each person's console role in the template's Role column —
                        @if (sheetRoles()) {
                          {{ sheetRoles() }} —
                        }
                        or None for staff who don't use the console. The role is given as they are
                        onboarded.
                      } @else {
                        Write None in the template's Role column: your role can't give console
                        roles, so the administrator gives them after onboarding.
                      }
                    </p>
                    <ng-container *ngTemplateOutlet="upload; context: { kind: 'STAFF' }" />
                  </rp-card>
                }
              </div>
            </div>
          }
        }
        @case ('Update') {
          <div class="card pad">
            <rp-empty
              icon="refresh"
              title="Bulk profile update"
              text="Updating many profiles from a sheet arrives next. Meanwhile, edit a member from Members."
            />
          </div>
        }
      }
    </div>

    <ng-template #stepper let-i>
      <div class="stack g6">
        <div class="steps">
          @for (n of [0, 1, 2]; track n) {
            <span class="st" [class.done]="n < i" [class.on]="n === i"></span>
          }
        </div>
        <div class="cp-steps-l">
          <span [class.on]="i >= 0">1 · Check mobile</span
          ><span [class.on]="i >= 1">2 · Details</span><span [class.on]="i >= 2">3 · Done</span>
        </div>
      </div>
    </ng-template>

    <ng-template #membership>
      <div class="fs">
        <h4>Membership</h4>
        <div class="fs-b">
          <div class="c-form c3">
            <ng-container *ngTemplateOutlet="typeDept" />
            @if (tab() === 'Single') {
              <ng-container
                *ngTemplateOutlet="
                  text;
                  context: { k: 'joined', l: 'Date of joining', req: false, type: 'date' }
                "
              />
            }
          </div>
        </div>
      </div>
    </ng-template>

    <ng-template #typeDept>
      <div class="fld" [class.invalid]="err('ut')">
        <label class="fld-l" for="cp-ob-ut-b">User type<span class="req">*</span></label>
        <rp-dd
          inputId="cp-ob-ut"
          [options]="typeOptions()"
          [value]="p().ut"
          placeholder="Select"
          (changed)="setType($event)"
        />
        <div class="fld-e" role="alert">
          <rp-icon name="alertc" [size]="14" /><span>{{ err('ut') }}</span>
        </div>
        <!-- Students only here; every other role is staff onboarding (client 2026-10-19). -->
        @if (tab() === 'Single') {
          <div class="fld-h" id="cp-ob-students-only">
            Only students are onboarded here. Staff, teachers and other roles are onboarded on the
            Staff tab; parents are added with their child.
            <button type="button" class="linkbtn" id="cp-ob-to-staff" (click)="tab.set('Staff')">
              Onboard staff
            </button>
          </div>
        }
        <!-- Why Merchant isn't listed, and where it is (client 2026-10-14). -->
        @if (tab() === 'Staff') {
          <div class="fld-h" id="cp-ob-merchant">
            Merchants aren't staff: register them in Merchants &amp; QR, with their shop and
            settlement account.
            @if (canMerchants()) {
              <button type="button" class="linkbtn" id="cp-ob-merchant-go" (click)="toMerchants()">
                Register a merchant
              </button>
            }
          </div>
        }
      </div>
      <div class="fld" [class.invalid]="err('dept')">
        <label class="fld-l" for="cp-ob-dept-b">Department<span class="req">*</span></label>
        <rp-dd
          inputId="cp-ob-dept"
          [options]="deptOptions()"
          [value]="p().dept"
          placeholder="Select"
          (changed)="set('dept', $event)"
        />
        <div class="fld-e" role="alert">
          <rp-icon name="alertc" [size]="14" /><span>{{ err('dept') }}</span>
        </div>
      </div>
    </ng-template>

    <ng-template
      #text
      let-k="k"
      let-l="l"
      let-req="req"
      let-type="type"
      let-ph="ph"
      let-hint="hint"
      let-lock="lock"
    >
      <div class="fld" [class.invalid]="err(k)">
        <label class="fld-l" [for]="'cp-ob-' + k"
          >{{ l }}
          @if (req) {
            <span class="req">*</span>
          } @else {
            <span class="opt">(optional)</span>
          }
        </label>
        <div class="fld-in">
          <input
            [id]="'cp-ob-' + k"
            [type]="type || 'text'"
            [placeholder]="ph || ''"
            [readOnly]="!!lock"
            [value]="field(k)"
            (input)="setText(k, $event)"
          />
        </div>
        @if (hint) {
          <div class="fld-h">{{ hint }}</div>
        }
        <div class="fld-e" role="alert">
          <rp-icon name="alertc" [size]="14" /><span>{{ err(k) }}</span>
        </div>
      </div>
    </ng-template>

    <ng-template #customFields>
      @if (fields().length) {
        <div class="fs cm-cf">
          <h4><rp-icon name="field" [size]="16" /> Institution fields</h4>
          <div class="fs-b">
            <div class="c-form">
              @for (f of fields(); track f.id) {
                <div
                  class="fld"
                  [class.invalid]="err('customFields.' + f.id)"
                  [class.full]="f.type === 'LONG_TEXT' || f.type === 'MULTI_SELECT'"
                >
                  <label class="fld-l" [for]="'cf-' + f.id"
                    >{{ f.label }}
                    @if (f.required) {
                      <span class="req">*</span>
                    } @else {
                      <span class="opt">(optional)</span>
                    }
                  </label>
                  @if (f.type === 'DROPDOWN' || f.type === 'YES_NO') {
                    <rp-dd
                      [inputId]="'cf-' + f.id"
                      [options]="cfOptions(f)"
                      [value]="cfText(f.id)"
                      placeholder="Select"
                      (changed)="setCf(f.id, $event)"
                    />
                  } @else if (f.type === 'MULTI_SELECT') {
                    <div class="row g8 wrap">
                      @for (o of f.options; track o) {
                        <label class="chk"
                          ><input
                            type="checkbox"
                            [checked]="multiHas(f.id, o)"
                            (change)="toggleMulti(f.id, o)"
                          /><span>{{ o }}</span></label
                        >
                      }
                    </div>
                  } @else {
                    <div class="fld-in">
                      <input
                        [id]="'cf-' + f.id"
                        [type]="inputType(f.type)"
                        [value]="cfText(f.id)"
                        (input)="setCfInput(f.id, $event, f.type)"
                      />
                    </div>
                  }
                  <div class="fld-e" role="alert">
                    <rp-icon name="alertc" [size]="14" /><span>{{
                      err('customFields.' + f.id)
                    }}</span>
                  </div>
                </div>
              }
            </div>
          </div>
        </div>
      }
    </ng-template>

    <ng-template #upload let-kind="kind">
      <div class="fld" [class.invalid]="err('file')">
        <span class="fld-l">Spreadsheet</span>
        <label class="upl" [for]="'cp-bu-file-' + kind"
          ><span class="upl-ic"><rp-icon name="upload" [size]="20" /></span
          ><span class="grow" style="min-width: 0"
            ><span class="t-h4 t-clip" style="display: block">Choose the filled-in template</span
            ><span class="t-xs t-muted">CSV · up to 2 MB</span></span
          ><input
            type="file"
            [id]="'cp-bu-file-' + kind"
            accept=".csv,text/csv"
            (change)="pick(kind, $event)"
        /></label>
        <div class="fld-e" role="alert">
          <rp-icon name="alertc" [size]="14" /><span>{{ err('file') }}</span>
        </div>
      </div>
    </ng-template>

    <ng-template #reportView>
      @if (report(); as r) {
        <div class="stack g16">
          <div class="card pad row g16 wrap">
            <span class="cp-file"><rp-icon name="sheet" [size]="20" /></span>
            <div class="grow">
              <b>{{ r.fileName }}</b>
              <div class="t-xs t-muted">
                {{ r.total }} rows · {{ r.kind === 'STAFF' ? 'staff' : 'members' }}
              </div>
            </div>
            <div class="row g16">
              <div class="cp-mini">
                <b>{{ r.accepted }}</b
                ><span>accepted</span>
              </div>
              <div class="cp-mini bad">
                <b>{{ r.rejected }}</b
                ><span>rejected</span>
              </div>
              @if (r.committed) {
                <div class="cp-mini ok">
                  <b>{{ r.committed }}</b
                  ><span>created</span>
                </div>
              }
            </div>
          </div>
          @if (r.status === 'COMMITTED') {
            <div class="note tone-ok">
              <rp-icon name="checkc" [size]="17" />
              <div class="grow">
                <b>{{ r.committed }} {{ r.kind === 'STAFF' ? 'staff' : 'members' }} created.</b>
                @if (r.kind === 'STAFF') {
                  Each has the console role written in their row; new staff accounts were e-mailed a
                  temporary password.
                } @else {
                  Parents are linked by mobile.
                }
              </div>
            </div>
          } @else if (r.accepted) {
            <div class="note tone-info">
              <rp-icon name="info" [size]="17" />
              <div class="grow">
                Nothing is created until you confirm. Rejected rows are skipped — fix them in the
                file and upload them again.
              </div>
            </div>
          }
          <div class="tbl-wrap">
            <table class="tbl">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Name</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                @for (x of r.rows; track x.row) {
                  <tr [class.cp-bad]="!x.accepted">
                    <td>
                      <span class="t-mono t-muted">{{ x.row }}</span>
                    </td>
                    <td>
                      <b>{{ x.name }}</b>
                    </td>
                    <td>
                      @if (x.accepted) {
                        <span
                          class="chip dot"
                          [class]="'chip dot tone-' + (r.status === 'COMMITTED' ? 'ok' : 'brand')"
                          >{{ r.status === 'COMMITTED' ? 'Created' : 'Accepted' }}</span
                        >
                      } @else {
                        <div class="cp-rej">
                          <span class="chip dot tone-bad">Rejected</span>
                          @for (e of x.errors; track $index) {
                            <span>{{ e.column }}: {{ e.message }}</span>
                          }
                        </div>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="row end g8 wrap">
            <button type="button" class="btn btn-ghost" (click)="report.set(null)">
              <span>Start over</span>
            </button>
            @if (r.status !== 'COMMITTED' && r.accepted) {
              <button
                type="button"
                class="btn btn-pri"
                [class.is-busy]="busy()"
                [disabled]="!!why()"
                (click)="commit(r)"
              >
                <rp-icon name="check" [size]="17" /><span
                  >Create {{ r.accepted }}
                  {{ r.kind === 'STAFF' ? 'staff' : r.accepted === 1 ? 'member' : 'members' }}</span
                >
              </button>
            }
          </div>
        </div>
      }
    </ng-template>
    @if (passwords(); as list) {
      <rp-staff-passwords-panel [items]="list" (closed)="passwords.set(null)" />
    }
  `,
})
export class ConsoleOnboard {
  private readonly api = inject(MembersApi);
  private readonly setup = inject(InstitutionSetupApi);
  private readonly access = inject(StaffAccountsApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly tabs: readonly {
    v: Tab;
    l: string;
    icon: 'userplus' | 'sheet' | 'briefcase' | 'refresh';
  }[] = [
    { v: 'Single', l: 'Single member', icon: 'userplus' },
    { v: 'Staff', l: 'Staff', icon: 'briefcase' },
    { v: 'Update', l: 'Bulk profile update', icon: 'refresh' },
  ];
  protected readonly genders: DropdownOption[] = [
    { v: 'MALE', l: 'Male' },
    { v: 'FEMALE', l: 'Female' },
    { v: 'OTHER', l: 'Other' },
  ];
  protected readonly relations: DropdownOption[] = [
    { v: 'MOTHER', l: 'Mother' },
    { v: 'FATHER', l: 'Father' },
    { v: 'GUARDIAN', l: 'Guardian' },
  ];

  private readonly today = istBusinessDate();
  protected readonly tab = signal<Tab>('Single');
  protected readonly step = signal<Step>('check');
  protected readonly mobile = signal('');
  protected readonly chk = signal<Eligibility | null>(null);
  protected readonly p = signal<Person>(blank(this.today));
  protected readonly cf = signal<Record<string, string | string[]>>({});
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);
  protected readonly types = signal<readonly UserType[]>([]);
  protected readonly classes = signal<readonly ClassView[]>([]);
  protected readonly year = signal<{ id: string; label: string } | null>(null);
  protected readonly allFields = signal<readonly CustomField[]>([]);
  protected readonly created = signal<{
    id: string;
    name: string;
    detail: string;
    memberNo: string;
    adm: string | null;
    account: string;
  } | null>(null);
  protected readonly staffDone = signal<{
    id: string;
    name: string;
    type: string;
    employeeNo: string;
    memberNo: string;
    note: string;
    role: string | null;
  } | null>(null);
  /** The institution's console roles (IDN-062), when this role may give them. */
  protected readonly roles = signal<readonly ConsoleRole[]>([]);
  protected readonly report = signal<UploadReport | null>(null);
  /** New staff passwords, shown once (client 2026-10-07: e-mail not integrated yet). */
  protected readonly passwords = signal<readonly ShownStaffPassword[] | null>(null);

  protected readonly why = computed(() => {
    const s = this.session();
    if (!s) return '';
    if (s.roles.some((r) => r.readOnly)) {
      return 'Management has read-only access. The administrator makes changes here.';
    }
    return s.subTasks.includes('members.onboard') ? '' : "Your role doesn't include this task.";
  });
  /** Giving a console role at onboarding is the access page's sub-task too (client 2026-10-22). */
  protected readonly canRoles = computed(
    () => this.session()?.subTasks.includes('members.roles') ?? false,
  );
  /** The roles staff can be given: not the administrator's (CampusOne's), not a merchant's. */
  private readonly staffRoles = computed(() =>
    this.roles().filter(
      (r) => r.assignable && r.code !== 'MERCHANT' && r.code !== 'VENDOR_MERCHANT',
    ),
  );
  /** No console role, and the roles that fit the chosen user type (the Principal role …). */
  protected readonly roleOptions = computed<DropdownOption[]>(() => [
    { v: NO_ROLE, l: 'No console role', sub: "Doesn't sign in to the console" },
    ...this.staffRoles()
      .filter((r) => roleFits(r, { category: this.type()?.category ?? '', merchantType: null }))
      .map((r) => ({ v: r.id, l: r.name, ...(r.description ? { sub: r.description } : {}) })),
  ]);
  /** The role names a sheet's Role column takes. */
  protected readonly sheetRoles = computed(() =>
    this.staffRoles()
      .map((r) => r.name)
      .join(', '),
  );
  /** Merchants & QR is open to this role (a merchant is registered there, not as staff). */
  protected readonly canMerchants = computed(
    () => this.session()?.subTasks.includes('task.merchants') ?? false,
  );
  protected toMerchants() {
    void this.router.navigate(['/console/merchants'], { queryParams: { register: 1 } });
  }
  protected readonly ownMobile = {
    label: "Student's own mobile",
    hint: "Leave blank for a child without a phone — the profile sits under the parent's mobile.",
  };
  protected readonly yearLabel = computed(() => this.year()?.label ?? 'this year');
  protected readonly fields = computed(() =>
    this.allFields().filter((f) => f.entity === 'MEMBER' && f.status === 'ACTIVE'),
  );
  protected readonly typeOptions = computed<DropdownOption[]>(() =>
    this.types()
      .filter((t) => t.status === 'ACTIVE')
      // Single onboarding is for students; every other role is staff onboarding (client
      // 2026-10-19), parents come with their child.
      .filter((t) =>
        this.tab() === 'Staff' ? STAFF.includes(t.category) : t.category === 'STUDENT',
      )
      .map((t) => ({ v: t.id, l: t.name })),
  );
  protected readonly type = computed(() => this.types().find((t) => t.id === this.p().ut));
  protected readonly isStudent = computed(() => this.type()?.category === 'STUDENT');
  /** Client 2026-10-16: a parent's e-mail is required (fee, absence and other e-mails reach them). */
  protected readonly isParent = computed(() => this.type()?.category === 'PARENT');
  protected readonly deptOptions = computed<DropdownOption[]>(() =>
    (this.type()?.departments ?? []).map((d) => ({ v: d.id, l: d.name })),
  );
  protected readonly gradeOptions = computed<DropdownOption[]>(() =>
    this.classes().map((c) => ({ v: c.id, l: c.name })),
  );
  protected readonly sectionOptions = computed<DropdownOption[]>(() =>
    (this.classes().find((c) => c.id === this.p().cls)?.sections ?? []).map((s) => ({
      v: s.id,
      l: `Section ${s.name}`,
    })),
  );
  protected readonly existingParent = computed(
    () => this.chk()?.profiles.find((x) => x.category === 'PARENT') ?? null,
  );

  constructor() {
    const t = this.route.snapshot.queryParamMap.get('tab') as Tab | null;
    if (t && this.tabs.some((x) => x.v === t)) this.tab.set(t);
    void this.load();
  }

  private async load() {
    try {
      const [types, classes, fields] = await Promise.all([
        this.setup.userTypes(),
        this.api.classes(),
        this.setup.fields(),
      ]);
      this.types.set(types.items);
      this.classes.set(classes.items);
      this.year.set(classes.year);
      this.allFields.set(fields.items);
    } catch (e) {
      this.overlays.toast("Couldn't load the onboarding lists", {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    }
    if (this.canRoles()) {
      try {
        this.roles.set((await this.access.roles()).items);
      } catch (e) {
        this.overlays.toast("Couldn't load the console roles", {
          sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
          tone: 'bad',
        });
      }
    }
  }

  // --- helpers ----------------------------------------------------------------------------------------
  protected err(k: string) {
    return this.errors()[k] ?? '';
  }
  protected fmtMobile(m: string) {
    return m ? formatMobile(m) : '';
  }
  protected field(k: string) {
    return (this.p() as unknown as Record<string, string>)[k] ?? '';
  }
  protected set(k: keyof Person, v: string) {
    this.p.set({ ...this.p(), [k]: v });
    if (this.errors()[k]) this.errors.set({ ...this.errors(), [k]: '' });
  }
  protected setText(k: string, e: Event) {
    this.set(k as keyof Person, (e.target as HTMLInputElement).value);
  }
  protected setType(v: string) {
    const t = this.types().find((x) => x.id === v);
    // A role that doesn't fit the new type (the Principal role …) is chosen again.
    const role = this.p().role;
    const fits =
      role === NO_ROLE ||
      this.staffRoles().some(
        (r) => r.id === role && roleFits(r, { category: t?.category ?? '', merchantType: null }),
      );
    this.p.set({
      ...this.p(),
      ut: v,
      dept: t?.departments[0]?.id ?? '',
      role: fits ? role : '',
    });
  }
  protected setGrade(v: string) {
    this.p.set({ ...this.p(), cls: v, sec: '' });
  }
  protected setMobile(e: Event) {
    const v = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 10);
    (e.target as HTMLInputElement).value = v;
    this.mobile.set(v);
    this.chk.set(null);
    this.errors.set({ ...this.errors(), mobile: '' });
  }
  protected cfOptions(f: CustomField): DropdownOption[] {
    const opts = f.type === 'YES_NO' ? ['Yes', 'No'] : f.options;
    return opts.map((o) => ({ v: o, l: o }));
  }
  protected cfText(id: string) {
    const v = this.cf()[id];
    return Array.isArray(v) ? v.join(', ') : (v ?? '');
  }
  protected setCf(id: string, v: string) {
    this.cf.set({ ...this.cf(), [id]: v });
    this.errors.set({ ...this.errors(), [`customFields.${id}`]: '' });
  }
  /** A phone number takes digits only, in the box too (client 2026-10-14). */
  protected setCfInput(id: string, e: Event, type: string) {
    const el = e.target as HTMLInputElement;
    this.setCf(id, type === 'PHONE' ? cleanTyped(el, onlyDigits) : el.value);
  }
  protected multiHas(id: string, o: string) {
    const v = this.cf()[id];
    return Array.isArray(v) && v.includes(o);
  }
  protected toggleMulti(id: string, o: string) {
    const v = this.cf()[id];
    const list = Array.isArray(v) ? v : [];
    this.cf.set({
      ...this.cf(),
      [id]: list.includes(o) ? list.filter((x) => x !== o) : [...list, o],
    });
  }
  protected inputType(t: string) {
    return t === 'NUMBER'
      ? 'number'
      : t === 'DATE'
        ? 'date'
        : t === 'EMAIL'
          ? 'email'
          : t === 'PHONE'
            ? 'tel'
            : 'text';
  }
  private customValues() {
    const out: Record<string, unknown> = {};
    for (const f of this.fields()) {
      const v = this.cf()[f.id];
      if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
      out[f.id] = f.type === 'YES_NO' ? v === 'Yes' : v;
    }
    return out;
  }
  private apiErrors(e: unknown) {
    if (e instanceof ApiProblem && e.errors.length) {
      const map: Record<string, string> = {
        firstName: 'first',
        lastName: 'last',
        dateOfBirth: 'dob',
        admissionNo: 'adm',
        sectionId: 'sec',
        departmentId: 'dept',
        userTypeId: 'ut',
        joinedOn: 'joined',
        employeeNo: 'emp',
        roleId: 'role',
        'guardians.0.mobile': 'mobile',
        mobile: this.tab() === 'Single' && this.isStudent() ? 'own' : 'mobile',
      };
      this.errors.set(
        Object.fromEntries(e.errors.map((x) => [map[x.field] ?? x.field, x.message])),
      );
      return true;
    }
    this.overlays.toast('Not onboarded', {
      sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
      tone: 'bad',
    });
    return false;
  }

  // --- single member ------------------------------------------------------------------------------------
  protected async check() {
    if (!MOBILE.test(this.mobile())) {
      this.errors.set({ mobile: translate('VALIDATION.MOBILE') });
      return;
    }
    this.busy.set(true);
    try {
      this.chk.set(await this.api.eligibility(this.mobile()));
    } catch (e) {
      this.apiErrors(e);
    } finally {
      this.busy.set(false);
    }
  }
  protected checkText(c: Eligibility) {
    if (!c.eligible) return translate(c.code);
    if (c.profiles.length) {
      return `Already here: ${c.profiles.map((x) => `${x.name} (${x.userType})`).join(', ')}. A new profile will be created on the same number.`;
    }
    // A mobile at another institution is welcome too (client 2026-10-27).
    if (c.elsewhere) return 'Already on CampusOne — they keep one login for both institutions.';
    return c.account
      ? 'This number has a CampusOne account. The new profile links to it.'
      : 'This number is new to CampusOne. The profile links when the number signs up.';
  }
  protected chkLine() {
    const c = this.chk();
    if (!c) return '';
    if (c.profiles.length) return `Another profile on this number · ${c.profiles[0]!.name}`;
    return c.account ? 'Existing CampusOne account' : 'New CampusOne account';
  }
  /** IDN-090: who a mobile belongs to at the school (client 2026-10-22). */
  protected readonly lookup = (mobile: string) => this.api.familyLookup(mobile);
  /** The family or staff member found on the checked mobile, chosen to fill the form. */
  private readonly found = signal<FamilyLookup | null>(null);

  /** "Fill in": the form, with the parent here — or the staff member as the primary contact. */
  protected useFound(r: FamilyLookup) {
    this.found.set(r);
    this.toForm();
  }

  protected toForm() {
    const ep = this.existingParent();
    const found = this.found();
    // A teacher or other staff member who is the child's parent (client 2026-10-22).
    const st = found?.mobile === this.mobile() ? found.staff : null;
    const student = this.types().find((t) => t.category === 'STUDENT' && t.status === 'ACTIVE');
    this.p.set({
      ...blank(this.today),
      ut: student?.id ?? '',
      dept: student?.departments[0]?.id ?? '',
      pcn: ep?.name ?? st?.name ?? '',
      pce: ep ? '' : (st?.email ?? ''),
      rel: st?.relation ?? '',
    });
    this.cf.set({});
    this.errors.set({});
    this.step.set('form');
  }
  private validatePerson(staff: boolean) {
    const p = this.p();
    const e: Record<string, string> = {};
    const req = translate('VALIDATION.REQUIRED');
    if (!p.ut) e['ut'] = req;
    if (!p.dept && (staff || this.deptOptions().length)) e['dept'] = req;
    if (!p.first.trim()) e['first'] = req;
    else if (!NAME.test(p.first.trim())) e['first'] = translate('VALIDATION.FORMAT');
    if (p.last.trim() && !NAME.test(p.last.trim())) e['last'] = translate('VALIDATION.FORMAT');
    if (!p.gender) e['gender'] = req;
    if ((staff || this.isStudent()) && !p.dob) e['dob'] = req;
    if (p.dob && p.dob >= this.today) e['dob'] = translate('IDN.DOB_IN_FUTURE');
    if (p.email.trim() && !isEmail(p.email)) e['email'] = translate('VALIDATION.EMAIL');
    if (!staff && this.isParent() && !p.email.trim()) e['email'] = req;
    if (staff) {
      if (!MOBILE.test(this.mobile())) e['mobile'] = translate('VALIDATION.MOBILE');
      if (!p.email.trim()) e['email'] = req;
      if (!p.joined) e['joined'] = req;
      // A role, or No console role: chosen, never left to chance (client 2026-10-22).
      if (this.canRoles() && !p.role) e['role'] = 'Choose a console role, or No console role';
    }
    for (const f of this.fields()) {
      const v = this.cf()[f.id];
      if (f.required && (v === undefined || v === '' || (Array.isArray(v) && !v.length))) {
        e[`customFields.${f.id}`] = `Enter ${f.label.toLowerCase()}`;
      }
    }
    return e;
  }
  protected async create() {
    const p = this.p();
    const e = this.validatePerson(false);
    if (this.isStudent()) {
      const req = translate('VALIDATION.REQUIRED');
      if (!p.adm.trim()) e['adm'] = translate('IDN.ADMISSION_NO_REQUIRED');
      if (!p.cls) e['cls'] = req;
      if (!p.sec) e['sec'] = req;
      if (p.own && !MOBILE.test(p.own)) e['own'] = translate('VALIDATION.MOBILE');
      if (!this.existingParent()) {
        if (!p.pcn.trim()) e['pcn'] = req;
        else if (!NAME.test(p.pcn.trim())) e['pcn'] = translate('VALIDATION.FORMAT');
        if (!p.pce.trim()) e['pce'] = req;
        else if (!isEmail(p.pce)) e['pce'] = translate('VALIDATION.EMAIL');
      }
      if (!p.rel) e['rel'] = req;
    }
    if (Object.keys(e).length) {
      this.errors.set(e);
      return;
    }
    const ep = this.existingParent();
    const [pFirst, ...pRest] = p.pcn.trim().split(/\s+/);
    const body: Record<string, unknown> = {
      userTypeId: p.ut,
      departmentId: p.dept || null,
      firstName: p.first.trim(),
      lastName: p.last.trim() || null,
      gender: p.gender,
      dateOfBirth: p.dob || null,
      joinedOn: p.joined || null,
      customFields: this.customValues(),
    };
    if (this.isStudent()) {
      body['admissionNo'] = p.adm.trim();
      body['sectionId'] = p.sec;
      body['mobile'] = p.own || null;
      body['guardians'] = [
        ep
          ? { memberId: ep.id, relation: p.rel }
          : {
              firstName: pFirst,
              lastName: pRest.join(' ') || null,
              mobile: this.mobile(),
              email: p.pce.trim(),
              relation: p.rel,
            },
      ];
    } else {
      body['mobile'] = this.mobile();
      body['email'] = p.email.trim() || null;
    }
    this.busy.set(true);
    try {
      const r = await this.api.onboard(body);
      const t = this.type();
      const grade = this.classes().find((c) => c.id === p.cls);
      const sec = grade?.sections.find((s) => s.id === p.sec);
      this.created.set({
        id: r.id,
        name: `${p.first.trim()} ${p.last.trim()}`.trim(),
        detail: this.isStudent() && grade && sec ? `${grade.name} ${sec.name}` : (t?.name ?? ''),
        memberNo: r.memberNo,
        adm: this.isStudent() ? p.adm.trim() : null,
        account: this.chk()?.account
          ? 'Linked to the existing CampusOne account'
          : 'Links when the mobile signs up for CampusOne',
      });
      this.step.set('done');
      this.overlays.toast(`${p.first.trim()} is onboarded`, { sub: r.memberNo });
    } catch (err) {
      this.apiErrors(err);
    } finally {
      this.busy.set(false);
    }
  }
  protected again() {
    this.mobile.set('');
    this.chk.set(null);
    this.created.set(null);
    this.p.set(blank(this.today));
    this.cf.set({});
    this.step.set('check');
  }
  protected openMember(id: string) {
    void this.router.navigate(['/console/members'], { queryParams: { open: id } });
  }

  // --- staff -------------------------------------------------------------------------------------------
  protected async createStaff() {
    const e = this.validatePerson(true);
    if (Object.keys(e).length) {
      this.errors.set(e);
      return;
    }
    const p = this.p();
    this.busy.set(true);
    try {
      const r = await this.api.staff({
        userTypeId: p.ut,
        departmentId: p.dept,
        firstName: p.first.trim(),
        lastName: p.last.trim() || null,
        gender: p.gender,
        dateOfBirth: p.dob,
        mobile: this.mobile(),
        email: p.email.trim(),
        joinedOn: p.joined,
        employeeNo: p.emp.trim() || null,
        customFields: this.customValues(),
        ...(this.canRoles() && p.role && p.role !== NO_ROLE ? { roleId: p.role } : {}),
      });
      const name = `${p.first.trim()} ${p.last.trim()}`.trim();
      const note = !r.newAccount
        ? 'Linked to the existing CampusOne account'
        : r.temporaryPassword
          ? 'Account provisioned — give them the temporary password shown'
          : `Account provisioned — a temporary password was e-mailed to ${p.email.trim()}`;
      if (r.temporaryPassword) {
        this.passwords.set([
          {
            name,
            email: p.email.trim().toLowerCase(),
            employeeNo: r.employeeNo,
            temporaryPassword: r.temporaryPassword,
          },
        ]);
      }
      this.staffDone.set({
        id: r.id,
        name,
        type: this.type()?.name ?? '',
        employeeNo: r.employeeNo,
        memberNo: r.memberNo,
        note,
        role: r.role ?? null,
      });
      this.overlays.toast(`${name} onboarded`, { sub: `${r.employeeNo} · ${note}` });
      // The next one is often alike: same type, department and role, all on show to change.
      const keep = { ut: p.ut, dept: p.dept, role: p.role };
      this.p.set({ ...blank(this.today), ...keep });
      this.mobile.set('');
      this.cf.set({});
    } catch (err) {
      this.apiErrors(err);
    } finally {
      this.busy.set(false);
    }
  }

  // --- sheets ----------------------------------------------------------------------------------------
  protected async template(kind: 'members' | 'staff') {
    try {
      await this.api.template(kind);
    } catch (e) {
      this.overlays.toast('Not downloaded', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    }
  }
  protected async pick(kind: 'MEMBERS' | 'STAFF', e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      this.errors.set({ file: translate('FILE.TOO_LARGE').replace('{limit}', '2 MB') });
      return;
    }
    this.busy.set(true);
    try {
      this.report.set(await this.api.upload(kind, file));
      this.errors.set({});
    } catch (err) {
      if (err instanceof ApiProblem) this.errors.set({ file: err.detail });
      else this.errors.set({ file: translate('GEN.UNAVAILABLE') });
    } finally {
      this.busy.set(false);
    }
  }
  protected async commit(r: UploadReport) {
    const ok = await this.overlays.confirm({
      title: `Create ${r.accepted} ${r.kind === 'STAFF' ? 'staff' : r.accepted === 1 ? 'member' : 'members'}?`,
      text: `Each gets a profile and is linked to a CampusOne account by mobile.${r.rejected ? ` ${r.rejected} rejected rows are skipped.` : ''}`,
      ok: `Create ${r.accepted}`,
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const out = await this.api.commit(r.id, r.rejected ? 'ACCEPTED' : 'ALL');
      this.report.set({ ...r, status: 'COMMITTED', committed: out.created });
      if (out.passwords?.length) this.passwords.set(out.passwords);
      this.overlays.toast(`${out.created} created`, {
        sub: out.skipped ? `${out.skipped} rejected rows skipped` : 'All rows onboarded',
      });
    } catch (err) {
      this.overlays.toast('Not created', {
        sub: err instanceof ApiProblem ? err.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    } finally {
      this.busy.set(false);
    }
  }
}
