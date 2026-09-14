import type { ComponentType } from 'react';
import { requireInternalUser } from '@/lib/auth/server';
import type { InternalRole } from '@/lib/auth/roles';
import { FrontDeskHome } from '@/components/os/home/front-desk-home';
import { TechnicianHome } from '@/components/os/home/technician-home';
import { OperationsLeadHome } from '@/components/os/home/operations-lead-home';
import { SalesAnalystHome } from '@/components/os/home/sales-analyst-home';
import { GrowthLeadHome } from '@/components/os/home/growth-lead-home';
import { MarketingManagerHome } from '@/components/os/home/marketing-manager-home';
import { AdminHome } from '@/components/os/home/admin-home';
import { SuperAdminHome } from '@/components/os/home/super-admin-home';

interface HomeProps {
  role: InternalRole;
  name: string;
}

// Each role gets its own dedicated home component, matched to how that role
// actually works rather than one dashboard with items subtracted.
const HOME_BY_ROLE: Record<InternalRole, ComponentType<HomeProps>> = {
  front_desk: FrontDeskHome,
  technician: TechnicianHome,
  operations_lead: OperationsLeadHome,
  sales_analyst: SalesAnalystHome,
  growth_lead: GrowthLeadHome,
  marketing_manager: MarketingManagerHome,
  admin: AdminHome,
  super_admin: SuperAdminHome,
};

export default async function Home() {
  const { user, profile, role } = await requireInternalUser();
  const Home = HOME_BY_ROLE[role];
  return <Home role={role} name={profile.name || user.email || 'EmmyTech Staff'} />;
}
