'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { NotificationCenter } from '@/components/notification-center';
import { User } from 'lucide-react';

interface DashboardHeaderProps {
  user?: any;
  profile?: any;
}

const pageMeta: Record<string, { title: string; eyebrow: string }> = {
  '/modules/marketing': { title: 'Marketing Solutions', eyebrow: 'Marketing workspace' },
  '/modules/marketing/ambassador': { title: 'Ambassador Command Centre', eyebrow: 'Marketing · Ambassador' },
  '/modules/marketing/ambassadors': { title: 'Ambassadors', eyebrow: 'People and performance' },
  '/modules/marketing/activities': { title: 'Activity Reviews', eyebrow: 'Approvals queue' },
  '/modules/marketing/leads': { title: 'Lead Management', eyebrow: 'Pipeline operations' },
  '/modules/marketing/whatsapp-intake': { title: 'WhatsApp Intake', eyebrow: 'Identity workspace' },
  '/modules/marketing/conversions': { title: 'Conversions', eyebrow: 'Sales and commission' },
  '/modules/marketing/products': { title: 'Products', eyebrow: 'Catalogue management' },
  '/modules/marketing/invite': { title: 'Invitations', eyebrow: 'Ambassador onboarding' },
  '/modules/marketing/settings': { title: 'Platform Settings', eyebrow: 'System controls' },
};

export function DashboardHeader({ user, profile }: DashboardHeaderProps) {
  const pathname = usePathname();
  const currentUser = profile || user;

  const meta = useMemo(() => {
    if (pageMeta[pathname]) return pageMeta[pathname];
    if (pathname.startsWith('/modules/marketing/ambassadors/')) {
      return { title: 'Ambassador Profile', eyebrow: 'People and performance' };
    }
    if (pathname.startsWith('/modules/marketing/leads/')) {
      return { title: 'Unified Lead Timeline', eyebrow: 'Identity and customer journey' };
    }
    return currentUser?.role === 'admin'
      ? { title: 'Ambassador Administration', eyebrow: 'EmmyTech Marketing' }
      : { title: 'Ambassador Workspace', eyebrow: 'EmmyTech growth programme' };
  }, [pathname, currentUser?.role]);

  const displayName =
    currentUser?.name || currentUser?.user_metadata?.name || currentUser?.email || 'User';

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-slate-50/95 backdrop-blur-xl">
      <div className="flex h-[74px] items-center justify-between gap-4 px-4 pl-16 sm:px-6 sm:pl-16 lg:px-[30px] lg:pl-[30px]">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {meta.eyebrow}
          </p>
          <h1 className="mt-1 truncate text-xl font-bold tracking-[-0.025em] text-slate-950 sm:text-[23px]">
            {meta.title}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <NotificationCenter />

          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-1.5 pr-2.5 shadow-sm">
            <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-xl bg-emmy-primary text-sm font-bold text-white">
              {currentUser?.avatar_url ? (
                <img
                  src={currentUser.avatar_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-4 w-4" />
              )}
            </div>

            <div className="hidden max-w-40 text-left sm:block">
              <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
              <p className="truncate text-[11px] capitalize text-slate-500">
                {currentUser?.role || 'ambassador'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
