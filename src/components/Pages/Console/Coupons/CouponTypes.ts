import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Amount, amountPaise } from '../../../Shared/Amount';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { plural } from '../Allowances/allowance-format';
import type { Merchant } from '../Merchants/merchants.api';
import { acceptsLabel, kindLabel, periodWord, windowLabel } from './coupon-format';
import { CouponTypeEdit } from './CouponTypeEdit';
import { CouponsApi, type CouponSlot, type CouponType } from './coupons.api';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The "Coupon types" tab (prototype cpnTypes; CR-15, OI-CPN-12; CPN-003…007): the type master — a
 * row opens the type modal — and the institution's slot master, whose times an administrator edits
 * (every type pointing at a slot uses its new window from the next redemption).
 */
@Component({
  selector: 'rp-coupon-types',
  imports: [Amount, CouponTypeEdit, Empty, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="note tone-info">
      <rp-icon name="info" [size]="17" />
      <div class="grow">
        A coupon type sets <b>when</b> it can be used, <b>where</b> (accepting merchants), and
        <b>how many</b> a student may hold and redeem. Meal-standing types point at an institution
        slot; a value-bearing type carries its own window (OI-CPN-12).
      </div>
    </div>
    <div class="row between">
      <b class="t-h4">Type master</b>
      <button
        type="button"
        class="btn btn-sec btn-sm"
        id="ct-new"
        [disabled]="!!editWhy()"
        [title]="editWhy()"
        (click)="openType('')"
      >
        <rp-icon name="plus" [size]="15" /><span>New coupon type</span>
      </button>
    </div>
    @if (error()) {
      <div class="card pad">
        <rp-empty icon="alertc" title="Couldn't load the coupon types" [text]="error()">
          <button type="button" class="btn btn-sec btn-sm" (click)="reload.emit()">
            <span>Try again</span>
          </button>
        </rp-empty>
      </div>
    } @else {
      <div>
        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>Type</th>
                <th>Time window</th>
                <th>Value</th>
                <th class="r">Holding max</th>
                <th>Redemption max</th>
                <th>Accepting merchants</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              @if (loading() && !types().length) {
                <tr>
                  <td colspan="7"><rp-empty icon="hourglass" title="Loading…" /></td>
                </tr>
              }
              @for (t of types(); track t.id) {
                <tr tabindex="0" (click)="openType(t.id)" (keydown.enter)="openType(t.id)">
                  <td>
                    <div class="cell-t">{{ t.name }}</div>
                    <div class="cell-s">{{ kind(t) }}</div>
                  </td>
                  <td>{{ win(t) }}</td>
                  <td>
                    @if (valued(t)) {
                      <rp-amt [value]="t.value" />
                      <div class="cell-s t-warn">
                        <rp-icon name="alert" [size]="11" /> Reimbursement not settled — OI-CPN-10
                      </div>
                    } @else {
                      <span class="t-faint">No value</span>
                    }
                  </td>
                  <td class="r">
                    <span class="t-num">{{ t.holdMax }}</span>
                  </td>
                  <td>{{ t.redeemMax }} {{ per(t) }}</td>
                  <td>
                    <span class="t-sm">{{ accepts(t) }}</span>
                  </td>
                  <td>
                    <span
                      class="chip dot"
                      [class.tone-ok]="t.status === 'ACTIVE'"
                      [class.tone-neutral]="t.status !== 'ACTIVE'"
                      >{{ t.status === 'ACTIVE' ? 'Active' : 'Inactive' }}</span
                    >
                  </td>
                </tr>
              } @empty {
                @if (!loading()) {
                  <tr>
                    <td colspan="7">
                      <rp-empty
                        icon="ticket"
                        title="No coupon types yet"
                        text="Create a coupon type to issue coupons."
                      />
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
        @if (types().length) {
          <div class="pager">
            <span>{{ count(types().length, 'type') }}</span>
          </div>
        }
      </div>
    }

    <div class="row between" style="margin-top: 6px">
      <b class="t-h4">Slot master</b
      ><span class="t-xs t-muted">Institution-level time slots that meal types point at</span>
    </div>
    <div class="tbl-wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th>Slot</th>
            <th>From</th>
            <th>To</th>
            <th>Types using it</th>
            <th class="r" aria-label="Actions"></th>
          </tr>
        </thead>
        <tbody>
          @for (s of slots(); track s.id) {
            <tr>
              <td>
                <b>{{ s.name }}</b>
              </td>
              <td class="t-num">{{ s.start }}</td>
              <td class="t-num">{{ s.end }}</td>
              <td>
                @for (t of typesOf(s.id); track t.id) {
                  <span class="cm-tchip"><rp-icon name="ticket" [size]="12" />{{ t.name }}</span>
                  {{ ' ' }}
                } @empty {
                  <span class="t-faint">—</span>
                }
              </td>
              <td class="r">
                <button
                  type="button"
                  class="btn btn-ghost btn-xs"
                  [attr.aria-label]="'Edit the ' + s.name + ' slot'"
                  [disabled]="!!editWhy()"
                  [title]="editWhy()"
                  (click)="openSlot(s)"
                >
                  <rp-icon name="edit" [size]="15" /><span>Edit</span>
                </button>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="5">
                <rp-empty icon="clock" [title]="loading() ? 'Loading…' : 'No slots yet'" />
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    @if (editing(); as e) {
      <rp-coupon-type-edit
        [type]="e.type"
        [types]="types()"
        [slots]="slots()"
        [merchants]="merchants()"
        [readOnly]="editWhy()"
        (closed)="editing.set(null)"
        (saved)="typeSaved($event, !!e.type)"
      />
    }
    @if (slot(); as s) {
      <rp-modal
        [title]="'Edit ' + s.name + ' slot'"
        sub="Every coupon type pointing at this slot uses the new window from the next redemption."
        icon="clock"
        cls="cm-m"
        [dismiss]="!busy()"
        (closed)="slot.set(null)"
      >
        <div class="c-form">
          <div class="fld" [class.invalid]="slotErr().from">
            <label class="fld-l" for="sl-from">From<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="sl-from"
                type="time"
                aria-describedby="sl-from-e"
                [value]="slotFrom()"
                (input)="slotFrom.set(val($event)); slotErr.set({})"
              />
            </div>
            <div class="fld-e" id="sl-from-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ slotErr().from }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="slotErr().to">
            <label class="fld-l" for="sl-to">To<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="sl-to"
                type="time"
                aria-describedby="sl-to-e"
                [value]="slotTo()"
                (input)="slotTo.set(val($event)); slotErr.set({})"
              />
            </div>
            <div class="fld-e" id="sl-to-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ slotErr().to }}</span>
            </div>
          </div>
        </div>
        @if (slotErr().all) {
          <div class="note tone-bad mt12" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ slotErr().all }}</div>
          </div>
        }
        <div modal-foot class="row g8" style="justify-content: flex-end; width: 100%">
          <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="slot.set(null)">
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            id="sl-save"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="saveSlot(s)"
          >
            <span>Save slot</span>
          </button>
        </div>
      </rp-modal>
    }
  `,
})
export class CouponTypesTab {
  private readonly api = inject(CouponsApi);
  private readonly overlays = inject(Overlays);

  readonly types = input<readonly CouponType[]>([]);
  readonly slots = input<readonly CouponSlot[]>([]);
  readonly merchants = input<readonly Merchant[] | null>(null);
  readonly loading = input(false);
  readonly error = input('');
  /** Why types and slots can't be changed (read-only, no coupons.edit); '' when they can. */
  readonly editWhy = input('');
  readonly typeChanged = output<CouponType>();
  readonly slotsChanged = output<readonly CouponSlot[]>();
  readonly reload = output<void>();

  protected readonly editing = signal<{ type: CouponType | null } | null>(null);
  protected readonly slot = signal<CouponSlot | null>(null);
  protected readonly slotFrom = signal('');
  protected readonly slotTo = signal('');
  protected readonly slotErr = signal<{ from?: string; to?: string; all?: string }>({});
  protected readonly busy = signal(false);

  protected readonly bySlot = computed(() => {
    const m = new Map<string, CouponType[]>();
    for (const t of this.types()) {
      if (t.slot) m.set(t.slot.id, [...(m.get(t.slot.id) ?? []), t]);
    }
    return m;
  });

  protected openType(id: string) {
    if (!id) {
      if (this.editWhy()) return;
      this.editing.set({ type: null });
      return;
    }
    const t = this.types().find((x) => x.id === id);
    if (t) this.editing.set({ type: t });
  }
  protected typeSaved(t: CouponType, existed: boolean) {
    this.editing.set(null);
    this.overlays.toast(existed ? 'Coupon type saved' : 'Coupon type created', {
      sub: `${t.name} · ${t.status === 'ACTIVE' ? 'Active' : 'Inactive'}`,
    });
    this.typeChanged.emit(t);
  }

  protected openSlot(s: CouponSlot) {
    if (this.editWhy()) return;
    this.slotFrom.set(s.start);
    this.slotTo.set(s.end);
    this.slotErr.set({});
    this.slot.set(s);
  }
  protected async saveSlot(s: CouponSlot) {
    const from = this.slotFrom();
    const to = this.slotTo();
    const e: { from?: string; to?: string } = {};
    if (!TIME.test(from)) e.from = 'Enter the start time';
    if (!TIME.test(to)) e.to = 'Enter the end time';
    else if (!e.from && to <= from) e.to = translate('CPN.WINDOW_INVALID');
    this.slotErr.set(e);
    if (e.from || e.to) return;
    const n = this.typesOf(s.id).length;
    const ok = await this.overlays.confirm({
      title: `Change ${s.name} to ${from}–${to}?`,
      text: `${plural(n, 'coupon type')} use${n === 1 ? 's' : ''} this slot.`,
      ok: 'Save slot',
      icon: 'clock',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const out = await this.api.setSlots(
        this.slots().map((x) => ({
          id: x.id,
          name: x.name,
          start: x.id === s.id ? from : x.start,
          end: x.id === s.id ? to : x.end,
        })),
      );
      this.slot.set(null);
      this.overlays.toast('Slot updated', { sub: `${s.name} · ${from}–${to}` });
      this.slotsChanged.emit(out.items);
    } catch (err) {
      const p = err instanceof ApiProblem ? err : null;
      const i = this.slots().findIndex((x) => x.id === s.id);
      const own = p?.errors.find((x) => x.field === `slots.${i}.end`);
      this.slotErr.set(
        own
          ? { to: own.message }
          : { all: p ? (p.errors[0]?.message ?? p.detail) : translate('GEN.UNAVAILABLE') },
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected typesOf(slotId: string) {
    return this.bySlot().get(slotId) ?? [];
  }
  protected kind(t: CouponType) {
    return kindLabel(t.kind);
  }
  protected win(t: CouponType) {
    return windowLabel(t);
  }
  protected per(t: CouponType) {
    return periodWord(t.period);
  }
  protected accepts(t: CouponType) {
    return acceptsLabel(t);
  }
  protected valued(t: CouponType) {
    return amountPaise(t.value) > 0;
  }
  protected count(n: number, noun: string) {
    return plural(n, noun);
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
}
