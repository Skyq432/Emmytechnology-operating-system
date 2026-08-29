import type { OrderStatus } from './domain';

export type OperationsPriority = 'low' | 'normal' | 'high' | 'urgent';
export type OperationsSource = 'manual' | 'crm' | 'website' | 'whatsapp' | 'internal' | 'other';
export type WebsiteRelationshipType =
  | 'stocked'
  | 'preorder'
  | 'on_demand'
  | 'dropship'
  | 'service'
  | 'display_only';

export interface OperationsOverview {
  openOrders: number;
  urgentOrders: number;
  awaitingDispatch: number;
  inventoryItems: number;
  lowStockItems: number;
  websiteLinks: number;
  recentOrders: OperationsOrder[];
  recentEvents: OperationsOrderEvent[];
}

export interface OperationsOrder {
  id: string;
  order_code: string;
  source_type: OperationsSource;
  source_reference: string | null;
  reference_label: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  status: OrderStatus;
  priority: OperationsPriority;
  current_team: string | null;
  current_owner_id: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  items?: OperationsOrderItem[];
}

export interface OperationsOrderItem {
  id: string;
  order_id: string;
  inventory_item_id: string | null;
  website_product_id: string | null;
  item_name: string;
  quantity: number;
  quantity_reserved: number;
  unit_price: number | null;
  note: string | null;
}

export interface OperationsOrderEvent {
  id: string;
  order_id: string;
  event_type: string;
  title: string;
  note: string | null;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface OperationsInventoryItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  serial_tracking: boolean;
  reorder_level: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  on_hand?: number;
}

export interface OperationsWebsiteLink {
  id: string;
  inventory_item_id: string;
  website_product_id: string;
  relationship_type: WebsiteRelationshipType;
  website_allocation: number | null;
  stock_sync_enabled: boolean;
  is_active: boolean;
  created_at: string;
  inventory_item?: { sku: string; name: string } | null;
  website_product?: { name: string; slug: string; status: string | null } | null;
}
