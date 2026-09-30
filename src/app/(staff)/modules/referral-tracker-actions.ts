'use server';

import { revalidatePath } from 'next/cache';
import {
  addCardholder,
  addDeposit,
  addPosEntry,
  addReferral,
  updateCardholder,
  updateReferral,
} from '@/lib/marketing/referral-tracker-sheet-server';

export type ReferralTrackerActionState = { success: boolean; message: string };
const fail = (message: string): ReferralTrackerActionState => ({ success: false, message });
const REVALIDATE_PATH = '/modules/referral-tracker';

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
    // referrer_phone is a sheet formula (looked up from referral_code in Card Holders) —
    // never sent. The sheet also requires referral_code to already exist as a card
    // holder; if it doesn't, this throws a clear message the form shows inline.
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
  const row = num(formData, 'row');
  if (!row) return fail('Referral row is required.');
  try {
    // commission_paid is now a sheet formula (computed from payment_status) — never sent.
    await updateReferral(
      row,
      { referral_code: str(formData, 'match_referral_code'), client_phone: str(formData, 'match_client_phone') },
      { payment_status: str(formData, 'payment_status') || null, notes: str(formData, 'notes') || null }
    );
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
  const row = num(formData, 'row');
  if (!row) return fail('Card holder row is required.');
  try {
    await updateCardholder(
      row,
      { referral_code: str(formData, 'match_referral_code'), phone_number: str(formData, 'match_phone_number') },
      { card_status: str(formData, 'card_status') || null, notes: str(formData, 'notes') || null }
    );
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
    await addPosEntry({
      date: str(formData, 'date') || null,
      client_name: clientName || null,
      phone_number: phoneNumber || null,
      amount_withdrawn: amount ?? null,
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
    await addDeposit({
      date: str(formData, 'date') || null,
      client_name: clientName || null,
      phone_number: phoneNumber || null,
      amount: amount ?? null,
    });
    revalidatePath(REVALIDATE_PATH);
    return { success: true, message: 'Deposit recorded.' };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unable to record deposit.');
  }
}
