'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  BadgeDollarSign,
  Banknote,
  BarChart3,
  ClipboardList,
  FileText,
  Gauge,
  HandCoins,
  ReceiptText,
  RotateCcw,
  Settings,
  ShoppingBag,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { ReportingPeriodProvider } from '@/components/reporting/reporting-period-context';
import { OperationsPeriodBar } from '@/components/operations/operations-period-bar';
import { SALES_NAV } from '@/lib/sales/navigation';

const icons = {
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
} as const;

export function SalesShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex h-[68px] items-center gap-4 px-4 md:px-6 lg:pl-[286px]">
          <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-[#032489]" aria-label="Back to EmmyTech OS">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#032489] text-white"><BadgeDollarSign className="h-4 w-4" /></div>
            <div className="min-w-0">
              <div className="truncate text-lg font-black tracking-tight text-[#032489]">Sales</div>
              <div className="hidden text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 sm:block">Commercial workspace</div>
            </div>
          </div>
          <div className="ml-auto rounded-lg bg-[#032489] px-3 py-2 text-xs font-bold text-white">Administrator</div>
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[270px] flex-col rounded-r-[28px] bg-gradient-to-b from-[#073b9f] to-[#073287] px-3.5 py-4 shadow-[8px_0_24px_rgba(15,23,42,0.08)] lg:flex">
        <Link href="/modules/sales" className="flex min-h-[66px] items-center gap-3 rounded-[18px] bg-white px-4 text-[#003399] shadow-sm transition hover:bg-blue-50">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#003399] text-white"><BadgeDollarSign className="h-5 w-5" /></div>
          <div className="min-w-0"><div className="text-base font-black">Sales</div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">EmmyTech OS</div></div>
        </Link>

        <div className="mx-0.5 mb-2.5 mt-3.5 flex h-9 items-center gap-2 rounded-xl bg-white/[0.09] px-3.5 text-[11px] font-black uppercase tracking-[0.12em] text-[#c7d7f7]">
          <BadgeDollarSign className="h-4 w-4" /> Commercial Workspace
        </div>

        <nav className="flex flex-col gap-1">
          {SALES_NAV.map((item) => {
            const active = item.href === '/modules/sales' ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = icons[item.key];
            return (
              <Link key={item.href} href={item.href} className={`flex min-h-[42px] items-center gap-3 rounded-[13px] px-4 text-sm font-semibold transition ${active ? 'bg-white text-[#003399] shadow-[0_6px_16px_rgba(1,22,75,0.14)]' : 'text-[#b8c8e6] hover:bg-white/[0.08] hover:text-white'}`}>
                <Icon className="h-[17px] w-[17px] shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-white/15 bg-white/[0.07] p-3.5 text-[11px] leading-5 text-[#c7d7f7]">
          Sales owns quotations, commercial terms, payments, receipts and sales reporting. Stock and fulfilment remain in Operations.
        </div>
      </aside>

      <main className="min-w-0 p-4 md:p-6 lg:ml-[270px] lg:p-7">
        <div className="mb-5 flex gap-2 overflow-x-auto lg:hidden">
          {SALES_NAV.map((item) => {
            const active = item.href === '/modules/sales' ? pathname === item.href : pathname.startsWith(item.href);
            return <Link key={item.href} href={item.href} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${active ? 'bg-[#032489] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{item.label}</Link>;
          })}
        </div>
        <OperationsPeriodBar />
        {children}
      </main>
    </div>
  );
}

export function SalesWorkspace({ children }: { children: React.ReactNode }) {
  return <ReportingPeriodProvider><SalesShell>{children}</SalesShell></ReportingPeriodProvider>;
}
