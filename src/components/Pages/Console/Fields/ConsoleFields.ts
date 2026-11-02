import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Dropdown } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, titleCase } from '../../../Utils/format';
import type { IconName } from '../../../Utils/icons';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import {
  InstitutionSetupApi,
  type CfEntity,
  type CfType,
  type CustomField,
} from '../Institution/institution.api';

const ENTITIES: readonly { v: CfEntity; l: string }[] = [
  { v: 'MEMBER', l: 'Member' },
  { v: 'FEE_STRUCTURE', l: 'Fee structure' },
  { v: 'ADMISSION_APPLICATION', l: 'Admission application' },
  { v: 'MERCHANT', l: 'Merchant' },
];
const TYPES: readonly { v: CfType; l: string; icon: IconName }[] = [
  { v: 'TEXT', l: 'Text', icon: 'field' },
  { v: 'LONG_TEXT', l: 'Long text', icon: 'filetext' },
  { v: 'NUMBER', l: 'Number', icon: 'hash' },
  { v: 'DATE', l: 'Date', icon: 'calendar' },
  { v: 'DROPDOWN', l: 'Dropdown', icon: 'down' },
  { v: 'MULTI_SELECT', l: 'Multi-select', icon: 'listck' },
  { v: 'YES_NO', l: 'Yes/No', icon: 'toggle' },
  { v: 'EMAIL', l: 'E-mail', icon: 'mail' },
  { v: 'PHONE', l: 'Phone', icon: 'phone' },
];
const OPTION_TYPES: readonly CfType[] = ['DROPDOWN', 'MULTI_SELECT'];
const FILTER_TYPES: readonly CfType[] = ['DROPDOWN', 'MULTI_SELECT', 'YES_NO'];
/** Words that suggest an identity-document number (prototype ID_WORDS; RNG-ONB-114). */
const ID_WORDS =
  /\b(aadh?aar|pan\b|pan (no|number|card)|passport|voter|driving licen[cs]e|ration card|uid|identity (number|document|card)|id (no|number|proof))/i;

interface Draft {
  readonly field: CustomField | null;
  readonly label: string;
  readonly entity: CfEntity;
  readonly type: CfType;
  readonly options: string;
  readonly required: boolean;
  readonly unique: boolean;
  readonly listColumn: boolean;
  readonly filter: boolean;
  readonly active: boolean;
  readonly ack: boolean;
}

/**
 * c.fields — Custom fields (CR-12; SRS 7.12.1, RNG-ONB-101…115; INS-017…019; prototype c.fields):
 * the institution's own fields on members, fee structures, admission applications and merchants,
 * shown as one "Institution fields" group at the end of each form. A limit of active fields per
 * entity, the identity-document acknowledgement, a live preview; fields are deactivated, never
 * deleted, and their type and entity are fixed once values exist.
 */
