const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** The prototype's long date (fmt.dlong): "Wednesday, 30 September 2026", local time. */
export function longDate(d: Date = new Date()): string {
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The prototype's relative time (fmt.ago): "just now", "12 min ago", "2 hr ago", "yesterday",
 * "3 days ago", then the short date in IST ("21 Sep").
 */
export function ago(iso: string, now: number = Date.now()): string {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return '';
  const s = (now - at) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  const d = Math.round(s / 86400);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  const ist = new Date(at + 330 * 60_000);
  return `${ist.getUTCDate()} ${SHORT[ist.getUTCMonth()]}`;
}
