// [MERGE] Finance · Profit and loss CSV for one month.
import { NextResponse, type NextRequest } from 'next/server';
import { getFinanceViewer } from '@/lib/finance/access';
import { canViewFinance } from '@/lib/finance/permissions';
import { getProfitAndLoss } from '@/lib/finance/data';
import { csvCell } from '@/lib/finance/format';
import { buildPnl } from '@/lib/finance/pnl';
import { FinanceDataError } from '@/lib/finance/rpc';

export async function GET(request: NextRequest) {
  const viewer = await getFinanceViewer();
  if (!viewer || !canViewFinance(viewer.role)) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  const month = request.nextUrl.searchParams.get('month') ?? '';
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Choose a month' }, { status: 400 });
  try {
    const pnl = buildPnl(await getProfitAndLoss(`${month}-01`));
    const header = ['', ...pnl.columns.map((c) => c.name), 'Total'];
    const lines = pnl.rows.map((r) => [r.label, ...pnl.columns.map((c) => r.values[c.key] ?? 0), r.total]);
    const csv = `﻿${[header, ...lines].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="emmytech-profit-and-loss-${month}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const status = error instanceof FinanceDataError && error.notAuthorized ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? 'Not authorized' : 'Could not build the file' }, { status });
  }
}
