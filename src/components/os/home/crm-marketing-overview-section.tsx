import { AlertTriangle, MessageCircle, TrendingUp, Users } from 'lucide-react';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import type { getMarketingOverview } from '@/lib/os/home-server';

type MarketingOverview = Awaited<ReturnType<typeof getMarketingOverview>>;

/** Shared CRM/marketing KPI block used by both growth-lead-home and marketing-manager-home. */
export function CrmMarketingOverviewSection({ data }: { data: MarketingOverview }) {
  return (
    <StatGrid>
      <StatTile label="Active Ambassadors" value={data.activeAmbassadors} icon={<Users className="h-[15px] w-[15px]" />} tone="primary" />
      <StatTile label="Leads" value={data.totalLeads} icon={<MessageCircle className="h-[15px] w-[15px]" />} tone="secondary" />
      <StatTile label="Conversions" value={data.totalConversions} icon={<TrendingUp className="h-[15px] w-[15px]" />} tone="success" />
      <StatTile label="Needs Review" value={data.needsReview} icon={<AlertTriangle className="h-[15px] w-[15px]" />} tone="danger" />
    </StatGrid>
  );
}
