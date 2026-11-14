'use client';
// [MERGE] Shown if a Finance page fails to load.
import { Card } from '@/components/ui/card';

export default function FinanceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const notAuthorized = /not authorized/i.test(error.message);
  return (
    <Card className="max-w-xl p-8">
      <h1 className="text-xl font-extrabold text-slate-950">{notAuthorized ? 'No access to Finance' : 'Finance could not load'}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        {notAuthorized
          ? 'Your role does not include Finance. Ask an administrator if you need it.'
          : 'Something went wrong while loading the figures. Try again, and if it keeps happening, send a screenshot to the admin.'}
      </p>
      {!notAuthorized ? (
        <button type="button" onClick={reset} className="mt-5 h-10 rounded-xl bg-emmy-primary px-5 text-sm font-semibold text-white">
          Try again
        </button>
      ) : null}
    </Card>
  );
}
