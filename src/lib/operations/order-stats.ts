// Summary tiles for Operations → Orders. Pure, so it can be tested without a database.
// The list it receives already leaves out deleted orders.

export type OrderStatsInput = {
  commercial_state: string;
  status: string;
  sales_channel?: string | null;
  total_amount: number | string | null;
  amount_paid: number | string | null;
  balance_due: number | string | null;
  deletion_status?: string | null;
};

export type OrderStats = {
  orders: number;
  directSales: number;
  otherOrders: number;
  salesValue: number;
  collected: number;
  outstanding: number;
  inProgress: number;
  completed: number;
  drafts: number;
  flaggedForDeletion: number;
};

const CLOSED = new Set(['completed', 'cancelled']);
const n = (value: number | string | null | undefined) => Number(value || 0);

export function computeOrderStats(orders: OrderStatsInput[]): OrderStats {
  const stats: OrderStats = {
    orders: 0, directSales: 0, otherOrders: 0, salesValue: 0, collected: 0, outstanding: 0,
    inProgress: 0, completed: 0, drafts: 0, flaggedForDeletion: 0,
  };
  for (const order of orders) {
    if (order.deletion_status === 'deleted') continue;
    stats.orders += 1;
    if (order.sales_channel === 'direct_sale') stats.directSales += 1; else stats.otherOrders += 1;
    if (order.deletion_status === 'pending_deletion') stats.flaggedForDeletion += 1;
    if (order.commercial_state === 'draft') { stats.drafts += 1; continue; }
    if (order.commercial_state !== 'confirmed') continue;
    stats.salesValue += n(order.total_amount);
    stats.collected += n(order.amount_paid);
    stats.outstanding += Math.max(n(order.balance_due), 0);
    if (order.status === 'completed') stats.completed += 1;
    else if (!CLOSED.has(order.status)) stats.inProgress += 1;
  }
  return stats;
}
