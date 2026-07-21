import { CALCULATION_POLICY_VERSION, DEFAULT_LATE_FEE_MONTHLY_RATE } from './calculationPolicy';
import { createPaymentPlan } from './paymentPlans';
import type { AppSettings, OfferState } from '../types';

export const DEFAULT_OFFER_STATE: OfferState = {
  customerId: '',
  title: 'Yeni maliyet çalışması',
  usageStart: '2026-07-01',
  usageEnd: '2026-12-31',
  monthlyConsumption: 100,
  monthlyConsumptionUnit: 'MWh',
  customerType: 'tek-terimli-ag-sanayi',
  kdvRate: 20,
  btvRate: 1,
  distributionUnitTlMwh: 1829.503,
  hasDistribution: true,
  contractPowerTl: 0,
  ptfTlMwh: 3200,
  yekdemTlMwh: 400,
  offerRate: undefined,
  imbalanceRate: 1,
  piuRate: 1,
  creditRate: 49,
  valorRate: 42,
  yekdemDueOffset: 25,
  distributionDueOffset: 17,
  kdvDueOffset: 28,
  btvDueOffset: 56,
  ges: {
    mode: 'simple_self_consumption',
    selfConsumptionRate: 0,
    excessProductionTaxMode: 'manual',
  },
  paymentPlan: createPaymentPlan(),
};

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'app',
  theme: 'light',
  holidays: [],
  lateFee: {
    monthlyRate: DEFAULT_LATE_FEE_MONTHLY_RATE,
    dayBasis: 360,
    useInvoiceVatRate: true,
    compound: false,
    includeWeekendsAndHolidays: true,
  },
  policyVersion: CALCULATION_POLICY_VERSION,
};
