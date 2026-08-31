import { requireSalesActor, resolveOrCreateSalesIdentity } from './server';

export async function createDirectSaleDraft(input: {
  existingIdentityId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  salesStaffName?: string | null;
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
  });

  const { data, error } = await supabase.rpc('sales_create_direct_sale_draft', {
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
  });

  return error
    ? { success: false as const, message: error.message }
    : { success: true as const, message: 'Direct Sale draft created', data };
}

export async function confirmDirectSale(orderId: string) {
  const { supabase } = await requireSalesActor();
  const { data, error } = await supabase.rpc('sales_confirm_direct_sale', { p_order_id: orderId });
  return error
    ? { success: false as const, message: error.message }
    : { success: true as const, message: 'Direct Sale confirmed', data };
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
  const { data, error } = await supabase.rpc('ops_record_order_payment', {
    p_order_id: input.orderId,
    p_amount: Math.max(0, Number(input.amount || 0)),
    p_payment_method: input.paymentMethod,
    p_reference: input.reference?.trim() || null,
    p_paid_at: input.paidAt || new Date().toISOString(),
    p_note: input.note?.trim() || null,
  });
  return error
    ? { success: false as const, message: error.message }
    : { success: true as const, message: 'Payment recorded', data };
}

export async function approveDirectSaleCredit(input: {
  orderId: string;
  approvedOutstandingAmount: number;
  dueAt: string;
  reason: string;
}) {
  const { supabase, actor } = await requireSalesActor();
  if (actor.authorityLevel !== 'admin') return { success: false as const, message: 'Admin approval is required' };
  const { data, error } = await supabase.rpc('sales_approve_credit_release', {
    p_order_id: input.orderId,
    p_approved_outstanding_amount: Math.max(0, Number(input.approvedOutstandingAmount || 0)),
    p_due_at: input.dueAt,
    p_reason: input.reason.trim(),
  });
  return error
    ? { success: false as const, message: error.message }
    : { success: true as const, message: 'Credit release approved', data };
}

export async function completeDirectSaleHandover(orderId: string) {
  const { supabase } = await requireSalesActor();
  const { data, error } = await supabase.rpc('sales_complete_direct_sale_handover', { p_order_id: orderId });
  return error
    ? { success: false as const, message: error.message }
    : { success: true as const, message: 'Direct Sale handover completed', data };
}
