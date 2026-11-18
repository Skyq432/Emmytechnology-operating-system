import { createClient } from '@/lib/supabase-server';

function numeric<T extends Record<string, unknown>>(row: T, fields: string[]) {
  const copy = { ...row } as Record<string, unknown>;
  for (const field of fields) copy[field] = Number(copy[field] || 0);
  return copy as T;
}

export async function getSalesInventoryCatalog() {
  const supabase = await createClient();
  const [itemsResult, availabilityResult, unitsResult, locationsResult, websiteLinksResult, marginPoliciesResult] = await Promise.all([
    supabase.from('ops_inventory_items').select('*').eq('is_active', true).order('name'),
    supabase.from('ops_inventory_availability').select('*'),
    supabase.from('ops_inventory_units').select('id,inventory_item_id,serial_number,imei_1,imei_2,unit_cost,current_location_id,status').eq('status', 'available').order('created_at'),
    supabase.from('ops_locations').select('id,code,name').eq('is_active', true).order('name'),
    supabase.from('ops_website_product_links').select('inventory_item_id,website_product:products(price,sale_price,status)').eq('is_active', true),
    supabase.from('sales_margin_policies').select('inventory_item_id,minimum_margin_percent').eq('policy_scope','product').eq('is_active',true),
  ]);
  const errors = [itemsResult.error, availabilityResult.error, unitsResult.error, locationsResult.error, websiteLinksResult.error, marginPoliciesResult.error].filter(Boolean);
  if (errors.length) throw new Error(errors[0]!.message);

  const websitePriceByInventory = new Map<string, number>();
  for (const link of websiteLinksResult.data || []) {
    const product = Array.isArray(link.website_product) ? link.website_product[0] : link.website_product;
    if (!product || product.status !== 'active') continue;
    const price = Number(product.sale_price ?? product.price ?? 0);
    if (price > 0) websitePriceByInventory.set(link.inventory_item_id, price);
  }

  const marginByInventory = new Map((marginPoliciesResult.data || []).map((row) => [row.inventory_item_id, Number(row.minimum_margin_percent || 0)]));
  return {
    items: (itemsResult.data || []).map((row) => {
      const normalized = numeric(row, ['default_unit_cost', 'default_selling_price', 'reorder_level']);
      const websitePrice = websitePriceByInventory.get(row.id);
      const inventoryPrice = Number(normalized.default_selling_price || 0);
      return {
        ...normalized,
        default_selling_price: inventoryPrice || null,
        website_selling_price: websitePrice || null,
        website_price_mismatch: Boolean(websitePrice && inventoryPrice && Math.abs(websitePrice - inventoryPrice) >= 0.01),
        standard_price_source: inventoryPrice ? 'inventory' : null,
        salesperson_discount_limit_percent: Number(normalized.salesperson_discount_limit_percent || 0),
        minimum_margin_percent: marginByInventory.get(row.id) || 0,
      };
    }),
    availability: (availabilityResult.data || []).map((row) => numeric(row, ['on_hand', 'reserved', 'available', 'reorder_level'])),
    units: (unitsResult.data || []).map((row) => numeric(row, ['unit_cost'])),
    locations: locationsResult.data || [],
  };
}

export async function getSalesMarginContext() {
  const supabase = await createClient();
  const [settingsResult, categoryPoliciesResult] = await Promise.all([
    supabase.from('sales_settings').select('company_default_margin_percent').eq('settings_key', 'default').single(),
    supabase.from('sales_margin_policies').select('category,minimum_margin_percent').eq('policy_scope', 'category').eq('is_active', true),
  ]);
  if (settingsResult.error) throw new Error(settingsResult.error.message);
  if (categoryPoliciesResult.error) throw new Error(categoryPoliciesResult.error.message);

  const categoryMinimums: Record<string, number> = {};
  for (const row of categoryPoliciesResult.data || []) {
    if (row.category) categoryMinimums[row.category.toLowerCase().trim()] = Number(row.minimum_margin_percent || 0);
  }

  return {
    companyDefaultMarginPercent: Number(settingsResult.data?.company_default_margin_percent || 0),
    categoryMinimums,
  };
}

export async function getSalesQuotations() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('sales_quotations')
    .select('*,current_version:sales_quotation_versions!sales_quotations_current_version_fk(*,items:sales_quotation_items(*),acceptance:sales_quotation_acceptances(*),deliveries:sales_quotation_deliveries(*))')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    ...row,
    current_version: row.current_version ? numeric(row.current_version as Record<string, unknown>, ['subtotal', 'discount_amount', 'total_amount']) : null,
  }));
}

export async function getSalesOrders() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ops_orders')
    .select('*,items:ops_order_items(*),payments:ops_order_payments(*),credit:sales_credit_releases(*)')
    .neq('deletion_status', 'deleted')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => numeric(row, ['subtotal', 'discount_amount', 'total_amount', 'amount_paid', 'balance_due', 'commission_amount']));
}

export async function getSalesPayments() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('sales_unified_payments').select('*').order('paid_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => numeric(row, ['amount']));
}

