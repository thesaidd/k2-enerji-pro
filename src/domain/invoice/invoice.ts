import { generateBillingPeriods } from '../calendar/calendar';
import { energyToMwh } from '../consumption/conversions';
import { calculateGesPeriod } from '../ges/ges';
import type { BillingPeriod, OfferState } from '../../types';

export interface InvoiceModel {
  periods: BillingPeriod[];
  excessProductionPurchase: number;
}

export const calculateInvoices = (state: OfferState): InvoiceModel => {
  const monthlyMwh = energyToMwh(state.monthlyConsumption, state.monthlyConsumptionUnit);
  const seeds = generateBillingPeriods(state.usageStart, state.usageEnd, monthlyMwh);
  const offerRate = state.offerRate ?? 0;
  const periods = seeds.map<BillingPeriod>((seed, index) => {
    const ges = calculateGesPeriod(
      seed.grossConsumptionMwh,
      seed.share,
      state.ges,
      state.ptfTlMwh,
      state.yekdemTlMwh,
    );
    const periodContractPower =
      index === seeds.length - 1
        ? state.contractPowerTl -
          seeds.slice(0, -1).reduce((sum, item) => sum + state.contractPowerTl * item.share, 0)
        : state.contractPowerTl * seed.share;
    const ptfAmount = ges.gridConsumptionMwh * state.ptfTlMwh;
    const yekdemAmount = ges.gridConsumptionMwh * state.yekdemTlMwh;
    const activeEnergyBaseAmount = ptfAmount + yekdemAmount;
    const offerMargin = (activeEnergyBaseAmount * offerRate) / 100;
    const activeEnergySalesAmount = activeEnergyBaseAmount + offerMargin;
    const activeEnergyUnitPrice =
      ges.gridConsumptionMwh > 0
        ? activeEnergySalesAmount / ges.gridConsumptionMwh
        : (state.ptfTlMwh + state.yekdemTlMwh) * (1 + offerRate / 100);
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
    };
  });
  const excessProductionPurchase = seeds.reduce((sum, seed) => {
    const ges = calculateGesPeriod(
      seed.grossConsumptionMwh,
      seed.share,
      state.ges,
      state.ptfTlMwh,
      state.yekdemTlMwh,
    );
    return sum + ges.excessPurchaseAmount;
  }, 0);
  return { periods, excessProductionPurchase };
};
