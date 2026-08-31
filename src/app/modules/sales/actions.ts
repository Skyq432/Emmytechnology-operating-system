'use server';

import { revalidatePath } from 'next/cache';
import {
  approveDirectSaleCredit,
  completeDirectSaleHandover,
  confirmDirectSale,
  createDirectSaleDraft,
  recordDirectSalePayment,
} from '@/lib/sales/direct-sale-server';
import { createSalesOrderDraft } from '@/lib/sales/order-server';
import {
  convertAcceptedQuotation,
  createSalesQuotation,
  publishSalesQuotationVersion,
  recordOfflineQuotationDecision,
} from '@/lib/sales/quotation-server';
import { requireSalesActor } from '@/lib/sales/server';

export type SalesActionState = { success: boolean; message: string; data?: unknown };
const fail = (message: string): SalesActionState => ({ success: false, message });

function parseJson<T>(value: FormDataEntryValue | null, fallback: T): T {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function revalidateSales() {
  revalidatePath('/modules/sales');
  revalidatePath('/modules/sales/direct');
  revalidatePath('/modules/sales/quotations');
  revalidatePath('/modules/sales/orders');
  revalidatePath('/modules/sales/payments');
  revalidatePath('/modules/sales/receipts');
  revalidatePath('/modules/sales/customers');
  revalidatePath('/modules/sales/credit');
  revalidatePath('/modules/sales/returns');
  revalidatePath('/modules/sales/team');
  revalidatePath('/modules/sales/reports');
}

export async function createDirectSaleAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const items = parseJson<Array<{
    inventoryItemId?: string | null; inventoryUnitId?: string | null; sourceLocationId?: string | null;
    itemName?: string | null; itemType?: string | null; category?: string | null; quantity: number;
    finalUnitPrice?: number | null; listPrice?: number | null; costBasis?: number | null;
    costBasisSource?: string | null; adminExceptionReason?: string | null; note?: string | null;
  }>>(formData.get('items_json'), []);
  if (!items.length) return fail('Add at least one item to the Direct Sale.');
  const result = await createDirectSaleDraft({
    existingIdentityId: String(formData.get('identity_id') || '') || null,
    customerName: String(formData.get('customer_name') || ''),
    customerPhone: String(formData.get('customer_phone') || ''),
    customerEmail: String(formData.get('customer_email') || ''),
    salesStaffName: String(formData.get('sales_staff_name') || ''),
    items,
  });
  if (result.success) revalidateSales();
  return { success: result.success, message: result.message, data: result.success ? result.data : undefined };
}

export async function createSalesOrderAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const items = parseJson<Array<{
    inventoryItemId?: string | null;
    itemName: string;
    itemType?: string | null;
    category?: string | null;
    fulfilmentSource?: 'internal' | 'supplier' | 'dropship' | 'manual';
    quantity: number;
    listPrice: number;
    finalUnitPrice: number;
    costBasis?: number | null;
    costBasisSource?: 'inventory_average' | 'product_default' | 'supplier_on_demand' | null;
    adminExceptionReason?: string | null;
    note?: string | null;
  }>>(formData.get('items_json'), []);
  if (!items.length) return fail('Add at least one item to the Order.');

  try {
    const result = await createSalesOrderDraft({
      existingIdentityId: String(formData.get('identity_id') || '') || null,
      customerName: String(formData.get('customer_name') || ''),
      customerPhone: String(formData.get('customer_phone') || ''),
      customerEmail: String(formData.get('customer_email') || ''),
      salesStaffName: String(formData.get('sales_staff_name') || ''),
      deliveryCharge: Number(formData.get('delivery_charge') || 0),
      note: String(formData.get('note') || ''),
      items,
    });
    if (result.success) revalidateSales();
    return { success: result.success, message: result.message, data: result.success ? result.data : undefined };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unable to create Sales Order draft.');
  }
}

export async function confirmDirectSaleAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const orderId = String(formData.get('order_id') || '');
  if (!orderId) return fail('Direct Sale is required.');
  const result = await confirmDirectSale(orderId);
  if (result.success) revalidateSales();
  return { success: result.success, message: result.message, data: result.success ? result.data : undefined };
}

export async function recordSalesPaymentAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const orderId = String(formData.get('order_id') || '');
  const amount = Number(formData.get('amount') || 0);
  if (!orderId || amount <= 0) return fail('Enter a valid payment amount.');
  const result = await recordDirectSalePayment({
    orderId,
    amount,
    paymentMethod: String(formData.get('payment_method') || 'other') as 'bank_transfer' | 'pos' | 'cash' | 'split' | 'other',
    reference: String(formData.get('reference') || ''),
    paidAt: String(formData.get('paid_at') || '') || null,
    note: String(formData.get('note') || ''),
  });
  if (result.success) revalidateSales();
  return { success: result.success, message: result.message, data: result.success ? result.data : undefined };
}

