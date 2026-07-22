export type ISODate = string;
export type EnergyUnit = 'MWh' | 'kWh';
export type RecordType = 'cost_draft' | 'planned_offer';
export type PaymentChannel =
  | 'cash'
  | 'eft'
  | 'bank_transfer'
  | 'automatic_payment'
  | 'credit_card_single'
  | 'credit_card_installment'
  | 'dbs'
  | 'other';
export type PaymentScope =
  'each_period' | 'first_period' | 'last_period' | 'selected_periods' | 'contract_once';
export type PaymentAmountType =
  | 'period_invoice_percent'
  | 'period_fixed_tl'
  | 'period_remaining_balance'
  | 'contract_total_percent'
  | 'contract_fixed_tl';
export type PaymentDateReference =
  | 'usage_start'
  | 'usage_end'
  | 'period_start'
  | 'period_end'
  | 'invoice_date'
  | 'fixed_day'
  | 'manual_date';
export type GesMode = 'simple_self_consumption' | 'advanced_metering';
export type MarketPriceSource = 'forecast' | 'actual' | 'legacy' | 'manual_override';
export type CommissionBearer = 'epsas' | 'customer';
export type ReconciliationStatus = 'reconciled' | 'difference' | 'not_calculated';

export interface MonthlyMarketPrice {
  month: string;
  forecastPtfTlMwh: number | null;
  actualPtfTlMwh: number | null;
  forecastYekdemTlMwh: number | null;
  actualYekdemTlMwh: number | null;
  sourceNote?: string;
  actualizedAt?: string;
  updatedAt: string;
}

export interface MarketPriceSnapshot {
  month: string;
  ptfUnitPrice: number;
  yekdemUnitPrice: number;
  ptfPriceSource: MarketPriceSource;
  yekdemPriceSource: MarketPriceSource;
}

export interface Customer {
  id: string;
  name: string;
  note?: string;
  tag?: string;
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
}

export interface GesSettings {
  mode: GesMode;
  selfConsumptionRate: number;
  totalProductionMwh?: number;
  simultaneousSelfConsumptionMwh?: number;
  gridImportMwh?: number;
  gridExportMwh?: number;
  excessAfterNettingMwh?: number;
  excessPurchasePrice?: number;
  priceType?: 'regulated' | 'ptf' | 'ptf_yekdem' | 'manual';
  nettingMethod?: 'monthly' | 'hourly' | 'manual';
  excessProductionTaxMode?: 'manual' | 'no_tax_in_demo';
  manualTaxAmountTl?: number;
  settlementMode?: 'cash_outflow' | 'invoice_offset';
  excessPurchasePaymentOffsetDays?: number;
}

export interface TariffVersion {
  id: string;
  customerType: string;
  validFrom: ISODate;
  validTo?: ISODate;
  kdvRate: number;
  btvRate: number;
  distributionUnitTlMwh: number;
  sourceLabel: string;
  versionLabel: string;
  active: boolean;
  updatedAt: string;
}

export interface TariffPeriodOverride {
  month: string;
  kdvRate: number;
  btvRate: number;
  distributionUnitTlMwh: number;
  reason: string;
}

export interface TariffSnapshot {
  tariffId?: string;
  versionLabel: string;
  validFrom?: ISODate;
  validTo?: ISODate;
  kdvRate: number;
  btvRate: number;
  distributionUnitTlMwh: number;
  sourceLabel: string;
  manualOverride: boolean;
  overrideReason?: string;
}

export interface PaymentPlanRow {
  id: string;
  order: number;
  enabled: boolean;
  name: string;
  applicationScope: PaymentScope;
  selectedPeriods: number[];
  amountType: PaymentAmountType;
  amountValue: number;
  dateReference: PaymentDateReference;
  dayOffset: number;
  fixedDay: number;
  fixedDayMonthOffset: number;
  manualDate?: ISODate;
  paymentChannel: PaymentChannel;
  installmentCount: number;
  installmentIntervalDays: number;
  merchantSettlementMode: 'upfront_net' | 'installment_settlement';
  bankSettlementDelayDays: number;
  commissionRate: number;
  commissionBearer: 'epsas' | 'customer';
  note?: string;
}

