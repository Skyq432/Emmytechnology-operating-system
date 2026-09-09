import { randomInt } from 'node:crypto';
import { createClient } from '@/lib/supabase-server';
import { resolveOrCreateOperationsIdentity } from './identity-server';
import type {
  OperationsRepair,
  OperationsRepairCardAssignment,
  OperationsRepairConsent,
  OperationsRepairEvent,
  OperationsRepairPayment,
  OperationsRepairQuote,
  PaymentMethod,
  RepairPaymentRequirement,
  RepairStatus,
} from './types';

const REPAIR_PIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');
  const { data: profile, error: profileError } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profileError || profile?.role !== 'admin') throw new Error('Not authorized');
  return { supabase, user };
}

export function generateRepairPin() {
  return Array.from({ length: 4 }, () => REPAIR_PIN_ALPHABET[randomInt(REPAIR_PIN_ALPHABET.length)]).join('');
}

export async function getAvailableRepairCards() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from('ops_repair_cards')
    .select('id,card_code,status')
    .eq('status', 'available')
    .order('card_code');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getRepairAdminDetail(repairId: string) {
  const { supabase } = await requireAdmin();
  const [repairResult, assignmentsResult, quotesResult, paymentsResult, consentsResult, eventsResult] = await Promise.all([
    supabase.from('ops_repairs').select('*').eq('id', repairId).single(),
    supabase.from('ops_repair_card_assignments').select('*,card:ops_repair_cards(*)').eq('repair_id', repairId).order('assigned_at', { ascending: false }),
    supabase.from('ops_repair_quotes').select('*').eq('repair_id', repairId).order('version', { ascending: false }),
    supabase.from('ops_repair_payments').select('*').eq('repair_id', repairId).order('paid_at', { ascending: false }),
    supabase.from('ops_repair_consents').select('*').eq('repair_id', repairId).order('created_at', { ascending: false }),
    supabase.from('ops_repair_events').select('*').eq('repair_id', repairId).order('created_at', { ascending: false }),
  ]);

  const error = repairResult.error || assignmentsResult.error || quotesResult.error || paymentsResult.error || consentsResult.error || eventsResult.error;
  if (error) throw new Error(error.message);

  const repair = {
    ...repairResult.data,
    parts_cost: Number(repairResult.data.parts_cost || 0),
    labour_cost: Number(repairResult.data.labour_cost || 0),
    amount_charged: Number(repairResult.data.amount_charged || 0),
    repair_profit: Number(repairResult.data.repair_profit || 0),
    amount_paid: Number(repairResult.data.amount_paid || 0),
    balance_due: Number(repairResult.data.balance_due || 0),
  } as OperationsRepair;

  const assignments = (assignmentsResult.data || []) as OperationsRepairCardAssignment[];
  const quotes = (quotesResult.data || []).map((row) => ({
    ...row,
    quote_amount: Number(row.quote_amount || 0),
    required_before_start: Number(row.required_before_start || 0),
  })) as OperationsRepairQuote[];
  const payments = (paymentsResult.data || []).map((row) => ({ ...row, amount: Number(row.amount || 0) })) as OperationsRepairPayment[];

  return {
    repair,
    activeAssignment: assignments.find((row) => row.status === 'active') || null,
    assignmentHistory: assignments,
    currentQuote: quotes.find((row) => row.id === repair.current_quote_id) || null,
    quoteHistory: quotes,
    payments,
    consents: (consentsResult.data || []) as OperationsRepairConsent[],
    events: (eventsResult.data || []) as OperationsRepairEvent[],
  };
}

export async function updateRepairWorkDetails(input: {
  repairId: string;
  diagnosis?: string | null;
  repairType?: string | null;
  partsReplaced?: string | null;
  partsCost?: number;
  labourCost?: number;
  technicianName?: string | null;
  conditionReturned?: string | null;
  warrantyPeriod?: string | null;
  warrantyExpiresAt?: string | null;
  notes?: string | null;
}) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from('ops_repairs').update({
    diagnosis: input.diagnosis?.trim() || null,
    repair_type: input.repairType?.trim() || null,
    parts_replaced: input.partsReplaced?.trim() || null,
    parts_cost: Math.max(0, Number(input.partsCost || 0)),
    labour_cost: Math.max(0, Number(input.labourCost || 0)),
    technician_name: input.technicianName?.trim() || null,
    condition_returned: input.conditionReturned?.trim() || null,
    warranty_period: input.warrantyPeriod?.trim() || null,
    warranty_expires_at: input.warrantyExpiresAt || null,
    notes: input.notes?.trim() || null,
  }).eq('id', input.repairId);
  return error ? { success: false as const, message: error.message } : { success: true as const, message: 'Repair work details saved' };
}

