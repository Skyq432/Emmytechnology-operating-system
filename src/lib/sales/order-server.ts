import { requireSalesActor, resolveOrCreateSalesIdentity } from './server';
import { buildSalesOrderDraftItems, type SalesOrderDraftInputLine } from './order-draft';

export async function createSalesOrderDraft(input: {
  existingIdentityId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  salesStaffName?: string | null;
  deliveryCharge?: number | null;
  note?: string | null;
  items: SalesOrderDraftInputLine[];
}) {
  const { supabase } = await requireSalesActor();
  const identityId = await resolveOrCreateSalesIdentity({
    existingIdentityId: input.existingIdentityId,
    name: input.customerName,
    phone: input.customerPhone,
    email: input.customerEmail,
  });

  const items = buildSalesOrderDraftItems(input.items);
  const { data, error } = await supabase.rpc('sales_create_order_draft', {
    p_identity_id: identityId,
    p_customer_name: input.customerName?.trim() || null,
    p_customer_phone: input.customerPhone?.trim() || null,
    p_customer_email: input.customerEmail?.trim().toLowerCase() || null,
    p_items: items,
    p_sales_staff_name: input.salesStaffName?.trim() || null,
    p_delivery_charge: Math.max(0, Number(input.deliveryCharge || 0)),
    p_note: input.note?.trim() || null,
  });

  return error
    ? { success: false as const, message: error.message }
    : { success: true as const, message: 'Sales Order draft created', data };
}