export async function approveCreditAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const orderId = String(formData.get('order_id') || '');
  const amount = Number(formData.get('approved_outstanding_amount') || 0);
  const dueAt = String(formData.get('due_at') || '');
  const reason = String(formData.get('reason') || '').trim();
  if (!orderId || amount <= 0 || !dueAt || !reason) return fail('Order, approved amount, due date and reason are required.');
  const result = await approveDirectSaleCredit({ orderId, approvedOutstandingAmount: amount, dueAt, reason });
  if (result.success) revalidateSales();
  return { success: result.success, message: result.message, data: result.success ? result.data : undefined };
}

export async function completeHandoverAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const orderId = String(formData.get('order_id') || '');
  if (!orderId) return fail('Direct Sale is required.');
  const result = await completeDirectSaleHandover(orderId);
  if (result.success) revalidateSales();
  return { success: result.success, message: result.message, data: result.success ? result.data : undefined };
}

export async function createQuotationAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const result = await createSalesQuotation({
    existingIdentityId: String(formData.get('identity_id') || '') || null,
    customerName: String(formData.get('customer_name') || ''),
    customerPhone: String(formData.get('customer_phone') || ''),
    customerEmail: String(formData.get('customer_email') || ''),
    salesStaffName: String(formData.get('sales_staff_name') || ''),
  });
  if (result.success) revalidateSales();
  return { success: result.success, message: result.message, data: result.success ? result.data : undefined };
}

export async function publishQuotationAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const quotationId = String(formData.get('quotation_id') || '');
  const items = parseJson<Array<{
    inventoryItemId?: string | null; itemName: string; itemType?: string; category?: string | null;
    fulfilmentSource?: 'internal' | 'supplier' | 'dropship' | 'manual'; quantity: number;
    listPrice: number; finalUnitPrice: number; costBasis?: number | null; costBasisSource?: 'inventory_average' | 'product_default' | 'supplier_on_demand';
    adminExceptionReason?: string | null; note?: string | null;
  }>>(formData.get('items_json'), []);
  if (!quotationId || !items.length) return fail('Quotation and at least one item are required.');
  const result = await publishSalesQuotationVersion({
    quotationId,
    items,
    customerNote: String(formData.get('customer_note') || ''),
    terms: String(formData.get('terms') || ''),
    validityExpiresAt: String(formData.get('validity_expires_at') || '') || null,
  });
  if (!result.success) return { success: false, message: result.message };

  const version = result.data as { id?: string } | null;
  if (version?.id) {
    const { supabase } = await requireSalesActor();
    const { error } = await supabase.rpc('sales_ensure_quotation_document_metadata', { p_quotation_version_id: version.id });
    if (error) return { success: false, message: `Quotation published, but document queue failed: ${error.message}`, data: result.data };
  }
  revalidateSales();
  return { success: true, message: 'Quotation published and PDF queued', data: result.data };
}

export async function offlineQuotationDecisionAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const result = await recordOfflineQuotationDecision({
    quotationId: String(formData.get('quotation_id') || ''),
    decision: String(formData.get('decision') || 'accepted') as 'accepted' | 'declined',
    channel: String(formData.get('channel') || 'whatsapp') as 'whatsapp' | 'phone' | 'email' | 'in_person' | 'other',
    note: String(formData.get('note') || ''),
    evidenceReference: String(formData.get('evidence_reference') || ''),
  });
  if (result.success) revalidateSales();
  return { success: result.success, message: result.message, data: result.success ? result.data : undefined };
}

export async function convertQuotationAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const result = await convertAcceptedQuotation({
    quotationId: String(formData.get('quotation_id') || ''),
    conversionType: String(formData.get('conversion_type') || 'order') as 'direct_sale' | 'order',
  });
  if (result.success) revalidateSales();
  return { success: result.success, message: result.message, data: result.success ? result.data : undefined };
}

export async function createQuotationPublicLinkAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const versionId = String(formData.get('quotation_version_id') || '');
  if (!versionId) return fail('Quotation version is required.');
  const { supabase } = await requireSalesActor();
  const { data, error } = await supabase.rpc('sales_create_quotation_public_link', {
    p_quotation_version_id: versionId,
    p_expires_at: String(formData.get('expires_at') || '') || null,
  });
  return error ? fail(error.message) : { success: true, message: 'Secure customer link created', data };
}

export async function queueQuotationEmailAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const versionId = String(formData.get('quotation_version_id') || '');
  const email = String(formData.get('recipient_email') || '').trim();
  if (!versionId || !email) return fail('Quotation version and customer email are required.');
  const { supabase } = await requireSalesActor();
  const { data, error } = await supabase.rpc('sales_queue_quotation_send', { p_quotation_version_id: versionId, p_recipient_email: email });
  if (!error) revalidateSales();
  return error ? fail(error.message) : { success: true, message: 'Quotation email queued', data };
}

