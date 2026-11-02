import { Pipe, type PipeTransform } from '@angular/core';
import { formatDate, formatDateTime, formatInr } from './format';
import { parseAmount } from './money';

/** API money `"1240.50"` (or paise) → `₹1,240.50` (brief §7.8). */
@Pipe({ name: 'inr' })
export class InrPipe implements PipeTransform {
  transform(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '';
    const paise = typeof value === 'number' ? value : parseAmount(value, { allowZero: true });
    return formatInr(paise);
  }
}

/** ISO date or instant → `30 Sep 2026` (IST). */
@Pipe({ name: 'rpDate' })
export class RpDatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    return value ? formatDate(value) : '';
  }
}

/** Instant → `30 Sep 2026 · 12:40 PM` (IST). */
@Pipe({ name: 'rpDateTime' })
export class RpDateTimePipe implements PipeTransform {
  transform(value: string | Date | null | undefined): string {
    return value ? formatDateTime(value) : '';
  }
}
