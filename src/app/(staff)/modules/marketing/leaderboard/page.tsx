'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, Trophy, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { buttonVariants } from '@/components/ui/button';
import { formatCurrency, formatNumber, cn } from '@/lib/utils';
import { useReportingPeriod } from '@/components/reporting/reporting-period-context';

interface RankedAmbassador {
  id: string;
  rank: number;
  name: string;
  tag: string;
  total_leads: number;
  total_conversions: number;
  revenue: number;
}

const RANK_STYLES: Record<number, string> = {
  1: 'bg-amber-400 text-white',
  2: 'bg-slate-400 text-white',
  3: 'bg-orange-400 text-white',
};

export default function LeaderboardPage() {
  const [ambassadors, setAmbassadors] = useState<RankedAmbassador[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { range } = useReportingPeriod();

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const supabase = createClient();

        const [activeAmbassadorsResponse, leadsResponse, conversionsResponse] = await Promise.all([
          supabase
            .from('ambassadors')
            .select('id, ambassador_tag, status, users(name)')
            .eq('status', 'active'),
          supabase
            .from('leads')
            .select('id, ambassador_id, ambassadors!inner (id, status)')
            .neq('ambassadors.status', 'deleted')
            .eq('approved_as_lead', true)
            .is('merged_into_lead_id', null)
            .gte('created_at', range.startIso)
            .lt('created_at', range.endExclusiveIso),
          supabase
            .from('conversions')
            .select('id, amount, ambassador_id, ambassadors!inner (id, status)')
            .neq('ambassadors.status', 'deleted')
            .gte('approved_at', range.startIso)
            .lt('approved_at', range.endExclusiveIso),
        ]);

        const dbError = activeAmbassadorsResponse.error || leadsResponse.error || conversionsResponse.error;
        if (dbError) throw dbError;

        const leadCounts = new Map<string, number>();
        for (const lead of (leadsResponse.data ?? []) as Array<{ ambassador_id: string | null }>) {
          if (!lead.ambassador_id) continue;
          leadCounts.set(lead.ambassador_id, (leadCounts.get(lead.ambassador_id) || 0) + 1);
        }

        const conversionCounts = new Map<string, number>();
        const revenueByAmbassador = new Map<string, number>();
        for (const conversion of (conversionsResponse.data ?? []) as Array<{ ambassador_id: string | null; amount: number | null }>) {
          if (!conversion.ambassador_id) continue;
          conversionCounts.set(conversion.ambassador_id, (conversionCounts.get(conversion.ambassador_id) || 0) + 1);
          revenueByAmbassador.set(conversion.ambassador_id, (revenueByAmbassador.get(conversion.ambassador_id) || 0) + Number(conversion.amount || 0));
        }

        const ranked: RankedAmbassador[] = (activeAmbassadorsResponse.data ?? [])
          .map((ambassador: { id: string; ambassador_tag: string; users: { name: string } | { name: string }[] | null }) => {
            const user = Array.isArray(ambassador.users) ? ambassador.users[0] : ambassador.users;
            return {
              id: ambassador.id,
              rank: 0,
              name: user?.name || 'Unknown',
              tag: ambassador.ambassador_tag,
              total_leads: leadCounts.get(ambassador.id) || 0,
              total_conversions: conversionCounts.get(ambassador.id) || 0,
              revenue: revenueByAmbassador.get(ambassador.id) || 0,
            };
          })
          .filter((ambassador) => ambassador.total_leads > 0 || ambassador.total_conversions > 0)
          .sort((a, b) => b.total_leads - a.total_leads || b.total_conversions - a.total_conversions)
          .map((ambassador, index) => ({ ...ambassador, rank: index + 1 }));

        if (active) setAmbassadors(ranked);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load leaderboard.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [range.startIso, range.endExclusiveIso]);

  const filtered = ambassadors.filter((ambassador) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return ambassador.name.toLowerCase().includes(q) || ambassador.tag.toLowerCase().includes(q);
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link href="/modules/marketing/ambassador" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'mb-2 -ml-2')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Ambassador Command Centre
        </Link>
        <div className="flex items-center gap-2">
          <Trophy className="h-6 w-6 text-amber-500" />
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">Ambassador Leaderboard</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500">Ranked by leads and conversions in {range.shortLabel}.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ambassadors…" className="pl-9" />
      </div>

      {error && <Card className="border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</Card>}

      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="space-y-2 p-5">
            {[1, 2, 3, 4, 5].map((row) => (
              <div key={row} className="h-12 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="mx-auto mb-3 h-12 w-12 text-slate-300" />
            <p className="text-slate-500">No ambassador activity in {range.shortLabel}.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Rank</TableHead>
                <TableHead>Ambassador</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Conversions</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((ambassador) => (
                <TableRow key={ambassador.id}>
                  <TableCell>
                    <div className={cn('flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold', RANK_STYLES[ambassador.rank] ?? 'bg-slate-200 text-slate-600')}>
                      {ambassador.rank}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-slate-950">{ambassador.name}</div>
                    <div className="text-xs text-slate-500">{ambassador.tag}</div>
                  </TableCell>
                  <TableCell className="text-right font-bold text-emmy-primary">{formatNumber(ambassador.total_leads)}</TableCell>
                  <TableCell className="text-right font-semibold text-slate-700">{formatNumber(ambassador.total_conversions)}</TableCell>
                  <TableCell className="text-right font-semibold text-slate-700">{formatCurrency(ambassador.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
