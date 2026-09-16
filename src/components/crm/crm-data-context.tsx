'use client';

import * as React from 'react';
import { friendlyActionError } from '@/lib/crm/domain';
import type { CrmTask, Lead } from '@/lib/crm/types';
import { useReportingPeriod } from '@/components/reporting/reporting-period-context';

interface CrmDataValue {
  /** All fetched identities narrowed to the selected reporting period (by last activity). */
  leads: Lead[];
  /** `leads` narrowed further by `query` — what Leads, Funnel and Contacts render. */
  filteredLeads: Lead[];
  query: string;
  setQuery: (query: string) => void;
  loading: boolean;
  dbError: string | null;
  actionFeedback: string | null;
  selectedLead: Lead | null;
  openLead: (lead: Lead) => void;
  closeLead: () => void;
  moveLead: (lead: Lead, toStage: number) => Promise<void>;
  addNote: (lead: Lead, note: string) => Promise<void>;
  recordOutcome: (lead: Lead, outcome: string) => Promise<void>;
  recordTaskOutcome: (lead: Lead, task: CrmTask, outcome: string) => Promise<void>;
}

const CrmDataContext = React.createContext<CrmDataValue | null>(null);

/**
 * Fetches CRM identities once at the module layout level and shares them (plus the
 * mutation actions) with every CRM route via context — replaces the single
 * CrmWorkspace component's local state now that each view is its own page.
 */
export function CrmDataProvider({ children }: { children: React.ReactNode }) {
  const { range } = useReportingPeriod();
  const [allLeads, setAllLeads] = React.useState<Lead[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dbError, setDbError] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);
  const [actionFeedback, setActionFeedback] = React.useState<string | null>(null);
  const [selectedLead, setSelectedLead] = React.useState<Lead | null>(null);
  const [query, setQuery] = React.useState('');

  React.useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        const response = await fetch('/api/crm/identities', { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || payload.error || 'CRM database request failed');
        if (active) {
          const nextLeads: Lead[] = payload.leads ?? [];
          setAllLeads(nextLeads);
          setSelectedLead((current) => (current ? (nextLeads.find((lead) => lead.id === current.id) ?? current) : null));
          setDbError(null);
        }
      } catch (error) {
        if (active) setDbError(error instanceof Error ? error.message : 'Unable to load CRM database');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [reloadToken]);

  // "In period" means the person had some activity (a spin, click, note, stage move —
  // whatever last touched lastActivityAtIso) inside the selected window.
  const leads = React.useMemo(
    () => allLeads.filter((lead) => lead.lastActivityAtIso >= range.startIso && lead.lastActivityAtIso < range.endExclusiveIso),
    [allLeads, range.startIso, range.endExclusiveIso]
  );

  const performAction = React.useCallback(async (payload: Record<string, unknown>) => {
    const response = await fetch('/api/crm/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, actor: 'Administrator' }),
    });
    const result = await response.json();
    if (!response.ok) {
      const rawMessage = result.detail || result.error || 'CRM action failed';
      const message = friendlyActionError(rawMessage);
      console.error('CRM action failed:', rawMessage);
      setActionFeedback(message);
      window.setTimeout(() => setActionFeedback(null), 3200);
      return { ok: false, message };
    }
    setActionFeedback(result.message || 'Saved');
    setReloadToken((value) => value + 1);
    window.setTimeout(() => setActionFeedback(null), 2600);
    return result;
  }, []);

  const moveLead = React.useCallback(
    async (lead: Lead, toStage: number) => {
      if (toStage === lead.stage) return;
      await performAction({ action: 'move_stage', identityId: lead.id, fromStage: lead.stage, toStage });
    },
    [performAction]
  );

  const addNote = React.useCallback(
    async (lead: Lead, note: string) => {
      await performAction({ action: 'add_note', identityId: lead.id, note });
    },
    [performAction]
  );

  const recordOutcome = React.useCallback(
    async (lead: Lead, outcome: string) => {
      await performAction({ action: 'whatsapp_outcome', identityId: lead.id, fromStage: lead.stage, outcome });
    },
    [performAction]
  );

  const recordTaskOutcome = React.useCallback(
    async (lead: Lead, task: CrmTask, outcome: string) => {
      await performAction({ action: 'task_outcome', identityId: lead.id, taskId: task.id, outcome });
    },
    [performAction]
  );

  const filteredLeads = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((lead) =>
      [lead.name, lead.phone, lead.product, lead.source, lead.stageName, lead.owner, lead.referrerName, lead.originalAmbassadorName].join(' ').toLowerCase().includes(q)
    );
  }, [leads, query]);

  const value = React.useMemo<CrmDataValue>(
    () => ({
      leads,
      filteredLeads,
      query,
      setQuery,
      loading,
      dbError,
      actionFeedback,
      selectedLead,
      openLead: setSelectedLead,
      closeLead: () => setSelectedLead(null),
      moveLead,
      addNote,
      recordOutcome,
      recordTaskOutcome,
    }),
    [leads, filteredLeads, query, loading, dbError, actionFeedback, selectedLead, moveLead, addNote, recordOutcome, recordTaskOutcome]
  );

  return <CrmDataContext.Provider value={value}>{children}</CrmDataContext.Provider>;
}

export function useCrmData() {
  const context = React.useContext(CrmDataContext);
  if (!context) throw new Error('useCrmData must be used within CrmDataProvider');
  return context;
}
