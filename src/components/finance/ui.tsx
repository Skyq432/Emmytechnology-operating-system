// [MERGE] Small shared pieces for Finance pages (server-safe, no client JS).
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { first, type SearchParams } from '@/lib/finance/filters';
import { financeFieldClass, financeLabelClass } from './styles';

export function PageHead({ title, sub, right }: { title: string; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Finance</p>
        <h1 className="mt-2 text-3xl font-black text-emmy-primary">{title}</h1>
        {sub ? <p className="mt-2 text-sm text-slate-500">{sub}</p> : null}
      </div>
      {right}
    </div>
  );
}

/** Shows the ?ok= / ?error= message left by a form. */
export function Notice({ params }: { params: SearchParams }) {
  const ok = first(params.ok);
  const error = first(params.error);
  if (!ok && !error) return null;
  return (
    <div role={error ? 'alert' : 'status'} className={error ? 'rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700' : 'rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700'}>
      {error ?? ok}
    </div>
  );
}

export function Note({ tone = 'blue', children }: { tone?: 'blue' | 'amber' | 'violet'; children: React.ReactNode }) {
  const cls = { blue: 'bg-blue-50 text-blue-900', amber: 'bg-amber-50 text-amber-900', violet: 'bg-violet-50 text-violet-900' }[tone];
  return <div className={`rounded-xl px-3 py-2 text-xs leading-5 ${cls}`}>{children}</div>;
}

export function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="mt-2 text-base font-extrabold text-slate-950">{title}</h2>
      {sub ? <p className="text-sm text-slate-500">{sub}</p> : null}
      {children}
    </section>
  );
}

export function FormCard({ title, hint, action, back, children, submit }: {
  title: string; hint?: string; action: (fd: FormData) => Promise<void>; back: string; children: React.ReactNode; submit: string;
}) {
  return (
    <Card className="p-5">
      <form action={action} className="grid content-start gap-3">
        <input type="hidden" name="_back" value={back} />
        <div>
          <h2 className="text-sm font-extrabold text-slate-950">{title}</h2>
          {hint ? <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p> : null}
        </div>
        {children}
        <button type="submit" className="h-10 rounded-xl bg-emmy-primary px-5 text-sm font-semibold text-white shadow-sm hover:bg-emmy-primary-light">{submit}</button>
      </form>
    </Card>
  );
}

export function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`${financeLabelClass} ${className}`}>{label}{children}</label>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${financeFieldClass} w-full ${props.className ?? ''}`} />;
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${financeFieldClass} w-full ${props.className ?? ''}`}>{children}</select>;
}

export function Two({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

export function Forms({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

/** A one-button form (approve, archive, tick…). */
export function ActionButton({ action, back, fields, label, tone = 'ghost' }: {
  action: (fd: FormData) => Promise<void>; back: string; fields: Record<string, string>; label: string; tone?: 'ghost' | 'green' | 'red' | 'primary';
}) {
  const cls = {
    ghost: 'border border-slate-200 bg-white text-slate-700 hover:text-emmy-primary',
    green: 'bg-emerald-600 text-white hover:bg-emerald-700',
    red: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
    primary: 'bg-emmy-primary text-white hover:bg-emmy-primary-light',
  }[tone];
  return (
    <form action={action} className="inline">
      <input type="hidden" name="_back" value={back} />
      {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <button type="submit" className={`h-8 whitespace-nowrap rounded-lg px-3 text-xs font-bold ${cls}`}>{label}</button>
    </form>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, [string, 'success' | 'warning' | 'danger' | 'default' | 'outline']> = {
    approved: ['Approved', 'success'], pending: ['Waiting', 'warning'], rejected: ['Rejected', 'danger'],
    paid: ['Paid', 'success'], overdue: ['Overdue', 'danger'], part_paid: ['Part paid', 'warning'], unpaid: ['Not due yet', 'default'],
    draft: ['Draft', 'warning'], ok: ['On track', 'success'], warn: ['Nearly used', 'warning'], over: ['Over budget', 'danger'],
  };
  const [label, variant] = map[status] ?? [status, 'outline'];
  return <Badge variant={variant}>{label}</Badge>;
}

/** Current page path + filters, so forms can come back to the same view. */
export function backPath(base: string, params: SearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === 'ok' || key === 'error' || value === undefined) continue;
    const v = Array.isArray(value) ? value[0] : value;
    if (v) query.set(key, v);
  }
  const text = query.toString();
  return text ? `${base}?${text}` : base;
}

export const ACCOUNT_TYPE_LABELS: Record<string, string> = { bank: 'Bank account', mobile: 'Mobile money', pos: 'POS terminal', cash: 'Cash drawer' };
