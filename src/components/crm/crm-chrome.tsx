'use client';

import { useCrmData } from '@/components/crm/crm-data-context';
import { LeadDetailDrawer } from '@/components/crm/lead-detail-drawer';
import { Alert } from '@/components/ui/alert';

/**
 * Renders whichever CRM route is active plus the two pieces of chrome that must persist
 * across all of them: the action-result toast and the lead detail drawer (opened from any
 * view, so it can't live inside a single page component the way it used to).
 */
export function CrmChrome({ children }: { children: React.ReactNode }) {
  const { actionFeedback, selectedLead, closeLead, moveLead, addNote, recordTaskOutcome } = useCrmData();

  return (
    <>
      {children}
      {actionFeedback && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm">
          <Alert variant="info" className="shadow-lg">
            {actionFeedback}
          </Alert>
        </div>
      )}
      {selectedLead && (
        <LeadDetailDrawer
          lead={selectedLead}
          onClose={closeLead}
          onMoveStage={moveLead}
          onAddNote={addNote}
          onTaskOutcome={recordTaskOutcome}
        />
      )}
    </>
  );
}
