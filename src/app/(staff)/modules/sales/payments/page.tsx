import { getSalesPayments } from '@/lib/sales/read-server';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export default async function SalesPaymentsPage() {
  const payments = await getSalesPayments();
  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Canonical payment projection</p><h1 className="mt-2 text-3xl font-black text-emmy-primary">Payments</h1><p className="mt-2 text-sm text-slate-500">Order and Repair payments are shown together without copying them into a second mutable ledger.</p></div>
      <Table>
        <TableHeader>
          <TableRow><TableHead>Date</TableHead><TableHead>Source</TableHead><TableHead>Reference</TableHead><TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>State</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((payment) => (
            <TableRow key={`${payment.source_type}-${payment.source_payment_id}`}>
              <TableCell className="text-slate-500">{new Date(payment.paid_at).toLocaleString('en-NG')}</TableCell>
              <TableCell className="font-bold text-slate-800">{payment.source_type === 'repair' ? 'Repair' : 'Order / Sale'}</TableCell>
              <TableCell>{payment.source_code}</TableCell>
              <TableCell className="capitalize">{String(payment.payment_method).replaceAll('_',' ')}</TableCell>
              <TableCell className="text-right font-black">{money(payment.amount)}</TableCell>
              <TableCell><Badge variant={payment.is_void ? 'danger' : 'success'}>{payment.is_void ? 'Void' : 'Received'}</Badge></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!payments.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">No payments recorded yet.</div> : null}
    </div>
  );
}
