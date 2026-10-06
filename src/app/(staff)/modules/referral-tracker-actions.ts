'use server';

import { revalidatePath } from 'next/cache';
import {
  addCardholder,
  addDeposit,
  addPosEntry,
  addReferral,
  updateCardholderStatus,
  updateReferralPayment,
} from '@/lib/marketing/referral-tracker-server';
import { resolveReferralTrackerIdentity } from '@/lib/operations/identity-server';

export type ReferralTrackerActionState = { success: boolean; message: string };
const fail = (message: string): ReferralTrackerActionState => ({ success: false, message });
const REVALIDATE_PATH = '/modules/referral-tracker';

// POS withdrawals/deposits: the person typing a name/phone in should become a real,
// searchable Supabase Identity, linked directly on the record (identity_id). Best-effort
// on purpose — recording the withdrawal/deposit itself must never fail just because
// identity resolution hit a transient error or a role without access; on failure this
// just returns null and the record is saved with no identity_id.
async function linkPosIdentity(input: { existingIdentityId: string; name: string; phone: string }): Promise<string | null> {
  try {
    return await resolveReferralTrackerIdentity({
      existingIdentityId: input.existingIdentityId || null,
      name: input.name || null,
      phone: input.phone || null,
      source: 'referral_tracker_pos',
    });
  } catch {
    return null;
  }
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) || '').trim();
}
function num(formData: FormData, key: string): number | undefined {
  const raw = formData.get(key);
  if (raw === null || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export async function addReferralAction(_prev: ReferralTrackerActionState, formData: FormData): Promise<ReferralTrackerActionState> {
  const referralCode = str(formData, 'referral_code');
  const referredClient = str(formData, 'referred_client');
  const clientPhone = str(formData, 'client_phone');
  if (!referralCode && !referredClient && !clientPhone) {
    return fail('Referral code, referred client or client phone is required.');
  }
  try {
    // referral_code must already exist as a card holder — the RPC checks this and
    // throws a clear message if it doesn't. commission is computed by Postgres.
    await addReferral({
      referral_code: referralCode || null,
      referred_client: referredClient || null,
      client_phone: clientPhone || null,
      referral_date: str(formData, 'referral_date') || null,
      revenue: num(formData, 'revenue') ?? null,
      notes: str(formData, 'notes') || null,
    });
    revalidatePath(REVALIDATE_PATH);
    return { success: true, message: 'Referral recorded.' };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unable to record referral.');
  }
}

export async function updateReferralPaymentAction(_prev: ReferralTrackerActionState, formData: FormData): Promise<ReferralTrackerActionState> {
  const id = str(formData, 'id');
  if (!id) return fail('Referral id is required.');
  try {
    await updateReferralPayment(id, str(formData, 'payment_status') || 'Pending', str(formData, 'notes') || null);
    revalidatePath(REVALIDATE_PATH);
    return { success: true, message: 'Referral payment updated.' };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unable to update referral payment.');
  }
}

export async function addCardholderAction(_prev: ReferralTrackerActionState, formData: FormData): Promise<ReferralTrackerActionState> {
  const referralCode = str(formData, 'referral_code');
  const phoneNumber = str(formData, 'phone_number');
  if (!referralCode && !phoneNumber) return fail('Referral code or phone number is required.');
  try {
    await addCardholder({
      referral_code: referralCode || null,
      phone_number: phoneNumber || null,
      date_card_given: str(formData, 'date_card_given') || null,
      card_status: str(formData, 'card_status') || 'Active',
      notes: str(formData, 'notes') || null,
    });
    revalidatePath(REVALIDATE_PATH);
    return { success: true, message: 'Card holder added.' };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unable to add card holder.');
  }
}

export async function updateCardholderStatusAction(_prev: ReferralTrackerActionState, formData: FormData): Promise<ReferralTrackerActionState> {
  const id = str(formData, 'id');
  if (!id) return fail('Card holder id is required.');
  try {
    await updateCardholderStatus(id, str(formData, 'card_status') || 'Active', str(formData, 'notes') || null);
    revalidatePath(REVALIDATE_PATH);
    return { success: true, message: 'Card status updated.' };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unable to update card status.');
  }
}

export async function addPosEntryAction(_prev: ReferralTrackerActionState, formData: FormData): Promise<ReferralTrackerActionState> {
  const clientName = str(formData, 'client_name');
  const phoneNumber = str(formData, 'phone_number');
  const amount = num(formData, 'amount_withdrawn');
  if (!clientName && !phoneNumber && !amount) return fail('Client name, phone number or amount withdrawn is required.');
  try {
    const identityId = await linkPosIdentity({ existingIdentityId: str(formData, 'identity_id'), name: clientName, phone: phoneNumber });
    await addPosEntry({
      date: str(formData, 'date') || null,
      client_name: clientName || null,
      phone_number: phoneNumber || null,
      amount_withdrawn: amount ?? null,
      identity_id: identityId,
    });
    revalidatePath(REVALIDATE_PATH);
    return { success: true, message: 'POS withdrawal recorded.' };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unable to record POS withdrawal.');
  }
}

export async function addDepositAction(_prev: ReferralTrackerActionState, formData: FormData): Promise<ReferralTrackerActionState> {
  const clientName = str(formData, 'client_name');
  const phoneNumber = str(formData, 'phone_number');
  const amount = num(formData, 'amount');
  if (!clientName && !phoneNumber && !amount) return fail('Client name, phone number or amount is required.');
  try {
    const identityId = await linkPosIdentity({ existingIdentityId: str(formData, 'identity_id'), name: clientName, phone: phoneNumber });
    await addDeposit({
      date: str(formData, 'date') || null,
      client_name: clientName || null,
      phone_number: phoneNumber || null,
      amount: amount ?? null,
      identity_id: identityId,
    });
    revalidatePath(REVALIDATE_PATH);
    return { success: true, message: 'Deposit recorded.' };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unable to record deposit.');
  }
}
