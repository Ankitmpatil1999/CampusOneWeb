import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDateTime, titleCase } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import type { MemberDetail } from './members.api';
import {
  StaffAccountsApi,
  roleFits,
  type ConsoleRole,
  type StaffAccount,
} from './staff-accounts.api';

const NO_TASK = "Your role doesn't include this task.";
const MAX_ROLES = 10;

/**
 * A staff member's console access in the member drawer's Account tab (SRS 6.28, CR-05; IDN-038,
 * IDN-060…062): the institution roles they hold — each switched on or off with a confirmation, the
 * prototype's toggle rows — their last console sign-in and the sign-in lock, released with a
 * recorded reason. The Institution Administrator role is CampusOne's to give, so its switch is locked.
 */
@Component({
  selector: 'rp-member-console-access',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="fs">
      <h4>
        <rp-icon name="key" [size]="15" /> Console access
        <span class="srs cr" title="Version 2.1 change request">CR-05</span>
      </h4>
      <div class="fs-b stack g12">
        @if (error()) {
          <div class="note tone-bad">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
            <button type="button" class="btn btn-sec btn-sm" (click)="reload()">
              <span>Try again</span>
            </button>
          </div>
        } @else if (!canRoles()) {
          <dl class="kv">
            <dt>Console roles</dt>
            <dd>{{ memberRoles() || 'No console role' }}</dd>
          </dl>
          @if (canUnlock()) {
            <div>
              <button type="button" class="btn btn-sec" (click)="unlock()">
                <rp-icon name="unlock" [size]="17" /><span>Release a sign-in lock…</span>
              </button>
            </div>
          }
          <p class="t-xs t-muted">
            Assigning console roles needs “Assign console roles” in your role.
          </p>
        } @else if (loading()) {
          <p class="t-sm t-muted">Loading console access…</p>
        } @else if (!account()) {
          <div class="note tone-neutral">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              No CampusOne account yet. Console roles can be given once
              {{ first() }} signs up with the mobile number on the profile.
            </div>
          </div>
        } @else {
          @if (account(); as a) {
            <dl class="kv">
              <dt>Last console sign-in</dt>
              <dd>{{ a.lastSignInAt ? dt(a.lastSignInAt) : 'Never signed in' }}</dd>
              <dt>Sign-in</dt>
              <dd>
                @if (a.locked) {
                  <span class="chip dot tone-bad">Locked</span>
                } @else {
                  <span class="chip dot tone-ok">Not locked</span>
                }
              </dd>
            </dl>
            @if (a.locked) {
              <div class="note tone-warn">
                <rp-icon name="lock" [size]="17" />
                <div class="grow">
                  Locked after abandoned codes or wrong passwords. Release the lock once you know
                  the attempts were theirs; the release and your reason are recorded.
                </div>
                <span class="cp-why" [attr.title]="unlockWhy() || null"
                  ><button
                    type="button"
                    class="btn btn-sec btn-sm"
                    id="cp-ca-unlock"
                    [disabled]="!!unlockWhy() || busy()"
                    (click)="unlock()"
                  >
                    <rp-icon name="unlock" [size]="15" /><span>Release lock…</span>
                  </button></span
                >
              </div>
            }
            <div class="list" id="cp-ca-roles">
              @for (r of shownRoles(); track r.id) {
                <div class="li" style="min-height: 52px">
                  <span class="li-ic sm"><rp-icon name="key" [size]="16" /></span>
                  <span class="li-main"
                    ><span class="li-t wrap"
                      >{{ r.name }}
                      @if (r.readOnly) {
                        <span class="tag">Read-only</span>
                      }</span
                    ><span class="li-s wrap">{{ about(r) }}</span></span
                  >
                  <span class="cp-why" [attr.title]="roleWhy(r) || null"
                    ><button
                      type="button"
                      class="toggle"
                      role="switch"
                      [attr.aria-checked]="holds(r) ? 'true' : 'false'"
                      [attr.aria-label]="'Console role ' + r.name"
                      [disabled]="!!roleWhy(r) || busy()"
                      (click)="toggleRole(r)"
                    ></button
                  ></span>
                </div>
              } @empty {
                <p class="t-sm t-muted">No institution roles are enabled.</p>
              }
            </div>
            <p class="t-xs t-muted">
              New roles apply at the next sign-in; taking a role away ends the console sessions
              straight away. CampusOne gives and takes away the Institution Administrator role.
            </p>
          }
        }
      </div>
    </div>
  `,
})
export class MemberConsoleAccess {
  private readonly api = inject(StaffAccountsApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  readonly member = input.required<MemberDetail>();
  /** The read-only note of a Management role ('' when changes are allowed). */
  readonly readOnly = input('');
  /** Roles changed or a lock released: the drawer reloads the member (roles, history). */
  readonly changed = output<void>();

  protected readonly roles = signal<readonly ConsoleRole[]>([]);
  protected readonly account = signal<StaffAccount | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  private seq = 0;

  /**
   * The roles that fit the profile (client 2026-10-13): a merchant sees only its Merchant or Vendor
   * merchant role, the principal also the Principal role; a role already held always shows.
   */
  protected readonly shownRoles = computed(() => {
    const a = this.account();
    return this.roles().filter((r) => !a || this.holds(r) || roleFits(r, a));
  });
  protected readonly canRoles = computed(() => this.can('members.roles'));
  protected readonly canUnlock = computed(() => this.can('members.unlock') && !this.readOnly());
  protected readonly unlockWhy = computed(
    () => this.readOnly() || (this.can('members.unlock') ? '' : NO_TASK),
  );
  protected readonly first = computed(() => titleCase(this.member().firstName));
  protected readonly memberRoles = computed(() =>
    this.member()
      .roles.map((r) => r.name)
      .join(', '),
  );

  /** Only another member (not a reload of the same one) starts over. */
  private readonly memberId = computed(() => this.member().id);

  constructor() {
    effect(() => {
      this.memberId();
      untracked(() => void this.load());
    });
  }

  private async load() {
    if (!this.canRoles()) {
      this.loading.set(false);
      return;
    }
    const id = ++this.seq;
    this.loading.set(true);
    try {
      const [roles, accounts] = await Promise.all([this.api.roles(), this.api.accounts()]);
      if (id !== this.seq) return;
      this.roles.set(roles.items);
      this.account.set(accounts.items.find((a) => a.id === this.member().id) ?? null);
      this.error.set('');
    } catch (e) {
      if (id === this.seq) {
        this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      if (id === this.seq) this.loading.set(false);
    }
  }

  protected reload() {
    void this.load();
  }

  protected holds(r: ConsoleRole) {
    return this.account()?.roles.some((x) => x.id === r.id) ?? false;
  }

  protected roleWhy(r: ConsoleRole) {
    if (this.readOnly()) return this.readOnly();
    if (!this.can('members.roles')) return NO_TASK;
    if (!r.assignable) return 'CampusOne gives and takes away the Institution Administrator role.';
    const held = this.account()?.roles.length ?? 0;
    if (!this.holds(r) && held >= MAX_ROLES) {
      return `A person can hold at most ${MAX_ROLES} console roles.`;
    }
    return '';
  }

  protected about(r: ConsoleRole) {
    const n = r.tasks.length;
    const tasks = `${n} task${n === 1 ? '' : 's'}`;
    return r.description ? `${r.description} · ${tasks}` : tasks;
  }

  /** IDN-061: the whole set is sent; a role taken away ends the console sessions. */
  protected async toggleRole(r: ConsoleRole) {
    const a = this.account();
    if (!a || this.roleWhy(r) || this.busy()) return;
    const m = this.member();
    const name = titleCase(m.name);
    const first = titleCase(m.firstName);
    const give = !this.holds(r);
    const ok = await this.overlays.confirm(
      give
        ? {
            title: `Give ${r.name} to ${name}?`,
            text: `${first} gets this role's tasks in the console at the next sign-in.`,
            ok: 'Give role',
            tone: 'brand',
            icon: 'key',
          }
        : {
            title: `Take ${r.name} from ${name}?`,
            text: `${first}'s console sessions end now. Any other roles stay.`,
            ok: 'Take away',
            tone: 'warn',
          },
    );
    if (!ok) return;
    const ids = give
      ? [...a.roles.map((x) => x.id), r.id]
      : a.roles.map((x) => x.id).filter((x) => x !== r.id);
    this.busy.set(true);
    try {
      const saved = await this.api.setRoles(a.id, ids);
      this.account.set(saved);
      this.overlays.toast(give ? 'Role given' : 'Role taken away', {
        sub: `${name} · ${saved.roles.map((x) => x.name).join(', ') || 'no console role'}`,
      });
      this.changed.emit();
    } catch (e) {
      this.overlays.toast('Roles not changed', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    } finally {
      this.busy.set(false);
    }
  }

  /** IDN-038: releases the sign-in lock with a recorded reason. */
  protected async unlock() {
    if (this.unlockWhy() || this.busy()) return;
    const m = this.member();
    const name = titleCase(m.name);
    const ok = await this.overlays.confirm({
      title: `Release the sign-in lock for ${name}?`,
      text: `${titleCase(m.firstName)} can sign in to the console again straight away. The release and your reason are recorded.`,
      ok: 'Release lock',
      tone: 'brand',
      icon: 'unlock',
      reason: {
        label: 'Reason (recorded)',
        placeholder: 'e.g. Confirmed by phone that the attempts were theirs',
        min: 5,
        max: 300,
      },
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      await this.api.unlock(m.id, ok.reason ?? '');
      this.overlays.toast('Sign-in lock released', { sub: name });
      this.changed.emit();
      await this.load();
    } catch (e) {
      this.overlays.toast('Lock not released', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    } finally {
      this.busy.set(false);
    }
  }

  private can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }
  protected dt(v: string) {
    return formatDateTime(v);
  }
}
