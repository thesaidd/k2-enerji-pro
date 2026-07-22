import type { GesSettings } from '../../types';

export interface GesPeriodResult {
  grossConsumptionMwh: number;
  selfConsumptionMwh: number;
  gridConsumptionMwh: number;
  gridExportMwh: number;
  excessProductionMwh: number;
  excessPurchasePrice: number;
  excessPurchaseAmount: number;
}

export const resolveGesExcessPurchasePrice = (
  ges: GesSettings,
  ptfTlMwh: number,
  yekdemTlMwh: number,
): number =>
  ges.priceType === 'ptf'
    ? ptfTlMwh
    : ges.priceType === 'ptf_yekdem'
      ? ptfTlMwh + yekdemTlMwh
      : ges.priceType === 'manual' || ges.priceType === 'regulated'
        ? Math.max(0, ges.excessPurchasePrice ?? 0)
        : 0;

export const calculateGesPeriod = (
  grossConsumptionMwh: number,
  periodShare: number,
  ges: GesSettings,
  ptfTlMwh: number,
  yekdemTlMwh: number,
): GesPeriodResult => {
  if (ges.mode === 'simple_self_consumption') {
    const selfConsumptionMwh = Math.min(
      grossConsumptionMwh,
      Math.max(0, (grossConsumptionMwh * ges.selfConsumptionRate) / 100),
    );
    return {
      grossConsumptionMwh,
      selfConsumptionMwh,
      gridConsumptionMwh: Math.max(0, grossConsumptionMwh - selfConsumptionMwh),
      gridExportMwh: 0,
      excessProductionMwh: 0,
      excessPurchasePrice: 0,
      excessPurchaseAmount: 0,
    };
  }

  const selfConsumptionMwh = Math.min(
    grossConsumptionMwh,
    Math.max(0, (ges.simultaneousSelfConsumptionMwh ?? 0) * periodShare),
  );
  const gridConsumptionMwh = Math.max(
    0,
    ges.gridImportMwh == null
      ? grossConsumptionMwh - selfConsumptionMwh
      : ges.gridImportMwh * periodShare,
  );
  const gridExportMwh = Math.max(0, (ges.gridExportMwh ?? 0) * periodShare);
  const excessProductionMwh = Math.max(
    0,
    (ges.excessAfterNettingMwh ?? gridExportMwh) * periodShare,
  );
  const price = resolveGesExcessPurchasePrice(ges, ptfTlMwh, yekdemTlMwh);
  return {
    grossConsumptionMwh,
    selfConsumptionMwh,
    gridConsumptionMwh,
    gridExportMwh,
    excessProductionMwh,
    excessPurchasePrice: price,
    excessPurchaseAmount: excessProductionMwh * price,
  };
};
