import Link from 'next/link';
import { ArrowRight, BadgeDollarSign, Gift, Mail, Megaphone, MessageCircle, MousePointerClick, Share2, Smartphone, Trophy, UserCheck, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase-server';
import { getReportingRange } from '@/lib/reporting-period';

const solutions = [
  { name: 'Ambassador', slug: 'ambassador', description: 'Ambassadors, referrals, leads, conversions, payouts and performance.', icon: Users, active: true, tone: 'bg-blue-50 text-emmy-primary' },
  { name: 'Spin Wheel', slug: 'spin-wheel', description: 'Games, prizes, players, referral rewards, rules and cash-outs.', icon: Gift, active: true, tone: 'bg-amber-50 text-amber-600' },
  { name: 'Social Media', slug: 'social-media', description: 'Content planning, publishing, engagement and channel performance.', icon: Share2, active: false, tone: 'bg-violet-50 text-violet-600' },
  { name: 'Campaigns', slug: 'campaigns', description: 'Plan, launch, monitor and evaluate marketing campaigns.', icon: Megaphone, active: false, tone: 'bg-orange-50 text-orange-600' },
  { name: 'SMS', slug: 'sms', description: 'Audience lists, scheduled messages and delivery reporting.', icon: Smartphone, active: false, tone: 'bg-cyan-50 text-cyan-600' },
  { name: 'WhatsApp', slug: 'whatsapp', description: 'Conversations, broadcasts, templates and response tracking.', icon: MessageCircle, active: false, tone: 'bg-emerald-50 text-emerald-600' },
  { name: 'Email', slug: 'email', description: 'Email lists, templates, campaigns and engagement reporting.', icon: Mail, active: false, tone: 'bg-rose-50 text-rose-600' },
  { name: 'Marketing Finance', slug: 'marketing-finance', description: 'Marketing budgets, spend, approvals, ROI and financial reporting.', icon: BadgeDollarSign, active: false, tone: 'bg-teal-50 text-teal-600' },
];

async function getMarketingSnapshot() {
  const supabase = await createClient();
  const month = getReportingRange('this_month');
  const today = getReportingRange('today');
  const [ambassadors, leads, conversions, players, spins, cashouts] = await Promise.all([
    supabase.from('ambassadors').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('approved_as_lead', true).is('merged_into_lead_id', null).gte('approved_at', month.startIso).lt('approved_at', month.endExclusiveIso),
    supabase.from('conversions').select('id', { count: 'exact', head: true }).gte('approved_at', month.startIso).lt('approved_at', month.endExclusiveIso),
    supabase.from('spin_players').select('id', { count: 'exact', head: true }),
    supabase.from('spin_logs').select('id', { count: 'exact', head: true }).gte('created_at', today.startIso).lt('created_at', today.endExclusiveIso),
    supabase.from('spin_cashout_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  return { activeAmbassadors: ambassadors.count ?? 0, monthlyLeads: leads.count ?? 0, monthlyConversions: conversions.count ?? 0, totalPlayers: players.count ?? 0, spinsToday: spins.count ?? 0, pendingCashouts: cashouts.count ?? 0 };
}

export default async function MarketingHubPage() {
  const snapshot = await getMarketingSnapshot();
  const stats = [
    { label: 'Active ambassadors', value: snapshot.activeAmbassadors, context: 'Ambassador programme', href: '/modules/marketing/ambassadors', icon: UserCheck, tone: 'bg-blue-50 text-emmy-primary' },
    { label: 'Approved leads', value: snapshot.monthlyLeads, context: 'This month', href: '/modules/marketing/leads', icon: Users, tone: 'bg-indigo-50 text-indigo-600' },
    { label: 'Conversions', value: snapshot.monthlyConversions, context: 'This month', href: '/modules/marketing/conversions', icon: Trophy, tone: 'bg-emerald-50 text-emerald-600' },
    { label: 'Spin Wheel players', value: snapshot.totalPlayers, context: 'All registered players', href: '/modules/marketing/spin-wheel', icon: Gift, tone: 'bg-amber-50 text-amber-600' },
    { label: 'Spins today', value: snapshot.spinsToday, context: 'Nigeria time', href: '/modules/marketing/spin-wheel', icon: MousePointerClick, tone: 'bg-orange-50 text-orange-600' },
    { label: 'Pending cash-outs', value: snapshot.pendingCashouts, context: 'Awaiting review', href: '/modules/marketing/spin-wheel', icon: BadgeDollarSign, tone: 'bg-rose-50 text-rose-600' },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-7">
      <section>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">Marketing workspace</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div><h2 className="text-[31px] font-bold tracking-[-0.035em] text-slate-950">Marketing overview</h2><p className="mt-2 text-[15px] text-slate-500">Monitor the important numbers, then open the solution you want to manage.</p></div>
          <span className="rounded-full bg-slate-900 px-4 py-2 text-[11px] font-bold text-white">2 active solutions</span>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-950">Performance snapshot</h3><p className="mt-1 text-xs text-slate-500">Live data from Ambassador and Spin Wheel</p></div><span className="text-xs font-semibold text-slate-400">Monthly where indicated</span></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stats.map((stat) => { const Icon = stat.icon; return (
            <Link key={stat.label} href={stat.href} className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
              <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-[13px] ${stat.tone}`}><Icon className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-500">{stat.label}</p><div className="mt-1 flex items-end justify-between gap-3"><strong className="text-2xl font-bold tracking-[-0.03em] text-slate-950">{stat.value.toLocaleString()}</strong><span className="truncate text-[11px] text-slate-400">{stat.context}</span></div></div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emmy-primary" />
            </Link>
          ); })}
        </div>
      </section>

      <section>
        <div className="mb-3"><h3 className="text-lg font-bold text-slate-950">Marketing solutions</h3><p className="mt-1 text-xs text-slate-500">Ambassador and Spin Wheel are available now; more solutions will be added over time.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {solutions.map((solution) => { const Icon = solution.icon; return (
            <Link key={solution.slug} href={`/modules/marketing/${solution.slug}`} className="group flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
              <div className="flex items-start justify-between gap-3"><div className={`grid h-12 w-12 place-items-center rounded-[13px] ${solution.tone}`}><Icon className="h-6 w-6" /></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${solution.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{solution.active ? 'Active' : 'In progress'}</span></div>
              <h3 className="mt-5 text-lg font-bold tracking-[-0.02em] text-slate-950">{solution.name}</h3><p className="mt-2 flex-1 text-[13px] leading-5 text-slate-500">{solution.description}</p>
              <div className="mt-4 flex items-center gap-2 text-xs font-bold text-emmy-primary">{solution.active ? 'Open solution' : 'View update'}<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></div>
            </Link>
          ); })}
        </div>
      </section>
    </div>
  );
}
