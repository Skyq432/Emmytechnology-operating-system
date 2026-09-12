do $$
declare r record; v_definition text; v_updated text;
begin
  for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.proname in ('sales_create_direct_sale_draft','sales_create_order_draft') loop
    v_definition:=pg_get_functiondef(r.oid);
    v_updated:=regexp_replace(v_definition,'(v_exception\s*:=\s*nullif\(trim\(v_item->>''admin_exception_reason''\),\s*''''\);)',E'\\1\n    if v_exception is not null and not public.staff_has_capability(''sales.pricing.admin'') then\n      raise exception ''Only an authorised administrator can approve a pricing exception'';\n    end if;','g');
    if v_updated=v_definition then raise exception 'Pricing exception assignment not found in %',r.proname; end if;
    execute v_updated;
  end loop;
end $$;

do $$
declare r record; v_definition text; v_updated text;
begin
  select p.oid,p.proname into r from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.proname='sales_publish_quotation_version' limit 1;
  v_definition:=pg_get_functiondef(r.oid);
  v_updated:=regexp_replace(v_definition,'(v_exception_reason\s*:=\s*nullif\(trim\(v_item->>''admin_exception_reason''\),\s*''''\);)',E'\\1\n    if v_exception_reason is not null and not public.staff_has_capability(''sales.pricing.admin'') then\n      raise exception ''Only an authorised administrator can approve a pricing exception'';\n    end if;','g');
  if v_updated=v_definition then raise exception 'Pricing exception assignment not found in sales_publish_quotation_version'; end if;
  execute v_updated;
end $$;
