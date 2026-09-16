CREATE OR REPLACE FUNCTION public.sales_ensure_quotation_document_metadata(p_quotation_version_id uuid)
 RETURNS sales_documents
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_version public.sales_quotation_versions; v_quote public.sales_quotations; v_doc public.sales_documents; v_items jsonb; v_number text;
begin
  if not public.staff_has_capability('sales.quotation.manage') then raise exception 'Not authorized'; end if;
  select * into v_doc from public.sales_documents where document_type='quotation_pdf' and quotation_version_id=p_quotation_version_id and voided_at is null limit 1;
  if found then return v_doc; end if;
  select * into v_version from public.sales_quotation_versions where id=p_quotation_version_id;
  if not found then raise exception 'Quotation version not found'; end if;
  select * into v_quote from public.sales_quotations where id=v_version.quotation_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'item_name',item_name,'item_type',item_type,'specs',specs,'quantity',quantity,'list_price',list_price,'final_unit_price',final_unit_price,
    'line_discount_amount',line_discount_amount,'note',note
  ) order by created_at,id),'[]'::jsonb) into v_items from public.sales_quotation_items where quotation_version_id=v_version.id;
  v_number:=v_quote.quotation_code||'-V'||v_version.version::text;
  insert into public.sales_documents(document_number,document_type,identity_id,quotation_version_id,snapshot,created_by)
  values(v_number,'quotation_pdf',v_quote.identity_id,v_version.id,jsonb_build_object(
    'quotation_code',v_quote.quotation_code,'version',v_version.version,'customer_name',v_quote.customer_name,
    'customer_phone',v_quote.customer_phone,'customer_email',v_quote.customer_email,'items',v_items,
    'subtotal',v_version.subtotal,'discount_amount',v_version.discount_amount,'total_amount',v_version.total_amount,
    'validity_expires_at',v_version.validity_expires_at,'customer_note',v_version.customer_note,'terms',v_version.terms,
    'sales_staff_name',v_quote.sales_staff_name,'published_at',v_version.published_at
  ),auth.uid()) returning * into v_doc;
  return v_doc;
end;
$function$
