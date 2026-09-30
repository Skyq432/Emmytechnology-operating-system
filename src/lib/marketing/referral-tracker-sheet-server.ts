import { getCachedAuthContext } from '@/lib/auth/server';
import { canAccessReferralTracker, isInternalRole } from '@/lib/auth/roles';

/**
 * Client for the "EMMY TECHNOLOGY — Referral Tracker" Google Apps Script web app (v2).
 * This is a deliberate second data store, kept out of Supabase — the sheet is where
 * the Referral Card program, Referral Card Holders, the Free POS Tracker and POS
 * Deposits actually live day to day. This module only talks to it over HTTP; there is
 * no local cache or mirrored table, so every call here is a live round trip to the sheet.
 *
 * The Apps Script can't send real HTTP status codes, so every response — success or
 * failure — comes back 200 with an `ok` boolean; that's why every helper below checks
 * `body.ok` rather than `response.ok`.
 *
 * v2 contract changes from the original script:
 *   - referrer_phone, commission and commission_paid are now sheet formulas — the
 *     script rejects any write to them outright ("is calculated by the sheet and
 *     cannot be written"), so they're never sent from here.
 *   - Every update now requires `match`: the values the row had when it was loaded,
 *     so a write can't silently land on the wrong row if the sheet changed underneath
 *     (someone sorted it, deleted a row, etc.) between the read and the write.
 *   - A referral's referral_code must already exist in Card Holders — the script
 *     enforces this and rejects the write with a clear message if it doesn't.
 *   - Card Holders' card_status options are Active/Inactive only (no "Lost").
 *   - A write's response is the full row as the sheet now sees it (formula columns
 *     included), not just the row number.
 *   - New "POS Deposits" sheet (deposits), mirroring the Free POS Tracker's shape.
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

function apiKey() {
  const key = process.env.REFERRAL_SHEET_API_KEY;
  if (!key) throw new Error('REFERRAL_SHEET_API_KEY is not configured.');
  return key;
}

async function readSheet<T>(sheet: string): Promise<T> {
  const url = new URL(sheetApiUrl());
  url.searchParams.set('sheet', sheet);
  // Always bypass the Apps Script's own 60s cache: staff acting on this data (e.g. right
  // after recording a payment) need to see their own write immediately, not a minute-old copy.
  url.searchParams.set('nocache', '1');
  url.searchParams.set('key', apiKey());

  const response = await fetch(url.toString(), { cache: 'no-store' });
  const rawText = await response.text();
  let body: { ok?: boolean; data?: T; error?: string } | null = null;
  try { body = JSON.parse(rawText); } catch { /* body stays null, logged below */ }
  if (!body?.ok) {
    // TEMP DEBUG — remove before committing. Shows up in Netlify's function logs.
    console.error('[referral-tracker-sheet debug]', JSON.stringify({
      sheet, status: response.status, redirected: response.redirected, finalUrl: response.url,
      rawTextSample: rawText.slice(0, 500),
    }));
    throw new Error(body?.error || 'Referral Tracker sheet request failed.');
  }
  return body.data as T;
}

async function writeSheet<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(sheetApiUrl(), {
    method: 'POST',
    // text/plain avoids a CORS preflight in the browser; this call is server-to-server
    // so it makes no functional difference here, but it matches the script's documented
    // contract exactly rather than relying on it not minding the header.
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action, key: apiKey(), ...payload }),
  });
  const rawText = await response.text();
  let body: { ok?: boolean; data?: T; error?: string } | null = null;
  try { body = JSON.parse(rawText); } catch { /* body stays null, logged below */ }
  if (!body?.ok) {
    // TEMP DEBUG — remove before committing. Shows up in Netlify's function logs.
    console.error('[referral-tracker-sheet debug]', JSON.stringify({
      action, status: response.status, redirected: response.redirected, finalUrl: response.url,
      rawTextSample: rawText.slice(0, 500),
    }));
    throw new Error(body?.error || 'Referral Tracker sheet write failed.');
  }
  return body.data as T;
}

export type ReferralRow = {
  referral_code: string | null;
  /** Sheet formula (looked up from referral_code in Card Holders) — read-only. */
  referrer_phone: string | null;
  referred_client: string | null;
  client_phone: string | null;
  referral_date: string | null;
  revenue: number | null;
  commission_rate: number | null;
  /** Sheet formula (revenue × commission_rate) — read-only. */
  commission: number | null;
  payment_status: 'Pending' | 'Paid' | string | null;
  /** Sheet formula (commission when Paid, else 0) — read-only. */
  commission_paid: number | null;
  notes: string | null;
  _row: number;
};

export type CardholderRow = {
  referral_code: string | null;
  phone_number: string | null;
  date_card_given: string | null;
  card_status: 'Active' | 'Inactive' | string | null;
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

export type DepositRow = {
  date: string | null;
  client_name: string | null;
  phone_number: string | null;
  amount: number | null;
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
  deposit_total: number | null;
  deposit_transactions: number | null;
};

export type ReferralWritableFields = Partial<Pick<ReferralRow,
  'referral_code' | 'referred_client' | 'client_phone' | 'referral_date' | 'revenue' | 'commission_rate' | 'payment_status' | 'notes'
>>;
export type CardholderWritableFields = Partial<Omit<CardholderRow, '_row'>>;
export type PosWritableFields = Partial<Omit<PosRow, '_row'>>;
export type DepositWritableFields = Partial<Omit<DepositRow, '_row'>>;

export async function getReferrals() {
  await requireMarketingAccess();
  return readSheet<ReferralRow[]>('referrals');
}

export async function getCardholders() {
  await requireMarketingAccess();
  return readSheet<CardholderRow[]>('cardholders');
}

export async function getPosEntries() {
  await requireMarketingAccess();
  return readSheet<PosRow[]>('pos');
}

export async function getDeposits() {
  await requireMarketingAccess();
  return readSheet<DepositRow[]>('deposits');
}

export async function getReferralTrackerSummary() {
  await requireMarketingAccess();
  return readSheet<ReferralTrackerSummary>('summary');
}

export async function getReferralTrackerSettings() {
  await requireMarketingAccess();
  return readSheet<{ default_commission_rate: number | null }>('settings');
}

// Only send fields you actually want written — referrer_phone, commission and
// commission_paid are rejected outright by the sheet (they're formulas), which is why
// ReferralWritableFields doesn't even offer them.
export async function addReferral(fields: ReferralWritableFields) {
  await requireMarketingAccess();
  return writeSheet<ReferralRow>('add_referral', { fields });
}

// `match` must be the values this row had when it was loaded (e.g. { referral_code,
// client_phone }) — the sheet refuses the write if they no longer match, so a save can
// never silently land on the wrong row after the sheet changed underneath it.
export async function updateReferral(row: number, match: Record<string, unknown>, fields: ReferralWritableFields) {
  await requireMarketingAccess();
  return writeSheet<ReferralRow>('update_referral', { row, match, fields });
}

export async function addCardholder(fields: CardholderWritableFields) {
  await requireMarketingAccess();
  return writeSheet<CardholderRow>('add_cardholder', { fields });
}

export async function updateCardholder(row: number, match: Record<string, unknown>, fields: CardholderWritableFields) {
  await requireMarketingAccess();
  return writeSheet<CardholderRow>('update_cardholder', { row, match, fields });
}

export async function addPosEntry(fields: PosWritableFields) {
  await requireMarketingAccess();
  return writeSheet<PosRow>('add_pos_entry', { fields });
}

export async function addDeposit(fields: DepositWritableFields) {
  await requireMarketingAccess();
  return writeSheet<DepositRow>('add_deposit', { fields });
}
