import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Empty } from '../../../Shared/Blocks';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDate, formatMobile } from '../../../Utils/format';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import type { IdentityFix } from '../Applications/AppFields';
import { ApplicationSection } from '../Applications/ApplicationSection';
import {
  APP_STATUS,
  BOARD,
  CATEGORY,
  DOC_ACCEPT,
  DOC_MAX_BYTES,
  DOC_TYPE,
  GENDER,
  RELATION,
  SOURCE,
  addressText,
  appName,
  fileSize,
  idsText,
  person,
  workText,
} from '../Applications/app-format';
import {
  ApplicationsApi,
  type AppSource,
  type Application,
  type DocType,
  type RecordSection,
} from '../Applications/applications.api';
import type { CustomField } from '../Institution/institution.api';
import type { AdmissionRecord, AdmissionRelation, ClassView, MemberDetail } from './members.api';

/** A block of the record, in the order it is shown. */
type Block =
  | 'student'
  | 'parents'
  | 'addresses'
  | 'previous'
  | 'stay'
  | 'customFields'
  | 'references'
  | 'documents';
type Who = 'father' | 'mother' | 'guardian';

/** Where the form came from: the bulk upload is the members' (or existing students') sheet. */
const ORIGIN: Readonly<Record<AppSource, string>> = { ...SOURCE, IMPORT: 'Bulk upload' };
const WHO: readonly { k: Who; r: AdmissionRelation; l: string }[] = [
  { k: 'father', r: 'FATHER', l: 'Father' },
  { k: 'mother', r: 'MOTHER', l: 'Mother' },
  { k: 'guardian', r: 'GUARDIAN', l: 'Guardian' },
];
/** The student's own documents, in the order an upload suggests them. */
const STUDENT_DOCS: readonly DocType[] = ['PHOTO', 'BIRTH', 'ADDRESS', 'REPORT', 'TC'];
const CARDS = ['AADHAAR_FRONT', 'AADHAAR_BACK', 'PAN_FRONT', 'PAN_BACK'] as const;

interface PersonView {
  readonly k: Who | 'localGuardian';
  readonly l: string;
  readonly name: string;
  readonly relation: string;
  readonly mobile: string;
  readonly email: string;
  readonly work: string;
  readonly address: string;
  readonly ids: string;
  readonly primary: boolean;
  /** The drawer's member. */
  readonly self: boolean;
}

interface DocView {
  readonly type: DocType;
  readonly label: string;
  readonly name: string;
  readonly meta: string;
  readonly url: string | null;
  readonly image: boolean;
  /** One of the drawer's parent's own ID cards (listed first). */
  readonly own: boolean;
}

interface RecordView {
  readonly r: AdmissionRecord;
  readonly a: Application;
  readonly edit: boolean;
  /** Why nothing can be changed here ('' when it can). */
  readonly lockedWhy: string;
  readonly blocks: readonly Block[];
  readonly people: readonly PersonView[];
  readonly docs: readonly DocView[];
  readonly fields: readonly { id: string; label: string; value: string }[];
  readonly docOptions: readonly DropdownOption[];
  /** The type an upload is filed under unless another is picked. */
  readonly docKind: DocType;
}

/**
 * The member drawer's Admission tab: the admission forms the member is on — a student's own, a
 * parent's children's — from the public form, the counsellor's desk or the bulk upload, with what
 * the family gave and the documents they uploaded (ADM-014's view). For a parent, their own details
 * and ID cards come first and the child the form is for is named. The Institution Administrator
 * edits an admitted student's record section by section (the application's section editors, the
 * identity locked: CR-06) and uploads or replaces its documents (2 MB, PDF, JPG or PNG).
 */
