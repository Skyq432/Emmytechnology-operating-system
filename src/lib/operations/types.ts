import type { OrderStatus } from './domain';
import type { CommercialState, CommissionStatus, PaymentStatus } from './commercial';
import type { OrderItemType } from './sales-model';
import type { RepairStatus, RepairPaymentRequirement, RepairQuoteStatus } from './repair-domain';
export type { RepairStatus, RepairPaymentRequirement, RepairQuoteStatus } from './repair-domain';

export type OperationsPriority = 'low' | 'normal' | 'high' | 'urgent';
export type OperationsSource = 'manual' | 'crm' | 'website' | 'whatsapp' | 'internal' | 'other';
export type WebsiteRelationshipType = 'stocked' | 'preorder' | 'on_demand' | 'dropship' | 'service' | 'display_only';
export type FulfilmentSource = 'internal' | 'supplier' | 'dropship' | 'manual';
export type PaymentMethod = 'bank_transfer' | 'pos' | 'cash' | 'split' | 'other';
export type InventoryUnitStatus = 'available' | 'reserved' | 'in_transit' | 'sold' | 'repair' | 'returned' | 'faulty' | 'retired';
export type RepairCardStatus = 'available' | 'assigned' | 'missing' | 'retired';
export type RepairCardAssignmentStatus = 'active' | 'closed';
export type RepairConsentType = 'repair_authorization' | 'completion_acceptance' | 'unrepaired_return_acknowledgement';
export type SolarInstallationStatus = 'not_required' | 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface OperationsIdentitySummary {
  id: string; identity_code: string; primary_name: string | null; primary_phone: string | null; primary_email: string | null;
  crm_stage: number; crm_stage_name: string; lead_id: string | null; ambassador_id: string | null; ambassador_name: string | null;
  acquisition_source: string | null; cash_off_balance: number;
}

export interface OperationsLocation { id: string; code: string; name: string; location_type: string; }

export interface OperationsOverview {
  openOrders: number; urgentOrders: number; awaitingDispatch: number; inventoryItems: number; lowStockItems: number; websiteLinks: number;
  recentOrders: OperationsOrder[]; recentEvents: OperationsOrderEvent[];
}

export interface OperationsOrder {
  id: string; order_code: string; source_type: OperationsSource; source_reference: string | null; reference_label: string | null;
  identity_id: string | null; lead_id: string | null; ambassador_id: string | null; conversion_id: string | null;
  customer_name: string | null; customer_phone: string | null; customer_email: string | null; commercial_state: CommercialState;
  acquisition_source: string | null; attribution_note: string | null; order_type: OrderItemType; sales_staff_user_id: string | null; sales_staff_name: string | null;
  subtotal: number; discount_type: string | null; discount_amount: number; discount_percentage: number; discount_reason: string | null;
  cash_off_amount: number; delivery_charge: number; total_amount: number; amount_paid: number; balance_due: number; payment_status: PaymentStatus;
  commission_rate: number; commission_amount: number; commission_status: CommissionStatus; confirmed_at: string | null;
  status: OrderStatus; priority: OperationsPriority; current_team: string | null; current_owner_id: string | null; due_at: string | null;
  created_at: string; updated_at: string; items?: OperationsOrderItem[];
}

export interface OperationsOrderItem {
  id: string; order_id: string; inventory_item_id: string | null; website_product_id: string | null; item_name: string; item_type: OrderItemType;
  brand: string | null; model: string | null; condition: string | null; quantity: number; quantity_reserved: number; unit_price: number | null; list_price: number | null;
  unit_cost_snapshot: number | null; line_discount_amount: number; line_total: number; warranty_period: string | null; warranty_expires_at: string | null;
  specs: Record<string, unknown>; fulfilment_source: FulfilmentSource; source_location_id: string | null; note: string | null;
}

export interface OperationsOrderPayment { id: string; order_id: string; amount: number; payment_method: PaymentMethod; reference: string | null; paid_at: string; note: string | null; is_void: boolean; recorded_by: string | null; created_at: string; }
export interface OperationsSupplier { id: string; name: string; phone: string | null; email: string | null; address: string | null; notes: string | null; is_active: boolean; created_at: string; updated_at: string; }
export interface OperationsInventoryUnit {
  id: string; inventory_item_id: string; serial_number: string | null; imei_1: string | null; imei_2: string | null; condition: string | null;
  acquisition_date: string | null; unit_cost: number | null; supplier_id: string | null; current_location_id: string | null; status: InventoryUnitStatus;
  reserved_order_id: string | null; reserved_order_item_id: string | null; sold_order_id: string | null; sold_order_item_id: string | null; note: string | null;
  created_at: string; updated_at: string; supplier?: { id: string; name: string } | null; location?: { id: string; name: string; code: string } | null;
}

export interface OperationsRepair {
  id: string; repair_code: string; identity_id: string | null; original_order_id: string | null; inventory_unit_id: string | null; customer_name: string | null;
  customer_phone: string | null; customer_email: string | null; received_at: string; completed_at: string | null; collected_at: string | null; device_type: string | null; brand: string | null;
  model: string | null; serial_or_imei: string | null; purchased_from_us: 'yes' | 'no' | 'not_sure'; fault_reported: string; diagnosis: string | null;
  repair_type: string | null; parts_replaced: string | null; parts_cost: number; labour_cost: number; amount_charged: number; repair_profit: number; status: RepairStatus;
  warranty_period: string | null; warranty_expires_at: string | null; condition_received: string | null; condition_returned: string | null; accessories_received: string | null;
  payment_status: 'unpaid' | 'partial' | 'paid' | 'refunded'; amount_paid: number; balance_due: number; technician_user_id: string | null; technician_name: string | null;
  current_quote_id: string | null; current_card_assignment_id: string | null; notes: string | null; created_at: string; updated_at: string;
}

