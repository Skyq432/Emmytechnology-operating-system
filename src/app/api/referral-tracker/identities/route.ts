import { NextResponse } from 'next/server';
import { searchReferralTrackerIdentities } from '@/lib/operations/identity-server';

// Separate from /api/operations/identities because its audience is different: front_desk
// and marketing_manager both need this, and marketing_manager has zero StaffCapability
// entries (the gate that route uses). See canAccessReferralTracker in roles.ts.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const results = await searchReferralTrackerIdentities(query);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: 'Identity search failed', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
