/**
 * Student Overview for the principal on the web (SRS 20.32; ACA-079; client 2026-10-14): every
 * student of the school — name, class, admission number, parent or contact and status — searched and
 * filtered by class on the page, each opening a detail panel. Read-only (RNG-ACA-394).
 */
import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { formatMobile } from '../../../Utils/format';
import { person } from '../Applications/app-format';
import { PrincipalApi, type OverviewStudent } from './principal.api';
import { StudentPanel, classOf } from './StudentPanel';

@Component({
  selector: 'rp-principal-students',
  imports: [Dropdown, Empty, Icon, PageHead, StudentPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
      <rp-page-head
        title="Student Overview"
        [sub]="'Every student of the school' + (year() ? ' in ' + year() : '') + '.'"
      />

      <div class="row g12 wrap" style="align-items: center">
        <div class="fld-in" style="min-width: 300px; flex: 1 1 300px; max-width: 420px">
          <rp-icon name="search" [size]="16" />
          <input
            id="so-q"
            type="search"
            maxlength="60"
            placeholder="Search by name, ID, admission no or parent..."
            aria-label="Search students"
            [value]="q()"
            (input)="q.set(val($event))"
          />
        </div>
        <div style="min-width: 200px">
          <rp-dd
            inputId="so-class"
            [options]="classOptions()"
            [value]="cls()"
            placeholder="All Classes"
            (changed)="cls.set($event)"
          />
        </div>
        <span class="grow"></span>
        @if (all().length) {
          <span class="t-xs t-muted" id="so-count"
            >{{ shown().length }} of {{ all().length }} students</span
          >
        }
      </div>

      @if (error()) {
        <div class="note tone-bad" role="alert" id="so-error">
          <rp-icon name="alert" [size]="17" />
          <div class="grow">{{ error() }}</div>
          <button type="button" class="btn btn-sec btn-sm" (click)="load()">Try again</button>
        </div>
      } @else if (loading()) {
        <div class="card pad" aria-busy="true" id="so-loading">
          <p class="t-sm t-muted">Loading students…</p>
          <div class="sk" style="height: 220px; border-radius: 16px"></div>
        </div>
      } @else if (!shown().length) {
        <rp-empty icon="users" title="No students found" text="Try another name or class." />
      } @else {
        <div class="card">
          <div class="tbl-wrap">
            <table class="tbl" id="so-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Admission No</th>
                  <th>Parent / Contact</th>
                  <th>Status</th>
                  <th class="r">Action</th>
                </tr>
              </thead>
              <tbody>
                @for (s of shown(); track s.id) {
                  <tr>
                    <td>
                      <b class="t-sb">{{ name(s) }}</b>
                      <div class="t-xs t-muted t-mono">{{ s.memberNo }}</div>
                    </td>
                    <td>{{ classOf(s) }}</td>
                    <td class="t-mono">{{ s.admissionNo ?? '—' }}</td>
                    <td>
                      @if (s.contact; as c) {
                        <div>
                          {{ person(c.name) }}
                          <span class="t-muted">({{ relation(c.relation) }})</span>
                        </div>
                        <div class="t-xs t-muted">
                          {{ reach(c) }}
                        </div>
                      } @else {
                        <span class="t-muted">—</span>
                      }
                    </td>
                    <td>
                      <span class="chip dot" [class]="'chip dot tone-' + tone(s)">{{
                        statusLabel(s)
                      }}</span>
                    </td>
                    <td class="r">
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs"
                        [attr.data-student]="s.id"
                        (click)="open.set(s)"
                      >
                        <rp-icon name="eye" [size]="15" /><span>View</span>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>

    <!-- The student in full: personal, family, transport, fees and more (client 2026-10-14). -->
    @if (open(); as s) {
      <rp-student-panel [row]="s" (closed)="open.set(null)" />
    }`,
})
export class PrincipalStudents implements OnInit {
  private readonly api = inject(PrincipalApi);
  protected readonly person = person;
  protected readonly classOf = classOf;
  protected readonly all = signal<readonly OverviewStudent[]>([]);
  protected readonly year = signal('');
  protected readonly q = signal('');
  protected readonly cls = signal('');
  protected readonly open = signal<OverviewStudent | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  /** The class labels present in the result (SRS 20.32.2). */
  protected readonly classOptions = computed<DropdownOption[]>(() => [
    { v: '', l: 'All Classes' },
    ...[...new Set(this.all().map(classOf))].filter((c) => c !== '—').map((c) => ({ v: c, l: c })),
  ]);
  /** Search and class together (AND), on the page. */
  protected readonly shown = computed(() => {
    const q = this.q().trim().toLowerCase();
    const cls = this.cls();
    return this.all().filter((s) => {
      if (cls && classOf(s) !== cls) return false;
      if (!q) return true;
      const c = s.contact;
      return [s.name, s.memberNo, s.admissionNo, c?.name, c?.mobile, c?.email]
        .filter(Boolean)
        .some((x) => x!.toLowerCase().includes(q));
    });
  });

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const r = await this.api.studentOverview();
      this.all.set(r.items);
      this.year.set(r.year.label);
    } catch {
      this.error.set('Unable to load student records.');
    } finally {
      this.loading.set(false);
    }
  }

  protected name(s: OverviewStudent) {
    return person(s.name) || 'Student';
  }
  protected statusLabel(s: OverviewStudent) {
    return s.status === 'ACTIVE' ? 'Active' : 'Inactive';
  }
  protected tone(s: OverviewStudent) {
    return s.status === 'ACTIVE' ? 'ok' : 'neutral';
  }
  protected relation(r: string) {
    return r ? r.charAt(0).toUpperCase() + r.slice(1).toLowerCase() : '';
  }
  protected mobile(m: string | null) {
    return m ? formatMobile(m) : '';
  }
  /** The contact's mobile and e-mail on one line. */
  protected reach(c: NonNullable<OverviewStudent['contact']>) {
    return [this.mobile(c.mobile), c.email].filter(Boolean).join(' · ') || '—';
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
}
