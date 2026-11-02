/** Console fee structures API (FEE-001…009). */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';

/** API money: rupees as a decimal string (never a float), always INR. */
export interface Money {
  readonly amount: string;
  readonly currency: 'INR';
}

/** FEE-001: one head of the institution's master and how many structures use it. */
export interface FeeHead {
  readonly id: string;
  readonly name: string;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly structures: number;
}

/** A structure version's state (status register: fee_structure_version). */
export type StructureState = 'DRAFT' | 'PENDING' | 'ACTIVE' | 'SUPERSEDED';

/** One version of a structure: classes, heads, instalments, totals and its approval. */
export interface StructureVersion {
  readonly id: string;
  readonly no: number;
  readonly state: StructureState;
  readonly classes: readonly { readonly id: string; readonly name: string }[];
  readonly heads: readonly {
    readonly headId: string;
    readonly name: string;
    readonly optional: boolean;
    readonly amount: Money;
  }[];
  readonly instalments: readonly {
    readonly seq: number;
    readonly label: string;
    readonly dueDate: string;
    readonly share: string;
    readonly amount: Money;
  }[];
  readonly total: Money;
  readonly optional: Money;
  readonly lateFine: Money;
  /** The checker's remarks when the version came back to draft ("Returned by"). */
  readonly returnedRemarks: string | null;
  readonly approval: { readonly id: string; readonly no: string } | null;
  readonly createdAt: string;
  readonly submittedAt: string | null;
  readonly activatedAt: string | null;
  readonly version: number;
}

/** FEE-003: a structure with its current version and, while a newer draft is open, the approved one. */
export interface FeeStructure {
  readonly id: string;
  readonly name: string;
  readonly year: { readonly id: string; readonly label: string };
  readonly status: StructureState;
  readonly current: StructureVersion;
  readonly active: StructureVersion | null;
  readonly versions: readonly {
    readonly no: number;
    readonly state: StructureState;
    readonly total: Money;
    readonly activatedAt: string | null;
  }[];
  readonly assigned: { readonly students: number; readonly records: number };
}

export interface FeeStructures {
  readonly items: readonly FeeStructure[];
  readonly kpis: {
    readonly structures: number;
    readonly approved: number;
    readonly pending: number;
    readonly classesCovered: number;
    readonly classes: number;
  } | null;
  /** The most instalments a structure may have (limits register, adjustable). */
  readonly maxInstalments?: number;
}

/** FEE-004 / FEE-005 body. Amounts are decimal rupee strings; the total is the server's. */
export interface StructureInput {
  readonly yearId: string;
  readonly name: string;
  readonly classIds: readonly string[];
  readonly heads: readonly { headId: string; amount: Money; optional?: boolean }[];
  readonly instalments: readonly { label: string; dueDate: string; share: string }[];
  readonly lateFine: Money;
  /** The total the screen showed; the server refuses a different one (FEE.TOTAL_MISMATCH). */
  readonly total?: Money;
}

/** FEE-006 answer: waiting for a checker, or applied directly (an administrator's own request). */
export interface StructureSubmitted {
  readonly approvalId: string;
  readonly no: string;
  readonly appliedDirectly: boolean;
  readonly structure: FeeStructure;
}

/** FEE-007: what an assignment raises (preview) or raised (commit). */
export interface FeeAssignment {
  readonly preview: boolean;
  readonly version: number;
  readonly instalments: readonly {
    readonly seq: number;
    readonly label: string;
    readonly dueDate: string;
    /** false: past its due date, so not raised. */
    readonly raised: boolean;
  }[];
  readonly perClass: readonly {
    readonly class: { readonly id: string; readonly name: string };
    readonly students: number;
    readonly already: number;
    readonly toAssign: number;
    readonly records: number;
    readonly amount: Money;
  }[];
  readonly totals: { readonly students: number; readonly records: number; readonly amount: Money };
  readonly recordsCreated?: number;
  readonly studentsAssigned?: number;
}

/** FEE-008: one academic year with its entry fees (null until set). */
export interface EntryFeesRow {
  readonly year: {
    readonly id: string;
    readonly label: string;
    readonly status: string;
    readonly current: boolean;
  };
  readonly fees: {
    readonly applicationFee: Money;
    readonly applicationMandatory: boolean;
    readonly admissionFee: Money;
    readonly updatedAt: string | null;
    readonly version: number;
  } | null;
}

export interface EntryFeesInput {
  readonly applicationFee: Money;
  readonly applicationMandatory: boolean;
  readonly admissionFee: Money;
}

const once = (key: string = newIdempotencyKey()) => ({ 'Idempotency-Key': key });
const ifMatch = (v: number) => ({ 'If-Match': `"v${v}"` });

@Injectable({ providedIn: 'root' })
export class FeesApi {
  private readonly http = inject(HttpClient);

  /** FEE-001 (the default heads are created the first time). */
  heads() {
    return firstValueFrom(
      this.http.get<{ items: readonly FeeHead[] }>('/api/v1/console/fee-heads'),
    );
  }

  /** FEE-002. */
  addHead(name: string, key?: string) {
    return firstValueFrom(
      this.http.post<FeeHead>('/api/v1/console/fee-heads', { name }, { headers: once(key) }),
    );
  }

  /** FEE-003. */
  structures(q: { yearId?: string } = {}) {
    let params = new HttpParams();
    if (q.yearId) params = params.set('yearId', q.yearId);
    return firstValueFrom(
      this.http.get<FeeStructures>('/api/v1/console/fee-structures', { params }),
    );
  }

  /** FEE-004: a new draft. */
  create(body: StructureInput, key?: string) {
    return firstValueFrom(
      this.http.post<FeeStructure>('/api/v1/console/fee-structures', body, {
        headers: once(key),
      }),
    );
  }

  /** FEE-005: edits the draft, or opens a new draft version of an approved structure (If-Match). */
  update(s: FeeStructure, body: StructureInput) {
    return firstValueFrom(
      this.http.patch<FeeStructure>(`/api/v1/console/fee-structures/${s.id}`, body, {
        headers: ifMatch(s.current.version),
      }),
    );
  }

  /** FEE-006. */
  submit(id: string, note: string | null = null, key?: string) {
    return firstValueFrom(
      this.http.post<StructureSubmitted>(
        `/api/v1/console/fee-structures/${id}/submissions`,
        { note },
        { headers: once(key) },
      ),
    );
  }

  /** FEE-007: `preview: true` shows what would be raised; false raises it. */
  assign(id: string, preview: boolean, key?: string) {
    return firstValueFrom(
      this.http.post<FeeAssignment>(
        `/api/v1/console/fee-structures/${id}/assignments`,
        { preview },
        { headers: once(key) },
      ),
    );
  }

  /** ACA-001: the years' dates (academics.view), for checking due dates as they are typed. */
  academicYears() {
    return firstValueFrom(
      this.http.get<{
        items: readonly { id: string; label: string; startsOn: string; endsOn: string }[];
      }>('/api/v1/console/academic-years'),
    );
  }

  /** FEE-008. */
  entryFees() {
    return firstValueFrom(
      this.http.get<{ items: readonly EntryFeesRow[] }>('/api/v1/console/entry-fees'),
    );
  }

  /** FEE-009 (If-Match once the year's fees are set). */
  setEntryFees(yearId: string, version: number | null, body: EntryFeesInput) {
    return firstValueFrom(
      this.http.put<EntryFeesRow>(`/api/v1/console/entry-fees/${yearId}`, body, {
        ...(version !== null ? { headers: ifMatch(version) } : {}),
      }),
    );
  }
}
