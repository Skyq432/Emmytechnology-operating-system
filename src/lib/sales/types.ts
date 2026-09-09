import type { CostBasisSource, MarginPolicySource, SalesAuthorityLevel } from './domain';

export type SalesChannel = 'order' | 'direct_sale';
export type SalesFulfilmentMode = 'operations_fulfilment' | 'immediate_collection';
export type QuotationStatus = 'draft' | 'published' | 'accepted' | 'declined' | 'converted' | 'cancelled';
export type QuotationVersionStatus = 'published' | 'accepted' | 'declined' | 'superseded';
export type SalesPaymentSource = 'order' | 'repair';
export type SalesDocumentType = 'payment_receipt' | 'final_sales_receipt' | 'refund_document' | 'quotation_pdf';

export interface SalesActor {
  userId: string;
  appRole: string;
  authorityLevel: SalesAuthorityLevel;
  discountLimitPercent: number;
}

export interface SalesPricingContext {
  inventoryItemId: string | null;
  category: string | null;
  costBasis: number;
  costBasisSource: CostBasisSource;
  minimumGrossMarginPercent: number;
  marginPolicySource: MarginPolicySource;
}

export interface SalesQuotationSummary {
  id: string;
  quotation_code: string;
  identity_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  sales_staff_user_id: string | null;
  sales_staff_name: string | null;
  status: QuotationStatus;
  current_version_id: string | null;
  converted_order_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalesUnifiedPayment {
  source_type: SalesPaymentSource;
  source_payment_id: string;
  source_id: string;
  source_code: string;
  identity_id: string | null;
  amount: number;
  payment_method: string;
  reference: string | null;
  paid_at: string;
  is_void: boolean;
  recorded_by: string | null;
  created_at: string;
}

export interface SalesOverviewData {
  salesValue: number;
  cashCollected: number;
  outstanding: number;
  grossProfit: number;
  grossMargin: number;
  directSales: number;
  orders: number;
  quotationsPublished: number;
  quotationsAccepted: number;
  attention: Array<{ key: string; label: string; count: number; href: string }>;
}