export async function createReturnAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const orderId = String(formData.get('order_id') || '');
  const reason = String(formData.get('reason') || '').trim();
  const items = parseJson<Array<{ order_item_id: string; quantity: number; disposition: string; returned_condition?: string; note?: string }>>(formData.get('items_json'), []);
  if (!orderId || !reason || !items.length) return fail('Order, reason and returned items are required.');
  const { supabase } = await requireSalesActor();
  const { data, error } = await supabase.rpc('sales_create_return', { p_order_id: orderId, p_reason: reason, p_items: items });
  if (!error) revalidateSales();
  return error ? fail(error.message) : { success: true, message: 'Return created', data };
}

export async function approveReturnAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const { supabase } = await requireSalesActor();
  const { error } = await supabase.rpc('sales_approve_return', { p_return_id: String(formData.get('return_id') || '') });
  if (!error) revalidateSales();
  return error ? fail(error.message) : { success: true, message: 'Return approved' };
}

export async function completeReturnAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const { supabase } = await requireSalesActor();
  const { error } = await supabase.rpc('sales_complete_return', { p_return_id: String(formData.get('return_id') || '') });
  if (!error) revalidateSales();
  return error ? fail(error.message) : { success: true, message: 'Return completed' };
}

export async function recordRefundAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const { supabase } = await requireSalesActor();
  const { data, error } = await supabase.rpc('sales_record_refund', {
    p_return_id: String(formData.get('return_id') || ''),
    p_amount: Number(formData.get('amount') || 0),
    p_payment_method: String(formData.get('payment_method') || 'other'),
    p_reference: String(formData.get('reference') || '') || null,
  });
  if (!error) revalidateSales();
  return error ? fail(error.message) : { success: true, message: 'Refund recorded and refund document queued', data };
}

export async function voidDocumentAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const documentId = String(formData.get('document_id') || '');
  const reason = String(formData.get('reason') || '').trim();
  if (!documentId || !reason) return fail('Document and void reason are required.');
  const { supabase } = await requireSalesActor();
  const { error } = await supabase.rpc('sales_void_document', { p_document_id: documentId, p_reason: reason });
  if (!error) revalidateSales();
  return error ? fail(error.message) : { success: true, message: 'Document voided' };
}

export async function saveSalesSettingsAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const { supabase, actor } = await requireSalesActor();
  if (actor.authorityLevel !== 'admin') return fail('Admin access is required.');
  const { error } = await supabase.from('sales_settings').update({
    company_default_margin_percent: Math.max(0, Number(formData.get('company_default_margin_percent') || 0)),
    company_archive_email: String(formData.get('company_archive_email') || '').trim() || null,
    quotation_valid_days: Math.max(1, Number(formData.get('quotation_valid_days') || 7)),
    updated_by: actor.userId,
  }).eq('settings_key', 'default');
  revalidatePath('/modules/sales/settings');
  return error ? fail(error.message) : { success: true, message: 'Sales settings saved' };
}

export async function saveMarginPolicyAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const { supabase, actor } = await requireSalesActor();
  if (actor.authorityLevel !== 'admin') return fail('Admin access is required.');
  const scope = String(formData.get('policy_scope') || 'category');
  const category = String(formData.get('category') || '').trim();
  const inventoryItemId = String(formData.get('inventory_item_id') || '') || null;
  const margin = Number(formData.get('minimum_margin_percent') || 0);
  if (scope === 'category' && !category) return fail('Category is required.');
  if (scope === 'product' && !inventoryItemId) return fail('Product is required.');
  const { error } = await supabase.from('sales_margin_policies').insert({
    policy_scope: scope,
    category: scope === 'category' ? category : null,
    inventory_item_id: scope === 'product' ? inventoryItemId : null,
    minimum_margin_percent: margin,
    created_by: actor.userId,
  });
  revalidatePath('/modules/sales/settings');
  return error ? fail(error.message) : { success: true, message: 'Margin policy saved' };
}

export async function saveSalesAuthorityAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const { supabase, actor } = await requireSalesActor();
  if (actor.authorityLevel !== 'admin') return fail('Admin access is required.');
  const userId = String(formData.get('user_id') || '');
  if (!userId) return fail('User is required.');
  const { error } = await supabase.from('sales_authority_profiles').upsert({
    user_id: userId,
    authority_level: String(formData.get('authority_level') || 'salesperson'),
    discount_limit_percent: Math.max(0, Number(formData.get('discount_limit_percent') || 0)),
    is_active: true,
    created_by: actor.userId,
  }, { onConflict: 'user_id' });
  revalidatePath('/modules/sales/settings');
  return error ? fail(error.message) : { success: true, message: 'Sales authority saved' };
}
