import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Icon } from './Icon';

/** A parent as a family's latest admission had them (IDN-090). */
export interface LookupPerson {
  readonly name: string;
  readonly mobile: string | null;
  readonly email: string | null;
  readonly occupation: string | null;
  readonly annualIncome: string | null;
}

/**
 * Who a mobile belongs to at this school (IDN-090, client 2026-10-22). A mobile used at another
 * institution is no longer refused (client 2026-10-27: one person, several institutions).
 */
export interface FamilyLookup {
  readonly mobile: string;
  readonly status: 'NEW' | 'FAMILY' | 'STAFF';
  readonly account: boolean;
  readonly family: {
    readonly children: readonly {
      readonly id: string;
      readonly name: string;
      readonly grade: string | null;
      readonly admissionNo: string | null;
      readonly status: string;
    }[];
    readonly parents: readonly {
      readonly id: string;
      readonly relation: 'FATHER' | 'MOTHER' | 'GUARDIAN' | null;
      readonly firstName: string;
      readonly lastName: string | null;
      readonly name: string;
      readonly mobile: string | null;
      readonly email: string | null;
      readonly onThisMobile: boolean;
    }[];
    readonly father: LookupPerson | null;
    readonly mother: LookupPerson | null;
    readonly guardian: (LookupPerson & { readonly relation: string }) | null;
    readonly primary: 'FATHER' | 'MOTHER' | 'GUARDIAN' | null;
    readonly address: {
      readonly line1: string;
      readonly line2: string;
      readonly city: string;
      readonly state: string;
      readonly pin: string;
    } | null;
  } | null;
  readonly staff: {
    readonly id: string;
    readonly firstName: string;
    readonly lastName: string | null;
    readonly name: string;
    readonly email: string | null;
    readonly gender: string | null;
    readonly userType: string;
    readonly employeeNo: string | null;
    readonly relation: 'FATHER' | 'MOTHER' | null;
  } | null;
}

const MOBILE = /^[6-9]\d{9}$/;
const RELATION: Readonly<Record<string, string>> = {
  FATHER: 'Father',
  MOTHER: 'Mother',
  GUARDIAN: 'Guardian',
};

/** "Aarav Rao (Grade 6 A) and Vihaan Rao (Grade 3 B)". */
export function childrenText(f: NonNullable<FamilyLookup['family']>): string {
  const names = f.children.map((c) => (c.grade ? `${c.name} (${c.grade})` : c.name));
  if (names.length < 2) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** "Ramesh Kumar (Father), Sita Kumar (Mother)". */
export function parentsText(f: NonNullable<FamilyLookup['family']>): string {
  return f.parents
    .map((p) => (p.relation ? `${p.name} (${RELATION[p.relation]})` : p.name))
    .join(', ');
}

/**
 * The family a mobile already belongs to (client 2026-10-22: "check whether the parent's child is
 * already studying at the school, and fill in the father's and mother's names and other details";
 * "a staff member working here is identified too"). Each complete mobile typed is looked up once
 * (IDN-090): a family here shows its children and parents with "Fill in the family's details", a
 * staff member theirs. The page decides what filling in sets. Staff screens only — the public
 * admission form never shows another family's details.
 */
@Component({
  selector: 'rp-family-found',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (found(); as r) {
      @if (r.status === 'FAMILY' && r.family) {
        <div class="note tone-brand" id="fam-found" role="status">
          <rp-icon name="users" [size]="17" />
          <div class="grow">
            <b>This family is already at the school.</b>
            @if (r.family.children.length) {
              {{ childrenText(r.family) }} {{ r.family.children.length > 1 ? 'study' : 'studies' }}
              here.
            }
            @if (r.family.parents.length) {
              Parents: {{ parentsText(r.family) }}.
            }
          </div>
          <button type="button" class="btn btn-sec btn-sm" id="fam-use" (click)="use.emit(r)">
            <rp-icon name="check" [size]="16" /><span>Fill in the family's details</span>
          </button>
        </div>
      } @else if (r.status === 'STAFF' && r.staff) {
        <div class="note tone-info" id="fam-found" role="status">
          <rp-icon name="briefcase" [size]="17" />
          <div class="grow">
            <b>{{ r.staff.name }}</b> works here ({{ r.staff.userType }}) on this mobile.
          </div>
          <button type="button" class="btn btn-sec btn-sm" id="fam-use" (click)="use.emit(r)">
            <rp-icon name="check" [size]="16" /><span>Fill in their details</span>
          </button>
        </div>
      }
    }
  `,
})
export class FamilyFound {
  /** The mobiles typed on the form (only complete Indian mobiles are looked up). */
  readonly mobiles = input<readonly string[]>([]);
  readonly lookup = input.required<(mobile: string) => Promise<FamilyLookup>>();
  readonly use = output<FamilyLookup>();

  protected readonly found = signal<FamilyLookup | null>(null);
  protected readonly childrenText = childrenText;
  protected readonly parentsText = parentsText;
  private readonly cache = new Map<string, FamilyLookup | null>();
  private run = 0;

  constructor() {
    effect(() => {
      const list = [
        ...new Set(this.mobiles().map((m) => (m ?? '').replace(/\D/g, '').slice(-10))),
      ].filter((m) => MOBILE.test(m));
      untracked(() => void this.check(list));
    });
  }

  private async check(list: readonly string[]) {
    const run = ++this.run;
    for (const m of list) {
      if (this.cache.has(m)) continue;
      try {
        this.cache.set(m, await this.lookup()(m));
      } catch {
        // Not answered now: looked up again when the mobile is typed again.
        if (run === this.run) continue;
      }
    }
    if (run !== this.run) return;
    const found = list.map((m) => this.cache.get(m)).filter((x): x is FamilyLookup => !!x);
    this.found.set(
      found.find((x) => x.status === 'FAMILY') ?? found.find((x) => x.status === 'STAFF') ?? null,
    );
  }
}
