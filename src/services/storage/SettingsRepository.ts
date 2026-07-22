import { DEFAULT_SETTINGS } from '../../config/defaults';
import { normalizeMonthlyMarketPrices } from '../../domain/market-prices/marketPrices';
import { appSettingsSchema } from '../../domain/validation/schemas';
import { validateTariffVersions } from '../../domain/tariff/tariff';
import { db } from './database';
import type { AppSettings } from '../../types';

export const normalizeAppSettings = (input: unknown): AppSettings => {
  const source = input && typeof input === 'object' ? (input as Partial<AppSettings>) : {};
  const tariffVersions = (
    Array.isArray(source.tariffVersions)
      ? structuredClone(source.tariffVersions)
      : structuredClone(DEFAULT_SETTINGS.tariffVersions ?? [])
  ).map((tariff) => ({
    ...tariff,
    validTo:
      tariff.validTo ??
      (tariff.sourceLabel === '2026 demo referans tarife tablosu'
        ? '2026-12-31'
        : undefined),
  }));
  const candidate = {
    ...structuredClone(DEFAULT_SETTINGS),
    ...structuredClone(source),
    id: 'app' as const,
    lateFee: {
      ...structuredClone(DEFAULT_SETTINGS.lateFee),
      ...structuredClone(source.lateFee ?? {}),
    },
    monthlyMarketPrices: normalizeMonthlyMarketPrices(source.monthlyMarketPrices ?? []),
    tariffVersions,
  };
  const parsed = appSettingsSchema.safeParse(candidate);
  if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => issue.message).join(' '));
  const tariffErrors = validateTariffVersions(parsed.data.tariffVersions ?? []);
  if (tariffErrors.length > 0) throw new Error(tariffErrors.join(' '));
  return parsed.data;
};

export const SettingsRepository = {
  get: async (): Promise<AppSettings> => normalizeAppSettings(await db.settings.get('app')),
  save: async (settings: AppSettings): Promise<AppSettings> => {
    const normalized = normalizeAppSettings(settings);
    await db.settings.put(structuredClone(normalized));
    return normalized;
  },
};
