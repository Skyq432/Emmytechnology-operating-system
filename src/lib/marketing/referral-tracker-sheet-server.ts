import { getCachedAuthContext } from '@/lib/auth/server';
import { canAccessReferralTracker, isInternalRole } from '@/lib/auth/roles';

/**
 * Client for the "EMMY TECHNOLOGY — Referral Tracker" Google Apps Script web app.
 * This is a deliberate second data store, kept out of Supabase — the sheet is where
 * the Referral Card program, Referral Card Holders and the Free POS Tracker actually
 * live day to day. This module only talks to it over HTTP; there is no local cache or
 * mirrored table, so every call here is a live round trip to the sheet.
 *
 * The Apps Script can't send real HTTP status codes, so every response — success or
 * failure — comes back 200 with an `ok` boolean; that's why every helper below checks
 * `body.ok` rather than `response.ok`.
 */

// Deliberately not gated by canAccessModule('marketing') or ('sales') — front_desk only
// has 'sales' and marketing_manager only has 'marketing', so no single module check
// covers the actual intended audience. See canAccessReferralTracker in roles.ts.
async function requireMarketingAccess() {
  const { user, profile } = await getCachedAuthContext();
  if (!user) throw new Error('Not authenticated');
  if (!profile || !isInternalRole(profile.role) || !canAccessReferralTracker(profile.role)) {
    throw new Error('Not authorized');
  }
  return profile.role;
}

function sheetApiUrl() {
  const url = process.env.REFERRAL_SHEET_API_URL;
  if (!url) throw new Error('REFERRAL_SHEET_API_URL is not configured.');
  return url;
}

async function readSheet<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(sheetApiUrl());
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  // Always bypass the Apps Script's own 60s cache: staff acting on this data (e.g. right
  // after recording a payment) need to see their own write immediately, not a minute-old copy.
  url.searchParams.set('nocache', '1');
  if (process.env.REFERRAL_SHEET_API_KEY) url.searchParams.set('key', process.env.REFERRAL_SHEET_API_KEY);

  const response = await fetch(url.toString(), { cache: 'no-store' });
  const body = await response.json().catch(() => null) as { ok?: boolean; data?: T; error?: string } | null;
  if (!body?.ok) throw new Error(body?.error || 'Referral Tracker sheet request failed.');
  return body.data as T;
}

async function writeSheet<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(sheetApiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      key: process.env.REFERRAL_SHEET_API_KEY || undefined,
      ...payload,
    }),
  });
  const body = await response.json().catch(() => null) as { ok?: boolean; data?: T; error?: string } | null;
  if (!body?.ok) throw new Error(body?.error || 'Referral Tracker sheet write failed.');
  return body.data as T;
}

export type ReferralRow = {
  referral_code: string | null;
  referrer_phone: string | null;
  referred_client: string | null;
  client_phone: string | null;
  referral_date: string | null;
  revenue: number | null;
  commission_rate: number | null;
  commission: number | null;
  payment_status: string | null;
  commission_paid: number | null;
  notes: string | null;
  _row: number;
};

export type CardholderRow = {
  referral_code: string | null;
  phone_number: string | null;
  date_card_given: string | null;
  card_status: string | null;
  notes: string | null;
  _row: number;
};

export type PosRow = {
  date: string | null;
  client_name: string | null;
  phone_number: string | null;
  amount_withdrawn: number | null;
  _row: number;
};

export type ReferralTrackerSummary = {
  total_referrals: number | null;
  total_revenue: number | null;
  total_commission: number | null;
  commission_paid: number | null;
  commission_outstanding: number | null;
  pos_total_withdrawals: number | null;
  pos_transactions: number | null;
};

export async function getReferrals() {
  await requireMarketingAccess();
  return readSheet<ReferralRow[]>({ sheet: 'referrals' });
}

export async function getCardholders() {
  await requireMarketingAccess();
  return readSheet<CardholderRow[]>({ sheet: 'cardholders' });
}

export async function getPosEntries() {
  await requireMarketingAccess();
  return readSheet<PosRow[]>({ sheet: 'pos' });
}

export async function getReferralTrackerSummary() {
  await requireMarketingAccess();
  return readSheet<ReferralTrackerSummary>({ sheet: 'summary' });
}

export async function getReferralTrackerSettings() {
  await requireMarketingAccess();
  return readSheet<{ default_commission_rate: number | null }>({ sheet: 'settings' });
}

// Only send fields you actually want written — anything left out (e.g. commission_rate,
// commission) is never touched, which matters because those columns are very likely
// formulas in the sheet itself.
export async function addReferral(fields: Partial<Omit<ReferralRow, '_row'>>) {
  await requireMarketingAccess();
  return writeSheet<{ row: number }>('add_referral', { fields });
}

export async function updateReferral(row: number, fields: Partial<Omit<ReferralRow, '_row'>>) {
  await requireMarketingAccess();
  return writeSheet<{ row: number }>('update_referral', { row, fields });
}

export async function addCardholder(fields: Partial<Omit<CardholderRow, '_row'>>) {
  await requireMarketingAccess();
  return writeSheet<{ row: number }>('add_cardholder', { fields });
}

export async function updateCardholder(row: number, fields: Partial<Omit<CardholderRow, '_row'>>) {
  await requireMarketingAccess();
  return writeSheet<{ row: number }>('update_cardholder', { row, fields });
}

export async function addPosEntry(fields: Partial<Omit<PosRow, '_row'>>) {
  await requireMarketingAccess();
  return writeSheet<{ row: number }>('add_pos_entry', { fields });
}
