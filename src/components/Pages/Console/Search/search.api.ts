/** Console search API (IDN-059): members by name, admission or employee number, or mobile. */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type SearchKind = 'STUDENTS' | 'PARENTS' | 'STAFF' | 'MERCHANTS';
export type SearchStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface MemberHit {
  readonly id: string;
  readonly memberNo: string;
  readonly name: string;
  readonly kind: SearchKind;
  readonly userType: string;
  /** Grade and section this year (students), otherwise the department. */
  readonly detail: string;
  /** Admission or employee number. */
  readonly number: string | null;
  readonly status: SearchStatus;
}

export interface SearchResults {
  readonly members: readonly MemberHit[];
  /** Payment and receipt references arrive with the wallet (Phase 3); always empty until then. */
  readonly references: readonly unknown[];
}

@Injectable({ providedIn: 'root' })
export class SearchApi {
  private readonly http = inject(HttpClient);

  search(q: string) {
    return firstValueFrom(
      this.http.get<SearchResults>('/api/v1/console/search', { params: { q } }),
    );
  }
}
