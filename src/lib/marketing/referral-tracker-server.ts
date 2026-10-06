import { getCachedAuthContext } from '@/lib/auth/server';
import { canAccessReferralTracker, isInternalRole } from '@/lib/auth/roles';

/**
 * Native Supabase home for the Referral Card program, Referral Card Holders, the Free
 * POS Tracker and POS Deposits — previously a Google Apps Script-backed spreadsheet,
 * now four real tables (referral_tracker_cardholders/referrals/pos_withdrawals/
 * pos_deposits, migration 20261006032608). Reads go through RLS as the signed-in user;
 * every write goes through a SECURITY DEFINER RPC (never a raw insert/update), each of
 * which re-checks referral_tracker_has_access() itself rather than trusting the caller.
 *
 * commission and commission_paid are GENERATED ALWAYS AS ... STORED columns, computed
 * by Postgres from revenue/commission_rate/payment_status — the app can never write
 * them directly, same invariant the old sheet enforced with formula columns.
 */

// Deliberately not gated by canAccessModule('marketing') or ('sales') — front_desk only
// has 'sales' and marketing_manager only has 'marketing', so no single module check
// covers the actual intended audience. See canAccessReferralTracker in roles.ts.
async function requireMarketingAccess() {
  const { user, profile, supabase } = await getCachedAuthContext();
  if (!user) throw new Error('Not authenticated');
  if (!profile || !isInternalRole(profile.role) || !canAccessReferralTracker(profile.role)) {
    throw new Error('Not authorized');
  }
  return supabase;
}

export type ReferralRow = {
  id: string;
  referral_code: string | null;
  referred_client: string | null;
  client_phone: string | null;
  referral_date: string | null;
  revenue: number | null;
  commission_rate: number | null;
  /** Generated column (revenue × commission_rate) — read-only. */
  commission: number | null;
  payment_status: 'Pending' | 'Paid' | string | null;
  /** Generated column (commission when Paid, else 0) — read-only. */
  commission_paid: number | null;
  notes: string | null;
};

export type CardholderRow = {
  id: string;
  referral_code: string | null;
  phone_number: string | null;
  date_card_given: string | null;
  card_status: 'Active' | 'Inactive' | string | null;
  notes: string | null;
};

export type PosRow = {
  id: string;
  date: string | null;
  client_name: string | null;
  phone_number: string | null;
  amount_withdrawn: number | null;
};

export type DepositRow = {
  id: string;
  date: string | null;
  client_name: string | null;
  phone_number: string | null;
  amount: number | null;
};

export type ReferralTrackerSummary = {
  total_referrals: number | null;
  total_revenue: number | null;
  total_commission: number | null;
  commission_paid: number | null;
  commission_outstanding: number | null;
  pos_total_withdrawals: number | null;
  pos_transactions: number | null;
  deposit_total: number | null;
  deposit_transactions: number | null;
};

// Numeric columns come back over PostgREST as JSON numbers already, but RPC composite
// returns have been inconsistent across drivers in this codebase — coerce defensively
// rather than let a stray string silently break `money()`/arithmetic downstream.
const num = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

function toReferralRow(row: Record<string, unknown>): ReferralRow {
  return {
    id: String(row.id),
    referral_code: (row.referral_code as string) ?? null,
    referred_client: (row.referred_client as string) ?? null,
    client_phone: (row.client_phone as string) ?? null,
    referral_date: (row.referral_date as string) ?? null,
    revenue: num(row.revenue),
    commission_rate: num(row.commission_rate),
    commission: num(row.commission),
    payment_status: (row.payment_status as string) ?? null,
    commission_paid: num(row.commission_paid),
    notes: (row.notes as string) ?? null,
  };
}

function toCardholderRow(row: Record<string, unknown>): CardholderRow {
  return {
    id: String(row.id),
    referral_code: (row.referral_code as string) ?? null,
    phone_number: (row.phone_number as string) ?? null,
    date_card_given: (row.date_card_given as string) ?? null,
    card_status: (row.card_status as string) ?? null,
    notes: (row.notes as string) ?? null,
  };
}

function toPosRow(row: Record<string, unknown>): PosRow {
  return {
    id: String(row.id),
    date: (row.date as string) ?? null,
    client_name: (row.client_name as string) ?? null,
    phone_number: (row.phone_number as string) ?? null,
    amount_withdrawn: num(row.amount_withdrawn),
  };
}

function toDepositRow(row: Record<string, unknown>): DepositRow {
  return {
    id: String(row.id),
    date: (row.date as string) ?? null,
    client_name: (row.client_name as string) ?? null,
    phone_number: (row.phone_number as string) ?? null,
    amount: num(row.amount),
  };
}

export async function getReferrals(): Promise<ReferralRow[]> {
  const supabase = await requireMarketingAccess();
  const { data, error } = await supabase
    .from('referral_tracker_referrals')
    .select('id,referral_code,referred_client,client_phone,referral_date,revenue,commission_rate,commission,payment_status,commission_paid,notes')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(toReferralRow);
}

export async function getCardholders(): Promise<CardholderRow[]> {
  const supabase = await requireMarketingAccess();
  const { data, error } = await supabase
    .from('referral_tracker_cardholders')
    .select('id,referral_code,phone_number,date_card_given,card_status,notes')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(toCardholderRow);
}

export async function getPosEntries(): Promise<PosRow[]> {
  const supabase = await requireMarketingAccess();
  const { data, error } = await supabase
    .from('referral_tracker_pos_withdrawals')
    .select('id,date,client_name,phone_number,amount_withdrawn')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(toPosRow);
}

