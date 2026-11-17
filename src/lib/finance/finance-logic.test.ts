// Checks the page logic that does not need a database: periods, filters, roles, formatting.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { eachDay, formatRange, lagosToday, resolvePeriod } from './dates.ts';
import { moneyInArgs, moneyInQuery, parseMoneyInFilters, parseOverviewFilters } from './filters.ts';
import { canLogPettyCash, canManageFinance, canOpenFinancePage, canViewFinance, financeNavKeys, isFinanceOwner } from './permissions.ts';
import { buildPnl } from './pnl.ts';
import { csvCell, naira } from './format.ts';

// 13 Nov 2026, 23:30 UTC = 14 Nov 2026, 00:30 in Lagos (a Saturday).
const LATE_NIGHT = new Date('2026-11-13T23:30:00Z');
// 13 Nov 2026, 10:00 Lagos (a Friday).
const FRIDAY = new Date('2026-11-13T09:00:00Z');

describe('Lagos dates', () => {
  test('"today" switches at Lagos midnight, not UTC midnight', () => {
    assert.equal(lagosToday(LATE_NIGHT), '2026-11-14');
    assert.equal(lagosToday(new Date('2026-11-13T22:59:00Z')), '2026-11-13');
  });

  test('periods', () => {
    assert.deepEqual(pickRange(resolvePeriod({ period: 'today' }, FRIDAY)), ['2026-11-13', '2026-11-13']);
    assert.deepEqual(pickRange(resolvePeriod({ period: 'yesterday' }, FRIDAY)), ['2026-11-12', '2026-11-12']);
    assert.deepEqual(pickRange(resolvePeriod({ period: 'week' }, FRIDAY)), ['2026-11-09', '2026-11-13']);
    assert.deepEqual(pickRange(resolvePeriod({ period: 'month' }, FRIDAY)), ['2026-11-01', '2026-11-13']);
    assert.deepEqual(pickRange(resolvePeriod({ period: 'last_month' }, FRIDAY)), ['2026-10-01', '2026-10-31']);
  });

  test('week starts on Monday, even on a Sunday', () => {
    const sunday = new Date('2026-11-15T12:00:00Z');
    assert.deepEqual(pickRange(resolvePeriod({ period: 'week' }, sunday)), ['2026-11-09', '2026-11-15']);
  });

  test('last month in January is December of the year before', () => {
    const january = new Date('2027-01-10T12:00:00Z');
    assert.deepEqual(pickRange(resolvePeriod({ period: 'last_month' }, january)), ['2026-12-01', '2026-12-31']);
  });

  test('custom dates, and safe fallback for bad ones', () => {
    assert.deepEqual(pickRange(resolvePeriod({ period: 'custom', from: '2026-10-05', to: '2026-11-02' }, FRIDAY)), ['2026-10-05', '2026-11-02']);
    for (const bad of [
      { from: '2026-11-10', to: '2026-11-01' },
      { from: '2026-02-30', to: '2026-03-01' },
      { from: 'yesterday', to: '2026-11-01' },
      { from: '2020-01-01', to: '2026-11-01' },
    ]) {
      const period = resolvePeriod({ period: 'custom', ...bad }, FRIDAY);
      assert.equal(period.key, 'month');
    }
    assert.equal(resolvePeriod({ period: 'nonsense' }, FRIDAY).key, 'month');
  });

  test('labels and day lists', () => {
    assert.equal(formatRange('2026-11-01', '2026-11-13'), '1 – 13 Nov 2026');
    assert.equal(formatRange('2026-10-28', '2026-11-03'), '28 Oct – 3 Nov 2026');
    assert.equal(formatRange('2026-11-13', '2026-11-13'), '13 Nov 2026');
    assert.equal(eachDay('2026-10-30', '2026-11-02').length, 4);
  });
});

