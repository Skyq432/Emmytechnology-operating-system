import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { processPendingSalesDocumentsAsSystem } from '@/lib/sales/documents/document-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sameSecret(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function authorized(request: NextRequest) {
  const expected = process.env.SALES_DOCUMENT_PROCESSOR_SECRET || process.env.CRON_SECRET || '';
  if (!expected) return false;
  const authorization = request.headers.get('authorization') || '';
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const headerSecret = request.headers.get('x-sales-document-secret') || '';
  return Boolean((bearer && sameSecret(bearer, expected)) || (headerSecret && sameSecret(headerSecret, expected)));
}

async function processRequest(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rawLimit = Number(request.nextUrl.searchParams.get('limit') || 10);
  const limit = Math.min(25, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 10));
  try {
    const results = await processPendingSalesDocumentsAsSystem(limit);
    const succeeded = results.filter((row) => row.success).length;
    return NextResponse.json({ processed: results.length, succeeded, failed: results.length - succeeded, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Document processor failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function GET(request: NextRequest) {
  return processRequest(request);
}

export function POST(request: NextRequest) {
  return processRequest(request);
}
