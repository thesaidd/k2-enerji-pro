import { DEFAULT_TARIFF_VERSIONS } from '../../config/tariffs';
import type {
  TariffPeriodOverride,
  TariffSnapshot,
  TariffVersion,
} from '../../types';

export interface TariffResolution {
  snapshot?: TariffSnapshot;
  error?: string;
}

const covers = (tariff: TariffVersion, start: string, end: string): boolean =>
  tariff.active && tariff.validFrom <= start && (!tariff.validTo || tariff.validTo >= end);

export const resolveTariffForPeriod = (
  customerType: string,
  start: string,
  end: string,
  versions: TariffVersion[] = DEFAULT_TARIFF_VERSIONS,
  overrides: TariffPeriodOverride[] = [],
): TariffResolution => {
  const month = start.slice(0, 7);
  const override = overrides.find((candidate) => candidate.month === month);
  if (override) {
    if (!override.reason.trim())
      return { error: `${month} manuel tarife override nedeni zorunludur.` };
    const source = versions.find(
      (candidate) => candidate.customerType === customerType && covers(candidate, start, end),
    );
    return {
      snapshot: {
        tariffId: source?.id,
        versionLabel: source?.versionLabel ?? 'manuel',
        validFrom: source?.validFrom,
        validTo: source?.validTo,
        kdvRate: override.kdvRate,
        btvRate: override.btvRate,
        distributionUnitTlMwh: override.distributionUnitTlMwh,
        sourceLabel: source?.sourceLabel ?? 'Manuel tarife override',
        sourceMode: 'explicit_override',
        manualOverride: true,
        overrideReason: override.reason.trim(),
      },
    };
  }

  const matches = versions.filter(
    (candidate) => candidate.customerType === customerType && covers(candidate, start, end),
  );
  if (matches.length === 1) {
    const tariff = matches[0]!;
    return {
      snapshot: {
        tariffId: tariff.id,
        versionLabel: tariff.versionLabel,
        validFrom: tariff.validFrom,
        validTo: tariff.validTo,
        kdvRate: tariff.kdvRate,
        btvRate: tariff.btvRate,
        distributionUnitTlMwh: tariff.distributionUnitTlMwh,
        sourceLabel: tariff.sourceLabel,
        sourceMode: 'catalog',
        manualOverride: false,
      },
    };
  }
  if (matches.length > 1)
    return { error: `${month} dönemi için birden fazla geçerli tarife bulundu.` };

  const boundary = versions.some(
    (candidate) =>
      candidate.active &&
      candidate.customerType === customerType &&
      ((candidate.validFrom > start && candidate.validFrom <= end) ||
        (candidate.validTo != null && candidate.validTo >= start && candidate.validTo < end)),
  );
  return {
    error: boundary
      ? `${month} döneminin içine tarife sınırı düşüyor. Dönemi bölün veya nedenli manuel override kullanın.`
      : `${month} dönemi için geçerli tarife bulunamadı. Nihai teklif oluşturulamaz.`,
  };
};

export const validateTariffPeriods = (
  customerType: string,
  periods: Array<{ start: string; end: string }>,
  versions: TariffVersion[] = DEFAULT_TARIFF_VERSIONS,
  overrides: TariffPeriodOverride[] = [],
): string[] =>
  periods.flatMap((period) => {
    const resolution = resolveTariffForPeriod(
      customerType,
      period.start,
      period.end,
      versions,
      overrides,
    );
    return resolution.error ? [resolution.error] : [];
  });

export const validateTariffVersions = (versions: TariffVersion[]): string[] => {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const tariff of versions) {
    if (ids.has(tariff.id)) errors.push(`Tarife versiyon kimliği yinelenemez: ${tariff.id}`);
    ids.add(tariff.id);
    if (tariff.validTo && tariff.validFrom > tariff.validTo)
      errors.push(`${tariff.id} için geçerlilik başlangıcı bitişten sonra olamaz.`);
  }
  const active = versions.filter((tariff) => tariff.active);
  for (let index = 0; index < active.length; index += 1) {
    for (let candidateIndex = index + 1; candidateIndex < active.length; candidateIndex += 1) {
      const left = active[index]!;
      const right = active[candidateIndex]!;
      if (left.customerType !== right.customerType) continue;
      const leftEnd = left.validTo ?? '9999-12-31';
      const rightEnd = right.validTo ?? '9999-12-31';
      if (left.validFrom <= rightEnd && right.validFrom <= leftEnd)
        errors.push(
          `${left.customerType} için aktif tarife dönemleri çakışıyor: ${left.id} / ${right.id}`,
        );
    }
  }
  return errors;
};
