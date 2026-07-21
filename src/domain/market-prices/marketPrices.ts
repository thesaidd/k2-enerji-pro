import { monthlyMarketPricesSchema } from '../validation/schemas';
import type {
  BillingPeriod,
  MarketPriceSnapshot,
  MarketPriceSource,
  MonthlyMarketPrice,
  PeriodRealizationOverride,
} from '../../types';

export type MonthlyMarketPriceStatus =
  'forecast_missing' | 'forecast_ready' | 'actual_partial' | 'actual_complete';

export interface ForecastMarketPriceResolution {
  values: MarketPriceSnapshot[];
  errors: string[];
}

export const normalizeMonthlyMarketPrices = (input: unknown): MonthlyMarketPrice[] => {
  const parsed = monthlyMarketPricesSchema.safeParse(input ?? []);
  if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => issue.message).join(' '));
  return structuredClone(parsed.data).sort((a, b) => a.month.localeCompare(b.month));
};

export const monthlyMarketPriceStatus = (record: MonthlyMarketPrice): MonthlyMarketPriceStatus => {
  if (record.forecastPtfTlMwh == null || record.forecastYekdemTlMwh == null)
    return 'forecast_missing';
  const actualCount =
    Number(record.actualPtfTlMwh != null) + Number(record.actualYekdemTlMwh != null);
  if (actualCount === 0) return 'forecast_ready';
  return actualCount === 2 ? 'actual_complete' : 'actual_partial';
};

export const MONTHLY_MARKET_PRICE_STATUS_LABELS: Record<MonthlyMarketPriceStatus, string> = {
  forecast_missing: 'Tahmin eksik',
  forecast_ready: 'Tahmin hazır',
  actual_partial: 'Gerçekleşen kısmen girildi',
  actual_complete: 'Gerçekleşen tamamlandı',
};

export const marketPriceSourceLabel = (
  source: MarketPriceSource | undefined,
  context: 'planned' | 'realization' = 'planned',
): string => {
  if (source === 'actual') return 'Gerçekleşen';
  if (source === 'manual_override') return 'Manuel senaryo override';
  if (source === 'forecast') return context === 'realization' ? 'Tahmin fallback' : 'Tahmin';
  return 'Eski kayıt';
};

export const listContractMonths = (usageStart: string, usageEnd: string): string[] => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(usageStart) || !/^\d{4}-\d{2}-\d{2}$/.test(usageEnd)) return [];
  const [startYear, startMonth] = usageStart.split('-').map(Number);
  const [endYear, endMonth] = usageEnd.split('-').map(Number);
  if (
    startYear == null ||
    startMonth == null ||
    endYear == null ||
    endMonth == null ||
    usageEnd < usageStart
  )
    return [];
  const result: string[] = [];
  let year = startYear;
  let month = startMonth;
  for (let iteration = 0; iteration < 1200; iteration += 1) {
    result.push(`${year}-${String(month).padStart(2, '0')}`);
    if (year === endYear && month === endMonth) return result;
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  throw new Error('Sözleşme ayları güvenli iterasyon sınırını aştı.');
};

export const resolveForecastMarketPrices = (
  months: string[],
  records: MonthlyMarketPrice[] | undefined,
  legacyPtfTlMwh: number,
  legacyYekdemTlMwh: number,
): ForecastMarketPriceResolution => {
  if (records === undefined)
    return {
      values: months.map((month) => ({
        month,
        ptfUnitPrice: legacyPtfTlMwh,
        yekdemUnitPrice: legacyYekdemTlMwh,
        ptfPriceSource: 'legacy',
        yekdemPriceSource: 'legacy',
      })),
      errors: [],
    };

  const byMonth = new Map(records.map((record) => [record.month, record]));
  const errors: string[] = [];
  const values: MarketPriceSnapshot[] = [];
  for (const month of months) {
    const record = byMonth.get(month);
    if (record?.forecastPtfTlMwh == null) errors.push(`- ${month}: Tahmini PTF`);
    if (record?.forecastYekdemTlMwh == null) errors.push(`- ${month}: Tahmini YEKDEM`);
    if (record?.forecastPtfTlMwh != null && record.forecastYekdemTlMwh != null)
      values.push({
        month,
        ptfUnitPrice: record.forecastPtfTlMwh,
        yekdemUnitPrice: record.forecastYekdemTlMwh,
        ptfPriceSource: 'forecast',
        yekdemPriceSource: 'forecast',
      });
  }
  return {
    values,
    errors: errors.length > 0 ? ['Aşağıdaki dönemlerin piyasa tahmini eksik:', ...errors] : [],
  };
};

const sourceLabel = (source: MarketPriceSource | undefined): MarketPriceSource =>
  source === 'legacy' ? 'legacy' : 'forecast';

export interface RealizationMarketPriceResolution extends MarketPriceSnapshot {
  warnings: string[];
}

export const resolveRealizationMarketPrice = (
  period: BillingPeriod,
  records: MonthlyMarketPrice[],
  asOfDate: string,
  override: PeriodRealizationOverride | undefined,
  legacyPtfTlMwh: number,
  legacyYekdemTlMwh: number,
): RealizationMarketPriceResolution => {
  const month = period.marketPriceMonth ?? period.start.slice(0, 7);
  const record = records.find((candidate) => candidate.month === month);
  const actualAllowed = month <= asOfDate.slice(0, 7);
  const warnings: string[] = [];

  const resolveComponent = (
    kind: 'PTF' | 'YEKDEM',
    manualValue: number | undefined,
    actualValue: number | null | undefined,
    forecastValue: number | undefined,
    legacyValue: number,
    plannedSource: MarketPriceSource | undefined,
  ): { value: number; source: MarketPriceSource } => {
    if (manualValue != null && Number.isFinite(manualValue))
      return { value: manualValue, source: 'manual_override' };
    if (actualAllowed && actualValue != null) return { value: actualValue, source: 'actual' };
    if (actualAllowed)
      warnings.push(
        `${month} gerçekleşen ${kind} girilmedi. Tahmini değer kullanıldığı için sonuç geçicidir.`,
      );
    else warnings.push(`${month} henüz gerçekleşme döneminde değil. Tahmini ${kind} kullanıldı.`);
    return {
      value: forecastValue ?? legacyValue,
      source: sourceLabel(plannedSource),
    };
  };

  const ptf = resolveComponent(
    'PTF',
    override?.ptfUnitPrice,
    record?.actualPtfTlMwh,
    period.ptfUnitPrice,
    legacyPtfTlMwh,
    period.ptfPriceSource,
  );
  const yekdem = resolveComponent(
    'YEKDEM',
    override?.yekdemUnitPrice,
    record?.actualYekdemTlMwh,
    period.yekdemUnitPrice,
    legacyYekdemTlMwh,
    period.yekdemPriceSource,
  );
  return {
    month,
    ptfUnitPrice: ptf.value,
    yekdemUnitPrice: yekdem.value,
    ptfPriceSource: ptf.source,
    yekdemPriceSource: yekdem.source,
    warnings,
  };
};

export const marketPriceRecordsFromSnapshot = (
  snapshot: MarketPriceSnapshot[] | undefined,
): MonthlyMarketPrice[] | undefined =>
  snapshot?.map((record) => ({
    month: record.month,
    forecastPtfTlMwh: record.ptfUnitPrice,
    actualPtfTlMwh: null,
    forecastYekdemTlMwh: record.yekdemUnitPrice,
    actualYekdemTlMwh: null,
    updatedAt: '',
  }));
