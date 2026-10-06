import { redirect } from 'next/navigation';
import { requireInternalUser } from '@/lib/auth/server';
import { canAccessReferralTracker } from '@/lib/auth/roles';
import {
  computeReferralTrackerSummary,
  getCardholders,
  getDeposits,
  getPosEntries,
  getReferrals,
} from '@/lib/marketing/referral-tracker-server';
import { ReferralTrackerClient } from '@/components/marketing/referral-tracker-client';
import { Alert } from '@/components/ui/alert';

// Deliberately not nested under /modules/sales or /modules/marketing — front_desk only
// has 'sales' module access and marketing_manager only has 'marketing', and this page
// needs both plus growth_lead/admins. See canAccessReferralTracker in roles.ts.
export default async function ReferralTrackerPage() {
  const { role } = await requireInternalUser();
  if (!canAccessReferralTracker(role)) redirect('/');

  // Four fast, parallel Supabase reads (RLS-gated) — no external round trip, no cache
  // to go stale. Still fetched defensively: a bug here must show a clear inline error,
  // never crash the whole page.
  let data: Awaited<ReturnType<typeof loadData>> | null = null;
  let loadError: string | null = null;
  try {
    data = await loadData();
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'The Referral Tracker could not be loaded.';
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Referral Card program · Card Holders · Free POS · Deposits</p>
          <h1 className="mt-2 text-3xl font-black text-emmy-primary">Referral Tracker</h1>
        </div>
        <Alert variant="error">{loadError}</Alert>
      </div>
    );
  }

  return (
    <ReferralTrackerClient
      referrals={data.referrals}
      cardholders={data.cardholders}
      posEntries={data.posEntries}
      deposits={data.deposits}
      summary={data.summary}
    />
  );
}

async function loadData() {
  const [referrals, cardholders, posEntries, deposits] = await Promise.all([
    getReferrals(),
    getCardholders(),
    getPosEntries(),
    getDeposits(),
  ]);
  const summary = computeReferralTrackerSummary(referrals, posEntries, deposits);
  return { referrals, cardholders, posEntries, deposits, summary };
}
