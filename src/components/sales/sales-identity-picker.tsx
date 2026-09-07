'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type IdentityResult = {
  id: string;
  identity_code: string;
  primary_name: string | null;
  primary_phone: string | null;
  primary_email: string | null;
  primary_address?: string | null;
  crm_stage_name?: string;
  ambassador_name?: string | null;
  acquisition_source?: string | null;
  cash_off_balance?: number;
};

type Props = {
  title?: string;
  compact?: boolean;
  defaultName?: string;
  defaultPhone?: string;
  defaultEmail?: string;
  defaultAddress?: string;
};

export function SalesIdentityPicker({
  title = 'Find customer',
  compact = false,
  defaultName = '',
  defaultPhone = '',
  defaultEmail = '',
  defaultAddress = '',
}: Props) {
  const [selected, setSelected] = useState<IdentityResult | null>(null);
  const [results, setResults] = useState<IdentityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [email, setEmail] = useState(defaultEmail);
  const [address, setAddress] = useState(defaultAddress);
  const [code, setCode] = useState('');
  const latestQuery = useRef('');

  const query = useMemo(() => {
    const values = [code, phone, email, name, address].map((v) => v.trim()).filter((v) => v.length >= 3);
    return values[0] || '';
  }, [code, phone, email, name, address]);

  useEffect(() => {
    if (selected || query.length < 3) {
      setResults([]);
      return;
    }
    latestQuery.current = query;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/operations/identities?q=${encodeURIComponent(query)}`);
        const payload = await response.json();
        if (latestQuery.current === query) setResults(Array.isArray(payload.results) ? payload.results : []);
      } catch {
        if (latestQuery.current === query) setResults([]);
      } finally {
        if (latestQuery.current === query) setLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, selected]);

  function choose(identity: IdentityResult) {
    setSelected(identity);
    setCode(identity.identity_code || '');
    setName(identity.primary_name || '');
    setPhone(identity.primary_phone || '');
    setEmail(identity.primary_email || '');
    setAddress(identity.primary_address || address);
    setResults([]);
  }

  function clear() {
    setSelected(null);
    setCode('');
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
  }

  function edit(setter: (value: string) => void, value: string) {
    setSelected(null);
    setter(value);
  }

  return (
    <div className={compact ? '' : 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-black text-slate-900">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Start typing any customer detail. Sales checks the CRM Identity system before a new person is created.
          </p>
        </div>
        {selected ? <button type="button" onClick={clear} className="text-xs font-bold text-[#032489]">Change</button> : null}
      </div>

      {selected ? (
        <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
          <div className="text-sm font-black text-[#032489]">{selected.primary_name || selected.identity_code}</div>
          <div className="mt-1 text-xs text-slate-600">
            {[selected.primary_phone, selected.primary_email, selected.identity_code].filter(Boolean).join(' · ')}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
            {selected.crm_stage_name ? <span className="rounded-full bg-white px-2 py-1">{selected.crm_stage_name}</span> : null}
            {selected.acquisition_source ? <span className="rounded-full bg-white px-2 py-1">{selected.acquisition_source}</span> : null}
            {selected.ambassador_name ? <span className="rounded-full bg-white px-2 py-1">Ambassador: {selected.ambassador_name}</span> : null}
            {Number(selected.cash_off_balance || 0) > 0 ? <span className="rounded-full bg-emerald-100 px-2 py-1 font-bold text-emerald-700">Cash-Off ₦{Number(selected.cash_off_balance).toLocaleString('en-NG')}</span> : null}
          </div>
        </div>
      ) : null}

      <div className="relative mt-4 grid gap-3 md:grid-cols-2">
        <input value={code} onChange={(e) => edit(setCode, e.target.value)} placeholder="CRM identity code" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <input name="customer_name" value={name} onChange={(e) => edit(setName, e.target.value)} placeholder="Customer name" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <input name="customer_phone" value={phone} onChange={(e) => edit(setPhone, e.target.value)} placeholder="Phone" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <input name="customer_email" value={email} onChange={(e) => edit(setEmail, e.target.value)} type="email" placeholder="Email" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <input name="customer_address" value={address} onChange={(e) => edit(setAddress, e.target.value)} placeholder="Address (supporting CRM signal)" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm md:col-span-2" />
        <input type="hidden" name="identity_id" value={selected?.id || ''} />

        {!selected && (loading || results.length > 0) ? (
          <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
            {loading ? <div className="px-3 py-2 text-xs text-slate-400">Checking CRM identities…</div> : null}
            {results.map((identity) => (
              <button key={identity.id} type="button" onClick={() => choose(identity)} className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-slate-50">
                <div className="text-sm font-bold text-slate-900">{identity.primary_name || 'Unnamed customer'}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {[identity.primary_phone, identity.primary_email, identity.identity_code, identity.primary_address].filter(Boolean).join(' · ')}
                </div>
              </button>
            ))}
            {!loading && !results.length ? <div className="px-3 py-2 text-xs text-slate-400">No CRM match yet. A new Identity will be resolved when you save.</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
