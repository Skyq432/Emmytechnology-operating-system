// [MERGE] Opens an expense's receipt for Finance viewers or the person who logged it.
import { NextResponse, type NextRequest } from 'next/server';
import { financeRpc, FinanceDataError } from '@/lib/finance/rpc';
import { openReceipt } from '@/lib/finance/receipts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('expense') ?? '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const { receipt_path } = await financeRpc<{ receipt_path: string | null }>('finance_expense_receipt', { p_expense_id: id });
    const response = receipt_path ? await openReceipt(receipt_path) : null;
    return response ?? new NextResponse('Receipt file not found. (TEST data has receipt names but no real files.)', { status: 404 });
  } catch (error) {
    const status = error instanceof FinanceDataError && error.notAuthorized ? 403 : 404;
    return NextResponse.json({ error: status === 403 ? 'Not authorized' : 'Not found' }, { status });
  }
}
