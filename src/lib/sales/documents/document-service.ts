import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesActor } from '@/lib/sales/server';
import { documentStoragePath } from './document-path';
import { getDocumentEmailCopy, renderDocumentPdf, type SalesDocumentType } from './runtime';
import { sendSalesEmail } from './smtp';
import type { JsonRecord } from './template-data';

const DOCUMENT_BUCKET = 'sales-documents';

type SalesDocumentRow = {
  id: string;
  document_number: string;
  document_type: SalesDocumentType;
  identity_id: string | null;
  snapshot: JsonRecord;
  storage_path: string | null;
  render_status: 'pending' | 'rendered' | 'failed';
  render_error?: string | null;
  issued_at: string;
  voided_at: string | null;
  quotation_version_id: string | null;
  order_id: string | null;
  repair_id: string | null;
};

type DeliveryRow = {
  id: string;
  recipient_type: 'customer' | 'company_archive';
  recipient_email: string | null;
  delivery_state: 'pending' | 'sent' | 'failed' | 'customer_email_missing';
  attempt_count: number;
};

const documentSelect = 'id,document_number,document_type,identity_id,snapshot,storage_path,render_status,render_error,issued_at,voided_at,quotation_version_id,order_id,repair_id';

async function getDocumentWithClient(supabase: SupabaseClient, documentId: string): Promise<SalesDocumentRow> {
  const { data, error } = await supabase.from('sales_documents').select(documentSelect).eq('id', documentId).single();
  if (error || !data) throw new Error(error?.message || 'Sales document not found');
  return data as SalesDocumentRow;
}