@Component({
  selector: 'rp-member-admission',
  imports: [ApplicationSection, Dropdown, Empty, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  styles: `
    .ma-people {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 10px;
    }
    .ma-person {
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: var(--r-md);
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }
    .ma-person.ma-self {
      border-color: var(--brand-3);
      background: color-mix(in srgb, var(--brand-soft) 45%, transparent);
    }
    .ma-thumb {
      width: 44px;
      height: 44px;
      border-radius: 9px;
      overflow: hidden;
      flex: none;
      border: 1px solid var(--line);
      background: var(--surface-2);
      display: block;
    }
    .ma-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .ma-own {
      background: color-mix(in srgb, var(--brand-soft) 40%, transparent);
      border-radius: var(--r-sm);
    }
    .ma-rep {
      cursor: pointer;
    }
  `,
  template: `
    @if (error()) {
      <rp-empty icon="alertc" title="Couldn't load the admission details" [text]="error()">
        <button type="button" class="btn btn-sec btn-sm" (click)="retry.emit()">
          <span>Try again</span>
        </button>
      </rp-empty>
    } @else if (records() === null) {
      <rp-empty icon="hourglass" title="Loading…" />
    } @else {
      @for (v of views(); track v.a.id) {
        <div class="stack g16" [id]="'ma-' + v.a.id">
          <div class="fs" [id]="'ma-head-' + v.a.id">
            <h4>
              <rp-icon name="filetext" [size]="16" />Admission form
              <span class="t-mono t-sm" style="font-weight: 500">{{ v.a.applicationNo }}</span>
              <span style="margin-left: auto" class="row g6">
                <span class="tag">{{ origin(v.a) }}</span>
                <span [class]="'chip dot tone-' + statusTone(v.a)">{{ statusLabel(v.a) }}</span>
              </span>
            </h4>
            <div class="fs-b stack g12">
              @if (v.r.relation !== 'STUDENT') {
                <div class="note tone-info" [id]="'ma-for-' + v.a.id">
                  <rp-icon name="users" [size]="17" />
                  <div class="grow">
                    {{ member().name }} is the {{ relationWord(v.r.relation) }} on
                    <b>{{ v.r.student.name }}</b
                    >'s admission form.
                  </div>
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm note-a"
                    (click)="openMember.emit(v.r.student.id)"
                  >
                    <span>Open {{ v.r.student.name }}</span>
                  </button>
                </div>
              }
              <dl class="kv">
                <dt>Source</dt>
                <dd>{{ origin(v.a) }}</dd>
                <dt>Class and year</dt>
                <dd>{{ classText(v.a) }}</dd>
                @if (v.a.admissionNo) {
                  <dt>Admission number</dt>
                  <dd class="t-mono">{{ v.a.admissionNo }}</dd>
                }
                <dt>Submitted</dt>
                <dd>{{ v.a.submittedAt ? date(v.a.submittedAt) : '—' }}</dd>
                <dt>Admitted</dt>
                <dd>
                  {{ v.a.status === 'APPROVED' && v.a.decidedAt ? date(v.a.decidedAt) : '—' }}
                </dd>
              </dl>
              @if (v.lockedWhy) {
                <p class="t-xs t-muted"><rp-icon name="lock" [size]="12" /> {{ v.lockedWhy }}</p>
              }
            </div>
          </div>

          @for (b of v.blocks; track b) {
            @switch (b) {
              @case ('student') {
                <div class="fs" [id]="'ma-student-' + v.a.id">
                  <h4>
                    <rp-icon name="user" [size]="16" />Student
                    @if (v.edit) {
                      <span style="margin-left: auto"
                        ><button
                          type="button"
                          class="btn btn-ghost btn-xs"
                          [id]="'ma-edit-student-' + v.a.id"
                          (click)="edit(v.r, 'student')"
                        >
                          <rp-icon name="edit" [size]="15" /><span>Edit</span>
                        </button></span
                      >
                    }
                  </h4>
                  <div class="fs-b">
                    <dl class="kv">
                      <dt>Name</dt>
                      <dd>{{ name(v.a) }}</dd>
                      <dt>Gender</dt>
                      <dd>{{ v.a.student.gender ? gender(v.a.student.gender) : '—' }}</dd>
                      <dt>Date of birth</dt>
                      <dd>{{ v.a.student.dob ? date(v.a.student.dob) : '—' }}</dd>
                      <dt>Aadhaar</dt>
                      <dd class="t-mono">{{ v.a.student.aadhaar || '—' }}</dd>
                      <dt>PAN</dt>
                      <dd class="t-mono">{{ v.a.student.pan || '—' }}</dd>
                      <dt>Category</dt>
                      <dd>{{ v.a.student.category ? category(v.a.student.category) : '—' }}</dd>
                      <dt>Medium</dt>
                      <dd>{{ v.a.student.medium || '—' }}</dd>
                      <dt>Blood group</dt>
                      <dd>{{ blood(v.a.student.bloodGroup) }}</dd>
                      <dt>Food allergies</dt>
                      <dd>{{ v.a.student.allergies || '—' }}</dd>
                      <dt>Health</dt>
                      <dd>{{ v.a.student.health || '—' }}</dd>
                    </dl>
                  </div>
                </div>
              }
              @case ('parents') {
                <div class="fs" [id]="'ma-parents-' + v.a.id">
                  <h4>
                    <rp-icon name="users" [size]="16" />Parents and guardians
                    @if (v.edit && v.people.length) {
                      <span style="margin-left: auto"
                        ><button
                          type="button"
                          class="btn btn-ghost btn-xs"
                          [id]="'ma-edit-parents-' + v.a.id"
                          (click)="edit(v.r, 'parents')"
                        >
                          <rp-icon name="edit" [size]="15" /><span>Edit</span>
                        </button></span
                      >
                    }
                  </h4>
                  <div class="fs-b stack g12">
                    @if (v.people.length) {
                      <div class="ma-people">
                        @for (p of v.people; track p.k) {
                          <div class="ma-person" [class.ma-self]="p.self" [attr.data-who]="p.k">
                            <div class="row g6 wrap">
                              <b class="t-sm">{{ p.l }}</b>
                              @if (p.primary) {
                                <span class="chip tone-brand">Primary contact</span>
                              }
                              @if (p.self) {
                                <span class="chip tone-accent">This member</span>
                              }
                            </div>
                            <dl class="kv">
                              <dt>Name</dt>
                              <dd>{{ p.name || '—' }}</dd>
                              @if (p.k === 'guardian' || p.k === 'localGuardian') {
                                <dt>Relation</dt>
                                <dd>{{ p.relation || '—' }}</dd>
                              }
                              <dt>Mobile</dt>
                              <dd>{{ p.mobile || '—' }}</dd>
                              @if (p.k !== 'localGuardian') {
                                <dt>E-mail</dt>
                                <dd>{{ p.email || '—' }}</dd>
                              }
                              @if (p.k === 'father' || p.k === 'mother') {
                                <dt>Occupation · income</dt>
                                <dd>{{ p.work || '—' }}</dd>
                              }
                              @if (p.k === 'localGuardian') {
                                <dt>Address</dt>
                                <dd>{{ p.address || '—' }}</dd>
                              }
                              <dt>Aadhaar · PAN</dt>
                              <dd class="t-mono">{{ p.ids }}</dd>
                            </dl>
                          </div>
                        }
                      </div>
                    } @else {
                      <p class="t-sm t-muted">The form has no parents' details.</p>
                    }
                    <dl class="kv">
                      <dt>Children</dt>
                      <dd>{{ children(v.a) }}</dd>
                      <dt>Primary contact</dt>
                      <dd>{{ primary(v.a) }}</dd>
                    </dl>
                  </div>
                </div>
              }
              @case ('addresses') {
                <div class="fs" [id]="'ma-addresses-' + v.a.id">
                  <h4>
                    <rp-icon name="pin" [size]="16" />Addresses
                    @if (v.edit) {
                      <span style="margin-left: auto"
                        ><button
                          type="button"
                          class="btn btn-ghost btn-xs"
                          [id]="'ma-edit-addresses-' + v.a.id"
                          (click)="edit(v.r, 'addresses')"
                        >
                          <rp-icon name="edit" [size]="15" /><span>Edit</span>
                        </button></span
                      >
                    }
                  </h4>
                  <div class="fs-b">
                    @if (v.a.addresses; as ad) {
                      <dl class="kv">
                        <dt>Residential</dt>
                        <dd>{{ address(ad.residential) }}</dd>
                        <dt>Correspondence</dt>
                        <dd>
                          {{
                            ad.sameAsResidential || !ad.correspondence
                              ? 'Same as residential'
                              : address(ad.correspondence)
                          }}
                        </dd>
                      </dl>
                    } @else {
                      <p class="t-sm t-muted">Not given.</p>
                    }
                  </div>
                </div>
              }
              @case ('previous') {
                <div class="fs" [id]="'ma-previous-' + v.a.id">
                  <h4>
                    <rp-icon name="school" [size]="16" />Previous school
                    @if (v.edit) {
                      <span style="margin-left: auto"
                        ><button
                          type="button"
                          class="btn btn-ghost btn-xs"
                          [id]="'ma-edit-previous-' + v.a.id"
                          (click)="edit(v.r, 'previous')"
                        >
                          <rp-icon name="edit" [size]="15" /><span>Edit</span>
                        </button></span
                      >
                    }
                  </h4>
                  <div class="fs-b">
                    @if (v.a.previous && (v.a.previous.school || v.a.previous.lastClass)) {
                      <dl class="kv">
                        <dt>School</dt>
                        <dd>{{ v.a.previous.school || '—' }}</dd>
                        <dt>Last class</dt>
                        <dd>{{ v.a.previous.lastClass || '—' }}</dd>
                        <dt>Result</dt>
                        <dd>{{ v.a.previous.result || '—' }}</dd>
                        <dt>Board</dt>
                        <dd>{{ board(v.a) }}</dd>
                      </dl>
                    } @else {
                      <p class="t-sm t-muted">Not given.</p>
                    }
                  </div>
                </div>
              }
              @case ('stay') {
                <div class="fs" [id]="'ma-stay-' + v.a.id">
                  <h4><rp-icon name="bus" [size]="16" />Transport and hostel</h4>
                  <div class="fs-b">
                    <dl class="kv">
                      @if (transport(v.a); as t) {
                        <dt>School transport</dt>
                        <dd>{{ t }}</dd>
                      }
                      @if (hostel(v.a); as h) {
                        <dt>Hostel</dt>
                        <dd>{{ h }}</dd>
                      }
                    </dl>
                  </div>
                </div>
              }
              @case ('customFields') {
                <div class="fs" [id]="'ma-fields-' + v.a.id">
                  <h4>
                    <rp-icon name="field" [size]="16" />Institution fields
                    @if (v.edit && fields().length) {
                      <span style="margin-left: auto"
                        ><button
                          type="button"
                          class="btn btn-ghost btn-xs"
                          [id]="'ma-edit-customFields-' + v.a.id"
                          (click)="edit(v.r, 'customFields')"
                        >
                          <rp-icon name="edit" [size]="15" /><span>Edit</span>
                        </button></span
                      >
                    }
                  </h4>
                  <div class="fs-b">
                    <dl class="kv">
                      @for (f of v.fields; track f.id) {
                        <dt>{{ f.label }}</dt>
                        <dd>
                          @if (f.value) {
                            {{ f.value }}
                          } @else {
                            <span class="t-faint">—</span>
                          }
                        </dd>
                      }
                    </dl>
                  </div>
                </div>
              }
              @case ('references') {
                <div class="fs" [id]="'ma-refs-' + v.a.id">
                  <h4><rp-icon name="handshake" [size]="16" />References</h4>
                  <div class="fs-b">
                    @if (v.a.references.length) {
                      <div class="list plain">
                        @for (x of v.a.references; track x.id) {
                          <div class="li">
                            <span class="li-ic sm"><rp-icon name="user" [size]="16" /></span
                            ><span class="li-main"
                              ><span class="li-t">{{ named(x.name) }}</span
                              ><span class="li-s"
                                >{{ x.relation || 'Relation not given' }} · {{ phone(x.mobile)
                                }}{{ x.email ? ' · ' + x.email : '' }}</span
                              ></span
                            >
                          </div>
                        }
                      </div>
                    } @else {
                      <p class="t-sm t-muted">No references were given.</p>
                    }
                  </div>
                </div>
              }
              @case ('documents') {
                <div class="fs" [id]="'ma-docs-' + v.a.id">
                  <h4>
                    <rp-icon name="clip" [size]="16" />Documents
                    <span class="t-xs t-muted" style="font-weight: 500">{{ v.docs.length }}</span>
                  </h4>
                  <div class="fs-b stack g10">
                    @if (v.docs.length) {
                      <div class="list plain">
                        @for (d of v.docs; track d.type) {
                          <div class="li" [class.ma-own]="d.own" [attr.data-type]="d.type">
                            @if (d.image && d.url) {
                              <a
                                class="ma-thumb"
                                [href]="d.url"
                                target="_blank"
                                rel="noopener"
                                [attr.aria-label]="'Open ' + d.label"
                                ><img [src]="d.url" alt="" loading="lazy"
                              /></a>
                            } @else {
                              <span class="li-ic sm"
                                ><rp-icon [name]="d.image ? 'image' : 'file'" [size]="16"
                              /></span>
                            }
                            <span class="li-main"
                              ><span class="li-t">{{ d.label }}</span
                              ><span class="li-s">{{ d.name }} · {{ d.meta }}</span></span
                            >
                            <span class="li-r row g4">
                              @if (d.url) {
                                <a
                                  class="iconbtn ma-open"
                                  [href]="d.url"
                                  target="_blank"
                                  rel="noopener"
                                  title="Open"
                                  [attr.aria-label]="'Open ' + d.label"
                                  ><rp-icon name="external" [size]="16"
                                /></a>
                              }
                              @if (v.edit) {
                                <label
                                  class="iconbtn ma-rep"
                                  title="Replace"
                                  [class.is-busy]="busy() === v.a.id"
                                  ><rp-icon name="upload" [size]="16" /><input
                                    type="file"
                                    class="sr"
                                    [id]="'ma-rep-' + d.type + '-' + v.a.id"
                                    [attr.accept]="accept"
                                    [attr.aria-label]="'Replace ' + d.label"
                                    [disabled]="busy() === v.a.id"
                                    (change)="upload(v.r, d.type, $event)"
                                /></label>
                              }
                            </span>
                          </div>
                        }
                      </div>
                    } @else {
                      <p class="t-sm t-muted">No documents were uploaded with this form.</p>
                    }
                    @if (v.edit) {
                      <div class="fld">
                        <rp-dd
                          [inputId]="'ma-doc-type-' + v.a.id"
                          placeholder="Document type"
                          [options]="v.docOptions"
                          [value]="v.docKind"
                          (changed)="pickKind(v.a.id, $event)"
                        />
                      </div>
                      <div class="fld" [class.invalid]="!!docErr(v.a.id)">
                        <label class="upl" [for]="'ma-doc-' + v.a.id"
                          ><span class="upl-ic"
                            ><rp-icon
                              [name]="busy() === v.a.id ? 'hourglass' : 'upload'"
                              [size]="20" /></span
                          ><span class="grow" style="min-width: 0"
                            ><span class="t-h4 t-clip" style="display: block">{{
                              busy() === v.a.id
                                ? 'Uploading…'
                                : (has(v.a, v.docKind) ? 'Replace: ' : 'Upload: ') +
                                  label(v.docKind)
                            }}</span
                            ><span class="t-xs t-muted">PDF, JPG or PNG · up to 2 MB</span></span
                          ><input
                            type="file"
                            [id]="'ma-doc-' + v.a.id"
                            [attr.accept]="accept"
                            [attr.aria-describedby]="'ma-doc-' + v.a.id + '-e'"
                            [disabled]="busy() === v.a.id"
                            (change)="upload(v.r, v.docKind, $event)"
                        /></label>
                        <div class="fld-e" [id]="'ma-doc-' + v.a.id + '-e'" role="alert">
                          <rp-icon name="alertc" [size]="14" /><span>{{ docErr(v.a.id) }}</span>
                        </div>
                      </div>
                    } @else if (docErr(v.a.id)) {
                      <p class="t-xs t-bad" role="alert">{{ docErr(v.a.id) }}</p>
                    }
                  </div>
                </div>
              }
            }
          }
        </div>
      } @empty {
        <rp-empty icon="filetext" title="No admission form" [text]="emptyText()" />
      }
    }

    @if (editing(); as e) {
      <rp-application-section
        [application]="e.r.application"
        [section]="e.section"
        [record]="true"
        [self]="e.r.relation"
        [classes]="classes()"
        [fields]="fields()"
        (closed)="editing.set(null)"
        (saved)="saved($event)"
        (correct)="fix($event)"
      />
    }
  `,
})
export class MemberAdmission {
  private readonly api = inject(ApplicationsApi);
  private readonly overlays = inject(Overlays);

  /** The drawer's member. */
  readonly member = input.required<MemberDetail>();
  /** The forms the member is on; null while they load. */
  readonly records = input.required<readonly AdmissionRecord[] | null>();
  readonly error = input('');
  readonly classes = input<readonly ClassView[]>([]);
  /** The institution's active fields for applications (CR-12). */
  readonly fields = input<readonly CustomField[]>([]);
  /** Why this person can't change members ('' when they can). */
  readonly why = input('');
  /** A record changed (a section saved, a document added): the newer form. */
  readonly changed = output<Application>();
  readonly retry = output<void>();
  /** A correction request for the drawer's member (CR-06). */
  readonly correct = output<IdentityFix>();
  /** Open another member: the child a parent's form is for. */
  readonly openMember = output<string>();

  protected readonly accept = DOC_ACCEPT;
  protected readonly editing = signal<{ r: AdmissionRecord; section: RecordSection } | null>(null);
  /** The application whose document is uploading. */
  protected readonly busy = signal<string | null>(null);
  private readonly picked = signal<Readonly<Record<string, DocType>>>({});
  private readonly docErrors = signal<Readonly<Record<string, string>>>({});

  protected readonly views = computed<RecordView[]>(() =>
    (this.records() ?? []).map((r) => this.view(r)),
  );
  protected readonly emptyText = computed(() =>
    this.member().kind === 'PARENTS'
      ? 'None of this parent’s children has an admission form on record.'
      : 'This member was onboarded without an admission form, so there is nothing to show.',
  );

  private view(r: AdmissionRecord): RecordView {
    const a = r.application;
    const edit = r.editable && !this.why();
    const own = r.relation === 'STUDENT' ? null : `${r.relation}_`;
    const p = a.parents;
    const blocks: Block[] = ['student', 'parents', 'addresses', 'previous'];
    // A parent's own section first.
    if (own) blocks.unshift(blocks.splice(1, 1)[0]!);
    if (p?.transport !== undefined || p?.hostel !== undefined) blocks.push('stay');
    const fields = this.fieldsOf(a);
    if (fields.length) blocks.push('customFields');
    blocks.push('references', 'documents');
    const docs = a.documents
      .map<DocView>((d) => ({
        type: d.type,
        label: this.label(d.type),
        name: d.name,
        meta: [fileSize(d.sizeBytes), d.addedAt ? `added ${formatDate(d.addedAt)}` : '']
          .filter(Boolean)
          .join(' · '),
        url: d.url,
        image: d.mimeType.startsWith('image/'),
        own: !!own && d.type.startsWith(own),
      }))
      .sort((x, y) => Number(y.own) - Number(x.own));
    // The upload suggests what is missing: a parent's own cards, else the student's papers.
    const mine: DocType[] = own
      ? CARDS.map((c) => `${r.relation}_${c}` as DocType)
      : [...STUDENT_DOCS];
    const kinds = [
      ...mine,
      ...(Object.keys(DOC_TYPE) as DocType[]).filter((t) => !mine.includes(t)),
    ];
    const have = new Set(a.documents.map((d) => d.type));
    return {
      r,
      a,
      edit,
      lockedWhy: edit ? '' : this.lockedWhy(r),
      blocks,
      people: this.people(r),
      docs,
      fields,
      docOptions: kinds.map((t) => ({
        v: t,
        l: DOC_TYPE[t],
        ...(have.has(t) ? { sub: 'Replaces the one attached' } : {}),
      })),
      docKind: this.picked()[a.id] ?? mine.find((t) => !have.has(t)) ?? 'OTHER',
    };
  }

  /** Each person on the form, the drawer's member first, and the local guardian last. */
  private people(r: AdmissionRecord): PersonView[] {
    const a = r.application;
    const p = a.parents;
    const primary = p?.primary ?? a.primaryContact.relation;
    const out: PersonView[] = [];
    for (const w of WHO) {
      const x = p?.[w.k];
      if (!x) continue;
      out.push({
        k: w.k,
        l: w.l,
        name: person(x.name),
        relation: 'relation' in x ? x.relation : '',
        mobile: x.mobile ? formatMobile(x.mobile) : '',
        email: x.email ?? '',
        work: workText(x),
        address: '',
        ids: idsText(a.identityNumbers?.[w.k]),
        primary: primary === w.r,
        self: r.relation === w.r,
      });
    }
    out.sort((x, y) => Number(y.self) - Number(x.self));
    const lg = p?.localGuardian;
    if (lg) {
      out.push({
        k: 'localGuardian',
        l: 'Local guardian',
        name: person(lg.name),
        relation: lg.relation,
        mobile: lg.mobile ? formatMobile(lg.mobile) : '',
        email: '',
        work: '',
        address: lg.address,
        ids: idsText(a.identityNumbers?.localGuardian),
        primary: false,
        self: false,
      });
    }
    return out;
  }

  /** The institution's fields with the form's answers, and any answer to a field since retired. */
  private fieldsOf(a: Application) {
    const defs = this.fields();
    const known = new Set(defs.map((f) => f.id));
    return [
      ...defs.map((f) => ({ id: f.id, label: f.label, value: this.cf(a.customFields[f.id]) })),
      ...Object.entries(a.customFields)
        .filter(([id, v]) => !known.has(id) && this.cf(v))
        .map(([id, v]) => ({ id, label: 'Institution field', value: this.cf(v) })),
    ];
  }

  private lockedWhy(r: AdmissionRecord) {
    if (this.why()) return this.why();
    return r.application.status === 'APPROVED'
      ? 'Your role can see this form but not change it.'
      : 'Not admitted yet: the application is changed on the Applications page.';
  }

  protected edit(r: AdmissionRecord, section: RecordSection) {
    if (r.editable && !this.why()) this.editing.set({ r, section });
  }

  protected saved(a: Application) {
    this.editing.set(null);
    this.changed.emit(a);
  }

  /** A locked field's correction request: the drawer's own dialog (CR-06). */
  protected fix(f: IdentityFix) {
    this.editing.set(null);
    this.correct.emit(f);
  }

  // --- documents ---------------------------------------------------------------------------------
  protected pickKind(id: string, t: string) {
    this.picked.update((p) => ({ ...p, [id]: t as DocType }));
    this.setDocErr(id, '');
  }
  protected docErr(id: string) {
    return this.docErrors()[id] ?? '';
  }
  private setDocErr(id: string, m: string) {
    this.docErrors.update((e) => ({ ...e, [id]: m }));
  }
  protected has(a: Application, t: DocType) {
    return a.documents.some((d) => d.type === t);
  }

  /** Upload or replace a document of the record (2 MB, PDF, JPG or PNG; the server checks too). */
  protected async upload(r: AdmissionRecord, type: DocType, e: Event) {
    const el = e.target as HTMLInputElement;
    const f = el.files?.[0] ?? null;
    el.value = '';
    const a = r.application;
    this.setDocErr(a.id, '');
    if (!f || !r.editable || this.why() || this.busy()) return;
    if (f.size > DOC_MAX_BYTES) {
      this.setDocErr(a.id, translate('FILE.TOO_LARGE', { limit: '2 MB' }));
      return;
    }
    if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) {
      this.setDocErr(a.id, translate('FILE.TYPE_NOT_ALLOWED', { types: 'PDF, JPG, PNG' }));
      return;
    }
    const replaced = this.has(a, type);
    this.busy.set(a.id);
    try {
      const out = await this.api.addRecordDocument(a.id, type, f, newIdempotencyKey());
      this.picked.update((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== a.id)));
      this.changed.emit(out);
      this.overlays.toast(replaced ? 'Document replaced' : 'Document added', {
        sub: `${this.label(type)} · ${f.name}`,
      });
    } catch (x) {
      this.setDocErr(
        a.id,
        x instanceof ApiProblem ? (x.errors[0]?.message ?? x.detail) : translate('GEN.UNAVAILABLE'),
      );
    } finally {
      this.busy.set(null);
    }
  }

  // --- formatting --------------------------------------------------------------------------------
  protected origin(a: Application) {
    return ORIGIN[a.source] ?? a.source;
  }
  protected statusLabel(a: Application) {
    return APP_STATUS[a.status].l();
  }
  protected statusTone(a: Application) {
    return APP_STATUS[a.status].tone;
  }
  protected relationWord(r: AdmissionRelation) {
    return r === 'STUDENT' ? 'student' : RELATION[r].toLowerCase();
  }
  protected classText(a: Application) {
    const c = a.class ? `${a.class.name}${a.section ? ` ${a.section.name}` : ''}` : '—';
    return `${c} · ${a.year.label}`;
  }
  protected name(a: Application) {
    return appName(a);
  }
  protected named(n: string) {
    return person(n);
  }
  protected label(t: DocType) {
    return DOC_TYPE[t] ?? t;
  }
  protected gender(g: keyof typeof GENDER) {
    return GENDER[g];
  }
  protected category(c: keyof typeof CATEGORY) {
    return CATEGORY[c];
  }
  protected blood(b: string | null | undefined) {
    return !b ? '—' : b === 'UNKNOWN' ? 'Not known' : b;
  }
  protected board(a: Application) {
    const p = a.previous;
    if (!p?.board) return '—';
    return p.board === 'OTHER' && p.otherBoard ? p.otherBoard : BOARD[p.board];
  }
  /** School transport as the family chose it (client 2026-10-12); '' when the form didn't ask. */
  protected transport(a: Application) {
    const p = a.parents;
    if (p?.transport === undefined) return '';
    if (!p.transport) return 'Not opted';
    return `Opted · ${p.transportStop ? `pick-up at ${p.transportStop.name}` : 'pick-up point to be decided'}`;
  }
  protected hostel(a: Application) {
    const h = a.parents?.hostel;
    if (h === undefined) return '';
    return h ? 'Opted — the local guardian is listed with the parents' : 'Not opted';
  }
  protected children(a: Application) {
    const c = a.parents?.children;
    return c === 'SINGLE' ? 'Single child' : c === 'MORE' ? 'More than one child' : '—';
  }
  protected primary(a: Application) {
    const c = a.primaryContact;
    if (!c.name) return '—';
    return [
      `${person(c.name)}${c.relation ? ` (${RELATION[c.relation]})` : ''}`,
      c.mobile ? formatMobile(c.mobile) : '',
      c.email ?? '',
    ]
      .filter(Boolean)
      .join(' · ');
  }
  protected address(x: Parameters<typeof addressText>[0]) {
    return addressText(x) || '—';
  }
  protected phone(m: string) {
    return m ? formatMobile(m) : '—';
  }
  protected date(d: string) {
    return formatDate(d);
  }
  private cf(v: unknown): string {
    if (v === undefined || v === null || v === '') return '';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return String(v);
  }
}
