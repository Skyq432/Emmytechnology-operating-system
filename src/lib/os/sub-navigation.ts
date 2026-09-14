import {
  Activity,
  Banknote,
  BarChart3,
  Boxes,
  CircleGauge,
  ClipboardList,
  ContactRound,
  FileText,
  Gauge,
  HandCoins,
  Link2,
  ListTodo,
  MessageCircle,
  MessageSquareText,
  NotebookPen,
  Package,
  ReceiptText,
  Repeat2,
  RotateCcw,
  Settings,
  ShoppingBag,
  Stethoscope,
  Target,
  Users,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { operationsNavKeys, salesNavKeys, type ModuleSlug } from '@/lib/auth/roles';
import { OPERATIONS_NAV } from '@/lib/operations/help';
import { SALES_NAV } from '@/lib/sales/navigation';

export interface ModuleSubNavItem {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  help?: string;
  /** Exact-match this href instead of prefix-matching (use for the module's own root/overview link). */
  exact?: boolean;
}

const SALES_ICONS: Record<(typeof SALES_NAV)[number]['key'], LucideIcon> = {
  overview: Gauge,
  direct: ShoppingBag,
  quotations: FileText,
  orders: ClipboardList,
  payments: Banknote,
  receipts: ReceiptText,
  customers: UsersRound,
  credit: WalletCards,
  returns: RotateCcw,
  team: HandCoins,
  reports: BarChart3,
  settings: Settings,
};

const OPERATIONS_ICONS: Record<(typeof OPERATIONS_NAV)[number]['key'], LucideIcon> = {
  overview: Gauge,
  orders: ClipboardList,
  products: Package,
  inventory: Boxes,
  transfers: Repeat2,
  suppliers: UsersRound,
  repairs: Stethoscope,
  websiteLinks: Link2,
};

function buildSalesNav(role: string | null | undefined): ModuleSubNavItem[] {
  const allowed = salesNavKeys(role);
  return SALES_NAV.filter((item) => allowed.includes(item.key)).map((item) => ({
    key: item.key,
    href: item.href,
    label: item.label,
    icon: SALES_ICONS[item.key],
    exact: item.href === '/modules/sales',
  }));
}

function buildOperationsNav(role: string | null | undefined): ModuleSubNavItem[] {
  const allowed = operationsNavKeys(role);
  return OPERATIONS_NAV.filter((item) => allowed.includes(item.key)).map((item) => ({
    key: item.key,
    href: item.href,
    label: item.label,
    icon: OPERATIONS_ICONS[item.key],
    help: item.help,
    exact: item.href === '/modules/operations',
  }));
}

// Marketing has no single flat section list — which sections apply depends on which
// "solution" (Ambassador vs Spin Wheel) the current page belongs to. Mirrors the logic
// that used to live in MarketingContextBar; that component now only renders the page
// title, since the sidebar owns section navigation.
const AMBASSADOR_MARKETING_NAV: ModuleSubNavItem[] = [
  { key: 'ambassador', href: '/modules/marketing/ambassador', label: 'Overview', icon: Activity, exact: true },
  { key: 'ambassadors', href: '/modules/marketing/ambassadors', label: 'Ambassadors', icon: Users },
  { key: 'leads', href: '/modules/marketing/leads', label: 'Leads', icon: MessageCircle },
  { key: 'conversions', href: '/modules/marketing/conversions', label: 'Conversions', icon: BarChart3 },
  { key: 'activities', href: '/modules/marketing/activities', label: 'Activity Reviews', icon: Activity },
  { key: 'whatsapp-intake', href: '/modules/marketing/whatsapp-intake', label: 'WhatsApp Intake', icon: MessageSquareText },
  { key: 'products', href: '/modules/marketing/products', label: 'Products', icon: Package },
  { key: 'invite', href: '/modules/marketing/invite', label: 'Invitations', icon: Link2 },
  { key: 'settings', href: '/modules/marketing/settings', label: 'Settings', icon: Settings },
];

const SPIN_WHEEL_MARKETING_NAV: ModuleSubNavItem[] = [
  { key: 'spin-wheel', href: '/modules/marketing/spin-wheel', label: 'Spin Wheel Console', icon: CircleGauge, exact: true },
];

const DEFAULT_MARKETING_NAV: ModuleSubNavItem[] = [
  { key: 'ambassador', href: '/modules/marketing/ambassador', label: 'Ambassador', icon: Users },
  { key: 'spin-wheel', href: '/modules/marketing/spin-wheel', label: 'Spin Wheel', icon: CircleGauge },
];

function buildMarketingNav(pathname: string): ModuleSubNavItem[] {
  if (pathname.startsWith('/modules/marketing/spin-wheel')) return SPIN_WHEEL_MARKETING_NAV;
  if (AMBASSADOR_MARKETING_NAV.some((item) => pathname.startsWith(item.href))) return AMBASSADOR_MARKETING_NAV;
  return DEFAULT_MARKETING_NAV;
}

// CRM has no role-based item filtering today — module access is all-or-nothing
// (see MODULE_ACCESS in roles.ts), so every role that can reach CRM sees all 7 views.
const CRM_NAV: ModuleSubNavItem[] = [
  { key: 'dashboard', href: '/modules/crm', label: 'Dashboard', icon: Gauge, exact: true },
  { key: 'leads', href: '/modules/crm/leads', label: 'Leads', icon: Users },
  { key: 'funnel', href: '/modules/crm/funnel', label: 'Funnel', icon: Target },
  { key: 'contacts', href: '/modules/crm/contacts', label: 'Contacts', icon: ContactRound },
  { key: 'tasks', href: '/modules/crm/tasks', label: 'Tasks', icon: ListTodo },
  { key: 'notes', href: '/modules/crm/notes', label: 'Notes', icon: NotebookPen },
  { key: 'handoff', href: '/modules/crm/handoff', label: 'WhatsApp Handoff', icon: MessageCircle },
];

/**
 * The AppShell sidebar's second segment: whichever module is active gets its section
 * list rendered here, filtered to what the role can see. Empty array means the module
 * has no sections of its own (Finance, Reports, Administration today) — the sidebar
 * simply renders nothing for that segment rather than an empty card.
 */
export function getModuleSubNav(slug: ModuleSlug, role: string | null | undefined, pathname: string): ModuleSubNavItem[] {
  if (slug === 'sales') return buildSalesNav(role);
  if (slug === 'operations') return buildOperationsNav(role);
  if (slug === 'marketing') return buildMarketingNav(pathname);
  if (slug === 'crm') return CRM_NAV;
  return [];
}
