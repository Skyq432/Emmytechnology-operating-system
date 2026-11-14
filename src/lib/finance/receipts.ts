// [SWAP → EmmyTech OS] Replaces the test-build src/lib/finance/receipts.ts at merge.
// Receipts go into the private "finance-receipts" bucket (see
// merge/supabase/finance_receipts_bucket.sql). Viewing uses a 5-minute signed link.
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase-server';

export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
const BUCKET = 'finance-receipts';
const TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic', '.pdf': 'application/pdf' };
const STORED = /^storage:(\d{4}-\d{2}\/[0-9a-f-]{36}-[A-Za-z0-9_-]{1,40}\.[a-z]{3,4})$/;

export class ReceiptError extends Error {}

export async function saveReceipt(file: FormDataEntryValue | null): Promise<string | null> {
  if (!file || typeof file === 'string' || file.size === 0) return null;
  if (file.size > RECEIPT_MAX_BYTES) throw new ReceiptError('The receipt photo is too big (5 MB maximum)');
  const ext = path.extname(file.name).toLowerCase();
  if (!TYPES[ext]) throw new ReceiptError('Receipts must be a photo (JPG, PNG, WEBP, HEIC) or a PDF');
  const safe = path.basename(file.name, ext).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || 'receipt';
  const objectPath = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}-${safe}${ext}`;
  const supabase = await createClient();
  const { error } = await supabase.storage.from(BUCKET).upload(objectPath, file, { contentType: TYPES[ext], upsert: false });
  if (error) throw new ReceiptError('The receipt could not be uploaded. Try again.');
  return `storage:${objectPath}`;
}

export async function openReceipt(stored: string): Promise<Response | null> {
  const match = STORED.exec(stored);
  if (!match) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(match[1], 300);
  if (error || !data?.signedUrl) return null;
  return Response.redirect(data.signedUrl, 302);
}

export function receiptLabel(stored: string | null): string {
  if (!stored) return '';
  return stored.replace(/^(local|storage):/, '').replace(/^\d{4}-\d{2}\//, '').replace(/^[0-9a-f-]{36}-/, '');
}
