export const INTERNAL_ROLES = [
  'super_admin',
  'admin',
  'growth_lead',
  'marketing_manager',
  'front_desk',
  'operations_lead',
  'technician',
  'sales_analyst',
] as const;

export type InternalRole = (typeof INTERNAL_ROLES)[number];
export type EmmyRole = InternalRole | 'ambassador';

export const MODULE_SLUGS = [
  'crm',
  'marketing',
  'sales',
  'operations',
  'finance',
  'reports',
  'administration',
] as const;

export type ModuleSlug = (typeof MODULE_SLUGS)[number];

export const ROLE_LABELS: Record<EmmyRole, string> = {
  super_admin: 'Supreme Administrator',
  admin: 'Administrator',
  growth_lead: 'Growth Lead',
  marketing_manager: 'Marketing Manager',
  front_desk: 'Front Desk',
  operations_lead: 'Operations Lead',
  technician: 'Technician',
  sales_analyst: 'Sales Analyst',
  ambassador: 'Ambassador',
};

const MODULE_ACCESS: Record<InternalRole, readonly ModuleSlug[]> = {
  super_admin: MODULE_SLUGS,
  admin: MODULE_SLUGS,
  growth_lead: ['crm', 'marketing', 'sales', 'operations', 'reports'],
  marketing_manager: ['crm', 'marketing'],
  front_desk: ['sales', 'operations'],
  operations_lead: ['crm', 'sales', 'operations'],
  technician: ['sales', 'operations'],
  sales_analyst: ['crm', 'sales', 'reports'],
};

export const SALES_NAV_KEYS = [
  'overview',
  'direct',
  'quotations',
  'orders',
  'payments',
  'receipts',
  'customers',
  'credit',
  'returns',
  'team',
  'reports',
  'settings',
] as const;

export type SalesNavKey = (typeof SALES_NAV_KEYS)[number];

const SALES_ACCESS: Record<InternalRole, readonly SalesNavKey[]> = {
  super_admin: SALES_NAV_KEYS,
  admin: SALES_NAV_KEYS,
  growth_lead: SALES_NAV_KEYS,
  marketing_manager: [],
  front_desk: ['direct', 'orders', 'payments', 'receipts', 'customers'],
  operations_lead: ['overview', 'direct', 'orders', 'payments', 'receipts', 'customers'],
  technician: ['direct', 'receipts', 'customers'],
  sales_analyst: ['overview', 'quotations', 'orders', 'customers', 'reports'],
};

export const OPERATIONS_NAV_KEYS = [
  'overview',
  'orders',
  'products',
  'inventory',
  'transfers',
  'suppliers',
  'repairs',
  'websiteLinks',
] as const;

export type OperationsNavKey = (typeof OPERATIONS_NAV_KEYS)[number];

const OPERATIONS_ACCESS: Record<InternalRole, readonly OperationsNavKey[]> = {
  super_admin: OPERATIONS_NAV_KEYS,
  admin: OPERATIONS_NAV_KEYS,
  growth_lead: OPERATIONS_NAV_KEYS,
  marketing_manager: [],
  front_desk: ['orders', 'inventory', 'transfers', 'repairs'],
  operations_lead: OPERATIONS_NAV_KEYS,
  technician: ['inventory', 'repairs'],
  sales_analyst: [],
};

export const STAFF_CAPABILITIES = [
  'sales.read',
  'sales.direct.manage',
  'sales.order.manage',
  'sales.payment.record',
  'sales.quotation.manage',
  'sales.return.manage',
  'sales.credit.approve',
  'sales.refund.manage',
  'sales.document.void',
  'sales.pricing.admin',
  'sales.settings.manage',
  'operations.read',
  'operations.order.manage',
  'operations.inventory.read',
  'operations.inventory.manage',
  'operations.transfer.manage',
  'operations.repair.read',
  'operations.repair.intake',
  'operations.repair.technical',
  'operations.repair.finance',
  'operations.repair.handover',
  'operations.supplier.manage',
  'operations.website.manage',
] as const;

export type StaffCapability = (typeof STAFF_CAPABILITIES)[number];

const STAFF_CAPABILITY_ACCESS: Record<InternalRole, readonly StaffCapability[]> = {
  super_admin: STAFF_CAPABILITIES,
  admin: STAFF_CAPABILITIES,
  growth_lead: [
    'sales.read',
    'sales.direct.manage',
    'sales.order.manage',
    'sales.payment.record',
    'sales.quotation.manage',
    'sales.return.manage',
    'operations.read',
    'operations.order.manage',
    'operations.inventory.read',
    'operations.transfer.manage',
    'operations.repair.read',
    'operations.repair.intake',
    'operations.repair.technical',
    'operations.repair.finance',
    'operations.repair.handover',
  ],
  marketing_manager: [],
  front_desk: [
    'sales.read',
    'sales.direct.manage',
    'sales.order.manage',
    'sales.payment.record',
    'operations.read',
    'operations.order.manage',
    'operations.inventory.read',
    'operations.transfer.manage',
    'operations.repair.read',
    'operations.repair.intake',
    'operations.repair.finance',
    'operations.repair.handover',
  ],
  operations_lead: [
    'sales.read',
    'sales.direct.manage',
    'sales.order.manage',
    'sales.payment.record',
    'operations.read',
    'operations.order.manage',
    'operations.inventory.read',
    'operations.inventory.manage',
    'operations.transfer.manage',
    'operations.repair.read',
    'operations.repair.intake',
    'operations.repair.technical',
    'operations.repair.finance',
    'operations.repair.handover',
    'operations.supplier.manage',
    'operations.website.manage',
  ],
  technician: [
    'sales.read',
    'sales.direct.manage',
    'operations.read',
    'operations.inventory.read',
    'operations.repair.read',
    'operations.repair.technical',
  ],
  sales_analyst: ['sales.read'],
};

export function isInternalRole(role: string | null | undefined): role is InternalRole {
  return typeof role === 'string' && (INTERNAL_ROLES as readonly string[]).includes(role);
}

export function accessibleModules(role: string | null | undefined): readonly ModuleSlug[] {
  return isInternalRole(role) ? MODULE_ACCESS[role] : [];
}

export function canAccessModule(role: string | null | undefined, module: ModuleSlug): boolean {
  return accessibleModules(role).includes(module);
}

export function salesNavKeys(role: string | null | undefined): readonly SalesNavKey[] {
  return isInternalRole(role) ? SALES_ACCESS[role] : [];
}

export function operationsNavKeys(role: string | null | undefined): readonly OperationsNavKey[] {
  return isInternalRole(role) ? OPERATIONS_ACCESS[role] : [];
}

export function capabilitiesForRole(role: string | null | undefined): readonly StaffCapability[] {
  return isInternalRole(role) ? STAFF_CAPABILITY_ACCESS[role] : [];
}

export function hasCapability(role: string | null | undefined, capability: StaffCapability): boolean {
  return capabilitiesForRole(role).includes(capability);
}

export function canCreateStaffInvite(role: string | null | undefined): boolean {
  return role === 'super_admin' || role === 'admin';
}

export function canCreateAmbassadorInvite(role: string | null | undefined): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'growth_lead' || role === 'marketing_manager';
}

export function roleLabel(role: string | null | undefined): string {
  if (!role) return 'User';
  if (role in ROLE_LABELS) return ROLE_LABELS[role as EmmyRole];
  return role.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
