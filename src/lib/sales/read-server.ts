import { createClient } from '@/lib/supabase-server';
import { requireSalesActor } from './server';

function numeric<T extends Record<string, unknown>>(row: T, fields: string[]) {
  const copy = { ...row } as Record<string, unknown>;
  for (const field of fields) copy[field] = Number(copy[field] || 0);
  return copy as T;
}

export async function getSalesInventoryCatalog() {
  const { supabase } = await requireSalesActor();
  const [itemsResult, availabilityResult, unitsResult, locationsResult] = await Promise.all([
    supabase.from('ops_inventory_items').select('*').eq('is_active', true).order('name'),
    supabase.from('ops_inventory_availability').select('*'),
    supabase.from('ops_inventory_units').select('id,inventory_item_id,serial_number,imei_1,imei_2,unit_cost,current_location_id,status').eq('status', 'available').order('created_at'),
    supabase.from('ops_locations').select('id,code,name').eq('is_active', true).order('name'),
  ]);
  const errors = [itemsResult.error, availabilityResult.error, unitsResult.error, locationsResult.error].filter(Boolean);
  if (errors.length) throw new Error(errors[0]!.message);

  return {
    items: (itemsResult.data || []).map((row) => numeric(row, ['default_unit_cost', 'default_selling_price', 'reorder_level'])),
    availability: (availabilityResult.data || []).map((row) => numeric(row, ['on_hand', 'reserved', 'available', 'reorder_level'])),
    units: (unitsResult.data || []).map((row) => numeric(row, ['unit_cost'])),
    locations: locationsResult.data || [],
  };
}

export async function getSalesQuotations() {
  const { supabase } = await requireSalesActor();
  const { data, error } = await supabase
    .from('sales_quotations')
    .select('*,current_version:sales_quotation_versions!sales_quotations_current_version_fk(*,items:sales_quotation_items(*)),acceptances:sales_quotation_acceptances(*),deliveries:sales_quotation_deliveries(*)')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    ...row,
    current_version: row.current_version ? numeric(row.current_version as Record<string, unknown>, ['subtotal', 'discount_amount', 'total_amount']) : null,
  }));
}