export interface OperationsRepairCard {
  id: string; card_code: string; public_token: string; status: RepairCardStatus; created_by: string | null; created_at: string; updated_at: string;
}

export interface OperationsRepairCardAssignment {
  id: string; card_id: string; repair_id: string; identity_id: string; access_pin: string; pin_version: number; status: RepairCardAssignmentStatus;
  handover_started_at: string | null; handover_expires_at: string | null; assigned_by: string | null; closed_by: string | null; assigned_at: string; closed_at: string | null;
  card?: OperationsRepairCard | null;
}

export interface OperationsRepairQuote {
  id: string; repair_id: string; version: number; diagnosis_public: string | null; work_description: string | null; quote_amount: number; estimated_completion: string | null;
  payment_requirement: RepairPaymentRequirement; required_before_start: number; status: RepairQuoteStatus; published_at: string | null; approved_at: string | null; declined_at: string | null;
  created_by: string | null; created_at: string;
}

export interface OperationsRepairPayment {
  id: string; repair_id: string; amount: number; payment_method: PaymentMethod; reference: string | null; paid_at: string; note: string | null; is_void: boolean;
  voided_at: string | null; voided_by: string | null; recorded_by: string | null; created_at: string;
}

export interface OperationsRepairConsent {
  id: string; repair_id: string; assignment_id: string; identity_id: string; quote_id: string | null; consent_type: RepairConsentType; consent_version: string;
  snapshot: Record<string, unknown>; portal_session_id: string | null; created_at: string;
}

export interface OperationsRepairEvent {
  id: string; repair_id: string; assignment_id: string | null; event_type: string; title: string; note: string | null; from_status: string | null; to_status: string | null;
  customer_visible: boolean; metadata: Record<string, unknown>; actor_id: string | null; created_at: string;
}

export interface OperationsRepairPortalSession {
  id: string; assignment_id: string; token_hash: string; pin_version: number; expires_at: string; revoked_at: string | null; created_at: string; last_seen_at: string | null;
}

export interface OperationsRepairAccessAttempt {
  id: string; card_id: string; assignment_id: string | null; client_fingerprint: string | null; succeeded: boolean; created_at: string;
}

export interface OperationsSolarInstallation {
  id: string; order_id: string; order_item_id: string; installation_required: boolean; installation_address: string | null; scheduled_at: string | null;
  completed_at: string | null; installer_user_id: string | null; installer_name: string | null; installation_cost: number; system_capacity: string | null;
  status: SolarInstallationStatus; notes: string | null; created_at: string; updated_at: string;
}

export interface OperationsOrderEvent { id: string; order_id: string; event_type: string; title: string; note: string | null; from_status: string | null; to_status: string | null; actor_id: string | null; metadata: Record<string, unknown>; created_at: string; }
export interface OperationsHandover { id: string; order_id: string; from_team: string | null; from_user_id: string | null; to_team: string; to_user_id: string | null; note: string | null; status: 'pending' | 'acknowledged' | 'cancelled'; acknowledged_by: string | null; acknowledged_at: string | null; acknowledgement_note: string | null; created_by: string | null; created_at: string; updated_at: string; }
export interface OperationsReservation { id: string; order_id: string; order_item_id: string; inventory_item_id: string; location_id: string; quantity: number; status: 'active' | 'released' | 'fulfilled' | 'cancelled'; created_at: string; }

export interface OperationsOrderDetail {
  order: OperationsOrder; events: OperationsOrderEvent[]; handoffs: OperationsHandover[]; reservations: OperationsReservation[];
  users: Array<{ id: string; name: string | null; email: string | null }>; locations: OperationsLocation[];
  identity: { id: string; identity_code: string; primary_name: string | null; primary_phone: string | null; primary_email: string | null; crm_stage: number } | null;
  ambassador: { id: string; name: string } | null;
}

export interface OperationsInventoryItem {
  id: string; sku: string; name: string; description: string | null; category: string | null; item_type: OrderItemType; brand: string | null; model: string | null;
  specs: Record<string, unknown>; default_condition: string | null; default_unit_cost: number | null; default_selling_price: number | null; preferred_supplier_id: string | null;
  unit: string; serial_tracking: boolean; reorder_level: number; is_active: boolean; created_at: string; updated_at: string;
  on_hand?: number; reserved?: number; available?: number;
  location_balances?: Array<{ location_id: string; location_code: string; location_name: string; on_hand: number; reserved: number; available: number }>;
}

export interface OperationsWebsiteLink { id: string; inventory_item_id: string; website_product_id: string; relationship_type: WebsiteRelationshipType; website_allocation: number | null; stock_sync_enabled: boolean; is_active: boolean; created_at: string; inventory_item?: { sku: string; name: string } | null; website_product?: { name: string; slug: string; status: string | null } | null; }
