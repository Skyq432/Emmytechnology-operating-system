import { createClient } from '@/lib/supabase-server';
import type {
  OperationsInventoryItem,
  OperationsInventoryUnit,
  OperationsLocation,
  OperationsOrderPayment,
  OperationsRepair,
  OperationsSolarInstallation,
  OperationsSupplier,
  PaymentMethod,
  RepairStatus,
  SolarInstallationStatus,
} from './types';
import type { OrderItemType } from './sales-model';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');
  const { data: profile, error: profileError } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profileError || profile?.role !== 'admin') throw new Error('Not authorized');
  return { supabase, user };
}

export async function getOperationsSuppliers(): Promise<OperationsSupplier[]> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from('ops_suppliers').select('*').eq('is_active', true).order('name');
  if (error) throw new Error(error.message);
  return (data || []) as OperationsSupplier[];
}

export async function createOperationsSupplier(input: {
  name: string; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null;
}) {
  const { supabase, user } = await requireAdmin();
  const { data, error } = await supabase.from('ops_suppliers').insert({
    name: input.name.trim(), phone: input.phone?.trim() || null, email: input.email?.trim() || null,
    address: input.address?.trim() || null, notes: input.notes?.trim() || null, created_by: user.id,
  }).select('*').single();
  return error ? { success: false as const, message: error.message } : { success: true as const, message: 'Supplier created', data };
}

export async function getInventoryItemDetail(itemId: string): Promise<{
  item: OperationsInventoryItem;
  units: OperationsInventoryUnit[];
  locations: OperationsLocation[];
  suppliers: OperationsSupplier[];
}> {
  const { supabase } = await requireAdmin();
  const [itemResult, unitsResult, locationsResult, suppliersResult] = await Promise.all([
    supabase.from('ops_inventory_items').select('*').eq('id', itemId).single(),
    supabase.from('ops_inventory_units').select('*,supplier:ops_suppliers(id,name),location:ops_locations(id,name,code)').eq('inventory_item_id', itemId).order('created_at', { ascending: false }),
    supabase.from('ops_locations').select('id,code,name,location_type').eq('is_active', true).order('name'),
    supabase.from('ops_suppliers').select('*').eq('is_active', true).order('name'),
  ]);
  if (itemResult.error) throw new Error(itemResult.error.message);
  if (unitsResult.error) throw new Error(unitsResult.error.message);
  if (locationsResult.error) throw new Error(locationsResult.error.message);
  if (suppliersResult.error) throw new Error(suppliersResult.error.message);
  return {
    item: itemResult.data as OperationsInventoryItem,
    units: (unitsResult.data || []) as OperationsInventoryUnit[],
    locations: (locationsResult.data || []) as OperationsLocation[],
    suppliers: (suppliersResult.data || []) as OperationsSupplier[],
  };
}

export async function createInventoryUnit(input: {
  inventoryItemId: string;
  serialNumber?: string | null;
  imei1?: string | null;
  imei2?: string | null;
  condition?: string | null;
  acquisitionDate?: string | null;
  unitCost?: number | null;
  supplierId?: string | null;
  locationId?: string | null;
  note?: string | null;
}) {
  const { supabase, user } = await requireAdmin();
  if (!input.serialNumber?.trim() && !input.imei1?.trim() && !input.imei2?.trim()) {
    return { success: false as const, message: 'Enter a Serial number or IMEI.' };
  }
  const { data, error } = await supabase.from('ops_inventory_units').insert({
    inventory_item_id: input.inventoryItemId,
    serial_number: input.serialNumber?.trim() || null,
    imei_1: input.imei1?.trim() || null,
    imei_2: input.imei2?.trim() || null,
    condition: input.condition?.trim() || null,
    acquisition_date: input.acquisitionDate || null,
    unit_cost: input.unitCost == null ? null : Math.max(0, Number(input.unitCost)),
    supplier_id: input.supplierId || null,
    current_location_id: input.locationId || null,
    status: 'available', note: input.note?.trim() || null, created_by: user.id,
  }).select('*').single();
  return error ? { success: false as const, message: error.message } : { success: true as const, message: 'Serialized unit added', data };
}

