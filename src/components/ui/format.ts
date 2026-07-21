export const formatMoney = (value: number, digits = 2): string =>
  new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);

export const formatNumber = (value: number, digits = 2): string =>
  new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);

export const formatPercent = (value: number, fraction = false): string =>
  `%${formatNumber(fraction ? value * 100 : value, 2)}`;

export const formatDate = (value?: string): string =>
  value ? new Intl.DateTimeFormat('tr-TR').format(new Date(`${value.slice(0, 10)}T00:00:00`)) : '—';

export const finite = (value: string, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
