import { requireSalesActor } from './server';
import type { SalesOverviewData } from './types';

export interface SalesReportRange {
  startIso: string;
  endExclusiveIso: string;
}

export async function getUnifiedSalesOverview(range: SalesReportRange): Promise<SalesOverviewData> {
  const { supabase } = await requireSalesActor();
  const [revenueResult, paymentsResult, quotesResult, overdueCreditResult, renderFailureResult] = await Promise.all([
    supabase.from('sales_revenue_balances').select('source_type,sales_channel,sales_value,outstanding,gross_profit,commercial_at').gte('commercial_at', range.startIso).lt('commercial_at', range.endExclusiveIso),
    supabase.from('sales_unified_payments').select('amount,is_void,paid_at').gte('paid_at', range.startIso).lt('paid_at', range.endExclusiveIso),
    supabase.from('sales_quotations').select('id,status,created_at').gte('created_at', range.startIso).lt('created_at', range.endExclusiveIso),
    supabase.from('sales_credit_releases').select('id', { count: 'exact', head: true }).eq('status', 'active').lt('due_at', new Date().toISOString()),
    supabase.from('sales_documents').select('id', { count: 'exact', head: true }).eq('render_status', 'failed').is('voided_at', null),
  ]);
  const errors = [revenueResult.error,paymentsResult.error,quotesResult.error,overdueCreditResult.error,renderFailureResult.error].filter(Boolean);
  if (errors.length) throw new Error(errors[0]!.message);
  const revenue = revenueResult.data || [];
  const salesValue = revenue.reduce((sum,row) => sum + Number(row.sales_value || 0),0);
  const grossProfit = revenue.reduce((sum,row) => sum + Number(row.gross_profit || 0),0);
  const outstanding = revenue.reduce((sum,row) => sum + Number(row.outstanding || 0),0);
  const cashCollected = (paymentsResult.data || []).reduce((sum,row) => sum + (row.is_void ? 0 : Number(row.amount || 0)),0);
  const quotes = quotesResult.data || [];
  return {
    salesValue,
    cashCollected,
    outstanding,
    grossProfit,
    grossMargin: salesValue > 0 ? grossProfit / salesValue * 100 : 0,
    directSales: revenue.filter((row) => row.sales_channel === 'direct_sale').length,
    orders: revenue.filter((row) => row.source_type === 'order' && row.sales_channel === 'order').length,
    quotationsPublished: quotes.filter((row) => ['published','accepted','declined','converted'].includes(row.status)).length,
    quotationsAccepted: quotes.filter((row) => ['accepted','converted'].includes(row.status)).length,
    attention: [
      { key:'quotes-awaiting',label:'Quotations awaiting response',count:quotes.filter((row)=>row.status==='published').length,href:'/modules/sales/quotations' },
      { key:'quotes-accepted',label:'Accepted quotations not converted',count:quotes.filter((row)=>row.status==='accepted').length,href:'/modules/sales/quotations' },
      { key:'credit-overdue',label:'Overdue credit',count:overdueCreditResult.count ?? 0,href:'/modules/sales/credit' },
      { key:'document-failures',label:'Document generation failures',count:renderFailureResult.count ?? 0,href:'/modules/sales/receipts' },
    ],
  };
}

export async function getUnifiedSalesCustomers() {
  const { supabase } = await requireSalesActor();
  const { data, error } = await supabase
    .from('sales_customer_summary')
    .select('*')
    .order('sales_value', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    id: row.id,
    identity_code: row.identity_code,
    primary_name: row.primary_name,
    primary_phone: row.primary_phone,
    primary_email: row.primary_email,
    salesValue: Number(row.sales_value || 0),
    cashCollected: Number(row.cash_collected || 0),
    outstanding: Number(row.outstanding || 0),
    grossProfit: Number(row.gross_profit || 0),
    repairTransactions: Number(row.repair_transactions || 0),
    quotations: Number(row.quotations || 0),
    acceptedQuotations: Number(row.accepted_quotations || 0),
  }));
}

export async function getUnifiedSalesReportSummary(range: SalesReportRange) {
  const { supabase } = await requireSalesActor();
  const [revenueResult,paymentsResult,refundsResult,returnsResult,quotesResult] = await Promise.all([
    supabase.from('sales_revenue_balances').select('source_type,sales_value,outstanding,gross_profit,commercial_at').gte('commercial_at',range.startIso).lt('commercial_at',range.endExclusiveIso),
    supabase.from('sales_unified_payments').select('amount,is_void,paid_at').gte('paid_at',range.startIso).lt('paid_at',range.endExclusiveIso),
    supabase.from('sales_refunds').select('amount,status,refunded_at').gte('refunded_at',range.startIso).lt('refunded_at',range.endExclusiveIso),
    supabase.from('sales_returns').select('id,status,created_at').gte('created_at',range.startIso).lt('created_at',range.endExclusiveIso),
    supabase.from('sales_quotations').select('status,created_at,current_version:sales_quotation_versions!sales_quotations_current_version_fk(total_amount)').gte('created_at',range.startIso).lt('created_at',range.endExclusiveIso),
  ]);
  const errors=[revenueResult.error,paymentsResult.error,refundsResult.error,returnsResult.error,quotesResult.error].filter(Boolean);
  if(errors.length) throw new Error(errors[0]!.message);
  const revenue=revenueResult.data||[];
  const grossSales=revenue.reduce((sum,row)=>sum+Number(row.sales_value||0),0);
  const grossProfit=revenue.reduce((sum,row)=>sum+Number(row.gross_profit||0),0);
  const outstanding=revenue.reduce((sum,row)=>sum+Number(row.outstanding||0),0);
  const cashCollected=(paymentsResult.data||[]).filter((row)=>!row.is_void).reduce((sum,row)=>sum+Number(row.amount||0),0);
  const cashRefunded=(refundsResult.data||[]).filter((row)=>row.status==='recorded').reduce((sum,row)=>sum+Number(row.amount||0),0);
  const quotedValue=(quotesResult.data||[]).reduce((sum,row)=>sum+Number((row.current_version as {total_amount?:number}|null)?.total_amount||0),0);
  return {
    grossSales,cashCollected,outstanding,grossProfit,
    grossMargin:grossSales>0?grossProfit/grossSales*100:0,
    cashRefunded,netCash:cashCollected-cashRefunded,quotedValue,
    repairSales:revenue.filter((row)=>row.source_type==='repair').reduce((sum,row)=>sum+Number(row.sales_value||0),0),
    returns:(returnsResult.data||[]).filter((row)=>['approved','completed'].includes(row.status)).length,
  };
}