export interface ReconciliationSettings {
  enabled: boolean;
  reference: 'invoice_date' | 'period_end' | 'usage_end';
  offsetDays: number;
  overpaymentAction: 'carry_forward' | 'refund_after_days' | 'refund_at_contract_end';
  refundOffsetDays: number;
  underpaymentAction: 'collect_after_days' | 'carry_to_next_invoice' | 'leave_open';
  collectionOffsetDays: number;
  collectionChannel: PaymentChannel;
  collectionCommissionRate: number;
  collectionCommissionBearer: 'epsas' | 'customer';
}

export interface PaymentPlan {
  version: 1;
  id: string;
  name: string;
  templateId: string;
  mode: 'template' | 'custom';
  rows: PaymentPlanRow[];
  reconciliation: ReconciliationSettings;
}

export interface OfferState {
  customerId: string;
  title: string;
  usageStart: ISODate;
  usageEnd: ISODate;
  monthlyConsumption: number;
  monthlyConsumptionUnit: EnergyUnit;
  customerType: string;
  kdvRate: number;
  btvRate: number;
  distributionUnitTlMwh: number;
  hasDistribution: boolean;
  contractPowerTl: number;
  ptfTlMwh: number;
  yekdemTlMwh: number;
  offerRate?: number;
  imbalanceRate: number;
  piuRate: number;
  creditRate: number;
  valorRate: number;
  yekdemDueOffset: number;
  distributionDueOffset: number;
  kdvDueOffset: number;
  btvDueOffset: number;
  ges: GesSettings;
  paymentPlan: PaymentPlan;
  tariffOverrides?: TariffPeriodOverride[];
}

export interface BillingPeriod {
  id: string;
  index: number;
  start: ISODate;
  end: ISODate;
  invoiceDate: ISODate;
  days: number;
  monthFactor: number;
  share: number;
  grossConsumptionMwh: number;
  gesSelfConsumptionMwh: number;
  gridConsumptionMwh: number;
  activeEnergyUnitPrice: number;
  ptfAmount: number;
  yekdemAmount: number;
  activeEnergyBaseAmount: number;
  offerMargin: number;
  activeEnergySalesAmount: number;
  distributionAmount: number;
  contractPowerAmount: number;
  btvBase: number;
  btvAmount: number;
  kdvBase: number;
  kdvAmount: number;
  grossInvoice: number;
  gesSelfConsumptionSavings: number;
  imbalanceAmount: number;
  piuAmount: number;
  gridExportMwh?: number;
  excessProductionMwh?: number;
  excessPurchasePrice?: number;
  excessPurchaseAmount?: number;
  marketPriceMonth?: string;
  ptfUnitPrice?: number;
  yekdemUnitPrice?: number;
  ptfPriceSource?: MarketPriceSource;
  yekdemPriceSource?: MarketPriceSource;
  tariffSnapshot?: TariffSnapshot;
}

export type ReconciliationInstructionType =
  | 'carry_advance_forward'
  | 'refund_customer'
  | 'supplemental_collection'
  | 'carry_receivable_forward'
  | 'leave_receivable_open';

export interface ReconciliationInstruction {
  id: string;
  periodId: string;
  type: ReconciliationInstructionType;
  referenceDate: ISODate;
  scheduledDate?: ISODate;
  amount: number;
  sourcePeriodId?: string;
  targetPeriodId?: string;
  applicationDate?: ISODate;
  paymentChannel?: PaymentChannel;
  commissionRate?: number;
  commissionBearer?: CommissionBearer;
  source: 'planned';
  note: string;
}

