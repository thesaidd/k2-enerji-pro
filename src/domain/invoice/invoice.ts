import { generateBillingPeriods } from '../calendar/calendar';
import { energyToMwh } from '../consumption/conversions';
import { calculateGesPeriod } from '../ges/ges';
import { DEFAULT_TARIFF_VERSIONS } from '../../config/tariffs';
import { resolveTariffForPeriod } from '../tariff/tariff';
import type { BillingPeriod, MarketPriceSnapshot, OfferState, TariffVersion } from '../../types';

export interface InvoiceModel {
  periods: BillingPeriod[];
  excessProductionPurchase: number;
}

export const calculateInvoices = (
  state: OfferState,
  marketPrices?: MarketPriceSnapshot[],
  tariffVersions: TariffVersion[] = DEFAULT_TARIFF_VERSIONS,
): InvoiceModel => {
  const monthlyMwh = energyToMwh(state.monthlyConsumption, state.monthlyConsumptionUnit);
  const seeds = generateBillingPeriods(state.usageStart, state.usageEnd, monthlyMwh);
  const offerRate = state.offerRate ?? 0;
  const periods = seeds.map<BillingPeriod>((seed, index) => {
    const tariffResolution = resolveTariffForPeriod(
      state.customerType,
      seed.start,
      seed.end,
      tariffVersions,
      state.tariffOverrides,
    );
    if (!tariffResolution.snapshot) throw new Error(tariffResolution.error);
    const resolvedTariff = tariffResolution.snapshot;
    const hasExplicitPeriodOverride = state.tariffOverrides?.some(
      (override) => override.month === seed.start.slice(0, 7),
    );
    const hasLegacyNumericOverride =
      !hasExplicitPeriodOverride && state.tariffSourceMode === 'legacy_numeric';
    const tariff = hasLegacyNumericOverride
      ? {
          ...resolvedTariff,
          kdvRate: state.kdvRate,
          btvRate: state.btvRate,
          distributionUnitTlMwh: state.distributionUnitTlMwh,
          sourceMode: 'legacy_numeric' as const,
          manualOverride: true,
          overrideReason: 'Legacy taslak — P0-C öncesi sayısal tarife değerleri korunmuştur.',
        }
      : resolvedTariff;
    const marketPriceMonth = seed.start.slice(0, 7);
    const marketPrice = marketPrices?.find((item) => item.month === marketPriceMonth) ?? {
      month: marketPriceMonth,
      ptfUnitPrice: state.ptfTlMwh,
      yekdemUnitPrice: state.yekdemTlMwh,
      ptfPriceSource: 'legacy' as const,
      yekdemPriceSource: 'legacy' as const,
    };
    const ges = calculateGesPeriod(
      seed.grossConsumptionMwh,
      seed.share,
      state.ges,
      marketPrice.ptfUnitPrice,
      marketPrice.yekdemUnitPrice,
    );
    const periodContractPower =
      index === seeds.length - 1
        ? state.contractPowerTl -
          seeds.slice(0, -1).reduce((sum, item) => sum + state.contractPowerTl * item.share, 0)
        : state.contractPowerTl * seed.share;
    const ptfAmount = ges.gridConsumptionMwh * marketPrice.ptfUnitPrice;
    const yekdemAmount = ges.gridConsumptionMwh * marketPrice.yekdemUnitPrice;
    const activeEnergyBaseAmount = ptfAmount + yekdemAmount;
    const offerMargin = (activeEnergyBaseAmount * offerRate) / 100;
    const activeEnergySalesAmount = activeEnergyBaseAmount + offerMargin;
    const activeEnergyUnitPrice =
      ges.gridConsumptionMwh > 0
        ? activeEnergySalesAmount / ges.gridConsumptionMwh
        : (marketPrice.ptfUnitPrice + marketPrice.yekdemUnitPrice) * (1 + offerRate / 100);
    const distributionAmount = state.hasDistribution
      ? ges.gridConsumptionMwh * tariff.distributionUnitTlMwh
      : 0;
    const btvBase = activeEnergySalesAmount;
    const btvAmount = (btvBase * tariff.btvRate) / 100;
    const kdvBase = activeEnergySalesAmount + distributionAmount + periodContractPower + btvAmount;
    const kdvAmount = (kdvBase * tariff.kdvRate) / 100;
    const grossInvoice =
      activeEnergySalesAmount + distributionAmount + periodContractPower + btvAmount + kdvAmount;
    const gesSelfConsumptionSavings = ges.selfConsumptionMwh * activeEnergyUnitPrice;
    return {
      ...seed,
      grossConsumptionMwh: seed.grossConsumptionMwh,
      gesSelfConsumptionMwh: ges.selfConsumptionMwh,
      gridConsumptionMwh: ges.gridConsumptionMwh,
      activeEnergyUnitPrice,
      ptfAmount,
      yekdemAmount,
      activeEnergyBaseAmount,
      offerMargin,
      activeEnergySalesAmount,
      distributionAmount,
      contractPowerAmount: periodContractPower,
      btvBase,
      btvAmount,
      kdvBase,
      kdvAmount,
      grossInvoice,
      gesSelfConsumptionSavings,
      imbalanceAmount: (activeEnergyBaseAmount * state.imbalanceRate) / 100,
      piuAmount: (activeEnergyBaseAmount * state.piuRate) / 100,
      gridExportMwh: ges.gridExportMwh,
      excessProductionMwh: ges.excessProductionMwh,
      excessPurchasePrice: ges.excessPurchasePrice,
      excessPurchaseAmount: ges.excessPurchaseAmount,
      marketPriceMonth,
      ptfUnitPrice: marketPrice.ptfUnitPrice,
      yekdemUnitPrice: marketPrice.yekdemUnitPrice,
      ptfPriceSource: marketPrice.ptfPriceSource,
      yekdemPriceSource: marketPrice.yekdemPriceSource,
      tariffSnapshot: tariff,
    };
  });
  const excessProductionPurchase = periods.reduce(
    (sum, period) => sum + (period.excessPurchaseAmount ?? 0),
    0,
  );
  return { periods, excessProductionPurchase };
};
