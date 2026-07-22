import { createPaymentPlan } from '../../config/paymentPlans';
import { APP_VERSION, BACKUP_SCHEMA_VERSION } from '../../config/release';
import { db } from './database';
import { normalizeAppSettings } from './SettingsRepository';
import type {
  AppSettings,
  CostDraft,
  Customer,
  PlannedOffer,
  RealizationScenario,
} from '../../types';

export { APP_VERSION, BACKUP_SCHEMA_VERSION };

export interface BackupCollections {
  customers: Customer[];
  costDrafts: CostDraft[];
  plannedOffers: PlannedOffer[];
  realizationScenarios: RealizationScenario[];
  settings: AppSettings[];
}

export interface LegacyBackupPayload extends BackupCollections {
  version: 'K2-ENERJIPRO-3.0';
  exportedAt: string;
}

export type BackupPayload = LegacyBackupPayload;

export interface BackupEnvelope {
  format: 'K2-ENERJIPRO';
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  payload: BackupCollections;
}

export interface RestorePreview {
  payload: BackupCollections;
  sourceFormat: 'envelope' | 'legacy-3.0';
  customers: number;
  costDrafts: number;
  plannedOffers: number;
  realizationScenarios: number;
  monthlyPrices: number;
  legacyRecords: number;
  migrationRecords: number;
  warnings: string[];
}

const asRecord = (value: unknown, message: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
};

const requiredArray = <T>(record: Record<string, unknown>, key: string): T[] => {
  if (!Array.isArray(record[key])) throw new Error(`Yedekte ${key} koleksiyonu dizi olmalıdır.`);
  return structuredClone(record[key] as T[]);
};

const assertUniqueIds = (label: string, records: Array<{ id?: unknown }>) => {
  const seen = new Set<string>();
  records.forEach((record, index) => {
    if (typeof record?.id !== 'string' || !record.id)
      throw new Error(`${label}[${index}].id zorunludur.`);
    if (seen.has(record.id)) throw new Error(`${label} koleksiyonunda yinelenen id: ${record.id}`);
    seen.add(record.id);
  });
};

const DATE_KEYS = new Set([
  'usageStart',
  'usageEnd',
  'asOfDate',
  'date',
  'start',
  'end',
  'invoiceDate',
  'dueDate',
  'transactionDate',
  'settlementDate',
  'applicationDate',
  'availableDate',
  'validFrom',
  'validTo',
]);
const NON_NEGATIVE_KEYS = new Set([
  'monthlyConsumption',
  'kdvRate',
  'btvRate',
  'distributionUnitTlMwh',
  'contractPowerTl',
  'yekdemTlMwh',
  'imbalanceRate',
  'piuRate',
  'creditRate',
  'valorRate',
  'commissionRate',
  'amount',
  'principalAmount',
  'selfConsumptionRate',
  'excessPurchasePaymentOffsetDays',
  'originalAmount',
  'appliedAmount',
  'remainingAmount',
]);

const validateValues = (value: unknown, path = 'payload'): void => {
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new Error(`${path} finite bir sayı olmalıdır.`);
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateValues(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    if (NON_NEGATIVE_KEYS.has(key) && typeof child === 'number' && child < 0)
      throw new Error(`${path}.${key} negatif olamaz.`);
    if (
      DATE_KEYS.has(key) &&
      child != null &&
      (typeof child !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(child))
    )
      throw new Error(`${path}.${key} ISO tarih (YYYY-MM-DD) olmalıdır.`);
    validateValues(child, `${path}.${key}`);
  });
};

const normalizeTariffSource = <T extends PlannedOffer['stateSnapshot']>(state: T): T => ({
  ...structuredClone(state),
  tariffSourceMode: state.tariffSourceMode ?? 'legacy_numeric',
});

const normalizeOffer = (offer: PlannedOffer): PlannedOffer => ({
  ...structuredClone(offer),
  stateSnapshot: {
    ...normalizeTariffSource(offer.stateSnapshot),
    ges: {
      ...structuredClone(offer.stateSnapshot.ges),
      excessPurchasePaymentOffsetDays:
        offer.stateSnapshot.ges.excessPurchasePaymentOffsetDays ?? 10,
    },
    tariffOverrides: structuredClone(offer.stateSnapshot.tariffOverrides ?? []),
    paymentPlan: {
      ...structuredClone(offer.stateSnapshot.paymentPlan),
      reconciliation: {
        ...createPaymentPlan().reconciliation,
        ...structuredClone(offer.stateSnapshot.paymentPlan?.reconciliation ?? {}),
      },
    },
  },
  paymentPlanSnapshot: {
    ...structuredClone(offer.paymentPlanSnapshot),
    reconciliation: {
      ...createPaymentPlan().reconciliation,
      ...structuredClone(offer.paymentPlanSnapshot?.reconciliation ?? {}),
    },
  },
});

const normalizeDraft = (draft: CostDraft): CostDraft => ({
  ...structuredClone(draft),
  state: normalizeTariffSource(draft.state),
});

