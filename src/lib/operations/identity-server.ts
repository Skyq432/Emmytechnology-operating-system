import { createClient } from '@/lib/supabase-server';
import type { OperationsIdentitySummary } from './types';

const stageNames: Record<number, string> = {
  1: 'Awareness',
  2: 'Interest',
  3: 'Consideration',
  4: 'Intent',
  5: 'Purchase',
  6: 'Onboarding',
  7: 'Satisfaction',
  8: 'Loyalty',
  9: 'Expansion',
  10: 'Advocacy',
};

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profileError || profile?.role !== 'admin') throw new Error('Not authorized');
  return supabase;
}

export function normalizeOperationsPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length >= 10) return `+234${digits.slice(1)}`;
  if (digits.length === 10) return `+234${digits}`;
  return `+${digits}`;
}

function safeSearch(value: string) {
  return value.replace(/[,%()]/g, ' ').trim();
}

export async function searchOperationsIdentities(query: string): Promise<OperationsIdentitySummary[]> {
  const supabase = await requireAdmin();
  const raw = safeSearch(query);
  if (raw.length < 3) return [];

  const phone = normalizeOperationsPhone(raw);
  const phoneDigits = phone.replace(/\D/g, '');
  const localPhone = phoneDigits.startsWith('234') ? `0${phoneDigits.slice(3)}` : phoneDigits;
  const clauses = [
    `primary_name.ilike.%${raw}%`,
    `primary_email.ilike.%${raw}%`,
    `primary_phone.ilike.%${raw}%`,
  ];
  if (phoneDigits) clauses.push(`primary_phone.ilike.%${phoneDigits.slice(-10)}%`);
  if (localPhone) clauses.push(`primary_phone.ilike.%${localPhone}%`);

  const { data: identities, error } = await supabase
    .from('identities')
    .select('id,identity_code,primary_name,primary_phone,primary_email')
    .or(clauses.join(','))
    .limit(8);
  if (error) throw new Error(error.message);
  if (!identities?.length) return [];

  const ids = identities.map((row) => row.id);
  const [leadsResult, ownershipResult, cashOffResult] = await Promise.all([
    supabase
      .from('leads')
      .select('id,identity_id,ambassador_id,source,funnel_stage,updated_at,created_at')
      .in('identity_id', ids)
      .order('updated_at', { ascending: false }),
    supabase
      .from('crm_lead_ownership')
      .select('identity_id,original_ambassador_id,owner_type,owner_id,owner_label,updated_at')
      .in('identity_id', ids),
    supabase
      .from('cash_off_accounts')
      .select('identity_id,balance')
      .in('identity_id', ids),
  ]);
  if (leadsResult.error) throw new Error(leadsResult.error.message);
  if (ownershipResult.error) throw new Error(ownershipResult.error.message);
  if (cashOffResult.error) throw new Error(cashOffResult.error.message);

  const leadByIdentity = new Map<string, (typeof leadsResult.data)[number]>();
  for (const row of leadsResult.data || []) {
    if (!leadByIdentity.has(row.identity_id)) leadByIdentity.set(row.identity_id, row);
  }

  const ownershipByIdentity = new Map((ownershipResult.data || []).map((row) => [row.identity_id, row]));
  const cashOffByIdentity = new Map((cashOffResult.data || []).map((row) => [row.identity_id, Number(row.balance || 0)]));

  const ambassadorIds = Array.from(
    new Set(
      identities
        .flatMap((identity) => {
          const lead = leadByIdentity.get(identity.id);
          const ownership = ownershipByIdentity.get(identity.id);
          return [ownership?.original_ambassador_id, lead?.ambassador_id].filter(Boolean) as string[];
        })
    )
  );

  const ambassadorMap = new Map<string, string>();
  if (ambassadorIds.length) {
    const { data: ambassadors, error: ambassadorError } = await supabase
      .from('ambassadors')
      .select('id,display_name,ambassador_tag,user_id')
      .in('id', ambassadorIds);
    if (ambassadorError) throw new Error(ambassadorError.message);

    const userIds = (ambassadors || []).map((row) => row.user_id).filter(Boolean) as string[];
    const userMap = new Map<string, string>();
    if (userIds.length) {
      const { data: users } = await supabase.from('users').select('id,name,email').in('id', userIds);
      for (const user of users || []) userMap.set(user.id, user.name || user.email || 'Ambassador');
    }
    for (const ambassador of ambassadors || []) {
      ambassadorMap.set(
        ambassador.id,
        ambassador.display_name || userMap.get(ambassador.user_id) || ambassador.ambassador_tag || 'Ambassador'
      );
    }
  }

  const summaries = await Promise.all(
    identities.map(async (identity) => {
      const lead = leadByIdentity.get(identity.id);
      const ownership = ownershipByIdentity.get(identity.id);
      const ambassadorId = ownership?.original_ambassador_id || lead?.ambassador_id || null;
      const { data: stage } = await supabase.rpc('ops_current_crm_stage', { p_identity_id: identity.id });
      const crmStage = Number(stage || 0);

      return {
        id: identity.id,
        identity_code: identity.identity_code,
        primary_name: identity.primary_name,
        primary_phone: identity.primary_phone,
        primary_email: identity.primary_email,
        crm_stage: crmStage,
        crm_stage_name: stageNames[crmStage] || 'Unknown',
        lead_id: lead?.id || null,
        ambassador_id: ambassadorId,
        ambassador_name: ambassadorId ? ambassadorMap.get(ambassadorId) || 'Ambassador' : null,
        acquisition_source: lead?.source || null,
        cash_off_balance: cashOffByIdentity.get(identity.id) || 0,
      } satisfies OperationsIdentitySummary;
    })
  );

  return summaries;
}

export async function getOperationsIdentitySummary(identityId: string) {
  const matches = await searchOperationsIdentities(identityId);
  return matches.find((item) => item.id === identityId) || null;
}
