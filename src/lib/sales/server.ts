import { createClient } from '@/lib/supabase-server';
import { resolveOrCreateOperationsIdentity, searchOperationsIdentities } from '@/lib/operations/identity-server';
import { evaluateSalesPrice, resolveMinimumMargin, calculateGrossMargin } from './domain';
import type { SalesActor, SalesOverviewData, SalesPricingContext } from './types';

export async function requireSalesActor(): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; actor: SalesActor }> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profileError || !profile) throw new Error('Not authorized');

  if (profile.role === 'admin') {
    return {
      supabase,
      actor: { userId: user.id, appRole: profile.role, authorityLevel: 'admin', discountLimitPercent: 100 },
    };
  }

  const { data: salesProfile, error: salesProfileError } = await supabase
    .from('sales_authority_profiles')
    .select('authority_level,discount_limit_percent,is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();
  if (salesProfileError || !salesProfile) throw new Error('Not authorized for Sales');

  return {
    supabase,
    actor: {
      userId: user.id,
      appRole: profile.role,
      authorityLevel: salesProfile.authority_level as SalesActor['authorityLevel'],
      discountLimitPercent: Number(salesProfile.discount_limit_percent || 0),
    },
  };
}

export async function resolveOrCreateSalesIdentity(input: {
  existingIdentityId?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}) {
  return resolveOrCreateOperationsIdentity({
    existingIdentityId: input.existingIdentityId,
    name: input.name,
    phone: input.phone,
    email: input.email,
    source: 'operations_order',
  });
}

export async function searchSalesIdentities(query: string) {
  return searchOperationsIdentities(query);
}