export async function getSalesDocuments() {
  const supabase = await createClient();
  const [documentsResult, deletedOrdersResult] = await Promise.all([
    supabase
      .from('sales_documents')
      .select('*,deliveries:sales_document_deliveries(*)')
      .order('issued_at', { ascending: false }),
    supabase.from('ops_orders').select('id').eq('deletion_status', 'deleted'),
  ]);
  if (documentsResult.error) throw new Error(documentsResult.error.message);
  if (deletedOrdersResult.error) throw new Error(deletedOrdersResult.error.message);
  // A deleted sale's receipts leave the Receipts page with it (they stay in the
  // database, so an undone deletion brings them back).
  const deletedOrderIds = new Set((deletedOrdersResult.data || []).map((row) => row.id));
  return (documentsResult.data || []).filter((doc) => !doc.order_id || !deletedOrderIds.has(doc.order_id));
}

export type OutstandingRow = {
  sourceType: 'order' | 'repair';
  id: string;
  code: string;
  customerName: string | null;
  customerPhone: string | null;
  staffName: string | null;
  salesChannel: string | null;
  since: string | null;
  /** Whole days since the sale/repair was confirmed (computed once, server-side). */
  daysOwing: number | null;
  total: number;
  paid: number;
  outstanding: number;
  credit: { amount: number; dueAt: string; overdue: boolean } | null;
};

type PersonRow = { id: string; customer_name: string | null; customer_phone: string | null; technician_name?: string | null };

/**
 * Everything customers still owe: confirmed, not-deleted sales and repairs with a
 * balance, from the same sales_revenue_balances view the Sales Overview uses, so this
 * page and the "Outstanding" tile always agree. Any active Admin credit is attached.
 */
export async function getSalesOutstanding(): Promise<OutstandingRow[]> {
  const supabase = await createClient();
  const { data: balances, error } = await supabase
    .from('sales_revenue_balances')
    .select('source_type,source_id,source_code,sales_channel,sales_staff_name,commercial_at,sales_value,cash_collected,outstanding')
    .gt('outstanding', 0);
  if (error) throw new Error(error.message);
  const rows = balances || [];
  const orderIds = rows.filter((row) => row.source_type === 'order').map((row) => row.source_id as string);
  const repairIds = rows.filter((row) => row.source_type === 'repair').map((row) => row.source_id as string);
  const empty = { data: [], error: null };
  const [ordersResult, repairsResult, creditResult] = await Promise.all([
    orderIds.length ? supabase.from('ops_orders').select('id,customer_name,customer_phone').in('id', orderIds) : Promise.resolve(empty),
    repairIds.length ? supabase.from('ops_repairs').select('id,customer_name,customer_phone,technician_name').in('id', repairIds) : Promise.resolve(empty),
    orderIds.length ? supabase.from('sales_credit_releases').select('order_id,approved_outstanding_amount,due_at,status').eq('status', 'active').in('order_id', orderIds) : Promise.resolve(empty),
  ]);
  const errors = [ordersResult.error, repairsResult.error, creditResult.error].filter(Boolean);
  if (errors.length) throw new Error(errors[0]!.message);
  const people = new Map<string, PersonRow>();
  for (const row of [...(ordersResult.data || []), ...(repairsResult.data || [])] as PersonRow[]) people.set(row.id, row);
  const credits = new Map(((creditResult.data || []) as Array<{ order_id: string; approved_outstanding_amount: number; due_at: string }>).map((row) => [row.order_id, row]));
  const now = Date.now();
  return rows
    .map((row): OutstandingRow => {
      const person = people.get(row.source_id);
      const credit = credits.get(row.source_id);
      return {
        sourceType: row.source_type === 'repair' ? 'repair' : 'order',
        id: row.source_id,
        code: row.source_code,
        customerName: person?.customer_name ?? null,
        customerPhone: person?.customer_phone ?? null,
        staffName: row.sales_staff_name ?? person?.technician_name ?? null,
        salesChannel: row.sales_channel,
        since: row.commercial_at,
        daysOwing: row.commercial_at ? Math.max(Math.floor((now - new Date(row.commercial_at).getTime()) / 86_400_000), 0) : null,
        total: Number(row.sales_value || 0),
        paid: Number(row.cash_collected || 0),
        outstanding: Number(row.outstanding || 0),
        credit: credit ? {
          amount: Number(credit.approved_outstanding_amount || 0),
          dueAt: credit.due_at,
          overdue: new Date(credit.due_at).getTime() < now,
        } : null,
      };
    })
    .sort((a, b) => String(a.since || '').localeCompare(String(b.since || '')));
}

export async function getSalesCustomers() {
  const supabase = await createClient();
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
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('sales_credit_releases')
    .select('*,order:ops_orders(order_code,customer_name,customer_phone,identity_id,total_amount,balance_due,deletion_status)')
    .order('due_at');
  if (error) throw new Error(error.message);
  // Compute "overdue" here (once, server-side) rather than in the page component's
  // render body, which would call Date.now() impurely on every render.
  const now = Date.now();
  const isDeleted = (row: { order?: unknown }) => {
    const order = (Array.isArray(row.order) ? row.order[0] : row.order) as { deletion_status?: string } | null | undefined;
    return order?.deletion_status === 'deleted';
  };
  return (data || []).filter((row) => !isDeleted(row)).map((row) => {
    const withNumbers = numeric(row, ['approved_outstanding_amount']);
    return { ...withNumbers, overdue: withNumbers.status === 'active' && new Date(withNumbers.due_at).getTime() < now };
  });
}

export async function getSalesReturns() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('sales_returns')
    .select('*,order:ops_orders(order_code,customer_name,total_amount),items:sales_return_items(*),refunds:sales_refunds(*)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getSalesTeamPerformance() {
  const supabase = await createClient();
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
  const supabase = await createClient();
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
  const supabase = await createClient();
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
