// Monthly package periods: a package bought on day D runs to the day before
// D next month, in IST calendar days, and never spills into the wrong month.
import test from 'node:test';
import assert from 'node:assert/strict';
import { packageEndDay, addDays, daysBetween, istDay, isDay } from '@/lib/packageDates';

test('one-month package ends the day before the same date next month', () => {
  assert.equal(packageEndDay('2026-10-13', 1), '2026-11-12');
  assert.equal(packageEndDay('2026-10-01', 1), '2026-10-31');
  assert.equal(packageEndDay('2026-12-15', 1), '2027-01-14');
  assert.equal(packageEndDay('2026-10-13', 3), '2027-01-12');
});

test('month-end start dates clamp instead of rolling over', () => {
  // 31 Jan + 1 month → 28 Feb, so the package ends 27 Feb (not early March).
  assert.equal(packageEndDay('2026-01-31', 1), '2026-02-27');
  assert.equal(packageEndDay('2028-01-31', 1), '2028-02-28'); // leap year
  assert.equal(packageEndDay('2026-03-31', 1), '2026-04-29');
});

test('day arithmetic', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-10-13', '2026-11-12'), 30);
});

test('istDay uses the clinic timezone, not UTC', () => {
  // 20:00 UTC on 13 Oct is already 01:30 on 14 Oct in India.
  assert.equal(istDay(new Date('2026-10-13T20:00:00Z')), '2026-10-14');
  assert.equal(istDay(new Date('2026-10-13T18:00:00Z')), '2026-10-13');
});

test('isDay validates YYYY-MM-DD', () => {
  assert.ok(isDay('2026-10-13'));
  assert.ok(!isDay('2026-13-01'));
  assert.ok(!isDay('13-10-2026'));
  assert.ok(!isDay(undefined));
});
