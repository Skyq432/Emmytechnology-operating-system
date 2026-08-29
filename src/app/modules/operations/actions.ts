'use server';

import { revalidatePath } from 'next/cache';
import {
  changeOperationsOrderStatus,
  confirmOperationsOrder,
  createInventoryItem,
  createOperationsOrder,
  createWebsiteProductLink,
} from '@/lib/operations/server';
import {
  acknowledgeOperationsHandover,
  createOperationsHandover,
} from '@/lib/operations/tracking-server';
import { updateDraftOrderAttribution } from '@/lib/operations/attribution-server';
import {
  cancelOperationsTransfer,
  receiveOperationsTransfer,
  startOperationsTransfer,
} from '@/lib/operations/transfer-server';
import type { OrderStatus } from '@/lib/operations/domain';
import type {
  FulfilmentSource,
  OperationsPriority,
  OperationsSource,
  WebsiteRelationshipType,
} from '@/lib/operations/types';
import type { TransferCarrierType } from '@/lib/operations/transfer';

export type OperationsActionState = { success: boolean; message: string };

export async function createOrderAction(
  _previousState: OperationsActionState,
  formData: FormData
): Promise<OperationsActionState> {
  const itemName = String(formData.get('item_name') || '').trim();
  const quantity = Math.max(1, Number(formData.get('quantity') || 1));
  if (!itemName) return { success: false, message: 'Item name is required.' };

  const unitPrice = Math.max(0, Number(formData.get('unit_price') || 0));
  const listPrice = Math.max(0, Number(formData.get('list_price') || unitPrice));
  const result = await createOperationsOrder({
    sourceType: String(formData.get('source_type') || 'manual') as OperationsSource,
    sourceReference: String(formData.get('source_reference') || ''),
    referenceLabel: String(formData.get('reference_label') || ''),
    identityId: String(formData.get('identity_id') || '') || null,
    leadId: String(formData.get('lead_id') || '') || null,
    ambassadorId: String(formData.get('ambassador_id') || '') || null,
    customerName: String(formData.get('customer_name') || ''),
    customerPhone: String(formData.get('customer_phone') || ''),
    customerEmail: String(formData.get('customer_email') || ''),
    priority: String(formData.get('priority') || 'normal') as OperationsPriority,
    currentTeam: String(formData.get('current_team') || 'Operations'),
    dueAt: String(formData.get('due_at') || '') || null,
    discountType: String(formData.get('discount_type') || ''),
    discountAmount: Number(formData.get('discount_amount') || 0),
    discountPercentage: Number(formData.get('discount_percentage') || 0),
    discountReason: String(formData.get('discount_reason') || ''),
    cashOffAmount: Number(formData.get('cash_off_amount') || 0),
    deliveryCharge: Number(formData.get('delivery_charge') || 0),
    commissionRate: Number(formData.get('commission_rate') || 0),
    acquisitionSource: String(formData.get('acquisition_source') || ''),
    items: [{
      inventoryItemId: String(formData.get('inventory_item_id') || '') || null,
      websiteProductId: String(formData.get('website_product_id') || '') || null,
      itemName,
      quantity,
      unitPrice,
      listPrice,
      lineDiscountAmount: Number(formData.get('line_discount_amount') || 0),
      fulfilmentSource: String(formData.get('fulfilment_source') || 'manual') as FulfilmentSource,
      sourceLocationId: String(formData.get('source_location_id') || '') || null,
      note: String(formData.get('item_note') || ''),
    }],
  });
  if (result.success) {
    revalidatePath('/modules/operations');
    revalidatePath('/modules/operations/orders');
  }
  return { success: result.success, message: result.message };
}

export async function updateDraftAttributionAction(formData: FormData) {
  const orderId = String(formData.get('order_id') || '');
  if (!orderId) return;
  const result = await updateDraftOrderAttribution({
    orderId,
    ambassadorId: String(formData.get('ambassador_id') || '') || null,
    commissionRate: Number(formData.get('commission_rate') || 0),
    attributionSource: String(formData.get('attribution_source') || 'manual_admin') === 'automatic' ? 'automatic' : 'manual_admin',
  });
  if (!result.success) throw new Error(result.message);
  revalidatePath('/modules/operations/orders');
  revalidatePath(`/modules/operations/orders/${orderId}`);
}

export async function confirmOrderAction(formData: FormData) {
  const orderId = String(formData.get('order_id') || '');
  if (!orderId) return;
  const result = await confirmOperationsOrder(orderId);
  if (!result.success) throw new Error(result.message);
  revalidatePath('/modules/operations');
  revalidatePath('/modules/operations/orders');
  revalidatePath('/modules/operations/inventory');
  revalidatePath(`/modules/operations/orders/${orderId}`);
}

export async function changeOrderStatusAction(formData: FormData) {
  const orderId = String(formData.get('order_id') || '');
  const status = String(formData.get('status') || '') as OrderStatus;
  const note = String(formData.get('note') || '');
  if (!orderId || !status) return;
  const result = await changeOperationsOrderStatus(orderId, status, note);
  if (!result.success) throw new Error(result.message);
  revalidatePath('/modules/operations');
  revalidatePath('/modules/operations/orders');
  revalidatePath(`/modules/operations/orders/${orderId}`);
}

