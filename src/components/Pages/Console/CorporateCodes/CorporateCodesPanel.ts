import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { CorporateCodeForm } from './CorporateCodeForm';
import {
  CorporateCodesApi,
  type CorporateCodeList,
  type CorporateCodeView,
} from './corporate-codes.api';

/**
 * A school's corporate codes and their classes (client 2026-10-13/14): the console's own school and
 * the back office's school page use the same panel with another base. A VAN is the code of the
 * holder's class — or the default — followed by the wallet number.
 */
@Component({
  selector: 'rp-corporate-codes',
  imports: [CorporateCodeForm, Empty, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (error()) {
      <div class="card pad">
        <rp-empty icon="alertc" title="Couldn't load the corporate codes" [text]="error()">
          <button type="button" class="btn btn-sec btn-sm" (click)="load()">
            <span>Try again</span>
          </button>
        </rp-empty>
      </div>
    } @else if (list(); as l) {
      <div class="row g8 wrap" style="justify-content: space-between; align-items: center">
        <div class="t-muted t-sm grow" id="cc-why" style="min-width: 240px">
          A student's VAN is the code of their class followed by their wallet number. Classes
          without a code, staff and merchants use {{ defaultNote() }}.
        </div>
        @if (editWhy()) {
          <span [attr.title]="editWhy()"
            ><button type="button" class="btn btn-pri btn-sm" disabled>
              <rp-icon name="plus" [size]="16" /><span>Add a corporate code</span>
            </button></span
          >
        } @else {
          <button type="button" class="btn btn-pri btn-sm" id="cc-new" (click)="form.set('new')">
            <rp-icon name="plus" [size]="16" /><span>Add a corporate code</span>
          </button>
        }
      </div>
      @if (!l.items.length) {
        <div class="card pad">
          <rp-empty
            icon="bank"
            title="No corporate code yet"
            text="Add the code the bank allotted for the school's collection account. The first one becomes the default."
          />
        </div>
      } @else {
        <div class="tbl-wrap">
          <table class="tbl" id="cc-table">
            <thead>
              <tr>
                <th>Bank</th>
                <th>Corporate code</th>
                <th>Classes</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (c of l.items; track c.id) {
                <tr [class.off]="c.status === 'DISABLED'">
                  <td>
                    <div class="cell-main">
                      @if (c.bankName) {
                        <span class="cell-t">{{ c.bankName }}</span>
                      } @else {
                        <span class="chip tone-warn">Bank name not filled in</span>
                      }
                      <span class="cell-s" translate="no">{{
                        c.ifsc ? 'IFSC ' + c.ifsc : 'No IFSC yet'
                      }}</span>
                    </div>
                  </td>
                  <td>
                    <span class="t-mono" translate="no">{{ c.corporateCode }}</span>
                    @if (c.isDefault) {
                      <span class="chip dot tone-ok" style="margin-left: 6px">Default</span>
                    }
                    @if (c.poolAccountRef) {
                      <span class="cell-s" style="display: block" translate="no"
                        >Pool {{ c.poolAccountRef }}</span
                      >
                    }
                  </td>
                  <td>
                    @if (c.classes.length) {
                      <span class="row g4 wrap">
                        @for (k of c.classes; track k.id) {
                          <span class="chip">{{ k.name }}</span>
                        }
                      </span>
                    } @else {
                      <span class="t-faint">{{ c.isDefault ? 'All others' : '—' }}</span>
                    }
                  </td>
                  <td>
                    <span [class]="'chip dot tone-' + (c.status === 'ACTIVE' ? 'ok' : 'neutral')">{{
                      c.status === 'ACTIVE' ? 'Active' : 'Disabled'
                    }}</span>
                    @if (c.status === 'DISABLED' && c.classes.length) {
                      <span class="cell-s" style="display: block">Its classes use the default</span>
                    }
                  </td>
                  <td class="t-right">
                    @if (!editWhy()) {
                      <span class="row g6" style="justify-content: flex-end">
                        <button type="button" class="btn btn-sec btn-sm" (click)="form.set(c)">
                          <rp-icon name="edit" [size]="15" /><span>Change</span>
                        </button>
                        @if (!c.isDefault && c.status === 'ACTIVE') {
                          <button
                            type="button"
                            class="btn btn-sec btn-sm"
                            [disabled]="busyId() === c.id"
                            (click)="makeDefault(c)"
                          >
                            <span>Make default</span>
                          </button>
                        }
                        @if (!c.isDefault) {
                          <button
                            type="button"
                            class="btn btn-ghost btn-sm"
                            [disabled]="busyId() === c.id"
                            (click)="toggle(c)"
                          >
                            <span>{{ c.status === 'ACTIVE' ? 'Disable' : 'Enable' }}</span>
                          </button>
                        }
                      </span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      @if (unmapped().length) {
        <div class="note tone-info" id="cc-unmapped">
          <rp-icon name="info" [size]="17" />
          <div class="grow">Using the default code: {{ unmapped().join(', ') }}.</div>
        </div>
      }
      @if (form(); as f) {
        <rp-corporate-code-form
          [base]="base()"
          [list]="l"
          [code]="f === 'new' ? null : f"
          (closed)="form.set(null)"
          (saved)="saved($event, f === 'new')"
        />
      }
    } @else {
      <div class="card pad"><div class="sk" style="height: 200px; border-radius: 16px"></div></div>
    }
  `,
})
export class CorporateCodesPanel {
  private readonly api = inject(CorporateCodesApi);
  private readonly overlays = inject(Overlays);

  /** The calls' base: the console's school or a back-office school. */
  readonly base = input.required<string>();
  /** Why changes are off (empty: they are allowed). */
  readonly editWhy = input('');

  protected readonly list = signal<CorporateCodeList | null>(null);
  protected readonly error = signal('');
  protected readonly busyId = signal<string | null>(null);
  protected readonly form = signal<'new' | CorporateCodeView | null>(null);

  protected readonly defaultCode = computed(
    () => this.list()?.items.find((c) => c.isDefault)?.corporateCode ?? null,
  );
  protected readonly defaultNote = computed(() => {
    const d = this.defaultCode();
    return d ? `the default code (${d})` : 'the default code';
  });
  /** Classes on no code, or on a disabled one: their VANs use the default. */
  protected readonly unmapped = computed(() => {
    const l = this.list();
    if (!l) return [];
    const active = new Set(l.items.filter((c) => c.status === 'ACTIVE').map((c) => c.id));
    return l.classes.filter((k) => !k.codeId || !active.has(k.codeId)).map((k) => k.name);
  });

  constructor() {
    effect(() => {
      this.base();
      void this.load();
    });
  }

  async load() {
    this.error.set('');
    try {
      this.list.set(await this.api.list(this.base()));
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  protected async saved(c: CorporateCodeView, added: boolean) {
    this.form.set(null);
    this.overlays.toast(added ? `${c.corporateCode} added` : `${c.corporateCode} saved`, {
      sub: c.classes.length
        ? `${c.classes.length} ${c.classes.length === 1 ? 'class uses' : 'classes use'} it`
        : c.isDefault
          ? 'The school’s default code'
          : 'No class uses it yet',
    });
    await this.load();
  }

  private async act(
    c: CorporateCodeView,
    body: Parameters<CorporateCodesApi['change']>[2],
    done: string,
  ) {
    this.busyId.set(c.id);
    try {
      const out = await this.api.change(this.base(), c, body);
      this.overlays.toast(done, { sub: out.corporateCode });
    } catch (e) {
      this.overlays.toast(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'), {
        tone: 'bad',
      });
    } finally {
      this.busyId.set(null);
      await this.load();
    }
  }

  protected async makeDefault(c: CorporateCodeView) {
    const ok = await this.overlays.confirm({
      title: `Make ${c.corporateCode} the default?`,
      text: 'Staff, merchants and students of classes without a code get VANs on it from now on.',
      ok: 'Make default',
    });
    if (ok) await this.act(c, { isDefault: true }, 'Default code changed');
  }

  protected async toggle(c: CorporateCodeView) {
    const off = c.status === 'ACTIVE';
    if (off) {
      const ok = await this.overlays.confirm({
        title: `Disable ${c.corporateCode}?`,
        text: c.classes.length
          ? 'Its classes use the default code until it is enabled again; their VANs change with it.'
          : 'It is no longer used for VANs.',
        ok: 'Disable',
        tone: 'bad',
      });
      if (!ok) return;
    }
    await this.act(
      c,
      { status: off ? 'DISABLED' : 'ACTIVE' },
      off ? 'Corporate code disabled' : 'Corporate code enabled',
    );
  }
}
