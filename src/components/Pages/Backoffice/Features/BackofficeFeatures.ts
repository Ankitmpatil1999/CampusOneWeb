import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Card, Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDateTime, titleCase } from '../../../Utils/format';
import type { IconName } from '../../../Utils/icons';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import {
  InstitutionsApi,
  type ChannelRow,
  type FeatureChange,
  type FeaturePermissions,
  type FeatureRow,
  type InstitutionRow,
} from '../Institutions/institutions.api';

const STATUS: Record<string, { label: string; tone: string }> = {
  ACTIVE: { label: 'Active', tone: 'ok' },
  PENDING_ACTIVATION: { label: 'Pending activation', tone: 'warn' },
  SUSPENDED: { label: 'Suspended', tone: 'bad' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

/**
 * o.features — feature permissions of one institution (SRS 7.5; FR-INS-04, FR-SAS-05; INS-007…009;
 * prototype o.features): money and campus features and the notification channels, each locked when
 * the plan doesn't include it; every switch asks to confirm (reason optional) and is recorded in the
 * change record below.
 */
@Component({
  selector: 'rp-backoffice-features',
  imports: [Card, Empty, Icon, NgTemplateOutlet, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Feature permissions"
        sub="Switch features on or off for one institution. A feature outside the institution's plan stays locked."
      />
      @if (error()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the features" [text]="error()" />
        </div>
      } @else if (view(); as v) {
        <div class="c-filters">
          <div class="fld">
            <div class="fld-in">
              <select id="ob-fti" aria-label="Institution" (change)="choose($event)">
                @for (i of institutions(); track i.id) {
                  <option [value]="i.id" [selected]="i.id === v.institution.id">
                    {{ i.name }} · {{ statusOf(i.status).label }}
                  </option>
                }
              </select>
            </div>
          </div>
          <span class="fsum row g6"
            ><span class="chip dot" [class]="'tone-' + statusOf(v.institution.status).tone">{{
              statusOf(v.institution.status).label
            }}</span>
            <span class="tag"
              ><rp-icon name="layers" [size]="12" />{{ v.plan?.name ?? 'No plan' }}</span
            ></span
          >
        </div>
        @if (frozen()) {
          <div class="note tone-warn">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">
              {{ v.institution.name }} is cancelled — its configuration is frozen.
            </div>
          </div>
        } @else if (v.institution.status === 'SUSPENDED') {
          <div class="note tone-warn">
            <rp-icon name="alert" [size]="17" />
            <div class="grow">
              {{ v.institution.name }} is suspended. Changes are saved and take effect when it's
              reactivated.
            </div>
          </div>
        }
        @if (!canEdit()) {
          <div class="note tone-warn">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">
              Your role doesn't hold “Change feature permissions”. Ask a Platform Administrator to
              grant it in Roles & tasks.
            </div>
          </div>
        }
        <div class="c-grid k2">
          <ng-container
            *ngTemplateOutlet="group; context: { $implicit: 'Money', rows: money() }"
          ></ng-container>
          <div class="stack g16">
            <ng-container
              *ngTemplateOutlet="group; context: { $implicit: 'Campus', rows: campus() }"
            ></ng-container>
            <div class="fs">
              <h4><rp-icon name="bell" [size]="15" /> Notification channels</h4>
              <div class="fs-b" style="padding: 4px 18px">
                <div class="list plain">
                  @for (c of v.channels; track c.key) {
                    <div class="li ob-frow" [class.locked]="c.lock?.kind === 'PLAN'">
                      <span class="li-main"
                        ><span class="li-t wrap">{{ c.label }}</span
                        ><span class="li-s wrap">{{ channelSub(c, v) }}</span></span
                      >
                      @if (c.lock && c.lock.kind !== 'ALWAYS_ON') {
                        <span class="chip tone-neutral" [attr.title]="c.lock.text"
                          ><rp-icon name="lock" [size]="12" />{{ c.lock.text }}</span
                        >
                      }
                      <button
                        type="button"
                        class="toggle"
                        role="switch"
                        [attr.aria-checked]="c.enabled"
                        [attr.aria-label]="c.label + ' notifications'"
                        [disabled]="c.lock?.kind === 'PLAN' || !canEdit() || frozen()"
                        (click)="toggleChannel(c)"
                      ></button>
                    </div>
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="note tone-info">
          <rp-icon name="info" [size]="17" />
          <div class="grow">
            A disabled feature is hidden from the institution's menus and its operations are refused
            (FR-INS-04). Features locked by the plan open up after a plan change.
          </div>
        </div>
        <rp-card title="Change record" icon="history" [plainIcon]="true">
          @if (log().length) {
            <div class="tbl-wrap">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Feature</th>
                    <th>Change</th>
                    <th>By</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  @for (x of logPage(); track x.id) {
                    <tr>
                      <td>{{ dt(x.at) }}</td>
                      <td>{{ x.label }}</td>
                      <td>
                        {{ x.from ? 'On' : 'Off' }} → <b>{{ x.to ? 'On' : 'Off' }}</b>
                      </td>
                      <td>{{ name(x.by) }}</td>
                      <td>
                        @if (x.reason) {
                          {{ x.reason }}
                        } @else {
                          <span class="t-muted">—</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="pager">
              <span>{{ log().length }} change{{ log().length === 1 ? '' : 's' }}</span>
            </div>
          } @else {
            <rp-empty
              icon="history"
              title="No changes recorded yet"
              text="Every change is recorded with who made it, when and why."
            />
          }
        </rp-card>
      } @else {
        <div class="card pad"><rp-empty icon="hourglass" title="Loading…" /></div>
      }
    </div>

    <ng-template #group let-g let-rows="rows">
      <div class="fs">
        <h4>
          <rp-icon [name]="groupIcon(g)" [size]="15" />
          {{ g === 'Money' ? 'Money features' : 'Campus features' }}
        </h4>
        <div class="fs-b" style="padding: 4px 18px">
          <div class="list plain">
            @for (f of asFeatures(rows); track f.key) {
              <div class="li ob-frow" [class.locked]="f.lock">
                <span class="li-main"
                  ><span class="li-t wrap"
                    >{{ f.label }}
                    @if (f.cr) {
                      <span class="srs cr" title="Version 2.1 change request">{{ f.cr }}</span>
                    }</span
                  ><span class="li-s wrap"
                    >{{ f.sub }}{{ f.module ? ' · module: ' + f.module : '' }}</span
                  ></span
                >
                @if (f.lock) {
                  <span class="chip tone-neutral" [attr.title]="f.lock.text"
                    ><rp-icon name="lock" [size]="12" />{{ f.lock.text }}</span
                  >
                }
                <button
                  type="button"
                  class="toggle"
                  role="switch"
                  [attr.aria-checked]="f.enabled"
                  [attr.aria-label]="f.label"
                  [disabled]="!!f.lock || !canEdit() || frozen()"
                  (click)="toggleFeature(f)"
                ></button>
              </div>
            }
          </div>
        </div>
      </div>
    </ng-template>
  `,
})
export class BackofficeFeatures {
  private readonly api = inject(InstitutionsApi);
  private readonly overlays = inject(Overlays);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(SessionContext).ops;

  protected readonly error = signal('');
  protected readonly institutions = signal<readonly InstitutionRow[]>([]);
  protected readonly view = signal<FeaturePermissions | null>(null);
  protected readonly log = signal<readonly FeatureChange[]>([]);
  protected readonly canEdit = computed(
    () => this.session()?.subTasks.includes('features.edit') ?? false,
  );
  protected readonly frozen = computed(() => this.view()?.institution.status === 'CANCELLED');
  protected readonly money = computed(
    () => this.view()?.features.filter((f) => f.group === 'Money') ?? [],
  );
  protected readonly campus = computed(
    () => this.view()?.features.filter((f) => f.group === 'Campus') ?? [],
  );
  protected readonly logPage = computed(() => this.log().slice(0, 8));

  constructor() {
    void this.init();
  }

  private async init() {
    try {
      const list = (await this.api.list()).items;
      this.institutions.set(list);
      const wanted = this.route.snapshot.queryParamMap.get('inst');
      const tvps = list.find((i) => i.shortName === 'TVPS');
      const id = list.find((i) => i.id === wanted)?.id ?? tvps?.id ?? list[0]?.id;
      if (id) await this.show(id);
      else this.error.set('No institution is registered yet.');
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  private async show(id: string) {
    const [view, log] = await Promise.all([this.api.features(id), this.api.featureLog(id)]);
    this.view.set(view);
    this.log.set(log.items);
  }

  protected statusOf(s: string) {
    return STATUS[s] ?? { label: s, tone: 'neutral' };
  }
  protected groupIcon(g: string): IconName {
    return g === 'Money' ? 'wallet' : 'school';
  }
  protected asFeatures(rows: unknown) {
    return rows as readonly FeatureRow[];
  }
  protected name(n: string) {
    return titleCase(n);
  }
  protected dt(v: string) {
    return formatDateTime(v);
  }
  protected channelSub(c: ChannelRow, v: FeaturePermissions) {
    const plan = v.plan?.name ?? 'the plan';
    if (c.allowance === null) return 'Included in every plan';
    return c.allowance
      ? `${new Intl.NumberFormat('en-IN').format(c.allowance)} per month on ${plan}`
      : `No ${c.label} allowance on ${plan}`;
  }

  protected async choose(e: Event) {
    const id = (e.target as HTMLSelectElement).value;
    void this.router.navigate([], { queryParams: { inst: id }, replaceUrl: true });
    await this.show(id);
  }

  protected toggleFeature(f: FeatureRow) {
    const v = this.view();
    if (!v) return;
    const deps = !f.enabled
      ? []
      : v.features.filter((x) => x.lock === null && x.enabled && this.needs(x, f));
    void this.change(
      f.key,
      f.label,
      !f.enabled,
      deps.map((d) => d.label),
    );
  }

  private needs(x: FeatureRow, f: FeatureRow) {
    return x.key === 'feeConsent' && f.key === 'tuition';
  }

  protected toggleChannel(c: ChannelRow) {
    if (c.lock?.kind === 'ALWAYS_ON') {
      this.overlays.toast(c.lock.text, { tone: 'info' });
      return;
    }
    void this.change(`channel.${c.key}`, `${c.label} notifications`, !c.enabled, []);
  }

  private async change(key: string, label: string, to: boolean, deps: readonly string[]) {
    const v = this.view();
    if (!v) return;
    const ok = await this.overlays.confirm({
      title: `${to ? 'Turn on' : 'Turn off'} ${label} for ${v.institution.name}?`,
      text: to
        ? 'Members see it in their menus from their next screen.'
        : `Members stop seeing it and its operations are refused (FR-INS-04).${deps.length ? ` ${deps.join(', ')} will also be turned off.` : ''}`,
      ok: to ? 'Turn on' : 'Turn off',
      tone: to ? 'brand' : 'warn',
      reason: {
        label: 'Reason (recorded)',
        placeholder: 'Optional — e.g. Requested by the principal',
        required: false,
      },
    });
    if (!ok) return;
    try {
      const next = await this.api.changeFeatures(
        v.institution.id,
        v.version,
        [{ key, enabled: to }],
        ok.reason,
      );
      this.view.set(next);
      this.log.set((await this.api.featureLog(v.institution.id)).items);
      this.overlays.toast(`${label} ${to ? 'on' : 'off'} for ${v.institution.shortName}`, {
        sub: 'Recorded in the change record',
      });
    } catch (e) {
      this.overlays.toast('Not changed', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
      if (e instanceof ApiProblem && e.status === 412) await this.show(v.institution.id);
    }
  }
}
