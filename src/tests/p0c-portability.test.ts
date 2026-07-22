import { describe, expect, it } from 'vitest';
import { DEFAULT_OFFER_STATE, DEFAULT_SETTINGS } from '../config/defaults';
import { calculateOffer } from '../domain/profitability/calculation';
import {
  APP_VERSION,
  BACKUP_SCHEMA_VERSION,
  DataPortabilityService,
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
      appVersion: APP_VERSION,
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
    delete payload.plannedOffers[0]!.stateSnapshot.tariffSourceMode;
    payload.costDrafts.push({
      id: 'legacy-draft',
      recordType: 'cost_draft',
      customerId: 'customer',
      title: 'Legacy taslak',
      state: structuredClone(payload.plannedOffers[0]!.stateSnapshot),
      paymentPlan: structuredClone(payload.plannedOffers[0]!.paymentPlanSnapshot),
      resultSnapshot: structuredClone(payload.plannedOffers[0]!.resultSnapshot),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
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
    expect(preview.payload.plannedOffers[0]?.stateSnapshot.tariffSourceMode).toBe('legacy_numeric');
    expect(preview.payload.costDrafts[0]?.state.tariffSourceMode).toBe('legacy_numeric');
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

  it('yinelenen settings ve tarife versiyon kimliklerini reddeder', () => {
    const duplicateSettings = collections();
    duplicateSettings.settings.push(structuredClone(duplicateSettings.settings[0]!));
    expect(() =>
      prepareRestore({ version: 'K2-ENERJIPRO-3.0', exportedAt: '', ...duplicateSettings }),
    ).toThrow(/settings.*yinelenen id/i);

    const duplicateTariff = collections();
    duplicateTariff.settings[0]!.tariffVersions!.push(
      structuredClone(duplicateTariff.settings[0]!.tariffVersions![0]!),
    );
    expect(() =>
      prepareRestore({ version: 'K2-ENERJIPRO-3.0', exportedAt: '', ...duplicateTariff }),
    ).toThrow(/tarife versiyon kimliği yinelenemez/i);
  });

  it('restore preview değiştirilse bile payloadı DB temizlemeden yeniden doğrular', async () => {
    const preview = prepareRestore({
      format: 'K2-ENERJIPRO',
      schemaVersion: BACKUP_SCHEMA_VERSION,
      appVersion: APP_VERSION,
      exportedAt: '2026-07-01T00:00:00.000Z',
      payload: collections(),
    });
    preview.payload.settings[0]!.tariffVersions!.push(
      structuredClone(preview.payload.settings[0]!.tariffVersions![0]!),
    );
    await expect(DataPortabilityService.restore(preview)).rejects.toThrow(
      /tarife versiyon kimliği yinelenemez/i,
    );
  });
});
