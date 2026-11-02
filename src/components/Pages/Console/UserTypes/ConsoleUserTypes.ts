import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Dropdown } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { PATTERNS } from '../../../Utils/patterns';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import {
  InstitutionSetupApi,
  type UserType,
  type UserTypeCategory,
} from '../Institution/institution.api';

const KINDS: readonly { v: UserTypeCategory; l: string }[] = [
  { v: 'STUDENT', l: 'Student' },
  { v: 'PARENT', l: 'Parent' },
  { v: 'TEACHER', l: 'Teacher' },
  { v: 'STAFF', l: 'Staff' },
  { v: 'MERCHANT', l: 'Merchant' },
  { v: 'PRINCIPAL', l: 'Principal' },
  { v: 'MANAGEMENT', l: 'Management' },
  { v: 'CREW', l: 'Transport crew' },
  { v: 'OTHER', l: 'Other' },
];

/** A first guess of the kind from the name; the administrator can change it before saving. */
const guessKind = (name: string): UserTypeCategory => {
  const n = name.toLowerCase();
  if (/student|pupil/.test(n)) return 'STUDENT';
  if (/parent|guardian/.test(n)) return 'PARENT';
  if (/teacher|faculty|lecturer/.test(n)) return 'TEACHER';
  if (/merchant|vendor|canteen|shop/.test(n)) return 'MERCHANT';
  if (/principal|head/.test(n)) return 'PRINCIPAL';
  if (/management|trustee|chair/.test(n)) return 'MANAGEMENT';
  if (/crew|driver|attendant/.test(n)) return 'CREW';
  return n ? 'STAFF' : 'OTHER';
};

interface Draft {
  readonly id: string | null;
  readonly orig: UserType | null;
  readonly name: string;
  readonly kind: UserTypeCategory;
  readonly kindTouched: boolean;
  /** Existing departments kept (by id) and new ones (by name). */
  readonly keep: readonly { id: string; name: string; members: number }[];
  readonly add: readonly string[];
}

/**
 * c.roles — User types & departments (SRS 7.3; FR-INS-03, OI-ONB-04; INS-014…016; prototype
 * c.roles): every member belongs to a user type and one of its departments; every user type keeps
 * at least one department. The kind of member decides behaviour (a student has a guardian…), so the
 * drawer asks for it next to the name.
 */
