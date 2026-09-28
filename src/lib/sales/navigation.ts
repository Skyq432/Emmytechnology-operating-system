export const SALES_NAV = [
  { key: 'overview', label: 'Overview', href: '/modules/sales' },
  { key: 'direct', label: 'Direct Sale', href: '/modules/sales/direct' },
  { key: 'quotations', label: 'Quotations', href: '/modules/sales/quotations' },
  { key: 'orders', label: 'Orders', href: '/modules/sales/orders' },
  { key: 'payments', label: 'Payments', href: '/modules/sales/payments' },
  { key: 'receipts', label: 'Receipts', href: '/modules/sales/receipts' },
  { key: 'customers', label: 'Customers', href: '/modules/sales/customers' },
  { key: 'credit', label: 'Credit & Outstanding', href: '/modules/sales/credit' },
  { key: 'returns', label: 'Returns & Refunds', href: '/modules/sales/returns' },
  { key: 'team', label: 'Sales Team', href: '/modules/sales/team' },
  { key: 'reports', label: 'Reports', href: '/modules/sales/reports' },
  { key: 'settings', label: 'Settings', href: '/modules/sales/settings' },
  // Lives outside /modules/sales on purpose — front_desk (sales-only) and
  // marketing_manager (marketing-only) both need this page, and no single module's
  // layout gate covers both, so it isn't nested under either module's route tree.
  { key: 'referralTracker', label: 'Referral Tracker', href: '/modules/referral-tracker' },
] as const;
