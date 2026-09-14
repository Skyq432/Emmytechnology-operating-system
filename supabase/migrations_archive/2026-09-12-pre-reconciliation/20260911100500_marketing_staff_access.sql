-- Scoped Marketing access for Growth Lead and Marketing Manager.
-- This deliberately avoids global admin helpers and keeps payout/points data read-only.

create or replace function public.is_marketing_staff()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role in ('super_admin', 'admin', 'growth_lead', 'marketing_manager')
  );
$$;

-- Core Marketing programme tables used by the existing workspace.
drop policy if exists "Marketing staff manage ambassadors" on public.ambassadors;
create policy "Marketing staff manage ambassadors"
on public.ambassadors for all to authenticated
using (public.is_marketing_staff())
with check (public.is_marketing_staff());

drop policy if exists "Marketing staff manage leads" on public.leads;
create policy "Marketing staff manage leads"
on public.leads for all to authenticated
using (public.is_marketing_staff())
with check (public.is_marketing_staff());

drop policy if exists "Marketing staff manage conversions" on public.conversions;
create policy "Marketing staff manage conversions"
on public.conversions for all to authenticated
using (public.is_marketing_staff())
with check (public.is_marketing_staff());

drop policy if exists "Marketing staff manage activities" on public.activities;
create policy "Marketing staff manage activities"
on public.activities for all to authenticated
using (public.is_marketing_staff())
with check (public.is_marketing_staff());

drop policy if exists "Marketing staff manage products" on public.products;
create policy "Marketing staff manage products"
on public.products for all to authenticated
using (public.is_marketing_staff())
with check (public.is_marketing_staff());

-- Supporting analytics remain read-only for non-admin Marketing staff.
drop policy if exists "Marketing staff view referral clicks" on public.referral_clicks;
create policy "Marketing staff view referral clicks"
on public.referral_clicks for select to authenticated
using (public.is_marketing_staff());

drop policy if exists "Marketing staff view payouts" on public.payouts;
create policy "Marketing staff view payouts"
on public.payouts for select to authenticated
using (public.is_marketing_staff());

drop policy if exists "Marketing staff view point transactions" on public.point_transactions;
create policy "Marketing staff view point transactions"
on public.point_transactions for select to authenticated
using (public.is_marketing_staff());

drop policy if exists "Marketing staff view spin attributions" on public.ambassador_spin_attributions;
create policy "Marketing staff view spin attributions"
on public.ambassador_spin_attributions for select to authenticated
using (public.is_marketing_staff());

drop policy if exists "Marketing staff view referral attempts" on public.ambassador_referral_attempts;
create policy "Marketing staff view referral attempts"
on public.ambassador_referral_attempts for select to authenticated
using (public.is_marketing_staff());