@Component({
  selector: 'rp-console-user-types',
  imports: [Dropdown, Empty, Icon, Modal, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="User types & departments"
        sub="Every member belongs to a user type and one of its departments. Every user type needs at least one department."
      >
        @if (readOnly()) {
          <span class="cp-why" [attr.title]="readOnly()"
            ><button type="button" class="btn btn-pri" disabled>
              <rp-icon name="plus" [size]="17" /><span>New user type</span>
            </button></span
          >
        } @else {
          <button type="button" class="btn btn-pri" (click)="edit(null)">
            <rp-icon name="plus" [size]="17" /><span>New user type</span>
          </button>
        }
      </rp-page-head>
      @if (error()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the user types" [text]="error()" />
        </div>
      } @else {
        <div class="c-filters">
          <label class="search"
            ><rp-icon name="search" [size]="16" /><input
              type="search"
              placeholder="Find a user type or department"
              autocomplete="off"
              [value]="q()"
              (input)="q.set(value($event))"
          /></label>
          <span class="fsum"
            >{{ plural(types().length, 'user type') }} ·
            {{ plural(deptCount(), 'department') }}</span
          >
        </div>
        @if (readOnly()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow"><b>Read-only.</b> {{ readOnly() }}</div>
          </div>
        }
        @if (list().length) {
          <div class="cp-uts">
            @for (t of list(); track t.id) {
              <div class="card cp-ut">
                <div class="row between g8">
                  <div>
                    <b class="t-h4">{{ t.name }}</b>
                    <div class="t-xs t-muted">{{ plural(t.members, 'member') }}</div>
                  </div>
                  @if (!readOnly()) {
                    <button type="button" class="btn btn-ghost btn-sm" (click)="edit(t)">
                      <rp-icon name="edit" [size]="15" /><span>Edit</span>
                    </button>
                  }
                </div>
                <div class="cp-depts">
                  @for (d of t.departments; track d.id) {
                    <span class="tag"
                      >{{ d.name }} <span class="t-faint">{{ d.members }}</span></span
                    >
                  }
                </div>
              </div>
            }
          </div>
        } @else if (!loading()) {
          <rp-empty icon="layers" title="No user type matches" text="Try a different word." />
        }
      }
    </div>

    @if (draft(); as d) {
      <rp-modal
        [title]="d.orig ? 'Edit ' + d.orig.name : 'New user type'"
        [sub]="
          d.orig
            ? plural(d.orig.members, 'member') + ' use this type'
            : 'Name it, then add at least one department'
        "
        [drawer]="true"
        (closed)="draft.set(null)"
      >
        <div class="stack g16">
          <div class="fld" [class.invalid]="err('name')">
            <label class="fld-l" for="cp-ut-name">User type name<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="cp-ut-name"
                maxlength="40"
                [readOnly]="!!d.orig && d.orig.members > 0"
                [value]="d.name"
                (input)="setName($event)"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('name') }}</span>
            </div>
            <div class="fld-h">
              {{
                d.orig && d.orig.members > 0
                  ? 'Members use this type, so its name is fixed.'
                  : 'e.g. Hostel warden'
              }}
            </div>
          </div>
          <div class="fld">
            <label class="fld-l" for="cp-ut-kind-b">Kind of member<span class="req">*</span></label>
            <rp-dd
              inputId="cp-ut-kind"
              [options]="kinds"
              [value]="d.kind"
              [disabled]="!!d.orig"
              (changed)="setKind($event)"
            />
            <div class="fld-h">
              Decides what members of this type can do — for example, a student has a guardian
              (OI-ONB-04).
            </div>
          </div>
          <div class="fld" [class.invalid]="err('depts')">
            <span class="fld-l">Departments<span class="req">*</span></span>
            <div class="cp-dlist" id="cp-ut-dl">
              @for (x of rows(d); track x.key) {
                <div class="cp-drow">
                  <span class="grow">{{ x.name }}</span>
                  <span class="t-xs t-muted">{{
                    x.members ? plural(x.members, 'member') : 'No members'
                  }}</span>
                  @if (x.lock) {
                    <span class="cp-why" [attr.title]="x.lock"
                      ><button type="button" class="iconbtn" disabled aria-label="Can't remove">
                        <rp-icon name="lock" [size]="15" /></button
                    ></span>
                  } @else {
                    <button
                      type="button"
                      class="iconbtn"
                      [attr.aria-label]="'Remove ' + x.name"
                      (click)="remove(x.key)"
                    >
                      <rp-icon name="x" [size]="16" />
                    </button>
                  }
                </div>
              } @empty {
                <p class="t-sm t-muted">No departments yet.</p>
              }
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('depts') }}</span>
            </div>
          </div>
          <div class="row g8 top">
            <div class="fld grow" [class.invalid]="err('new')">
              <label class="fld-l" for="cp-ut-new">Add a department</label>
              <div class="fld-in">
                <input
                  id="cp-ut-new"
                  maxlength="40"
                  placeholder="e.g. Boys' hostel"
                  [value]="newDept()"
                  (input)="newDept.set(value($event))"
                  (keydown.enter)="addDept()"
                />
              </div>
              <div class="fld-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('new') }}</span>
              </div>
            </div>
            <div style="padding-top: 25px">
              <button type="button" class="btn btn-sec" (click)="addDept()">
                <rp-icon name="plus" [size]="17" /><span>Add</span>
              </button>
            </div>
          </div>
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="draft.set(null)">
            <span>Cancel</span>
          </button>
          <button type="button" class="btn btn-pri" [class.is-busy]="busy()" (click)="save()">
            <rp-icon name="check" [size]="17" /><span>{{
              d.orig ? 'Save user type' : 'Create user type'
            }}</span>
          </button>
        </ng-container>
      </rp-modal>
    }
  `,
})
export class ConsoleUserTypes {
  private readonly api = inject(InstitutionSetupApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  protected readonly kinds = KINDS;
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly types = signal<readonly UserType[]>([]);
  protected readonly q = signal('');
  protected readonly draft = signal<Draft | null>(null);
  protected readonly newDept = signal('');
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);
  protected readonly readOnly = computed(() => {
    const s = this.session();
    if (!s) return '';
    if (s.roles.some((r) => r.readOnly)) {
      return 'Management has read-only access. Ask the institution administrator to make this change.';
    }
    return s.subTasks.includes('config.edit') ? '' : "Your role doesn't include this task.";
  });
  protected readonly list = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.types().filter(
      (t) =>
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.departments.some((d) => d.name.toLowerCase().includes(q)),
    );
  });
  protected readonly deptCount = computed(() =>
    this.types().reduce((n, t) => n + t.departments.length, 0),
  );

  constructor() {
    void this.load();
  }

  private async load() {
    try {
      this.types.set((await this.api.userTypes()).items);
      this.error.set('');
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.loading.set(false);
    }
  }

  protected value(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected plural(n: number, noun: string) {
    return `${n} ${noun}${n === 1 ? '' : 's'}`;
  }
  protected err(k: string) {
    return this.errors()[k] ?? '';
  }

  protected edit(t: UserType | null) {
    this.errors.set({});
    this.newDept.set('');
    this.draft.set({
      id: t?.id ?? null,
      orig: t,
      name: t?.name ?? '',
      kind: t?.category ?? 'OTHER',
      kindTouched: Boolean(t),
      keep: t ? [...t.departments] : [],
      add: [],
    });
  }

  protected setName(e: Event) {
    const d = this.draft();
    if (!d) return;
    const name = this.value(e);
    this.draft.set({ ...d, name, kind: d.kindTouched ? d.kind : guessKind(name) });
    this.clear('name');
  }

  protected setKind(v: string) {
    const d = this.draft();
    if (d) this.draft.set({ ...d, kind: v as UserTypeCategory, kindTouched: true });
  }

  protected rows(d: Draft) {
    const total = d.keep.length + d.add.length;
    const lockOf = (members: number) =>
      members > 0
        ? `${this.plural(members, 'member')} in this department`
        : total === 1
          ? 'A user type needs at least one department'
          : '';
    return [
      ...d.keep.map((k) => ({
        key: k.id,
        name: k.name,
        members: k.members,
        lock: lockOf(k.members),
      })),
      ...d.add.map((a) => ({ key: `new:${a}`, name: a, members: 0, lock: lockOf(0) })),
    ];
  }

  protected remove(key: string) {
    const d = this.draft();
    if (!d) return;
    this.draft.set({
      ...d,
      keep: d.keep.filter((k) => k.id !== key),
      add: d.add.filter((a) => `new:${a}` !== key),
    });
  }

  protected addDept() {
    const d = this.draft();
    if (!d) return;
    const v = this.newDept().trim();
    if (!v) return this.fieldError('new', 'Type a department name first');
    if (!PATTERNS.userTypeName.test(v)) {
      return this.fieldError('new', translate('INS.DEPARTMENT_NAME_FORMAT', { name: v }));
    }
    const names = [...d.keep.map((k) => k.name), ...d.add];
    if (names.some((n) => n.toLowerCase() === v.toLowerCase())) {
      return this.fieldError('new', translate('INS.DEPARTMENT_TAKEN', { name: v }));
    }
    this.draft.set({ ...d, add: [...d.add, v] });
    this.newDept.set('');
    this.clear('new');
    this.clear('depts');
  }

  private fieldError(k: string, text: string) {
    this.errors.set({ ...this.errors(), [k]: text });
  }

  private clear(k: string) {
    if (!this.errors()[k]) return;
    const next = { ...this.errors() };
    delete next[k];
    this.errors.set(next);
  }

  protected async save() {
    const d = this.draft();
    if (!d || this.busy()) return;
    const name = d.name.trim();
    const errors: Record<string, string> = {};
    if (!name) errors['name'] = translate('VALIDATION.REQUIRED');
    else if (!PATTERNS.userTypeName.test(name)) {
      errors['name'] = translate('INS.USER_TYPE_NAME_FORMAT', { name });
    } else if (name.length < 3) errors['name'] = translate('VALIDATION.FORMAT');
    else if (
      this.types().some((t) => t.id !== d.id && t.name.toLowerCase() === name.toLowerCase())
    ) {
      errors['name'] = translate('INS.USER_TYPE_TAKEN', { name });
    }
    if (d.keep.length + d.add.length === 0) errors['depts'] = translate('INS.DEPARTMENT_REQUIRED');
    this.errors.set(errors);
    if (Object.keys(errors).length) return;
    this.busy.set(true);
    try {
      let out: { items: UserType[] };
      if (d.orig) {
        const removed = d.orig.departments
          .filter((x) => !d.keep.some((k) => k.id === x.id))
          .map((x) => x.id);
        out = await this.api.changeUserType(d.orig.id, d.orig.version, {
          ...(name !== d.orig.name ? { name } : {}),
          ...(d.add.length ? { addDepartments: [...d.add] } : {}),
          ...(removed.length ? { removeDepartments: removed } : {}),
        });
      } else {
        out = await this.api.createUserType({ name, category: d.kind, departments: [...d.add] });
      }
      this.types.set(out.items);
      this.draft.set(null);
      const n = d.keep.length + d.add.length;
      this.overlays.toast(d.orig ? 'User type saved' : 'User type created', {
        sub: `${name} · ${this.plural(n, 'department')}`,
      });
    } catch (e) {
      if (e instanceof ApiProblem) {
        const k = e.code.includes('DEPARTMENT') ? 'depts' : 'name';
        this.fieldError(k, e.errors[0]?.message ?? e.detail);
        if (e.status === 412) await this.load();
      } else {
        this.overlays.toast('Not saved', { sub: translate('GEN.UNAVAILABLE'), tone: 'bad' });
      }
    } finally {
      this.busy.set(false);
    }
  }
}
