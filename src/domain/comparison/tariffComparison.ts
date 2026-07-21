import { getTariff } from '../../config/tariffs';
import type { CalculationResult, OfferState } from '../../types';

export type ComparisonModel =
  | 'bilateral'
  | 'skt_kbk'
  | 'national_fixed'
  | 'national_tiered'
  | 'manual_active'
  | 'fixed_discount_tl_mwh'
  | 'usd_mwh';

export interface ComparisonSettings {
  model: ComparisonModel;
  referenceActivePriceTlMwh: number;
  sktMultiplier: number;
  lowTierPriceTlMwh: number;
  highTierPriceTlMwh: number;
  tierThresholdMwh: number;
  fixedDiscountTlMwh: number;
  usdPriceMwh: number;
  usdTry: number;
  usdIncludesYekdem: boolean;
}

export interface TariffComparisonResult {
  bilateralInvoice: number;
  referenceInvoice: number;
  customerSavings: number;
  customerSavingsRate: number;
  epsasProfit: number;
  decision: string;
}

const NATIONAL_ACTIVE_PRICE: Record<string, number> = {
  'cift-terimli-og-sanayi': 2909.687,
  'cift-terimli-og-ticarethane': 3262.024,
  'cift-terimli-og-mesken': 2036.685,
  'cift-terimli-og-tarimsal-sulama': 2437.156,
  'tek-terimli-og-sanayi': 2909.687,
  'tek-terimli-og-ticarethane': 3262.024,
  'tek-terimli-og-mesken': 2036.685,
  'tek-terimli-og-tarimsal-sulama': 2437.156,
  'tek-terimli-ag-sanayi': 2985.253,
  'tek-terimli-ag-ticarethane': 2873.087,
  'tek-terimli-ag-mesken': 494.065,
  'tek-terimli-ag-tarimsal-sulama': 2333.838,
};

export const defaultComparisonSettings = (state: OfferState): ComparisonSettings => ({
  model: 'skt_kbk',
  referenceActivePriceTlMwh:
    NATIONAL_ACTIVE_PRICE[state.customerType] ?? state.ptfTlMwh + state.yekdemTlMwh,
  sktMultiplier: 1.0938,
  lowTierPriceTlMwh: NATIONAL_ACTIVE_PRICE[state.customerType] ?? 3000,
  highTierPriceTlMwh: (NATIONAL_ACTIVE_PRICE[state.customerType] ?? 3000) * 1.2,
  tierThresholdMwh: 30,
  fixedDiscountTlMwh: 100,
  usdPriceMwh: 75,
  usdTry: 34,
  usdIncludesYekdem: false,
});

export const referenceActiveUnitPrice = (
  state: OfferState,
  settings: ComparisonSettings,
): number => {
  if (settings.model === 'skt_kbk')
    return (state.ptfTlMwh + state.yekdemTlMwh) * settings.sktMultiplier;
  if (settings.model === 'national_fixed' || settings.model === 'manual_active')
    return settings.referenceActivePriceTlMwh;
  if (settings.model === 'fixed_discount_tl_mwh')
    return Math.max(0, settings.referenceActivePriceTlMwh - settings.fixedDiscountTlMwh);
  if (settings.model === 'usd_mwh')
    return (
      settings.usdPriceMwh * settings.usdTry + (settings.usdIncludesYekdem ? 0 : state.yekdemTlMwh)
    );
  return settings.referenceActivePriceTlMwh;
};

export const calculateReferenceInvoice = (
  state: OfferState,
  result: CalculationResult,
  settings = defaultComparisonSettings(state),
): number => {
  const tariff = getTariff(state.customerType);
  return result.periods.reduce((total, period) => {
    let activeUnit = referenceActiveUnitPrice(state, settings);
    if (settings.model === 'national_tiered') {
      const low = Math.min(
        period.gridConsumptionMwh,
        settings.tierThresholdMwh * period.monthFactor,
      );
      const high = Math.max(0, period.gridConsumptionMwh - low);
      const active = low * settings.lowTierPriceTlMwh + high * settings.highTierPriceTlMwh;
      activeUnit = period.gridConsumptionMwh > 0 ? active / period.gridConsumptionMwh : 0;
    }
    const active = period.gridConsumptionMwh * activeUnit;
    const distribution = period.gridConsumptionMwh * tariff.distributionTlMwh;
    const btv = (active * tariff.btvDefault) / 100;
    const kdv =
      ((active + distribution + period.contractPowerAmount + btv) * tariff.kdvDefault) / 100;
    return total + active + distribution + period.contractPowerAmount + btv + kdv;
  }, 0);
};

export const commercialDecision = (customerSavings: number, epsasProfit: number): string => {
  if (customerSavings >= 0 && epsasProfit >= 0) return 'Ticari olarak dengeli teklif';
  if (customerSavings >= 0) return 'Müşteri avantajlı fakat teklif EPSAŞ için zararlı';
  if (epsasProfit >= 0) return 'EPSAŞ kârlı fakat müşteri referans tarifeye göre dezavantajlı';
  return 'Teklif iki taraf açısından da uygun değil';
};

export const compareTariff = (
  state: OfferState,
  result: CalculationResult,
  settings = defaultComparisonSettings(state),
): TariffComparisonResult => {
  const referenceInvoice = calculateReferenceInvoice(state, result, settings);
  const bilateralInvoice = result.totals.grossInvoice;
  const customerSavings = referenceInvoice - bilateralInvoice;
  return {
    bilateralInvoice,
    referenceInvoice,
    customerSavings,
    customerSavingsRate: referenceInvoice > 0 ? customerSavings / referenceInvoice : 0,
    epsasProfit: result.totals.netProfit,
    decision: commercialDecision(customerSavings, result.totals.netProfit),
  };
};
