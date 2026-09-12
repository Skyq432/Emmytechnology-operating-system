from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}")
    p.write_text(text.replace(old, new, 1))


service = "src/lib/sales/documents/document-service.ts"
old = """export async function renderAndStoreSalesDocument(documentId: string) {
  const { supabase } = await requireSalesActor();
  return renderAndStoreWithClient(supabase, documentId);
}

export async function createSignedSalesDocumentUrl(documentId: string, expiresIn = 300) {
  const { supabase } = await requireSalesActor();
  const document = await renderAndStoreWithClient(supabase, documentId);
  if (!document.storage_path) throw new Error('Document PDF is unavailable');
  const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(document.storage_path, expiresIn);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Unable to create document download link');
  return data.signedUrl;
}

export async function processSalesDocumentDeliveries(documentId: string) {
  const { supabase, actor } = await requireSalesActor();
  return processDeliveriesWithClient(supabase, actor.userId, documentId);
}

export async function processSalesDocument(documentId: string) {
  const { supabase, actor } = await requireSalesActor();
  return processDocumentWithClient(supabase, actor.userId, documentId);
}

export async function retrySalesDocument(documentId: string) {
  const { supabase, actor } = await requireSalesActor();
  const document = await getDocumentWithClient(supabase, documentId);
  if (document.voided_at) throw new Error('Void documents cannot be retried');
  if (document.render_status === 'failed') {
    await supabase.from('sales_documents').update({ render_status: 'pending', render_error: null }).eq('id', documentId);
  }
  await supabase
    .from('sales_document_deliveries')
    .update({ delivery_state: 'pending', last_error: null })
    .eq('document_id', documentId)
    .eq('delivery_state', 'failed');
  return processDocumentWithClient(supabase, actor.userId, documentId);
}

async function processDocumentsByReference(
  supabase: SupabaseClient,
  actorId: string | null,
  column: 'order_id' | 'repair_id',
  referenceId: string,
) {
  const { data, error } = await supabase
    .from('sales_documents')
    .select('id')
    .eq(column, referenceId)
    .is('voided_at', null)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const results = [];
  for (const row of data || []) {
    try {
      results.push({ id: row.id, success: true, result: await processDocumentWithClient(supabase, actorId, row.id) });
    } catch (processError) {
      results.push({
        id: row.id,
        success: false,
        error: processError instanceof Error ? processError.message : 'Unknown error',
      });
    }
  }
  return results;
}

export async function processDocumentsForOrder(orderId: string) {
  const { supabase, actor } = await requireSalesActor();
  return processDocumentsByReference(supabase, actor.userId, 'order_id', orderId);
}

export async function processDocumentsForRepair(repairId: string) {
  const { supabase, actor } = await requireSalesActor();
  return processDocumentsByReference(supabase, actor.userId, 'repair_id', repairId);
}

export async function processPendingSalesDocuments(limit = 10) {
  const { supabase, actor } = await requireSalesActor();
  return processPendingWithClient(supabase, actor.userId, limit);
}
"""
new = """async function requireAuthorizedDocument(documentId: string) {
  const { supabase, actor } = await requireSalesActor();
  // Authorize with the caller/RLS before switching to the backend client for
  // private storage and document-state mutations.
  const document = await getDocumentWithClient(supabase, documentId);
  return { actor, document, admin: getSupabaseAdmin() };
}

export async function renderAndStoreSalesDocument(documentId: string) {
  const { admin } = await requireAuthorizedDocument(documentId);
  return renderAndStoreWithClient(admin, documentId);
}

export async function createSignedSalesDocumentUrl(documentId: string, expiresIn = 300) {
  const { admin } = await requireAuthorizedDocument(documentId);
  const document = await renderAndStoreWithClient(admin, documentId);
  if (!document.storage_path) throw new Error('Document PDF is unavailable');
  const { data, error } = await admin.storage.from(DOCUMENT_BUCKET).createSignedUrl(document.storage_path, expiresIn);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Unable to create document download link');
  return data.signedUrl;
}

export async function processSalesDocumentDeliveries(documentId: string) {
  const { actor, admin } = await requireAuthorizedDocument(documentId);
  return processDeliveriesWithClient(admin, actor.userId, documentId);
}

export async function processSalesDocument(documentId: string) {
  const { actor, admin } = await requireAuthorizedDocument(documentId);
  return processDocumentWithClient(admin, actor.userId, documentId);
}

export async function retrySalesDocument(documentId: string) {
  const { actor, document, admin } = await requireAuthorizedDocument(documentId);
  if (document.voided_at) throw new Error('Void documents cannot be retried');
  if (document.render_status === 'failed') {
    await admin.from('sales_documents').update({ render_status: 'pending', render_error: null }).eq('id', documentId);
  }
  await admin
    .from('sales_document_deliveries')
    .update({ delivery_state: 'pending', last_error: null })
    .eq('document_id', documentId)
    .eq('delivery_state', 'failed');
  return processDocumentWithClient(admin, actor.userId, documentId);
}

async function processDocumentsByReference(
  discoveryClient: SupabaseClient,
  actorId: string | null,
  column: 'order_id' | 'repair_id',
  referenceId: string,
) {
  const { data, error } = await discoveryClient
    .from('sales_documents')
    .select('id')
    .eq(column, referenceId)
    .is('voided_at', null)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const admin = getSupabaseAdmin();
  const results = [];
  for (const row of data || []) {
    try {
      results.push({ id: row.id, success: true, result: await processDocumentWithClient(admin, actorId, row.id) });
    } catch (processError) {
      results.push({
        id: row.id,
        success: false,
        error: processError instanceof Error ? processError.message : 'Unknown error',
      });
    }
  }
  return results;
}

export async function processDocumentsForOrder(orderId: string) {
  const { supabase, actor } = await requireSalesActor();
  return processDocumentsByReference(supabase, actor.userId, 'order_id', orderId);
}

export async function processDocumentsForRepair(repairId: string) {
  const { supabase, actor } = await requireSalesActor();
  return processDocumentsByReference(supabase, actor.userId, 'repair_id', repairId);
}

export async function processPendingSalesDocuments(limit = 10) {
  const { supabase, actor } = await requireSalesActor();
  const safeLimit = Math.min(50, Math.max(1, Number(limit || 10)));
  const [documentsResult, deliveriesResult] = await Promise.all([
    supabase.from('sales_documents').select('id').eq('render_status', 'pending').is('voided_at', null).order('created_at', { ascending: true }).limit(safeLimit),
    supabase.from('sales_document_deliveries').select('document_id').eq('delivery_state', 'pending').order('created_at', { ascending: true }).limit(safeLimit),
  ]);
  if (documentsResult.error) throw new Error(documentsResult.error.message);
  if (deliveriesResult.error) throw new Error(deliveriesResult.error.message);
  const ids = Array.from(new Set([
    ...(documentsResult.data || []).map((row) => row.id),
    ...(deliveriesResult.data || []).map((row) => row.document_id),
  ])).slice(0, safeLimit);
  const admin = getSupabaseAdmin();
  const results = [];
  for (const id of ids) {
    try {
      results.push({ id, success: true, result: await processDocumentWithClient(admin, actor.userId, id) });
    } catch (processError) {
      results.push({ id, success: false, error: processError instanceof Error ? processError.message : 'Unknown error' });
    }
  }
  return results;
}
"""
replace_once(service, old, new)

