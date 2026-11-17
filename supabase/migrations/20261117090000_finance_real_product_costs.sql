-- ═══════════════════════════════════════════════════════════════════
-- EmmyTech OS · Finance · Real product cost                    [MERGE]
-- ═══════════════════════════════════════════════════════════════════
-- What EmmyTech really paid for each product, kept private:
--   • see it:    Supreme Administrator, Growth Lead, Sales Analyst
--   • change it: Supreme Administrator only
-- The "cost basis" staff type in Sales and the inventory "Default cost" are
-- negotiation base prices, NOT real cost, so the profit and loss no longer
-- uses them.
--
-- How a sold item gets its real cost (worked out when read; nothing is
-- copied into Sales or Operations tables):
--   1. an exact cost set for that one sale, else
--   2. the product's cost-list price that applied on the sale date
--      (the latest price dated on or before the sale; a sale older than the
--      first price uses the first price), else
--   3. missing: shown as a required task, and that month's profit is "not final".
-- A sold item finds its product by its inventory item, else by its name with
-- capitals and extra spaces ignored, or by a spelling joined to a product.
--
-- Supplier bills now carry item lines (product, quantity, unit cost). Each
-- line becomes a cost-list price from the bill date, so the list keeps itself
-- up to date from what EmmyTech actually pays.
--
-- New tables only, plus new versions of finance_* functions. No existing
-- Sales/Operations table or data is changed.
-- ═══════════════════════════════════════════════════════════════════

-- ── Access ──────────────────────────────────────────────────────────
create or replace function public.finance_can_see_cost()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.finance_viewer_role() in ('super_admin','growth_lead','sales_analyst'), false);
$$;

-- "Dell  latitude 3190 " and "Dell Latitude 3190" are the same product.
create or replace function public.finance_cost_key(p_name text)
returns text language sql immutable as $$
  select nullif(regexp_replace(lower(btrim(coalesce(p_name, ''))), '\s+', ' ', 'g'), '');
$$;

