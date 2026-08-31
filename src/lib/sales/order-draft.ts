export type SalesOrderDraftFulfilmentSource = 'internal' | 'supplier' | 'dropship' | 'manual';
export type SalesOrderDraftCostBasisSource = 'inventory_average' | 'product_default' | 'supplier_on_demand';

export type SalesOrderDraftInputLine = {
  inventoryItemId?: string | null;
  itemName: string;
  itemType?: string | null;
  category?: string | null;
  fulfilmentSource?: SalesOrderDraftFulfilmentSource;
  quantity: number;
  listPrice: number;
  finalUnitPrice: number;
  costBasis?: number | null;
  costBasisSource?: SalesOrderDraftCostBasisSource | null;
  adminExceptionReason?: string | null;
  note?: string | null;
};

export type SalesOrderDraftRpcLine = {
  inventory_item_id: string | null;
  item_name: string;
  item_type: string;
  category: string | null;
  fulfilment_source: SalesOrderDraftFulfilmentSource;
  quantity: number;
  list_price: number;
  final_unit_price: number;
  cost_basis: number | null;
  cost_basis_source: SalesOrderDraftCostBasisSource | null;
  admin_exception_reason: string | null;
  note: string | null;
};

function finiteMoney(value: number, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} is invalid`);
  return number;
}

export function buildSalesOrderDraftItems(lines: SalesOrderDraftInputLine[]): SalesOrderDraftRpcLine[] {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('At least one order item is required');

  return lines.map((line) => {
    const name = String(line.itemName || '').trim();
    if (!name) throw new Error('Order item name is required');

    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`Order item quantity for ${name} must be greater than zero`);

    const listPrice = finiteMoney(line.listPrice, `List price for ${name}`);
    const finalUnitPrice = finiteMoney(line.finalUnitPrice, `Final price for ${name}`);
    if (listPrice <= 0 || finalUnitPrice <= 0) throw new Error(`Order item price for ${name} must be greater than zero`);

    const inventoryItemId = line.inventoryItemId?.trim() || null;
    const fulfilmentSource = line.fulfilmentSource || (inventoryItemId ? 'internal' : 'manual');
    if (!['internal', 'supplier', 'dropship', 'manual'].includes(fulfilmentSource)) throw new Error(`Invalid fulfilment source for ${name}`);

    let costBasis: number | null = line.costBasis == null ? null : finiteMoney(line.costBasis, `Cost basis for ${name}`);
    let costBasisSource = line.costBasisSource || null;

    if (!inventoryItemId) {
      if (costBasis == null) throw new Error(`Cost basis is required for non-inventory item ${name}`);
      costBasisSource ||= 'supplier_on_demand';
    } else {
      // Inventory cost is resolved server-side from Operations truth. Do not trust browser-provided cost.
      costBasis = null;
      costBasisSource = null;
    }

    return {
      inventory_item_id: inventoryItemId,
      item_name: name,
      item_type: String(line.itemType || 'other').trim() || 'other',
      category: line.category?.trim() || null,
      fulfilment_source: fulfilmentSource,
      quantity,
      list_price: listPrice,
      final_unit_price: finalUnitPrice,
      cost_basis: costBasis,
      cost_basis_source: costBasisSource,
      admin_exception_reason: line.adminExceptionReason?.trim() || null,
      note: line.note?.trim() || null,
    };
  });
}
