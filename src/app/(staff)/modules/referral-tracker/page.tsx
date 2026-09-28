import { redirect } from 'next/navigation';
import { requireInternalUser } from '@/lib/auth/server';
import { canAccessReferralTracker } from '@/lib/auth/roles';
import {
  getCardholders,
  getPosEntries,
  getReferrals,
  getReferralTrackerSummary,
} from '@/lib/marketing/referral-tracker-sheet-server';
import { ReferralTrackerClient } from '@/components/marketing/referral-tracker-client';
import { Alert } from '@/components/ui/alert';

// Deliberately not nested under /modules/sales or /modules/marketing — front_desk only
// has 'sales' module access and marketing_manager only has 'marketing', and this page
// needs both plus growth_lead/admins. See canAccessReferralTracker in roles.ts.
export default async function ReferralTrackerPage() {
  const { role } = await requireInternalUser();
  if (!canAccessReferralTracker(role)) redirect('/');

  // This page's only data source is a live HTTP call to an external Google Apps Script —
  // no Supabase fallback, no cache. A sheet outage or a misconfigured env var must not
  // crash the whole page (the exact class of bug fixed elsewhere in Sales/Operations
  // this session): fetch defensively and show a clear inline error instead.
  let data: Awaited<ReturnType<typeof loadData>> | null = null;
  let loadError: string | null = null;
  try {
    data = await loadData();
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'The Referral Tracker sheet could not be reached.';
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Second data store — lives in Google Sheets, not Supabase</p>
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
      summary={data.summary}
    />
  );
}

async function loadData() {
  const [referrals, cardholders, posEntries, summary] = await Promise.all([
    getReferrals(),
    getCardholders(),
    getPosEntries(),
    getReferralTrackerSummary(),
  ]);
  return { referrals, cardholders, posEntries, summary };
}