repair_server = "src/lib/operations/repair-server.ts"
replace_once(
    repair_server,
    "  const [repairResult, assignmentsResult, quotesResult, paymentsResult, consentsResult, eventsResult] = await Promise.all([\n",
    "  const [repairResult, assignmentsResult, quotesResult, paymentsResult, consentsResult, eventsResult, documentsResult] = await Promise.all([\n",
)
replace_once(
    repair_server,
    "    supabase.from('ops_repair_events').select('*').eq('repair_id', repairId).order('created_at', { ascending: false }),\n  ]);",
    "    supabase.from('ops_repair_events').select('*').eq('repair_id', repairId).order('created_at', { ascending: false }),\n    supabase.from('sales_documents').select('id,document_number,document_type,render_status,storage_path,voided_at').eq('repair_id', repairId).is('voided_at', null).order('issued_at', { ascending: false }),\n  ]);",
)
replace_once(
    repair_server,
    "  const error = repairResult.error || assignmentsResult.error || quotesResult.error || paymentsResult.error || consentsResult.error || eventsResult.error;",
    "  const error = repairResult.error || assignmentsResult.error || quotesResult.error || paymentsResult.error || consentsResult.error || eventsResult.error || documentsResult.error;",
)
replace_once(
    repair_server,
    "    events: (eventsResult.data || []) as OperationsRepairEvent[],\n  };",
    "    events: (eventsResult.data || []) as OperationsRepairEvent[],\n    documents: documentsResult.data || [],\n  };",
)

repair_page = "src/app/modules/operations/repairs/[id]/page.tsx"
replace_once(
    repair_page,
    "  const quoteAmount = Number(detail.currentQuote?.quote_amount || r.amount_charged || 0);\n",
    "  const quoteAmount = Number(detail.currentQuote?.quote_amount || r.amount_charged || 0);\n  const finalReceipt = detail.documents.find((document) => document.document_type === 'final_sales_receipt');\n",
)
replace_once(
    repair_page,
    "    <div className=\"grid gap-5 lg:grid-cols-3\">",
    "    {finalReceipt ? <div className=\"mb-5 flex justify-end\"><a href={`/api/sales/documents/${finalReceipt.id}`} target=\"_blank\" rel=\"noreferrer\" className=\"rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white\">View Final Receipt</a></div> : null}\n    <div className=\"grid gap-5 lg:grid-cols-3\">",
)
