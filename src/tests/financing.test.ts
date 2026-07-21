import { describe, expect, it } from 'vitest';
import { buildDailyCashflow } from '../domain/financing/financing';
import type { CashEvent } from '../types';

const event = (
  date: string,
  direction: 'in' | 'out',
  amount: number,
  label: string,
): CashEvent => ({
  id: `${date}-${label}`,
  date,
  type: direction === 'in' ? 'customer_payment' : 'ptf',
  direction,
  amount,
  label,
});

describe('kredi ve valör motoru', () => {
  it('yalnız negatif bakiyede kredi işletir ve pozitif olunca durur', () => {
    const rows = buildDailyCashflow(
      [
        event('2026-01-01', 'out', 1000, 'gider'),
        event('2026-01-03', 'in', 2000, 'tahsilat'),
        event('2026-01-05', 'out', 1500, 'yeni gider'),
      ],
      36.5,
      36.5,
    );
    expect(rows[0]!.creditInterest).toBeGreaterThan(0);
    expect(rows.find((row) => row.date === '2026-01-04')!.creditInterest).toBe(0);
    expect(rows.find((row) => row.date === '2026-01-04')!.valorInterest).toBeGreaterThan(0);
    expect(rows.find((row) => row.date === '2026-01-05')!.creditInterest).toBeGreaterThan(0);
  });

  it('aynı gün müşteri tahsilatına valör üretmez', () => {
    const rows = buildDailyCashflow(
      [event('2026-01-01', 'in', 1000, 'tahsilat'), event('2026-01-02', 'out', 1, 'takip')],
      0,
      36.5,
    );
    expect(rows[0]!.valorInterest).toBe(0);
    expect(rows[1]!.valorInterest).toBeGreaterThan(0);
  });

  it('hafta sonunda da kredi işletir', () => {
    const rows = buildDailyCashflow(
      [event('2026-07-17', 'out', 1000, 'gider'), event('2026-07-20', 'in', 1000, 'tahsilat')],
      36.5,
      0,
    );
    expect(
      rows
        .filter((row) => ['2026-07-18', '2026-07-19'].includes(row.date))
        .every((row) => row.creditInterest > 0),
    ).toBe(true);
  });
});