export async function getDeposits(): Promise<DepositRow[]> {
  const supabase = await requireMarketingAccess();
  const { data, error } = await supabase
    .from('referral_tracker_pos_deposits')
    .select('id,date,client_name,phone_number,amount')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(toDepositRow);
}

// No separate round trip for this — the page already loads the full referrals/pos/
// deposits lists for their tables, so the summary tiles are computed from those same
// rows instead of a 5th query (the old sheet needed a dedicated "summary" formula tab;
// Postgres rows are cheap enough to just add up here).
export function computeReferralTrackerSummary(referrals: ReferralRow[], posEntries: PosRow[], deposits: DepositRow[]): ReferralTrackerSummary {
  const total_revenue = referrals.reduce((sum, r) => sum + (r.revenue || 0), 0);
  const total_commission = referrals.reduce((sum, r) => sum + (r.commission || 0), 0);
  const commission_paid = referrals.reduce((sum, r) => sum + (r.commission_paid || 0), 0);
  const pos_total_withdrawals = posEntries.reduce((sum, p) => sum + (p.amount_withdrawn || 0), 0);
  const deposit_total = deposits.reduce((sum, d) => sum + (d.amount || 0), 0);
  return {
    total_referrals: referrals.length,
    total_revenue,
    total_commission,
    commission_paid,
    commission_outstanding: total_commission - commission_paid,
    pos_total_withdrawals,
    pos_transactions: posEntries.length,
    deposit_total,
    deposit_transactions: deposits.length,
  };
}

export type ReferralWritableFields = {
  referral_code: string | null;
  referred_client: string | null;
  client_phone: string | null;
  referral_date: string | null;
  revenue: number | null;
  notes: string | null;
};

export type CardholderWritableFields = {
  referral_code: string | null;
  phone_number: string | null;
  date_card_given: string | null;
  card_status: string | null;
  notes: string | null;
};

export type PosWritableFields = {
  date: string | null;
  client_name: string | null;
  phone_number: string | null;
  amount_withdrawn: number | null;
  identity_id: string | null;
};

export type DepositWritableFields = {
  date: string | null;
  client_name: string | null;
  phone_number: string | null;
  amount: number | null;
  identity_id: string | null;
};

// The referral_code must already exist in Card Holders — referral_tracker_add_referral
// pre-checks this and raises a clear message if it doesn't, same contract the sheet had.
export async function addReferral(fields: ReferralWritableFields): Promise<ReferralRow> {
  const supabase = await requireMarketingAccess();
  const { data, error } = await supabase.rpc('referral_tracker_add_referral', {
    p_referral_code: fields.referral_code,
    p_referred_client: fields.referred_client,
    p_client_phone: fields.client_phone,
    p_referral_date: fields.referral_date,
    p_revenue: fields.revenue ?? 0,
    p_notes: fields.notes,
  });
  if (error) throw new Error(error.message);
  return toReferralRow(data as Record<string, unknown>);
}

export async function updateReferralPayment(id: string, paymentStatus: string, notes: string | null): Promise<ReferralRow> {
  const supabase = await requireMarketingAccess();
  const { data, error } = await supabase.rpc('referral_tracker_update_referral_payment', {
    p_id: id,
    p_payment_status: paymentStatus,
    p_notes: notes,
  });
  if (error) throw new Error(error.message);
  return toReferralRow(data as Record<string, unknown>);
}

export async function addCardholder(fields: CardholderWritableFields): Promise<CardholderRow> {
  const supabase = await requireMarketingAccess();
  const { data, error } = await supabase.rpc('referral_tracker_add_cardholder', {
    p_referral_code: fields.referral_code,
    p_phone_number: fields.phone_number,
    p_date_card_given: fields.date_card_given,
    p_card_status: fields.card_status ?? 'Active',
    p_notes: fields.notes,
  });
  if (error) throw new Error(error.message);
  return toCardholderRow(data as Record<string, unknown>);
}

export async function updateCardholderStatus(id: string, cardStatus: string, notes: string | null): Promise<CardholderRow> {
  const supabase = await requireMarketingAccess();
  const { data, error } = await supabase.rpc('referral_tracker_update_cardholder_status', {
    p_id: id,
    p_card_status: cardStatus,
    p_notes: notes,
  });
  if (error) throw new Error(error.message);
  return toCardholderRow(data as Record<string, unknown>);
}

export async function addPosEntry(fields: PosWritableFields): Promise<PosRow> {
  const supabase = await requireMarketingAccess();
  const { data, error } = await supabase.rpc('referral_tracker_add_pos_withdrawal', {
    p_date: fields.date,
    p_client_name: fields.client_name,
    p_phone_number: fields.phone_number,
    p_amount_withdrawn: fields.amount_withdrawn ?? 0,
    p_identity_id: fields.identity_id,
  });
  if (error) throw new Error(error.message);
  return toPosRow(data as Record<string, unknown>);
}

export async function addDeposit(fields: DepositWritableFields): Promise<DepositRow> {
  const supabase = await requireMarketingAccess();
  const { data, error } = await supabase.rpc('referral_tracker_add_pos_deposit', {
    p_date: fields.date,
    p_client_name: fields.client_name,
    p_phone_number: fields.phone_number,
    p_amount: fields.amount ?? 0,
    p_identity_id: fields.identity_id,
  });
  if (error) throw new Error(error.message);
  return toDepositRow(data as Record<string, unknown>);
}
