import { MessageCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { PRIMARY_MODULE_NAV } from '@/lib/os/navigation';
import { MODULE_SLUGS, type ModuleSlug } from '@/lib/auth/roles';
import { requireInternalUser, requireModuleAccess } from '@/lib/auth/server';

const names: Record<string, string> = {
  crm: 'CRM',
  sales: 'Sales',
  operations: 'Operations',
  marketing: 'Marketing',
  finance: 'Finance',
  reports: 'Reports',
  administration: 'Administration',
  activities: 'Activities',
};

export default async function ModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if ((MODULE_SLUGS as readonly string[]).includes(slug)) {
    await requireModuleAccess(slug as ModuleSlug);
  } else {
    await requireInternalUser();
  }

  const name = names[slug] ?? slug.replaceAll('-', ' ');
  const moduleEntry = (MODULE_SLUGS as readonly string[]).includes(slug) ? PRIMARY_MODULE_NAV[slug as ModuleSlug] : undefined;
  const Icon = moduleEntry?.icon;

  return (
    <Card className="max-w-2xl p-8 sm:p-10">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emmy-primary text-white">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-emmy-primary">EmmyTech OS</div>
      </div>
      <h1 className="mt-4 text-[32px] font-extrabold tracking-tight text-slate-950 sm:text-[38px]">{name}</h1>
      {moduleEntry && <p className="mt-1 text-sm text-slate-500">{moduleEntry.description}</p>}
      <p className="mt-4 text-base leading-8 text-slate-500">
        We are currently working on this department workspace. If this is crucial to your department and you want it delivered faster, message us on 07026710999.
      </p>
      <a href="https://wa.me/2347026710999" className={buttonVariants({ variant: 'default', size: 'lg', className: 'mt-6 no-underline' })}>
        <MessageCircle className="mr-2 h-[18px] w-[18px]" />
        Message 07026710999
      </a>
    </Card>
  );
}
