import { Badge } from '@/components/ui/badge';
import type { TrackingType } from '@/lib/crm/types';

const VARIANT_BY_TYPE: Record<TrackingType, 'success' | 'default' | 'warning'> = {
  Automatic: 'success',
  Manual: 'default',
  Recommended: 'warning',
};

export function TrackingBadge({ type }: { type: TrackingType }) {
  return <Badge variant={VARIANT_BY_TYPE[type]}>{type}</Badge>;
}
