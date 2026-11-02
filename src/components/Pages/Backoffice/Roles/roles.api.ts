/** Back-office roles API (IDN-063…069, IDN-039, IDN-081). */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';

export interface TaskDef {
  readonly scope: 'OPERATOR' | 'INSTITUTION';
  readonly code: string;
  readonly name: string;
  readonly cr: string | null;
  readonly subTasks: readonly { code: string; name: string }[];
}

export interface Role {
  readonly id: string;
  readonly code: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly scope: 'OPERATOR' | 'INSTITUTION';
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly readOnly: boolean;
  readonly tasks: readonly string[];
  readonly subTasks: readonly string[];
  readonly holders: readonly { name: string }[];
  readonly holderCount: number;
  readonly version: number;
}

export interface OperatorAccount {
  readonly id: string;
  readonly accountId: string;
  readonly name: string;
  readonly email: string | null;
  readonly role: { readonly id: string; readonly name: string };
  readonly lastSignInAt: string | null;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly statusNote: string | null;
  readonly locked: boolean;
  readonly version: number;
}

export interface RoleChange {
  readonly id: string;
  readonly at: string;
  readonly by: string;
  readonly change: string;
  readonly reason: string;
}

export type RoleAction = 'ASSIGN_TASK' | 'REMOVE_TASK' | 'GRANT' | 'REVOKE' | 'ENABLE' | 'DISABLE';

const ifMatch = (v: number) => ({ 'If-Match': `"v${v}"` });

@Injectable({ providedIn: 'root' })
export class RolesApi {
  private readonly http = inject(HttpClient);

  tasks() {
    return firstValueFrom(this.http.get<{ items: TaskDef[] }>('/api/v1/ops/tasks?scope=OPERATOR'));
  }
  roles() {
    return firstValueFrom(this.http.get<{ items: Role[] }>('/api/v1/ops/roles'));
  }
  accounts() {
    return firstValueFrom(this.http.get<{ items: OperatorAccount[] }>('/api/v1/ops/accounts'));
  }
  changes() {
    return firstValueFrom(this.http.get<{ items: RoleChange[] }>('/api/v1/ops/role-changes'));
  }
  createRole(name: string, description: string) {
    return firstValueFrom(
      this.http.post<{ roleId: string }>(
        '/api/v1/ops/roles',
        { name, description },
        { headers: { 'Idempotency-Key': newIdempotencyKey() } },
      ),
    );
  }
  changeRole(
    role: Role,
    body: { action: RoleAction; task?: string; subTask?: string; reason: string },
  ) {
    return firstValueFrom(
      this.http.patch(`/api/v1/ops/roles/${role.id}`, body, { headers: ifMatch(role.version) }),
    );
  }
  assign(email: string, roleId: string, reason: string) {
    return firstValueFrom(
      this.http.post(
        '/api/v1/ops/accounts',
        { email, roleId, reason },
        { headers: { 'Idempotency-Key': newIdempotencyKey() } },
      ),
    );
  }
  changeAccount(
    a: OperatorAccount,
    body: { roleId?: string; status?: 'ACTIVE' | 'INACTIVE'; reason: string },
  ) {
    return firstValueFrom(
      this.http.patch(`/api/v1/ops/accounts/${a.id}`, body, { headers: ifMatch(a.version) }),
    );
  }
  unlock(a: OperatorAccount, reason: string) {
    return firstValueFrom(this.http.post(`/api/v1/ops/accounts/${a.accountId}/unlock`, { reason }));
  }
}