@Component({
  selector: 'rp-console-fields',
  imports: [Dropdown, Empty, Icon, Modal, NgTemplateOutlet, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Custom fields"
        sub="Fields your institution adds to members, fee structures, admission applications and merchants. They appear as one “Institution fields” group at the end of each form."
      >
        @if (readOnly()) {
          <span class="cp-why" [attr.title]="readOnly()"
            ><button type="button" class="btn btn-pri" disabled>
              <rp-icon name="plus" [size]="17" /><span>New field</span>
            </button></span
          >
        } @else {
          <button type="button" class="btn btn-pri" (click)="edit(null)">
            <rp-icon name="plus" [size]="17" /><span>New field</span>
          </button>
        }
      </rp-page-head>
      @if (error()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the fields" [text]="error()" />
        </div>
      } @else {
        <div class="c-grid k4">
          @for (e of entities; track e.v) {
            <button
              type="button"
              class="kpi hover cp-entk"
              [class.on]="ent() === e.v"
              (click)="ent.set(ent() === e.v ? '' : e.v); page.set(1)"
            >
              <span class="k-l">{{ e.l }}</span>
              <span class="k-v"
                >{{ activeOf(e.v)
                }}<small class="t-sm t-muted" style="font-family: var(--f-body); font-weight: 500">
                  / {{ max() }} active</small
                ></span
              >
              <div class="bar" [class.bad]="activeOf(e.v) >= max()">
                <i [style.width.%]="(activeOf(e.v) * 100) / max()"></i>
              </div>
            </button>
          }
        </div>
        <div class="c-filters">
          <label class="search"
            ><rp-icon name="search" [size]="16" /><input
              type="search"
              placeholder="Find a field"
              autocomplete="off"
              [value]="q()"
              (input)="q.set(value($event)); page.set(1)"
          /></label>
          <div class="pills">
            <button
              type="button"
              class="pill"
              [class.on]="!ent()"
              (click)="ent.set(''); page.set(1)"
            >
              All entities<span class="n">{{ fields().length }}</span>
            </button>
            @for (e of entities; track e.v) {
              <button
                type="button"
                class="pill"
                [class.on]="ent() === e.v"
                (click)="ent.set(e.v); page.set(1)"
              >
                {{ e.l }}<span class="n">{{ countOf(e.v) }}</span>
              </button>
            }
          </div>
          <div class="seg">
            <span
              class="seg-ind"
              [style.width]="'calc((100% - 10px) / 3)'"
              [style.left]="'calc(3px + ' + segIndex() + ' * ((100% - 10px) / 3 + 2px))'"
            ></span>
            @for (s of statuses; track s.v) {
              <button
                type="button"
                [class.on]="stat() === s.v"
                (click)="stat.set(s.v); page.set(1)"
              >
                {{ s.l }}
              </button>
            }
          </div>
        </div>
        @if (readOnly()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow"><b>Read-only.</b> {{ readOnly() }}</div>
          </div>
        }
        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>Field</th>
                <th>Entity</th>
                <th>Rules</th>
                <th class="r">Values</th>
                <th>Status</th>
                <th>Defined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (f of shown(); track f.id) {
                <tr
                  [class.cp-dim]="f.status !== 'ACTIVE'"
                  tabindex="0"
                  (click)="edit(f)"
                  (keydown.enter)="edit(f)"
                >
                  <td>
                    <div class="cell-main">
                      <span class="li-ic sm"
                        ><rp-icon [name]="typeIcon(f.type)" [size]="15"
                      /></span>
                      <div>
                        <div class="cell-t">{{ f.label }}</div>
                        <div class="cell-s">
                          {{ f.typeLabel
                          }}{{ f.options.length ? ' · ' + f.options.length + ' options' : '' }}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{{ f.entityLabel }}</td>
                  <td>
                    @for (r of rules(f); track r) {
                      <span class="tag">{{ r }}</span
                      >{{ ' ' }}
                    } @empty {
                      <span class="t-faint">—</span>
                    }
                  </td>
                  <td class="r">{{ f.values }}</td>
                  <td>
                    @if (f.status === 'ACTIVE') {
                      <span class="chip tone-ok dot">Active</span>
                    } @else {
                      <span class="chip tone-neutral dot">Inactive</span>
                      <div class="t-xs t-muted">values kept</div>
                    }
                  </td>
                  <td>
                    <div class="t-sm cp-nw">{{ name(f.definedBy) }}</div>
                    <div class="t-xs t-muted cp-nw">{{ date(f.definedAt) }}</div>
                  </td>
                  <td>
                    @if (!readOnly()) {
                      <div class="row-acts">
                        @if (f.status === 'ACTIVE') {
                          <button
                            type="button"
                            class="btn btn-ghost btn-xs"
                            (click)="$event.stopPropagation(); deactivate(f)"
                          >
                            <span>Deactivate</span>
                          </button>
                        } @else {
                          <button
                            type="button"
                            class="btn btn-soft btn-xs"
                            (click)="$event.stopPropagation(); reactivate(f)"
                          >
                            <span>Reactivate</span>
                          </button>
                        }
                      </div>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="7">
                    <rp-empty
                      icon="field"
                      title="No fields match"
                      text="Try another entity or status, or define a new field."
                    />
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (rows().length > 12) {
          <div class="pager">
            <span
              >Showing <b class="t-num">{{ (page() - 1) * 12 + 1 }}–{{ last() }}</b> of
              <b class="t-num">{{ rows().length }}</b></span
            >
            <div class="pg">
              <button type="button" [disabled]="page() <= 1" (click)="page.set(page() - 1)">
                <rp-icon name="left" [size]="14" />
              </button>
              <button type="button" class="on">{{ page() }}</button>
              <button
                type="button"
                [disabled]="last() >= rows().length"
                (click)="page.set(page() + 1)"
              >
                <rp-icon name="right" [size]="14" />
              </button>
            </div>
          </div>
        } @else if (rows().length) {
          <div class="pager">
            <span>{{ rows().length }} field{{ rows().length === 1 ? '' : 's' }}</span>
          </div>
        }
        <div class="c-grid k2">
          <div class="note tone-warn">
            <rp-icon name="shieldx" [size]="17" />
            <div class="grow">
              <b>Identity-document numbers are not allowed.</b> A custom field must never capture
              Aadhaar, PAN, passport or similar numbers; definers acknowledge this and fields found
              in breach are deactivated, not deleted (OI-GAS-27).
            </div>
          </div>
          <div class="note tone-info">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              <b>Limits.</b> Up to {{ max() }} active fields per entity (OI-ONB-16). Unique values
              are checked across all of the institution's records. A deactivated field disappears
              from forms and lists; its values are kept and shown marked.
            </div>
          </div>
        </div>
      }
    </div>

    @if (draft(); as d) {
      <rp-modal
        [title]="d.field ? 'Edit “' + d.field.label + '”' : 'New custom field'"
        [sub]="drawerSub(d)"
        [drawer]="true"
        (closed)="draft.set(null)"
      >
        <div class="stack g16" id="cp-fdf">
          <div class="c-form">
            <div class="fld" [class.invalid]="err('label')">
              <label class="fld-l" for="cp-fd-label"
                >Label<span class="req">*</span
                ><span class="count">{{ d.label.length }}/40</span></label
              >
              <div class="fld-in">
                <input
                  id="cp-fd-label"
                  maxlength="40"
                  placeholder="e.g. House"
                  [value]="d.label"
                  (input)="patch({ label: value($event) }, 'label')"
                />
              </div>
              <div class="fld-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('label') }}</span>
              </div>
            </div>
            <div class="fld" [class.invalid]="err('entity')">
              <label class="fld-l" for="cp-fd-ent-b">Entity<span class="req">*</span></label>
              <rp-dd
                inputId="cp-fd-ent"
                [options]="entityOptions()"
                [value]="d.entity"
                [disabled]="fixed(d)"
                (changed)="patch({ entity: $any($event) }, 'entity')"
              />
              <div class="fld-e" id="cp-fd-ent-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('entity') }}</span>
              </div>
              @if (fixed(d)) {
                <div class="fld-h">Fixed — values have been captured</div>
              }
            </div>
          </div>
          <div class="fld">
            <span class="fld-l"
              >Data type<span class="req">*</span>
              @if (fixed(d)) {
                <span class="opt">fixed — {{ d.field!.values }} values captured</span>
              }
            </span>
            <div class="cp-types">
              @for (t of types; track t.v) {
                <div
                  class="choice"
                  [class.on]="d.type === t.v"
                  [class.off]="fixed(d) && d.type !== t.v"
                  tabindex="0"
                  role="radio"
                  [attr.aria-checked]="d.type === t.v"
                  (click)="pickType(d, t.v)"
                  (keydown.enter)="pickType(d, t.v)"
                >
                  <span class="li-ic sm"><rp-icon [name]="t.icon" [size]="17" /></span>
                  <span class="grow"
                    ><span class="t-h4" style="display: block">{{ t.l }}</span></span
                  >
                  <span class="radio"></span>
                </div>
              }
            </div>
          </div>
          @if (hasOptions(d.type)) {
            <div class="fld" [class.invalid]="err('options')">
              <label class="fld-l" for="cp-fd-opts">Options<span class="req">*</span></label>
              <div class="fld-in">
                <textarea
                  id="cp-fd-opts"
                  rows="4"
                  placeholder="One option per line"
                  [value]="d.options"
                  (input)="patch({ options: value($event) }, 'options')"
                ></textarea>
              </div>
              <div class="fld-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('options') }}</span>
              </div>
              <div class="fld-h">
                At least two, each different. Removing an option keeps values already captured.
              </div>
            </div>
          }
          <div class="cp-rules">
            @for (r of ruleChecks; track r.k) {
              <label class="chk"
                ><input type="checkbox" [checked]="d[r.k]" (change)="setRule(r.k, $event)" /><span
                  ><b>{{ r.t }}</b
                  ><br /><span class="t-xs t-muted">{{ r.s }}</span></span
                ></label
              >
            }
          </div>
          @if (err('rules')) {
            <div class="note tone-warn">
              <rp-icon name="alert" [size]="17" />
              <div class="grow">{{ err('rules') }}</div>
            </div>
          }
          <div class="fld cp-ack" [class.invalid]="err('ack')">
            <label class="chk"
              ><input
                type="checkbox"
                [checked]="d.ack"
                (change)="patch({ ack: checked($event) }, 'ack')"
              /><span
                >I confirm this field won't be used to capture identity-document numbers such as
                Aadhaar, PAN, passport or voter ID.
                <span class="srs" title="SRS reference">RNG-ONB-114</span></span
              ></label
            >
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('ack') }}</span>
            </div>
          </div>
          <div>
            <div class="row between">
              <span class="eyebrow">Live preview</span
              ><span class="t-xs t-muted">End of the {{ entityLabel(d.entity) }} form</span>
            </div>
            <div class="mt8">
              @if (preview(d).length) {
                <div class="fs cp-cfg">
                  <h4><rp-icon name="field" [size]="16" /> Institution fields</h4>
                  <div class="fs-b">
                    <div class="c-form">
                      @for (p of preview(d); track p.key) {
                        <div [class.cp-draft]="p.draft" [class.full]="p.full">
                          @switch (p.type) {
                            @case ('DROPDOWN') {
                              <div class="fld">
                                <span class="fld-l"
                                  >{{ p.label }}
                                  @if (p.required) {
                                    <span class="req">*</span>
                                  }
                                </span>
                                <div class="dd is-disabled">
                                  <button type="button" class="dd-btn" disabled>
                                    <span class="lbl ph">Select</span
                                    ><span class="caret"><rp-icon name="down" [size]="16" /></span>
                                  </button>
                                </div>
                                @if (p.hint) {
                                  <div class="fld-h">{{ p.hint }}</div>
                                }
                              </div>
                            }
                            @case ('MULTI_SELECT') {
                              <ng-container
                                *ngTemplateOutlet="opts; context: { $implicit: p, radio: false }"
                              />
                            }
                            @case ('YES_NO') {
                              <ng-container
                                *ngTemplateOutlet="opts; context: { $implicit: p, radio: true }"
                              />
                            }
                            @default {
                              <div class="fld">
                                <span class="fld-l"
                                  >{{ p.label }}
                                  @if (p.required) {
                                    <span class="req">*</span>
                                  }
                                </span>
                                <div class="fld-in">
                                  @if (p.type === 'PHONE') {
                                    <span class="pre">+91</span>
                                  }
                                  @if (p.type === 'LONG_TEXT') {
                                    <textarea rows="3" [disabled]="!p.draft"></textarea>
                                  } @else {
                                    <input
                                      [type]="
                                        p.type === 'DATE'
                                          ? 'date'
                                          : p.type === 'EMAIL'
                                            ? 'email'
                                            : 'text'
                                      "
                                      [attr.placeholder]="
                                        p.type === 'EMAIL' ? 'name@example.com' : null
                                      "
                                      [disabled]="!p.draft"
                                    />
                                  }
                                </div>
                                @if (p.hint) {
                                  <div class="fld-h">{{ p.hint }}</div>
                                }
                              </div>
                            }
                          }
                        </div>
                      }
                    </div>
                  </div>
                </div>
              } @else {
                <p class="t-sm t-muted">No active fields for {{ entityLabel(d.entity) }} yet.</p>
              }
            </div>
          </div>
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="draft.set(null)">
            <span>Cancel</span>
          </button>
          <button type="button" class="btn btn-pri" [class.is-busy]="busy()" (click)="save()">
            <rp-icon name="check" [size]="17" /><span>{{
              d.field ? 'Save field' : 'Create field'
            }}</span>
          </button>
        </ng-container>
      </rp-modal>
    }

    <ng-template #opts let-p let-radio="radio">
      <div class="fld" [class.full]="!radio">
        <span class="fld-l"
          >{{ p.label }}
          @if (p.required) {
            <span class="req">*</span>
          }
        </span>
        <div class="cp-opts">
          @for (o of radio ? yesNo : p.options; track o) {
            <label class="chk"
              ><input
                [type]="radio ? 'radio' : 'checkbox'"
                [disabled]="!p.draft"
                [name]="p.key"
              /><span>{{ o }}</span></label
            >
          }
        </div>
        @if (p.hint) {
          <div class="fld-h">{{ p.hint }}</div>
        }
      </div>
    </ng-template>
  `,
})
export class ConsoleFields {
  private readonly api = inject(InstitutionSetupApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  protected readonly entities = ENTITIES;
  protected readonly types = TYPES;
  protected readonly yesNo = ['Yes', 'No'];
  protected readonly statuses = [
    { v: '', l: 'All' },
    { v: 'ACTIVE', l: 'Active' },
    { v: 'INACTIVE', l: 'Inactive' },
  ];
  protected readonly ruleChecks = [
    { k: 'required', t: 'Required', s: "The form can't be saved without it" },
    { k: 'unique', t: 'Unique', s: 'No two records share a value' },
    { k: 'listColumn', t: 'Show as a list column', s: "Adds a column to the entity's listing" },
    { k: 'filter', t: 'Offer as a filter', s: 'Dropdown, multi-select and yes/no only' },
    { k: 'active', t: 'Active', s: 'Inactive fields are hidden; values are kept' },
  ] as const;

  protected readonly error = signal('');
  protected readonly fields = signal<readonly CustomField[]>([]);
  protected readonly max = signal(15);
  protected readonly q = signal('');
  protected readonly ent = signal<CfEntity | ''>('');
  protected readonly stat = signal('');
  protected readonly page = signal(1);
  protected readonly draft = signal<Draft | null>(null);
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
  protected readonly rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.fields().filter(
      (f) =>
        (!this.ent() || f.entity === this.ent()) &&
        (!this.stat() || f.status === this.stat()) &&
        (!q || [f.label, f.typeLabel, f.entityLabel].some((x) => x.toLowerCase().includes(q))),
    );
  });
  protected readonly shown = computed(() =>
    this.rows().slice((this.page() - 1) * 12, this.page() * 12),
  );
  protected readonly last = computed(() => Math.min(this.page() * 12, this.rows().length));
  protected readonly segIndex = computed(() => this.statuses.findIndex((s) => s.v === this.stat()));
  protected readonly entityOptions = computed(() =>
    ENTITIES.map((e) => ({ v: e.v, l: e.l, sub: `${this.activeOf(e.v)}/${this.max()}` })),
  );

  constructor() {
    void this.load();
  }

  private async load() {
    try {
      const r = await this.api.fields();
      this.fields.set(r.items);
      this.max.set(r.maxActivePerEntity);
      this.error.set('');
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  protected value(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected checked(e: Event) {
    return (e.target as HTMLInputElement).checked;
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected name(n: string | null) {
    return n ? titleCase(n) : '—';
  }
  protected err(k: string) {
    return this.errors()[k] ?? '';
  }
  protected typeIcon(t: CfType) {
    return TYPES.find((x) => x.v === t)?.icon ?? 'field';
  }
  protected entityLabel(e: CfEntity) {
    return ENTITIES.find((x) => x.v === e)?.l ?? e;
  }
  protected hasOptions(t: CfType) {
    return OPTION_TYPES.includes(t);
  }
  protected activeOf(e: CfEntity) {
    return this.fields().filter((f) => f.entity === e && f.status === 'ACTIVE').length;
  }
  protected countOf(e: CfEntity) {
    return this.fields().filter((f) => f.entity === e).length;
  }
  protected rules(f: CustomField) {
    return [
      f.required && 'Required',
      f.unique && 'Unique',
      f.listColumn && 'List column',
      f.filter && 'Filter',
    ].filter((x): x is string => Boolean(x));
  }
  protected fixed(d: Draft) {
    return Boolean(d.field && d.field.values > 0);
  }
  protected drawerSub(d: Draft) {
    const f = d.field;
    return f
      ? `${f.entityLabel} · ${f.values} value${f.values === 1 ? '' : 's'} captured · defined by ${this.name(f.definedBy)} on ${formatDate(f.definedAt)}`
      : 'Shown at the end of the entity’s form, in the “Institution fields” group';
  }

  protected edit(f: CustomField | null) {
    if (this.readOnly()) return;
    this.errors.set({});
    this.draft.set({
      field: f,
      label: f?.label ?? '',
      entity: f?.entity ?? 'MEMBER',
      type: f?.type ?? 'TEXT',
      options: (f?.options ?? []).join('\n'),
      required: f?.required ?? false,
      unique: f?.unique ?? false,
      listColumn: f?.listColumn ?? false,
      filter: f?.filter ?? false,
      active: f ? f.status === 'ACTIVE' : true,
      ack: Boolean(f),
    });
  }

  protected patch(p: Partial<Draft>, k: string) {
    const d = this.draft();
    if (!d) return;
    this.draft.set({ ...d, ...p });
    const next = { ...this.errors() };
    delete next[k];
    delete next['rules'];
    this.errors.set(next);
  }

  protected setRule(k: 'required' | 'unique' | 'listColumn' | 'filter' | 'active', e: Event) {
    this.patch({ [k]: this.checked(e) }, k);
  }

  protected pickType(d: Draft, t: CfType) {
    if (this.fixed(d)) return;
    this.patch({ type: t }, 'type');
  }

  protected preview(d: Draft) {
    const others = this.fields().filter(
      (f) => f.entity === d.entity && f.status === 'ACTIVE' && f.id !== d.field?.id,
    );
    const toRow = (f: {
      key: string;
      label: string;
      type: CfType;
      options: readonly string[];
      required: boolean;
      unique: boolean;
      draft: boolean;
      hint?: string;
    }) => ({
      ...f,
      full: f.type === 'LONG_TEXT' || f.type === 'MULTI_SELECT',
      hint: f.hint ?? (f.unique ? 'Must be unique across the institution.' : ''),
    });
    const rows = others.map((f) => toRow({ ...f, key: f.id, draft: false }));
    if (d.label.trim()) {
      rows.push(
        toRow({
          key: '__draft',
          label: d.label.trim(),
          type: d.type,
          options: this.optionList(d),
          required: d.required,
          unique: d.unique,
          draft: true,
          hint: d.active ? 'Editing' : 'Editing · inactive — hidden from forms',
        }),
      );
    }
    return rows;
  }

  private optionList(d: Draft) {
    return d.options
      .split(/\n/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  protected async save() {
    const d = this.draft();
    if (!d || this.busy()) return;
    const label = d.label.trim();
    const options = this.optionList(d);
    const e: Record<string, string> = {};
    if (!label) e['label'] = translate('VALIDATION.REQUIRED');
    else if (label.length < 2) e['label'] = translate('VALIDATION.FORMAT');
    else if (ID_WORDS.test(label)) e['label'] = translate('CF.ID_DOCUMENT_LABEL');
    else if (
      this.fields().some(
        (f) =>
          f.id !== d.field?.id &&
          f.entity === d.entity &&
          f.label.toLowerCase() === label.toLowerCase(),
      )
    ) {
      e['label'] = translate('CF.LABEL_TAKEN', { entity: this.entityLabel(d.entity), label });
    }
    const becomesActive =
      d.active && (!d.field || d.field.status !== 'ACTIVE' || d.field.entity !== d.entity);
    if (becomesActive && this.activeOf(d.entity) >= this.max()) {
      e['entity'] = translate('CF.LIMIT_REACHED', {
        entity: this.entityLabel(d.entity),
        max: this.max(),
      });
    }
    if (this.hasOptions(d.type)) {
      if (!options.length) e['options'] = translate('VALIDATION.REQUIRED');
      else if (options.length < 2) e['options'] = translate('CF.OPTIONS_TOO_FEW');
      else if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
        e['options'] = translate('CF.OPTIONS_DUPLICATE');
      }
    }
    if (!d.ack) e['ack'] = translate('CF.ACK_REQUIRED');
    if (!e['label'] && !e['options'] && !e['ack']) {
      if (d.filter && !FILTER_TYPES.includes(d.type)) e['rules'] = translate('CF.FILTER_TYPE');
      else if (d.unique && (d.type === 'YES_NO' || d.type === 'MULTI_SELECT')) {
        e['rules'] = translate('CF.UNIQUE_TYPE');
      }
    }
    this.errors.set(e);
    if (Object.keys(e).length) return;
    const body = {
      entity: d.entity,
      label,
      type: d.type,
      ...(this.hasOptions(d.type) ? { options } : {}),
      required: d.required,
      unique: d.unique,
      listColumn: d.listColumn,
      filter: d.filter,
      active: d.active,
      noIdDocAck: true,
    };
    this.busy.set(true);
    try {
      const f = d.field
        ? await this.api.changeField(d.field.id, d.field.version, {
            ...body,
            ...(this.hasOptions(d.type) ? {} : { options: [] }),
          })
        : await this.api.createField(body);
      this.draft.set(null);
      await this.load();
      this.overlays.toast(d.field ? 'Field saved' : 'Field created', {
        sub: `${f.label} · ${f.entityLabel} · ${f.typeLabel}${f.status === 'ACTIVE' ? '' : ' · inactive'}`,
      });
    } catch (x) {
      if (x instanceof ApiProblem) {
        const fe = x.errors[0];
        const k =
          fe?.field === 'noIdDocAck'
            ? 'ack'
            : (fe?.field ?? (x.code.startsWith('CF.LIMIT') ? 'entity' : 'label'));
        this.errors.set({
          [k === 'filter' || k === 'unique' ? 'rules' : k]: fe?.message ?? x.detail,
        });
        if (x.status === 412) await this.load();
      } else {
        this.overlays.toast('Not saved', { sub: translate('GEN.UNAVAILABLE'), tone: 'bad' });
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected async deactivate(f: CustomField) {
    const n = f.values;
    const ok = await this.overlays.confirm({
      title: `Deactivate “${f.label}”?`,
      tone: 'warn',
      icon: 'archive',
      text: `It disappears from ${f.entityLabel.toLowerCase()} forms, lists and filters. ${
        n
          ? `The ${n} value${n === 1 ? '' : 's'} already captured ${n === 1 ? 'is' : 'are'} kept and shown marked as belonging to a deactivated field.`
          : 'No values have been captured.'
      } You can reactivate it later.`,
      ok: 'Deactivate field',
    });
    if (!ok) return;
    await this.setActive(
      f,
      false,
      'Field deactivated',
      `${f.label} · ${n} value${n === 1 ? '' : 's'} kept`,
    );
  }

  protected async reactivate(f: CustomField) {
    if (this.activeOf(f.entity) >= this.max()) {
      this.overlays.toast(`${f.entityLabel} already has ${this.max()} active fields`, {
        sub: 'Deactivate another field first.',
        tone: 'warn',
      });
      return;
    }
    const ok = await this.overlays.confirm({
      title: `Reactivate “${f.label}”?`,
      text: `It returns to ${f.entityLabel.toLowerCase()} forms with the values captured before.`,
      ok: 'Reactivate',
    });
    if (!ok) return;
    await this.setActive(f, true, 'Field reactivated', f.label);
  }

  private async setActive(f: CustomField, active: boolean, title: string, sub: string) {
    try {
      await this.api.changeField(f.id, f.version, { active });
      await this.load();
      this.overlays.toast(title, { sub });
    } catch (e) {
      this.overlays.toast('Not saved', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    }
  }
}
