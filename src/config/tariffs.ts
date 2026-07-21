export interface TariffProfile {
  key: string;
  label: string;
  tariffType: 'Çift Terimli OG' | 'Tek Terimli OG' | 'Tek Terimli AG';
  subscriberGroup: 'Sanayi' | 'Ticarethane' | 'Mesken' | 'Tarımsal Sulama';
  kdvDefault: number;
  btvDefault: number;
  distributionTlMwh: number;
}

export const TARIFFS: TariffProfile[] = [
  {
    key: 'cift-terimli-og-sanayi',
    label: 'Çift Terimli OG · Sanayi',
    tariffType: 'Çift Terimli OG',
    subscriberGroup: 'Sanayi',
    kdvDefault: 20,
    btvDefault: 1,
    distributionTlMwh: 1070.498,
  },
  {
    key: 'cift-terimli-og-ticarethane',
    label: 'Çift Terimli OG · Ticarethane',
    tariffType: 'Çift Terimli OG',
    subscriberGroup: 'Ticarethane',
    kdvDefault: 20,
    btvDefault: 5,
    distributionTlMwh: 1668.345,
  },
  {
    key: 'cift-terimli-og-mesken',
    label: 'Çift Terimli OG · Mesken',
    tariffType: 'Çift Terimli OG',
    subscriberGroup: 'Mesken',
    kdvDefault: 10,
    btvDefault: 5,
    distributionTlMwh: 1652.488,
  },
  {
    key: 'cift-terimli-og-tarimsal-sulama',
    label: 'Çift Terimli OG · Tarımsal Sulama',
    tariffType: 'Çift Terimli OG',
    subscriberGroup: 'Tarımsal Sulama',
    kdvDefault: 10,
    btvDefault: 1,
    distributionTlMwh: 1374.008,
  },
  {
    key: 'tek-terimli-og-sanayi',
    label: 'Tek Terimli OG · Sanayi',
    tariffType: 'Tek Terimli OG',
    subscriberGroup: 'Sanayi',
    kdvDefault: 20,
    btvDefault: 1,
    distributionTlMwh: 1182.457,
  },
  {
    key: 'tek-terimli-og-ticarethane',
    label: 'Tek Terimli OG · Ticarethane',
    tariffType: 'Tek Terimli OG',
    subscriberGroup: 'Ticarethane',
    kdvDefault: 20,
    btvDefault: 5,
    distributionTlMwh: 2081.065,
  },
  {
    key: 'tek-terimli-og-mesken',
    label: 'Tek Terimli OG · Mesken',
    tariffType: 'Tek Terimli OG',
    subscriberGroup: 'Mesken',
    kdvDefault: 10,
    btvDefault: 5,
    distributionTlMwh: 2040.402,
  },
  {
    key: 'tek-terimli-og-tarimsal-sulama',
    label: 'Tek Terimli OG · Tarımsal Sulama',
    tariffType: 'Tek Terimli OG',
    subscriberGroup: 'Tarımsal Sulama',
    kdvDefault: 10,
    btvDefault: 1,
    distributionTlMwh: 1710.785,
  },
  {
    key: 'tek-terimli-ag-sanayi',
    label: 'Tek Terimli AG · Sanayi',
    tariffType: 'Tek Terimli AG',
    subscriberGroup: 'Sanayi',
    kdvDefault: 20,
    btvDefault: 1,
    distributionTlMwh: 1829.503,
  },
  {
    key: 'tek-terimli-ag-ticarethane',
    label: 'Tek Terimli AG · Ticarethane',
    tariffType: 'Tek Terimli AG',
    subscriberGroup: 'Ticarethane',
    kdvDefault: 20,
    btvDefault: 5,
    distributionTlMwh: 2479.368,
  },
  {
    key: 'tek-terimli-ag-mesken',
    label: 'Tek Terimli AG · Mesken',
    tariffType: 'Tek Terimli AG',
    subscriberGroup: 'Mesken',
    kdvDefault: 10,
    btvDefault: 5,
    distributionTlMwh: 2424.9,
  },
  {
    key: 'tek-terimli-ag-tarimsal-sulama',
    label: 'Tek Terimli AG · Tarımsal Sulama',
    tariffType: 'Tek Terimli AG',
    subscriberGroup: 'Tarımsal Sulama',
    kdvDefault: 10,
    btvDefault: 1,
    distributionTlMwh: 2037.247,
  },
];

export const getTariff = (key: string): TariffProfile =>
  TARIFFS.find((tariff) => tariff.key === key) ?? TARIFFS[8]!;

export const applyTariffDefaults = (key: string, hasDistribution = true) => {
  const tariff = getTariff(key);
  return {
    customerType: tariff.key,
    kdvRate: tariff.kdvDefault,
    btvRate: tariff.btvDefault,
    distributionUnitTlMwh: hasDistribution ? tariff.distributionTlMwh : 0,
  };
};
