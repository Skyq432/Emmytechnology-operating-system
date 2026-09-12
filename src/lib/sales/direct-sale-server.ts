import { processDocumentsForOrder } from './documents/document-service';
import { requireSalesActor, resolveOrCreateSalesIdentity } from './server';

export type DirectSaleCheckoutSnapshot = {
  id: string;
  orderCode: string;
  identityId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  commercialState: string;
  fulfilmentStatus: string;
  grossAmount: number;
  cashOffAmount: number;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  handoverCompletedAt: string | null;
  items: Array<{ id: string; itemName: string; quantity: number; unitPrice: number; lineTotal: number }>;
  credit: { id: string; approvedOutstandingAmount: number; dueAt: string; status: string } | null;
  documents: Array<{ id: string; documentNumber: string; documentType: string; renderStatus: string; storagePath: string | null }>;
};

async function getDirectSaleCheckoutSnapshot(
  supabase: Awaited<ReturnType<typeof requireSalesActor>>['supabase'],
  orderId: string,
): Promise<DirectSaleCheckoutSnapshot> {
  const [orderResult, itemsResult, paymentsResult, creditResult, documentsResult] = await Promise.all([
    supabase
      .from('ops_orders')
      .select('id,order_code,identity_id,customer_name,customer_phone,customer_email,commercial_state,status,subtotal,discount_amount,cash_off_amount,delivery_charge,total_amount,handover_completed_at')
      .eq('id', orderId)
      .single(),
    supabase.from('ops_order_items').select('id,item_name,quantity,unit_price,line_total').eq('order_id', orderId).order('created_at'),
    supabase.from('ops_order_payments').select('amount,is_void').eq('order_id', orderId),
    supabase.from('sales_credit_releases').select('id,approved_outstanding_amount,due_at,status').eq('order_id', orderId).eq('status', 'active').order('approved_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('sales_documents').select('id,document_number,document_type,render_status,storage_path,voided_at').eq('order_id', orderId).is('voided_at', null).order('issued_at', { ascending: false }),
  ]);
  const error = orderResult.error || itemsResult.error || paymentsResult.error || creditResult.error || documentsResult.error;
  if (error) throw new Error(error.message);
  const order = orderResult.data;
  const paidAmount = (paymentsResult.data || []).filter((row) => !row.is_void).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const cashOffAmount = Number(order.cash_off_amount || 0);
  const totalAmount = Number(order.total_amount || 0);
  const grossAmount = Math.max(
    Number(order.subtotal || 0) - Number(order.discount_amount || 0) + Number(order.delivery_charge || 0),
    0,
  );
  return {
    id: order.id,
    orderCode: order.order_code,
    identityId: order.identity_id,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    customerEmail: order.customer_email,
    commercialState: order.commercial_state,
    fulfilmentStatus: order.status,
    grossAmount,
    cashOffAmount,
    totalAmount,
    paidAmount,
    outstanding: Math.max(totalAmount - paidAmount, 0),
    handoverCompletedAt: order.handover_completed_at,
    items: (itemsResult.data || []).map((row) => ({
      id: row.id,
      itemName: row.item_name,
      quantity: Number(row.quantity || 0),
      unitPrice: Number(row.unit_price || 0),
      lineTotal: Number(row.line_total || 0),
    })),
    credit: creditResult.data ? {
      id: creditResult.data.id,
      approvedOutstandingAmount: Number(creditResult.data.approved_outstanding_amount || 0),
      dueAt: creditResult.data.due_at,
      status: creditResult.data.status,
    } : null,
    documents: (documentsResult.data || []).map((row) => ({
      id: row.id,
      documentNumber: row.document_number,
      documentType: row.document_type,
      renderStatus: row.render_status,
      storagePath: row.storage_path,
    })),
  };
}

export async function createDirectSaleDraft(input: {
  existingIdentityId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  salesStaffName?: string | null;
  cashOffAmount?: number;
  items: Array<{
    inventoryItemId?: string | null;
    inventoryUnitId?: string | null;
    sourceLocationId?: string | null;
    itemName?: string | null;
    itemType?: string | null;
    category?: string | null;
    quantity: number;
    finalUnitPrice?: number | null;
    listPrice?: number | null;
    costBasis?: number | null;
    costBasisSource?: string | null;
    adminExceptionReason?: string | null;
    note?: string | null;
  }>;
}) {
  const { supabase } = await requireSalesActor();
  const identityId = await resolveOrCreateSalesIdentity({
    existingIdentityId: input.existingIdentityId,
    name: input.customerName,
    phone: input.customerPhone,
    email: input.customerEmail,
    address: input.customerAddress,
  });

  const { data, error } = await supabase.rpc('sales_create_direct_sale_draft_with_cash_off', {
    p_identity_id: identityId,
    p_customer_name: input.customerName ?? null,
    p_customer_phone: input.customerPhone ?? null,
    p_customer_email: input.customerEmail ?? null,
    p_items: input.items.map((item) => ({
      inventory_item_id: item.inventoryItemId ?? '',
      inventory_unit_id: item.inventoryUnitId ?? '',
      source_location_id: item.sourceLocationId ?? '',
      item_name: item.itemName ?? '',
      item_type: item.itemType ?? 'other',
      category: item.category ?? '',
      quantity: item.quantity,
      final_unit_price: item.finalUnitPrice ?? '',
      list_price: item.listPrice ?? '',
      cost_basis: item.costBasis ?? '',
      cost_basis_source: item.costBasisSource ?? '',
      admin_exception_reason: item.adminExceptionReason ?? '',
      note: item.note ?? '',
    })),
    p_sales_staff_name: input.salesStaffName ?? null,
    p_cash_off_amount: Math.max(0, Number(input.cashOffAmount || 0)),
  });
  if (error) return { success: false as const, message: error.message };
  const checkout = await getDirectSaleCheckoutSnapshot(supabase, String(data));
  return { success: true as const, message: 'Direct Sale draft created', data: checkout };
}

export async function setDirectSaleCashOff(orderId: string, amount: number) {
  const { supabase } = await requireSalesActor();
  const { error } = await supabase.rpc('commercial_set_draft_cash_off', {
    p_order_id: orderId,
    p_amount: Math.max(0, Number(amount || 0)),
  });
  if (error) return { success: false as const, message: error.message };
  return { success: true as const, message: 'Cash-Off updated', data: await getDirectSaleCheckoutSnapshot(supabase, orderId) };
}

export async function confirmDirectSale(orderId: string) {
  const { supabase } = await requireSalesActor();
  const { error } = await supabase.rpc('sales_confirm_direct_sale', { p_order_id: orderId });
  if (error) return { success: false as const, message: error.message };
  return { success: true as const, message: 'Direct Sale confirmed and Cash-Off/stock reserved safely', data: await getDirectSaleCheckoutSnapshot(supabase, orderId) };
}

export async function recordDirectSalePayment(input: {
  orderId: string;
  amount: number;
  paymentMethod: 'bank_transfer' | 'pos' | 'cash' | 'split' | 'other';
  reference?: string | null;
  paidAt?: string | null;
  note?: string | null;
}) {
  const { supabase } = await requireSalesActor();
  const { error } = await supabase.rpc('ops_record_order_payment', {
    p_order_id: input.orderId,
    p_amount: Math.max(0, Number(input.amount || 0)),
    p_payment_method: input.paymentMethod,
    p_reference: input.reference?.trim() || null,
    p_paid_at: input.paidAt || new Date().toISOString(),
    p_note: input.note?.trim() || null,
  });
  if (error) return { success: false as const, message: error.message };

  let message = 'Payment recorded';
  try {
    const documents = await processDocumentsForOrder(input.orderId);
    const failed = documents.filter((row) => !row.success).length;
    message = failed
      ? `Payment recorded. Receipt processing needs attention for ${failed} document(s); the payment was not reversed.`
      : 'Payment recorded and receipt processing completed';
  } catch (documentError) {
    const detail = documentError instanceof Error ? documentError.message : 'Unknown receipt processing error';
    message = `Payment recorded. Receipt processing will retry from the document queue: ${detail}`;
  }
  return { success: true as const, message, data: await getDirectSaleCheckoutSnapshot(supabase, input.orderId) };
}

export async function approveDirectSaleCredit(input: {
  orderId: string;
  approvedOutstandingAmount: number;
  dueAt: string;
  reason: string;
}) {
  const { supabase, actor } = await requireSalesActor();
  if (actor.authorityLevel !== 'admin') return { success: false as const, message: 'Admin approval is required' };
  const { error } = await supabase.rpc('sales_approve_credit_release', {
    p_order_id: input.orderId,
    p_approved_outstanding_amount: Math.max(0, Number(input.approvedOutstandingAmount || 0)),
    p_due_at: input.dueAt,
    p_reason: input.reason.trim(),
  });
  if (error) return { success: false as const, message: error.message };
  return { success: true as const, message: 'Credit release approved', data: await getDirectSaleCheckoutSnapshot(supabase, input.orderId) };
}

export async function completeDirectSaleHandover(orderId: string) {
  const { supabase } = await requireSalesActor();
  const { error } = await supabase.rpc('sales_complete_direct_sale_handover', { p_order_id: orderId });
  if (error) return { success: false as const, message: error.message };
  return { success: true as const, message: 'Direct Sale handover completed', data: await getDirectSaleCheckoutSnapshot(supabase, orderId) };
}
