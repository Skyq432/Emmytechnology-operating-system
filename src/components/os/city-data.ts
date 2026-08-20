export type ModuleStatus = 'live' | 'building' | 'planned';
export type ModuleAccent = 'blue' | 'yellow';

export type EmmyModule = {
  id: string;
  name: string;
  description: string;
  position: [number, number, number];
  level: number;
  status: ModuleStatus;
  metric: string;
  accent: ModuleAccent;
  kind: 'crm' | 'sales' | 'operations' | 'marketing' | 'finance' | 'reports' | 'administration';
};

export const modules: EmmyModule[] = [
  {
    id: 'crm',
    name: 'CRM',
    description: 'Customers, leads, funnel progress, blockers and next-best actions.',
    position: [-5.4, 0, 1.9],
    level: 2,
    status: 'building',
    metric: 'Foundation',
    accent: 'blue',
    kind: 'crm',
  },
  {
    id: 'sales',
    name: 'Sales',
    description: 'Quotations, orders, payments, receipts and commercial activity.',
    position: [-3.2, 0, -2.4],
    level: 2,
    status: 'planned',
    metric: 'Planned',
    accent: 'yellow',
    kind: 'sales',
  },
  {
    id: 'operations',
    name: 'Operations',
    description: 'Products, inventory, delivery, repairs and process control.',
    position: [2.7, 0, -2.8],
    level: 2,
    status: 'planned',
    metric: 'Planned',
    accent: 'yellow',
    kind: 'operations',
  },
  {
    id: 'marketing',
    name: 'Marketing',
    description: 'Ambassadors, Spin Wheel, referrals, campaigns and acquisition.',
    position: [5.3, 0, 0.3],
    level: 3,
    status: 'building',
    metric: 'Ready to connect',
    accent: 'blue',
    kind: 'marketing',
  },
  {
    id: 'administration',
    name: 'Administration',
    description: 'Staff, departments, roles, permissions, approvals and governance.',
    position: [-3.7, 0, 4.2],
    level: 1,
    status: 'building',
    metric: 'Foundation',
    accent: 'yellow',
    kind: 'administration',
  },
  {
    id: 'reports',
    name: 'Reports',
    description: 'Executive and cross-department reporting across EmmyTech OS.',
    position: [1.9, 0, 4.6],
    level: 1,
    status: 'planned',
    metric: 'Planned',
    accent: 'blue',
    kind: 'reports',
  },
  {
    id: 'finance',
    name: 'Finance',
    description: 'Income, expenses, receivables, payables, budgets and financial reporting.',
    position: [5.0, 0, 4.1],
    level: 1,
    status: 'planned',
    metric: 'Planned',
    accent: 'blue',
    kind: 'finance',
  },
];
