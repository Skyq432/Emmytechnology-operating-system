import { WebsiteLinksClient } from '@/components/operations/website-links/website-links-client';
import { getWebsiteProductLinks } from '@/lib/operations/server';

export default async function OperationsWebsiteLinksPage() {
  const data = await getWebsiteProductLinks();
  return (
    <WebsiteLinksClient
      links={data.links}
      inventory={data.inventory}
      websiteProducts={data.websiteProducts}
    />
  );
}
