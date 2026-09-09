import { createClient } from '@/lib/supabase-server';
import { decidePublicQuotation } from './actions';

const money = (value: number) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

type QuoteView = {
  quotation_code: string; version: number; customer_name: string | null; items: Array<{ item_name: string; quantity: number; list_price: number; final_unit_price: number; line_discount_amount: number; line_total: number; note: string | null }>;
  subtotal: number; discount_amount: number; total_amount: number; validity_expires_at: string | null; customer_note: string | null; terms: string | null; status: string; decided: boolean;
};

export default async function PublicQuotationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('sales_public_quotation_view', { p_token: token });
  if (error || !data) {
    return <main className="min-h-screen bg-slate-50 px-4 py-14"><div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><h1 className="text-2xl font-black text-slate-900">Quotation unavailable</h1><p className="mt-3 text-sm leading-6 text-slate-500">This quotation link is invalid, expired, or has been replaced by a newer version. Please contact EmmyTech for the current quotation.</p></div></main>;
  }
  const quote = data as QuoteView;
  return <main className="min-h-screen bg-slate-50 px-4 py-10"><div className="mx-auto max-w-3xl space-y-5">
    <section className="rounded-3xl bg-[#032489] p-7 text-white shadow-lg"><div className="text-xs font-black uppercase tracking-[0.16em] text-blue-200">EmmyTech quotation</div><h1 className="mt-2 text-3xl font-black">{quote.quotation_code}</h1><div className="mt-2 text-sm text-blue-100">Version {quote.version} · Prepared for {quote.customer_name || 'Customer'}</div></section>
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="divide-y divide-slate-100">{quote.items.map((item, index) => <div key={`${item.item_name}-${index}`} className="flex items-start justify-between gap-4 py-4 first:pt-0"><div><div className="font-bold text-slate-900">{item.item_name}</div><div className="mt-1 text-xs text-slate-400">Qty {item.quantity}{item.note ? ` · ${item.note}` : ''}</div></div><div className="text-right"><div className="font-black">{money(item.line_total)}</div>{item.line_discount_amount > 0 ? <div className="text-xs text-emerald-600">Discount {money(item.line_discount_amount)}</div> : null}</div></div>)}</div><div className="mt-5 border-t border-slate-200 pt-4"><div className="flex justify-between text-sm text-slate-500"><span>Subtotal</span><span>{money(quote.subtotal)}</span></div><div className="mt-2 flex justify-between text-sm text-slate-500"><span>Discount</span><span>- {money(quote.discount_amount)}</span></div><div className="mt-4 flex justify-between text-xl font-black text-slate-900"><span>Total</span><span>{money(quote.total_amount)}</span></div></div></section>
    {(quote.customer_note || quote.terms) ? <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">{quote.customer_note ? <div><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Note</div><p className="mt-2 text-sm leading-6 text-slate-600">{quote.customer_note}</p></div> : null}{quote.terms ? <div className={quote.customer_note ? 'mt-5' : ''}><div className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">Terms</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{quote.terms}</p></div> : null}</section> : null}
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">{quote.decided || quote.status !== 'published' ? <div className="rounded-2xl bg-slate-100 p-5 text-center"><div className="font-black text-slate-900">Quotation {quote.status}</div><p className="mt-2 text-sm text-slate-500">This version can no longer receive another decision.</p></div> : <><h2 className="text-lg font-black text-slate-900">Your decision</h2><p className="mt-2 text-sm leading-6 text-slate-500">Accepting confirms this exact quotation version. Stock is still subject to availability until EmmyTech converts it to a Sale or Order.</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><form action={decidePublicQuotation}><input type="hidden" name="token" value={token} /><input type="hidden" name="decision" value="accepted" /><button className="w-full rounded-xl bg-emerald-600 px-5 py-3 font-black text-white">Accept quotation</button></form><form action={decidePublicQuotation}><input type="hidden" name="token" value={token} /><input type="hidden" name="decision" value="declined" /><button className="w-full rounded-xl border border-slate-300 bg-white px-5 py-3 font-black text-slate-700">Decline quotation</button></form></div></>}</section>
    {quote.validity_expires_at ? <div className="text-center text-xs text-slate-400">Valid until {new Date(quote.validity_expires_at).toLocaleString('en-NG')}</div> : null}
  </div></main>;
}
