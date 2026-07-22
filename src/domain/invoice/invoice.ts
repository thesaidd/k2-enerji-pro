import { generateBillingPeriods } from '../calendar/calendar';
import { energyToMwh } from '../consumption/conversions';
import { calculateGesPeriod } from '../ges/ges';
import type { BillingPeriod, MarketPriceSnapshot, OfferState } from '../../types';

export interface InvoiceModel {
  periods: BillingPeriod[];
  excessProductionPurchase: number;
}

export const calculateInvoices = (
  state: OfferState,
  marketPrices?: MarketPriceSnapshot[],
): InvoiceModel => {
  const monthlyMwh = energyToMwh(state.monthlyConsumption, state.monthlyConsumptionUnit);
  const seeds = generateBillingPeriods(state.usageStart, state.usageEnd, monthlyMwh);
  const offerRate = state.offerRate ?? 0;
  const periods = seeds.map<BillingPeriod>((seed, index) => {
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
      ? ges.gridConsumptionMwh * state.distributionUnitTlMwh
      : 0;
    const btvBase = activeEnergySalesAmount;
    const btvAmount = (btvBase * state.btvRate) / 100;
    const kdvBase = activeEnergySalesAmount + distributionAmount + periodContractPower + btvAmount;
    const kdvAmount = (kdvBase * state.kdvRate) / 100;
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
    };
  });
  const excessProductionPurchase = periods.reduce(
    (sum, period) => sum + (period.excessPurchaseAmount ?? 0),
    0,
  );
  return { periods, excessProductionPurchase };
};