describe('Filters from the URL', () => {
  test('money-in filters', () => {
    const f = parseMoneyInFilters(
      { period: 'custom', from: '2026-11-01', to: '2026-11-30', branch: '00000000-0000-0000-0002-000000000001', method: 'pos', source: 'repair', q: '  bisi ', void: '1', page: '2' },
      FRIDAY,
    );
    assert.equal(f.branch.branchId, '00000000-0000-0000-0002-000000000001');
    assert.equal(f.method, 'pos');
    assert.equal(f.source, 'repair');
    assert.equal(f.search, 'bisi');
    assert.equal(f.includeVoid, true);
    assert.equal(f.page, 2);
    assert.deepEqual(moneyInArgs(f, 50, 50), {
      p_from: '2026-11-01',
      p_to: '2026-11-30',
      p_branch_id: '00000000-0000-0000-0002-000000000001',
      p_no_branch: false,
      p_method: 'pos',
      p_source: 'repair',
      p_search: 'bisi',
      p_include_void: true,
      p_limit: 50,
      p_offset: 50,
    });
  });

  test('junk values are ignored, not passed to the database', () => {
    const f = parseMoneyInFilters({ branch: "x' or 1=1", method: 'bitcoin', source: 'gift', page: '-4' }, FRIDAY);
    assert.equal(f.branch.branchId, null);
    assert.equal(f.method, null);
    assert.equal(f.source, null);
    assert.equal(f.page, 1);
  });

  test('"No branch" works on Money In but not on the overview', () => {
    assert.equal(parseMoneyInFilters({ branch: 'none' }, FRIDAY).branch.noBranch, true);
    assert.equal(parseOverviewFilters({ branch: 'none' }, FRIDAY).branch.noBranch, false);
  });

  test('query strings keep the filters for links and CSV', () => {
    const f = parseMoneyInFilters({ period: 'today', method: 'cash', page: '3' }, FRIDAY);
    assert.equal(moneyInQuery(f), '?period=today&method=cash&page=3');
    assert.equal(moneyInQuery(f, { page: null }), '?period=today&method=cash');
  });
});

describe('Roles', () => {
  test('who sees Finance', () => {
    for (const role of ['super_admin', 'admin', 'growth_lead', 'sales_analyst']) assert.equal(canViewFinance(role), true, role);
    for (const role of ['front_desk', 'technician', 'operations_lead', 'marketing_manager', 'ambassador', '', null, undefined]) {
      assert.equal(canViewFinance(role), false, String(role));
    }
  });

  test('pages per role', () => {
    assert.deepEqual(financeNavKeys('sales_analyst'), ['overview', 'moneyIn', 'accounts', 'expenses', 'receivables', 'payables', 'payroll', 'budgets', 'reports', 'costs']);
    assert.equal(financeNavKeys('admin').includes('costs'), false, 'real cost is not for Administrators');
    assert.deepEqual(financeNavKeys('front_desk'), ['pettyCash']);
    assert.deepEqual(financeNavKeys('technician'), ['pettyCash']);
    assert.deepEqual(financeNavKeys('marketing_manager'), []);
  });

  test('who can change things', () => {
    assert.equal(canManageFinance('admin'), true);
    assert.equal(canManageFinance('growth_lead'), false);
    assert.equal(isFinanceOwner('super_admin'), true);
    assert.equal(isFinanceOwner('admin'), false);
    assert.equal(canLogPettyCash('front_desk'), true);
    assert.equal(canLogPettyCash('sales_analyst'), false);
    assert.equal(canOpenFinancePage('front_desk', 'expenses'), false);
    assert.equal(canOpenFinancePage('admin', 'pettyCash'), true);
    assert.equal(canOpenFinancePage('growth_lead', 'pettyCash'), false);
  });
});

describe('Formatting', () => {
  test('naira', () => {
    assert.equal(naira(1460000), '₦1,460,000');
    assert.equal(naira(-30000), '−₦30,000');
    assert.equal(naira(null), '₦0');
    assert.equal(naira('85000.4'), '₦85,000');
  });

  test('CSV cells are quoted and safe to open in Excel', () => {
    assert.equal(csvCell('TEST Customer, Bisi'), '"TEST Customer, Bisi"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
    assert.equal(csvCell(null), '');
    assert.equal(csvCell(450000), '450000');
    assert.equal(csvCell(-30000), '-30000', 'negative numbers stay numbers in Excel');
  });
});

describe('Profit and loss table', () => {
  test('adds up revenue, gross and net per column', () => {
    const pnl = buildPnl({
      month: '2026-11-01', payroll_status: null,
      columns: [{ key: 's', name: 'Sango' }, { key: 'company', name: 'Company-wide' }],
      lines: [
        { line: 'sales', label: 'Sales confirmed', values: { s: 1000, company: 100 } },
        { line: 'refunds', label: 'Refunds', values: { s: 50 } },
        { line: 'cogs', label: 'Cost of goods and repair parts', values: { s: 600, company: 80 } },
        { line: 'expense', label: 'Rent', values: { s: 200 } },
        { line: 'expense', label: 'Data & airtime', values: { company: 30 } },
        { line: 'salaries', label: 'Salaries', values: { s: 100, unknown: 5 } },
      ],
    });
    assert.equal(pnl.revenue, 1050);
    assert.equal(pnl.grossProfit, 370);
    assert.equal(pnl.expenses, 230);
    assert.equal(pnl.salaries, 105, 'an unknown branch goes to company-wide');
    assert.equal(pnl.netProfit, 35);
    assert.deepEqual(pnl.byColumn.net, { s: 50, company: -15 });
    assert.equal(pnl.rows.find((r) => r.label === 'Refunds')?.total, -50);
  });
});

function pickRange(period: { from: string; to: string }): [string, string] {
  return [period.from, period.to];
}
