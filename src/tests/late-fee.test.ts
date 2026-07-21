import { describe, expect, it } from 'vitest';
import { calculateInvoiceDelinquency, calculateLateFeeSegments } from '../domain/late-fee/lateFee';
import type { ActualPayment, BillingPeriod } from '../types';

const invoice = {
  id: 'invoice_1',
  grossInvoice: 2_567_837.53,
  kdvBase: 2_139_864.6083333334,
  kdvAmount: 427_972.9216666667,
} as BillingPeriod;

describe('gecikme motoru', () => {
  it('golden gecikme örneğini 360 gün basit faizle hesaplar', () => {
    const delinquency = calculateInvoiceDelinquency(
      invoice,
      '2026-01-01',
      [
        {
          id: 'p1',
          invoiceId: 'invoice_1',
          date: '2026-01-01',
          amount: 1_753_334.56,
          channel: 'eft',
        },
      ],
      '2026-09-25',
      5.55,
    );
    expect(delinquency.outstandingPrincipal).toBeCloseTo(814_502.97, 2);
    expect(delinquency.lateFee).toBeCloseTo(402_323.74, 2);
    expect(delinquency.lateFeeVat).toBeCloseTo(80_464.75, 2);
    expect(delinquency.outstandingPrincipal + delinquency.totalLateFeeReceivable).toBeCloseTo(
      1_297_291.46,
      2,
    );
  });

  it('vade gününü gecikme saymaz', () => {
    const sameDay = calculateInvoiceDelinquency(
      { ...invoice, grossInvoice: 1000 },
      '2026-02-15',
      [],
      '2026-02-15',
      5.55,
    );
    expect(sameDay.delayDays).toBe(0);
    expect(sameDay.lateFee).toBe(0);
  });

  it('kısmi tahsilatı kalan ana para segmentlerine ayırır', () => {
    const payments: ActualPayment[] = [
      { id: 'p1', invoiceId: 'invoice_1', date: '2026-02-20', amount: 400_000, channel: 'eft' },
      { id: 'p2', invoiceId: 'invoice_1', date: '2026-02-25', amount: 350_000, channel: 'eft' },
      { id: 'p3', invoiceId: 'invoice_1', date: '2026-03-10', amount: 250_000, channel: 'eft' },
    ];
    const segments = calculateLateFeeSegments(
      1_000_000,
      '2026-02-15',
      payments,
      '2026-03-10',
      5.55,
    );
    expect(segments.map((segment) => segment.principal)).toEqual([1_000_000, 600_000, 250_000]);
    expect(segments.every((segment) => segment.lateFee > 0)).toBe(true);
  });
});
