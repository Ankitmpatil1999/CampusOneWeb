/**
 * The school's people for the principal on the web (client 2026-10-13; ACA-064): students with their
 * admission number, class and section, or teachers and staff with the classes they lead and the
 * subjects they teach — searched by name, a hundred at a time.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { person } from '../Applications/app-format';
import { problemText } from '../Structure/academic-format';
import {
  PrincipalApi,
  type People,
  type PeopleType,
  type StaffRow,
  type StudentRow,
} from './principal.api';

const TYPES: readonly { v: PeopleType; l: string }[] = [
  { v: 'STUDENTS', l: 'Students' },
  { v: 'TEACHERS', l: 'Teachers' },
  { v: 'STAFF', l: 'Staff' },
];

@Component({
  selector: 'rp-principal-people',
  imports: [Empty, Icon, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    <rp-page-head
      title="People"
      [sub]="'Students, teachers and staff' + (year() ? ' in ' + year() : '') + '.'"
    />

    <div class="row g12 wrap" style="align-items: center">
      <div class="tabs" role="tablist" aria-label="Who">
        @for (x of types; track x.v) {
          <button
            type="button"
            class="tab"
            role="tab"
            [id]="'pp-tab-' + x.v.toLowerCase()"
            [class.on]="type() === x.v"
            [attr.aria-selected]="type() === x.v"
            (click)="pick(x.v)"
          >
            {{ x.l }}
          </button>
        }
      </div>
      <span class="grow"></span>
      <div class="fld-in" style="min-width: 260px">
        <rp-icon name="search" [size]="16" />
        <input
          id="pp-q"
          type="search"
          maxlength="60"
          [placeholder]="
            type() === 'STUDENTS' ? 'Search by name or admission number' : 'Search by name'
          "
          [value]="q()"
          (input)="search($event)"
        />
      </div>
    </div>

    @if (error()) {
      <div class="note tone-bad" role="alert" id="pp-error">
        <rp-icon name="alert" [size]="17" />
        <div class="grow">{{ error() }}</div>
        <button type="button" class="btn btn-sec btn-sm" (click)="load()">Try again</button>
      </div>
    } @else if (loading() && !rows().length) {
      <div class="card pad"><div class="sk" style="height: 220px; border-radius: 16px"></div></div>
    } @else if (!rows().length) {
      <rp-empty
        icon="users"
        [title]="q() ? 'No one matches “' + q() + '”' : 'No one here yet'"
        text="Try another name or group."
      />
    } @else {
      <div class="card">
        <div class="tbl-wrap">
          @if (type() === 'STUDENTS') {
            <table class="tbl" id="pp-students">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Admission no.</th>
                  <th>Class</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (s of students(); track s.id) {
                  <tr>
                    <td>
                      <b class="t-sb">{{ person(s.name) }}</b>
                    </td>
                    <td class="t-mono">{{ s.admissionNo ?? '—' }}</td>
                    <td>{{ s.class }} {{ s.section }}</td>
                    <td>
                      <span class="chip dot" [class]="'chip dot tone-' + tone(s.status)">{{
                        statusLabel(s.status)
                      }}</span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <table class="tbl" id="pp-staff">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Class teacher of</th>
                  <th>Subjects</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (s of staff(); track s.id) {
                  <tr>
                    <td>
                      <b class="t-sb">{{ person(s.name) }}</b>
                    </td>
                    <td>{{ s.type }}</td>
                    <td>{{ s.classTeacherOf.join(', ') || '—' }}</td>
                    <td>{{ s.subjects.join(', ') || '—' }}</td>
                    <td>
                      <span class="chip dot" [class]="'chip dot tone-' + tone(s.status)">{{
                        statusLabel(s.status)
                      }}</span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      </div>
      @if (cursor()) {
        <div class="row" style="justify-content: center">
          <button
            type="button"
            class="btn btn-sec"
            id="pp-more"
            [class.is-busy]="loading()"
            [disabled]="loading()"
            (click)="more()"
          >
            <span>Show more</span>
          </button>
        </div>
      }
    }
  </div>`,
})
export class PrincipalPeople implements OnInit {
  private readonly api = inject(PrincipalApi);
  protected readonly types = TYPES;
  protected readonly person = person;
  protected readonly type = signal<PeopleType>('STUDENTS');
  protected readonly q = signal('');
  protected readonly rows = signal<People['items']>([]);
  protected readonly year = signal('');
  protected readonly cursor = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly students = computed(() => this.rows() as readonly StudentRow[]);
  protected readonly staff = computed(() => this.rows() as readonly StaffRow[]);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  ngOnInit() {
    void this.load();
  }

  protected pick(t: PeopleType) {
    if (t === this.type()) return;
    this.type.set(t);
    this.rows.set([]);
    void this.load();
  }

  protected search(e: Event) {
    this.q.set((e.target as HTMLInputElement).value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(), 300);
  }

  async load(more = false) {
    const id = ++this.seq;
    this.loading.set(true);
    try {
      const p = await this.api.people({
        type: this.type(),
        q: this.q().trim(),
        cursor: more ? this.cursor() : null,
      });
      if (id !== this.seq) return;
      this.rows.set(more ? [...this.rows(), ...p.items] : p.items);
      this.cursor.set(p.nextCursor);
      this.year.set(p.year.label);
      this.error.set('');
    } catch (e) {
      if (id === this.seq) this.error.set(problemText(e));
    } finally {
      if (id === this.seq) this.loading.set(false);
    }
  }

  protected more() {
    void this.load(true);
  }

  protected tone(s: string) {
    return s === 'ACTIVE' ? 'ok' : s === 'SUSPENDED' ? 'bad' : 'neutral';
  }
  protected statusLabel(s: string) {
    return s === 'ACTIVE' ? 'Active' : s === 'SUSPENDED' ? 'Suspended' : 'Inactive';
  }
}
