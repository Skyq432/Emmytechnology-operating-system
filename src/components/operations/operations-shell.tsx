'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  Boxes,
  ClipboardList,
  Gauge,
  Link2,
  Search,
  Truck,
} from 'lucide-react';

const nav = [
  { href: '/modules/operations', label: 'Overview', icon: Gauge },
  { href: '/modules/operations/orders', label: 'Orders', icon: ClipboardList },
  { href: '/modules/operations/inventory', label: 'Inventory', icon: Boxes },
  { href: '/modules/operations/website-links', label: 'Website Links', icon: Link2 },
];

export function OperationsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#f5f8ff] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex h-[72px] items-center gap-4 px-4 md:px-6">
          <Link
            href="/"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
            aria-label="Back to EmmyTech OS"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0d7a4b] text-white shadow-sm">
              <Truck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-black tracking-tight text-[#032489]">Operations</div>
              <div className="hidden text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 sm:block">
                EmmyTech internal execution workspace
              </div>
            </div>
          </div>

          <div className="mx-auto hidden w-full max-w-lg items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 lg:flex">
            <Search className="h-4 w-4 text-slate-400" />
            <span className="text-sm text-slate-400">Search orders, inventory, references...</span>
          </div>

          <div className="ml-auto rounded-xl bg-[#032489] px-3 py-2 text-xs font-bold text-white">
            Administrator
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-72px)]">
        <aside className="hidden w-[230px] shrink-0 border-r border-slate-200 bg-white p-4 lg:block">
          <div className="mb-3 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Operations
          </div>
          <nav className="space-y-1.5">
            {nav.map((item) => {
              const active =
                item.href === '/modules/operations'
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${
                    active
                      ? 'bg-[#0d7a4b] text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-xs font-black text-emerald-900">Internal first</p>
            <p className="mt-1 text-[11px] leading-5 text-emerald-800/75">
              Inventory and website products are separate. Linking is optional and controlled.
            </p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">
          <div className="mb-5 flex gap-2 overflow-x-auto lg:hidden">
            {nav.map((item) => {
              const active =
                item.href === '/modules/operations'
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold ${
                    active ? 'bg-[#0d7a4b] text-white' : 'border border-slate-200 bg-white text-slate-600'
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
