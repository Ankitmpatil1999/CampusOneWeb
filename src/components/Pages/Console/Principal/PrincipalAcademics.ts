/**
 * Academics for the principal on the web (client 2026-10-13; ACA-063): each class section's average
 * and pass rate with its standing (top performer, average, needs support), the exams coming up and
 * how full each section's weekly timetable is.
 */
import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Card, Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { formatDate } from '../../../Utils/format';
import { num, problemText, tRange } from '../Structure/academic-format';
import { PrincipalApi, type Academics, type Standing } from './principal.api';

const TONE: Readonly<Record<Standing, string>> = {
  'Top Performer': 'ok',
  Average: 'info',
  'Needs Support': 'bad',
};

@Component({
  selector: 'rp-principal-academics',
  imports: [Card, Empty, Icon, Kpi, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    <rp-page-head
      title="Academics"
      [sub]="
        'How the classes are doing' +
        (data() ? ' in ' + data()!.year.label : '') +
        ', from the published marks.'
      "
    />

    @if (error()) {
      <div class="note tone-bad" role="alert" id="pk-error">
        <rp-icon name="alert" [size]="17" />
        <div class="grow">{{ error() }}</div>
        <button type="button" class="btn btn-sec btn-sm" (click)="load()">Try again</button>
      </div>
    } @else if (!data()) {
      <div class="card pad"><div class="sk" style="height: 240px; border-radius: 16px"></div></div>
    } @else if (data(); as d) {
      <div class="c-grid k4" id="pk-kpis">
        <rp-kpi label="Class sections" [value]="num(d.sections.length)" icon="school" />
        <rp-kpi
          label="Top performers"
          [value]="num(count('Top Performer'))"
          icon="trophy"
          tone="ok"
        />
        <rp-kpi
          label="Need support"
          [value]="num(count('Needs Support'))"
          icon="alert"
          [tone]="count('Needs Support') ? 'bad' : null"
        />
        <rp-kpi label="Upcoming exams" [value]="num(d.upcomingExams.length)" icon="calendar" />
      </div>

      <rp-card title="Class performance" icon="award" [flush]="true">
        @if (!d.sections.length) {
          <rp-empty
            icon="award"
            title="No published marks yet"
            text="Sections appear once their marks are published."
          />
        } @else {
          <div class="tbl-wrap">
            <table class="tbl" id="pk-sections">
              <thead>
                <tr>
                  <th>Class</th>
                  <th class="r">Average</th>
                  <th class="r">Pass rate</th>
                  <th>Standing</th>
                </tr>
              </thead>
              <tbody>
                @for (s of d.sections; track s.section.id) {
                  <tr>
                    <td>
                      <b class="t-sb">{{ s.section.label }}</b>
                    </td>
                    <td class="r t-num">{{ s.average }}%</td>
                    <td class="r t-num">{{ s.passRate }}%</td>
                    <td>
                      <span class="chip dot" [class]="'chip dot tone-' + tone[s.standing]">{{
                        s.standing
                      }}</span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </rp-card>

      <div class="c-grid k2">
        <rp-card title="Upcoming exams" icon="calendar" [flush]="true">
          @if (!d.upcomingExams.length) {
            <rp-empty icon="calendar" title="No exams coming up" />
          } @else {
            <div class="list" id="pk-exams">
              @for (e of d.upcomingExams; track e.id) {
                <div class="li">
                  <span class="li-ic sm"><rp-icon name="bookopen" [size]="16" /></span>
                  <span class="li-main"
                    ><span class="li-t">{{ e.name.name }} · {{ e.subject.name }}</span
                    ><span class="li-s"
                      >{{ e.section.label }} · {{ formatDate(e.date) }}
                      @if (e.startTime && e.endTime) {
                        · {{ tRange(e.startTime, e.endTime) }}
                      }
                      · {{ e.maxMarks }} marks</span
                    ></span
                  >
                </div>
              }
            </div>
          }
        </rp-card>
        <rp-card title="Timetables" icon="grid" [flush]="true">
          @if (!timetables().length) {
            <rp-empty icon="grid" title="No timetables yet" />
          } @else {
            <div class="tbl-wrap" style="max-height: 360px; overflow: auto">
              <table class="tbl dense" id="pk-timetables">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th class="r">Lessons a week</th>
                  </tr>
                </thead>
                <tbody>
                  @for (t of timetables(); track t.section.id) {
                    <tr>
                      <td>{{ t.section.label }}</td>
                      <td class="r t-num">
                        @if (t.lessonsAWeek) {
                          {{ t.lessonsAWeek }}
                        } @else {
                          <span class="chip tone-warn">None set</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </rp-card>
      </div>
    }
  </div>`,
})
export class PrincipalAcademics implements OnInit {
  private readonly api = inject(PrincipalApi);
  protected readonly num = num;
  protected readonly tone = TONE;
  protected readonly tRange = tRange;
  protected readonly formatDate = formatDate;
  protected readonly data = signal<Academics | null>(null);
  protected readonly error = signal('');
  protected readonly timetables = computed(() =>
    [...(this.data()?.timetables ?? [])].sort((a, b) =>
      a.section.label.localeCompare(b.section.label, 'en', { numeric: true }),
    ),
  );

  ngOnInit() {
    void this.load();
  }

  async load() {
    try {
      this.data.set(await this.api.academics());
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    }
  }

  protected count(s: Standing) {
    return this.data()?.sections.filter((x) => x.standing === s).length ?? 0;
  }
}