export async function getSalesOrders() {
  const { supabase } = await requireSalesActor();
  const { data, error } = await supabase
    .from('ops_orders')
    .select('*,items:ops_order_items(*),payments:ops_order_payments(*),credit:sales_credit_releases(*)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => numeric(row, ['subtotal', 'discount_amount', 'total_amount', 'amount_paid', 'balance_due', 'commission_amount']));
}

export async function getSalesPayments() {
  const { supabase } = await requireSalesActor();
  const { data, error } = await supabase.from('sales_unified_payments').select('*').order('paid_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => numeric(row, ['amount']));
}

export async function getSalesDocuments() {
  const { supabase } = await requireSalesActor();
  const { data, error } = await supabase
    .from('sales_documents')
    .select('*,deliveries:sales_document_deliveries(*)')
    .order('issued_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getSalesCustomers() {
  const { supabase } = await requireSalesActor();
  const { data: identities, error } = await supabase
    .from('identities')
    .select('id,identity_code,primary_name,primary_phone,primary_email')
    .order('updated_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  if (!identities?.length) return [];
  const ids = identities.map((row) => row.id);
  const [ordersResult, paymentsResult, quotesResult] = await Promise.all([
    supabase.from('sales_commercial_balances').select('identity_id,sales_value,cash_collected,outstanding,gross_profit').in('identity_id', ids),
    supabase.from('sales_unified_payments').select('identity_id,amount,is_void').in('identity_id', ids),
    supabase.from('sales_quotations').select('identity_id,status').in('identity_id', ids),
  ]);
  if (ordersResult.error) throw new Error(ordersResult.error.message);
  if (paymentsResult.error) throw new Error(paymentsResult.error.message);
  if (quotesResult.error) throw new Error(quotesResult.error.message);

  return identities.map((identity) => {
    const sales = (ordersResult.data || []).filter((row) => row.identity_id === identity.id);
    const quotes = (quotesResult.data || []).filter((row) => row.identity_id === identity.id);
    return {
      ...identity,
      salesValue: sales.reduce((sum, row) => sum + Number(row.sales_value || 0), 0),
      cashCollected: sales.reduce((sum, row) => sum + Number(row.cash_collected || 0), 0),
      outstanding: sales.reduce((sum, row) => sum + Number(row.outstanding || 0), 0),
      grossProfit: sales.reduce((sum, row) => sum + Number(row.gross_profit || 0), 0),
      quotations: quotes.length,
      acceptedQuotations: quotes.filter((row) => ['accepted', 'converted'].includes(row.status)).length,
    };
  }).filter((row) => row.salesValue > 0 || row.quotations > 0);
}

export async function getSalesCredit() {
  const { supabase } = await requireSalesActor();
  const { data, error } = await supabase
    .from('sales_credit_releases')
    .select('*,order:ops_orders(order_code,customer_name,customer_phone,identity_id,total_amount,balance_due)')
    .order('due_at');
  if (error) throw new Error(error.message);
  return (data || []).map((row) => numeric(row, ['approved_outstanding_amount']));
}

export async function getSalesReturns() {
  const { supabase } = await requireSalesActor();
  const { data, error } = await supabase
    .from('sales_returns')
    .select('*,order:ops_orders(order_code,customer_name,total_amount),items:sales_return_items(*),refunds:sales_refunds(*)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getSalesTeamPerformance() {
  const { supabase } = await requireSalesActor();
  const { data, error } = await supabase
    .from('sales_commercial_balances')
    .select('sales_staff_user_id,sales_staff_name,sales_channel,sales_value,cash_collected,outstanding,gross_profit');
  if (error) throw new Error(error.message);
  const map = new Map<string, { userId: string | null; name: string; salesValue: number; cashCollected: number; outstanding: number; grossProfit: number; directSales: number; orders: number }>();
  for (const row of data || []) {
    const key = row.sales_staff_user_id || row.sales_staff_name || 'unassigned';
    const current = map.get(key) || { userId: row.sales_staff_user_id, name: row.sales_staff_name || 'Unassigned', salesValue: 0, cashCollected: 0, outstanding: 0, grossProfit: 0, directSales: 0, orders: 0 };
    current.salesValue += Number(row.sales_value || 0);
    current.cashCollected += Number(row.cash_collected || 0);
    current.outstanding += Number(row.outstanding || 0);
    current.grossProfit += Number(row.gross_profit || 0);
    if (row.sales_channel === 'direct_sale') current.directSales += 1; else current.orders += 1;
    map.set(key, current);
  }
  return Array.from(map.values()).sort((a, b) => b.grossProfit - a.grossProfit);
}

export async function getSalesSettings() {
  const { supabase } = await requireSalesActor();
  const [settingsResult, marginResult, authorityResult, usersResult] = await Promise.all([
    supabase.from('sales_settings').select('*').eq('settings_key', 'default').single(),
    supabase.from('sales_margin_policies').select('*,inventory_item:ops_inventory_items(name,sku,category)').eq('is_active', true).order('policy_scope'),
    supabase.from('sales_authority_profiles').select('*').order('authority_level'),
    supabase.from('users').select('id,name,email,role').order('name'),
  ]);
  if (settingsResult.error) throw new Error(settingsResult.error.message);
  if (marginResult.error) throw new Error(marginResult.error.message);
  if (authorityResult.error) throw new Error(authorityResult.error.message);
  if (usersResult.error) throw new Error(usersResult.error.message);
  return { settings: settingsResult.data, marginPolicies: marginResult.data || [], authorityProfiles: authorityResult.data || [], users: usersResult.data || [] };
}

export async function getSalesReportSummary() {
  const { supabase } = await requireSalesActor();
  const [balancesResult, returnsResult, refundsResult, quotesResult] = await Promise.all([
    supabase.from('sales_commercial_balances').select('*'),
    supabase.from('sales_returns').select('id,status'),
    supabase.from('sales_refunds').select('amount,status'),
    supabase.from('sales_quotations').select('status,current_version:sales_quotation_versions!sales_quotations_current_version_fk(total_amount)'),
  ]);
  const errors = [balancesResult.error, returnsResult.error, refundsResult.error, quotesResult.error].filter(Boolean);
  if (errors.length) throw new Error(errors[0]!.message);
  const balances = balancesResult.data || [];
  const grossSales = balances.reduce((sum, row) => sum + Number(row.sales_value || 0), 0);
  const grossProfit = balances.reduce((sum, row) => sum + Number(row.gross_profit || 0), 0);
  const cashCollected = balances.reduce((sum, row) => sum + Number(row.cash_collected || 0), 0);
  const outstanding = balances.reduce((sum, row) => sum + Number(row.outstanding || 0), 0);
  const cashRefunded = (refundsResult.data || []).filter((row) => row.status === 'recorded').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const quotedValue = (quotesResult.data || []).reduce((sum, row) => sum + Number((row.current_version as { total_amount?: number } | null)?.total_amount || 0), 0);
  return {
    grossSales,
    cashCollected,
    outstanding,
    grossProfit,
    grossMargin: grossSales > 0 ? (grossProfit / grossSales) * 100 : 0,
    cashRefunded,
    netCash: cashCollected - cashRefunded,
    quotedValue,
    returns: (returnsResult.data || []).filter((row) => ['approved', 'completed'].includes(row.status)).length,
  };
}