export interface AdvanceApplication {
  id: string;
  advanceLotId: string;
  sourcePaymentId: string;
  sourcePeriodId?: string;
  targetInvoiceId: string;
  targetPeriodId: string;
  applicationDate: ISODate;
  amount: number;
}

export interface CustomerAdvanceLot {
  id: string;
  sourcePaymentId: string;
  sourcePeriodId?: string;
  availableDate: ISODate;
  originalAmount: number;
  appliedAmount: number;
  remainingAmount: number;
  applications: AdvanceApplication[];
}

export interface CashEvent {
  id: string;
  date: ISODate;
  rawDate?: ISODate;
  type:
    | 'ptf'
    | 'yekdem'
    | 'distribution'
    | 'contract_power'
    | 'btv'
    | 'kdv'
    | 'customer_payment'
    | 'customer_refund'
    | 'excess_production_purchase'
    | 'late_fee_payment';
  direction: 'in' | 'out';
  amount: number;
  periodId?: string;
  label: string;
  note?: string;
  channelCost?: number;
  principalAmount?: number;
}

export interface PlannedPayment {
  id: string;
  periodId?: string;
  planRowId: string;
  planRowName: string;
  transactionDate: ISODate;
  settlementDate: ISODate;
  paymentChannel: PaymentChannel;
  commissionRate?: number;
  commissionBearer?: CommissionBearer;
  principalAmount: number;
  epsasChannelCost: number;
  customerChannelFee: number;
  netCashIn: number;
  installmentNo: number;
  installmentCount: number;
  note?: string;
}

export interface DailyCashflowRow {
  date: ISODate;
  openingBalance: number;
  supplierOutflows: number;
  customerInflows: number;
  lateFeeInflows: number;
  refunds: number;
  paymentChannelCosts: number;
  balanceAfterOutflows: number;
  interestBase: number;
  creditInterest: number;
  valorInterest: number;
  closingBalance: number;
  notes: string[];
}

export interface DailyCashflowOptions {
  calculationStartDate?: ISODate;
  calculationEndDate?: ISODate;
}

export type ProfitComponent =
  | 'offer_margin'
  | 'imbalance'
  | 'piu'
  | 'payment_channel_cost'
  | 'credit_interest'
  | 'valor_income'
  | 'excess_production_purchase'
  | 'late_fee_income';

export interface ProfitLedgerEntry {
  id: string;
  component: ProfitComponent;
  economicMonth: string;
  amount: number;
  direction: 'income' | 'cost';
  periodId?: string;
  sourceId?: string;
  note?: string;
}

export interface MonthlyProfitRow {
  month: string;
  consumptionMwh: number;
  activeEnergySalesRevenue: number;
  offerMargin: number;
  imbalance: number;
  piu: number;
  channelCost: number;
  creditInterest: number;
  valorIncome: number;
  lateFeeIncome: number;
  excessProductionPurchase: number;
  supplierOutflows: number;
  refunds: number;
  lateFeeCashInflows: number;
  cashCreditInterest: number;
  cashValorIncome: number;
  financingAllocationMethod: string;
  reconciliationDifference: number;
  accrualProfit: number;
  cashInflows: number;
  cashOutflows: number;
  cashResult: number;
}

export interface CalculationTotals {
  grossConsumptionMwh: number;
  gesSelfConsumptionMwh: number;
  gridConsumptionMwh: number;
  ptfAmount: number;
  yekdemAmount: number;
  activeEnergyBaseAmount: number;
  offerMargin: number;
  activeEnergySalesAmount: number;
  distributionAmount: number;
  contractPowerAmount: number;
  btvAmount: number;
  kdvAmount: number;
  grossInvoice: number;
  gesSelfConsumptionSavings: number;
  excessProductionPurchase: number;
  imbalanceAmount: number;
  piuAmount: number;
  paymentChannelCost: number;
  creditCost: number;
  valorIncome: number;
  operationalCost: number;
  financingIncludedCost: number;
  netProfit: number;
  netProfitRate: number;
  profitPerMwh: number;
  unitSupplyCost: number;
  breakevenUnitPrice: number;
  breakevenOfferRate: number;
  customerAdvantage: number;
}

