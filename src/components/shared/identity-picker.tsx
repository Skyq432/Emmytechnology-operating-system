'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { OperationsIdentitySummary } from '@/lib/operations/types';
import { cn } from '@/lib/utils';

export interface IdentityPickerProps {
  /** Fires with the full identity record on select, and with `null` on clear or when the query is edited away from a selection. */
  onSelect?: (identity: OperationsIdentitySummary | null) => void;
  className?: string;

  /**
   * Self-contained mode (default, `true`): renders its own name/phone/email/address
   * inputs (any of which can trigger a search) plus a hidden `identity_id` input, so
   * an uncontrolled `<form action={...}>` submission picks it up with no extra wiring
   * — this is how the Sales module uses it. Pass `false` for controlled mode: renders
   * only a single search box + results dropdown, and the caller owns the query,
   * current selection, and any customer-detail fields — driving everything through
   * `onSelect` — which is how Operations' order/repair creation forms use it (they
   * need the raw identity to derive fields like commission rate).
   */
  renderHiddenFields?: boolean;

  // Self-contained mode
  title?: string;
  compact?: boolean;
  defaultName?: string;
  defaultPhone?: string;
  defaultEmail?: string;
  defaultAddress?: string;

  // Controlled mode
  query?: string;
  onQueryChange?: (value: string) => void;
  placeholder?: string;
  selected?: OperationsIdentitySummary | null;
}

/**
 * Shared customer/CRM-identity search widget. Consolidates what used to be four
 * separate implementations (Sales' own picker plus hand-rolled debounced search in
 * three Operations components) into one place — including the fix for the
 * `react-hooks/set-state-in-effect` violation all of them shared: results are never
 * cleared from inside the effect body, they're derived at render time instead.
 */
