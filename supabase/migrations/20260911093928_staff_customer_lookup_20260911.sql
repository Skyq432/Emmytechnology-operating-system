create policy "sales staff read leads for customer lookup" on public.leads for select to authenticated using (public.staff_has_capability('sales.read'));
create policy "sales staff read crm ownership" on public.crm_lead_ownership for select to authenticated using (public.staff_has_capability('sales.read'));
create policy "payment staff read cash off balances" on public.cash_off_accounts for select to authenticated using (public.staff_has_capability('sales.payment.record'));