export async function createHandoverAction(formData: FormData) {
  const orderId = String(formData.get('order_id') || '');
  const toTeam = String(formData.get('to_team') || '').trim();
  const toUserId = String(formData.get('to_user_id') || '') || null;
  const note = String(formData.get('note') || '');
  if (!orderId || !toTeam) return;
  const result = await createOperationsHandover({ orderId, toTeam, toUserId, note });
  if (!result.success) throw new Error(result.message);
  revalidatePath('/modules/operations');
  revalidatePath('/modules/operations/orders');
  revalidatePath(`/modules/operations/orders/${orderId}`);
}

export async function acknowledgeHandoverAction(formData: FormData) {
  const handoverId = String(formData.get('handover_id') || '');
  const orderId = String(formData.get('order_id') || '');
  const note = String(formData.get('note') || '');
  if (!handoverId || !orderId) return;
  const result = await acknowledgeOperationsHandover(handoverId, note);
  if (!result.success) throw new Error(result.message);
  revalidatePath('/modules/operations');
  revalidatePath('/modules/operations/orders');
  revalidatePath(`/modules/operations/orders/${orderId}`);
}

export async function createInventoryItemAction(
  _previousState: OperationsActionState,
  formData: FormData
): Promise<OperationsActionState> {
  const name = String(formData.get('name') || '').trim();
  if (!name) return { success: false, message: 'Item name is required.' };
  const result = await createInventoryItem({
    name,
    description: String(formData.get('description') || ''),
    category: String(formData.get('category') || ''),
    unit: String(formData.get('unit') || 'item'),
    serialTracking: formData.get('serial_tracking') === 'on',
    reorderLevel: Number(formData.get('reorder_level') || 0),
  });
  if (result.success) {
    revalidatePath('/modules/operations');
    revalidatePath('/modules/operations/inventory');
    revalidatePath('/modules/operations/website-links');
  }
  return { success: result.success, message: result.message };
}

export async function startTransferAction(
  _previousState: OperationsActionState,
  formData: FormData
): Promise<OperationsActionState> {
  const result = await startOperationsTransfer({
    inventoryItemId: String(formData.get('inventory_item_id') || ''),
    fromLocationId: String(formData.get('from_location_id') || ''),
    toLocationId: String(formData.get('to_location_id') || ''),
    quantity: Math.max(1, Number(formData.get('quantity') || 1)),
    orderId: String(formData.get('order_id') || '') || null,
    orderItemId: String(formData.get('order_item_id') || '') || null,
    carrierType: String(formData.get('carrier_type') || 'other') as TransferCarrierType,
    carrierUserId: String(formData.get('carrier_user_id') || '') || null,
    carrierName: String(formData.get('carrier_name') || ''),
    carrierPhone: String(formData.get('carrier_phone') || ''),
    carrierReference: String(formData.get('carrier_reference') || ''),
    reason: String(formData.get('reason') || ''),
    note: String(formData.get('note') || ''),
  });
  if (result.success) {
    revalidatePath('/modules/operations');
    revalidatePath('/modules/operations/inventory');
    revalidatePath('/modules/operations/transfers');
    if (result.orderId) revalidatePath(`/modules/operations/orders/${result.orderId}`);
  }
  return { success: result.success, message: result.message };
}

export async function receiveTransferAction(formData: FormData) {
  const transferId = String(formData.get('transfer_id') || '');
  if (!transferId) return;
  const result = await receiveOperationsTransfer(transferId, String(formData.get('note') || ''));
  if (!result.success) throw new Error(result.message);
  revalidatePath('/modules/operations');
  revalidatePath('/modules/operations/inventory');
  revalidatePath('/modules/operations/transfers');
}

export async function cancelTransferAction(formData: FormData) {
  const transferId = String(formData.get('transfer_id') || '');
  if (!transferId) return;
  const result = await cancelOperationsTransfer(transferId, String(formData.get('note') || ''));
  if (!result.success) throw new Error(result.message);
  revalidatePath('/modules/operations');
  revalidatePath('/modules/operations/inventory');
  revalidatePath('/modules/operations/transfers');
}

export async function createWebsiteLinkAction(
  _previousState: OperationsActionState,
  formData: FormData
): Promise<OperationsActionState> {
  const inventoryItemId = String(formData.get('inventory_item_id') || '');
  const websiteProductId = String(formData.get('website_product_id') || '');
  if (!inventoryItemId || !websiteProductId) return { success: false, message: 'Choose an inventory item and a website product.' };
  const allocationRaw = String(formData.get('website_allocation') || '').trim();
  const result = await createWebsiteProductLink({
    inventoryItemId,
    websiteProductId,
    relationshipType: String(formData.get('relationship_type') || 'stocked') as WebsiteRelationshipType,
    websiteAllocation: allocationRaw ? Math.max(0, Number(allocationRaw)) : null,
    stockSyncEnabled: formData.get('stock_sync_enabled') === 'on',
  });
  if (result.success) {
    revalidatePath('/modules/operations');
    revalidatePath('/modules/operations/website-links');
  }
  return { success: result.success, message: result.message };
}