export async function getSalesPricingContext(input: {
  inventoryItemId?: string | null;
  inventoryUnitId?: string | null;
  category?: string | null;
  supplierOnDemandCost?: number | null;
}): Promise<SalesPricingContext> {
  const { supabase } = await requireSalesActor();

  let inventoryItemId = input.inventoryItemId ?? null;
  let category = input.category?.trim() || null;
  let costBasis: number | null = null;
  let costBasisSource: SalesPricingContext['costBasisSource'] | null = null;

  if (input.inventoryUnitId) {
    const { data: unit, error } = await supabase
      .from('ops_inventory_units')
      .select('id,inventory_item_id,unit_cost,inventory_item:ops_inventory_items(category,default_unit_cost)')
      .eq('id', input.inventoryUnitId)
      .single();
    if (error || !unit) throw new Error(error?.message || 'Inventory unit not found');
    inventoryItemId = unit.inventory_item_id;
    const item = Array.isArray(unit.inventory_item) ? unit.inventory_item[0] : unit.inventory_item;
    category = category || item?.category || null;
    if (unit.unit_cost != null) {
      costBasis = Number(unit.unit_cost);
      costBasisSource = 'serialized_unit';
    } else if (item?.default_unit_cost != null) {
      costBasis = Number(item.default_unit_cost);
      costBasisSource = 'inventory_average';
    }
  }

  if (inventoryItemId && costBasis == null) {
    const { data: item, error } = await supabase
      .from('ops_inventory_items')
      .select('id,category,default_unit_cost')
      .eq('id', inventoryItemId)
      .single();
    if (error || !item) throw new Error(error?.message || 'Inventory item not found');
    category = category || item.category || null;
    if (item.default_unit_cost != null) {
      costBasis = Number(item.default_unit_cost);
      costBasisSource = 'inventory_average';
    }
  }

  if (costBasis == null && input.supplierOnDemandCost != null) {
    const supplierCost = Number(input.supplierOnDemandCost);
    if (!Number.isFinite(supplierCost) || supplierCost < 0) throw new Error('Invalid supplier/on-demand cost');
    costBasis = supplierCost;
    costBasisSource = 'supplier_on_demand';
  }

  if (costBasis == null || !costBasisSource) {
    throw new Error('A trustworthy cost basis is required before pricing this item');
  }

  const [{ data: settings, error: settingsError }, { data: productPolicy, error: productPolicyError }, { data: categoryPolicy, error: categoryPolicyError }] = await Promise.all([
    supabase.from('sales_settings').select('company_default_margin_percent').eq('settings_key', 'default').single(),
    inventoryItemId
      ? supabase.from('sales_margin_policies').select('minimum_margin_percent').eq('policy_scope', 'product').eq('inventory_item_id', inventoryItemId).eq('is_active', true).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    category
      ? supabase.from('sales_margin_policies').select('minimum_margin_percent').eq('policy_scope', 'category').ilike('category', category).eq('is_active', true).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (settingsError) throw new Error(settingsError.message);
  if (productPolicyError) throw new Error(productPolicyError.message);
  if (categoryPolicyError) throw new Error(categoryPolicyError.message);

  const margin = resolveMinimumMargin({
    productMargin: productPolicy?.minimum_margin_percent == null ? null : Number(productPolicy.minimum_margin_percent),
    categoryMargin: categoryPolicy?.minimum_margin_percent == null ? null : Number(categoryPolicy.minimum_margin_percent),
    companyMargin: Number(settings?.company_default_margin_percent || 0),
  });

  return {
    inventoryItemId,
    category,
    costBasis,
    costBasisSource,
    minimumGrossMarginPercent: margin.margin,
    marginPolicySource: margin.source,
  };
}

export async function validateSalesPrice(input: {
  listPrice: number;
  requestedPrice: number;
  pricingContext: SalesPricingContext;
  adminExceptionReason?: string | null;
  orderId?: string | null;
  orderItemId?: string | null;
  quotationVersionId?: string | null;
  quotationItemId?: string | null;
}) {
  const { supabase, actor } = await requireSalesActor();
  const wantsException = Boolean(input.adminExceptionReason?.trim());
  const decision = evaluateSalesPrice({
    listPrice: input.listPrice,
    requestedPrice: input.requestedPrice,
    cost: input.pricingContext.costBasis,
    actorDiscountLimitPercent: actor.discountLimitPercent,
    minimumGrossMarginPercent: input.pricingContext.minimumGrossMarginPercent,
    actorLevel: actor.authorityLevel,
    adminExceptionApproved: wantsException,
  });

  if (!decision.allowed) return { ...decision, approvalId: null as string | null };

  if (!decision.isException) return { ...decision, approvalId: null as string | null };
  if (actor.authorityLevel !== 'admin') throw new Error('Only Admin can approve a below-policy pricing exception');
  const reason = input.adminExceptionReason?.trim();
  if (!reason) throw new Error('Admin exception reason is required');

  const { data: approval, error } = await supabase
    .from('sales_discount_approvals')
    .insert({
      order_id: input.orderId ?? null,
      quotation_version_id: input.quotationVersionId ?? null,
      order_item_id: input.orderItemId ?? null,
      quotation_item_id: input.quotationItemId ?? null,
      list_price: Math.max(0, Number(input.listPrice || 0)),
      requested_price: Math.max(0, Number(input.requestedPrice || 0)),
      cost_basis: input.pricingContext.costBasis,
      discount_percent: decision.discountPercent,
      resulting_gross_margin: decision.grossMargin,
      decision: 'approved',
      reason,
      requested_by: actor.userId,
      approved_by: actor.userId,
    })
    .select('id')
    .single();
  if (error || !approval) throw new Error(error?.message || 'Unable to record pricing approval');

  return { ...decision, approvalId: approval.id as string };
}

export async function getSalesOverview(input?: { start?: string | null; end?: string | null }): Promise<SalesOverviewData> {
  const { supabase } = await requireSalesActor();

  let balancesQuery = supabase
    .from('sales_commercial_balances')
    .select('order_id,sales_channel,commercial_state,sales_value,outstanding,gross_profit,confirmed_at');
  if (input?.start) balancesQuery = balancesQuery.gte('confirmed_at', input.start);
  if (input?.end) balancesQuery = balancesQuery.lt('confirmed_at', input.end);

  let paymentsQuery = supabase
    .from('sales_unified_payments')
    .select('amount,paid_at,is_void');
  if (input?.start) paymentsQuery = paymentsQuery.gte('paid_at', input.start);
  if (input?.end) paymentsQuery = paymentsQuery.lt('paid_at', input.end);

  let quotesQuery = supabase
    .from('sales_quotations')
    .select('id,status,created_at');
  if (input?.start) quotesQuery = quotesQuery.gte('created_at', input.start);
  if (input?.end) quotesQuery = quotesQuery.lt('created_at', input.end);

  const [balancesResult, paymentsResult, quotesResult, overdueCreditResult, renderFailureResult] = await Promise.all([
    balancesQuery,
    paymentsQuery,
    quotesQuery,
    supabase.from('sales_credit_releases').select('id', { count: 'exact', head: true }).eq('status', 'active').lt('due_at', new Date().toISOString()),
    supabase.from('sales_documents').select('id', { count: 'exact', head: true }).eq('render_status', 'failed').is('voided_at', null),
  ]);

  const errors = [balancesResult.error, paymentsResult.error, quotesResult.error, overdueCreditResult.error, renderFailureResult.error].filter(Boolean);
  if (errors.length) throw new Error(errors[0]!.message);

  const balances = balancesResult.data || [];
  const salesValue = balances.reduce((sum, row) => sum + Number(row.sales_value || 0), 0);
  const grossProfit = balances.reduce((sum, row) => sum + Number(row.gross_profit || 0), 0);
  const outstanding = balances.reduce((sum, row) => sum + Number(row.outstanding || 0), 0);
  const cashCollected = (paymentsResult.data || []).reduce((sum, row) => sum + (row.is_void ? 0 : Number(row.amount || 0)), 0);
  const quotes = quotesResult.data || [];
  const quotationsPublished = quotes.filter((row) => ['published', 'accepted', 'declined', 'converted'].includes(row.status)).length;
  const quotationsAccepted = quotes.filter((row) => ['accepted', 'converted'].includes(row.status)).length;
  const awaitingDecision = quotes.filter((row) => row.status === 'published').length;
  const acceptedNotConverted = quotes.filter((row) => row.status === 'accepted').length;

  return {
    salesValue,
    cashCollected,
    outstanding,
    grossProfit,
    grossMargin: salesValue > 0 ? (grossProfit / salesValue) * 100 : 0,
    directSales: balances.filter((row) => row.sales_channel === 'direct_sale').length,
    orders: balances.filter((row) => row.sales_channel === 'order').length,
    quotationsPublished,
    quotationsAccepted,
    attention: [
      { key: 'quotes-awaiting', label: 'Quotations awaiting response', count: awaitingDecision, href: '/modules/sales/quotations' },
      { key: 'quotes-accepted', label: 'Accepted quotations not converted', count: acceptedNotConverted, href: '/modules/sales/quotations' },
      { key: 'credit-overdue', label: 'Overdue credit', count: overdueCreditResult.count ?? 0, href: '/modules/sales/credit' },
      { key: 'document-failures', label: 'Document generation failures', count: renderFailureResult.count ?? 0, href: '/modules/sales/receipts' },
    ],
  };
}

export function describeGrossMargin(sellingPrice: number, cost: number) {
  return calculateGrossMargin(sellingPrice, cost);
}
