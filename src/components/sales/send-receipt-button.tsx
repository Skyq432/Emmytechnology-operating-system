'use client';

import { useActionState, useState } from 'react';
import { sendReceiptAction, type DocumentActionState } from '@/app/(staff)/modules/sales/document-actions';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const initial: DocumentActionState = { success: false, message: '' };

/**
 * One-click "email this receipt to the customer" affordance, usable right next to
 * any payment (including a partial one) without navigating to Receipts & Documents.
 * Pass either a known `documentId` (e.g. an order's final receipt) or a
 * `sourceType`/`sourcePaymentId` pair, which creates the per-payment receipt
 * document on first send.
 */
export function SendReceiptButton({
  sourceType,
  sourcePaymentId,
  documentId,
  defaultEmail,
  label = 'Send receipt',
}: {
  sourceType?: 'order' | 'repair';
  sourcePaymentId?: string;
  documentId?: string;
  defaultEmail?: string | null;
  label?: string;
}) {
  const [state, action, pending] = useActionState(sendReceiptAction, initial);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-bold text-emmy-primary hover:underline">
        {label}
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {sourceType ? <input type="hidden" name="source_type" value={sourceType} /> : null}
      {sourcePaymentId ? <input type="hidden" name="source_payment_id" value={sourcePaymentId} /> : null}
      {documentId ? <input type="hidden" name="document_id" value={documentId} /> : null}
      <Input name="recipient_email" type="email" defaultValue={defaultEmail || ''} placeholder="Customer email" className="h-8 w-44 text-xs" required />
      <Button type="submit" size="sm" disabled={pending} className="h-8 px-3 text-xs">{pending ? 'Sending…' : 'Send'}</Button>
      {state.message ? <span className={`text-xs font-bold ${state.success ? 'text-emerald-700' : 'text-rose-600'}`}>{state.message}</span> : null}
    </form>
  );
}
