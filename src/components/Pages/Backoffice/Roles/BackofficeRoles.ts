import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatTime } from '../../../Utils/format';
import { BACKOFFICE_NAV } from '../../../Utils/navigation';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import {
  RolesApi,
  type OperatorAccount,
  type Role,
  type RoleAction,
  type RoleChange,
  type TaskDef,
} from './roles.api';

type Tab = 'op' | 'inst' | 'acct' | 'log';

const plural = (n: number, w: string) => `${n} ${n === 1 ? w : `${w}s`}`;
const dateTime = (iso: string) => `${formatDate(iso)}, ${formatTime(iso)}`;

/**
 * o.roles — Roles & tasks (SRS 6.28, RNG-GOV-001/032, OI-GOV-01; IDN-063…069, IDN-039, IDN-081;
 * prototype o.roles): operator roles with their tasks and sub-tasks, the default institution roles,
 * operator accounts and the change record. Every change asks for a reason and is recorded. Reading
 * needs the Platform task; changing needs "Roles, tasks and accounts" (roles.edit).
 */
@Component({
  selector: 'rp-backoffice-roles',
  imports: [Avatar, Empty, Icon, Modal, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Roles & tasks"
        sub="Operator roles are kept apart from institution roles: no institution account can hold an operator role, and no operator account an institution role."
      >
        <button
          type="button"
          class="btn btn-sec"
          [disabled]="!canEdit()"
          (click)="openAssign(null)"
        >
          <rp-icon name="userplus" [size]="17" /><span>Assign a role</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          [disabled]="!canEdit()"
          (click)="newRoleOpen.set(true)"
        >
          <rp-icon name="plus" [size]="17" /><span>New operator role</span>
        </button>
      </rp-page-head>

      <div class="tabs" role="tablist">
        @for (t of tabs(); track t.v) {
          <button
            type="button"
            class="tab"
            role="tab"
            [class.on]="tab() === t.v"
            [attr.aria-selected]="tab() === t.v"
            (click)="tab.set(t.v)"
          >
            {{ t.l }}<span class="n">{{ t.n }}</span>
          </button>
        }
      </div>

      @if (loading()) {
        <div class="card pad"><rp-empty icon="hourglass" title="Loading…" /></div>
      } @else if (loadError()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load roles" [text]="loadError()">
            <button type="button" class="btn btn-sec btn-sm" (click)="load()">
              <span>Try again</span>
            </button>
          </rp-empty>
        </div>
      } @else {
        @switch (tab()) {
          @case ('op') {
            <div class="ob-split" style="grid-template-columns: 320px minmax(0, 1fr)">
              <div class="stack g12">
                <div class="list">
                  @for (r of operatorRoles(); track r.id) {
                    <button
                      type="button"
                      class="li"
                      [class.ob-sel]="r.id === selected()?.id"
                      (click)="selectedId.set(r.id)"
                    >
                      <span class="li-ic sm"><rp-icon name="key" [size]="16" /></span>
                      <span class="li-main"
                        ><span class="li-t">{{ r.name }}</span
                        ><span class="li-s"
                          >{{ plural(r.holderCount, 'account') }} ·
                          {{ plural(r.subTasks.length, 'sub-task') }}</span
                        ></span
                      >
                      @if (r.status !== 'ACTIVE') {
                        <span class="li-r"
                          ><span class="chip tone-neutral dot">Disabled</span></span
                        >
                      }
                    </button>
                  }
                </div>
                <div class="note tone-info">
                  <rp-icon name="info" [size]="17" />
                  <div class="grow">
                    Menus follow the <b>task</b> and refresh at each account's next sign-in. Every
                    action checks its <b>sub-task</b> immediately (RNG-GOV-001).
                  </div>
                </div>
              </div>
              @if (selected(); as r) {
                <div class="card">
                  <div class="card-h">
                    <span class="li-ic sm"><rp-icon name="key" [size]="16" /></span>
                    <span class="t-h4">{{ r.name }}</span>
                    <button
                      type="button"
                      class="btn btn-sm"
                      [class.btn-danger-o]="r.status === 'ACTIVE'"
                      [class.btn-sec]="r.status !== 'ACTIVE'"
                      [disabled]="!canEdit()"
                      (click)="toggleRoleStatus(r)"
                    >
                      <span>{{ r.status === 'ACTIVE' ? 'Disable role' : 'Enable role' }}</span>
                    </button>
                  </div>
                  <div class="card-b stack g12">
                    <p class="t-sm t-muted">{{ r.description ?? '' }} · held by {{ heldBy(r) }}</p>
                    @if (!canEdit()) {
                      <div class="note tone-warn">
                        <rp-icon name="lock" [size]="17" />
                        <div class="grow">
                          Your role doesn't hold “Roles, tasks and accounts”. Ask a Platform
                          Administrator to grant it in Roles & tasks.
                        </div>
                      </div>
                    }
                    @for (t of tasks(); track t.code) {
                      <div class="ob-task" [class.off]="!r.tasks.includes(t.code)">
                        <div class="ob-task-h">
                          <span class="grow"
                            ><b>{{ t.name }}</b
                            ><span class="t-xs t-muted" style="display: block">{{
                              pagesOf(t.code)
                            }}</span></span
                          >
                          <span class="t-xs t-muted">{{
                            r.tasks.includes(t.code) ? 'Task assigned' : 'Not assigned'
                          }}</span>
                          <button
                            type="button"
                            class="toggle"
                            role="switch"
                            [attr.aria-checked]="r.tasks.includes(t.code)"
                            [attr.aria-label]="'Assign ' + t.name"
                            [disabled]="!canEdit()"
                            (click)="toggleTask(r, t)"
                          ></button>
                        </div>
                        @if (r.tasks.includes(t.code)) {
                          <div class="ob-subs">
                            @for (s of t.subTasks; track s.code) {
                              <div class="ob-sub">
                                <span class="grow"
                                  >{{ s.name }}
                                  <span class="t-mono t-faint t-xs">{{ s.code }}</span></span
                                >
                                <button
                                  type="button"
                                  class="toggle"
                                  role="switch"
                                  [attr.aria-checked]="r.subTasks.includes(s.code)"
                                  [attr.aria-label]="s.name"
                                  [disabled]="!canEdit()"
                                  (click)="toggleSub(r, s)"
                                ></button>
                              </div>
                            }
                          </div>
                        }
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          }
          @case ('inst') {
            <div class="note tone-info">
              <rp-icon name="shield" [size]="17" />
              <div class="grow">
                These are the platform's default institution roles. Each institution assigns them to
                its own members in its console; the operator maintains the defaults but can't hold
                them, and institution administrators can't see or assign operator roles (OI-GOV-01).
              </div>
            </div>
            <div class="tbl-wrap">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>Institution role</th>
                    <th>Tasks</th>
                    <th class="r">Tasks</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of institutionRoles(); track r.id) {
                    <tr>
                      <td>
                        <b>{{ r.name }}</b>
                        @if (r.readOnly) {
                          <span class="chip tone-neutral">Read-only</span>
                        }
                      </td>
                      <td>
                        <div class="row wrap g4">
                          @for (t of r.tasks; track t) {
                            <span class="tag">{{ t }}</span>
                          }
                        </div>
                      </td>
                      <td class="r">{{ r.tasks.length }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="pager">
              <span>{{ plural(institutionRoles().length, 'role') }}</span>
            </div>
            <div class="note tone-ok">
              <rp-icon name="shieldck" [size]="17" />
              <div class="grow">
                No institution role carries a cross-institution task: an institution administrator
                has no cross-institution reading of any kind (RNG-GOV-030).
              </div>
            </div>
          }
          @case ('acct') {
            <div class="tbl-wrap">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Operator role</th>
                    <th>Sign-in</th>
                    <th>Last sign-in</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (a of accounts(); track a.id) {
                    <tr>
                      <td>
                        <div class="cell-main">
                          <rp-av [name]="a.name" size="sm" />
                          <div class="stack g4" style="gap: 1px">
                            <span class="cell-t">{{ a.name }}</span
                            ><span class="cell-s"
                              ><span class="t-mono">{{ a.email }}</span></span
                            >
                          </div>
                        </div>
                      </td>
                      <td>{{ a.role.name }}</td>
                      <td>
                        <div class="stack g4" style="gap: 1px">
                          <span class="cell-t">Password + one-time code</span
                          ><span class="cell-s">SMS, e-mail fallback</span>
                        </div>
                      </td>
                      <td>{{ a.lastSignInAt ? dateTime(a.lastSignInAt) : 'Never' }}</td>
                      <td>
                        <div class="stack" style="gap: 2px; align-items: flex-start">
                          @if (a.locked) {
                            <span class="chip tone-bad dot">Locked</span>
                          } @else if (a.status === 'ACTIVE') {
                            <span class="chip tone-ok dot">Active</span>
                          } @else {
                            <span class="chip tone-neutral dot">Inactive</span>
                          }
                          @if (a.statusNote) {
                            <span class="cell-s">{{ a.statusNote }}</span>
                          }
                        </div>
                      </td>
                      <td>
                        <div class="row-acts">
                          @if (a.locked) {
                            <button
                              type="button"
                              class="btn btn-ghost btn-xs"
                              [disabled]="!canEdit()"
                              (click)="release(a)"
                            >
                              <span>Release lock</span>
                            </button>
                          }
                          <button
                            type="button"
                            class="btn btn-ghost btn-xs"
                            [disabled]="!canEdit() || a.status !== 'ACTIVE'"
                            (click)="openAssign(a)"
                          >
                            <span>Change role</span>
                          </button>
                          <button
                            type="button"
                            class="btn btn-ghost btn-xs"
                            [disabled]="!canEdit()"
                            (click)="toggleAccount(a)"
                          >
                            <span>{{ a.status === 'ACTIVE' ? 'Disable' : 'Enable' }}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="pager">
              <span>{{ plural(accounts().length, 'account') }}</span>
            </div>
          }
          @case ('log') {
            @if (changes().length) {
              <div class="tbl-wrap">
                <table class="tbl">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>By</th>
                      <th>Change</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of changes(); track c.id) {
                      <tr>
                        <td>{{ dateTime(c.at) }}</td>
                        <td>{{ c.by }}</td>
                        <td>{{ c.change }}</td>
                        <td>{{ c.reason }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="pager">
                <span>{{ plural(changes().length, 'change') }}</span>
              </div>
            } @else {
              <div class="card pad"><rp-empty icon="history" title="No changes yet" /></div>
            }
          }
        }
      }
    </div>

    @if (newRoleOpen()) {
      <rp-modal
        title="New operator role"
        sub="Operator roles exist only in the back office. Tasks and sub-tasks are granted after the role is created."
        (closed)="newRoleOpen.set(false)"
      >
        <div class="stack g12">
          <div class="fld" [class.invalid]="formError()['name']">
            <label class="fld-l" for="ob-nr-n">Role name<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="ob-nr-n"
                maxlength="40"
                placeholder="e.g. Grievance Checker"
                [value]="newName()"
                (input)="newName.set(value($event))"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ formError()['name'] }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="formError()['description']">
            <label class="fld-l" for="ob-nr-d"
              >What the role is for<span class="req">*</span></label
            >
            <div class="fld-in">
              <textarea
                id="ob-nr-d"
                rows="2"
                maxlength="160"
                [value]="newDesc()"
                (input)="newDesc.set(value($event))"
              ></textarea>
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ formError()['description'] }}</span>
            </div>
          </div>
          <div class="note tone-info">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              Scope: <b>Operator</b>. Institution roles are defaults maintained on the Institution
              roles tab.
            </div>
          </div>
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="newRoleOpen.set(false)">
            <span>Cancel</span>
          </button>
          <button type="button" class="btn btn-pri" [class.is-busy]="busy()" (click)="createRole()">
            <span>Create role</span>
          </button>
        </ng-container>
      </rp-modal>
    }

    @if (assignFor(); as target) {
      <rp-modal
        [title]="assignTitle()"
        sub="Operator roles can be held only by CampusOne staff accounts — never by an account that belongs to an institution (OI-GOV-01)."
        (closed)="assignFor.set(null)"
      >
        <div class="stack g12">
          <div class="fld" [class.invalid]="formError()['email']">
            <label class="fld-l" for="ob-aa-e">Account e-mail<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="ob-aa-e"
                type="email"
                placeholder="name@campusone.example"
                [readOnly]="target !== 'new'"
                [value]="assignEmail()"
                (input)="assignEmail.set(value($event))"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ formError()['email'] }}</span>
            </div>
          </div>
          <div class="fld">
            <label class="fld-l" for="ob-aa-r">Operator role</label>
            <div class="fld-in">
              <select id="ob-aa-r" [value]="assignRole()" (change)="assignRole.set(value($event))">
                @for (r of enabledOperatorRoles(); track r.id) {
                  <option [value]="r.id" [selected]="r.id === assignRole()">{{ r.name }}</option>
                }
              </select>
            </div>
          </div>
          <div class="fld" [class.invalid]="formError()['reason']">
            <label class="fld-l" for="ob-aa-why">Reason (recorded)<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="ob-aa-why"
                placeholder="e.g. Joins the settlement desk from Monday"
                [value]="assignReason()"
                (input)="assignReason.set(value($event))"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ formError()['reason'] }}</span>
            </div>
          </div>
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="assignFor.set(null)">
            <span>Cancel</span>
          </button>
          <button type="button" class="btn btn-pri" [class.is-busy]="busy()" (click)="saveAssign()">
            <span>{{ target === 'new' ? 'Assign role' : 'Change role' }}</span>
          </button>
        </ng-container>
      </rp-modal>
    }
  `,
})
export class BackofficeRoles {
  private readonly api = inject(RolesApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).ops;
  protected readonly plural = plural;
  protected readonly dateTime = dateTime;

  protected readonly tab = signal<Tab>('op');
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly tasks = signal<readonly TaskDef[]>([]);
  protected readonly roles = signal<readonly Role[]>([]);
  protected readonly accounts = signal<readonly OperatorAccount[]>([]);
  protected readonly changes = signal<readonly RoleChange[]>([]);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly formError = signal<Record<string, string>>({});

  protected readonly newRoleOpen = signal(false);
  protected readonly newName = signal('');
  protected readonly newDesc = signal('');
  protected readonly assignFor = signal<'new' | OperatorAccount | null>(null);
  protected readonly assignEmail = signal('');
  protected readonly assignRole = signal('');
  protected readonly assignReason = signal('');
  protected readonly assignTitle = computed(() => {
    const t = this.assignFor();
    return !t || t === 'new' ? 'Assign an operator role' : `Change ${t.name}'s role`;
  });

  protected readonly canEdit = computed(
    () => this.session()?.subTasks.includes('roles.edit') ?? false,
  );
  protected readonly operatorRoles = computed(() =>
    this.roles().filter((r) => r.scope === 'OPERATOR'),
  );
  protected readonly enabledOperatorRoles = computed(() =>
    this.operatorRoles().filter((r) => r.status === 'ACTIVE'),
  );
  protected readonly institutionRoles = computed(() =>
    this.roles().filter((r) => r.scope === 'INSTITUTION'),
  );
  protected readonly selected = computed(
    () =>
      this.operatorRoles().find((r) => r.id === this.selectedId()) ??
      this.operatorRoles()[0] ??
      null,
  );
  protected readonly tabs = computed(() => [
    { v: 'op' as const, l: 'Operator roles', n: this.operatorRoles().length },
    { v: 'inst' as const, l: 'Institution roles', n: this.institutionRoles().length },
    { v: 'acct' as const, l: 'Operator accounts', n: this.accounts().length },
    { v: 'log' as const, l: 'Change record', n: this.changes().length },
  ]);

  constructor() {
    void this.load();
  }

  protected async load() {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const [t, r, a, c] = await Promise.all([
        this.api.tasks(),
        this.api.roles(),
        this.api.accounts(),
        this.api.changes(),
      ]);
      this.tasks.set(t.items);
      this.roles.set(r.items);
      this.accounts.set(a.items);
      this.changes.set(c.items);
    } catch (e) {
      this.loadError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Menu pages a task opens (the prototype lists them under the task name). */
  protected pagesOf(task: string): string {
    const pages = BACKOFFICE_NAV.flatMap((g) => g.items)
      .filter((i) => i.needs.includes(`task.${task}`))
      .map((i) => i.label);
    return (task === 'home' ? [...pages, 'Search'] : pages).join(' · ');
  }

  protected heldBy(r: Role): string {
    return r.holders.map((h) => h.name).join(', ') || 'nobody';
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  private failed(e: unknown, title: string) {
    this.overlays.toast(title, {
      sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
      tone: 'bad',
    });
  }

  private async change(
    r: Role,
    action: RoleAction,
    extra: { task?: string; subTask?: string },
    reason: string,
    done: string,
  ) {
    try {
      await this.api.changeRole(r, { action, ...extra, reason });
      this.overlays.toast(`${r.name} updated`, { sub: done });
      await this.load();
    } catch (e) {
      this.failed(e, `Couldn't update ${r.name}`);
      await this.load();
    }
  }

  protected async toggleSub(r: Role, s: { code: string; name: string }) {
    const grant = !r.subTasks.includes(s.code);
    const separation =
      grant &&
      ((s.code === 'settle.final' && r.subTasks.includes('settle.stage1')) ||
        (s.code === 'settle.stage1' && r.subTasks.includes('settle.final')));
    const ok = await this.overlays.confirm({
      title: `${grant ? 'Grant' : 'Remove'} “${s.name}” ${grant ? 'to' : 'from'} ${r.name}?`,
      text: `${plural(r.holderCount, 'account')} ${r.holderCount === 1 ? 'holds' : 'hold'} this role. ${
        grant
          ? 'They get it at their next sign-in, or within 15 minutes.'
          : 'They are signed out of the back office now and lose it at once.'
      }${
        separation
          ? ' This role would hold both stage-1 and final settlement approval. The same person still can’t approve both stages of one settlement (BR-18), but the maker–checker separation between roles is weakened.'
          : ''
      }`,
      ok: grant ? 'Grant' : 'Remove',
      tone: grant && !separation ? 'brand' : 'warn',
      reason: {
        label: 'Reason (recorded)',
        placeholder: 'e.g. Recon officers now re-run the roll-over',
        min: 5,
      },
    });
    if (!ok || !ok.reason) return;
    await this.change(
      r,
      grant ? 'GRANT' : 'REVOKE',
      { subTask: s.code },
      ok.reason,
      `${s.name} ${grant ? 'granted' : 'removed'} · recorded`,
    );
  }

  protected async toggleTask(r: Role, t: TaskDef) {
    const on = r.tasks.includes(t.code);
    const ok = await this.overlays.confirm({
      title: `${on ? 'Remove' : 'Assign'} the ${t.name} task ${on ? 'from' : 'to'} ${r.name}?`,
      text: on
        ? 'Its sub-tasks are removed too. Holders are signed out of the back office now; the menu entry is gone when they sign in again.'
        : 'Its menu entries appear at each account’s next sign-in. Sub-tasks start switched off — grant them one by one.',
      ok: on ? 'Remove task' : 'Assign task',
      tone: on ? 'warn' : 'brand',
      reason: { label: 'Reason (recorded)', min: 5 },
    });
    if (!ok || !ok.reason) return;
    await this.change(
      r,
      on ? 'REMOVE_TASK' : 'ASSIGN_TASK',
      { task: t.code },
      ok.reason,
      'Menus update at next sign-in; actions immediately',
    );
  }

  protected async toggleRoleStatus(r: Role) {
    const disable = r.status === 'ACTIVE';
    const ok = await this.overlays.confirm({
      title: `${disable ? 'Disable' : 'Enable'} ${r.name}?`,
      text: disable
        ? `${plural(r.holderCount, 'account')} lose every action of this role immediately; the accounts themselves stay active.`
        : 'Accounts holding the role regain its tasks.',
      ok: disable ? 'Disable role' : 'Enable role',
      tone: disable ? 'bad' : 'brand',
      reason: { label: 'Reason (recorded)', min: 5 },
    });
    if (!ok || !ok.reason) return;
    await this.change(
      r,
      disable ? 'DISABLE' : 'ENABLE',
      {},
      ok.reason,
      disable ? 'Disabled · recorded' : 'Enabled · recorded',
    );
  }

  protected async createRole() {
    const name = this.newName().trim();
    const description = this.newDesc().trim();
    const e: Record<string, string> = {};
    if (!name) e['name'] = 'Name the role';
    else if (name.length < 3) e['name'] = 'Use 3 to 40 characters';
    if (!description) e['description'] = 'Describe the role';
    else if (description.length < 10) e['description'] = 'Use 10 to 160 characters';
    this.formError.set(e);
    if (Object.keys(e).length) return;
    this.busy.set(true);
    try {
      const created = await this.api.createRole(name, description);
      this.newRoleOpen.set(false);
      this.newName.set('');
      this.newDesc.set('');
      this.overlays.toast(`${name} created`, { sub: 'Assign tasks and sub-tasks next' });
      await this.load();
      this.selectedId.set(created.roleId);
      this.tab.set('op');
    } catch (err) {
      if (err instanceof ApiProblem && err.code === 'IDN.ROLE_NAME_TAKEN')
        this.formError.set({ name: err.detail });
      else this.failed(err, "Couldn't create the role");
    } finally {
      this.busy.set(false);
    }
  }

  protected openAssign(a: OperatorAccount | null) {
    this.formError.set({});
    this.assignFor.set(a ?? 'new');
    this.assignEmail.set(a?.email ?? '');
    this.assignRole.set(a?.role.id ?? this.enabledOperatorRoles()[0]?.id ?? '');
    this.assignReason.set('');
  }

  protected async saveAssign() {
    const target = this.assignFor();
    if (!target) return;
    const email = this.assignEmail().trim().toLowerCase();
    const reason = this.assignReason().trim();
    const e: Record<string, string> = {};
    if (!email) e['email'] = "Enter the account's e-mail";
    if (!reason) e['reason'] = 'Say why';
    else if (reason.length < 5) e['reason'] = 'Write at least 5 characters';
    this.formError.set(e);
    if (Object.keys(e).length) return;
    this.busy.set(true);
    try {
      const role = this.operatorRoles().find((r) => r.id === this.assignRole());
      if (target === 'new') await this.api.assign(email, this.assignRole(), reason);
      else await this.api.changeAccount(target, { roleId: this.assignRole(), reason });
      this.assignFor.set(null);
      this.overlays.toast(target === 'new' ? 'Role assigned' : 'Role changed', {
        sub: `${role?.name ?? ''} · recorded`,
      });
      await this.load();
    } catch (err) {
      if (
        err instanceof ApiProblem &&
        ['IDN.ACCOUNT_EMAIL_UNKNOWN', 'IDN.ACCOUNT_IS_INSTITUTION'].includes(err.code)
      ) {
        this.formError.set({ email: err.detail });
      } else {
        this.failed(err, "Couldn't save");
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected async toggleAccount(a: OperatorAccount) {
    const disable = a.status === 'ACTIVE';
    const ok = await this.overlays.confirm({
      title: `${disable ? 'Disable' : 'Enable'} ${a.name}?`,
      text: disable
        ? "Their sessions end immediately and they can't sign in to the back office."
        : 'They can sign in again with their password and a one-time code.',
      ok: disable ? 'Disable account' : 'Enable account',
      tone: disable ? 'bad' : 'brand',
      reason: { label: 'Reason (recorded)', min: 5 },
    });
    if (!ok || !ok.reason) return;
    try {
      await this.api.changeAccount(a, {
        status: disable ? 'INACTIVE' : 'ACTIVE',
        reason: ok.reason,
      });
      this.overlays.toast(`${a.name} ${disable ? 'disabled' : 'enabled'}`);
      await this.load();
    } catch (e) {
      this.failed(e, `Couldn't update ${a.name}`);
    }
  }

  protected async release(a: OperatorAccount) {
    const ok = await this.overlays.confirm({
      title: `Release ${a.name}'s sign-in lock?`,
      text: 'They can sign in again with their password and a one-time code. The lock and its counts start again.',
      ok: 'Release lock',
      tone: 'brand',
      icon: 'unlock',
      reason: { label: 'Reason (recorded)', placeholder: 'e.g. Confirmed by phone', min: 5 },
    });
    if (!ok || !ok.reason) return;
    try {
      await this.api.unlock(a, ok.reason);
      this.overlays.toast(`${a.name} can sign in again`, { sub: 'Lock released · recorded' });
      await this.load();
    } catch (e) {
      this.failed(e, "Couldn't release the lock");
    }
  }
}
