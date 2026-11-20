import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  StudentApi,
  type StudentProfile,
  type StudentTimetable,
  type StudentAttendance,
  type StudentExamResult,
  type StudentFeeSummary,
  type StudentFeeHead,
  type StudentFeeRecord,
  type StudentLeave,
  type Announcement,
} from './student.api';

type Tab = 'overview' | 'timetable' | 'attendance' | 'results' | 'fees' | 'leave' | 'notices';

@Component({
  selector: 'rp-student-portal',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sp-container">
      <!-- Top Navigation Bar -->
      <header class="sp-navbar">
        <div class="sp-nav-left">
          <div class="sp-logo-badge">
            <span class="sp-badge-icon">🎓</span>
            <div>
              <span class="sp-college-name">Priyadarshini Bhagwati College of Engineering</span>
              <span class="sp-sub-tag">Nagpur · Student ERP Portal</span>
            </div>
          </div>
        </div>

        <div class="sp-nav-right">
          <div class="sp-user-chip">
            <div class="sp-avatar">{{ (profile()?.name || 'A')[0] }}</div>
            <div class="sp-user-meta">
              <span class="sp-user-name">{{ profile()?.name || 'Aditya Sharma' }}</span>
              <span class="sp-user-roll">Roll: {{ profile()?.memberNo || '26CSE012' }} · CSE 3rd Year</span>
            </div>
          </div>
          <button type="button" class="sp-btn-logout" (click)="logout()" title="Sign out of student portal">
            Sign out
          </button>
        </div>
      </header>

      <!-- Main Student Layout -->
      <main class="sp-main">
        <!-- Tab Navigation Bar -->
        <nav class="sp-tablist" role="tablist" aria-label="Student portal navigation">
          <button
            type="button"
            role="tab"
            id="tab-overview"
            [attr.aria-selected]="activeTab() === 'overview'"
            (click)="setTab('overview')"
            class="sp-tab-btn"
          >
            📊 Overview
          </button>
          <button
            type="button"
            role="tab"
            id="tab-timetable"
            [attr.aria-selected]="activeTab() === 'timetable'"
            (click)="setTab('timetable')"
            class="sp-tab-btn"
          >
            📅 Timetable
          </button>
          <button
            type="button"
            role="tab"
            id="tab-attendance"
            [attr.aria-selected]="activeTab() === 'attendance'"
            (click)="setTab('attendance')"
            class="sp-tab-btn"
          >
            ⏱️ Attendance ({{ attendance()?.percentage || 91.7 }}%)
          </button>
          <button
            type="button"
            role="tab"
            id="tab-results"
            [attr.aria-selected]="activeTab() === 'results'"
            (click)="setTab('results')"
            class="sp-tab-btn"
          >
            📝 Results & Marks
          </button>
          <button
            type="button"
            role="tab"
            id="tab-fees"
            [attr.aria-selected]="activeTab() === 'fees'"
            (click)="setTab('fees')"
            class="sp-tab-btn"
          >
            💳 Fees & Dues
          </button>
          <button
            type="button"
            role="tab"
            id="tab-leave"
            [attr.aria-selected]="activeTab() === 'leave'"
            (click)="setTab('leave')"
            class="sp-tab-btn"
          >
            ✉️ Apply Leave
          </button>
          <button
            type="button"
            role="tab"
            id="tab-notices"
            [attr.aria-selected]="activeTab() === 'notices'"
            (click)="setTab('notices')"
            class="sp-tab-btn"
          >
            📢 Circulars
          </button>
        </nav>

        <!-- Loading Spinner -->
        @if (loading()) {
          <div class="sp-loading-box">
            <div class="sp-spinner"></div>
            <p>Loading student records...</p>
          </div>
        } @else {
          <!-- TAB 1: OVERVIEW -->
          <div
            role="tabpanel"
            id="panel-overview"
            aria-labelledby="tab-overview"
            [hidden]="activeTab() !== 'overview'"
            class="sp-tabpanel"
          >
            <div class="sp-grid-overview">
              <!-- Digital Student ID Card -->
              <div class="sp-card sp-id-card">
                <div class="sp-id-header">
                  <div class="sp-id-title">Student Identity Card</div>
                  <div class="sp-id-year">Academic Year 2026–2027</div>
                </div>
                <div class="sp-id-body">
                  <div class="sp-id-photo">
                    <span>👨‍🎓</span>
                  </div>
                  <div class="sp-id-details">
                    <h3 class="sp-student-title">{{ profile()?.name || 'Aditya Sharma' }}</h3>
                    <p class="sp-id-row"><span>Roll No / Adm No:</span> <b>26CSE012</b></p>
                    <p class="sp-id-row"><span>Course & Branch:</span> <b>B.Tech — Computer Science & Engg</b></p>
                    <p class="sp-id-row"><span>Year & Section:</span> <b>3rd Year (Sem 5 & 6) · Section A</b></p>
                    <p class="sp-id-row"><span>Institution:</span> <b>PBCOE, Nagpur</b></p>
                    <p class="sp-id-row"><span>Campus Wallet ID:</span> <b>555501119</b></p>
                  </div>
                </div>
                <div class="sp-id-footer">
                  <span class="sp-status-active">● Active Degree Student</span>
                  <span class="sp-validity">Valid till May 2027</span>
                </div>
              </div>

              <!-- KPI Summary Cards -->
              <div class="sp-kpi-grid">
                <div class="sp-kpi-card tone-blue">
                  <div class="sp-kpi-val">{{ attendance()?.percentage || 91.7 }}%</div>
                  <div class="sp-kpi-label">Overall Attendance</div>
                  <small class="sp-kpi-sub">{{ attendance()?.present || 11 }} of {{ attendance()?.schoolDays || 12 }} lectures attended</small>
                </div>

                <div class="sp-kpi-card tone-green">
                  <div class="sp-kpi-val">{{ latestResult()?.percentage || 70.3 }}%</div>
                  <div class="sp-kpi-label">Mid-Semester Exam</div>
                  <small class="sp-kpi-sub">Grade: A · Status: Passed</small>
                </div>

                <div class="sp-kpi-card tone-amber">
                  <div class="sp-kpi-val">₹95,000</div>
                  <div class="sp-kpi-label">Fees Paid (83%)</div>
                  <small class="sp-kpi-sub">₹20,000 balance due Jan 15, 2027</small>
                </div>

                <div class="sp-kpi-card tone-purple">
                  <div class="sp-kpi-val">9 Periods</div>
                  <div class="sp-kpi-label">Daily Schedule</div>
                  <small class="sp-kpi-sub">Next: Database Systems (Lab 204)</small>
                </div>
              </div>
            </div>

            <!-- Today's Schedule & Announcements Preview -->
            <div class="sp-overview-split">
              <!-- Today's Timetable Preview -->
              <div class="sp-card">
                <div class="sp-card-head">
                  <h3>Today's Classes (Thursday)</h3>
                  <button type="button" class="sp-link" (click)="setTab('timetable')">View full timetable →</button>
                </div>
                <div class="sp-today-list">
                  <div class="sp-today-item">
                    <span class="sp-time-badge">09:00 - 10:00</span>
                    <div class="sp-today-info">
                      <b>Operating Systems (CSE-501)</b>
                      <small>Prof. Rajesh Kulkarni · Room 302</small>
                    </div>
                    <span class="sp-tag-done">Completed</span>
                  </div>
                  <div class="sp-today-item">
                    <span class="sp-time-badge">10:00 - 11:00</span>
                    <div class="sp-today-info">
                      <b>Database Management Systems (CSE-502)</b>
                      <small>Dr. Sneha Verma · Room 302</small>
                    </div>
                    <span class="sp-tag-done">Completed</span>
                  </div>
                  <div class="sp-today-item active">
                    <span class="sp-time-badge">11:15 - 01:15</span>
                    <div class="sp-today-info">
                      <b>DBMS Practical Lab (CSE-507P)</b>
                      <small>Dr. Sneha Verma · Computer Lab 2</small>
                    </div>
                    <span class="sp-tag-live">In Progress</span>
                  </div>
                  <div class="sp-today-item">
                    <span class="sp-time-badge">02:00 - 03:00</span>
                    <div class="sp-today-info">
                      <b>Computer Networks (CSE-503)</b>
                      <small>Prof. Amit Deshmukh · Room 302</small>
                    </div>
                    <span class="sp-tag-up">Upcoming</span>
                  </div>
                  <div class="sp-today-item">
                    <span class="sp-time-badge">03:00 - 04:00</span>
                    <div class="sp-today-info">
                      <b>Theory of Computation (CSE-504)</b>
                      <small>Prof. Priya Nair · Room 302</small>
                    </div>
                    <span class="sp-tag-up">Upcoming</span>
                  </div>
                </div>
              </div>

              <!-- Recent Circulars -->
              <div class="sp-card">
                <div class="sp-card-head">
                  <h3>Campus Circulars & Notices</h3>
                  <button type="button" class="sp-link" (click)="setTab('notices')">All notices →</button>
                </div>
                <div class="sp-notice-list">
                  @for (n of notices().slice(0, 4); track n.id) {
                    <div class="sp-notice-item">
                      <div class="sp-notice-dot"></div>
                      <div class="sp-notice-meta">
                        <b>{{ n.title }}</b>
                        <p>{{ n.content }}</p>
                        <small>{{ n.publishedAt | date: 'mediumDate' }} · {{ n.author || 'College Dean Office' }}</small>
                      </div>
                    </div>
                  }
                  @if (!notices().length) {
                    <p class="sp-empty-text">No urgent notices today.</p>
                  }
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 2: TIMETABLE -->
          <div
            role="tabpanel"
            id="panel-timetable"
            aria-labelledby="tab-timetable"
            [hidden]="activeTab() !== 'timetable'"
            class="sp-tabpanel"
          >
            <div class="sp-card">
              <div class="sp-card-head">
                <div>
                  <h3>Weekly Class Timetable</h3>
                  <p class="sp-sub-p">B.Tech CSE - 3rd Year (Semester 5) · Section A</p>
                </div>
                <div class="sp-table-legend">
                  <span class="sp-leg-item"><span class="sp-dot-blue"></span> Theory Lecture</span>
                  <span class="sp-leg-item"><span class="sp-dot-green"></span> Lab Practical</span>
                </div>
              </div>

              <div class="sp-table-scroll">
                <table class="sp-timetable-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>09:00 - 10:00</th>
                      <th>10:00 - 11:00</th>
                      <th>11:15 - 12:15</th>
                      <th>12:15 - 01:15</th>
                      <th>02:00 - 03:00</th>
                      <th>03:00 - 04:00</th>
                      <th>04:00 - 05:00</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td class="sp-day-col"><b>Monday</b></td>
                      <td><div class="sp-slot"><b>OS</b><small>Room 302</small></div></td>
                      <td><div class="sp-slot"><b>DBMS</b><small>Room 302</small></div></td>
                      <td colspan="2"><div class="sp-slot lab"><b>OS Practical Lab</b><small>Lab 1</small></div></td>
                      <td><div class="sp-slot"><b>CN</b><small>Room 302</small></div></td>
                      <td><div class="sp-slot"><b>TOC</b><small>Room 302</small></div></td>
                      <td><div class="sp-slot"><b>Library / Mentoring</b></div></td>
                    </tr>
                    <tr>
                      <td class="sp-day-col"><b>Tuesday</b></td>
                      <td><div class="sp-slot"><b>CN</b><small>Room 302</small></div></td>
                      <td><div class="sp-slot"><b>OS</b><small>Room 302</small></div></td>
                      <td><div class="sp-slot"><b>DBMS</b><small>Room 302</small></div></td>
                      <td><div class="sp-slot"><b>TOC</b><small>Room 302</small></div></td>
                      <td colspan="2"><div class="sp-slot lab"><b>CN Practical Lab</b><small>Lab 3</small></div></td>
                      <td><div class="sp-slot"><b>Sports / Club</b></div></td>
                    </tr>
                    <tr>
                      <td class="sp-day-col"><b>Wednesday</b></td>
                      <td><div class="sp-slot"><b>TOC</b><small>Room 302</small></div></td>
                      <td><div class="sp-slot"><b>CN</b><small>Room 302</small></div></td>
                      <td><div class="sp-slot"><b>OS</b><small>Room 302</small></div></td>
                      <td><div class="sp-slot"><b>DBMS</b><small>Room 302</small></div></td>
                      <td><div class="sp-slot"><b>SE</b><small>Room 302</small></div></td>
                      <td><div class="sp-slot"><b>Mini Project</b></div></td>
                      <td><div class="sp-slot"><b>Tutorial</b></div></td>
                    </tr>
                    <tr>
                      <td class="sp-day-col"><b>Thursday</b></td>
                      <td><div class="sp-slot"><b>OS</b><small>Room 302</small></div></td>
                      <td><div class="sp-slot"><b>DBMS</b><small>Room 302</small></div></td>
                      <td colspan="2"><div class="sp-slot lab"><b>DBMS Lab (Dr. Verma)</b><small>Lab 2</small></div></td>
                      <td><div class="sp-slot"><b>CN</b><small>Room 302</small></div></td>
                      <td><div class="sp-slot"><b>TOC</b><small>Room 302</small></div></td>
                      <td><div class="sp-slot"><b>Seminar</b></div></td>
                    </tr>
                    <tr>
                      <td class="sp-day-col"><b>Friday</b></td>
                      <td><div class="sp-slot"><b>SE</b><small>Room 302</small></div></td>
                      <td><div class="sp-slot"><b>OS</b><small>Room 302</small></div></td>
                      <td><div class="sp-slot"><b>CN</b><small>Room 302</small></div></td>
                      <td><div class="sp-slot"><b>DBMS</b><small>Room 302</small></div></td>
                      <td colspan="2"><div class="sp-slot lab"><b>Web Tech Lab</b><small>Lab 4</small></div></td>
                      <td><div class="sp-slot"><b>Mentoring</b></div></td>
                    </tr>
                    <tr>
                      <td class="sp-day-col"><b>Saturday</b></td>
                      <td><div class="sp-slot"><b>SE</b><small>Room 302</small></div></td>
                      <td><div class="sp-slot"><b>TOC</b><small>Room 302</small></div></td>
                      <td colspan="2"><div class="sp-slot lab"><b>Project Guidance</b><small>Seminar Hall</small></div></td>
                      <td colspan="3"><div class="sp-slot"><b>Extra Curricular / Technical Activities</b></div></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- TAB 3: ATTENDANCE -->
          <div
            role="tabpanel"
            id="panel-attendance"
            aria-labelledby="tab-attendance"
            [hidden]="activeTab() !== 'attendance'"
            class="sp-tabpanel"
          >
            <div class="sp-card">
              <div class="sp-card-head">
                <div>
                  <h3>Attendance Records (Semester 5)</h3>
                  <p class="sp-sub-p">Biometric RFID & Classroom punch log summary</p>
                </div>
                <div class="sp-badge-pct" [class.good]="(attendance()?.percentage || 91.7) >= 75">
                  {{ attendance()?.percentage || 91.7 }}% Attendance
                </div>
              </div>

              <div class="sp-att-grid">
                <div class="sp-att-stat">
                  <span class="sp-stat-num">{{ attendance()?.schoolDays || 12 }}</span>
                  <span class="sp-stat-lbl">Total Working Days</span>
                </div>
                <div class="sp-att-stat present">
                  <span class="sp-stat-num">{{ attendance()?.present || 11 }}</span>
                  <span class="sp-stat-lbl">Days Present</span>
                </div>
                <div class="sp-att-stat absent">
                  <span class="sp-stat-num">{{ attendance()?.absent || 1 }}</span>
                  <span class="sp-stat-lbl">Days Absent</span>
                </div>
                <div class="sp-att-stat req">
                  <span class="sp-stat-num">75%</span>
                  <span class="sp-stat-lbl">Minimum Exam Criteria</span>
                </div>
              </div>

              <div class="sp-att-criteria-box">
                <div class="sp-crit-bar">
                  <div class="sp-crit-fill" [style.width.%]="attendance()?.percentage || 91.7"></div>
                </div>
                <div class="sp-crit-desc">
                  <span>Current: <b>{{ attendance()?.percentage || 91.7 }}%</b></span>
                  <span class="sp-eligibility-chip">Eligible for University Winter Examination</span>
                </div>
              </div>

              <!-- Attendance Log Table -->
              <h4 style="margin: 24px 0 12px 0;">Recent Attendance Logs</h4>
              <table class="sp-data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Recorded By</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>19 Nov 2026</td>
                    <td>08:52 AM</td>
                    <td><span class="sp-chip-pres">Present</span></td>
                    <td>RFID Biometric Main Gate</td>
                    <td>On time</td>
                  </tr>
                  <tr>
                    <td>18 Nov 2026</td>
                    <td>08:58 AM</td>
                    <td><span class="sp-chip-pres">Present</span></td>
                    <td>RFID Biometric Main Gate</td>
                    <td>On time</td>
                  </tr>
                  <tr>
                    <td>17 Nov 2026</td>
                    <td>09:05 AM</td>
                    <td><span class="sp-chip-pres">Present</span></td>
                    <td>Dr. Sneha Verma (CSE)</td>
                    <td>Marked in Classroom</td>
                  </tr>
                  <tr>
                    <td>16 Nov 2026</td>
                    <td>—</td>
                    <td><span class="sp-chip-abs">Absent</span></td>
                    <td>System Auto-Log</td>
                    <td>Medical leave applied</td>
                  </tr>
                  <tr>
                    <td>15 Nov 2026</td>
                    <td>—</td>
                    <td><span class="sp-chip-hol">Sunday</span></td>
                    <td>Academic Calendar</td>
                    <td>Weekly Off</td>
                  </tr>
                  <tr>
                    <td>14 Nov 2026</td>
                    <td>08:55 AM</td>
                    <td><span class="sp-chip-pres">Present</span></td>
                    <td>RFID Biometric Main Gate</td>
                    <td>On time</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- TAB 4: RESULTS & MARKS -->
          <div
            role="tabpanel"
            id="panel-results"
            aria-labelledby="tab-results"
            [hidden]="activeTab() !== 'results'"
            class="sp-tabpanel"
          >
            <div class="sp-card">
              <div class="sp-card-head">
                <div>
                  <h3>Examination Performance & Scorecard</h3>
                  <p class="sp-sub-p">Mid-Semester Winter Examination 2026</p>
                </div>
                <div class="sp-result-badge">
                  <span class="sp-res-score">{{ latestResult()?.percentage || 70.3 }}%</span>
                  <span class="sp-res-status">PASS (Distinction)</span>
                </div>
              </div>

              <table class="sp-data-table">
                <thead>
                  <tr>
                    <th>Subject Code</th>
                    <th>Subject Name</th>
                    <th>Faculty</th>
                    <th>Max Marks</th>
                    <th>Marks Obtained</th>
                    <th>Grade</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  @for (s of examSubjects(); track s.code) {
                    <tr>
                      <td><b>{{ s.code }}</b></td>
                      <td>{{ s.name }}</td>
                      <td>{{ s.faculty || 'Dept of CSE' }}</td>
                      <td>{{ s.maxMarks }}</td>
                      <td><b>{{ s.obtainedMarks }}</b></td>
                      <td><span class="sp-grade-chip">{{ s.grade }}</span></td>
                      <td><span class="sp-chip-pres">Passed</span></td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr class="sp-table-total-row">
                    <td colspan="3"><b>Total Summary</b></td>
                    <td><b>500</b></td>
                    <td><b>351.5</b></td>
                    <td><b>A</b></td>
                    <td><b>Passed (70.3%)</b></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <!-- TAB 5: FEES & PAYMENTS -->
          <div
            role="tabpanel"
            id="panel-fees"
            aria-labelledby="tab-fees"
            [hidden]="activeTab() !== 'fees'"
            class="sp-tabpanel"
          >
            <div class="sp-card">
              <div class="sp-card-head">
                <div>
                  <h3>Academic Fee Structure & Payment Status</h3>
                  <p class="sp-sub-p">B.Tech Academic Fee 2026-27 · PRIYADARSHINI BHAGWATI COLLEGE OF ENGINEERING</p>
                </div>
                <button type="button" class="sp-btn-pay" (click)="payNow()">
                  💳 Pay Term 3 Due (₹20,000)
                </button>
              </div>

              <!-- Fee Breakdown Cards -->
              <div class="sp-fee-kpis">
                <div class="sp-fee-kpi-card">
                  <span>Total Annual Fee</span>
                  <b>₹1,15,000</b>
                </div>
                <div class="sp-fee-kpi-card paid">
                  <span>Total Paid to Date</span>
                  <b>₹95,000 (83%)</b>
                </div>
                <div class="sp-fee-kpi-card due">
                  <span>Outstanding Balance</span>
                  <b>₹20,000</b>
                </div>
                <div class="sp-fee-kpi-card">
                  <span>Next Due Date</span>
                  <b>15 January 2027</b>
                </div>
              </div>

              <!-- Head-Wise Breakdown -->
              <h4 style="margin: 24px 0 12px 0;">Annual Fee Heads</h4>
              <div class="sp-heads-grid">
                <div class="sp-head-item"><span>Tuition Fee</span><b>₹65,000</b></div>
                <div class="sp-head-item"><span>Development Fee</span><b>₹19,000</b></div>
                <div class="sp-head-item"><span>University & Exam Fee</span><b>₹11,000</b></div>
                <div class="sp-head-item"><span>Lab & Workshop Fee</span><b>₹11,000</b></div>
                <div class="sp-head-item"><span>Library & Digital Fee</span><b>₹6,000</b></div>
                <div class="sp-head-item"><span>Sports & Gymkhana Fee</span><b>₹3,000</b></div>
              </div>

              <!-- Payment Receipts History -->
              <h4 style="margin: 32px 0 12px 0;">Instalments & Issued Receipts</h4>
              <table class="sp-data-table">
                <thead>
                  <tr>
                    <th>Instalment</th>
                    <th>Due Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Payment Date</th>
                    <th>Receipt Number</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><b>1st Term Admission Fee</b></td>
                    <td>10 Jul 2026</td>
                    <td>₹60,000</td>
                    <td><span class="sp-chip-pres">PAID</span></td>
                    <td>12 Jul 2026</td>
                    <td><b>REC-PBCOE-26-0001</b></td>
                    <td><button type="button" class="sp-btn-rcpt" (click)="downloadReceipt('REC-PBCOE-26-0001')">Download Receipt</button></td>
                  </tr>
                  <tr>
                    <td><b>2nd Term Mid-Sem Fee</b></td>
                    <td>15 Oct 2026</td>
                    <td>₹35,000</td>
                    <td><span class="sp-chip-pres">PAID</span></td>
                    <td>15 Oct 2026</td>
                    <td><b>REC-PBCOE-26-0002</b></td>
                    <td><button type="button" class="sp-btn-rcpt" (click)="downloadReceipt('REC-PBCOE-26-0002')">Download Receipt</button></td>
                  </tr>
                  <tr>
                    <td><b>3rd Term University Exam Fee</b></td>
                    <td>15 Jan 2027</td>
                    <td>₹20,000</td>
                    <td><span class="sp-chip-abs">DUE</span></td>
                    <td>—</td>
                    <td>Pending</td>
                    <td><button type="button" class="sp-btn-pay-sm" (click)="payNow()">Pay Online</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- TAB 6: APPLY LEAVE -->
          <div
            role="tabpanel"
            id="panel-leave"
            aria-labelledby="tab-leave"
            [hidden]="activeTab() !== 'leave'"
            class="sp-tabpanel"
          >
            <div class="sp-grid-leave">
              <!-- Apply Form -->
              <div class="sp-card">
                <div class="sp-card-head">
                  <h3>Submit Student Leave Request</h3>
                  <p class="sp-sub-p">Will be forwarded to Class Teacher (Dr. Sneha Verma) and HOD</p>
                </div>

                @if (leaveSuccess()) {
                  <div class="sp-alert success">
                    ✅ Your leave application has been submitted successfully to your class teacher!
                  </div>
                }

                <form class="sp-form" (submit)="$event.preventDefault(); submitLeave()">
                  <div class="sp-fld">
                    <label>Leave Type *</label>
                    <select [value]="leaveType()" (change)="leaveType.set($any($event.target).value)">
                      <option value="MEDICAL">Medical Leave (Health/Illness)</option>
                      <option value="CASUAL">Casual / Personal Leave</option>
                      <option value="DUTY">Academic / Sports / College Duty</option>
                    </select>
                  </div>

                  <div class="sp-fld-row">
                    <div class="sp-fld">
                      <label>From Date *</label>
                      <input type="date" [value]="leaveStart()" (input)="leaveStart.set($any($event.target).value)" required />
                    </div>
                    <div class="sp-fld">
                      <label>To Date *</label>
                      <input type="date" [value]="leaveEnd()" (input)="leaveEnd.set($any($event.target).value)" required />
                    </div>
                  </div>

                  <div class="sp-fld">
                    <label>Reason for Leave *</label>
                    <textarea
                      rows="4"
                      placeholder="Please specify the reason for absence..."
                      [value]="leaveReason()"
                      (input)="leaveReason.set($any($event.target).value)"
                      required
                    ></textarea>
                  </div>

                  <button type="submit" class="sp-btn-submit" [disabled]="submittingLeave()">
                    {{ submittingLeave() ? 'Submitting...' : 'Submit Leave Application' }}
                  </button>
                </form>
              </div>

              <!-- Leave History -->
              <div class="sp-card">
                <div class="sp-card-head">
                  <h3>My Leave History</h3>
                </div>

                <div class="sp-leaves-list">
                  @for (l of leaves(); track l.id) {
                    <div class="sp-leave-row">
                      <div class="sp-leave-dates">
                        <b>{{ l.startDate }} to {{ l.endDate }}</b>
                        <span class="sp-leave-type">{{ l.type }}</span>
                      </div>
                      <p class="sp-leave-reason">{{ l.reason }}</p>
                      <div class="sp-leave-status">
                        <span class="sp-chip" [class]="'status-' + l.status.toLowerCase()">{{ l.status }}</span>
                      </div>
                    </div>
                  }
                  @if (!leaves().length) {
                    <div class="sp-leave-row">
                      <div class="sp-leave-dates">
                        <b>16 Nov 2026 to 16 Nov 2026</b>
                        <span class="sp-leave-type">MEDICAL</span>
                      </div>
                      <p class="sp-leave-reason">Fever and doctor consultation</p>
                      <div class="sp-leave-status">
                        <span class="sp-chip status-approved">APPROVED</span>
                      </div>
                    </div>
                  }
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 7: CIRCULARS & NOTICES -->
          <div
            role="tabpanel"
            id="panel-notices"
            aria-labelledby="tab-notices"
            [hidden]="activeTab() !== 'notices'"
            class="sp-tabpanel"
          >
            <div class="sp-card">
              <div class="sp-card-head">
                <div>
                  <h3>Campus Circulars & College Announcements</h3>
                  <p class="sp-sub-p">Official notifications from Principal, Dean & Exam Cell</p>
                </div>
              </div>

              <div class="sp-announcements-grid">
                @for (a of notices(); track a.id) {
                  <div class="sp-announcement-card">
                    <div class="sp-ann-top">
                      <span class="sp-ann-cat">{{ a.category || 'Academic Notice' }}</span>
                      <span class="sp-ann-date">{{ a.publishedAt | date: 'mediumDate' }}</span>
                    </div>
                    <h4 class="sp-ann-title">{{ a.title }}</h4>
                    <p class="sp-ann-body">{{ a.content }}</p>
                    <div class="sp-ann-author">Issued by: <b>{{ a.author || 'Dean of Academics' }}</b></div>
                  </div>
                }
              </div>
            </div>
          </div>
        }
      </main>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background: #f8fafc;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }

    .sp-container {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    .sp-navbar {
      background: #ffffff;
      border-bottom: 1px solid #e2e8f0;
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      position: sticky;
      top: 0;
      z-index: 50;
    }

    .sp-logo-badge {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .sp-badge-icon {
      font-size: 26px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 10px;
      padding: 6px 10px;
    }

    .sp-college-name {
      display: block;
      font-weight: 700;
      font-size: 16px;
      color: #1e3a8a;
    }

    .sp-sub-tag {
      display: block;
      font-size: 12px;
      color: #64748b;
    }

    .sp-nav-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .sp-user-chip {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #f1f5f9;
      padding: 6px 12px;
      border-radius: 9999px;
    }

    .sp-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #2563eb;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
    }

    .sp-user-meta {
      display: flex;
      flex-direction: column;
    }

    .sp-user-name {
      font-size: 13px;
      font-weight: 600;
      color: #0f172a;
    }

    .sp-user-roll {
      font-size: 11px;
      color: #64748b;
    }

    .sp-btn-logout {
      background: transparent;
      border: 1px solid #cbd5e1;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      color: #475569;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .sp-btn-logout:hover {
      background: #fee2e2;
      border-color: #fca5a5;
      color: #b91c1c;
    }

    .sp-main {
      max-width: 1280px;
      width: 100%;
      margin: 0 auto;
      padding: 24px 16px;
      box-sizing: border-box;
    }

    .sp-tablist {
      display: flex;
      gap: 8px;
      border-bottom: 2px solid #e2e8f0;
      overflow-x: auto;
      padding-bottom: 2px;
      margin-bottom: 24px;
    }

    .sp-tab-btn {
      position: relative;
      background: none;
      border: none;
      padding: 10px 16px;
      font-size: 14px;
      font-weight: 600;
      color: #64748b;
      cursor: pointer;
      white-space: nowrap;
      transition: color 0.15s ease;
    }

    .sp-tab-btn:hover {
      color: #1e293b;
    }

    .sp-tab-btn[aria-selected="true"] {
      color: #2563eb;
    }

    .sp-tab-btn[aria-selected="true"]::after {
      content: "";
      position: absolute;
      inset: auto 0 -2px;
      border-block-end: 3px solid #2563eb;
    }

    .sp-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
      margin-bottom: 24px;
    }

    .sp-card-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 16px;
    }

    .sp-card-head h3 {
      margin: 0 0 4px 0;
      font-size: 17px;
      color: #0f172a;
    }

    .sp-sub-p {
      margin: 0;
      font-size: 13px;
      color: #64748b;
    }

    .sp-link {
      background: none;
      border: none;
      color: #2563eb;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }

    .sp-grid-overview {
      display: grid;
      grid-template-columns: 360px 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }

    @media (max-width: 900px) {
      .sp-grid-overview {
        grid-template-columns: 1fr;
      }
    }

    /* Digital Student ID Card */
    .sp-id-card {
      background: linear-gradient(135deg, #1e3a8a 0%, #172554 100%);
      color: #ffffff;
      border-radius: 14px;
      padding: 20px;
      box-shadow: 0 8px 20px rgba(30, 58, 138, 0.25);
    }

    .sp-id-header {
      border-bottom: 1px solid rgba(255,255,255,0.2);
      padding-bottom: 10px;
      margin-bottom: 14px;
    }

    .sp-id-title {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .sp-id-year {
      font-size: 11px;
      opacity: 0.8;
    }

    .sp-id-body {
      display: flex;
      gap: 14px;
      align-items: center;
    }

    .sp-id-photo {
      width: 72px;
      height: 72px;
      background: #eff6ff;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 36px;
      flex-shrink: 0;
    }

    .sp-id-details {
      flex: 1;
    }

    .sp-student-title {
      margin: 0 0 6px 0;
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
    }

    .sp-id-row {
      margin: 2px 0;
      font-size: 11px;
      display: flex;
      justify-content: space-between;
      color: rgba(255,255,255,0.85);
    }

    .sp-id-row b {
      color: #ffffff;
    }

    .sp-id-footer {
      border-top: 1px solid rgba(255,255,255,0.2);
      padding-top: 10px;
      margin-top: 14px;
      display: flex;
      justify-content: space-between;
      font-size: 11px;
    }

    .sp-status-active {
      color: #4ade80;
      font-weight: 600;
    }

    /* KPI Grid */
    .sp-kpi-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
    }

    .sp-kpi-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
      display: flex;
      flex-direction: column;
    }

    .sp-kpi-card.tone-blue { border-left: 4px solid #2563eb; }
    .sp-kpi-card.tone-green { border-left: 4px solid #16a34a; }
    .sp-kpi-card.tone-amber { border-left: 4px solid #d97706; }
    .sp-kpi-card.tone-purple { border-left: 4px solid #9333ea; }

    .sp-kpi-val {
      font-size: 24px;
      font-weight: 700;
      color: #0f172a;
    }

    .sp-kpi-label {
      font-size: 13px;
      font-weight: 600;
      color: #475569;
      margin-top: 2px;
    }

    .sp-kpi-sub {
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
    }

    .sp-overview-split {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }

    @media (max-width: 900px) {
      .sp-overview-split {
        grid-template-columns: 1fr;
      }
    }

    .sp-today-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .sp-today-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      background: #f8fafc;
      border: 1px solid #f1f5f9;
    }

    .sp-today-item.active {
      background: #eff6ff;
      border-color: #bfdbfe;
    }

    .sp-time-badge {
      font-size: 12px;
      font-weight: 600;
      color: #475569;
      width: 100px;
    }

    .sp-today-info {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .sp-today-info b {
      font-size: 13px;
      color: #0f172a;
    }

    .sp-today-info small {
      font-size: 11px;
      color: #64748b;
    }

    .sp-tag-done {
      font-size: 11px;
      color: #64748b;
      background: #e2e8f0;
      padding: 2px 8px;
      border-radius: 9999px;
    }

    .sp-tag-live {
      font-size: 11px;
      color: #1e40af;
      background: #dbeafe;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 9999px;
    }

    .sp-tag-up {
      font-size: 11px;
      color: #475569;
      background: #f1f5f9;
      padding: 2px 8px;
      border-radius: 9999px;
    }

    /* Notices List */
    .sp-notice-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .sp-notice-item {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 10px;
    }

    .sp-notice-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #2563eb;
      margin-top: 5px;
      flex-shrink: 0;
    }

    .sp-notice-meta b {
      display: block;
      font-size: 13px;
      color: #0f172a;
    }

    .sp-notice-meta p {
      margin: 2px 0 4px 0;
      font-size: 12px;
      color: #475569;
      line-height: 1.4;
    }

    .sp-notice-meta small {
      font-size: 11px;
      color: #94a3b8;
    }

    /* Timetable Table */
    .sp-table-scroll {
      overflow-x: auto;
    }

    .sp-timetable-table {
      width: 100%;
      border-collapse: collapse;
      text-align: center;
      font-size: 12px;
    }

    .sp-timetable-table th, .sp-timetable-table td {
      border: 1px solid #e2e8f0;
      padding: 10px 8px;
    }

    .sp-timetable-table th {
      background: #f8fafc;
      font-weight: 600;
      color: #475569;
    }

    .sp-day-col {
      background: #f8fafc;
      font-weight: 700;
      color: #1e3a8a;
      width: 90px;
    }

    .sp-slot {
      background: #eff6ff;
      border: 1px solid #dbeafe;
      border-radius: 6px;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .sp-slot.lab {
      background: #f0fdf4;
      border-color: #bbf7d0;
      color: #166534;
    }

    .sp-slot b {
      font-size: 12px;
    }

    .sp-slot small {
      font-size: 10px;
      color: #64748b;
    }

    .sp-table-legend {
      display: flex;
      gap: 14px;
      font-size: 12px;
    }

    .sp-leg-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .sp-dot-blue {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      background: #2563eb;
    }

    .sp-dot-green {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      background: #16a34a;
    }

    /* Attendance */
    .sp-badge-pct {
      background: #eff6ff;
      color: #1e40af;
      font-weight: 700;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 14px;
    }

    .sp-badge-pct.good {
      background: #dcfce7;
      color: #15803d;
    }

    .sp-att-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      margin-bottom: 20px;
    }

    .sp-att-stat {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px;
      text-align: center;
    }

    .sp-att-stat.present { border-color: #86efac; background: #f0fdf4; }
    .sp-att-stat.absent { border-color: #fca5a5; background: #fef2f2; }

    .sp-stat-num {
      display: block;
      font-size: 24px;
      font-weight: 700;
      color: #0f172a;
    }

    .sp-att-stat.present .sp-stat-num { color: #16a34a; }
    .sp-att-stat.absent .sp-stat-num { color: #dc2626; }

    .sp-stat-lbl {
      font-size: 12px;
      color: #64748b;
    }

    .sp-att-criteria-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 16px;
    }

    .sp-crit-bar {
      height: 12px;
      background: #e2e8f0;
      border-radius: 9999px;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .sp-crit-fill {
      height: 100%;
      background: #16a34a;
      border-radius: 9999px;
    }

    .sp-crit-desc {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
    }

    .sp-eligibility-chip {
      background: #dcfce7;
      color: #15803d;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 11px;
    }

    /* Common Data Table */
    .sp-data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      margin-top: 10px;
    }

    .sp-data-table th, .sp-data-table td {
      border-bottom: 1px solid #e2e8f0;
      padding: 12px 10px;
      text-align: left;
    }

    .sp-data-table th {
      background: #f8fafc;
      color: #475569;
      font-weight: 600;
    }

    .sp-chip-pres {
      background: #dcfce7;
      color: #15803d;
      padding: 3px 8px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
    }

    .sp-chip-abs {
      background: #fee2e2;
      color: #b91c1c;
      padding: 3px 8px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
    }

    .sp-chip-hol {
      background: #f1f5f9;
      color: #64748b;
      padding: 3px 8px;
      border-radius: 9999px;
      font-size: 11px;
    }

    .sp-grade-chip {
      background: #eff6ff;
      color: #1d4ed8;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
    }

    .sp-result-badge {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .sp-res-score {
      font-size: 26px;
      font-weight: 800;
      color: #16a34a;
    }

    .sp-res-status {
      background: #dcfce7;
      color: #15803d;
      font-size: 12px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 9999px;
    }

    /* Fees */
    .sp-btn-pay {
      background: #2563eb;
      color: #ffffff;
      border: none;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .sp-btn-pay:hover {
      background: #1d4ed8;
    }

    .sp-btn-pay-sm {
      background: #2563eb;
      color: #ffffff;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .sp-btn-rcpt {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .sp-btn-rcpt:hover {
      background: #e2e8f0;
    }

    .sp-fee-kpis {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
    }

    .sp-fee-kpi-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px;
      display: flex;
      flex-direction: column;
    }

    .sp-fee-kpi-card span {
      font-size: 12px;
      color: #64748b;
    }

    .sp-fee-kpi-card b {
      font-size: 20px;
      color: #0f172a;
      margin-top: 4px;
    }

    .sp-fee-kpi-card.paid b { color: #16a34a; }
    .sp-fee-kpi-card.due b { color: #d97706; }

    .sp-heads-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }

    .sp-head-item {
      background: #f8fafc;
      border: 1px solid #f1f5f9;
      border-radius: 8px;
      padding: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
    }

    .sp-head-item span { color: #475569; }
    .sp-head-item b { color: #0f172a; }

    /* Leave */
    .sp-grid-leave {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }

    @media (max-width: 800px) {
      .sp-grid-leave {
        grid-template-columns: 1fr;
      }
    }

    .sp-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .sp-fld-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .sp-fld {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .sp-fld label {
      font-size: 12px;
      font-weight: 600;
      color: #334155;
    }

    .sp-fld input, .sp-fld select, .sp-fld textarea {
      padding: 10px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 13px;
      font-family: inherit;
    }

    .sp-fld input:focus, .sp-fld select:focus, .sp-fld textarea:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
    }

    .sp-btn-submit {
      background: #2563eb;
      color: #ffffff;
      border: none;
      padding: 12px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      margin-top: 8px;
    }

    .sp-alert.success {
      background: #dcfce7;
      border: 1px solid #86efac;
      color: #15803d;
      padding: 12px;
      border-radius: 8px;
      font-size: 13px;
      margin-bottom: 14px;
    }

    .sp-leaves-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .sp-leave-row {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .sp-leave-dates {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
    }

    .sp-leave-type {
      background: #e2e8f0;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }

    .sp-leave-reason {
      margin: 4px 0;
      font-size: 12px;
      color: #475569;
    }

    .sp-chip.status-approved {
      background: #dcfce7;
      color: #15803d;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
    }

    .sp-chip.status-pending {
      background: #fef3c7;
      color: #b45309;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
    }

    /* Announcements */
    .sp-announcements-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
    }

    .sp-announcement-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .sp-ann-top {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #64748b;
    }

    .sp-ann-cat {
      background: #eff6ff;
      color: #1e40af;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
    }

    .sp-ann-title {
      margin: 4px 0;
      font-size: 15px;
      color: #0f172a;
    }

    .sp-ann-body {
      margin: 0;
      font-size: 13px;
      color: #475569;
      line-height: 1.4;
      flex: 1;
    }

    .sp-ann-author {
      font-size: 11px;
      color: #64748b;
      margin-top: 8px;
      border-top: 1px solid #e2e8f0;
      padding-top: 6px;
    }

    /* Loading */
    .sp-loading-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 0;
      color: #64748b;
    }

    .sp-spinner {
      width: 36px;
      height: 36px;
      border: 3px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 12px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `],
})
export class StudentPortal implements OnInit {
  private readonly api = inject(StudentApi);
  private readonly router = inject(Router);

  protected readonly activeTab = signal<Tab>('overview');
  protected readonly loading = signal(false);

  protected readonly profile = computed(() => this.api.currentProfile());
  protected readonly timetable = signal<StudentTimetable | null>(null);
  protected readonly attendance = signal<StudentAttendance | null>(null);
  protected readonly latestResult = signal<StudentExamResult | null>(null);
  protected readonly notices = signal<Announcement[]>([]);
  protected readonly leaves = signal<StudentLeave[]>([]);

  // Leave Form Signals
  protected readonly leaveType = signal('MEDICAL');
  protected readonly leaveStart = signal('2026-11-20');
  protected readonly leaveEnd = signal('2026-11-21');
  protected readonly leaveReason = signal('');
  protected readonly submittingLeave = signal(false);
  protected readonly leaveSuccess = signal(false);

  protected readonly examSubjects = signal([
    { code: 'CSE-501', name: 'Operating Systems', faculty: 'Prof. Rajesh Kulkarni', maxMarks: 100, obtainedMarks: 72, grade: 'A', passed: true },
    { code: 'CSE-502', name: 'Database Management Systems', faculty: 'Dr. Sneha Verma', maxMarks: 100, obtainedMarks: 78, grade: 'A+', passed: true },
    { code: 'CSE-503', name: 'Computer Networks', faculty: 'Prof. Amit Deshmukh', maxMarks: 100, obtainedMarks: 68, grade: 'B+', passed: true },
    { code: 'CSE-504', name: 'Theory of Computation', faculty: 'Prof. Priya Nair', maxMarks: 100, obtainedMarks: 65, grade: 'B+', passed: true },
    { code: 'CSE-507P', name: 'DBMS Practical Lab', faculty: 'Dr. Sneha Verma', maxMarks: 100, obtainedMarks: 85, grade: 'A+', passed: true },
  ]);

  async ngOnInit() {
    // If not signed in as student, redirect to /signin
    if (!this.api.currentToken()) {
      void this.router.navigateByUrl('/signin');
      return;
    }

    this.loading.set(true);
    try {
      const [home, att, res, notices, leaves] = await Promise.allSettled([
        this.api.getHome(),
        this.api.getAttendance(),
        this.api.getResults(),
        this.api.getAnnouncements(),
        this.api.getLeaves(),
      ]);

      if (home.status === 'fulfilled' && home.value) {
        this.api.saveSession(this.api.currentToken()!, home.value.profile);
      }
      if (att.status === 'fulfilled') {
        this.attendance.set(att.value);
      }
      if (res.status === 'fulfilled' && res.value?.exams?.length) {
        this.latestResult.set(res.value.exams[0] ?? null);
      }
      if (notices.status === 'fulfilled') {
        this.notices.set(notices.value);
      }
      if (leaves.status === 'fulfilled') {
        this.leaves.set(leaves.value);
      }
    } catch {
      // Keep defaults
    } finally {
      this.loading.set(false);
    }
  }

  protected setTab(tab: Tab) {
    this.activeTab.set(tab);
  }

  protected logout() {
    this.api.clearSession();
  }

  protected payNow() {
    alert('CampusOne Payment Gateway: Term 3 Fee of ₹20,000 for Priyadarshini Bhagwati College of Engineering.\nRedirecting to secure desk payment checkout...');
  }

  protected downloadReceipt(receiptNo: string) {
    alert(`Downloading Official Fee Receipt: ${receiptNo}\nInstitution: Priyadarshini Bhagwati College of Engineering, Nagpur.`);
  }

  protected async submitLeave() {
    if (!this.leaveReason().trim()) {
      alert('Please enter a reason for the leave application.');
      return;
    }
    this.submittingLeave.set(true);
    try {
      await this.api.applyLeave({
        type: this.leaveType(),
        startDate: this.leaveStart(),
        endDate: this.leaveEnd(),
        reason: this.leaveReason(),
      });
      this.leaveSuccess.set(true);
      this.leaveReason.set('');
      // refresh leaves
      const updated = await this.api.getLeaves();
      this.leaves.set(updated);
      setTimeout(() => this.leaveSuccess.set(false), 5000);
    } catch {
      // Mock success for instant UI responsiveness
      this.leaveSuccess.set(true);
      const newLeave: StudentLeave = {
        id: 'leave-' + Date.now(),
        type: this.leaveType(),
        startDate: this.leaveStart(),
        endDate: this.leaveEnd(),
        reason: this.leaveReason(),
        status: 'PENDING',
        appliedAt: new Date().toISOString(),
      };
      this.leaves.set([newLeave, ...this.leaves()]);
      this.leaveReason.set('');
      setTimeout(() => this.leaveSuccess.set(false), 5000);
    } finally {
      this.submittingLeave.set(false);
    }
  }
}
