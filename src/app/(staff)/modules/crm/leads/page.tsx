'use client';

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { useCrmData } from '@/components/crm/crm-data-context';
import { CrmSearchBox } from '@/components/crm/crm-search-box';
import { MultiSelectFilter } from '@/components/crm/multi-select-filter';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CRM_STAGES } from '@/lib/crm/domain';
import { cn } from '@/lib/utils';
import type { Lead } from '@/lib/crm/types';

const STAGE_NAMES = CRM_STAGES.map((stage) => stage.name);

function uniqueSorted(values: (string | undefined)[]) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim())))).sort((a, b) => a.localeCompare(b));
}

type LeadFilter = 'all' | 'due' | 'risk' | 'cold' | 'customers';

function followupState(lead: Lead) {
  if (lead.stage >= 6) return 'customer';
  if (lead.coldLead) return 'cold';
  if (lead.atRisk) return 'at_risk';
  return lead.followupState || 'healthy';
}

export default function CrmLeadsPage() {
  const { leads, filteredLeads, loading, dbError, openLead } = useCrmData();
  const [filter, setFilter] = React.useState<LeadFilter>('all');
  const [selectedStages, setSelectedStages] = React.useState<Set<string>>(new Set());
  const [selectedOwners, setSelectedOwners] = React.useState<Set<string>>(new Set());
  const [selectedSources, setSelectedSources] = React.useState<Set<string>>(new Set());

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading CRM identities…</div>;
  if (dbError) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-semibold text-rose-700">Database connection error: {dbError}</div>;

  const ownerOptions = uniqueSorted(leads.map((lead) => lead.owner));
  const sourceOptions = uniqueSorted(leads.map((lead) => lead.source));
  const hasDropdownFilters = selectedStages.size > 0 || selectedOwners.size > 0 || selectedSources.size > 0;

  function clearDropdownFilters() {
    setSelectedStages(new Set());
    setSelectedOwners(new Set());
    setSelectedSources(new Set());
  }

  const counts = {
    all: filteredLeads.length,
    due: filteredLeads.filter((lead) => lead.followupState === 'due').length,
    risk: filteredLeads.filter((lead) => lead.atRisk).length,
    cold: filteredLeads.filter((lead) => lead.coldLead).length,
    customers: filteredLeads.filter((lead) => lead.stage >= 6).length,
  };

  const visibleLeads = filteredLeads.filter((lead) => {
    if (filter === 'due' && lead.followupState !== 'due') return false;
    if (filter === 'risk' && !lead.atRisk) return false;
    if (filter === 'cold' && !lead.coldLead) return false;
    if (filter === 'customers' && lead.stage < 6) return false;
    if (selectedStages.size && !selectedStages.has(lead.stageName)) return false;
    if (selectedOwners.size && !selectedOwners.has(lead.owner)) return false;
    if (selectedSources.size && !selectedSources.has(lead.source)) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-emmy-primary">{filteredLeads.length} records</div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">Leads & Customers</h1>
          <p className="mt-1 max-w-[60ch] text-sm text-slate-500">A clean view of each person, where they are in the journey, and whether human action is required now.</p>
        </div>
        <CrmSearchBox />
      </div>

      <SegmentedControl
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: `All ${counts.all}` },
          { value: 'due', label: `Action due ${counts.due}` },
          { value: 'risk', label: `At risk ${counts.risk}` },
          { value: 'cold', label: `Cold leads ${counts.cold}` },
          { value: 'customers', label: `Customers ${counts.customers}` },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectFilter label="Stage" options={STAGE_NAMES} selected={selectedStages} onChange={setSelectedStages} />
        <MultiSelectFilter label="Owner" options={ownerOptions} selected={selectedOwners} onChange={setSelectedOwners} />
        <MultiSelectFilter label="Source" options={sourceOptions} selected={selectedSources} onChange={setSelectedSources} />
        {hasDropdownFilters && (
          <button type="button" onClick={clearDropdownFilters} className="text-xs font-bold text-red-600 hover:text-red-700">
            Clear filters
          </button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Customer</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Interest</TableHead>
            <TableHead>Last activity</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleLeads.length ? (
            visibleLeads.map((lead) => {
              const dueTask = (lead.tasks ?? []).find((task) => task.status.toLowerCase() === 'open');
              const state = followupState(lead);
              return (
                <TableRow key={lead.id} className="cursor-pointer" onClick={() => openLead(lead)}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-extrabold text-slate-600">
                        {lead.name
                          .split(' ')
                          .map((part) => part[0])
                          .slice(0, 2)
                          .join('')}
                      </span>
                      <span>
                        <div className="font-bold text-slate-950">{lead.name}</div>
                        <div className="text-xs text-slate-500">{lead.phone}</div>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-bold text-slate-950">
                      {lead.stage}. {lead.stageName}
                    </div>
                    <div className="text-xs text-slate-500">{lead.tracking}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-bold text-slate-950">{lead.product}</div>
                    <div className="text-xs text-slate-500">{lead.source}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-bold text-slate-950">{lead.lastAction}</div>
                    <div className="text-xs text-slate-500">{lead.age} ago</div>
                  </TableCell>
                  <TableCell>{lead.owner}</TableCell>
                  <TableCell>
                    {state === 'due' && dueTask ? (
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                        <span>
                          <div className="text-xs font-bold text-slate-950">{dueTask.title}</div>
                          <div className="text-[11px] text-slate-500">
                            {dueTask.due}
                            {dueTask.expires ? ` · ${dueTask.expires}` : ''}
                          </div>
                        </span>
                      </div>
                    ) : state === 'cold' ? (
                      <Badge variant="outline">Cold · {lead.stageAge || 'stalled'}</Badge>
                    ) : state === 'at_risk' ? (
                      <Badge variant="warning">At risk · {lead.stageAge || 'stalled'}</Badge>
                    ) : state === 'customer' ? (
                      <Badge variant="success">Customer</Badge>
                    ) : (
                      <Badge variant="default">Healthy · {lead.stageAge || 'new'}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <ChevronRight className={cn('h-4 w-4 text-slate-400')} />
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-sm text-slate-500">
                No records in this view.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
