import type { Landing, OpenYear } from '../admissions.api';
import { today } from '../admissions.store';
import { blank, fieldOf, sectionOf, tcDueWindow, validateStep, type Facts } from './form.state';

const plus = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

const year: OpenYear = {
  id: 'y-1',
  label: '2026-27',
  startsOn: '2026-04-01',
  endsOn: plus(today(), 200),
  kind: 'MID_TERM',
  fees: null,
};
const landing: Landing = {
  institution: { name: 'Sri Ram Global School', shortName: 'SRGS', city: 'Bengaluru' },
  preselectedYearId: null,
  years: [year],
  classes: [{ id: 'c-lkg', name: 'LKG', ageBand: null }],
  customFields: [],
  rules: {
    ageMeasuredOn: '06-01',
    documents: { maxBytes: 2_000_000, types: [] },
    references: { max: 3, midTermMin: 1 },
  },
};
const facts: Facts = { landing, year, cls: landing.classes[0]!, mid: true };

/** A mid-term draft whose family says the transfer certificate will follow (client 2026-10-13). */
function undertaking(due: string) {
  const d = blank(year);
  d.joining = today();
  d.tc = { mode: 'und', file: null, due };
  return d;
}

describe('the transfer certificate of a mid-term application (client 2026-10-13)', () => {
  it('asks for the date the certificate will be handed in, at most 60 days after joining', () => {
    expect(validateStep(3, undertaking(''), facts)['pa-tcdue']).toBe('This field is required.');
    const late = validateStep(3, undertaking(plus(today(), 61)), facts)['pa-tcdue'];
    expect(late).toContain('Choose the date you’ll hand in the transfer certificate');
    expect(validateStep(3, undertaking(plus(today(), 60)), facts)['pa-tcdue']).toBeUndefined();
    expect(tcDueWindow(undertaking('')).max).toBe(plus(today(), 60));
  });

  it('sends the undertaking with the previous-schooling step, so the application can be submitted', () => {
    const due = plus(today(), 30);
    expect(sectionOf(3, undertaking(due), true)?.data).toMatchObject({
      tc: { mode: 'UNDERTAKING', dueDate: due },
    });
    const has = blank(year);
    expect(sectionOf(3, has, true)?.data).toMatchObject({ tc: { mode: 'TC' } });
    // A regular admission has no transfer certificate.
    expect(sectionOf(3, has, false)?.data).not.toHaveProperty('tc');
    expect(fieldOf('tc.dueDate', 'previous')).toBe('pa-tcdue');
  });
});
