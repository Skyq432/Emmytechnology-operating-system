'use server';

import { revalidatePath } from 'next/cache';
import {
  changeOperationsOrderStatus,
  createInventoryItem,
  createOperationsOrder,
  createWebsiteProductLink,
} from '@/lib/operations/server';
import {
  acknowledgeOperationsHandover,
  createOperationsHandover,
} from '@/lib/operations/tracking-server';
import type { OrderStatus } from '@/lib/operations/domain';
import type {
  OperationsPriority,
  OperationsSource,
  WebsiteRelationshipType,
} from '@/lib/operations/types';

export type OperationsActionState = {
  success: boolean;
  message: string;
};

export async function createOrderAction(
  _previousState: OperationsActionState,
  formData: FormData
): Promise<OperationsActionState> {
  const itemName = String(formData.get('item_name') || '').trim();
  const quantity = Math.max(1, Number(formData.get('quantity') || 1));

  if (!itemName) return { success: false, message: 'Item name is required.' };

  const result = await createOperationsOrder({
    sourceType: String(formData.get('source_type') || 'manual') as OperationsSource,
    sourceReference: String(formData.get('source_reference') || ''),
    referenceLabel: String(formData.get('reference_label') || ''),
    customerName: String(formData.get('customer_name') || ''),
    customerPhone: String(formData.get('customer_phone') || ''),
    customerEmail: String(formData.get('customer_email') || ''),
    priority: String(formData.get('priority') || 'normal') as OperationsPriority,
    currentTeam: String(formData.get('current_team') || 'Operations'),
    dueAt: String(formData.get('due_at') || '') || null,
    items: [
      {
        inventoryItemId: String(formData.get('inventory_item_id') || '') || null,
        websiteProductId: String(formData.get('website_product_id') || '') || null,
        itemName,
        quantity,
        unitPrice: formData.get('unit_price') ? Number(formData.get('unit_price')) : null,
        note: String(formData.get('item_note') || ''),
      },
    ],
  });

  if (result.success) {
    revalidatePath('/modules/operations');
    revalidatePath('/modules/operations/orders');
  }

  return { success: result.success, message: result.message };
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
  const sku = String(formData.get('sku') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!sku || !name) return { success: false, message: 'SKU and item name are required.' };

  const result = await createInventoryItem({
    sku,
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

export async function createWebsiteLinkAction(
  _previousState: OperationsActionState,
  formData: FormData
): Promise<OperationsActionState> {
  const inventoryItemId = String(formData.get('inventory_item_id') || '');
  const websiteProductId = String(formData.get('website_product_id') || '');
  if (!inventoryItemId || !websiteProductId) {
    return { success: false, message: 'Choose an inventory item and a website product.' };
  }

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
