-- Atomic Direct Sale draft + Cash-Off request wrapper.

create or replace function public.sales_create_direct_sale_draft_with_cash_off(
  p_identity_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_items jsonb,
  p_sales_staff_name text default null,
  p_cash_off_amount numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
begin
  if not public.staff_has_capability('sales.direct.manage') then
    raise exception 'Not authorized';
  end if;

  v_order_id := public.sales_create_direct_sale_draft(
    p_identity_id,
    p_customer_name,
    p_customer_phone,
    p_customer_email,
    p_items,
    p_sales_staff_name
  );

  perform public.commercial_set_draft_cash_off(
    v_order_id,
    greatest(coalesce(p_cash_off_amount, 0), 0)
  );

  return v_order_id;
end;
$$;

revoke all on function public.sales_create_direct_sale_draft_with_cash_off(uuid,text,text,text,jsonb,text,numeric) from public, anon;
grant execute on function public.sales_create_direct_sale_draft_with_cash_off(uuid,text,text,text,jsonb,text,numeric) to authenticated;
