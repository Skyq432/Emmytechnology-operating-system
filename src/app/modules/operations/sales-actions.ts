'use server';

import { revalidatePath } from 'next/cache';
import type { PaymentMethod, RepairStatus, SolarInstallationStatus } from '@/lib/operations/types';
import type { OrderItemType } from '@/lib/operations/sales-model';
import {
  createInventoryUnit,
  createOperationsSupplier,
  recordOrderPayment,
  saveSolarInstallation,
  updateDraftSalesDetails,
} from '@/lib/operations/sales-server';
import { advanceRepairWorkflow, createRepairWithCard } from '@/lib/operations/repair-server';

export type SalesActionState = { success: boolean; message: string };
const initialFail = (message: string): SalesActionState => ({ success: false, message });

export async function recordOrderPaymentAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const orderId = String(formData.get('order_id') || '');
  const amount = Number(formData.get('amount') || 0);
  if (!orderId) return initialFail('Order is required.');
  if (amount <= 0) return initialFail('Enter a payment amount greater than zero.');
  const result = await recordOrderPayment({
    orderId,
    amount,
    paymentMethod: String(formData.get('payment_method') || 'other') as PaymentMethod,
    reference: String(formData.get('reference') || ''),
    paidAt: String(formData.get('paid_at') || '') || null,
    note: String(formData.get('note') || ''),
  });
  if (result.success) {
    revalidatePath('/modules/operations/orders');
    revalidatePath(`/modules/operations/orders/${orderId}`);
  }
  return { success: result.success, message: result.message };
}

export async function saveDraftSalesDetailsAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const orderId = String(formData.get('order_id') || '');
  const itemId = String(formData.get('item_id') || '');
  if (!orderId || !itemId) return initialFail('Order item is required.');
  const specsRaw = String(formData.get('specs_json') || '{}');
  let specs: Record<string, unknown> = {};
  try { specs = JSON.parse(specsRaw); } catch { return initialFail('Item specifications are invalid.'); }
  const result = await updateDraftSalesDetails({
    orderId,
    itemId,
    orderType: String(formData.get('order_type') || 'other') as OrderItemType,
    itemType: String(formData.get('item_type') || 'other') as OrderItemType,
    salesStaffUserId: String(formData.get('sales_staff_user_id') || '') || null,
    salesStaffName: String(formData.get('sales_staff_name') || ''),
    brand: String(formData.get('brand') || ''),
    model: String(formData.get('model') || ''),
    condition: String(formData.get('condition') || ''),
    unitCostSnapshot: String(formData.get('unit_cost_snapshot') || '') ? Number(formData.get('unit_cost_snapshot')) : null,
    warrantyPeriod: String(formData.get('warranty_period') || ''),
    warrantyExpiresAt: String(formData.get('warranty_expires_at') || '') || null,
    specs,
  });
  if (result.success) revalidatePath(`/modules/operations/orders/${orderId}`);
  return { success: result.success, message: result.message };
}

export async function createSupplierAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const name = String(formData.get('name') || '').trim();
  if (!name) return initialFail('Supplier name is required.');
  const result = await createOperationsSupplier({
    name,
    phone: String(formData.get('phone') || ''),
    email: String(formData.get('email') || ''),
    address: String(formData.get('address') || ''),
    notes: String(formData.get('notes') || ''),
  });
  if (result.success) {
    revalidatePath('/modules/operations/suppliers');
    revalidatePath('/modules/operations/inventory');
  }
  return { success: result.success, message: result.message };
}

export async function createInventoryUnitAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const inventoryItemId = String(formData.get('inventory_item_id') || '');
  if (!inventoryItemId) return initialFail('Inventory item is required.');
  const result = await createInventoryUnit({
    inventoryItemId,
    serialNumber: String(formData.get('serial_number') || ''),
    imei1: String(formData.get('imei_1') || ''),
    imei2: String(formData.get('imei_2') || ''),
    condition: String(formData.get('condition') || ''),
    acquisitionDate: String(formData.get('acquisition_date') || '') || null,
    unitCost: String(formData.get('unit_cost') || '') ? Number(formData.get('unit_cost')) : null,
    supplierId: String(formData.get('supplier_id') || '') || null,
    locationId: String(formData.get('location_id') || '') || null,
    note: String(formData.get('note') || ''),
  });
  if (result.success) revalidatePath(`/modules/operations/inventory/${inventoryItemId}`);
  return { success: result.success, message: result.message };
}

