import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { OperationsShell } from '@/components/operations/operations-shell';
import { ReportingPeriodProvider } from '@/components/reporting/reporting-period-context';

export default async function OperationsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/');

  return (
    <ReportingPeriodProvider>
      <OperationsShell>{children}</OperationsShell>
    </ReportingPeriodProvider>
  );
}
