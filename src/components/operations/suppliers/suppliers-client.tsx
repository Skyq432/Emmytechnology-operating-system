'use client';

import { useActionState, useState } from 'react';
import { Plus, UsersRound } from 'lucide-react';
import { HelpTip } from '@/components/ui/help-tip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ActionResult } from '@/components/ui/alert';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { createSupplierAction, type SalesActionState } from '@/app/(staff)/modules/operations/sales-actions';
import type { OperationsSupplier } from '@/lib/operations/types';

const initialState: SalesActionState = { success: false, message: '' };

export function SuppliersClient({ suppliers }: { suppliers: OperationsSupplier[] }) {
  const [state, action, pending] = useActionState(createSupplierAction, initialState);
  const [showCreate, setShowCreate] = useState(false);
  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2"><p className="text-xs font-black uppercase tracking-[0.16em] text-emmy-primary">Sourcing</p><HelpTip text="Save suppliers once so stock, serialized devices and future receiving records can point to the same supplier." label="About Suppliers" /></div>
          <h1 className="mt-1.5 text-3xl font-black tracking-[-0.035em]">Suppliers</h1>
          <p className="mt-2 text-sm text-slate-500">People and companies EmmyTech buys products or parts from.</p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)} className="self-start"><Plus className="h-4 w-4" /> {showCreate ? 'Close form' : 'Add supplier'}</Button>
      </div>

      {showCreate && <form action={action} className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Supplier name"><Input name="name" required /></Field>
          <Field label="Phone"><Input name="phone" /></Field>
          <Field label="Email"><Input name="email" type="email" /></Field>
          <Field label="Address"><Input name="address" /></Field>
          <div className="md:col-span-2 xl:col-span-4"><Field label="Notes"><Textarea name="notes" className="min-h-20" /></Field></div>
        </div>
        <ActionResult state={state} className="mt-3" />
        <Button type="submit" disabled={pending} className="mt-4">{pending ? 'Saving...' : 'Save supplier'}</Button>
      </form>}

      {suppliers.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center shadow-sm">
          <UsersRound className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-bold text-slate-700">No suppliers yet</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow><TableHead>Supplier</TableHead><TableHead>Phone</TableHead><TableHead>Email</TableHead><TableHead>Address</TableHead><TableHead>Notes</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-black text-slate-900">{s.name}</TableCell>
                <TableCell className="text-slate-600">{s.phone || '—'}</TableCell>
                <TableCell className="text-slate-600">{s.email || '—'}</TableCell>
                <TableCell className="text-slate-600">{s.address || '—'}</TableCell>
                <TableCell className="text-slate-500">{s.notes || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
