import Link from 'next/link';
import { getUnifiedSalesCustomers } from '@/lib/sales/unified-report-server';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export default async function SalesCustomersPage() {
  const customers = await getUnifiedSalesCustomers();
  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">CRM Identity commercial view</p><h1 className="mt-2 text-3xl font-black text-emmy-primary">Customers</h1><p className="mt-2 text-sm text-slate-500">One Identity connects quotations, Orders, Direct Sales, payments, receipts and Repair revenue. Detailed relationship history stays in CRM.</p></div>
      <Table>
        <TableHeader>
          <TableRow><TableHead>Customer</TableHead><TableHead>Contact</TableHead><TableHead className="text-right">Sales Value</TableHead><TableHead className="text-right">Cash</TableHead><TableHead className="text-right">Outstanding</TableHead><TableHead className="text-right">Repairs</TableHead><TableHead>Quotes</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer) => (
            <TableRow key={customer.id}>
              <TableCell><div className="font-bold text-slate-900">{customer.primary_name || 'Unnamed customer'}</div><div className="text-xs text-slate-400">{customer.identity_code}</div></TableCell>
              <TableCell className="text-slate-500">{customer.primary_phone || customer.primary_email || '—'}</TableCell>
              <TableCell className="text-right font-black">{money(customer.salesValue)}</TableCell>
              <TableCell className="text-right">{money(customer.cashCollected)}</TableCell>
              <TableCell className="text-right">{money(customer.outstanding)}</TableCell>
              <TableCell className="text-right">{customer.repairTransactions}</TableCell>
              <TableCell><Badge variant="outline">{customer.acceptedQuotations}/{customer.quotations} accepted</Badge></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!customers.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">No customer commercial activity yet.</div> : null}
      <div className="text-xs text-slate-400">Open full customer relationship details from CRM when needed. <Link href="/modules/crm" className="font-bold text-emmy-primary">Go to CRM</Link></div>
    </div>
  );
}
