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

export const validateGesForDemo = (ges: GesSettings): string[] => {
  if (ges.mode === 'simple_self_consumption') return [];
  const errors: string[] = [];
  if ((ges.nettingMethod ?? 'monthly') === 'hourly')
    errors.push(
      'Saatlik mahsuplaşma bu demo sürümünde desteklenmiyor. Saatlik üretim ve tüketim serisi gerektirir.',
    );
  if ((ges.settlementMode ?? 'cash_outflow') === 'invoice_offset')
    errors.push('Faturadan mahsup bu demo sürümünde desteklenmiyor; vergi ve matrah etkileri tanımlı değil.');
  if (
    (ges.priceType === 'manual' || ges.priceType === 'regulated') &&
    (!(ges.excessPurchasePrice != null) || !Number.isFinite(ges.excessPurchasePrice))
  )
    errors.push('Manuel/düzenlemeye tabi GES alım fiyatı açıkça girilmelidir.');
  if (
    ges.excessProductionTaxMode === 'manual' &&
    (!(ges.manualTaxAmountTl != null) || !Number.isFinite(ges.manualTaxAmountTl))
  )
    errors.push('Manuel GES vergi modu için sabit TL vergi/maliyet tutarı girilmelidir.');
  return errors;
};

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
  const nettingMethod = ges.nettingMethod ?? 'monthly';
  const contractExcess =
    nettingMethod === 'manual'
      ? (ges.excessAfterNettingMwh ?? 0)
      : (ges.excessAfterNettingMwh ?? Math.max(0, (ges.gridExportMwh ?? 0) - (ges.gridImportMwh ?? 0)));
  const excessProductionMwh = Math.max(0, contractExcess * periodShare);
  const price = resolveGesExcessPurchasePrice(ges, ptfTlMwh, yekdemTlMwh);
  const manualTax =
    ges.excessProductionTaxMode === 'manual' ? (ges.manualTaxAmountTl ?? 0) * periodShare : 0;
  return {
    grossConsumptionMwh,
    selfConsumptionMwh,
    gridConsumptionMwh,
    gridExportMwh,
    excessProductionMwh,
    excessPurchasePrice: price,
    excessPurchaseAmount: excessProductionMwh * price + manualTax,
  };
};
