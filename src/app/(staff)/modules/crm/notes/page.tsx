'use client';

import { useCrmData } from '@/components/crm/crm-data-context';
import { Card } from '@/components/ui/card';
import type { CrmNote, Lead } from '@/lib/crm/types';

type NoteWithLead = CrmNote & { lead: Lead };

export default function CrmNotesPage() {
  const { leads, loading, dbError, openLead } = useCrmData();

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading CRM identities…</div>;
  if (dbError) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-semibold text-rose-700">Database connection error: {dbError}</div>;

  const notes: NoteWithLead[] = leads.flatMap((lead) => (lead.notes ?? []).map((note) => ({ ...note, lead })));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">Notes</h1>
        <p className="mt-1 max-w-[64ch] text-sm text-slate-500">Human context that automatic tracking cannot capture: objections, preferences, promises and WhatsApp conversation outcomes.</p>
      </div>

      {notes.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <button type="button" key={note.id} onClick={() => openLead(note.lead)} className="text-left">
              <Card className="h-full p-4 hover:border-emmy-primary/30">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {note.lead.name.toUpperCase()} · {note.time}
                </div>
                <h3 className="mt-1 text-sm font-extrabold text-slate-950">{note.author}</h3>
                <p className="mt-1 text-sm text-slate-600">{note.body}</p>
              </Card>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">No notes yet</div>
      )}
    </div>
  );
}
