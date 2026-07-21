import { DEFAULT_OFFER_STATE } from '../config/defaults';
import { createPaymentPlan } from '../config/paymentPlans';
import type { OfferState } from '../types';

export const oneMwhState = (patch: Partial<OfferState> = {}): OfferState => ({
  ...structuredClone(DEFAULT_OFFER_STATE),
  usageStart: '2026-07-01',
  usageEnd: '2026-07-01',
  monthlyConsumption: 31,
  monthlyConsumptionUnit: 'MWh',
  paymentPlan: createPaymentPlan('standard_deferred'),
  offerRate: 0,
  ...patch,
});
