
alter table public.ops_inventory_items
  add column if not exists salesperson_discount_limit_percent numeric not null default 0
  check (salesperson_discount_limit_percent >= 0 and salesperson_discount_limit_percent <= 100);

create unique index if not exists sales_margin_policies_product_inventory_unique
  on public.sales_margin_policies (inventory_item_id)
  where policy_scope = 'product';
