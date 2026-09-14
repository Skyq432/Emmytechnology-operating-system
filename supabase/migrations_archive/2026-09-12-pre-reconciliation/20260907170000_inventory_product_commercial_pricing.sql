-- Inventory product commercial pricing
-- Product-level salesperson discount is stored with the inventory item.
-- Minimum gross margin continues to use the existing Sales margin policy model.

alter table public.ops_inventory_items
  add column if not exists salesperson_discount_limit_percent numeric not null default 0
  check (salesperson_discount_limit_percent >= 0 and salesperson_discount_limit_percent <= 100);

create unique index if not exists sales_margin_policies_product_inventory_unique
  on public.sales_margin_policies (inventory_item_id)
  where policy_scope = 'product';
