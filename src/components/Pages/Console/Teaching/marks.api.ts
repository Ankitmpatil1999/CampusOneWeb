/**
 * The teacher's exams and marks (ACA-052…054), as the app reaches them: the exams of the teacher's
 * sections and subjects, one exam's grid, saving the whole grid with its version, and publishing.
 */
import { Injectable, inject } from '@angular/core';
import { TeachingHttp } from './teaching.http';

export interface TeacherExam {
  readonly id: string;
  readonly name: { readonly id: string; readonly name: string };
  readonly section: { readonly id: string; readonly name: string; readonly label: string };
  readonly subject: { readonly id: string; readonly code: string; readonly name: string };
  readonly date: string | null;
  readonly maxMarks: number;
  readonly passMarks: number;
  readonly marks: {
    readonly students: number;
    readonly entered: number;
    readonly valid: number;
    readonly status: 'NOT_UPLOADED' | 'AWAITING_VALIDATION' | 'VALIDATED' | 'INCOMPLETE';
  };
  readonly published: { readonly at: string } | null;
  readonly version: number;
}

export interface MarksRow {
  readonly student: {
    readonly id: string;
    readonly name: string;
    readonly admissionNo: string | null;
  };
  readonly marks: number | null;
  readonly absent: boolean;
  /** The register's mark status (CREATED, VALID); null when nothing is entered. */
  readonly status: string | null;
}

export interface MarksGrid {
  readonly examId: string;
  readonly held: boolean;
  readonly maxMarks: number;
  readonly passMarks: number;
  readonly rows: readonly MarksRow[];
  readonly summary: {
    readonly entered: number;
    readonly average: number | null;
    readonly passed: number;
    readonly failed: number;
  };
  readonly version: number;
}

export interface MarkEntry {
  readonly studentId: string;
  readonly marks?: number;
  readonly absent?: boolean;
}

@Injectable({ providedIn: 'root' })
export class MarksApi {
  private readonly http = inject(TeachingHttp);

  exams() {
    return this.http.get<{ items: readonly TeacherExam[]; grid: null }>('/teacher/exams');
  }

  grid(examId: string) {
    return this.http.get<{ items: readonly TeacherExam[]; grid: MarksGrid }>('/teacher/exams', {
      examId,
    });
  }

  save(examId: string, marks: readonly MarkEntry[], version: number) {
    return this.http.send<MarksGrid>(
      'PUT',
      `/teacher/exams/${encodeURIComponent(examId)}/marks`,
      { marks },
      { version },
    );
  }

  publish(examId: string) {
    return this.http.send<unknown>(
      'POST',
      `/teacher/exams/${encodeURIComponent(examId)}/marks-publication`,
      {},
    );
  }
}
