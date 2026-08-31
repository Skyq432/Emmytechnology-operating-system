'use server';

import { revalidatePath } from 'next/cache';
import {
  processPendingSalesDocuments,
  processSalesDocument,
  retrySalesDocument,
} from '@/lib/sales/documents/document-service';

export type DocumentActionState = { success: boolean; message: string };
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
    return {
      success: failed === 0,
      message: failed ? `PDF processed, but ${failed} email delivery attempt(s) failed. You can retry from this page.` : 'PDF rendered and pending deliveries processed.',
    };
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
    return {
      success: failed === 0,
      message: failed ? `Retry completed with ${failed} delivery failure(s).` : 'Document retry completed successfully.',
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
    return {
      success: failed === 0,
      message: results.length === 0
        ? 'No pending Sales documents.'
        : `Processed ${results.length} document(s)${failed ? ` · ${failed} need attention` : ''}.`,
    };
  } catch (error) {
    refresh();
    return fail(error instanceof Error ? error.message : 'Unable to process document queue.');
  }
}
