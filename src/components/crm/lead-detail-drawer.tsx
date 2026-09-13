'use client';

import * as React from 'react';
import { Mail, MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CRM_STAGES, identityActivities, identityProfile, initialsFor, whatsappHref } from '@/lib/crm/domain';
import type { CrmTask, Lead } from '@/lib/crm/types';
import { TrackingBadge } from '@/components/crm/tracking-badge';

function IdentityFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-surface-muted px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-sm font-bold text-slate-950">{value}</div>
    </div>
  );
}

const TONE_DOT: Record<string, string> = {
  blue: 'bg-emmy-primary',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  slate: 'bg-slate-400',
};

export function LeadDetailDrawer({
  lead,
  onClose,
  onMoveStage,
  onAddNote,
  onTaskOutcome,
}: {
  lead: Lead;
  onClose: () => void;
  onMoveStage: (lead: Lead, stage: number) => Promise<void>;
  onAddNote: (lead: Lead, note: string) => Promise<void>;
  onTaskOutcome: (lead: Lead, task: CrmTask, outcome: string) => Promise<void>;
}) {
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [noteText, setNoteText] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);

  const stage = CRM_STAGES.find((item) => item.id === lead.stage);
  const initials = initialsFor(lead.name);
  const profile = identityProfile(lead);
  const activities = identityActivities(lead);
  const isBlindSpot = lead.stage >= 5;
  const waHref = whatsappHref(lead);

  async function move(stageId: number) {
    if (stageId === lead.stage) return;
    try {
      setSaving(true);
      setLocalError(null);
      await onMoveStage(lead, stageId);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Unable to move stage');
    } finally {
      setSaving(false);
    }
  }

  async function saveNote() {
    const note = noteText.trim();
    if (!note) return;
    try {
      setSaving(true);
      setLocalError(null);
      await onAddNote(lead, note);
      setNoteText('');
      setNoteOpen(false);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Unable to save note');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={`${lead.name} identity details`}>
      <button type="button" className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" aria-label="Close identity details" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex h-full w-full max-w-[560px] flex-col bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emmy-primary text-sm font-extrabold text-white">{initials}</div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Merged customer identity · {lead.identityCode ?? lead.id.slice(0, 8).toUpperCase()}
              </div>
              <h2 className="truncate text-lg font-extrabold text-slate-950">{lead.name}</h2>
              <p className="truncate text-sm text-slate-500">
                {lead.phone} · {profile.email}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100">
            <X className="h-[19px] w-[19px]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {localError && <div className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{localError}</div>}

          <section className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-surface-muted p-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Identity status</div>
              <div className="mt-1 text-sm font-extrabold text-slate-950">{profile.sources.length} records merged into one person</div>
              <p className="mt-0.5 text-xs text-slate-500">
                {profile.mergeConfidence} · Last seen {profile.lastSeen}
              </p>
            </div>
            <div className="shrink-0 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Stage</div>
              <div className="font-[family-name:var(--font-mono)] text-2xl font-extrabold text-emmy-primary">{lead.stage}</div>
              <div className="text-xs text-slate-500">{lead.stageName}</div>
            </div>
          </section>

          <section className="mt-5 grid grid-cols-2 gap-2">
            <IdentityFact label="Phone" value={lead.phone} />
            <IdentityFact label="Email" value={profile.email} />
            <IdentityFact label="Location" value={profile.location} />
            <IdentityFact label="First seen" value={profile.firstSeen} />
            <IdentityFact label="Owner" value={lead.owner} />
            <IdentityFact label="Source" value={lead.source} />
            <IdentityFact label="Referred by" value={lead.referrerName || '—'} />
            <IdentityFact label="Referral generation" value={lead.generation ? `Generation ${lead.generation}` : '—'} />
            <IdentityFact label="Original ambassador" value={lead.originalAmbassadorName || '—'} />
            <IdentityFact label="Follow-up status" value={lead.coolingStatus || 'Contact allowed'} />
            <IdentityFact label="Lead health" value={lead.stage >= 6 ? 'Customer' : lead.coldLead ? 'Cold' : lead.atRisk ? 'At risk' : 'Healthy'} />
            <IdentityFact label="Time in stage" value={lead.stageAge || '—'} />
            <IdentityFact label="Expected progress" value={lead.expectedProgress ? `Within ${lead.expectedProgress}` : '—'} />
            <IdentityFact label="Cold threshold" value={lead.coldAfter ? `After ${lead.coldAfter}` : '—'} />
            <IdentityFact label="Last human contact" value={lead.lastHumanContact ? `${lead.lastHumanContact} ago` : 'No recorded contact'} />
          </section>

          <section className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4">
            <div>
              <div className="text-xs font-bold text-slate-500">Current journey stage</div>
              <div className="mt-0.5 text-sm font-extrabold text-slate-950">
                {lead.stage}. {lead.stageName}
              </div>
              <div className="text-xs text-slate-500">{stage?.short}</div>
            </div>
            <TrackingBadge type={lead.tracking} />
          </section>

          <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4">
            <div>
              <div className="text-sm font-extrabold text-slate-950">Move lead</div>
              <div className="text-xs text-slate-500">Manual change is saved to stage history.</div>
            </div>
            <select
              value={lead.stage}
              disabled={saving}
              onChange={(event) => void move(Number(event.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800"
            >
              {CRM_STAGES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id}. {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex gap-1">
            {CRM_STAGES.map((item) => (
              <button
                type="button"
                disabled={saving}
                onClick={() => void move(item.id)}
                key={item.id}
                title={`Move to ${item.id}. ${item.name}`}
                className={cn(
                  'h-7 flex-1 rounded-md text-[10px] font-extrabold transition-colors disabled:opacity-50',
                  item.id < lead.stage ? 'bg-emerald-100 text-emerald-700' : item.id === lead.stage ? 'bg-emmy-primary text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                )}
              >
                {item.id}
              </button>
            ))}
          </div>

          <section
            className={cn(
              'mt-5 flex items-start gap-3 rounded-2xl border p-4',
              lead.coldLead ? 'border-slate-300 bg-slate-50' : lead.atRisk ? 'border-amber-200 bg-amber-50' : 'border-slate-200'
            )}
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-slate-500 shadow-sm">
              <MessageCircle className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {lead.coldLead ? 'Cold lead' : lead.atRisk ? 'At risk' : lead.nextTaskDue ? 'Action due' : 'Follow-up status'}
              </div>
              <div className="mt-0.5 text-sm font-extrabold text-slate-950">{lead.nextAction}</div>
              <p className="mt-0.5 text-xs text-slate-500">
                {lead.nextTaskDue ? `${lead.nextTaskDue} · ` : ''}
                {lead.priority} priority · Owner: {lead.owner}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {lead.coolingStatus || 'Contact allowed'} · {lead.contactAttempts ?? 0} contact attempt(s)
              </p>
              {lead.coldReason && <p className="mt-1 text-xs italic text-slate-500">{lead.coldReason}</p>}
            </div>
          </section>

          {isBlindSpot && (
            <section className="mt-4 flex items-start gap-3 rounded-2xl bg-amber-50 p-4">
              <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div>
                <div className="text-sm font-extrabold text-amber-900">Manual visibility boundary</div>
                <p className="mt-0.5 text-xs text-amber-800">WhatsApp activity after the handoff is not automatically visible. Staff must record the outcome here.</p>
              </div>
            </section>
          )}

          <section className="mt-6">
            <div className="mb-2">
              <h3 className="text-sm font-extrabold text-slate-950">Follow-up tasks</h3>
              <p className="text-xs text-slate-500">Tasks appear only when the follow-up window is due. Progress cancels stale tasks automatically.</p>
            </div>
            <div className="flex flex-col gap-2">
              {lead.tasks?.length ? (
                lead.tasks.map((task) => (
                  <div key={task.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="text-sm font-bold text-slate-950">{task.title}</div>
                    <div className="text-xs text-slate-500">
                      {task.due}
                      {task.expires ? ` · ${task.expires}` : ''} · {task.owner}
                    </div>
                    {task.description && <p className="mt-1 text-xs text-slate-500">{task.description}</p>}
                    {task.status === 'open' ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => void onTaskOutcome(lead, task, 'Contacted')}>
                          Contacted
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void onTaskOutcome(lead, task, 'No response')}>
                          No response
                        </Button>
                        <Button size="sm" onClick={() => void onTaskOutcome(lead, task, 'Completed')}>
                          Done
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-2 text-xs font-bold text-slate-500">{task.outcome || task.status}</div>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">No follow-up task is due yet.</div>
              )}
            </div>
          </section>

          <section className="mt-6">
            <div className="mb-2">
              <h3 className="text-sm font-extrabold text-slate-950">Activity history</h3>
              <p className="text-xs text-slate-500">What this identity has been doing across the funnel.</p>
            </div>
            <div className="flex flex-col gap-3">
              {activities.map((activity, index) => (
                <div key={`${activity.title}-${index}`} className="flex items-start gap-3">
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE_DOT[activity.tone])} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-sm text-slate-950">{activity.title}</strong>
                      <time className="shrink-0 text-xs text-slate-400">{activity.time}</time>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{activity.detail}</p>
                  </div>
                  <TrackingBadge type={activity.tracking} />
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6">
            <div className="mb-2">
              <h3 className="text-sm font-extrabold text-slate-950">Notes</h3>
              <p className="text-xs text-slate-500">Sales context added by staff.</p>
            </div>
            <div className="flex flex-col gap-2">
              {lead.notes?.length ? (
                lead.notes.map((note) => (
                  <div key={note.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-sm text-slate-950">{note.author}</strong>
                      <span className="text-xs text-slate-400">{note.time}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{note.body}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">No notes yet</div>
              )}
            </div>
          </section>

          <section className="mt-6">
            <div className="mb-2">
              <h3 className="text-sm font-extrabold text-slate-950">Commercial context</h3>
              <p className="text-xs text-slate-500">What sales needs before taking the next action.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <IdentityFact label="Product interest" value={lead.product} />
              <IdentityFact label="Voucher balance" value={lead.voucher} />
              <IdentityFact label="Cart value" value={lead.cartValue} />
              <IdentityFact label="Last known action" value={lead.lastAction} />
              {lead.blocker && <IdentityFact label="Current blocker" value={lead.blocker} />}
              {lead.whatsappStatus && <IdentityFact label="WhatsApp status" value={lead.whatsappStatus} />}
            </div>
          </section>

          {noteOpen && (
            <div className="mt-6 rounded-2xl border border-slate-200 p-4">
              <label htmlFor="crm-note" className="text-xs font-bold text-slate-600">
                Add note
              </label>
              <textarea
                id="crm-note"
                autoFocus
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                placeholder="Add objection, promise, preference or WhatsApp context…"
                rows={3}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setNoteOpen(false);
                    setNoteText('');
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" disabled={saving || !noteText.trim()} onClick={() => void saveNote()}>
                  {saving ? 'Saving…' : 'Save note'}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-slate-200 px-6 py-4">
          <Button
            className="flex-1"
            disabled={!waHref}
            onClick={() => {
              if (waHref) window.open(waHref, '_blank', 'noopener,noreferrer');
            }}
          >
            <MessageCircle className="mr-1.5 h-4 w-4" /> Open WhatsApp
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setNoteOpen((value) => !value)}>
            <Mail className="mr-1.5 h-4 w-4" /> Add note
          </Button>
        </div>
      </aside>
    </div>
  );
}
