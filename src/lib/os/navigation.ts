import {
  BarChart3,
  CircleDollarSign,
  Megaphone,
  PackageCheck,
  Settings,
  ShoppingCart,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ModuleSlug } from '@/lib/auth/roles';

/**
 * Primary module nav data — consolidated from what used to be an inline
 * `departments` array in the (now-deleted) ambassador-style-dashboard.tsx,
 * so AppShell's sidebar has a single source for module icon/label/description.
 */
export const PRIMARY_MODULE_NAV: Record<ModuleSlug, { label: string; description: string; icon: LucideIcon }> = {
  crm: { label: 'CRM', description: 'Customers, leads, opportunities, follow-ups and pipeline movement.', icon: Users },
  marketing: { label: 'Marketing', description: 'Campaigns, ambassadors, referrals, Spin Wheel, SMS and WhatsApp.', icon: Megaphone },
  sales: { label: 'Sales', description: 'Quotations, orders, payments, discounts and sales performance.', icon: ShoppingCart },
  operations: { label: 'Operations', description: 'Inventory, fulfilment, delivery, repairs, procurement and service flow.', icon: PackageCheck },
  finance: { label: 'Finance', description: 'Income, expenses, receivables, payables, payroll and budgets.', icon: CircleDollarSign },
  reports: { label: 'Reports', description: 'Company-wide performance, trends, management reports and insights.', icon: BarChart3 },
  administration: { label: 'Administration', description: 'Staff, departments, permissions, approvals and company controls.', icon: Settings },
};
