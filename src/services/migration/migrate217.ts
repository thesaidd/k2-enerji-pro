import { DEFAULT_OFFER_STATE } from '../../config/defaults';
import { createId, createPaymentPlan } from '../../config/paymentPlans';
import { calculateOffer, normalizeOfferState } from '../../domain/profitability/calculation';
import type { AppSettings, Customer, PlannedOffer } from '../../types';

export const LEGACY_CUSTOMER_KEY = 'k2-pro-version-chat-2-17-customers';
export const LEGACY_HOLIDAY_KEY = 'k2-pro-version-chat-2-17-holidays';

interface LegacyObject {
  [key: string]: unknown;
}

const object = (value: unknown): LegacyObject =>
  value && typeof value === 'object' ? (value as LegacyObject) : {};
const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;
const number = (value: unknown, fallback = 0): number =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const boolean = (value: unknown): boolean => value === true;

export interface MigrationPreview {
  customers: number;
  offers: number;
  archived: number;
  unconvertible: number;
  warnings: string[];
  payload: { customers: Customer[]; offers: PlannedOffer[]; holidays: string[] };
}

const convertOffer = (legacy: LegacyObject, customerId: string, index: number): PlannedOffer => {
  const legacyState = object(legacy.state);
  const unit =
    text(legacyState.monthlyConsumptionUnit ?? legacyState.energyUnit, 'MWh') === 'kWh'
      ? 'kWh'
      : 'MWh';
  const oldGesRate = number(legacyState.gesRate, 0);
  const state = normalizeOfferState({
    ...DEFAULT_OFFER_STATE,
    customerId,
    title: text(legacy.title, `${index + 1}. Teklif`),
    usageStart: text(legacyState.usageStart, DEFAULT_OFFER_STATE.usageStart),
    usageEnd: text(legacyState.usageEnd, DEFAULT_OFFER_STATE.usageEnd),
    monthlyConsumptionUnit: unit,
    monthlyConsumption: number(
      legacyState.monthlyConsumption ?? legacyState.consumption,
      DEFAULT_OFFER_STATE.monthlyConsumption,
    ),
    customerType: text(legacyState.customerType, DEFAULT_OFFER_STATE.customerType),
    kdvRate: number(legacyState.kdvRate, DEFAULT_OFFER_STATE.kdvRate),
    btvRate: number(legacyState.btvRate, DEFAULT_OFFER_STATE.btvRate),
    distributionUnitTlMwh: number(
      legacyState.distributionUnit,
      DEFAULT_OFFER_STATE.distributionUnitTlMwh,
    ),
    contractPowerTl: number(legacyState.contractPower, 0),
    ptfTlMwh: number(legacyState.ptf, DEFAULT_OFFER_STATE.ptfTlMwh),
    yekdemTlMwh: number(legacyState.yekdem, DEFAULT_OFFER_STATE.yekdemTlMwh),
    offerRate: number(legacyState.offerPct, 0),
    imbalanceRate: number(legacyState.imbalancePct, 0),
    piuRate: number(legacyState.piuPct, 0),
    creditRate: number(legacyState.creditRate, DEFAULT_OFFER_STATE.creditRate),
    valorRate: number(legacyState.valorRate, DEFAULT_OFFER_STATE.valorRate),
    paymentPlan: createPaymentPlan(
      text(object(legacyState.paymentPlan).templateId, 'standard_deferred'),
    ),
    ges: {
      mode: 'simple_self_consumption',
      selfConsumptionRate: oldGesRate,
      excessProductionTaxMode: 'manual',
    },
  });
  const now = new Date().toISOString();
  return {
    id: createId('offer'),
    recordType: 'planned_offer',
    customerId,
    version: number(legacy.version ?? legacy.sequenceNo, 1),
    title: text(legacy.title, `${index + 1}. Teklif`),
    status: boolean(legacy.isDeleted) ? 'archived' : 'final',
    stateSnapshot: structuredClone(state),
    paymentPlanSnapshot: structuredClone(state.paymentPlan),
    resultSnapshot: calculateOffer(state),
    legacySnapshot: structuredClone(legacy.resultSnapshot ?? legacy),
    createdAt: text(legacy.createdAt, now),
    updatedAt: text(legacy.updatedAt, now),
  };
};

export const preview217Migration = (input: unknown): MigrationPreview => {
  const root = object(input);
  const rawCustomers = Array.isArray(root.customers)
    ? root.customers
    : Array.isArray(input)
      ? input
      : [];
  const customers: Customer[] = [];
  const offers: PlannedOffer[] = [];
  let unconvertible = 0;
  for (const [index, raw] of rawCustomers.entries()) {
    try {
      const legacy = object(raw);
      const customerId = text(legacy.id, createId('customer'));
      const now = new Date().toISOString();
      customers.push({
        id: customerId,
        name: text(legacy.name, `İçe aktarılan müşteri ${index + 1}`),
        note: text(legacy.note),
        tag: text(legacy.tag),
        createdAt: text(legacy.createdAt, now),
        updatedAt: text(legacy.updatedAt, now),
        isArchived: boolean(legacy.isArchived ?? legacy.isDeleted),
      });
      const rawOffers = Array.isArray(legacy.offers) ? legacy.offers : [];
      rawOffers.forEach((offer, offerIndex) =>
        offers.push(convertOffer(object(offer), customerId, offerIndex)),
      );
    } catch {
      unconvertible += 1;
    }
  }
  const holidaySource = object(root.holidays);
  const holidays = Object.values(holidaySource).flatMap((value) => {
    if (Array.isArray(value))
      return value.filter((item): item is string => typeof item === 'string');
    const year = object(value);
    return Object.keys(year).filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key));
  });
  return {
    customers: customers.length,
    offers: offers.length,
    archived:
      customers.filter((customer) => customer.isArchived).length +
      offers.filter((offer) => offer.status === 'archived').length,
    unconvertible,
    warnings: offers.some((offer) => offer.stateSnapshot.ges.selfConsumptionRate > 0)
      ? [
          'Eski GES oranı, 3.0’da “GES Öz Tüketim Oranı” olarak yorumlandı. Eski GES alacağı ve tahsilat gecikmesi yeni hesaplamada kullanılmadı.',
        ]
      : [],
    payload: { customers, offers, holidays },
  };
};

export const detectLegacyLocalStorage = (): MigrationPreview | null => {
  const customers = localStorage.getItem(LEGACY_CUSTOMER_KEY);
  if (!customers) return null;
  const parsed = JSON.parse(customers) as unknown;
  const holidaysRaw = localStorage.getItem(LEGACY_HOLIDAY_KEY);
  const source = object(parsed);
  if (holidaysRaw) source.holidays = JSON.parse(holidaysRaw) as unknown;
  return preview217Migration(source);
};

export const mergeMigratedSettings = (settings: AppSettings, holidays: string[]): AppSettings => ({
  ...settings,
  holidays: [...new Set([...settings.holidays, ...holidays])].sort(),
});