-- ── Tables ──────────────────────────────────────────────────────────
create table public.finance_cost_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  inventory_item_id uuid unique references public.ops_inventory_items(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Every spelling that belongs to a product (stored without capitals/extra spaces).
create table public.finance_cost_names (
  name_key text primary key,
  product_id uuid not null references public.finance_cost_products(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now()
);
create index finance_cost_names_product_idx on public.finance_cost_names (product_id);

create table public.finance_supplier_bill_lines (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.finance_supplier_bills(id) on delete cascade,
  line_no integer not null,
  product_id uuid not null references public.finance_cost_products(id),
  quantity numeric(12,2) not null check (quantity > 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0)
);
create index finance_supplier_bill_lines_bill_idx on public.finance_supplier_bill_lines (bill_id);

-- The cost list, with history: one row per price, valid from a date.
create table public.finance_cost_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.finance_cost_products(id) on delete cascade,
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  effective_from date not null,
  source text not null check (source in ('manual','inventory','supplier_bill')),
  bill_line_id uuid references public.finance_supplier_bill_lines(id) on delete cascade,
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index finance_cost_prices_product_idx on public.finance_cost_prices (product_id, effective_from desc, created_at desc);

-- An exact cost for one sold item (overrides the list for that sale only).
create table public.finance_sale_costs (
  order_item_id uuid primary key references public.ops_order_items(id) on delete cascade,
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  note text,
  set_by uuid references public.users(id) on delete set null,
  set_at timestamptz not null default now()
);

alter table public.finance_cost_products enable row level security;
alter table public.finance_cost_names enable row level security;
alter table public.finance_supplier_bill_lines enable row level security;
alter table public.finance_cost_prices enable row level security;
alter table public.finance_sale_costs enable row level security;
revoke all on table public.finance_cost_products from public, anon, authenticated;
revoke all on table public.finance_cost_names from public, anon, authenticated;
revoke all on table public.finance_supplier_bill_lines from public, anon, authenticated;
revoke all on table public.finance_cost_prices from public, anon, authenticated;
revoke all on table public.finance_sale_costs from public, anon, authenticated;

-- ── Internal: find or create the product for a name / inventory item ─
create or replace function public.finance_cost_product_for(p_name text, p_inventory_item_id uuid default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_key text := public.finance_cost_key(p_name);
  v_label text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_id uuid;
  v_linked uuid;
begin
  if p_inventory_item_id is not null then
    select p.id into v_id from public.finance_cost_products p where p.inventory_item_id = p_inventory_item_id;
    if v_id is not null then return v_id; end if;
  end if;
  if v_key is null then raise exception 'Enter the product name'; end if;
  if length(v_label) > 160 then raise exception 'The product name is too long'; end if;
  select n.product_id, p.inventory_item_id into v_id, v_linked
  from public.finance_cost_names n join public.finance_cost_products p on p.id = n.product_id where n.name_key = v_key;
  if v_id is not null and (p_inventory_item_id is null or v_linked is null or v_linked = p_inventory_item_id) then
    if p_inventory_item_id is not null and v_linked is null then
      update public.finance_cost_products set inventory_item_id = p_inventory_item_id where id = v_id;
    end if;
    return v_id;
  end if;
  insert into public.finance_cost_products (name, inventory_item_id, created_by) values (v_label, p_inventory_item_id, auth.uid())
  returning id into v_id;
  -- The spelling may already belong to a product tied to another inventory item.
  insert into public.finance_cost_names (name_key, product_id, label) values (v_key, v_id, v_label) on conflict (name_key) do nothing;
  return v_id;
end;
$$;

-- ── Internal: the list price that applied on a day ──────────────────
create or replace function public.finance_list_cost(p_product_id uuid, p_day date)
returns table (unit_cost numeric, effective_from date, source text)
language sql stable security definer set search_path = public as $$
  with prices as (
    select pr.unit_cost, pr.effective_from, pr.source, pr.created_at
    from public.finance_cost_prices pr
    left join public.finance_supplier_bill_lines bl on bl.id = pr.bill_line_id
    left join public.finance_supplier_bills b on b.id = bl.bill_id
    where pr.product_id = p_product_id and (pr.bill_line_id is null or not coalesce(b.is_void, false))
  ), picked as (
    (select p.unit_cost, p.effective_from, p.source, 1 as pick from prices p where p.effective_from <= p_day
     order by p.effective_from desc, p.created_at desc limit 1)
    union all
    (select p.unit_cost, p.effective_from, p.source, 2 from prices p order by p.effective_from, p.created_at limit 1)
  )
  select x.unit_cost, x.effective_from, x.source from picked x order by x.pick limit 1;
$$;

-- ── Internal: every sold item with its real cost ────────────────────
-- p_from / p_to are Lagos days; null means no limit.
create or replace function public.finance_sold_lines(p_from date, p_to date)
returns table (
  order_item_id uuid, order_id uuid, order_code text, sold_on date, branch_id uuid, item_name text, name_key text,
  quantity numeric, line_total numeric, product_id uuid, exact_cost numeric, list_cost numeric, unit_cost numeric, cost_source text
)
language sql stable security definer set search_path = public as $$
  with lines as (
    select i.id, o.id as order_id, o.order_code, public.finance_lagos_date(o.confirmed_at) as sold_on, o.branch_location_id,
           i.item_name, public.finance_cost_key(i.item_name) as k, i.quantity::numeric as qty, i.line_total::numeric as line_total,
           i.inventory_item_id
    from public.ops_order_items i join public.ops_orders o on o.id = i.order_id
    where o.commercial_state = 'confirmed' and o.deletion_status <> 'deleted' and o.confirmed_at is not null
      and (p_from is null or o.confirmed_at >= public.finance_lagos_day_start(p_from))
      and (p_to is null or o.confirmed_at < public.finance_lagos_day_start(p_to + 1))
  ), matched as (
    select l.*,
           coalesce((select p.id from public.finance_cost_products p where l.inventory_item_id is not null and p.inventory_item_id = l.inventory_item_id),
                    (select n.product_id from public.finance_cost_names n where n.name_key = l.k)) as pid
    from lines l
  )
  select m.id, m.order_id, m.order_code, m.sold_on, m.branch_location_id, m.item_name, m.k, m.qty, m.line_total, m.pid,
         sc.unit_cost, lc.unit_cost, coalesce(sc.unit_cost, lc.unit_cost),
         case when sc.unit_cost is not null then 'exact' when lc.unit_cost is not null then 'list' end
  from matched m
  left join public.finance_sale_costs sc on sc.order_item_id = m.id
  left join lateral public.finance_list_cost(m.pid, m.sold_on) lc on true;
$$;

-- ── Counts for the Overview task and Reports (no cost figures) ──────
create or replace function public.finance_cost_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_from date := public.finance_start_date();
  v jsonb;
begin
  if not public.finance_can_view() then raise exception 'Not authorized' using errcode = '42501'; end if;
  select jsonb_build_object(
    'from', v_from,
    'total', count(*),
    'missing', count(*) filter (where s.unit_cost is null),
    'missing_value', coalesce(sum(s.line_total) filter (where s.unit_cost is null), 0),
    'missing_products', count(distinct coalesce(s.product_id::text, s.name_key)) filter (where s.unit_cost is null),
    'can_see_cost', public.finance_can_see_cost(),
    'can_edit', public.finance_is_owner())
  into v from public.finance_sold_lines(v_from, null) s;
  return v;
end;
$$;

-- ── The Product costs page ──────────────────────────────────────────
create or replace function public.finance_product_costs(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public.finance_today();
  v_start date := public.finance_start_date();
  v jsonb;
begin
  if not public.finance_can_see_cost() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Invalid period'; end if;
  with everything as (
    select * from public.finance_sold_lines(null, null)
  ), period as (
    select e.* from everything e where e.sold_on between p_from and p_to
  ), waiting as (
    select coalesce(e.product_id::text, 'name:' || e.name_key) as gkey,
           e.product_id,
           (select p.name from public.finance_cost_products p where p.id = e.product_id) as product_name,
           mode() within group (order by e.item_name) as common_name,
           array_agg(distinct e.item_name) as spellings,
           count(*) as lines,
           count(*) filter (where e.sold_on >= v_start) as lines_since_start,
           sum(e.quantity) as qty,
           sum(e.line_total) as sold_value,
           max(e.sold_on) as last_sold
    from everything e where e.unit_cost is null
    group by 1, 2
  ), products as (
    select p.id, p.name, p.inventory_item_id, i.name as inventory_name,
           (select jsonb_agg(n.label order by n.label) from public.finance_cost_names n where n.product_id = p.id) as spellings,
           lc.unit_cost, lc.effective_from, lc.source,
           (select count(*) from public.finance_cost_prices pr where pr.product_id = p.id) as price_count,
           (select coalesce(sum(e.quantity), 0) from everything e where e.product_id = p.id) as sold_qty
    from public.finance_cost_products p
    left join public.ops_inventory_items i on i.id = p.inventory_item_id
    left join lateral public.finance_list_cost(p.id, v_today) lc on true
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'today', v_today, 'start_date', v_start,
    'can_edit', public.finance_is_owner(),
    'summary', (select jsonb_build_object(
        'lines', count(*), 'costed', count(*) filter (where pe.unit_cost is not null), 'missing', count(*) filter (where pe.unit_cost is null),
        'sold_value', coalesce(sum(pe.line_total), 0),
        'costed_value', coalesce(sum(pe.line_total) filter (where pe.unit_cost is not null), 0),
        'cost', coalesce(sum(pe.unit_cost * pe.quantity), 0),
        'missing_value', coalesce(sum(pe.line_total) filter (where pe.unit_cost is null), 0)) from period pe),
    'waiting', coalesce((select jsonb_agg(jsonb_build_object(
        'key', w.gkey, 'product_id', w.product_id, 'name', coalesce(w.product_name, w.common_name),
        'spellings', to_jsonb(w.spellings), 'lines', w.lines, 'lines_since_start', w.lines_since_start, 'quantity', w.qty,
        'avg_price', case when w.qty > 0 then round(w.sold_value / w.qty, 2) else 0 end, 'last_sold', w.last_sold)
        order by w.lines_since_start desc, w.lines desc, coalesce(w.product_name, w.common_name)) from waiting w), '[]'::jsonb),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
        'order_item_id', pe.order_item_id, 'order_code', pe.order_code, 'sold_on', pe.sold_on, 'branch_name', l.name,
        'item_name', pe.item_name, 'product_name', (select p.name from public.finance_cost_products p where p.id = pe.product_id),
        'quantity', pe.quantity, 'line_total', pe.line_total,
        'unit_price', case when pe.quantity > 0 then round(pe.line_total / pe.quantity, 2) else 0 end,
        'unit_cost', pe.unit_cost, 'list_cost', pe.list_cost, 'source', pe.cost_source,
        'profit', case when pe.unit_cost is not null then pe.line_total - pe.unit_cost * pe.quantity end)
        order by (pe.unit_cost is null) desc, pe.sold_on desc, pe.order_code)
        from (select * from period order by (unit_cost is null) desc, sold_on desc limit 1000) pe
        left join public.ops_locations l on l.id = pe.branch_id), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(jsonb_build_object(
        'id', pr.id, 'name', pr.name, 'inventory_item_id', pr.inventory_item_id, 'inventory_name', pr.inventory_name,
        'spellings', coalesce(pr.spellings, '[]'::jsonb), 'unit_cost', pr.unit_cost, 'effective_from', pr.effective_from,
        'source', pr.source, 'price_count', pr.price_count, 'sold_qty', pr.sold_qty)
        order by (pr.unit_cost is null) desc, pr.name) from products pr), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object(
        'product_id', pr.product_id, 'unit_cost', pr.unit_cost, 'effective_from', pr.effective_from, 'source', pr.source,
        'note', pr.note, 'by', u.name, 'at', pr.created_at,
        'bill_ref', b.bill_ref, 'supplier_name', s.name, 'void', coalesce(b.is_void, false))
        order by pr.effective_from desc, pr.created_at desc)
        from public.finance_cost_prices pr
        left join public.users u on u.id = pr.created_by
        left join public.finance_supplier_bill_lines bl on bl.id = pr.bill_line_id
        left join public.finance_supplier_bills b on b.id = bl.bill_id
        left join public.ops_suppliers s on s.id = b.supplier_id), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

