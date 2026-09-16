'use server';

import { revalidatePath } from 'next/cache';
import { requireSalesActor } from '@/lib/sales/server';
import {
  processPendingSalesDocuments,
  processSalesDocument,
  renderAndStoreSalesDocument,
  retrySalesDocument,
} from '@/lib/sales/documents/document-service';

export type DocumentActionState = { success: boolean; message: string; data?: unknown };
const fail = (message: string): DocumentActionState => ({ success: false, message });

function refresh() {
  revalidatePath('/modules/sales');
  revalidatePath('/modules/sales/receipts');
  revalidatePath('/modules/sales/quotations');
}

export async function processDocumentAction(_prev: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  const documentId = String(formData.get('document_id') || '');
  if (!documentId) return fail('Document is required.');
  try {
    const result = await processSalesDocument(documentId);
    refresh();
    const failed = result.deliveries.filter((row) => !row.success).length;
    return { success: failed === 0, message: failed ? `PDF processed, but ${failed} email delivery attempt(s) failed. You can retry from this page.` : 'PDF rendered and pending deliveries processed.' };
  } catch (error) {
    refresh();
    return fail(error instanceof Error ? error.message : 'Unable to process document.');
  }
}

export async function retryDocumentAction(_prev: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  const documentId = String(formData.get('document_id') || '');
  if (!documentId) return fail('Document is required.');
  try {
    const result = await retrySalesDocument(documentId);
    refresh();
    const failed = result.deliveries.filter((row) => !row.success).length;
    const smtpMissing = result.deliveries.some((row) => !row.success && /SMTP is not configured/i.test(row.message));
    return {
      success: failed === 0,
      message: failed
        ? smtpMissing
          ? 'PDF is ready. Email sending is not configured yet.'
          : `Email retry completed with ${failed} delivery failure(s).`
        : 'Email delivery retry completed successfully.',
    };
  } catch (error) {
    refresh();
    return fail(error instanceof Error ? error.message : 'Unable to retry document.');
  }
}

export async function processDocumentQueueAction(_prev: DocumentActionState): Promise<DocumentActionState> {
  try {
    const results = await processPendingSalesDocuments(20);
    refresh();
    const failed = results.filter((row) => !row.success).length;
    return { success: failed === 0, message: results.length === 0 ? 'No pending Sales documents.' : `Processed ${results.length} document(s)${failed ? ` · ${failed} need attention` : ''}.` };
  } catch (error) {
    refresh();
    return fail(error instanceof Error ? error.message : 'Unable to process document queue.');
  }
}

export async function sendReceiptAction(_prev: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  const documentId = String(formData.get('document_id') || '');
  const sourceType = String(formData.get('source_type') || '') as 'order' | 'repair' | '';
  const sourcePaymentId = String(formData.get('source_payment_id') || '');
  const email = String(formData.get('recipient_email') || '').trim().toLowerCase();
  if (!email) return fail('Customer email is required.');
  try {
    const { supabase } = await requireSalesActor();
    let docId = documentId;
    if (!docId) {
      if (!sourceType || !sourcePaymentId) return fail('Document is required.');
      const { data: document, error: metadataError } = await supabase.rpc('sales_ensure_payment_receipt_metadata', {
        p_source_type: sourceType,
        p_source_payment_id: sourcePaymentId,
      });
      if (metadataError || !document?.id) throw new Error(metadataError?.message || 'Unable to prepare receipt PDF');
      docId = String(document.id);
    }

    await renderAndStoreSalesDocument(docId);
    const { error: queueError } = await supabase.rpc('sales_queue_document_send', { p_document_id: docId, p_recipient_email: email });
    if (queueError) throw new Error(queueError.message);

    const processed = await processSalesDocument(docId);
    refresh();
    const failed = processed.deliveries.filter((row) => !row.success).length;
    return {
      success: failed === 0,
      message: failed ? `Receipt is ready, but ${failed} email delivery attempt(s) failed. Retry from Receipts & Documents.` : 'Receipt sent to the customer.',
    };
  } catch (error) {
    refresh();
    return fail(error instanceof Error ? error.message : 'Unable to send receipt.');
  }
}

export async function sendQuotationPdfAction(_prev: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  const versionId = String(formData.get('quotation_version_id') || '');
  const email = String(formData.get('recipient_email') || '').trim().toLowerCase();
  if (!versionId || !email) return fail('Quotation version and customer email are required.');
  try {
    const { supabase } = await requireSalesActor();
    const { data: document, error: metadataError } = await supabase.rpc('sales_ensure_quotation_document_metadata', { p_quotation_version_id: versionId });
    if (metadataError || !document?.id) throw new Error(metadataError?.message || 'Unable to prepare quotation PDF');

    await renderAndStoreSalesDocument(String(document.id));
    const { data: deliveryId, error: queueError } = await supabase.rpc('sales_queue_quotation_send', {
      p_quotation_version_id: versionId,
      p_recipient_email: email,
    });
    if (queueError) throw new Error(queueError.message);

    const processed = await processSalesDocument(String(document.id));
    refresh();
    const failed = processed.deliveries.filter((row) => !row.success).length;
    return {
      success: failed === 0,
      message: failed ? `Quotation PDF is ready, but ${failed} email delivery attempt(s) failed. Retry from Receipts & Documents.` : 'Quotation PDF sent to the customer and queued company archive recipients.',
      data: deliveryId,
    };
  } catch (error) {
    refresh();
    return fail(error instanceof Error ? error.message : 'Unable to send quotation PDF.');
  }
}
