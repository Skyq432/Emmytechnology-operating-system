create or replace function public.staff_has_capability(p_capability text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case (select u.role from public.users u where u.id = auth.uid())
    when 'super_admin' then p_capability = any (array['sales.read','sales.direct.manage','sales.order.manage','sales.payment.record','sales.quotation.manage','sales.return.manage','sales.credit.approve','sales.refund.manage','sales.document.void','sales.pricing.admin','sales.settings.manage','operations.read','operations.order.manage','operations.inventory.read','operations.inventory.manage','operations.transfer.manage','operations.repair.read','operations.repair.intake','operations.repair.technical','operations.repair.finance','operations.repair.handover','operations.supplier.manage','operations.website.manage'])
    when 'admin' then p_capability = any (array['sales.read','sales.direct.manage','sales.order.manage','sales.payment.record','sales.quotation.manage','sales.return.manage','sales.credit.approve','sales.refund.manage','sales.document.void','sales.pricing.admin','sales.settings.manage','operations.read','operations.order.manage','operations.inventory.read','operations.inventory.manage','operations.transfer.manage','operations.repair.read','operations.repair.intake','operations.repair.technical','operations.repair.finance','operations.repair.handover','operations.supplier.manage','operations.website.manage'])
    when 'growth_lead' then p_capability = any (array['sales.read','sales.direct.manage','sales.order.manage','sales.payment.record','sales.quotation.manage','sales.return.manage','operations.read','operations.order.manage','operations.inventory.read','operations.transfer.manage','operations.repair.read','operations.repair.intake','operations.repair.technical','operations.repair.finance','operations.repair.handover'])
    when 'front_desk' then p_capability = any (array['sales.read','sales.direct.manage','sales.order.manage','sales.payment.record','operations.read','operations.order.manage','operations.inventory.read','operations.transfer.manage','operations.repair.read','operations.repair.intake','operations.repair.finance','operations.repair.handover'])
    when 'operations_lead' then p_capability = any (array['sales.read','sales.direct.manage','sales.order.manage','sales.payment.record','operations.read','operations.order.manage','operations.inventory.read','operations.inventory.manage','operations.transfer.manage','operations.repair.read','operations.repair.intake','operations.repair.technical','operations.repair.finance','operations.repair.handover','operations.supplier.manage','operations.website.manage'])
    when 'technician' then p_capability = any (array['sales.read','sales.direct.manage','operations.read','operations.inventory.read','operations.repair.read','operations.repair.technical'])
    when 'sales_analyst' then p_capability = 'sales.read'
    else false end;
$$;
grant execute on function public.staff_has_capability(text) to authenticated;
create or replace function public.staff_has_any_capability(p_capabilities text[]) returns boolean language sql stable security definer set search_path to 'public' as $$ select exists (select 1 from unnest(coalesce(p_capabilities,array[]::text[])) c where public.staff_has_capability(c)); $$;
grant execute on function public.staff_has_any_capability(text[]) to authenticated;

do $$
declare r record; v_definition text; v_updated text; v_expression text;
begin
 for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.proname=any(array['ops_acknowledge_handover','ops_add_inventory_stock','ops_begin_repair_handover','ops_cancel_stock_transfer','ops_change_order_status','ops_change_repair_status','ops_complete_repair_collection','ops_confirm_order','ops_create_draft_order','ops_create_handover','ops_create_inventory_item','ops_create_order','ops_create_repair_with_card','ops_publish_repair_quote','ops_receive_stock_transfer','ops_record_order_payment','ops_record_repair_payment','ops_regenerate_repair_pin','ops_start_stock_transfer','sales_complete_direct_sale_handover','sales_confirm_direct_sale','sales_convert_accepted_quotation','sales_create_direct_sale_draft','sales_create_order_draft','sales_create_quotation','sales_create_quotation_public_link','sales_create_return','sales_ensure_final_repair_receipt_metadata','sales_ensure_final_sales_receipt_metadata','sales_ensure_payment_receipt_metadata','sales_ensure_quotation_document_metadata','sales_prepare_document_deliveries','sales_publish_quotation_version','sales_queue_quotation_send','sales_record_offline_quote_decision']) loop
  v_expression:=case
   when r.proname in ('ops_create_draft_order','ops_confirm_order','ops_change_order_status','ops_create_handover','ops_acknowledge_handover','ops_create_order') then 'public.staff_has_capability(''operations.order.manage'')'
   when r.proname in ('ops_create_inventory_item','ops_add_inventory_stock') then 'public.staff_has_capability(''operations.inventory.manage'')'
   when r.proname in ('ops_start_stock_transfer','ops_receive_stock_transfer','ops_cancel_stock_transfer') then 'public.staff_has_capability(''operations.transfer.manage'')'
   when r.proname='ops_create_repair_with_card' then 'public.staff_has_capability(''operations.repair.intake'')'
   when r.proname in ('ops_change_repair_status','ops_regenerate_repair_pin') then 'public.staff_has_capability(''operations.repair.technical'')'
   when r.proname in ('ops_publish_repair_quote','ops_record_repair_payment') then 'public.staff_has_capability(''operations.repair.finance'')'
   when r.proname in ('ops_begin_repair_handover','ops_complete_repair_collection') then 'public.staff_has_capability(''operations.repair.handover'')'
   when r.proname='ops_record_order_payment' then 'public.staff_has_capability(''sales.payment.record'')'
   when r.proname in ('sales_create_direct_sale_draft','sales_confirm_direct_sale','sales_complete_direct_sale_handover') then 'public.staff_has_capability(''sales.direct.manage'')'
   when r.proname='sales_create_order_draft' then 'public.staff_has_capability(''sales.order.manage'')'
   when r.proname in ('sales_create_quotation','sales_publish_quotation_version','sales_convert_accepted_quotation','sales_record_offline_quote_decision','sales_create_quotation_public_link','sales_queue_quotation_send','sales_ensure_quotation_document_metadata') then 'public.staff_has_capability(''sales.quotation.manage'')'
   when r.proname='sales_create_return' then 'public.staff_has_capability(''sales.return.manage'')'
   when r.proname='sales_ensure_payment_receipt_metadata' then 'public.staff_has_capability(''sales.payment.record'')'
   when r.proname='sales_ensure_final_sales_receipt_metadata' then 'public.staff_has_any_capability(array[''sales.direct.manage'',''sales.order.manage''])'
   when r.proname='sales_ensure_final_repair_receipt_metadata' then 'public.staff_has_any_capability(array[''operations.repair.finance'',''operations.repair.handover''])'
   when r.proname='sales_prepare_document_deliveries' then 'public.staff_has_any_capability(array[''sales.payment.record'',''sales.quotation.manage'',''operations.repair.finance''])' else null end;
  if v_expression is null then raise exception 'No capability mapping for %',r.proname; end if;
  v_definition:=pg_get_functiondef(r.oid);
  v_updated:=regexp_replace(v_definition,'if\s+not\s+public\.ops_is_admin\(\)\s+then\s+raise\s+exception\s+''Not authorized'';\s*end\s+if;','if not '||v_expression||' then raise exception ''Not authorized''; end if;','i');
  if v_updated=v_definition then raise exception 'Expected admin guard was not found in %',r.proname; end if;
  execute v_updated;
 end loop;
end $$;

do $$ declare r record; v_definition text; v_updated text; begin
 select p.oid into r from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ops_create_stock_movement' and p.prokind='f' limit 1;
 if r.oid is not null then v_definition:=pg_get_functiondef(r.oid); v_updated:=regexp_replace(v_definition,'if\s+not\s+public\.ops_is_admin\(\)\s+then\s+raise\s+exception\s+''Not authorized'';\s*end\s+if;','','i'); if v_updated=v_definition then raise exception 'Expected stock movement admin guard was not found'; end if; execute v_updated; end if;
end $$;
revoke execute on function public.ops_create_stock_movement(uuid,uuid,text,integer,text,uuid,text) from public, anon, authenticated;

create policy "staff read operations orders" on public.ops_orders for select to authenticated using (public.staff_has_any_capability(array['operations.read','sales.read']));
create policy "staff read operations order items" on public.ops_order_items for select to authenticated using (public.staff_has_any_capability(array['operations.read','sales.read']));
create policy "staff read operations order events" on public.ops_order_events for select to authenticated using (public.staff_has_any_capability(array['operations.read','sales.read']));
create policy "staff read operations handoffs" on public.ops_order_handoffs for select to authenticated using (public.staff_has_capability('operations.read'));
create policy "staff read operations payments" on public.ops_order_payments for select to authenticated using (public.staff_has_any_capability(array['operations.read','sales.read']));
create policy "staff read operations reservations" on public.ops_inventory_reservations for select to authenticated using (public.staff_has_any_capability(array['operations.read','sales.read']));
create policy "staff read operations business events" on public.ops_business_events for select to authenticated using (public.staff_has_capability('operations.read'));
create policy "staff read inventory items" on public.ops_inventory_items for select to authenticated using (public.staff_has_any_capability(array['operations.inventory.read','sales.read']));
create policy "staff read inventory units" on public.ops_inventory_units for select to authenticated using (public.staff_has_any_capability(array['operations.inventory.read','sales.read']));
create policy "staff read locations" on public.ops_locations for select to authenticated using (public.staff_has_any_capability(array['operations.inventory.read','sales.read']));
create policy "staff read stock movements" on public.ops_stock_movements for select to authenticated using (public.staff_has_capability('operations.inventory.read'));
create policy "staff read transfers" on public.ops_stock_transfers for select to authenticated using (public.staff_has_capability('operations.read'));
create policy "staff read website links" on public.ops_website_product_links for select to authenticated using (public.staff_has_capability('operations.read'));
create policy "operations leads read suppliers" on public.ops_suppliers for select to authenticated using (public.staff_has_capability('operations.supplier.manage'));
create policy "staff read repairs" on public.ops_repairs for select to authenticated using (public.staff_has_any_capability(array['operations.repair.read','sales.read']));
create policy "staff read repair cards" on public.ops_repair_cards for select to authenticated using (public.staff_has_capability('operations.repair.read'));
create policy "staff read repair assignments" on public.ops_repair_card_assignments for select to authenticated using (public.staff_has_capability('operations.repair.read'));
create policy "staff read repair quotes" on public.ops_repair_quotes for select to authenticated using (public.staff_has_any_capability(array['operations.repair.read','sales.read']));
create policy "staff read repair payments" on public.ops_repair_payments for select to authenticated using (public.staff_has_any_capability(array['operations.repair.read','sales.read']));
create policy "staff read repair consents" on public.ops_repair_consents for select to authenticated using (public.staff_has_capability('operations.repair.read'));
create policy "staff read repair events" on public.ops_repair_events for select to authenticated using (public.staff_has_capability('operations.repair.read'));
create policy "technical staff update repair work" on public.ops_repairs for update to authenticated using (public.staff_has_capability('operations.repair.technical')) with check (public.staff_has_capability('operations.repair.technical'));
create policy "operations leads manage suppliers" on public.ops_suppliers for all to authenticated using (public.staff_has_capability('operations.supplier.manage')) with check (public.staff_has_capability('operations.supplier.manage'));
create policy "operations leads manage inventory units" on public.ops_inventory_units for all to authenticated using (public.staff_has_capability('operations.inventory.manage')) with check (public.staff_has_capability('operations.inventory.manage'));
create policy "operations leads manage website links" on public.ops_website_product_links for all to authenticated using (public.staff_has_capability('operations.website.manage')) with check (public.staff_has_capability('operations.website.manage'));
create policy "staff read sales quotations" on public.sales_quotations for select to authenticated using (public.staff_has_capability('sales.read'));
create policy "staff read sales quotation versions" on public.sales_quotation_versions for select to authenticated using (public.staff_has_capability('sales.read'));
create policy "staff read sales quotation items" on public.sales_quotation_items for select to authenticated using (public.staff_has_capability('sales.read'));
create policy "staff read sales quotation acceptances" on public.sales_quotation_acceptances for select to authenticated using (public.staff_has_capability('sales.read'));
create policy "staff read sales quotation deliveries" on public.sales_quotation_deliveries for select to authenticated using (public.staff_has_capability('sales.read'));
create policy "staff read sales quotation links" on public.sales_quotation_public_links for select to authenticated using (public.staff_has_capability('sales.read'));
create policy "staff read sales documents" on public.sales_documents for select to authenticated using (public.staff_has_capability('sales.read'));
create policy "staff read sales document deliveries" on public.sales_document_deliveries for select to authenticated using (public.staff_has_capability('sales.read'));
create policy "staff read sales events" on public.sales_events for select to authenticated using (public.staff_has_capability('sales.read'));
create policy "staff read sales returns" on public.sales_returns for select to authenticated using (public.staff_has_capability('sales.read'));
create policy "staff read sales return items" on public.sales_return_items for select to authenticated using (public.staff_has_capability('sales.read'));
create policy "staff read sales refunds" on public.sales_refunds for select to authenticated using (public.staff_has_capability('sales.read'));
create policy "staff read sales credit" on public.sales_credit_releases for select to authenticated using (public.staff_has_capability('sales.read'));
create policy "staff read sales discount approvals" on public.sales_discount_approvals for select to authenticated using (public.staff_has_capability('sales.read'));
create policy "staff read sales settings" on public.sales_settings for select to authenticated using (public.staff_has_capability('sales.read'));
create policy "staff read sales margin policies" on public.sales_margin_policies for select to authenticated using (public.staff_has_capability('sales.read'));
create policy "staff read own sales authority" on public.sales_authority_profiles for select to authenticated using (user_id=auth.uid() and public.staff_has_capability('sales.read'));
