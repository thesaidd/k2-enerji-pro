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
  it('son olaydan sonra negatif bakiyede krediyi hesaplama bitişine kadar günlük bileştirir', () => {
    const rows = buildDailyCashflow([event('2026-01-01', 'out', 1000, 'gider')], 36.5, 0, {
      calculationEndDate: '2026-01-03',
    });
    expect(rows.map((row) => row.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(rows[0]!.creditInterest).toBeCloseTo(1, 10);
    expect(rows[1]!.creditInterest).toBeCloseTo(1.001, 10);
    expect(rows[2]!.creditInterest).toBeCloseTo(1.002001, 10);
    expect(rows[2]!.closingBalance).toBeCloseTo(-1003.003001, 10);
  });

  it('son olaydan sonra pozitif bakiyede valörü hesaplama bitişine kadar sürdürür', () => {
    const rows = buildDailyCashflow([event('2026-01-01', 'in', 1000, 'tahsilat')], 0, 36.5, {
      calculationEndDate: '2026-01-03',
    });
    expect(rows[0]!.valorInterest).toBe(0);
    expect(rows[1]!.valorInterest).toBeCloseTo(1, 10);
    expect(rows[2]!.valorInterest).toBeCloseTo(1.001, 10);
  });

  it('boş günlerde sıfır bakiyeye faiz uygulamaz', () => {
    const rows = buildDailyCashflow([], 36.5, 36.5, {
      calculationStartDate: '2026-01-01',
      calculationEndDate: '2026-01-03',
    });
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.creditInterest === 0 && row.valorInterest === 0)).toBe(true);
  });
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

  it('her satırda kesin günlük kapanış invariantını korur', () => {
    const rows = buildDailyCashflow(
      [
        event('2026-01-01', 'out', 1000, 'gider'),
        event('2026-01-02', 'in', 400, 'tahsilat'),
      ],
      36.5,
      20,
      { calculationEndDate: '2026-01-04' },
    );
    for (const row of rows)
      expect(row.closingBalance).toBeCloseTo(
        row.openingBalance -
          row.supplierOutflows -
          row.refunds -
          row.creditInterest +
          row.valorInterest +
          row.customerInflows +
          row.lateFeeInflows,
        10,
      );
  });
});
