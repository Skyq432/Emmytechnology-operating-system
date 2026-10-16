'use client';

import { useActionState } from 'react';
import {
  runAnalyticsQueryAction,
  type AnalyticsQueryActionState,
} from '@/app/(staff)/modules/sales/analytics-query-actions';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ActionResult } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const initialState: AnalyticsQueryActionState = { success: false, message: '' };

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function SqlConsoleClient() {
  const [state, action, pending] = useActionState(runAnalyticsQueryAction, initialState);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Sales Analytics</p>
        <h1 className="mt-2 text-3xl font-black text-emmy-primary">SQL Console</h1>
        <p className="mt-2 text-sm text-slate-500">
          Write your own SQL and run it directly against the database. Read-only —
          SELECT (or WITH ... SELECT) only, capped at 1,000 rows, 8-second timeout.
        </p>
      </div>

      <Card className="p-5">
        <form action={action} className="space-y-3">
          <Textarea
            name="sql"
            placeholder="select * from ops_orders order by created_at desc limit 20"
            rows={8}
            className="font-mono text-sm"
            spellCheck={false}
          />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>{pending ? 'Running…' : 'Run query'}</Button>
            <ActionResult state={state} />
          </div>
        </form>
      </Card>

      {state.success && state.rows && (
        <Card className="p-5">
          {state.rows.length === 0 ? (
            <p className="text-center text-sm text-slate-400">Query ran successfully — no rows returned.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {state.columns?.map((column) => <TableHead key={column}>{column}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.rows.map((row, index) => (
                    <TableRow key={index}>
                      {state.columns?.map((column) => (
                        <TableCell key={column} className="whitespace-nowrap font-mono text-xs">
                          {formatCell(row[column])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
