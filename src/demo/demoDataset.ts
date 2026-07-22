import { DEFAULT_OFFER_STATE, DEFAULT_SETTINGS } from '../config/defaults';
import { createPaymentPlan } from '../config/paymentPlans';
import { calculateOffer } from '../domain/profitability/calculation';
import { calculateRealization } from '../domain/realization/realization';
import { buildReceivableInstallments } from '../domain/receivables/ledger';
import type {
  AppSettings,
  Customer,
  MonthlyMarketPrice,
  PlannedOffer,
  RealizationScenario,
} from '../types';

export const DEMO_RECORD_IDS = {
  customers: ['demo-customer-industry', 'demo-customer-business', 'demo-customer-ges'],
  offers: [
    'demo-offer-standard',
    'demo-offer-advance',
    'demo-offer-partial',
    'demo-offer-card',
    'demo-offer-ges',
    'demo-offer-legacy',
  ],
  scenarios: ['demo-scenario-realization'],
} as const;

const FIXED_TIME = '2026-07-01T09:00:00.000Z';

const monthlyMarketPrices: MonthlyMarketPrice[] = [
  {
    month: '2026-07',
    forecastPtfTlMwh: 3200,
    actualPtfTlMwh: 3500,
    forecastYekdemTlMwh: 400,
    actualYekdemTlMwh: 450,
    sourceNote: 'K2 Demo Fixture',
    actualizedAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
  },
  {
    month: '2026-08',
    forecastPtfTlMwh: 3450,
    actualPtfTlMwh: 3800,
    forecastYekdemTlMwh: 430,
    actualYekdemTlMwh: 470,
    sourceNote: 'K2 Demo Fixture',
    actualizedAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
  },
];

const customers: Customer[] = [
  { id: 'demo-customer-industry', name: 'Demo Anadolu Sanayi', tag: 'DEMO · Sanayi AG', createdAt: FIXED_TIME, updatedAt: FIXED_TIME, isArchived: false },
  { id: 'demo-customer-business', name: 'Demo Merkez Ticarethane', tag: 'DEMO · Ticarethane', createdAt: FIXED_TIME, updatedAt: FIXED_TIME, isArchived: false },
  { id: 'demo-customer-ges', name: 'Demo GES Üretim Tesisi', tag: 'DEMO · Advanced GES', createdAt: FIXED_TIME, updatedAt: FIXED_TIME, isArchived: false },
];

const offer = (
  id: string,
  customerId: string,
  title: string,
  paymentTemplate: string,
  patch: Partial<typeof DEFAULT_OFFER_STATE> = {},
): PlannedOffer => {
  const state = {
    ...structuredClone(DEFAULT_OFFER_STATE),
    customerId,
    title,
    usageStart: '2026-07-01',
    usageEnd: '2026-08-31',
    monthlyConsumption: 100,
    offerRate: 7,
    paymentPlan: createPaymentPlan(paymentTemplate),
    ...structuredClone(patch),
  };
  const result = calculateOffer(
    state,
    [],
    monthlyMarketPrices,
    DEFAULT_SETTINGS.tariffVersions,
  );
  result.calculatedAt = FIXED_TIME;
  return {
    id,
    recordType: 'planned_offer',
    customerId,
    version: 1,
    title,
    status: 'final',
    stateSnapshot: result.state,
    paymentPlanSnapshot: result.state.paymentPlan,
    resultSnapshot: result,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
  };
};

const buildDataset = () => {
  const standard = offer('demo-offer-standard', customers[0]!.id, 'Demo Standart Vadeli', 'standard_deferred');
  const advance = offer('demo-offer-advance', customers[0]!.id, 'Demo Tam Ön Ödeme', 'full_advance');
  const partial = offer('demo-offer-partial', customers[1]!.id, 'Demo Kısmi Avans + Kalan', 'partial_advance_balance');
  const cardPlan = createPaymentPlan('card_single');
  cardPlan.rows[0]!.commissionRate = 2;
  cardPlan.rows[0]!.commissionBearer = 'epsas';
  const card = offer('demo-offer-card', customers[1]!.id, 'Demo Komisyonlu Kart', 'card_single', { paymentPlan: cardPlan });
  const ges = offer('demo-offer-ges', customers[2]!.id, 'Demo Advanced GES', 'standard_deferred', {
    ges: {
      mode: 'advanced_metering',
      selfConsumptionRate: 0,
      totalProductionMwh: 160,
      simultaneousSelfConsumptionMwh: 80,
      gridImportMwh: 120,
      gridExportMwh: 40,
      excessAfterNettingMwh: 20,
      priceType: 'ptf_yekdem',
      nettingMethod: 'monthly',
      settlementMode: 'cash_outflow',
      excessProductionTaxMode: 'no_tax_in_demo',
      manualTaxAmountTl: 0,
      excessPurchasePaymentOffsetDays: 10,
    },
  });
  const legacy = structuredClone(standard);
  legacy.id = 'demo-offer-legacy';
  legacy.title = 'Demo Legacy Snapshot';
  legacy.legacySnapshot = { version: '2.17', note: 'Demo legacy örneği' };
  legacy.resultSnapshot.periods = legacy.resultSnapshot.periods.map((period) => {
    const copy = { ...period };
    delete copy.tariffSnapshot;
    return copy;
  });
  const scenarioBase = {
    id: 'demo-scenario-realization',
    sourceCustomerId: standard.customerId,
    sourceOfferId: standard.id,
    sourceOfferVersion: standard.version,
    sourceOfferSnapshot: structuredClone(standard),
    name: 'Demo Gecikmeli Tahsilat ve Açık Alacak',
    asOfDate: '2026-09-20',
    periodOverrides: [],
    actualPayments: [
      {
        id: 'demo-actual-payment-late',
        invoiceId: standard.resultSnapshot.periods[0]!.id,
        receivableInstallmentId: buildReceivableInstallments(
          standard.resultSnapshot.periods,
          standard.resultSnapshot.plannedPayments,
        ).find((installment) => installment.invoiceId === standard.resultSnapshot.periods[0]!.id)!.id,
        date: '2026-09-15',
        amount: standard.resultSnapshot.periods[0]!.grossInvoice + 5_000,
        channel: 'eft' as const,
        commissionRate: 0,
        commissionBearer: 'epsas' as const,
        note: 'Demo gecikmeli ve kısmi fazla tahsilat',
      },
    ],
    actualRefunds: [],
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
  } satisfies Omit<RealizationScenario, 'resultSnapshot'>;
  const scenario: RealizationScenario = {
    ...scenarioBase,
    resultSnapshot: calculateRealization(
      scenarioBase,
      DEFAULT_SETTINGS.lateFee.monthlyRate,
      monthlyMarketPrices,
      [],
    ),
  };
  const settings: AppSettings = {
    ...structuredClone(DEFAULT_SETTINGS),
    monthlyMarketPrices: structuredClone(monthlyMarketPrices),
  };
  return {
    customers: structuredClone(customers),
    costDrafts: [],
    plannedOffers: [standard, advance, partial, card, ges, legacy],
    realizationScenarios: [scenario],
    settings: [settings],
  };
};

const DEMO_DATASET = buildDataset();

export const getDemoDataset = () => structuredClone(DEMO_DATASET);
