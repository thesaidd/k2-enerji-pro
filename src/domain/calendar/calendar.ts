import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDaysInMonth,
  isWeekend,
  parseISO,
  setDate,
  startOfMonth,
} from 'date-fns';
import { EPSAS_PAYMENT_DAY_OFFSETS } from '../../config/calculationPolicy';
import type { BillingPeriod, ISODate } from '../../types';

export const toIsoDate = (date: Date): ISODate => format(date, 'yyyy-MM-dd');
export const fromIsoDate = (date: ISODate): Date => parseISO(date);
export const addIsoDays = (date: ISODate, days: number): ISODate =>
  toIsoDate(addDays(fromIsoDate(date), days));
export const daysBetween = (start: ISODate, end: ISODate): number =>
  differenceInCalendarDays(fromIsoDate(end), fromIsoDate(start));

const fixedHolidayKeys = new Set(['01-01', '04-23', '05-01', '05-19', '07-15', '08-30', '10-29']);

export const isBusinessDay = (date: ISODate, holidays: ISODate[] = []): boolean => {
  const parsed = fromIsoDate(date);
  return (
    !isWeekend(parsed) && !fixedHolidayKeys.has(format(parsed, 'MM-dd')) && !holidays.includes(date)
  );
};

export const adjustToBusinessDay = (date: ISODate, holidays: ISODate[] = []): ISODate => {
  let candidate = date;
  while (!isBusinessDay(candidate, holidays)) candidate = addIsoDays(candidate, 1);
  return candidate;
};

export const epiasPaymentDate = (deliveryDate: ISODate, holidays: ISODate[] = []): ISODate => {
  const weekday = fromIsoDate(deliveryDate).getDay();
  return adjustToBusinessDay(
    addIsoDays(deliveryDate, EPSAS_PAYMENT_DAY_OFFSETS[weekday] ?? 2),
    holidays,
  );
};

export interface PeriodSeed {
  id: string;
  index: number;
  start: ISODate;
  end: ISODate;
  invoiceDate: ISODate;
  days: number;
  monthFactor: number;
  share: number;
  grossConsumptionMwh: number;
}

export const generateBillingPeriods = (
  usageStart: ISODate,
  usageEnd: ISODate,
  monthlyConsumptionMwh: number,
): PeriodSeed[] => {
  const start = fromIsoDate(usageStart);
  const end = fromIsoDate(usageEnd);
  if (end < start) return [];
  const raw: Omit<PeriodSeed, 'share'>[] = [];
  let cursor = start;
  let index = 1;
  while (cursor <= end) {
    const periodEnd = endOfMonth(cursor) < end ? endOfMonth(cursor) : end;
    const days = differenceInCalendarDays(periodEnd, cursor) + 1;
    const monthFactor = days / getDaysInMonth(cursor);
    raw.push({
      id: `period_${index}`,
      index,
      start: toIsoDate(cursor),
      end: toIsoDate(periodEnd),
      invoiceDate: toIsoDate(periodEnd),
      days,
      monthFactor,
      grossConsumptionMwh: monthlyConsumptionMwh * monthFactor,
    });
    cursor = addDays(periodEnd, 1);
    index += 1;
  }
  const total = raw.reduce((sum, period) => sum + period.grossConsumptionMwh, 0);
  return raw.map((period) => ({
    ...period,
    share: total > 0 ? period.grossConsumptionMwh / total : 0,
  }));
};

export const resolvePaymentDate = (
  reference: string,
  period: Pick<BillingPeriod, 'start' | 'end' | 'invoiceDate'>,
  usageStart: ISODate,
  usageEnd: ISODate,
  dayOffset: number,
  fixedDay: number,
  fixedDayMonthOffset: number,
  manualDate: ISODate | undefined,
  holidays: ISODate[] = [],
): ISODate => {
  let date: Date;
  if (reference === 'usage_start') date = fromIsoDate(usageStart);
  else if (reference === 'usage_end') date = fromIsoDate(usageEnd);
  else if (reference === 'period_start') date = fromIsoDate(period.start);
  else if (reference === 'period_end') date = fromIsoDate(period.end);
  else if (reference === 'manual_date' && manualDate) date = fromIsoDate(manualDate);
  else if (reference === 'fixed_day') {
    const targetMonth = addMonths(
      startOfMonth(fromIsoDate(period.invoiceDate)),
      fixedDayMonthOffset,
    );
    date = setDate(targetMonth, Math.min(Math.max(fixedDay, 1), getDaysInMonth(targetMonth)));
  } else date = fromIsoDate(period.invoiceDate);
  return adjustToBusinessDay(toIsoDate(addDays(date, dayOffset)), holidays);
};

export const contractDays = (start: ISODate, end: ISODate): ISODate[] =>
  eachDayOfInterval({ start: fromIsoDate(start), end: fromIsoDate(end) }).map(toIsoDate);
