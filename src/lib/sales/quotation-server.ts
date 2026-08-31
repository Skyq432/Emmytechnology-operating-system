import { requireSalesActor, resolveOrCreateSalesIdentity } from './server';

export async function createSalesQuotation(input: {
  existingIdentityId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  salesStaffName?: string | null;
}) {
  const { supabase, actor } = await requireSalesActor();
  const identityId = await resolveOrCreateSalesIdentity({
    existingIdentityId: input.existingIdentityId,
    name: input.customerName,
    phone: input.customerPhone,
    email: input.customerEmail,
  });

  const { data, error } = await supabase.rpc('sales_create_quotation', {
    p_identity_id: identityId,
    p_customer_name: input.customerName ?? null,
    p_customer_phone: input.customerPhone ?? null,
    p_customer_email: input.customerEmail ?? null,
    p_sales_staff_user_id: actor.userId,
    p_sales_staff_name: input.salesStaffName ?? null,
  });

  return error
    ? { success: false as const, message: error.message }
    : { success: true as const, message: 'Quotation created', data };
}

export async function publishSalesQuotationVersion(input: {
  quotationId: string;
  items: Array<{
    inventoryItemId?: string | null;
    itemName: string;
    itemType?: string;
    category?: string | null;
    fulfilmentSource?: 'internal' | 'supplier' | 'dropship' | 'manual';
    quantity: number;
    listPrice: number;
    finalUnitPrice: number;
    costBasis?: number | null;
    costBasisSource?: 'inventory_average' | 'product_default' | 'supplier_on_demand';
    adminExceptionReason?: string | null;
    note?: string | null;
  }>;
  customerNote?: string | null;
  terms?: string | null;
  validityExpiresAt?: string | null;
}) {
  const { supabase } = await requireSalesActor();
  const { data, error } = await supabase.rpc('sales_publish_quotation_version', {
    p_quotation_id: input.quotationId,
    p_items: input.items.map((item) => ({
      inventory_item_id: item.inventoryItemId ?? '',
      item_name: item.itemName,
      item_type: item.itemType ?? 'other',
      category: item.category ?? '',
      fulfilment_source: item.fulfilmentSource ?? 'manual',
      quantity: item.quantity,
      list_price: item.listPrice,
      final_unit_price: item.finalUnitPrice,
      cost_basis: item.costBasis ?? '',
      cost_basis_source: item.costBasisSource ?? '',
      admin_exception_reason: item.adminExceptionReason ?? '',
      note: item.note ?? '',
    })),
    p_customer_note: input.customerNote ?? null,
    p_terms: input.terms ?? null,
    p_validity_expires_at: input.validityExpiresAt ?? null,
  });
  return error
    ? { success: false as const, message: error.message }
    : { success: true as const, message: 'Quotation version published', data };
}

export async function recordOfflineQuotationDecision(input: {
  quotationId: string;
  decision: 'accepted' | 'declined';
  channel: 'whatsapp' | 'phone' | 'email' | 'in_person' | 'other';
  note?: string | null;
  evidenceReference?: string | null;
}) {
  const { supabase } = await requireSalesActor();
  const { data, error } = await supabase.rpc('sales_record_offline_quote_decision', {
    p_quotation_id: input.quotationId,
    p_decision: input.decision,
    p_channel: input.channel,
    p_note: input.note ?? null,
    p_evidence_reference: input.evidenceReference ?? null,
  });
  return error
    ? { success: false as const, message: error.message }
    : { success: true as const, message: `Quotation ${input.decision}`, data };
}

export async function convertAcceptedQuotation(input: {
  quotationId: string;
  conversionType: 'direct_sale' | 'order';
}) {
  const { supabase } = await requireSalesActor();
  const { data, error } = await supabase.rpc('sales_convert_accepted_quotation', {
    p_quotation_id: input.quotationId,
    p_conversion_type: input.conversionType,
  });
  return error
    ? { success: false as const, message: error.message }
    : { success: true as const, message: 'Quotation converted', data };
}