export interface CalculationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  policyVersion: string;
  calculatedAt: string;
  state: OfferState;
  periods: BillingPeriod[];
  plannedPayments: PlannedPayment[];
  cashEvents: CashEvent[];
  plannedCashflow: DailyCashflowRow[];
  monthlyProfit: MonthlyProfitRow[];
  profitLedger: ProfitLedgerEntry[];
  financingStartDate?: ISODate;
  financingEndDate?: ISODate;
  endingCashBalance: number;
  openFinancingBalance: number;
  effectiveCreditRate: number;
  effectiveValorRate: number;
  profitReconciliationDifference?: number;
  cashReconciliationDifference?: number;
  totals: CalculationTotals;
  marketPriceSnapshot?: MarketPriceSnapshot[];
  reconciliationInstructions?: ReconciliationInstruction[];
  endingCustomerAdvance?: number;
  endingOpenReceivable?: number;
}

export interface CostDraft {
  id: string;
  recordType: 'cost_draft';
  customerId: string;
  title: string;
  state: OfferState;
  paymentPlan: PaymentPlan;
  resultSnapshot: CalculationResult;
  createdAt: string;
  updatedAt: string;
}

export interface PlannedOffer {
  id: string;
  recordType: 'planned_offer';
  customerId: string;
  version: number;
  parentOfferId?: string;
  title: string;
  status: 'draft' | 'final' | 'archived';
  stateSnapshot: OfferState;
  paymentPlanSnapshot: PaymentPlan;
  resultSnapshot: CalculationResult;
  legacySnapshot?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ActualPayment {
  id: string;
  invoiceId?: string;
  receivableInstallmentId?: string;
  date: ISODate;
  amount: number;
  channel: PaymentChannel;
  commissionRate?: number;
  commissionBearer?: CommissionBearer;
  note?: string;
}

export interface ActualCustomerRefund {
  id: string;
  date: ISODate;
  amount: number;
  sourcePeriodId?: string;
  note?: string;
}

export interface ActualPaymentFinancials {
  paymentId: string;
  principalAmount: number;
  commissionRate: number;
  commissionBearer: CommissionBearer;
  epsasChannelCost: number;
  customerChannelFee: number;
  netCashIn: number;
}

export interface RealizationFinancingOverrides {
  creditRate?: number;
  valorRate?: number;
}

export interface ReceivablePaymentAllocation {
  paymentId: string;
  receivableInstallmentId: string;
  invoiceId: string;
  periodId: string;
  date: ISODate;
  amount: number;
}

export interface ReceivableInstallment {
  id: string;
  invoiceId: string;
  periodId: string;
  periodIndex: number;
  invoiceDate?: ISODate;
  carriedToPeriodId?: string;
  carriedApplicationDate?: ISODate;
  sourcePlannedPaymentId?: string;
  principalAmount: number;
  dueDate: ISODate;
  collectedAmount: number;
  advanceAppliedAmount?: number;
  outstandingPrincipal: number;
  allocations: ReceivablePaymentAllocation[];
  advanceApplications?: AdvanceApplication[];
}

export interface ReceivableLedger {
  asOfDate: ISODate;
  installments: ReceivableInstallment[];
  allocations: ReceivablePaymentAllocation[];
  totalPaymentsAsOf: number;
  totalCollectedPrincipal: number;
  totalAdvanceApplied: number;
  totalOutstandingPrincipal: number;
  customerAdvance: number;
  advanceLots: CustomerAdvanceLot[];
  advanceApplications: AdvanceApplication[];
}

export interface PeriodRealizationOverride {
  periodId: string;
  /** @deprecated Sözleşme bakiyesi ortaktır; financingOverrides kullanılır. */
  creditRate?: number;
  /** @deprecated Sözleşme bakiyesi ortaktır; financingOverrides kullanılır. */
  valorRate?: number;
  scenarioOfferRate?: number;
  calculationDate?: ISODate;
  ptfUnitPrice?: number;
  yekdemUnitPrice?: number;
}

export interface LateFeeSegment {
  receivableInstallmentId?: string;
  startDate: ISODate;
  endDate: ISODate;
  days: number;
  principal: number;
  lateFee: number;
}

export interface ReceivableInstallmentDelinquency {
  receivableInstallmentId: string;
  invoiceId: string;
  dueDate: ISODate;
  principalAmount: number;
  collectedAmount: number;
  outstandingPrincipal: number;
  delayDays: number;
  segments: LateFeeSegment[];
  lateFee: number;
  sourceVatRate: number;
  lateFeeVat: number;
  totalLateFeeReceivable: number;
}

export interface InvoiceDelinquency {
  invoiceId: string;
  outstandingPrincipal: number;
  delayDays: number;
  segments: LateFeeSegment[];
  installments: ReceivableInstallmentDelinquency[];
  lateFee: number;
  lateFeeVat: number;
  totalLateFeeReceivable: number;
}

export interface InvoiceCarryoverLine {
  id: string;
  kind: 'late_fee' | 'late_fee_vat';
  label: 'Önceki Dönem Gecikme Bedeli' | 'Önceki Dönem Gecikme Bedeli KDV’si';
  amount: number;
  sourceDocumentIds: string[];
  taxableAgain: false;
  createsLateFee: false;
  includedInBtvBase: false;
  includedInKdvBase: false;
}

export interface LateFeeAccrualDocument {
  id: string;
  title: 'Gecikme Bedeli Tahakkuku' | 'Nihai Gecikme Bedeli Faturası';
  kind: 'monthly_carryover' | 'final_late_fee_invoice';
  sourceCustomerId: string;
  sourceOfferId: string;
  sourceScenarioId: string;
  sourceInvoiceId: string;
  sourceReceivableInstallmentId: string;
  carryToPeriodId?: string;
  issueDate: ISODate;
  calculationStartDate: ISODate;
  calculationEndDate: ISODate;
  openPrincipal: number;
  sourceVatRate: number;
  lineItems: InvoiceCarryoverLine[];
  lateFee: number;
  lateFeeVat: number;
  totalAmount: number;
}

export interface RealizationInvoiceSummary {
  periodId: string;
  activeEnergyInvoiceTotal: number;
  btvBase: number;
  btvAmount: number;
  kdvBase: number;
  kdvAmount: number;
  carryoverLines: InvoiceCarryoverLine[];
  carryoverTotal: number;
  totalPayable: number;
}

export interface PeriodRealizationResult {
  periodId: string;
  plannedInvoice: number;
  plannedDueDate?: ISODate;
  receivableInstallments: ReceivableInstallment[];
  invoiceSummary: RealizationInvoiceSummary;
  actualPayments: ActualPayment[];
  outstandingPrincipal: number;
  delayDays: number;
  lateFee: number;
  lateFeeVat: number;
  actualOfferMargin: number;
  actualImbalance: number;
  actualPiu: number;
  actualPaymentChannelCost: number;
  actualExcessProductionPurchase: number;
  actualCreditCost: number;
  actualValorIncome: number;
  lateFeeIncome: number;
  scenarioOfferRate: number;
  plannedNetProfit: number;
  actualNetProfit: number;
  variance: number;
  delinquency: InvoiceDelinquency;
  marketPriceMonth?: string;
  ptfUnitPrice?: number;
  yekdemUnitPrice?: number;
  ptfPriceSource?: MarketPriceSource;
  yekdemPriceSource?: MarketPriceSource;
  marketPriceWarnings?: string[];
}

export interface RealizationResult {
  periods: PeriodRealizationResult[];
  billingPeriods?: BillingPeriod[];
  receivableLedger: ReceivableLedger;
  lateFeeDocuments: LateFeeAccrualDocument[];
  finalLateFeeDocuments: LateFeeAccrualDocument[];
  actualCashflow: DailyCashflowRow[];
  monthlyProfit: MonthlyProfitRow[];
  profitLedger: ProfitLedgerEntry[];
  plannedProfit: number;
  actualProfit: number;
  variance: number;
  totalLateFee: number;
  totalLateFeeVat: number;
  endingOpenReceivable: number;
  actualPaymentFinancials: ActualPaymentFinancials[];
  actualPaymentChannelCost: number;
  actualExcessProductionPurchase: number;
  actualCreditCost: number;
  actualValorIncome: number;
  effectiveCreditRate: number;
  effectiveValorRate: number;
  financingStartDate?: ISODate;
  financingEndDate?: ISODate;
  endingCashBalance: number;
  openFinancingBalance: number;
  profitReconciliationDifference?: number;
  cashReconciliationDifference?: number;
  actualCashEvents?: CashEvent[];
  marketPriceWarnings?: string[];
  actualRefundTotal?: number;
}

export interface RealizationScenario {
  id: string;
  sourceCustomerId: string;
  sourceOfferId: string;
  sourceOfferVersion: number;
  sourceOfferSnapshot: PlannedOffer;
  name: string;
  asOfDate: ISODate;
  periodOverrides: PeriodRealizationOverride[];
  financingOverrides?: RealizationFinancingOverrides;
  actualPayments: ActualPayment[];
  actualRefunds?: ActualCustomerRefund[];
  resultSnapshot: RealizationResult;
  createdAt: string;
  updatedAt: string;
}

export interface LateFeeSettings {
  monthlyRate: number;
  dayBasis: 360;
  useInvoiceVatRate: true;
  compound: false;
  includeWeekendsAndHolidays: true;
}

export interface AppSettings {
  id: 'app';
  theme: 'light' | 'dark' | 'system';
  holidays: ISODate[];
  lateFee: LateFeeSettings;
  policyVersion: string;
  monthlyMarketPrices: MonthlyMarketPrice[];
  tariffVersions?: TariffVersion[];
  lastBackupAt?: string;
}

export type PaymentCalendarSourceType = 'planned_offer' | 'realization_scenario';

export interface PaymentCalendarRow {
  date: ISODate;
  dayLabel: string;
  consumptionMwh: number;
  ptfOutflow: number;
  yekdemOutflow: number;
  distributionOutflow: number;
  contractPowerOutflow: number;
  btvOutflow: number;
  kdvOutflow: number;
  excessProductionOutflow: number;
  customerGrossPrincipal: number;
  customerNetCashIn: number;
  lateFeeCashIn: number;
  customerRefund: number;
  paymentChannelCost: number;
  customerAdvance: number;
  openReceivable: number;
  paymentDescription: string;
  openingBalance: number;
  balanceAfterOutflows: number;
  interestBase: number;
  valorInterest: number;
  creditInterest: number;
  closingBalance: number;
  notes: string[];
}

export interface PaymentCalendarSummary {
  totalCustomerCashIn: number;
  totalLateFeeCashIn: number;
  totalCashOutflow: number;
  totalPaymentChannelCost: number;
  totalCreditCost: number;
  totalValorIncome: number;
  minimumBalance: number;
  maximumBalance: number;
  endingBalance: number;
  openReceivable: number;
  customerAdvance: number;
  calculationEndDate: ISODate;
  effectiveCreditRate: number;
  effectiveValorRate: number;
  totalExcessProductionPurchase: number;
  openFinancingBalance: number;
}

export interface PaymentCalendarModel {
  sourceType: PaymentCalendarSourceType;
  sourceId: string;
  sourceTitle: string;
  customerId: string;
  customerName: string;
  sourceVersion: number;
  calculationDate: string;
  policyVersion: string;
  priceSourceSummary: string;
  rows: PaymentCalendarRow[];
  summary: PaymentCalendarSummary;
}
