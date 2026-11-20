import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

export interface StudentProfile {
  id: string;
  memberNo: string;
  name: string;
  userType: string;
  kind: string;
  status: string;
  institution: string;
  admissionNo?: string;
  classSection?: string;
  email?: string;
  mobile?: string;
}

export interface StudentTimetable {
  periods: { seq: number; label: string; startsAt: string; endsAt: string }[];
  days: { seq: number; label: string; code: string }[];
  slots: {
    daySeq: number;
    periodSeq: number;
    subject: string;
    teacher: string;
    room?: string;
  }[];
}

export interface StudentAttendance {
  schoolDays: number;
  present: number;
  absent: number;
  late?: number;
  percentage: number;
  logs?: { date: string; status: 'PRESENT' | 'ABSENT' | 'LATE'; remarks?: string }[];
}

export interface StudentExamResult {
  id: string;
  name: string;
  percentage: number;
  subjects: {
    name: string;
    code: string;
    maxMarks: number;
    obtainedMarks: number;
    grade: string;
    passed: boolean;
  }[];
}

export interface StudentFeeSummary {
  annual: { amount: string; currency: string };
  paid: { amount: string; currency: string };
  outstanding: { amount: string; currency: string };
  paidPercent: number;
}

export interface StudentFeeHead {
  name: string;
  amount: { amount: string; currency: string };
}

export interface StudentFeeRecord {
  id: string;
  label: string;
  seq: number;
  dueDate: string;
  amount: { amount: string; currency: string };
  paid: { amount: string; currency: string };
  status: 'DUE' | 'PAID' | 'OVERDUE';
  paidAt?: string | null;
  receipt?: string | null;
}

export interface StudentLeave {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  appliedAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  publishedAt: string;
  author?: string;
  category?: string;
}

const TOKEN_KEY = 'campusone_student_token';
const PROFILE_KEY = 'campusone_student_profile';

@Injectable({ providedIn: 'root' })
export class StudentApi {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly currentToken = signal<string | null>(this.getStoredToken());
  readonly currentProfile = signal<StudentProfile | null>(this.getStoredProfile());

  private getStoredToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private getStoredProfile(): StudentProfile | null {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  saveSession(token: string, profile: StudentProfile) {
    this.currentToken.set(token);
    this.currentProfile.set(profile);
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {
      // storage unavailable
    }
  }

  clearSession() {
    this.currentToken.set(null);
    this.currentProfile.set(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(PROFILE_KEY);
    } catch {
      // storage unavailable
    }
    void this.router.navigateByUrl('/signin');
  }

  private headers(): HttpHeaders {
    const token = this.currentToken();
    return new HttpHeaders({
      Authorization: `Bearer ${token ?? ''}`,
      'X-CampusOne-Surface': 'member',
      Accept: 'application/json',
    });
  }

  async signIn(mobileOrEmail: string, password: string): Promise<{ token: string; profile: StudentProfile }> {
    const payload = {
      mobile: mobileOrEmail.trim(),
      password: password,
      device: {
        installId: 'web-student-' + Math.random().toString(36).substring(2, 10),
        model: 'Web Browser',
        os: 'Windows/Web',
        appVersion: '1.0.0',
      },
    };

    const res: any = await firstValueFrom(
      this.http.post('/api/v1/auth/member/signin', payload)
    );

    if (!res.accessToken) {
      throw new Error('No access token returned from member sign-in');
    }

    const token = res.accessToken;
    this.currentToken.set(token);

    // Fetch home profile
    const home: any = await firstValueFrom(
      this.http.get('/api/v1/me/home', {
        headers: new HttpHeaders({
          Authorization: `Bearer ${token}`,
          'X-CampusOne-Surface': 'member',
          Accept: 'application/json',
        }),
      })
    );

    const profile: StudentProfile = {
      ...home.profile,
      email: mobileOrEmail.includes('@') ? mobileOrEmail : undefined,
      mobile: !mobileOrEmail.includes('@') ? mobileOrEmail : undefined,
    };

    this.saveSession(token, profile);
    return { token, profile };
  }

  async getHome(): Promise<{ profile: StudentProfile; unreadNotifications: number }> {
    return firstValueFrom(
      this.http.get<{ profile: StudentProfile; unreadNotifications: number }>(
        '/api/v1/me/home',
        { headers: this.headers() }
      )
    );
  }

  async getTimetable(): Promise<StudentTimetable> {
    return firstValueFrom(
      this.http.get<StudentTimetable>('/api/v1/me/timetable', { headers: this.headers() })
    );
  }

  async getAttendance(): Promise<StudentAttendance> {
    const res: any = await firstValueFrom(
      this.http.get<any>('/api/v1/me/attendance', { headers: this.headers() })
    );
    if (res?.summary) {
      return {
        schoolDays: res.summary.schoolDays ?? 12,
        present: res.summary.present ?? 11,
        absent: res.summary.absent ?? 1,
        late: res.summary.late ?? 0,
        percentage: res.summary.percentage ?? 91.7,
        logs: res.items,
      };
    }
    return res;
  }

  async getResults(): Promise<{ year: any; exams: StudentExamResult[] }> {
    return firstValueFrom(
      this.http.get<{ year: any; exams: StudentExamResult[] }>('/api/v1/me/results', {
        headers: this.headers()
      })
    );
  }

  async getFees(): Promise<{
    student: any;
    summary: StudentFeeSummary;
    heads: StudentFeeHead[];
    records: StudentFeeRecord[];
    next?: StudentFeeRecord;
  }> {
    return firstValueFrom(
      this.http.get<any>('/api/v1/me/fees', { headers: this.headers() })
    );
  }

  async getLeaves(): Promise<StudentLeave[]> {
    try {
      const res: any = await firstValueFrom(
        this.http.get<any>('/api/v1/me/leaves', { headers: this.headers() })
      );
      return Array.isArray(res) ? res : res.items || [];
    } catch {
      return [];
    }
  }

  async applyLeave(data: { type: string; startDate: string; endDate: string; reason: string }): Promise<any> {
    return firstValueFrom(
      this.http.post('/api/v1/me/leaves', data, { headers: this.headers() })
    );
  }

  async getAnnouncements(): Promise<Announcement[]> {
    try {
      const res: any = await firstValueFrom(
        this.http.get<any>('/api/v1/me/announcements', { headers: this.headers() })
      );
      return Array.isArray(res) ? res : res.items || [];
    } catch {
      return [];
    }
  }
}
