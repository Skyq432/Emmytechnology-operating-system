// [MERGE] Finance · Money In CSV download (same filters as the page, up to 5,000 rows).
import { NextResponse, type NextRequest } from 'next/server';
import { getFinanceViewer } from '@/lib/finance/access';
import { canViewFinance } from '@/lib/finance/permissions';
import { listMoneyIn } from '@/lib/finance/data';
import { MONEY_IN_EXPORT_LIMIT, parseMoneyInFilters, type SearchParams } from '@/lib/finance/filters';
import { getFinancePeriod } from '@/lib/finance/period-source';
import { branchLabel, csvCell, lagosDateTimeLabel, methodLabel, sourceLabel } from '@/lib/finance/format';
import { FinanceDataError } from '@/lib/finance/rpc';

export async function GET(request: NextRequest) {
  const viewer = await getFinanceViewer();
  if (!viewer || !canViewFinance(viewer.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const params: SearchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const filters = parseMoneyInFilters({ ...params, page: '1' }, new Date(), await getFinancePeriod(params));

  try {
    const result = await listMoneyIn(filters, MONEY_IN_EXPORT_LIMIT, 0);
    const header = ['Date (Lagos)', 'Source', 'Code', 'Customer', 'Branch', 'Method', 'Received into', 'Reference', 'Amount (NGN)', 'Status', 'Recorded by'];
    const lines = result.rows.map((row) =>
      [
        lagosDateTimeLabel(row.paid_at),
        sourceLabel(row.sales_channel),
        row.source_code,
        row.customer_name,
        branchLabel(row.branch_name),
        methodLabel(row.payment_method),
        row.account_name || 'Not placed',
        row.reference,
        row.amount,
        row.is_void ? 'Void' : 'Received',
        row.recorded_by_name,
      ]
        .map(csvCell)
        .join(','),
    );
    if (result.total_count > result.rows.length) {
      lines.push(csvCell(`Only the first ${result.rows.length} of ${result.total_count} payments are included. Choose a shorter period for the rest.`));
    }

    // The BOM makes Excel open the ₦ sign and names correctly.
    const csv = `﻿${[header.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`;
    const filename = `emmytech-money-in-${filters.period.from}-to-${filters.period.to}.csv`;
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const status = error instanceof FinanceDataError && error.notAuthorized ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? 'Not authorized' : 'Could not build the file' }, { status });
  }
}