async function renderAndStoreWithClient(supabase: SupabaseClient, documentId: string) {
  const document = await getDocumentWithClient(supabase, documentId);
  if (document.voided_at) throw new Error('Void documents cannot be rendered');
  if (document.render_status === 'rendered' && document.storage_path) return document;

  const storagePath = documentStoragePath({
    documentType: document.document_type,
    documentNumber: document.document_number,
    issuedAt: document.issued_at,
  });

  try {
    const pdf = await renderDocumentPdf({
      documentNumber: document.document_number,
      documentType: document.document_type,
      issuedAt: document.issued_at,
      snapshot: document.snapshot || {},
    });
    const { error: uploadError } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .upload(storagePath, pdf, { contentType: 'application/pdf', cacheControl: '3600', upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { data: updated, error: updateError } = await supabase
      .from('sales_documents')
      .update({ storage_path: storagePath, render_status: 'rendered', render_error: null })
      .eq('id', documentId)
      .select(documentSelect)
      .single();
    if (updateError || !updated) throw new Error(updateError?.message || 'Unable to mark document rendered');
    return updated as SalesDocumentRow;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown document rendering error';
    await supabase.from('sales_documents').update({ render_status: 'failed', render_error: message.slice(0, 2000) }).eq('id', documentId);
    throw error;
  }
}

async function downloadStoredDocument(supabase: SupabaseClient, document: SalesDocumentRow): Promise<Buffer> {
  if (!document.storage_path) throw new Error('Document PDF has not been stored');
  const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).download(document.storage_path);
  if (error || !data) throw new Error(error?.message || 'Unable to download stored document');
  return Buffer.from(await data.arrayBuffer());
}

async function markQuotationDelivery(
  supabase: SupabaseClient,
  quotationVersionId: string | null,
  recipientEmail: string,
  state: 'sent' | 'failed',
  errorText?: string,
) {
  if (!quotationVersionId) return;
  await supabase
    .from('sales_quotation_deliveries')
    .update({ state, sent_at: state === 'sent' ? new Date().toISOString() : null, error_text: errorText || null })
    .eq('quotation_version_id', quotationVersionId)
    .eq('recipient_email', recipientEmail)
    .eq('state', 'pending');
}

async function processDeliveriesWithClient(supabase: SupabaseClient, actorId: string | null, documentId: string) {
  const document = await renderAndStoreWithClient(supabase, documentId);
  if (document.voided_at) throw new Error('Void documents cannot be delivered');
  const pdf = await downloadStoredDocument(supabase, document);
  const { data: rows, error } = await supabase
    .from('sales_document_deliveries')
    .select('id,recipient_type,recipient_email,delivery_state,attempt_count')
    .eq('document_id', documentId)
    .eq('delivery_state', 'pending')
    .order('created_at');
  if (error) throw new Error(error.message);

  const deliveryRows = (rows || []) as DeliveryRow[];
  const emailCopy = getDocumentEmailCopy(document.document_type, document.document_number);
  const filename = `${document.document_number.replace(/[^A-Za-z0-9._-]+/g, '_')}.pdf`;
  const results: Array<{ deliveryId: string; success: boolean; message: string }> = [];

  for (const delivery of deliveryRows) {
    if (!delivery.recipient_email) continue;
    try {
      await sendSalesEmail({
        to: delivery.recipient_email,
        subject: emailCopy.subject,
        text: emailCopy.text,
        filename,
        pdf,
      });
      const { error: updateError } = await supabase
        .from('sales_document_deliveries')
        .update({
          delivery_state: 'sent',
          attempt_count: Number(delivery.attempt_count || 0) + 1,
          last_error: null,
          sent_at: new Date().toISOString(),
        })
        .eq('id', delivery.id);
      if (updateError) throw new Error(updateError.message);
      await markQuotationDelivery(supabase, document.quotation_version_id, delivery.recipient_email, 'sent');
      await supabase.from('sales_events').insert({
        identity_id: document.identity_id,
        order_id: document.order_id,
        quotation_version_id: document.quotation_version_id,
        event_type: 'receipt.delivery_succeeded',
        title: 'Document delivered',
        metadata: {
          document_id: document.id,
          document_number: document.document_number,
          recipient_type: delivery.recipient_type,
          recipient_email: delivery.recipient_email,
        },
        actor_id: actorId,
      });
      results.push({ deliveryId: delivery.id, success: true, message: 'Sent' });
    } catch (deliveryError) {
      const message = deliveryError instanceof Error ? deliveryError.message : 'Unknown delivery error';
      await supabase
        .from('sales_document_deliveries')
        .update({
          delivery_state: 'failed',
          attempt_count: Number(delivery.attempt_count || 0) + 1,
          last_error: message.slice(0, 2000),
        })
        .eq('id', delivery.id);
      await markQuotationDelivery(supabase, document.quotation_version_id, delivery.recipient_email, 'failed', message.slice(0, 2000));
      await supabase.from('sales_events').insert({
        identity_id: document.identity_id,
        order_id: document.order_id,
        quotation_version_id: document.quotation_version_id,
        event_type: 'receipt.delivery_failed',
        title: 'Document delivery failed',
        note: message.slice(0, 500),
        metadata: {
          document_id: document.id,
          document_number: document.document_number,
          recipient_type: delivery.recipient_type,
          recipient_email: delivery.recipient_email,
        },
        actor_id: actorId,
      });
      results.push({ deliveryId: delivery.id, success: false, message });
    }
  }
  return results;
}

async function processDocumentWithClient(supabase: SupabaseClient, actorId: string | null, documentId: string) {
  const document = await renderAndStoreWithClient(supabase, documentId);
  const deliveries = await processDeliveriesWithClient(supabase, actorId, documentId);
  return { document, deliveries };
}

export async function renderAndStoreSalesDocument(documentId: string) {
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

async function processPendingWithClient(supabase: SupabaseClient, actorId: string | null, limit: number) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit || 10)));
  const [documentsResult, deliveriesResult] = await Promise.all([
    supabase
      .from('sales_documents')
      .select('id')
      .eq('render_status', 'pending')
      .is('voided_at', null)
      .order('created_at', { ascending: true })
      .limit(safeLimit),
    supabase
      .from('sales_document_deliveries')
      .select('document_id')
      .eq('delivery_state', 'pending')
      .order('created_at', { ascending: true })
      .limit(safeLimit),
  ]);
  if (documentsResult.error) throw new Error(documentsResult.error.message);
  if (deliveriesResult.error) throw new Error(deliveriesResult.error.message);

  const ids = Array.from(new Set([
    ...(documentsResult.data || []).map((row) => row.id),
    ...(deliveriesResult.data || []).map((row) => row.document_id),
  ])).slice(0, safeLimit);

  const results = [];
  for (const id of ids) {
    try {
      results.push({ id, success: true, result: await processDocumentWithClient(supabase, actorId, id) });
    } catch (processError) {
      results.push({
        id,
        success: false,
        error: processError instanceof Error ? processError.message : 'Unknown error',
      });
    }
  }
  return results;
}

export function processPendingSalesDocumentsAsSystem(limit = 10) {
  return processPendingWithClient(getSupabaseAdmin(), null, limit);
}
