import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { ReportingPeriodProvider } from '@/components/reporting/reporting-period-context';
import { SalesShell } from '@/components/sales/sales-shell';

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/');

  return (
    <ReportingPeriodProvider>
      <SalesShell>{children}</SalesShell>
    </ReportingPeriodProvider>
  );
}
