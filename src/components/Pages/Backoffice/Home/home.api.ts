/** Back-office home and search (RPT-007, RPT-008): platform figures, never one school's records. */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface Money {
  readonly amount: string;
  readonly currency: 'INR';
}

export type JobHealth = 'NONE' | 'OK' | 'RUNNING' | 'BAD';

export interface OpsHome {
  readonly kpis: {
    readonly tenants: number;
    readonly active: number;
    readonly onTrial: number;
    readonly pending: number;
    readonly openInvoices: number;
    readonly openAmount: Money;
    readonly overdueInvoices: number;
    readonly pendingApprovals: number;
  };
  /** PENDING_ACTIVATION, ACTIVE, SUSPENDED, CANCELLED (trials are active institutions). */
  readonly byStatus: readonly { status: string; count: number }[];
  readonly jobs: readonly {
    id: string;
    name: string;
    /** "23:45" (IST) or null when not on a clock. */
    time: string | null;
    money: boolean;
    scheduled: boolean;
    lastRun: { status: string; startedAt: string; endedAt: string | null } | null;
    health: JobHealth;
  }[];
  readonly alerts: readonly {
    tone: string;
    icon: string;
    title: string;
    sub: string;
    /** The prototype screen the alert opens (o.plans, o.approvals, o.institutions, o.jobs). */
    go: string;
  }[];
}

export interface OpsSearch {
  readonly institutions: readonly {
    id: string;
    identifier: string;
    name: string;
    shortName: string;
    city: string;
    status: string;
    /** TRIAL, ACTIVE, GRACE, SUSPENDED or CANCELLED; null before a plan is chosen. */
    subscription: string | null;
    plan: string | null;
  }[];
  readonly invoices: readonly {
    id: string;
    invoiceNo: string;
    institution: string;
    status: string;
    total: Money;
    issuedOn: string;
  }[];
}

@Injectable({ providedIn: 'root' })
export class OpsHomeApi {
  private readonly http = inject(HttpClient);

  home() {
    return firstValueFrom(this.http.get<OpsHome>('/api/v1/ops/home'));
  }

  /** Recorded in the activity log by the server; fewer than two characters finds nothing. */
  search(q: string) {
    return firstValueFrom(this.http.get<OpsSearch>('/api/v1/ops/search', { params: { q } }));
  }
}
