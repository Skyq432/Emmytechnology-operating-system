'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ClipboardCheck, Home, Menu, X } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { NavItem } from '@/components/ui/nav-item';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import WorkNotificationCenter from '@/components/work/work-notification-center';
import AccountMenu from '@/components/os/account-menu';
import { PRIMARY_MODULE_NAV } from '@/lib/os/navigation';
import { getModuleSubNav } from '@/lib/os/sub-navigation';
import { accessibleModules, roleLabel, type InternalRole, type ModuleSlug } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';

const NAV_COLLAPSE_STORAGE_KEY = 'emmy-nav-collapsed';

let navCollapseListeners: Array<() => void> = [];
let navCollapseFallback = false;

function subscribeNavCollapse(callback: () => void) {
  navCollapseListeners.push(callback);
  return () => {
    navCollapseListeners = navCollapseListeners.filter((listener) => listener !== callback);
  };
}

function getNavCollapseSnapshot(): boolean {
  try {
    const stored = localStorage.getItem(NAV_COLLAPSE_STORAGE_KEY);
    if (stored !== null) return stored === '1';
  } catch {
    // localStorage unavailable — fall through to the in-memory value below.
  }
  return navCollapseFallback;
}

function getNavCollapseServerSnapshot(): boolean {
  return false;
}

function setNavCollapsed(next: boolean) {
  navCollapseFallback = next;
  try {
    localStorage.setItem(NAV_COLLAPSE_STORAGE_KEY, next ? '1' : '0');
  } catch {
    // localStorage unavailable — the in-memory fallback above still works for this session.
  }
  navCollapseListeners.forEach((listener) => listener());
}

