'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  Boxes,
  ClipboardList,
  Gauge,
  Link2,
  Package,
  Search,
  Truck,
} from 'lucide-react';
import { HelpTip } from '@/components/ui/help-tip';
import { OPERATIONS_NAV } from '@/lib/operations/help';

const iconMap = {
  overview: Gauge,
  orders: ClipboardList,
  products: Package,
  inventory: Boxes,
  websiteLinks: Link2,
} as const;

export function OperationsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex h-[68px] items-center gap-4 px-4 md:px-6">
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-[#032489]"
            aria-label="Back to EmmyTech OS"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#032489] text-white">
              <Truck className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-black tracking-tight text-[#032489]">Operations</div>
              <div className="hidden text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 sm:block">
                Internal execution workspace
              </div>
            </div>
          </div>

          <div className="mx-auto hidden w-full max-w-lg items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 lg:flex">
            <Search className="h-4 w-4 text-slate-400" />
            <span className="text-sm text-slate-400">Search orders, inventory, references...</span>
          </div>

          <div className="ml-auto rounded-lg bg-[#032489] px-3 py-2 text-xs font-bold text-white">
            Administrator
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-68px)]">
        <aside className="hidden w-[224px] shrink-0 border-r border-slate-200 bg-white px-3 py-5 lg:block">
          <div className="mb-3 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Workspace
          </div>
          <nav className="space-y-1">
            {OPERATIONS_NAV.map((item) => {
              const active = item.href === '/modules/operations' ? pathname === item.href : pathname.startsWith(item.href);
              const Icon = iconMap[item.key];

              return (
                <div key={item.href} className="flex items-center gap-1">
                  <Link
                    href={item.href}
                    className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                      active
                        ? 'bg-blue-50 text-[#032489]'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className={`h-5 w-0.5 rounded-full ${active ? 'bg-[#032489]' : 'bg-transparent'}`} />
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                  <HelpTip text={item.help} label={`About ${item.label}`} />
                </div>
              );
            })}
          </nav>

          <div className="mt-8 border-t border-slate-100 px-3 pt-4">
            <p className="text-[11px] leading-5 text-slate-500">
              Products are for the website. Inventory is for internal stock. They only connect when you choose to link them.
            </p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-7">
          <div className="mb-5 flex gap-2 overflow-x-auto lg:hidden">
            {OPERATIONS_NAV.map((item) => {
              const active = item.href === '/modules/operations' ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${
                    active ? 'bg-[#032489] text-white' : 'border border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
