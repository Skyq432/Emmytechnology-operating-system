'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { NotificationCenter } from '@/components/notification-center';

const PAGE_TITLES: Record<string, string> = {
  '/modules/marketing': 'Marketing Solutions',
  '/modules/marketing/ambassador': 'Ambassador Command Centre',
  '/modules/marketing/ambassadors': 'Ambassadors',
  '/modules/marketing/leaderboard': 'Ambassador Leaderboard',
  '/modules/marketing/activities': 'Activity Reviews',
  '/modules/marketing/leads': 'Lead Management',
  '/modules/marketing/whatsapp-intake': 'WhatsApp Intake',
  '/modules/marketing/conversions': 'Conversions',
  '/modules/marketing/products': 'Products',
  '/modules/marketing/invite': 'Invitations',
  '/modules/marketing/settings': 'Platform Settings',
  '/modules/marketing/spin-wheel': 'Spin Wheel Console',
};

function titleFor(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith('/modules/marketing/ambassadors/')) return 'Ambassador Profile';
  if (pathname.startsWith('/modules/marketing/leads/')) return 'Unified Lead Timeline';
  return 'Marketing';
}

/**
 * Marketing's local context bar: just the page title (more specific than the module-level
 * title AppShell's topbar shows) plus the payout/referral NotificationCenter — a different
 * domain from AppShell's universal work-notification bell. Section navigation (ambassador
 * vs. spin-wheel vs. the "active solutions" picker) now lives in AppShell's sidebar, the
 * same as every other module's sections.
 */
export function MarketingContextBar() {
  const pathname = usePathname();
  const title = useMemo(() => titleFor(pathname), [pathname]);

  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <div className="text-lg font-black tracking-tight text-emmy-primary">{title}</div>
      <NotificationCenter />
    </div>
  );
}