export async function getOrderPayments(orderId: string): Promise<OperationsOrderPayment[]> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from('ops_order_payments').select('*').eq('order_id', orderId).order('paid_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({ ...row, amount: Number(row.amount || 0) })) as OperationsOrderPayment[];
}

export async function recordOrderPayment(input: {
  orderId: string; amount: number; paymentMethod: PaymentMethod; reference?: string | null; paidAt?: string | null; note?: string | null;
}) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc('ops_record_order_payment', {
    p_order_id: input.orderId,
    p_amount: Math.max(0, Number(input.amount || 0)),
    p_payment_method: input.paymentMethod,
    p_reference: input.reference?.trim() || null,
    p_paid_at: input.paidAt || new Date().toISOString(),
    p_note: input.note?.trim() || null,
  });
  return error ? { success: false as const, message: error.message } : { success: true as const, message: 'Payment recorded', data };
}

export async function updateDraftSalesDetails(input: {
  orderId: string;
  orderType: OrderItemType;
  salesStaffUserId?: string | null;
  salesStaffName?: string | null;
  itemId: string;
  itemType: OrderItemType;
  brand?: string | null;
  model?: string | null;
  condition?: string | null;
  unitCostSnapshot?: number | null;
  warrantyPeriod?: string | null;
  warrantyExpiresAt?: string | null;
  specs?: Record<string, unknown>;
}) {
  const { supabase } = await requireAdmin();
  const { data: order, error: orderError } = await supabase.from('ops_orders').select('commercial_state').eq('id', input.orderId).single();
  if (orderError) return { success: false as const, message: orderError.message };
  if (order.commercial_state !== 'draft') return { success: false as const, message: 'Sales details can only be edited while the order is Draft.' };
  const { error: orderUpdateError } = await supabase.from('ops_orders').update({
    order_type: input.orderType,
    sales_staff_user_id: input.salesStaffUserId || null,
    sales_staff_name: input.salesStaffName?.trim() || null,
  }).eq('id', input.orderId);
  if (orderUpdateError) return { success: false as const, message: orderUpdateError.message };
  const { error: itemError } = await supabase.from('ops_order_items').update({
    item_type: input.itemType,
    brand: input.brand?.trim() || null,
    model: input.model?.trim() || null,
    condition: input.condition?.trim() || null,
    unit_cost_snapshot: input.unitCostSnapshot == null ? null : Math.max(0, Number(input.unitCostSnapshot)),
    warranty_period: input.warrantyPeriod?.trim() || null,
    warranty_expires_at: input.warrantyExpiresAt || null,
    specs: input.specs || {},
  }).eq('id', input.itemId).eq('order_id', input.orderId);
  return itemError ? { success: false as const, message: itemError.message } : { success: true as const, message: 'Sales details saved' };
}

export async function getOperationsRepairs(): Promise<OperationsRepair[]> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from('ops_repairs').select('*').order('received_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    ...row,
    parts_cost: Number(row.parts_cost || 0), labour_cost: Number(row.labour_cost || 0), amount_charged: Number(row.amount_charged || 0),
    repair_profit: Number(row.repair_profit || 0), amount_paid: Number(row.amount_paid || 0), balance_due: Number(row.balance_due || 0),
  })) as OperationsRepair[];
}

export async function getRepairDetail(repairId: string): Promise<OperationsRepair> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from('ops_repairs').select('*').eq('id', repairId).single();
  if (error) throw new Error(error.message);
  return { ...data, parts_cost: Number(data.parts_cost || 0), labour_cost: Number(data.labour_cost || 0), amount_charged: Number(data.amount_charged || 0), repair_profit: Number(data.repair_profit || 0), amount_paid: Number(data.amount_paid || 0), balance_due: Number(data.balance_due || 0) } as OperationsRepair;
}

