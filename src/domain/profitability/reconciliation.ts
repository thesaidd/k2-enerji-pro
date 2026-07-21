import type { ReconciliationStatus } from '../../types';

export const RECONCILIATION_TOLERANCE = 1e-6;

export const resolveReconciliationStatus = (
  profitDifference: unknown,
  cashDifference: unknown,
  tolerance = RECONCILIATION_TOLERANCE,
): ReconciliationStatus => {
  if (
    typeof profitDifference !== 'number' ||
    !Number.isFinite(profitDifference) ||
    typeof cashDifference !== 'number' ||
    !Number.isFinite(cashDifference)
  )
    return 'not_calculated';

  const absoluteTolerance = Math.abs(tolerance);
  return Math.abs(profitDifference) <= absoluteTolerance &&
    Math.abs(cashDifference) <= absoluteTolerance
    ? 'reconciled'
    : 'difference';
};