export async function createRepairAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const fault = String(formData.get('fault_reported') || '').trim();
  const cardId = String(formData.get('card_id') || '');
  if (!fault) return initialFail('Fault reported is required.');
  if (!cardId) return initialFail('Choose an available Repair Card.');

  const result = await createRepairWithCard({
    cardId,
    identityId: String(formData.get('identity_id') || '') || null,
    originalOrderId: String(formData.get('original_order_id') || '') || null,
    inventoryUnitId: String(formData.get('inventory_unit_id') || '') || null,
    customerName: String(formData.get('customer_name') || ''),
    customerPhone: String(formData.get('customer_phone') || ''),
    customerEmail: String(formData.get('customer_email') || ''),
    deviceType: String(formData.get('device_type') || ''),
    brand: String(formData.get('brand') || ''),
    model: String(formData.get('model') || ''),
    serialOrImei: String(formData.get('serial_or_imei') || ''),
    purchasedFromUs: String(formData.get('purchased_from_us') || 'not_sure') as 'yes' | 'no' | 'not_sure',
    faultReported: fault,
    diagnosis: String(formData.get('diagnosis') || ''),
    repairType: String(formData.get('repair_type') || ''),
    partsReplaced: String(formData.get('parts_replaced') || ''),
    partsCost: Number(formData.get('parts_cost') || 0),
    labourCost: Number(formData.get('labour_cost') || 0),
    amountCharged: Number(formData.get('amount_charged') || 0),
    warrantyPeriod: String(formData.get('warranty_period') || ''),
    warrantyExpiresAt: String(formData.get('warranty_expires_at') || '') || null,
    conditionReceived: String(formData.get('condition_received') || ''),
    conditionReturned: String(formData.get('condition_returned') || ''),
    accessoriesReceived: String(formData.get('accessories_received') || ''),
    technicianUserId: String(formData.get('technician_user_id') || '') || null,
    technicianName: String(formData.get('technician_name') || ''),
    notes: String(formData.get('notes') || ''),
  });

  if (result.success) {
    revalidatePath('/modules/operations/repairs');
    const data = result.data as { repair_code?: string; card_code?: string; access_pin?: string } | null;
    const details = [data?.repair_code, data?.card_code, data?.access_pin ? `PIN ${data.access_pin}` : ''].filter(Boolean).join(' · ');
    return { success: true, message: details ? `Repair created · ${details}` : result.message };
  }
  return { success: false, message: result.message };
}

export async function updateRepairStatusAction(formData: FormData) {
  const repairId = String(formData.get('repair_id') || '');
  const status = String(formData.get('status') || '') as RepairStatus;
  const note = String(formData.get('note') || '');
  if (!repairId || !status) return;
  const result = await advanceRepairWorkflow(repairId, status, note);
  if (!result.success) throw new Error(result.message);
  revalidatePath('/modules/operations/repairs');
  revalidatePath(`/modules/operations/repairs/${repairId}`);
}

export async function saveSolarInstallationAction(_prev: SalesActionState, formData: FormData): Promise<SalesActionState> {
  const orderId = String(formData.get('order_id') || '');
  const orderItemId = String(formData.get('order_item_id') || '');
  if (!orderId || !orderItemId) return initialFail('Solar order item is required.');
  const result = await saveSolarInstallation({
    orderId,
    orderItemId,
    installationRequired: formData.get('installation_required') === 'on',
    installationAddress: String(formData.get('installation_address') || ''),
    scheduledAt: String(formData.get('scheduled_at') || '') || null,
    installerUserId: String(formData.get('installer_user_id') || '') || null,
    installerName: String(formData.get('installer_name') || ''),
    installationCost: Number(formData.get('installation_cost') || 0),
    systemCapacity: String(formData.get('system_capacity') || ''),
    status: String(formData.get('status') || 'pending') as SolarInstallationStatus,
    notes: String(formData.get('notes') || ''),
  });
  if (result.success) revalidatePath(`/modules/operations/orders/${orderId}`);
  return { success: result.success, message: result.message };
}
