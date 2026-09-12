-- Secure public quotation view and digital decision flow.

create table if not exists public.sales_quotation_public_links (
  id uuid primary key default gen_random_uuid(),
  quotation_version_id uuid not null references public.sales_quotation_versions(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists sales_quotation_public_links_active_version_idx
  on public.sales_quotation_public_links(quotation_version_id)
  where revoked_at is null;

alter table public.sales_quotation_public_links enable row level security;
create policy sales_quotation_public_links_admin_all on public.sales_quotation_public_links
for all to authenticated using (public.ops_is_admin()) with check (public.ops_is_admin());
revoke all on public.sales_quotation_public_links from anon;
grant select,insert,update,delete on public.sales_quotation_public_links to authenticated;

create or replace function public.sales_create_quotation_public_link(
  p_quotation_version_id uuid,
  p_expires_at timestamptz default null
)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_quote public.sales_quotations;
  v_version public.sales_quotation_versions;
  v_token text;
  v_expiry timestamptz;
begin
  if not public.ops_is_admin() then raise exception 'Not authorized'; end if;
  select * into v_version from public.sales_quotation_versions where id=p_quotation_version_id;
  if not found or v_version.status<>'published' then raise exception 'Published quotation version is required'; end if;
  select * into v_quote from public.sales_quotations where id=v_version.quotation_id;
  if not found or v_quote.status<>'published' or v_quote.current_version_id is distinct from v_version.id then
    raise exception 'Only the current published quotation version can receive a public link';
  end if;

  update public.sales_quotation_public_links set revoked_at=now()
  where quotation_version_id=v_version.id and revoked_at is null;

  v_token:=encode(gen_random_bytes(32),'hex');
  v_expiry:=coalesce(p_expires_at,v_version.validity_expires_at,now()+interval '7 days');
  if v_expiry<=now() then raise exception 'Public link expiry must be in the future'; end if;

  insert into public.sales_quotation_public_links(quotation_version_id,token_hash,expires_at,created_by)
  values(v_version.id,digest(v_token,'sha256'),v_expiry,auth.uid());
  return v_token;
end;
$$;

create or replace function public.sales_public_quotation_view(p_token text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_link public.sales_quotation_public_links;
  v_version public.sales_quotation_versions;
  v_quote public.sales_quotations;
  v_items jsonb;
begin
  if nullif(trim(p_token),'') is null then raise exception 'Invalid quotation link'; end if;
  select * into v_link from public.sales_quotation_public_links
  where token_hash=digest(trim(p_token),'sha256') and revoked_at is null and expires_at>now()
  limit 1;
  if not found then raise exception 'Quotation link is invalid or expired'; end if;
  select * into v_version from public.sales_quotation_versions where id=v_link.quotation_version_id;
  select * into v_quote from public.sales_quotations where id=v_version.quotation_id;
  if v_quote.current_version_id is distinct from v_version.id or v_quote.status not in ('published','accepted','declined') then
    raise exception 'Quotation version is no longer current';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'item_name',item_name,'item_type',item_type,'quantity',quantity,
    'list_price',list_price,'final_unit_price',final_unit_price,'line_discount_amount',line_discount_amount,
    'line_total',final_unit_price*quantity,'note',note
  ) order by created_at,id),'[]'::jsonb) into v_items
  from public.sales_quotation_items where quotation_version_id=v_version.id;

  return jsonb_build_object(
    'quotation_code',v_quote.quotation_code,'version',v_version.version,
    'customer_name',v_quote.customer_name,'items',v_items,'subtotal',v_version.subtotal,
    'discount_amount',v_version.discount_amount,'total_amount',v_version.total_amount,
    'validity_expires_at',v_version.validity_expires_at,'customer_note',v_version.customer_note,
    'terms',v_version.terms,'status',v_version.status,'decided',
    exists(select 1 from public.sales_quotation_acceptances where quotation_version_id=v_version.id)
  );
end;
$$;

create or replace function public.sales_public_quote_decide(
  p_token text,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_link public.sales_quotation_public_links;
  v_version public.sales_quotation_versions;
  v_quote public.sales_quotations;
begin
  if p_decision not in ('accepted','declined') then raise exception 'Invalid quotation decision'; end if;
  select * into v_link from public.sales_quotation_public_links
  where token_hash=digest(trim(p_token),'sha256') and revoked_at is null and expires_at>now()
  limit 1 for update;
  if not found then raise exception 'Quotation link is invalid or expired'; end if;
  select * into v_version from public.sales_quotation_versions where id=v_link.quotation_version_id for update;
  select * into v_quote from public.sales_quotations where id=v_version.quotation_id for update;
  if v_quote.current_version_id is distinct from v_version.id or v_quote.status<>'published' or v_version.status<>'published' then
    raise exception 'Quotation is no longer awaiting a decision';
  end if;
  if exists(select 1 from public.sales_quotation_acceptances where quotation_version_id=v_version.id) then
    raise exception 'Quotation has already been decided';
  end if;

  insert into public.sales_quotation_acceptances(
    quotation_version_id,identity_id,decision,acceptance_type,channel,actor_user_id,snapshot
  ) values (
    v_version.id,v_quote.identity_id,p_decision,'digital','secure_link',null,
    jsonb_build_object('quotation_code',v_quote.quotation_code,'version',v_version.version,'total_amount',v_version.total_amount)
  );
  update public.sales_quotation_versions set status=p_decision where id=v_version.id;
  update public.sales_quotations set status=p_decision where id=v_quote.id;
  update public.sales_quotation_public_links set revoked_at=now() where id=v_link.id;

  insert into public.sales_events(identity_id,quotation_id,quotation_version_id,event_type,title,metadata)
  values(v_quote.identity_id,v_quote.id,v_version.id,
    case when p_decision='accepted' then 'quote.accepted.digital' else 'quote.declined' end,
    case when p_decision='accepted' then 'Quotation accepted digitally' else 'Quotation declined digitally' end,
    jsonb_build_object('acceptance_type','digital','channel','secure_link'));

  return jsonb_build_object('quotation_code',v_quote.quotation_code,'version',v_version.version,'decision',p_decision);
end;
$$;

grant execute on function public.sales_create_quotation_public_link(uuid,timestamptz) to authenticated;
grant execute on function public.sales_public_quotation_view(text) to anon,authenticated;
grant execute on function public.sales_public_quote_decide(text,text) to anon,authenticated;
