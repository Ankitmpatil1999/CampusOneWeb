/**
 * The operators' quiz bank (FIN-009…017, SRS 28, CR-01): topics with their staging, published and
 * attempt counts; the staging bank (added one by one, edited, removed, or uploaded from a sheet of
 * six-row blocks); publishing a topic's staging to members in one step; and the platform-wide
 * leaderboard, a cross-institution read recorded with its reason.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';

export interface QuizTopic {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly icon: string | null;
  readonly status: 'ACTIVE' | 'WITHDRAWN';
  readonly staging: number;
  readonly published: number;
  readonly attempts: number;
  readonly updatedAt: string | null;
  readonly version: number;
}

export interface StagingQuestion {
  readonly id: string;
  readonly topic: { readonly id: string; readonly name: string };
  readonly text: string;
  readonly options: readonly string[];
  readonly correct: number;
  readonly explanation: string | null;
  /** The question as it stands is what members are served. */
  readonly published: boolean;
  readonly version: number;
}

export interface QuestionInput {
  readonly text: string;
  readonly options: readonly string[];
  readonly correct: number;
  readonly explanation: string | null;
}

export interface UploadReport {
  readonly accepted: number;
  readonly skipped: number;
  readonly rejected: readonly { readonly row: number; readonly reason: string }[];
}

export interface Leaderboard {
  readonly period: 'all' | 'year';
  readonly ranked: number;
  readonly institutions: number;
  readonly items: readonly {
    readonly rank: number;
    readonly name: string;
    readonly institution: string;
    readonly average: number;
    readonly attempts: number;
  }[];
}

const BASE = '/api/v1/ops/quiz';
const key = () => ({ 'Idempotency-Key': newIdempotencyKey() });

@Injectable({ providedIn: 'root' })
export class QuizApi {
  private readonly http = inject(HttpClient);

  topics() {
    return firstValueFrom(this.http.get<{ items: readonly QuizTopic[] }>(`${BASE}/topics`));
  }

  addTopic(body: { name: string; description: string | null; icon: string | null }) {
    return firstValueFrom(this.http.post<QuizTopic>(`${BASE}/topics`, body, { headers: key() }));
  }

  editTopic(
    t: Pick<QuizTopic, 'id' | 'version'>,
    body: Partial<{
      name: string;
      description: string | null;
      icon: string | null;
      status: QuizTopic['status'];
    }>,
  ) {
    return firstValueFrom(
      this.http.patch<QuizTopic>(`${BASE}/topics/${encodeURIComponent(t.id)}`, body, {
        headers: { 'If-Match': `"v${t.version}"` },
      }),
    );
  }

  /** Every staging question (the bank is small; pages are followed). */
  async staging(): Promise<StagingQuestion[]> {
    const all: StagingQuestion[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 20; i++) {
      const p: { items: StagingQuestion[]; nextCursor: string | null } = await firstValueFrom(
        this.http.get<{ items: StagingQuestion[]; nextCursor: string | null }>(
          `${BASE}/staging-questions`,
          { params: cursor ? { cursor } : {} },
        ),
      );
      all.push(...p.items);
      cursor = p.nextCursor;
      if (!cursor) break;
    }
    return all;
  }

  addQuestion(topicId: string, q: QuestionInput) {
    return firstValueFrom(
      this.http.post<StagingQuestion>(
        `${BASE}/staging-questions`,
        { topicId, ...q },
        { headers: key() },
      ),
    );
  }

  editQuestion(
    q: Pick<StagingQuestion, 'id' | 'version'>,
    body: Partial<QuestionInput> & { removed?: boolean },
  ) {
    return firstValueFrom(
      this.http.patch<StagingQuestion>(
        `${BASE}/staging-questions/${encodeURIComponent(q.id)}`,
        body,
        { headers: { 'If-Match': `"v${q.version}"` } },
      ),
    );
  }

  upload(topicId: string, file: File) {
    const form = new FormData();
    form.append('topicId', topicId);
    form.append('file', file);
    return firstValueFrom(
      this.http.post<UploadReport>(`${BASE}/staging-uploads`, form, { headers: key() }),
    );
  }

  publish(topicIds: readonly string[]) {
    return firstValueFrom(
      this.http.post<{ published: number; updated: number; withdrawn: number }>(
        `${BASE}/publications`,
        { topicIds },
        { headers: key() },
      ),
    );
  }

  leaderboard(period: 'all' | 'year', reason: string) {
    return firstValueFrom(
      this.http.get<Leaderboard>(`${BASE}/leaderboard`, { params: { period, reason } }),
    );
  }
}
