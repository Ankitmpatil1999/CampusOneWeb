import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  type OnInit,
} from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { problemText } from './academic-format';
import { StructureApi, type SubjectView } from './structure.api';
import { Swatches } from './Swatches';

const CODE = /^[A-Z0-9]{2,5}$/;

/**
 * Add or edit a subject (prototype cc.sub.edit / cc.sub.save; ACA-016/017): the code (2–5 capitals
 * or digits, fixed once created), the name (2–40) and the colour; both code and name are unique.
 */
@Component({
  selector: 'rp-subject-drawer',
  imports: [Icon, Modal, Swatches],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="subject()?.name ?? 'Add a subject'"
      [sub]="sub()"
      icon="book"
      [drawer]="true"
      [slim]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16">
        @if (readOnly()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">{{ readOnly() }}</div>
          </div>
        }
        @if (err('form')) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ err('form') }}</div>
          </div>
        }
        <div class="c-form">
          <div class="fld" [class.invalid]="err('code')">
            <label class="fld-l" for="sb-c">Code<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="sb-c"
                maxlength="5"
                autocomplete="off"
                aria-describedby="sb-c-e"
                [readOnly]="!!subject() || !!readOnly()"
                [value]="code()"
                (input)="code.set(upper($event)); clear('code')"
              />
            </div>
            <div class="fld-e" id="sb-c-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('code') }}</span>
            </div>
            <div class="fld-h">
              {{
                subject()
                  ? "The code can't change once used"
                  : '2–5 capital letters or digits, e.g. EVS'
              }}
            </div>
          </div>
          <div class="fld" [class.invalid]="err('name')">
            <label class="fld-l" for="sb-n">Subject name<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="sb-n"
                maxlength="40"
                autocomplete="off"
                aria-describedby="sb-n-e"
                [readOnly]="!!readOnly()"
                [value]="name()"
                (input)="name.set(val($event)); clear('name')"
              />
            </div>
            <div class="fld-e" id="sb-n-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('name') }}</span>
            </div>
          </div>
          <div class="full">
            <span class="fld-l">Colour</span>
            <rp-swatches
              name="sb-col"
              [value]="colour()"
              [disabled]="!!readOnly()"
              (changed)="colour.set($event)"
            />
          </div>
        </div>
      </div>
      <div modal-foot class="cc-foot">
        @if (readOnly()) {
          <button type="button" class="btn btn-sec" (click)="closed.emit()">
            <span>Close</span>
          </button>
        } @else {
          <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="closed.emit()">
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            id="sb-save"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="save()"
          >
            <rp-icon name="check" [size]="17" /><span>{{
              subject() ? 'Save subject' : 'Add subject'
            }}</span>
          </button>
        }
      </div>
    </rp-modal>
  `,
})
export class SubjectDrawer implements OnInit {
  private readonly api = inject(StructureApi);
  private readonly overlays = inject(Overlays);

  readonly subject = input<SubjectView | null>(null);
  /** Every subject (duplicate names and codes are refused before saving). */
  readonly subjects = input<readonly SubjectView[]>([]);
  readonly readOnly = input('');
  readonly closed = output<void>();
  readonly saved = output<SubjectView>();

  protected readonly code = signal('');
  protected readonly name = signal('');
  protected readonly colour = signal('#2D5DA8');
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);
  protected readonly sub = computed(() => {
    const s = this.subject();
    return s ? `Code ${s.code}` : "Subjects can be mapped to classes after they're added";
  });

  ngOnInit() {
    const s = this.subject();
    this.code.set(s?.code ?? '');
    this.name.set(s?.name ?? '');
    this.colour.set(s?.colour ?? '#2D5DA8');
  }

  protected err(k: string) {
    return this.errors()[k] ?? '';
  }
  protected clear(k: string) {
    if (!this.errors()[k] && !this.errors()['form']) return;
    const e = { ...this.errors() };
    delete e[k];
    delete e['form'];
    this.errors.set(e);
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected upper(e: Event) {
    return (e.target as HTMLInputElement).value.toUpperCase();
  }

  private validate(): Record<string, string> {
    const e: Record<string, string> = {};
    const s = this.subject();
    const code = this.code().trim();
    const name = this.name().trim();
    if (!s) {
      if (!code) e['code'] = translate('VALIDATION.REQUIRED');
      else if (!CODE.test(code)) e['code'] = translate('ACA.SUBJECT_CODE');
      else if (this.subjects().some((x) => x.code === code)) {
        e['code'] = translate('ACA.SUBJECT_CODE_TAKEN', { code });
      }
    }
    if (!name) e['name'] = translate('VALIDATION.REQUIRED');
    else if (name.length < 2) e['name'] = translate('ACA.SUBJECT_NAME');
    else if (
      this.subjects().some((x) => x.id !== s?.id && x.name.toLowerCase() === name.toLowerCase())
    ) {
      e['name'] = translate('ACA.SUBJECT_NAME_TAKEN', { name });
    }
    return e;
  }

  protected async save() {
    if (this.busy() || this.readOnly()) return;
    const e = this.validate();
    this.errors.set(e);
    if (Object.keys(e).length) return;
    const s = this.subject();
    this.busy.set(true);
    try {
      const out = s
        ? await this.api.changeSubject(s.id, s.version, {
            name: this.name().trim(),
            colour: this.colour(),
          })
        : await this.api.createSubject({
            code: this.code().trim(),
            name: this.name().trim(),
            colour: this.colour(),
          });
      this.overlays.toast(s ? 'Subject updated' : 'Subject added', { sub: out.name });
      this.saved.emit(out);
    } catch (x) {
      this.errors.set(this.problemErrors(x));
    } finally {
      this.busy.set(false);
    }
  }

  private problemErrors(x: unknown): Record<string, string> {
    if (!(x instanceof ApiProblem)) return { form: problemText(x) };
    if (x.code === 'ACA.SUBJECT_CODE_TAKEN') return { code: x.detail };
    if (x.code === 'ACA.SUBJECT_NAME_TAKEN') return { name: x.detail };
    const out: Record<string, string> = {};
    for (const f of x.errors) {
      const k = f.field === 'code' || f.field === 'name' ? f.field : 'form';
      out[k] ??= f.message;
    }
    return Object.keys(out).length ? out : { form: x.detail };
  }
}