export function AppShell({
  role,
  name,
  currentUserId,
  children,
}: {
  role: InternalRole;
  name: string;
  currentUserId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  // useSyncExternalStore (rather than state + an effect) reads localStorage directly,
  // so there's one source of truth and no SSR/client mismatch to sync — same pattern
  // as ThemeToggle's DOM-class read.
  const collapsed = React.useSyncExternalStore(subscribeNavCollapse, getNavCollapseSnapshot, getNavCollapseServerSnapshot);
  const label = roleLabel(role);
  const modules = accessibleModules(role);

  const toggleCollapsed = () => setNavCollapsed(!collapsed);

  const moduleMatch = /^\/modules\/([^/]+)/.exec(pathname);
  const activeSlug = moduleMatch?.[1] as ModuleSlug | undefined;
  const activeModule = activeSlug ? PRIMARY_MODULE_NAV[activeSlug] : undefined;

  const subNavItems = React.useMemo(
    () => (activeSlug ? getModuleSubNav(activeSlug, role, pathname) : []),
    [activeSlug, role, pathname]
  );
  const activeSubItem = subNavItems.find((item) => (item.exact ? pathname === item.href : pathname.startsWith(item.href)));

  const pageTitle = pathname === '/' ? 'Home' : activeModule ? (activeSubItem ? `${activeModule.label} · ${activeSubItem.label}` : activeModule.label) : 'EmmyTech OS';

  // Segment 1 is bounded and scrolls — this keeps the active module in view instead of
  // requiring a manual scroll to find where you already are after navigating. The sidebar
  // JSX below mounts twice (desktop aside + mobile drawer), so each copy needs its own ref —
  // a single ref would just get overwritten by whichever instance commits last.
  const desktopMenuItemRef = React.useRef<HTMLAnchorElement | null>(null);
  const mobileMenuItemRef = React.useRef<HTMLAnchorElement | null>(null);
  React.useEffect(() => {
    desktopMenuItemRef.current?.scrollIntoView({ block: 'nearest' });
    mobileMenuItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [pathname]);

  const renderSidebar = (activeMenuItemRef: React.RefObject<HTMLAnchorElement | null>) => (
    <div className="flex h-full flex-col rounded-[28px] bg-gradient-to-br from-[#0a3bb0] via-[#032489] to-[#021b68] p-3.5 shadow-[var(--shadow-shell)]">
      <div className={cn('flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 shadow-sm', collapsed && 'justify-center')}>
        <img src="/emmytech-logo.png" alt="EmmyTech" className="h-8 w-8 shrink-0 object-contain" />
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold tracking-tight text-slate-950">EmmyTech</div>
            <div className="truncate text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">Operating System</div>
          </div>
        )}
      </div>

      {!collapsed && <div className="mb-1.5 mt-4 px-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7f97d6]">Menu</div>}

      <nav className="mt-4 flex min-h-0 flex-1 flex-col gap-2">
        {/* Segment 1: primary modules. Grows to fill its share of whatever height is actually
            available (60% when Segment 2 is present, all of it otherwise) instead of a fixed cap —
            so it uses the room that's there rather than sitting cramped above dead space. */}
        <div className={cn('flex min-h-0 flex-col', subNavItems.length > 0 ? 'flex-[3]' : 'flex-1')}>
          <div className="ambassador-nav-scroll flex min-h-0 flex-1 scroll-smooth flex-col gap-0.5 overflow-y-auto">
            <NavItem
              ref={pathname === '/' ? activeMenuItemRef : undefined}
              href="/"
              active={pathname === '/'}
              icon={<Home className="h-[17px] w-[17px]" />}
              onClick={() => setMobileOpen(false)}
              collapsed={collapsed}
            >
              Home
            </NavItem>
            {modules.map((slug) => {
              const item = PRIMARY_MODULE_NAV[slug];
              const Icon = item.icon;
              const href = `/modules/${slug}`;
              const active = pathname.startsWith(href);
              return (
                <NavItem
                  key={slug}
                  ref={active ? activeMenuItemRef : undefined}
                  href={href}
                  active={active}
                  icon={<Icon className="h-[17px] w-[17px]" />}
                  onClick={() => setMobileOpen(false)}
                  collapsed={collapsed}
                >
                  {item.label}
                </NavItem>
              );
            })}
          </div>
        </div>

        {/* Segment 2: whichever module is active gets its section list here — takes the
            remaining 40% of the shared space, so together they read as a 60/40 split that
            actually fills the sidebar instead of leaving a gap above "My Work". */}
        {subNavItems.length > 0 && (
          <div className="flex min-h-0 flex-[2] flex-col gap-1">
            <div className="h-px bg-white/10" />
            {!collapsed && (
              <div className="px-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7f97d6]">
                {activeModule?.label} Sections · {subNavItems.length}
              </div>
            )}
            <div
              className={cn(
                'light-nav-scroll flex min-h-0 flex-1 scroll-smooth flex-col gap-0.5 overflow-y-auto rounded-2xl bg-white p-1.5 shadow-sm',
                collapsed && 'items-center'
              )}
            >
              {subNavItems.map((item) => {
                const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl px-3 py-2 text-[12.5px] font-bold transition-colors',
                      collapsed ? 'justify-center px-0' : '',
                      active ? 'bg-emmy-primary text-white' : 'text-slate-500 hover:bg-blue-50/60 hover:text-emmy-primary'
                    )}
                  >
                    <Icon className="h-[15px] w-[15px] shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex shrink-0 flex-col gap-0.5">
          <div className="h-px bg-white/10" />
          {!collapsed && <div className="px-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7f97d6]">You</div>}
          <NavItem
            href="/modules/activities"
            active={pathname.startsWith('/modules/activities')}
            icon={<ClipboardCheck className="h-[17px] w-[17px]" />}
            onClick={() => setMobileOpen(false)}
            collapsed={collapsed}
          >
            My Work
          </NavItem>
        </div>
      </nav>

      <div className={cn('mt-2 flex items-center gap-2.5 rounded-2xl bg-white p-2 shadow-sm', collapsed && 'justify-center')}>
        <Avatar name={name} size="sm" />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold text-slate-950">{name}</div>
            <div className="truncate text-[10.5px] text-slate-500">{label}</div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-muted">
      {/* Mobile menu trigger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        className="fixed left-4 top-4 z-[60] grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-emmy-primary shadow-sm lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-[70] p-3 lg:hidden">
          <button aria-label="Close menu overlay" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" />
          <div className="relative h-full w-[280px] max-w-[88vw]">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white"
            >
              <X className="h-4 w-4" />
            </button>
            {renderSidebar(mobileMenuItemRef)}
          </div>
        </div>
      )}

      <aside
        className={cn(
          'fixed inset-y-4 left-4 z-40 hidden transition-[width] duration-200 lg:block',
          collapsed ? 'w-[84px]' : 'w-[246px]'
        )}
      >
        <div className="relative h-full">
          {renderSidebar(desktopMenuItemRef)}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            className="absolute -right-3 top-6 z-10 grid h-6 w-6 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-emmy-primary/30 hover:text-emmy-primary"
          >
            <ChevronLeft className={cn('h-3.5 w-3.5 transition-transform duration-200', collapsed && 'rotate-180')} />
          </button>
        </div>
      </aside>

      <main className={cn('transition-[margin] duration-200', collapsed ? 'lg:ml-[132px]' : 'lg:ml-[294px]')}>
        <div className="px-4 pb-10 pt-4 sm:px-6 lg:px-8 lg:pt-7">
          <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-slate-200/60 bg-surface px-5 py-3.5 shadow-[var(--shadow-card)]">
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-500">EmmyTech OS</div>
              <div className="mt-0.5 text-[17px] font-extrabold tracking-tight text-slate-950">{pageTitle}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle />
              <WorkNotificationCenter currentUserId={currentUserId} />
              <div className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />
              <AccountMenu name={name} roleLabel={label} />
            </div>
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}
