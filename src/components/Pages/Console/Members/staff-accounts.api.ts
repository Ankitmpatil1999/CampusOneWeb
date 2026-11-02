/** Console accounts and roles of an institution (IDN-038, IDN-060…062; SRS 6.28, CR-05). */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** IDN-062: an institution role with its tasks and sub-tasks. */
export interface ConsoleRole {
  readonly id: string;
  readonly code: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly readOnly: boolean;
  /** False for the Institution Administrator: CampusOne gives and takes away that role. */
  readonly assignable: boolean;
  readonly tasks: readonly string[];
  readonly subTasks: readonly string[];
}

/** IDN-060: a staff member with a CampusOne account. */
export interface StaffAccount {
  /** The staff profile (the member id). */
  readonly id: string;
  readonly memberNo: string;
  readonly name: string;
  readonly userType: string;
  readonly email: string | null;
  /** Masked: ••••••3210. */
  readonly mobile: string;
  readonly status: string;
  readonly roles: readonly { id: string; code: string | null; name: string }[];
  /** Locked after abandoned codes or wrong passwords; released with a reason (IDN-038). */
  readonly locked: boolean;
  readonly lastSignInAt: string | null;
  /** The user type's category (PRINCIPAL, MERCHANT …): which roles fit the profile. */
  readonly category?: string;
  /** A merchant's type: the Merchant or the Vendor merchant role (client 2026-10-13). */
  readonly merchantType?: 'REGULAR' | 'VENDOR' | null;
}

/**
 * Whether a role may be given to the profile (the server's IDN.ROLE_WRONG_PROFILE rule): the
 * Principal role to the principal or management, the Merchant roles to a merchant of that type, and
 * the other roles to anyone but a merchant.
 */
export function roleFits(
  role: Pick<ConsoleRole, 'code'>,
  a: Pick<StaffAccount, 'category' | 'merchantType'>,
): boolean {
  if (!a.category) return true;
  switch (role.code) {
    case 'PRINCIPAL':
      return a.category === 'PRINCIPAL' || a.category === 'MANAGEMENT';
    case 'MERCHANT':
      return a.category === 'MERCHANT' && a.merchantType === 'REGULAR';
    case 'VENDOR_MERCHANT':
      return a.category === 'MERCHANT' && a.merchantType === 'VENDOR';
    default:
      return a.category !== 'MERCHANT';
  }
}

@Injectable({ providedIn: 'root' })
export class StaffAccountsApi {
  private readonly http = inject(HttpClient);

  roles() {
    return firstValueFrom(this.http.get<{ items: ConsoleRole[] }>('/api/v1/console/roles'));
  }

  accounts() {
    return firstValueFrom(
      this.http.get<{ items: StaffAccount[] }>('/api/v1/console/staff-accounts'),
    );
  }

  /** IDN-061: the full set of roles; a role taken away ends the person's console sessions. */
  setRoles(profileId: string, roleIds: readonly string[]) {
    return firstValueFrom(
      this.http.put<StaffAccount>(`/api/v1/console/staff-accounts/${profileId}/roles`, {
        roleIds,
      }),
    );
  }

  /** IDN-038: release the sign-in lock with a recorded reason (5–300 characters). */
  unlock(profileId: string, reason: string) {
    return firstValueFrom(
      this.http.post<void>(`/api/v1/console/staff-accounts/${profileId}/unlock`, { reason }),
    );
  }
}