export async function createRepair(input: {
  identityId?: string | null; originalOrderId?: string | null; inventoryUnitId?: string | null;
  customerName?: string | null; customerPhone?: string | null; deviceType?: string | null; brand?: string | null; model?: string | null;
  serialOrImei?: string | null; purchasedFromUs?: 'yes' | 'no' | 'not_sure'; faultReported: string; diagnosis?: string | null;
  repairType?: string | null; partsReplaced?: string | null; partsCost?: number; labourCost?: number; amountCharged?: number;
  warrantyPeriod?: string | null; warrantyExpiresAt?: string | null; conditionReceived?: string | null; conditionReturned?: string | null;
  technicianUserId?: string | null; technicianName?: string | null; notes?: string | null;
}) {
  const { supabase, user } = await requireAdmin();
  const amountCharged = Math.max(0, Number(input.amountCharged || 0));
  const { data, error } = await supabase.from('ops_repairs').insert({
    identity_id: input.identityId || null, original_order_id: input.originalOrderId || null, inventory_unit_id: input.inventoryUnitId || null,
    customer_name: input.customerName?.trim() || null, customer_phone: input.customerPhone?.trim() || null,
    device_type: input.deviceType?.trim() || null, brand: input.brand?.trim() || null, model: input.model?.trim() || null,
    serial_or_imei: input.serialOrImei?.trim() || null, purchased_from_us: input.purchasedFromUs || 'not_sure',
    fault_reported: input.faultReported.trim(), diagnosis: input.diagnosis?.trim() || null, repair_type: input.repairType?.trim() || null,
    parts_replaced: input.partsReplaced?.trim() || null, parts_cost: Math.max(0, Number(input.partsCost || 0)), labour_cost: Math.max(0, Number(input.labourCost || 0)),
    amount_charged: amountCharged, balance_due: amountCharged, warranty_period: input.warrantyPeriod?.trim() || null,
    warranty_expires_at: input.warrantyExpiresAt || null, condition_received: input.conditionReceived?.trim() || null,
    condition_returned: input.conditionReturned?.trim() || null, technician_user_id: input.technicianUserId || null,
    technician_name: input.technicianName?.trim() || null, notes: input.notes?.trim() || null, created_by: user.id,
  }).select('*').single();
  return error ? { success: false as const, message: error.message } : { success: true as const, message: 'Repair job created', data };
}

export async function updateRepairStatus(repairId: string, status: RepairStatus) {
  const { supabase } = await requireAdmin();
  const patch: Record<string, unknown> = { status };
  if (status === 'ready_collection') patch.completed_at = new Date().toISOString();
  if (status === 'collected') patch.collected_at = new Date().toISOString();
  const { error } = await supabase.from('ops_repairs').update(patch).eq('id', repairId);
  return error ? { success: false as const, message: error.message } : { success: true as const, message: 'Repair status updated' };
}

export async function getSolarInstallation(orderItemId: string): Promise<OperationsSolarInstallation | null> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from('ops_solar_installations').select('*').eq('order_item_id', orderItemId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? ({ ...data, installation_cost: Number(data.installation_cost || 0) } as OperationsSolarInstallation) : null;
}

export async function saveSolarInstallation(input: {
  orderId: string; orderItemId: string; installationRequired: boolean; installationAddress?: string | null; scheduledAt?: string | null;
  installerUserId?: string | null; installerName?: string | null; installationCost?: number; systemCapacity?: string | null;
  status: SolarInstallationStatus; notes?: string | null;
}) {
  const { supabase, user } = await requireAdmin();
  const payload = {
    order_id: input.orderId, order_item_id: input.orderItemId, installation_required: input.installationRequired,
    installation_address: input.installationAddress?.trim() || null, scheduled_at: input.scheduledAt || null,
    installer_user_id: input.installerUserId || null, installer_name: input.installerName?.trim() || null,
    installation_cost: Math.max(0, Number(input.installationCost || 0)), system_capacity: input.systemCapacity?.trim() || null,
    status: input.status, notes: input.notes?.trim() || null, created_by: user.id,
  };
  const { data, error } = await supabase.from('ops_solar_installations').upsert(payload, { onConflict: 'order_item_id' }).select('*').single();
  return error ? { success: false as const, message: error.message } : { success: true as const, message: 'Solar installation saved', data };
}
