-- A soft-deleted order's payments must not keep counting toward revenue reporting.
create or replace view public.sales_unified_payments as
 SELECT 'order'::text AS source_type,
    p.id AS source_payment_id,
    p.order_id AS source_id,
    o.order_code AS source_code,
    o.identity_id,
    p.amount,
    p.payment_method,
    p.reference,
    p.paid_at,
    p.is_void,
    p.recorded_by,
    p.created_at
   FROM ops_order_payments p
     JOIN ops_orders o ON o.id = p.order_id
   WHERE o.deletion_status <> 'deleted'
UNION ALL
 SELECT 'repair'::text AS source_type,
    p.id AS source_payment_id,
    p.repair_id AS source_id,
    r.repair_code AS source_code,
    r.identity_id,
    p.amount,
    p.payment_method,
    p.reference,
    p.paid_at,
    p.is_void,
    p.recorded_by,
    p.created_at
   FROM ops_repair_payments p
     JOIN ops_repairs r ON r.id = p.repair_id;