-- ── Changes (Supreme Administrator only) ────────────────────────────
-- Set a product's cost. p_product_id, or p_name for a product not yet on the
-- list (it is added). The first price also covers older sales.
create or replace function public.finance_set_product_cost(
  p_product_id uuid, p_name text, p_unit_cost numeric, p_from date default null, p_note text default null
)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid := p_product_id;
  v_from date := coalesce(p_from, public.finance_today());
begin
  if not public.finance_is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_unit_cost is null or p_unit_cost < 0 then raise exception 'Enter the real cost'; end if;
  if v_from > public.finance_today() then raise exception 'The date is in the future'; end if;
  if v_id is not null then
    if not exists (select 1 from public.finance_cost_products p where p.id = v_id) then raise exception 'Product not found'; end if;
  else
    v_id := public.finance_cost_product_for(p_name, null);
  end if;
  insert into public.finance_cost_prices (product_id, unit_cost, effective_from, source, note, created_by)
  values (v_id, round(p_unit_cost, 2), v_from, 'manual', nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
  return jsonb_build_object('product_id', v_id);
end;
$$;

-- Exact cost for one sold item; p_unit_cost null removes it (back to the list).
create or replace function public.finance_set_sale_cost(p_order_item_id uuid, p_unit_cost numeric, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.finance_is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.ops_order_items i where i.id = p_order_item_id) then raise exception 'Sale not found'; end if;
  if p_unit_cost is null then
    delete from public.finance_sale_costs where order_item_id = p_order_item_id;
    return jsonb_build_object('removed', true);
  end if;
  if p_unit_cost < 0 then raise exception 'Enter the real cost'; end if;
  insert into public.finance_sale_costs (order_item_id, unit_cost, note, set_by)
  values (p_order_item_id, round(p_unit_cost, 2), nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (order_item_id) do update set unit_cost = excluded.unit_cost, note = excluded.note, set_by = excluded.set_by, set_at = now();
  return jsonb_build_object('removed', false);
end;
$$;

-- Say a spelling, or a whole product, is the same product as p_into.
create or replace function public.finance_join_cost_product(p_into uuid, p_from_product uuid default null, p_name text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_key text := public.finance_cost_key(p_name);
  v_from uuid := p_from_product;
  v_into_inv uuid;
  v_from_inv uuid;
begin
  if not public.finance_is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  select p.inventory_item_id into v_into_inv from public.finance_cost_products p where p.id = p_into;
  if not found then raise exception 'Choose the product to join it to'; end if;
  if v_from is null then
    if v_key is null then raise exception 'Choose what to join'; end if;
    select n.product_id into v_from from public.finance_cost_names n where n.name_key = v_key;
    if v_from is null then
      insert into public.finance_cost_names (name_key, product_id, label)
      values (v_key, p_into, btrim(regexp_replace(p_name, '\s+', ' ', 'g')));
      return jsonb_build_object('product_id', p_into);
    end if;
  end if;
  if v_from = p_into then raise exception 'That is already the same product'; end if;
  select p.inventory_item_id into v_from_inv from public.finance_cost_products p where p.id = v_from;
  if not found then raise exception 'Product not found'; end if;
  if v_from_inv is not null and v_into_inv is not null and v_from_inv <> v_into_inv then
    raise exception 'Both are separate inventory products, so they cannot be joined';
  end if;
  update public.finance_cost_names set product_id = p_into where product_id = v_from;
  update public.finance_cost_prices set product_id = p_into where product_id = v_from;
  update public.finance_supplier_bill_lines set product_id = p_into where product_id = v_from;
  delete from public.finance_cost_products where id = v_from;
  if v_into_inv is null and v_from_inv is not null then
    update public.finance_cost_products set inventory_item_id = v_from_inv where id = p_into;
  end if;
  return jsonb_build_object('product_id', p_into);
end;
$$;

-- ── Inventory product page: the Real cost box ───────────────────────
create or replace function public.finance_inventory_real_cost(p_inventory_item_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_item public.ops_inventory_items;
  v_pid uuid;
  v jsonb;
begin
  if not public.finance_can_see_cost() then raise exception 'Not authorized' using errcode = '42501'; end if;
  select * into v_item from public.ops_inventory_items i where i.id = p_inventory_item_id;
  if v_item.id is null then raise exception 'Inventory product not found'; end if;
  select coalesce((select p.id from public.finance_cost_products p where p.inventory_item_id = v_item.id),
                  (select n.product_id from public.finance_cost_names n where n.name_key = public.finance_cost_key(v_item.name))) into v_pid;
  select jsonb_build_object(
    'product_id', v_pid,
    'product_name', (select p.name from public.finance_cost_products p where p.id = v_pid),
    'unit_cost', lc.unit_cost, 'effective_from', lc.effective_from, 'source', lc.source,
    'can_edit', public.finance_is_owner(), 'today', public.finance_today())
  into v from (select 1) one left join lateral public.finance_list_cost(v_pid, public.finance_today()) lc on true;
  return v;
end;
$$;

create or replace function public.finance_set_inventory_real_cost(p_inventory_item_id uuid, p_unit_cost numeric, p_from date default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_item public.ops_inventory_items;
  v_pid uuid;
  v_from date := coalesce(p_from, public.finance_today());
begin
  if not public.finance_is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_unit_cost is null or p_unit_cost < 0 then raise exception 'Enter the real cost'; end if;
  if v_from > public.finance_today() then raise exception 'The date is in the future'; end if;
  select * into v_item from public.ops_inventory_items i where i.id = p_inventory_item_id;
  if v_item.id is null then raise exception 'Inventory product not found'; end if;
  v_pid := public.finance_cost_product_for(v_item.name, v_item.id);
  insert into public.finance_cost_prices (product_id, unit_cost, effective_from, source, created_by)
  values (v_pid, round(p_unit_cost, 2), v_from, 'inventory', auth.uid());
  return jsonb_build_object('product_id', v_pid);
end;
$$;

-- ── Supplier bills: now with item lines, recorded by the Supreme Administrator
drop function if exists public.finance_add_supplier_bill(uuid, text, text, date, date, numeric, text);

-- p_lines: [{ "product_id": uuid | null, "name": text | null, "quantity": n, "unit_cost": n }, …]
create or replace function public.finance_add_supplier_bill(
  p_supplier_id uuid, p_new_supplier_name text, p_ref text, p_bill_date date, p_due_date date, p_lines jsonb, p_note text default null
)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_supplier uuid := p_supplier_id;
  v_id uuid;
  v_line jsonb;
  v_no integer := 0;
  v_pid uuid;
  v_qty numeric;
  v_cost numeric;
  v_line_id uuid;
  v_total numeric := 0;
begin
  if not public.finance_is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_new_supplier_name, '')), '') is not null then
    select s.id into v_supplier from public.ops_suppliers s where lower(s.name) = lower(btrim(p_new_supplier_name));
    if v_supplier is null then
      insert into public.ops_suppliers (name, created_by) values (btrim(p_new_supplier_name), auth.uid()) returning id into v_supplier;
    end if;
  end if;
  if v_supplier is null or not exists (select 1 from public.ops_suppliers s where s.id = v_supplier) then raise exception 'Choose the supplier'; end if;
  if nullif(btrim(p_ref), '') is null then raise exception 'Enter the invoice number'; end if;
  if p_bill_date is null or p_due_date is null then raise exception 'Enter the bill date and the pay-by date'; end if;
  if p_due_date < p_bill_date then raise exception 'The pay-by date is before the bill date'; end if;
  if p_bill_date > public.finance_today() then raise exception 'The bill date is in the future'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item: what was bought, how many and the cost of each';
  end if;
  if jsonb_array_length(p_lines) > 50 then raise exception 'Too many items on one bill (50 at most)'; end if;
  if exists (select 1 from public.finance_supplier_bills b where b.supplier_id = v_supplier and lower(b.bill_ref) = lower(btrim(p_ref)) and not b.is_void) then
    raise exception 'This supplier already has a bill with that invoice number';
  end if;

  -- Check every line before saving anything.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_no := v_no + 1;
    v_qty := nullif(v_line->>'quantity', '')::numeric;
    v_cost := nullif(v_line->>'unit_cost', '')::numeric;
    if nullif(v_line->>'product_id', '') is null and public.finance_cost_key(v_line->>'name') is null then
      raise exception 'Item %: choose the product or type its name', v_no;
    end if;
    if nullif(v_line->>'product_id', '') is not null
       and not exists (select 1 from public.finance_cost_products p where p.id = (v_line->>'product_id')::uuid) then
      raise exception 'Item %: product not found', v_no;
    end if;
    if v_qty is null or v_qty <= 0 then raise exception 'Item %: enter how many', v_no; end if;
    if v_cost is null or v_cost < 0 then raise exception 'Item %: enter the cost of each', v_no; end if;
    v_total := v_total + round(v_qty * v_cost, 2);
  end loop;
  if v_total <= 0 then raise exception 'The bill total is zero'; end if;

  insert into public.finance_supplier_bills (supplier_id, bill_ref, bill_date, due_date, amount, note, created_by)
  values (v_supplier, btrim(p_ref), p_bill_date, p_due_date, v_total, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;

  v_no := 0;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_no := v_no + 1;
    v_pid := coalesce(nullif(v_line->>'product_id', '')::uuid, public.finance_cost_product_for(v_line->>'name', null));
    insert into public.finance_supplier_bill_lines (bill_id, line_no, product_id, quantity, unit_cost)
    values (v_id, v_no, v_pid, (v_line->>'quantity')::numeric, round((v_line->>'unit_cost')::numeric, 2))
    returning id into v_line_id;
    insert into public.finance_cost_prices (product_id, unit_cost, effective_from, source, bill_line_id, created_by)
    values (v_pid, round((v_line->>'unit_cost')::numeric, 2), p_bill_date, 'supplier_bill', v_line_id, auth.uid());
  end loop;
  return jsonb_build_object('id', v_id, 'supplier_id', v_supplier, 'amount', v_total);
end;
$$;

-- Payables: same as before, plus each bill's item lines for people who may see
-- cost, who may add bills, and the cost list to pick products from.
create or replace function public.finance_payables(p_today date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := coalesce(p_today, public.finance_today());
  v_cost boolean := public.finance_can_see_cost();
  v jsonb;
begin
  if not public.finance_can_view() then raise exception 'Not authorized' using errcode = '42501'; end if;
  with bills as (
    select b.*, s.name as supplier_name,
           coalesce((select sum(p.amount) from public.finance_supplier_payments p where p.bill_id = b.id and not p.is_void), 0) as paid
    from public.finance_supplier_bills b join public.ops_suppliers s on s.id = b.supplier_id
    where not b.is_void
  ), scored as (
    select b.*, greatest(b.amount - b.paid, 0) as left_to_pay,
           case when b.amount - b.paid <= 0 then 'paid'
                when b.due_date < v_today then 'overdue'
                when b.paid > 0 then 'part_paid' else 'unpaid' end as status,
           case when b.amount - b.paid > 0 then greatest(v_today - b.due_date, 0) else 0 end as days_late
    from bills b
  )
  select jsonb_build_object(
    'today', v_today,
    'owed', (select coalesce(sum(left_to_pay), 0) from scored),
    'overdue', (select coalesce(sum(left_to_pay), 0) from scored where status = 'overdue'),
    'open_count', (select count(*) from scored where left_to_pay > 0),
    'bills', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'supplier_id', s.supplier_id, 'supplier_name', s.supplier_name, 'ref', s.bill_ref, 'bill_date', s.bill_date,
        'due_date', s.due_date, 'amount', s.amount, 'paid', s.paid, 'left', s.left_to_pay, 'status', s.status, 'days_late', s.days_late, 'note', s.note,
        'lines', case when v_cost then (select jsonb_agg(jsonb_build_object('product_name', p.name, 'quantity', bl.quantity, 'unit_cost', bl.unit_cost) order by bl.line_no)
                                        from public.finance_supplier_bill_lines bl join public.finance_cost_products p on p.id = bl.product_id where bl.bill_id = s.id) end)
        order by (s.left_to_pay > 0) desc, s.due_date) from scored s), '[]'::jsonb),
    'by_supplier', coalesce((select jsonb_agg(jsonb_build_object('supplier_name', g.supplier_name, 'owed', g.owed, 'open', g.open, 'overdue', g.overdue) order by g.owed desc)
        from (select supplier_name, sum(left_to_pay) as owed, count(*) filter (where left_to_pay > 0) as open, bool_or(status = 'overdue') as overdue
              from scored group by supplier_name having sum(left_to_pay) > 0) g), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'date', p.paid_date, 'amount', p.amount, 'supplier_name', s.name, 'ref', b.bill_ref,
        'account_name', (select a.name from public.finance_accounts a where a.id = p.account_id))
        order by p.paid_date desc, p.created_at desc)
        from public.finance_supplier_payments p join public.finance_supplier_bills b on b.id = p.bill_id
        join public.ops_suppliers s on s.id = b.supplier_id where not p.is_void), '[]'::jsonb),
    'suppliers', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
        from public.ops_suppliers s where s.is_active), '[]'::jsonb),
    'can_add_bill', public.finance_is_owner(),
    'cost_products', case when v_cost then coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
        from public.finance_cost_products p), '[]'::jsonb) else '[]'::jsonb end,
    -- Owed elsewhere and paid out from Marketing; shown so the full picture is here.
    'other', jsonb_build_object(
      'ambassador_payouts', jsonb_build_object('amount', (select coalesce(sum(x.amount), 0) from public.payouts x where x.status = 'pending'),
                                               'count', (select count(*) from public.payouts x where x.status = 'pending')),
      'commissions_earned', jsonb_build_object('amount', (select coalesce(sum(o.commission_amount), 0) from public.ops_orders o where o.commission_status = 'earned' and o.deletion_status <> 'deleted'),
                                               'count', (select count(*) from public.ops_orders o where o.commission_status = 'earned' and o.deletion_status <> 'deleted')),
      'spin_cashouts', jsonb_build_object('amount', (select coalesce(sum(x.amount), 0) from public.spin_cashout_requests x where x.status = 'pending'),
                                          'count', (select count(*) from public.spin_cashout_requests x where x.status = 'pending')))
  ) into v;
  return v || jsonb_build_object('other_total',
    (v #>> '{other,ambassador_payouts,amount}')::numeric + (v #>> '{other,commissions_earned,amount}')::numeric + (v #>> '{other,spin_cashouts,amount}')::numeric);
end;
$$;

-- ── Profit and loss: real cost only ─────────────────────────────────
-- Same as before except "Cost of goods": sold items now use the real cost
-- (exact or cost list) times quantity. Staff base prices are not used.
-- Items with no real cost are counted in cost_missing, and the app marks the
-- month "not final" while any are left.
create or replace function public.finance_profit_and_loss(p_month date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_from date := date_trunc('month', coalesce(p_month, public.finance_today()))::date;
  v_to date := (date_trunc('month', coalesce(p_month, public.finance_today())) + interval '1 month - 1 day')::date;
  v_start timestamptz;
  v_end timestamptz;
  v jsonb;
begin
  if not public.finance_can_view() then raise exception 'Not authorized' using errcode = '42501'; end if;
  v_start := public.finance_lagos_day_start(v_from);
  v_end := public.finance_lagos_day_start(v_to + 1);
  with cols as (
    select l.id::text as key, l.name, 1 as ord from public.ops_locations l where l.is_active and l.location_type in ('store','repair','warehouse')
    union all select 'company', 'Company-wide', 2
  ), sold as (
    select o.* from public.ops_orders o
    where o.commercial_state = 'confirmed' and o.deletion_status <> 'deleted' and o.confirmed_at >= v_start and o.confirmed_at < v_end
  ), sold_lines as (
    select * from public.finance_sold_lines(v_from, v_to)
  ), fixed as (
    select r.* from public.ops_repairs r
    where r.status in ('ready_collection','collected')
      and coalesce(r.completed_at, r.collected_at, r.received_at) >= v_start and coalesce(r.completed_at, r.collected_at, r.received_at) < v_end
  ), raw as (
    select 'sales'::text as line, 'Sales confirmed'::text as label, s.branch_location_id::text as key, s.total_amount as amount from sold s
    union all
    select 'cogs', 'Cost of goods and repair parts', sl.branch_id::text, sl.unit_cost * sl.quantity from sold_lines sl where sl.unit_cost is not null
    union all
    select 'repairs', 'Repairs finished', f.branch_location_id::text, f.amount_charged from fixed f
    union all
    select 'cogs', 'Cost of goods and repair parts', f.branch_location_id::text, f.parts_cost + f.labour_cost from fixed f
    union all
    select 'refunds', 'Refunds', o.branch_location_id::text, r.amount
    from public.sales_refunds r left join public.ops_orders o on o.id = r.order_id
    where r.status = 'recorded' and r.refunded_at >= v_start and r.refunded_at < v_end
    union all
    select 'expense', c.name, e.branch_location_id::text, e.amount
    from public.finance_expenses e join public.finance_expense_categories c on c.id = e.category_id
    where e.status = 'approved' and e.expense_date between v_from and v_to
    union all
    select 'salaries', 'Salaries', u.default_location_id::text, l.gross
    from public.finance_pay_runs pr join public.finance_pay_run_lines l on l.run_id = pr.id join public.users u on u.id = l.user_id
    where pr.run_month = v_from and pr.status in ('approved','paid')
  ), keyed as (
    select r.line, r.label, case when r.key in (select cols.key from cols) then r.key else 'company' end as key, r.amount from raw r
  ), summed as (
    select k.line, k.label, k.key, sum(k.amount) as amount from keyed k group by k.line, k.label, k.key
  )
  select jsonb_build_object(
    'month', v_from,
    'columns', (select jsonb_agg(jsonb_build_object('key', c.key, 'name', c.name) order by c.ord, c.name) from cols c),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('line', g.line, 'label', g.label, 'values', g.vals) order by g.line, g.label)
                       from (select s.line, s.label, jsonb_object_agg(s.key, s.amount) as vals from summed s group by s.line, s.label) g), '[]'::jsonb),
    'payroll_status', (select pr.status from public.finance_pay_runs pr where pr.run_month = v_from),
    'cost_missing', (select jsonb_build_object('count', count(*), 'value', coalesce(sum(sl.line_total), 0))
                     from sold_lines sl where sl.unit_cost is null)
  ) into v;
  return v;
end;
$$;

-- ── Grants ──────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array['public.finance_cost_product_for(text, uuid)', 'public.finance_list_cost(uuid, date)',
    'public.finance_sold_lines(date, date)', 'public.finance_cost_key(text)'] loop
    execute 'revoke all on function ' || f || ' from public, anon, authenticated';
  end loop;
  foreach f in array array['public.finance_can_see_cost()', 'public.finance_cost_status()', 'public.finance_product_costs(date, date)',
    'public.finance_set_product_cost(uuid, text, numeric, date, text)', 'public.finance_set_sale_cost(uuid, numeric, text)',
    'public.finance_join_cost_product(uuid, uuid, text)', 'public.finance_inventory_real_cost(uuid)',
    'public.finance_set_inventory_real_cost(uuid, numeric, date)',
    'public.finance_add_supplier_bill(uuid, text, text, date, date, jsonb, text)',
    'public.finance_payables(date)', 'public.finance_profit_and_loss(date)'] loop
    execute 'revoke all on function ' || f || ' from public, anon';
    execute 'grant execute on function ' || f || ' to authenticated';
  end loop;
end
$$;
