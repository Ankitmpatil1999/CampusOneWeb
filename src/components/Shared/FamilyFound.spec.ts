import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FamilyFound, type FamilyLookup } from './FamilyFound';

const tick = () => new Promise((r) => setTimeout(r, 0));
const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

const FAMILY: FamilyLookup = {
  mobile: '9886110000',
  status: 'FAMILY',
  account: true,
  family: {
    children: [
      { id: 'c1', name: 'Aarav Rao', grade: 'Grade 6 A', admissionNo: 'A1', status: 'ACTIVE' },
      { id: 'c2', name: 'Vihaan Rao', grade: 'Grade 3 B', admissionNo: 'A2', status: 'ACTIVE' },
    ],
    parents: [
      {
        id: 'p1',
        relation: 'FATHER',
        firstName: 'Ramesh',
        lastName: 'Rao',
        name: 'Ramesh Rao',
        mobile: '9886110000',
        email: 'ramesh@example.in',
        onThisMobile: true,
      },
    ],
    father: {
      name: 'Ramesh Rao',
      mobile: '9886110000',
      email: 'ramesh@example.in',
      occupation: 'Engineer',
      annualIncome: '900000',
    },
    mother: null,
    guardian: null,
    primary: 'FATHER',
    address: null,
  },
  staff: null,
};
const STAFF: FamilyLookup = {
  mobile: '9886120000',
  status: 'STAFF',
  account: true,
  family: null,
  staff: {
    id: 's1',
    firstName: 'Lakshmi',
    lastName: 'Rao',
    name: 'Lakshmi Rao',
    email: 'lakshmi@example.in',
    gender: 'FEMALE',
    userType: 'Teacher',
    employeeNo: 'E12',
    relation: 'MOTHER',
  },
};

@Component({
  imports: [FamilyFound],
  template: `<rp-family-found [mobiles]="mobiles()" [lookup]="lookup" (use)="used.push($event)" />`,
})
class Host {
  readonly mobiles = signal<readonly string[]>([]);
  readonly asked: string[] = [];
  readonly used: FamilyLookup[] = [];
  answers: Record<string, FamilyLookup> = {};
  readonly lookup = async (m: string) => {
    this.asked.push(m);
    return (
      this.answers[m] ?? { mobile: m, status: 'NEW', account: false, family: null, staff: null }
    );
  };
}

describe('a family already at the school (client 2026-10-22)', () => {
  async function host() {
    const fixture = TestBed.createComponent(Host);
    const h = fixture.componentInstance;
    h.answers = { [FAMILY.mobile]: FAMILY, [STAFF.mobile]: STAFF };
    const settle = async () => {
      fixture.detectChanges();
      for (let i = 0; i < 4; i++) await tick();
      fixture.detectChanges();
    };
    return { fixture, h, el: fixture.nativeElement as HTMLElement, settle };
  }

  it('shows the family on a mobile, with its children and parents, and fills it in', async () => {
    const { h, el, settle } = await host();
    // Only complete mobiles are looked up.
    h.mobiles.set(['98861', '']);
    await settle();
    expect(h.asked).toEqual([]);
    expect(el.querySelector('#fam-found')).toBeNull();
    h.mobiles.set(['9000000001', '9886110000']);
    await settle();
    expect(text(el.querySelector('#fam-found'))).toBe(
      "This family is already at the school. Aarav Rao (Grade 6 A) and Vihaan Rao (Grade 3 B) study here. Parents: Ramesh Rao (Father). Fill in the family's details",
    );
    (el.querySelector('#fam-use') as HTMLButtonElement).click();
    expect(h.used).toEqual([FAMILY]);
    // Each mobile once.
    h.mobiles.set(['9886110000', '9000000001']);
    await settle();
    expect(h.asked.sort()).toEqual(['9000000001', '9886110000']);
  });

  it('names a staff member working here; a mobile used elsewhere is no obstacle (client 2026-10-27)', async () => {
    const { h, el, settle } = await host();
    h.mobiles.set(['9886120000']);
    await settle();
    expect(text(el.querySelector('#fam-found'))).toBe(
      'Lakshmi Rao works here (Teacher) on this mobile. Fill in their details',
    );
    // A CampusOne account at another institution: new here, nothing to warn about.
    h.answers['9886130000'] = {
      mobile: '9886130000',
      status: 'NEW',
      account: true,
      family: null,
      staff: null,
    };
    h.mobiles.set(['9886130000']);
    await settle();
    expect(el.querySelector('#fam-found')).toBeNull();
    expect(el.textContent).not.toContain('another institution');
  });
});
