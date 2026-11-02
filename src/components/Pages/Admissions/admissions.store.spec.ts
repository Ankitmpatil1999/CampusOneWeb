import { classOrder } from './admissions.store';

describe('classOrder', () => {
  it('places Roman-numeral classes like numbered ones (client 2026-10-13)', () => {
    expect(classOrder('Grade IV')).toBe(classOrder('Grade 4'));
    expect(classOrder('Class XII')).toBe(classOrder('Class 12'));
    expect(classOrder('Std. V')).toBe(7);
    expect(classOrder('Ivy House')).toBeNull();
  });
});
