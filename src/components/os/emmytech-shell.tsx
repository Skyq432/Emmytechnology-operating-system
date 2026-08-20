'use client';

import { Bell, CircleHelp, Grid2X2, Home, Search, Star, Clock3, CheckSquare2 } from 'lucide-react';
import { EmmyCityMap } from './city-map';

export function EmmyTechShell() {
  return (
    <div className="min-h-screen bg-[#f5f8ff]">
      <header className="sticky top-0 z-40 flex h-[74px] items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-6">
        <div className="flex min-w-[210px] items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#032489] text-xl font-black text-[#ffb100]">E</div>
          <div>
            <div className="text-lg font-black tracking-tight text-[#032489]">EmmyTech OS</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Company Operating System</div>
          </div>
        </div>

        <div className="mx-auto hidden w-full max-w-xl items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 lg:flex">
          <Search className="h-4 w-4 text-slate-400" />
          <span className="text-sm text-slate-400">Search modules, reports, records...</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications"><Bell className="h-5 w-5" /></button>
          <button className="hidden rounded-xl p-2 text-slate-500 hover:bg-slate-100 sm:block" aria-label="Help"><CircleHelp className="h-5 w-5" /></button>
          <button className="hidden rounded-xl p-2 text-slate-500 hover:bg-slate-100 sm:block" aria-label="Apps"><Grid2X2 className="h-5 w-5" /></button>
          <div className="ml-2 hidden rounded-xl bg-[#032489] px-3 py-2 text-xs font-bold text-white md:block">Administrator</div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-74px)]">
        <aside className="hidden w-[220px] shrink-0 border-r border-slate-200 bg-white p-4 lg:flex lg:flex-col">
          <nav className="space-y-1.5">
            <NavItem icon={<Home className="h-4 w-4" />} label="Home" active />
            <NavItem icon={<CheckSquare2 className="h-4 w-4" />} label="My Tasks" badge="8" />
            <NavItem icon={<Bell className="h-4 w-4" />} label="Alerts" badge="3" />
            <NavItem icon={<Star className="h-4 w-4" />} label="Favorites" />
            <NavItem icon={<Clock3 className="h-4 w-4" />} label="Recent" />
          </nav>

          <div className="mt-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold text-slate-700">EmmyTech OS V2</p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">3D standalone shell. Core EmmyTech systems will connect here gradually.</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-3 md:p-5">
          <EmmyCityMap />
        </main>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active = false, badge }: { icon: React.ReactNode; label: string; active?: boolean; badge?: string }) {
  return (
    <button className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${active ? 'bg-[#032489] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
      {icon}
      <span>{label}</span>
      {badge && <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-black ${active ? 'bg-[#ffb100] text-slate-900' : 'bg-[#fff0ba] text-[#7a5500]'}`}>{badge}</span>}
    </button>
  );
}
