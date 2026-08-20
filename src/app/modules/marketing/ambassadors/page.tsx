'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  Eye,
  DollarSign,
  UserPlus,
  TrendingUp,
  Users,
  ChevronRight,
  UserX,
  Wallet,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';
import { ReportingPeriodPanel } from '@/components/reporting/reporting-period-panel';
import { useReportingPeriod } from '@/components/reporting/reporting-period-context';

interface Ambassador {
  id: string;
  user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  ambassador_tag: string;
  total_leads: number;
  total_conversions: number;
  available_balance: number;
  total_cashed_out: number;
  status: string;
  created_at: string;
}

type SortField = 'total_leads' | 'total_conversions' | 'available_balance';

export default function AdminAmbassadorsPage() {
  const [ambassadors, setAmbassadors] = useState<Ambassador[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('total_leads');
  const { range } = useReportingPeriod();

  const supabase = createClient();

  useEffect(() => {
    fetchAmbassadors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.startIso, range.endExclusiveIso]);

  const fetchAmbassadors = async () => {
    try {
      setLoading(true);
      const [ambassadorsResult, leadsResult, conversionsResult, payoutsResult] =
        await Promise.all([
          supabase
            .from('ambassadors')
            .select('*, users(name, email, avatar_url)')
            .neq('status', 'deleted'),
          supabase
            .from('leads')
            .select('ambassador_id')
            .eq('approved_as_lead', true)
            .is('merged_into_lead_id', null)
            .gte('created_at', range.startIso)
            .lt('created_at', range.endExclusiveIso),
          supabase
            .from('conversions')
            .select('ambassador_id')
            .gte('approved_at', range.startIso)
            .lt('approved_at', range.endExclusiveIso),
          supabase
            .from('payouts')
            .select('ambassador_id, amount')
            .eq('status', 'paid')
            .gte('paid_at', range.startIso)
            .lt('paid_at', range.endExclusiveIso),
        ]);

      const error =
        ambassadorsResult.error ||
        leadsResult.error ||
        conversionsResult.error ||
        payoutsResult.error;

      if (error) throw error;

      const leadCounts = new Map<string, number>();
      const conversionCounts = new Map<string, number>();
      const paidAmounts = new Map<string, number>();

      for (const lead of leadsResult.data || []) {
        if (!lead.ambassador_id) continue;
        leadCounts.set(lead.ambassador_id, (leadCounts.get(lead.ambassador_id) || 0) + 1);
      }

      for (const conversion of conversionsResult.data || []) {
        if (!conversion.ambassador_id) continue;
        conversionCounts.set(
          conversion.ambassador_id,
          (conversionCounts.get(conversion.ambassador_id) || 0) + 1
        );
      }

      for (const payout of payoutsResult.data || []) {
        if (!payout.ambassador_id) continue;
        paidAmounts.set(
          payout.ambassador_id,
          (paidAmounts.get(payout.ambassador_id) || 0) + Number(payout.amount || 0)
        );
      }

      setAmbassadors(
        (ambassadorsResult.data || []).map((a: any) => ({
          ...a,
          name: a.users?.name || 'Unknown',
          email: a.users?.email || '',
          avatar_url: a.users?.avatar_url,
          total_leads: leadCounts.get(a.id) || 0,
          total_conversions: conversionCounts.get(a.id) || 0,
          total_cashed_out: paidAmounts.get(a.id) || 0,
        }))
      );
    } catch (err) {
      console.error('Error loading ambassadors:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = ambassadors
    .filter((a) => {
      const q = search.toLowerCase();

      return (
        a.name.toLowerCase().includes(q) ||
        a.ambassador_tag.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emmy-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Ambassadors
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Manage and track ambassador performance.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Link href="/modules/marketing/ambassadors/deleted" className="w-full sm:w-auto">
            <Button variant="outline" className="w-full gap-2 sm:w-auto">
              <UserX className="h-4 w-4" />
              Deleted Ambassadors
            </Button>
          </Link>

          <Link href="/modules/marketing/invite" className="w-full sm:w-auto">
            <Button className="w-full gap-2 sm:w-auto">
              <UserPlus className="h-4 w-4" />
              Invite New
            </Button>
          </Link>
        </div>
      </div>

      <ReportingPeriodPanel audience="admin" />

      <div className="space-y-3">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ambassadors..."
            className="pl-9"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { key: 'total_leads' as SortField, label: `${range.label} leads` },
            { key: 'total_conversions' as SortField, label: `${range.label} conversions` },
            { key: 'available_balance' as SortField, label: 'Current balance' },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key)}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                sortBy === s.key
                  ? 'bg-emmy-primary text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="p-8 text-center text-muted-foreground">
            No ambassadors found.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((amb) => (
            <Card
              key={amb.id}
              className="group rounded-2xl border-slate-200/70 transition-all duration-300 hover:shadow-lg hover:shadow-emmy-primary/5"
            >
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-slate-100 bg-emmy-primary text-sm font-bold text-white">
                      {amb.avatar_url ? (
                        <img
                          src={amb.avatar_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        amb.name[0]?.toUpperCase() || 'U'
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {amb.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {amb.ambassador_tag}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {amb.email}
                      </p>
                    </div>
                  </div>

                  <Badge
                    variant={amb.status === 'active' ? 'default' : 'secondary'}
                    className="shrink-0"
                  >
                    {amb.status}
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Metric
                    icon={Users}
                    label={`Leads · ${range.label}`}
                    value={String(amb.total_leads || 0)}
                    iconClass="text-blue-500"
                  />

                  <Metric
                    icon={TrendingUp}
                    label={`Conversions · ${range.label}`}
                    value={String(amb.total_conversions || 0)}
                    iconClass="text-emerald-500"
                  />

                  <Metric
                    icon={DollarSign}
                    label="Current Balance"
                    value={formatCurrency(amb.available_balance)}
                    iconClass="text-violet-500"
                  />

                  <Metric
                    icon={Wallet}
                    label={`Paid · ${range.label}`}
                    value={formatCurrency(amb.total_cashed_out)}
                    iconClass="text-slate-500"
                  />
                </div>

                <div className="mt-4 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-end">
                  <Link
                    href={`/modules/marketing/ambassadors/${amb.id}`}
                    className="w-full sm:w-auto"
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full gap-1 text-emmy-primary hover:bg-emmy-primary/5 hover:text-emmy-primary sm:w-auto"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  iconClass,
}: {
  icon: any;
  label: string;
  value: string;
  iconClass: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${iconClass}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>

      <p className="mt-1 truncate text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}
