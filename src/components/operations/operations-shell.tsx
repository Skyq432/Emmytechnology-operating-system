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
  Repeat2,
  Search,
  Stethoscope,
  Truck,
  UsersRound,
} from 'lucide-react';
import { HelpTip } from '@/components/ui/help-tip';
import { OperationsPeriodBar } from '@/components/operations/operations-period-bar';
import { OPERATIONS_NAV } from '@/lib/operations/help';

const iconMap = {
  overview: Gauge,
  orders: ClipboardList,
  products: Package,
  inventory: Boxes,
  transfers: Repeat2,
  suppliers: UsersRound,
  repairs: Stethoscope,
  websiteLinks: Link2,
} as const;

export function OperationsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex h-[68px] items-center gap-4 px-4 md:px-6 lg:pl-[286px]">
          <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-[#032489]" aria-label="Back to EmmyTech OS">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#032489] text-white"><Truck className="h-4 w-4" /></div>
            <div className="min-w-0">
              <div className="truncate text-lg font-black tracking-tight text-[#032489]">Operations</div>
              <div className="hidden text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 sm:block">Internal execution workspace</div>
            </div>
          </div>
          <div className="mx-auto hidden w-full max-w-lg items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 lg:flex">
            <Search className="h-4 w-4 text-slate-400" />
            <span className="text-sm text-slate-400">Search orders, inventory, references...</span>
          </div>
          <div className="ml-auto rounded-lg bg-[#032489] px-3 py-2 text-xs font-bold text-white">Administrator</div>
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[270px] flex-col rounded-r-[28px] bg-gradient-to-b from-[#073b9f] to-[#073287] px-3.5 py-4 shadow-[8px_0_24px_rgba(15,23,42,0.08)] lg:flex">
        <Link href="/" className="flex min-h-[66px] items-center gap-3 rounded-[18px] bg-white px-4 text-[#003399] shadow-sm transition hover:bg-blue-50">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#003399] text-white"><Truck className="h-5 w-5" /></div>
          <div className="min-w-0"><div className="text-base font-black">Operations</div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">EmmyTech OS</div></div>
        </Link>

        <div className="mx-0.5 mb-2.5 mt-3.5 flex h-9 items-center gap-2 rounded-xl bg-white/[0.09] px-3.5 text-[11px] font-black uppercase tracking-[0.12em] text-[#c7d7f7]">
          <Boxes className="h-4 w-4" /> Operations Workspace
        </div>

        <nav className="flex flex-col gap-1.5">
          {OPERATIONS_NAV.map((item, index) => {
            const active = item.href === '/modules/operations' ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = iconMap[item.key];
            const isProduct = item.key === 'products';
            return (
              <div key={item.href} className={isProduct ? 'mt-3 border-t border-white/15 pt-3' : ''}>
                <div className="flex items-center gap-1.5">
                  <Link href={item.href} className={`flex min-h-[46px] min-w-0 flex-1 items-center gap-3 rounded-[13px] px-4 text-sm font-semibold transition ${active ? 'bg-white text-[#003399] shadow-[0_6px_16px_rgba(1,22,75,0.14)]' : 'text-[#b8c8e6] hover:bg-white/[0.08] hover:text-white'}`}>
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                  <div className={active ? 'rounded-full bg-white' : 'rounded-full bg-white/10'}><HelpTip text={item.help} label={`About ${item.label}`} /></div>
                </div>
                {isProduct && <p className="px-4 pt-2 text-[10px] leading-4 text-[#aebfdf]">Shared website catalogue</p>}
              </div>
            );
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-white/15 bg-white/[0.07] p-3.5 text-[11px] leading-5 text-[#c7d7f7]">
          Orders, inventory, transfers, suppliers and repairs are the internal Operations flow. Products stays separate because it manages the shared website catalogue.
        </div>
      </aside>

      <main className="min-w-0 p-4 md:p-6 lg:ml-[270px] lg:p-7">
        <div className="mb-5 flex gap-2 overflow-x-auto lg:hidden">
          {OPERATIONS_NAV.map((item) => {
            const active = item.href === '/modules/operations' ? pathname === item.href : pathname.startsWith(item.href);
            return <Link key={item.href} href={item.href} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${active ? 'bg-[#032489] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{item.label}</Link>;
          })}
        </div>
        <OperationsPeriodBar />
        {children}
      </main>
    </div>
  );
}