export async function createRepairWithCard(input: {
  cardId: string;
  identityId?: string | null;
  originalOrderId?: string | null;
  inventoryUnitId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  deviceType?: string | null;
  brand?: string | null;
  model?: string | null;
  serialOrImei?: string | null;
  purchasedFromUs?: 'yes' | 'no' | 'not_sure';
  faultReported: string;
  diagnosis?: string | null;
  repairType?: string | null;
  partsReplaced?: string | null;
  partsCost?: number;
  labourCost?: number;
  amountCharged?: number;
  warrantyPeriod?: string | null;
  warrantyExpiresAt?: string | null;
  conditionReceived?: string | null;
  conditionReturned?: string | null;
  accessoriesReceived?: string | null;
  technicianUserId?: string | null;
  technicianName?: string | null;
  notes?: string | null;
}) {
  const { supabase } = await requireAdmin();
  const identityId = await resolveOrCreateOperationsIdentity({
    existingIdentityId: input.identityId,
    name: input.customerName,
    phone: input.customerPhone,
    email: input.customerEmail,
    source: 'operations_repair',
  });
  const accessPin = generateRepairPin();
  const { data, error } = await supabase.rpc('ops_create_repair_with_card', {
    p_card_id: input.cardId,
    p_identity_id: identityId,
    p_access_pin: accessPin,
    p_fault_reported: input.faultReported.trim(),
    p_original_order_id: input.originalOrderId || null,
    p_inventory_unit_id: input.inventoryUnitId || null,
    p_customer_name: input.customerName?.trim() || null,
    p_customer_phone: input.customerPhone?.trim() || null,
    p_customer_email: input.customerEmail?.trim().toLowerCase() || null,
    p_device_type: input.deviceType?.trim() || null,
    p_brand: input.brand?.trim() || null,
    p_model: input.model?.trim() || null,
    p_serial_or_imei: input.serialOrImei?.trim() || null,
    p_purchased_from_us: input.purchasedFromUs || 'not_sure',
    p_diagnosis: input.diagnosis?.trim() || null,
    p_repair_type: input.repairType?.trim() || null,
    p_parts_replaced: input.partsReplaced?.trim() || null,
    p_parts_cost: Math.max(0, Number(input.partsCost || 0)),
    p_labour_cost: Math.max(0, Number(input.labourCost || 0)),
    p_amount_charged: Math.max(0, Number(input.amountCharged || 0)),
    p_warranty_period: input.warrantyPeriod?.trim() || null,
    p_warranty_expires_at: input.warrantyExpiresAt || null,
    p_condition_received: input.conditionReceived?.trim() || null,
    p_condition_returned: input.conditionReturned?.trim() || null,
    p_accessories_received: input.accessoriesReceived?.trim() || null,
    p_technician_user_id: input.technicianUserId || null,
    p_technician_name: input.technicianName?.trim() || null,
    p_notes: input.notes?.trim() || null,
  });
  return error
    ? { success: false as const, message: error.message }
    : { success: true as const, message: 'Repair created and Repair Card assigned', data };
}

export async function publishRepairQuote(input: {
  repairId: string;
  diagnosisPublic?: string | null;
  workDescription?: string | null;
  quoteAmount: number;
  estimatedCompletion?: string | null;
  paymentRequirement: RepairPaymentRequirement;
  requiredBeforeStart?: number;
}) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc('ops_publish_repair_quote', {
    p_repair_id: input.repairId,
    p_diagnosis_public: input.diagnosisPublic?.trim() || null,
    p_work_description: input.workDescription?.trim() || null,
    p_quote_amount: Math.max(0, Number(input.quoteAmount || 0)),
    p_estimated_completion: input.estimatedCompletion?.trim() || null,
    p_payment_requirement: input.paymentRequirement,
    p_required_before_start: Math.max(0, Number(input.requiredBeforeStart || 0)),
  });
  return error ? { success: false as const, message: error.message } : { success: true as const, message: 'Repair quote published', data };
}

export async function recordRepairPayment(input: {
  repairId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  paidAt?: string | null;
  note?: string | null;
}) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc('ops_record_repair_payment', {
    p_repair_id: input.repairId,
    p_amount: Math.max(0, Number(input.amount || 0)),
    p_payment_method: input.paymentMethod,
    p_reference: input.reference?.trim() || null,
    p_paid_at: input.paidAt || new Date().toISOString(),
    p_note: input.note?.trim() || null,
  });
  return error ? { success: false as const, message: error.message } : { success: true as const, message: 'Repair payment recorded', data };
}

export async function regenerateRepairPin(repairId: string) {
  const { supabase } = await requireAdmin();
  const accessPin = generateRepairPin();
  const { data, error } = await supabase.rpc('ops_regenerate_repair_pin', {
    p_repair_id: repairId,
    p_new_pin: accessPin,
  });
  return error ? { success: false as const, message: error.message } : { success: true as const, message: 'Repair PIN regenerated', data };
}

export async function advanceRepairWorkflow(repairId: string, status: RepairStatus, note?: string | null) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc('ops_change_repair_status', {
    p_repair_id: repairId,
    p_new_status: status,
    p_note: note?.trim() || null,
  });
  return error ? { success: false as const, message: error.message } : { success: true as const, message: 'Repair status updated', data };
}

export async function beginRepairHandover(repairId: string) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc('ops_begin_repair_handover', { p_repair_id: repairId });
  return error ? { success: false as const, message: error.message } : { success: true as const, message: 'Customer handover started', data };
}

export async function completeRepairCollection(input: {
  repairId: string;
  cardReturned: boolean;
  missingCardReason?: string | null;
}) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc('ops_complete_repair_collection', {
    p_repair_id: input.repairId,
    p_card_returned: input.cardReturned,
    p_missing_card_reason: input.missingCardReason?.trim() || null,
  });
  return error ? { success: false as const, message: error.message } : { success: true as const, message: 'Repair collection completed', data };
}
