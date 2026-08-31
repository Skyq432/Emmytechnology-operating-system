export type SalesAuthorityLevel = 'salesperson' | 'manager' | 'admin';
export type CostBasisSource = 'serialized_unit' | 'inventory_average' | 'product_default' | 'supplier_on_demand';
export type MarginPolicySource = 'product' | 'category' | 'company';

export interface MarginResolutionInput {
  productMargin?: number | null;
  categoryMargin?: number | null;
  companyMargin: number;
}

export interface MarginResolution {
  margin: number;
  source: MarginPolicySource;
}

export interface SalesPriceDecisionInput {
  listPrice: number;
  requestedPrice: number;
  cost: number;
  actorDiscountLimitPercent: number;
  minimumGrossMarginPercent: number;
  actorLevel: SalesAuthorityLevel;
  adminExceptionApproved?: boolean;
}

export interface SalesPriceDecision {
  allowed: boolean;
  requiresAdminApproval: boolean;
  isException: boolean;
  discountAmount: number;
  discountPercent: number;
  grossProfit: number;
  grossMargin: number;
  reason: 'ok' | 'discount_authority_exceeded' | 'below_margin_floor' | 'invalid_price';
}

export interface SalesPeriodMetricInput {
  salesValue: number;
  cashCollected: number;
  outstanding: number;
  grossProfit: number;
}

export interface SalesPeriodMetrics {
  salesValue: number;
  cashCollected: number;
  outstanding: number;
  grossProfit: number;
  grossMargin: number;
}

const safeMoney = (value: number) => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);

export function calculateGrossMargin(sellingPrice: number, cost: number) {
  const price = safeMoney(sellingPrice);
  const basis = safeMoney(cost);
  if (price <= 0) return 0;
  return ((price - basis) / price) * 100;
}

export function resolveMinimumMargin(input: MarginResolutionInput): MarginResolution {
  if (input.productMargin != null) return { margin: safeMoney(input.productMargin), source: 'product' };
  if (input.categoryMargin != null) return { margin: safeMoney(input.categoryMargin), source: 'category' };
  return { margin: safeMoney(input.companyMargin), source: 'company' };
}

export function evaluateSalesPrice(input: SalesPriceDecisionInput): SalesPriceDecision {
  const listPrice = safeMoney(input.listPrice);
  const requestedPrice = safeMoney(input.requestedPrice);
  const cost = safeMoney(input.cost);
  const discountLimit = safeMoney(input.actorDiscountLimitPercent);
  const minimumMargin = safeMoney(input.minimumGrossMarginPercent);

  const discountAmount = Math.max(0, listPrice - requestedPrice);
  const discountPercent = listPrice > 0 ? (discountAmount / listPrice) * 100 : 0;
  const grossProfit = requestedPrice - cost;
  const grossMargin = calculateGrossMargin(requestedPrice, cost);

  if (requestedPrice <= 0 || listPrice <= 0) {
    return { allowed: false, requiresAdminApproval: true, isException: false, discountAmount, discountPercent, grossProfit, grossMargin, reason: 'invalid_price' };
  }

  const authorityExceeded = discountPercent > discountLimit;
  const belowMarginFloor = grossMargin < minimumMargin;
  const exception = input.actorLevel === 'admin' && input.adminExceptionApproved === true && (authorityExceeded || belowMarginFloor);

  if (exception) {
    return { allowed: true, requiresAdminApproval: false, isException: true, discountAmount, discountPercent, grossProfit, grossMargin, reason: 'ok' };
  }

  if (authorityExceeded) {
    return { allowed: false, requiresAdminApproval: true, isException: false, discountAmount, discountPercent, grossProfit, grossMargin, reason: 'discount_authority_exceeded' };
  }

  if (belowMarginFloor) {
    return { allowed: false, requiresAdminApproval: true, isException: false, discountAmount, discountPercent, grossProfit, grossMargin, reason: 'below_margin_floor' };
  }

  return { allowed: true, requiresAdminApproval: false, isException: false, discountAmount, discountPercent, grossProfit, grossMargin, reason: 'ok' };
}

export function deriveSalesPeriodMetrics(rows: SalesPeriodMetricInput[]): SalesPeriodMetrics {
  const totals = rows.reduce((acc, row) => ({
    salesValue: acc.salesValue + safeMoney(row.salesValue),
    cashCollected: acc.cashCollected + safeMoney(row.cashCollected),
    outstanding: acc.outstanding + safeMoney(row.outstanding),
    grossProfit: acc.grossProfit + Number(row.grossProfit || 0),
  }), { salesValue: 0, cashCollected: 0, outstanding: 0, grossProfit: 0 });

  return {
    ...totals,
    grossMargin: totals.salesValue > 0 ? (totals.grossProfit / totals.salesValue) * 100 : 0,
  };
}