export function IdentityPicker({
  onSelect,
  className,
  renderHiddenFields = true,
  title = 'Find customer',
  compact = false,
  defaultName = '',
  defaultPhone = '',
  defaultEmail = '',
  defaultAddress = '',
  query: controlledQuery,
  onQueryChange,
  placeholder = 'Start typing any customer detail...',
  selected: controlledSelected,
}: IdentityPickerProps) {
  type FieldKey = 'code' | 'phone' | 'email' | 'name' | 'address';

  const [internalSelected, setInternalSelected] = useState<OperationsIdentitySummary | null>(null);
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [email, setEmail] = useState(defaultEmail);
  const [address, setAddress] = useState(defaultAddress);
  const [code, setCode] = useState('');
  const [activeField, setActiveField] = useState<FieldKey | null>(null);

  const [results, setResults] = useState<OperationsIdentitySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Scoped to this picker instance — cleared when it unmounts, never persisted, so a
  // stale cache entry can't outlive the create-flow session it was built during.
  const resultCache = useRef(new Map<string, OperationsIdentitySummary[]>());

  const selected = renderHiddenFields ? internalSelected : controlledSelected ?? null;

  const multiFieldQuery = useMemo(() => {
    // Search on whichever field the user is actively typing in, not a fixed
    // precedence order — otherwise once an earlier field (e.g. name) reaches 3
    // characters, editing a later one (e.g. address) never triggers a fresh search.
    const fieldValues: Record<FieldKey, string> = { code, phone, email, name, address };
    const activeValue = activeField ? fieldValues[activeField].trim() : '';
    if (activeValue.length >= 3) return activeValue;
    const values = [code, phone, email, name, address].map((v) => v.trim()).filter((v) => v.length >= 3);
    return values[0] || '';
  }, [activeField, code, phone, email, name, address]);

  const query = renderHiddenFields ? multiFieldQuery : controlledQuery ?? '';

  // Results to actually show — derived, not set imperatively in the effect below,
  // so there's no setState-in-effect on the "too short / already selected" path.
  const effectiveResults = selected || query.length < 3 ? [] : results;

  useEffect(() => {
    if (selected || query.length < 3) return;
    const cached = resultCache.current.get(query);
    if (cached) {
      setResults(cached);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/operations/identities?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.detail || payload?.error || 'Search failed');
        const nextResults = Array.isArray(payload.results) ? payload.results : [];
        // Only cache genuine successes — a transient failure shouldn't poison this
        // query string for the rest of the session.
        resultCache.current.set(query, nextResults);
        if (!cancelled) {
          setResults(nextResults);
          setSearchError(null);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (!cancelled) {
          setResults([]);
          setSearchError(error instanceof Error ? error.message : 'Search failed');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected]);

  function choose(identity: OperationsIdentitySummary) {
    if (renderHiddenFields) {
      setInternalSelected(identity);
      setCode(identity.identity_code || '');
      setName(identity.primary_name || '');
      setPhone(identity.primary_phone || '');
      setEmail(identity.primary_email || '');
      setAddress(identity.primary_address || address);
    }
    onSelect?.(identity);
  }

  function clear() {
    if (renderHiddenFields) {
      setInternalSelected(null);
      setCode('');
      setName('');
      setPhone('');
      setEmail('');
      setAddress('');
      setActiveField(null);
    }
    onSelect?.(null);
  }

  function edit(field: FieldKey, setter: (value: string) => void, value: string) {
    setInternalSelected(null);
    setActiveField(field);
    setter(value);
    if (!renderHiddenFields) onSelect?.(null);
  }

  if (!renderHiddenFields) {
    return (
      <div className={cn('relative', className)}>
        <input
          value={query}
          onChange={(e) => onQueryChange?.(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emmy-primary focus:ring-2 focus:ring-emmy-primary/10"
        />
        {loading && <p className="mt-2 text-xs text-slate-400">Checking EmmyTech identities...</p>}
        {!loading && searchError && <p className="mt-2 text-xs font-bold text-rose-600">Search failed: {searchError}. Try again.</p>}
        {!loading && !searchError && query.length >= 3 && effectiveResults.length === 0 && (
          <p className="mt-2 text-xs text-slate-400">No CRM match yet. A new Identity will be resolved when you save.</p>
        )}
        {effectiveResults.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
            {effectiveResults.map((identity) => (
              <button
                key={identity.id}
                type="button"
                onClick={() => choose(identity)}
                className="flex w-full items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-blue-50"
              >
                <div>
                  <p className="text-sm font-bold text-slate-800">{identity.primary_name || identity.primary_phone || identity.identity_code}</p>
                  <p className="mt-1 text-xs text-slate-500">{identity.primary_phone || 'No phone'} · {identity.primary_email || 'No email'}</p>
                </div>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-emmy-primary">Stage {identity.crm_stage ?? '—'} {identity.crm_stage_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn(compact ? '' : 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm', className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-black text-slate-900">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Start typing any customer detail. Sales checks the CRM Identity system before a new person is created.
          </p>
        </div>
        {selected ? <button type="button" onClick={clear} className="text-xs font-bold text-emmy-primary">Change</button> : null}
      </div>

      {selected ? (
        <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
          <div className="text-sm font-black text-emmy-primary">{selected.primary_name || selected.identity_code}</div>
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
        <input value={code} onChange={(e) => edit('code', setCode, e.target.value)} placeholder="CRM identity code" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <input name="customer_name" value={name} onChange={(e) => edit('name', setName, e.target.value)} placeholder="Customer name" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <input name="customer_phone" value={phone} onChange={(e) => edit('phone', setPhone, e.target.value)} placeholder="Phone" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <input name="customer_email" value={email} onChange={(e) => edit('email', setEmail, e.target.value)} type="email" placeholder="Email" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <input name="customer_address" value={address} onChange={(e) => edit('address', setAddress, e.target.value)} placeholder="Address (supporting CRM signal)" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm md:col-span-2" />
        <input type="hidden" name="identity_id" value={selected?.id || ''} />

        {!selected && (loading || searchError || effectiveResults.length > 0) ? (
          <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
            {loading ? <div className="px-3 py-2 text-xs text-slate-400">Checking CRM identities…</div> : null}
            {!loading && searchError ? <div className="px-3 py-2 text-xs font-bold text-rose-600">Search failed: {searchError}. Try again.</div> : null}
            {effectiveResults.map((identity) => (
              <button key={identity.id} type="button" onClick={() => choose(identity)} className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-slate-50">
                <div className="text-sm font-bold text-slate-900">{identity.primary_name || 'Unnamed customer'}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {[identity.primary_phone, identity.primary_email, identity.identity_code, identity.primary_address].filter(Boolean).join(' · ')}
                </div>
              </button>
            ))}
            {!loading && !searchError && !effectiveResults.length ? <div className="px-3 py-2 text-xs text-slate-400">No CRM match yet. A new Identity will be resolved when you save.</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
