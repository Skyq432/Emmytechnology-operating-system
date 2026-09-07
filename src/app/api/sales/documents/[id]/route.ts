import { NextRequest, NextResponse } from 'next/server';
import { createSignedSalesDocumentUrl } from '@/lib/sales/documents/document-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: 'Document is required' }, { status: 400 });
  try {
    const url = await createSignedSalesDocumentUrl(id, 300);
    return NextResponse.redirect(url, 307);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Document unavailable';
    const status = /Not authenticated|Not authorized/i.test(message) ? 401 : /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