const normalizeCollections = (record: Record<string, unknown>): BackupCollections => {
  const customers = requiredArray<Customer>(record, 'customers');
  const costDrafts = requiredArray<CostDraft>(record, 'costDrafts').map(normalizeDraft);
  const plannedOffers = requiredArray<PlannedOffer>(record, 'plannedOffers').map(normalizeOffer);
  const realizationScenarios = requiredArray<RealizationScenario>(
    record,
    'realizationScenarios',
  ).map((scenario) => ({
    ...scenario,
    actualRefunds: structuredClone(scenario.actualRefunds ?? []),
    sourceOfferSnapshot: normalizeOffer(scenario.sourceOfferSnapshot),
  }));
  const rawSettings = requiredArray<AppSettings>(record, 'settings');
  if (rawSettings.length > 0) assertUniqueIds('settings', rawSettings);
  const settings = rawSettings.length > 0 ? rawSettings.map(normalizeAppSettings) : [normalizeAppSettings({})];
  assertUniqueIds('customers', customers);
  assertUniqueIds('costDrafts', costDrafts);
  assertUniqueIds('plannedOffers', plannedOffers);
  assertUniqueIds('realizationScenarios', realizationScenarios);
  const customerIds = new Set(customers.map((customer) => customer.id));
  const offerIds = new Set(plannedOffers.map((offer) => offer.id));
  for (const draft of costDrafts)
    if (!customerIds.has(draft.customerId))
      throw new Error(`Taslak ${draft.id} için müşteri referansı bulunamadı: ${draft.customerId}`);
  for (const offer of plannedOffers)
    if (!customerIds.has(offer.customerId))
      throw new Error(`Teklif ${offer.id} için müşteri referansı bulunamadı: ${offer.customerId}`);
  for (const scenario of realizationScenarios) {
    if (!customerIds.has(scenario.sourceCustomerId))
      throw new Error(`Gerçekleşme ${scenario.id} için müşteri referansı bulunamadı.`);
    if (!offerIds.has(scenario.sourceOfferId))
      throw new Error(`Gerçekleşme ${scenario.id} için kaynak teklif bulunamadı: ${scenario.sourceOfferId}`);
  }
  const collections = { customers, costDrafts, plannedOffers, realizationScenarios, settings };
  validateValues(collections);
  return collections;
};

export const prepareRestore = (input: unknown): RestorePreview => {
  const source = asRecord(input, 'Yedek içeriği geçersiz.');
  let sourceFormat: RestorePreview['sourceFormat'];
  let payloadRecord: Record<string, unknown>;
  if (source.format === 'K2-ENERJIPRO') {
    if (source.schemaVersion !== BACKUP_SCHEMA_VERSION)
      throw new Error(`Desteklenmeyen yedek şema sürümü: ${String(source.schemaVersion)}`);
    sourceFormat = 'envelope';
    payloadRecord = asRecord(source.payload, 'Yedek payload alanı geçersiz.');
  } else if (source.version === 'K2-ENERJIPRO-3.0') {
    sourceFormat = 'legacy-3.0';
    payloadRecord = source;
  } else throw new Error('Bu dosya desteklenen bir K2 EnerjiPro yedeği değil.');
  const payload = normalizeCollections(payloadRecord);
  const legacyRecords = payload.plannedOffers.filter((offer) =>
    offer.resultSnapshot.periods.some((period) => !period.tariffSnapshot),
  ).length;
  const migrationRecords =
    sourceFormat === 'legacy-3.0'
      ? payload.plannedOffers.length + payload.realizationScenarios.length
      : 0;
  return {
    payload,
    sourceFormat,
    customers: payload.customers.length,
    costDrafts: payload.costDrafts.length,
    plannedOffers: payload.plannedOffers.length,
    realizationScenarios: payload.realizationScenarios.length,
    monthlyPrices: payload.settings[0]?.monthlyMarketPrices.length ?? 0,
    legacyRecords,
    migrationRecords,
    warnings: [
      ...(sourceFormat === 'legacy-3.0' ? ['Eski K2-ENERJIPRO-3.0 zarfı güvenli biçimde normalize edilecek.'] : []),
      ...(legacyRecords > 0 ? [`${legacyRecords} legacy teklifin kayıtlı sayısal snapshot’ı korunacak.`] : []),
    ],
  };
};

export const normalizeBackupPayload = (input: unknown): LegacyBackupPayload => {
  const preview = prepareRestore(input);
  return {
    version: 'K2-ENERJIPRO-3.0',
    exportedAt: '',
    ...preview.payload,
  };
};

export const DataPortabilityService = {
  export: async (): Promise<BackupEnvelope> => ({
    format: 'K2-ENERJIPRO',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    payload: {
      customers: await db.customers.toArray(),
      costDrafts: await db.costDrafts.toArray(),
      plannedOffers: await db.plannedOffers.toArray(),
      realizationScenarios: await db.realizationScenarios.toArray(),
      settings: (await db.settings.toArray()).map(normalizeAppSettings),
    },
  }),
  previewRestore: async (input: unknown): Promise<RestorePreview> => prepareRestore(input),
  restore: async (input: unknown | RestorePreview): Promise<void> => {
    const preview =
      input && typeof input === 'object' && 'sourceFormat' in input
        ? (input as RestorePreview)
        : prepareRestore(input);
    const payload = normalizeCollections(
      asRecord(preview.payload, 'Geri yükleme önizleme payload alanı geçersiz.'),
    );
    await db.transaction(
      'rw',
      [db.customers, db.costDrafts, db.plannedOffers, db.realizationScenarios, db.settings],
      async () => {
        await Promise.all([
          db.customers.clear(),
          db.costDrafts.clear(),
          db.plannedOffers.clear(),
          db.realizationScenarios.clear(),
          db.settings.clear(),
        ]);
        await Promise.all([
          db.customers.bulkPut(structuredClone(payload.customers)),
          db.costDrafts.bulkPut(structuredClone(payload.costDrafts)),
          db.plannedOffers.bulkPut(structuredClone(payload.plannedOffers)),
          db.realizationScenarios.bulkPut(structuredClone(payload.realizationScenarios)),
          db.settings.bulkPut(structuredClone(payload.settings)),
        ]);
      },
    );
  },
};
