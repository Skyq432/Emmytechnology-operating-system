'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import {
  Activity,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  LayoutDashboard,
  Home,
  Link2,
  LogOut,
  Menu,
  MessageCircle,
  MessageSquareText,
  Package,
  Settings,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const marketingNavigation: NavItem[] = [
  { label: 'EmmyTech OS Home', href: '/', icon: Home },
  { label: 'Marketing Solutions', href: '/modules/marketing', icon: LayoutDashboard },
];

const ambassadorGroups: NavGroup[] = [
  {
    label: 'Ambassador programme',
    items: [
      { label: 'Overview', href: '/modules/marketing/ambassador', icon: LayoutDashboard },
      { label: 'Ambassadors', href: '/modules/marketing/ambassadors', icon: Users },
    ],
  },
  {
    label: 'Performance & pipeline',
    items: [
      { label: 'Leads', href: '/modules/marketing/leads', icon: MessageCircle },
      { label: 'Conversions', href: '/modules/marketing/conversions', icon: BarChart3 },
      { label: 'Activity Reviews', href: '/modules/marketing/activities', icon: Activity },
      { label: 'WhatsApp Intake', href: '/modules/marketing/whatsapp-intake', icon: MessageSquareText },
    ],
  },
  {
    label: 'Programme operations',
    items: [
      { label: 'Products', href: '/modules/marketing/products', icon: Package },
      { label: 'Invitations', href: '/modules/marketing/invite', icon: Link2 },
      { label: 'Settings', href: '/modules/marketing/settings', icon: Settings },
    ],
  },
];

interface DashboardSidebarProps {
  role?: string;
  user?: any;
}

export function DashboardSidebar({
  role = 'ambassador',
  user,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = role === 'admin';
  const isSpinWheel = pathname.startsWith('/modules/marketing/spin-wheel');
  const isAmbassadorSolution = [
    '/modules/marketing/ambassador',
    '/modules/marketing/activities',
    '/modules/marketing/leads',
    '/modules/marketing/whatsapp-intake',
    '/modules/marketing/conversions',
    '/modules/marketing/products',
    '/modules/marketing/invite',
    '/modules/marketing/settings',
  ].some((route) => pathname.startsWith(route));

  const contextualGroups: NavGroup[] = isSpinWheel
    ? [
        {
          label: 'Spin Wheel',
          items: [
            { label: 'Spin Wheel Console', href: '/modules/marketing/spin-wheel', icon: CircleGauge },
          ],
        },
      ]
    : isAmbassadorSolution
      ? ambassadorGroups
      : [
          {
            label: 'Active solutions',
            items: [
              { label: 'Ambassador', href: '/modules/marketing/ambassador', icon: Users },
              { label: 'Spin Wheel', href: '/modules/marketing/spin-wheel', icon: CircleGauge },
            ],
          },
        ];

  const workspaceLabel = isSpinWheel
    ? 'Marketing · Spin Wheel'
    : isAmbassadorSolution
      ? 'Marketing · Ambassador'
      : 'Marketing workspace';

  useEffect(() => {
    const saved = window.localStorage.getItem('emmytech-marketing-sidebar');
    if (saved === 'collapsed') setCollapsed(true);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.ambassadorSidebar = collapsed
      ? 'collapsed'
      : 'expanded';
    window.localStorage.setItem(
      'emmytech-marketing-sidebar',
      collapsed ? 'collapsed' : 'expanded'
    );
  }, [collapsed]);

  const displayName = useMemo(
    () => user?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'User',
    [user]
  );

  const initials = useMemo(() => {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    return parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : displayName.slice(0, 2).toUpperCase();
  }, [displayName]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  };

  function isActive(href: string): boolean {
    if (pathname === href) return true;
    if (href !== '/modules/marketing' && href !== '/') {
      return pathname.startsWith(`${href}/`);
    }
    return false;
  }

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => {
    return (
      <div className={`flex h-full flex-col overflow-hidden bg-gradient-to-b from-[#073b9f] to-[#073287] text-white ${isMobile ? 'rounded-r-[28px] shadow-2xl' : 'rounded-r-[28px] shadow-[8px_0_24px_rgba(15,23,42,0.08)]'}`}>
        <div className="flex items-center gap-3 px-4 pb-3 pt-4">
          <div
            className={`flex h-[66px] min-w-0 items-center overflow-hidden rounded-[18px] bg-white px-3 shadow-sm ${
              collapsed && !isMobile ? 'w-12 justify-center' : 'flex-1'
            }`}
          >
            <img
              src="/emmytech-logo.png"
              alt="EmmyTech"
              className={`object-contain ${collapsed && !isMobile ? 'h-9 w-10' : 'h-12 w-full'}`}
            />
          </div>

          {isMobile ? (
            <button
              onClick={() => setMobileOpen(false)}
              className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10 hover:text-white"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          ) : (
            <button
              onClick={() => setCollapsed((value) => !value)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10 hover:text-white"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        {(!collapsed || isMobile) && (
          <div className="px-4 pb-2">
            <div className="flex items-center gap-2 rounded-xl bg-white/[0.08] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-100/[0.85]">
              {isSpinWheel ? <CircleGauge className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
              {isAdmin ? workspaceLabel : 'Ambassador workspace'}
            </div>
          </div>
        )}

        <nav className="ambassador-nav-scroll flex-1 overflow-y-auto px-3 py-2">
          <div className="pb-2">
            {marketingNavigation.map((item) => (
              <SidebarLink
                key={item.href}
                item={item}
                active={isActive(item.href)}
                collapsed={collapsed && !isMobile}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
          </div>

          {contextualGroups.map((group) => (
            <section key={group.label} className="border-t border-white/10 px-1 pb-2 pt-4">
              {(!collapsed || isMobile) && (
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-100/45">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => (
                <SidebarLink
                  key={item.href}
                  item={item}
                  active={isActive(item.href)}
                  collapsed={collapsed && !isMobile}
                  onNavigate={() => setMobileOpen(false)}
                />
              ))}
            </section>
          ))}
        </nav>

        <div className="m-3 mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.07] p-2">
          <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white text-xs font-bold text-emmy-primary">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>

          {(!collapsed || isMobile) && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{displayName}</p>
              <p className="truncate text-[11px] capitalize text-blue-100/[0.65]">
                {role}
              </p>
            </div>
          )}

          {(!collapsed || isMobile) && (
            <button
              onClick={handleSignOut}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-blue-100/[0.75] transition hover:bg-white/10 hover:text-white"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-[60] grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-emmy-primary shadow-sm lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-[70] p-3 lg:hidden">
          <button
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu overlay"
          />
          <aside className="relative h-full w-[286px] max-w-[88vw]">
            <SidebarContent isMobile />
          </aside>
        </div>
      )}

      <aside
        className={`fixed bottom-0 left-0 top-0 z-50 hidden transition-[width] duration-200 lg:block ${
          collapsed ? 'w-[84px]' : 'w-[270px]'
        }`}
      >
        <SidebarContent />
      </aside>
    </>
  );
}

function SidebarLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={`mb-1 flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
        active
          ? 'bg-white text-emmy-primary shadow-[0_10px_26px_rgba(0,20,70,0.22)]'
          : 'text-blue-100/[0.80] hover:bg-white/[0.08] hover:text-white'
      } ${collapsed ? 'justify-center px-0' : ''}`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}
