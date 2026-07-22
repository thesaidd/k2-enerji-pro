import { describe, expect, it } from 'vitest';
import { DEFAULT_OFFER_STATE, DEFAULT_SETTINGS } from '../config/defaults';
import { calculateOffer } from '../domain/profitability/calculation';
import {
  BACKUP_SCHEMA_VERSION,
  prepareRestore,
  type BackupCollections,
} from '../services/storage/DataPortabilityService';
import type { Customer, PlannedOffer } from '../types';

const collections = (): BackupCollections => {
  const customer: Customer = {
    id: 'customer',
    name: 'Yedek Müşterisi',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isArchived: false,
  };
  const result = calculateOffer({
    ...structuredClone(DEFAULT_OFFER_STATE),
    customerId: customer.id,
    usageStart: '2026-07-01',
    usageEnd: '2026-07-31',
    offerRate: 5,
  });
  const offer: PlannedOffer = {
    id: 'offer',
    recordType: 'planned_offer',
    customerId: customer.id,
    version: 1,
    title: 'Yedek Teklifi',
    status: 'final',
    stateSnapshot: result.state,
    paymentPlanSnapshot: result.state.paymentPlan,
    resultSnapshot: result,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  return {
    customers: [customer],
    costDrafts: [],
    plannedOffers: [offer],
    realizationScenarios: [],
    settings: [structuredClone(DEFAULT_SETTINGS)],
  };
};

describe('P0-C güvenli yedek önizleme ve migration', () => {
  it('yeni zarfı doğrular ve özet sayılarını üretir', () => {
    const preview = prepareRestore({
      format: 'K2-ENERJIPRO',
      schemaVersion: BACKUP_SCHEMA_VERSION,
      appVersion: '3.0.0',
      exportedAt: '2026-07-01T00:00:00.000Z',
      payload: collections(),
    });
    expect(preview).toMatchObject({
      sourceFormat: 'envelope',
      customers: 1,
      costDrafts: 0,
      plannedOffers: 1,
      realizationScenarios: 0,
    });
  });

  it('eski K2-ENERJIPRO-3.0 zarfını açar ve güvenli alanları normalize eder', () => {
    const payload = collections();
    delete payload.plannedOffers[0]!.stateSnapshot.ges.excessPurchasePaymentOffsetDays;
    const preview = prepareRestore({
      version: 'K2-ENERJIPRO-3.0',
      exportedAt: '2026-07-01T00:00:00.000Z',
      ...payload,
    });
    expect(preview.sourceFormat).toBe('legacy-3.0');
    expect(preview.migrationRecords).toBe(1);
    expect(
      preview.payload.plannedOffers[0]?.stateSnapshot.ges.excessPurchasePaymentOffsetDays,
    ).toBe(10);
  });

  it('geçersiz zarf ve koleksiyonu yazma aşamasından önce reddeder', () => {
    expect(() => prepareRestore({ format: 'bad' })).toThrow(/desteklenen/i);
    expect(() =>
      prepareRestore({
        format: 'K2-ENERJIPRO',
        schemaVersion: BACKUP_SCHEMA_VERSION,
        payload: { ...collections(), customers: 'sil' },
      }),
    ).toThrow(/customers koleksiyonu/i);
  });

  it('eksik müşteri ve kaynak teklif referansını reddeder', () => {
    const missingCustomer = collections();
    missingCustomer.customers = [];
    expect(() =>
      prepareRestore({ version: 'K2-ENERJIPRO-3.0', exportedAt: '', ...missingCustomer }),
    ).toThrow(/müşteri referansı/i);
  });

  it('yinelenen id ve finite olmayan sayıyı reddeder', () => {
    const duplicate = collections();
    duplicate.customers.push(structuredClone(duplicate.customers[0]!));
    expect(() =>
      prepareRestore({ version: 'K2-ENERJIPRO-3.0', exportedAt: '', ...duplicate }),
    ).toThrow(/yinelenen id/i);
    const nonFinite = collections();
    nonFinite.plannedOffers[0]!.resultSnapshot.totals.grossInvoice = Number.NaN;
    expect(() =>
      prepareRestore({ version: 'K2-ENERJIPRO-3.0', exportedAt: '', ...nonFinite }),
    ).toThrow(/finite/i);
  });
});
