import { NextResponse } from 'next/server';
import { searchOperationsIdentities } from '@/lib/operations/identity-server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const results = await searchOperationsIdentities(query);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: 'Identity search failed', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
