export const OPERATIONS_NAV = [
  {
    key: 'overview',
    href: '/modules/operations',
    label: 'Overview',
    help: 'See the most important Operations work in one place: orders, stock, transfers and recent activity.',
  },
  {
    key: 'orders',
    href: '/modules/operations/orders',
    label: 'Orders',
    help: 'Track customer orders, money, commission, fulfilment and what should happen next.',
  },
  {
    key: 'products',
    href: '/modules/operations/products',
    label: 'Products',
    help: 'Manage the same products customers see on the website, including names, prices, pictures and website status.',
  },
  {
    key: 'inventory',
    href: '/modules/operations/inventory',
    label: 'Inventory',
    help: 'See what EmmyTech has at Sango, UI or In Transit, including reserved and available quantities.',
  },
  {
    key: 'transfers',
    href: '/modules/operations/transfers',
    label: 'Transfers',
    help: 'Move EmmyTech stock between locations. A transfer can be for restocking or linked to a customer Order.',
  },
  {
    key: 'websiteLinks',
    href: '/modules/operations/website-links',
    label: 'Website Links',
    help: 'Connect a website product to an internal inventory item when they are related. They can also stay separate.',
  },
] as const;

export const OPERATIONS_HELP: Record<string, string> = {
  openOrders: 'Orders in the selected period that are not completed or cancelled.',
  urgent: 'Orders in the selected period marked urgent because they need faster attention.',
  dispatch: 'Orders in the selected period that are ready to leave EmmyTech or are already on the way.',
  inventoryItems: 'The number of internal items Operations is keeping track of.',
  lowStock: 'Items that are at or below the quantity where we should think about restocking.',
  websiteLinks: 'Links between internal inventory and products customers can see on the website.',
  recentOrders: 'The latest orders inside the selected reporting period.',
  activityTimeline: 'Important Operations activity inside the selected reporting period.',
  createOrder: 'Create a Draft first. Confirm only when the sale is real; confirmation can reserve stock and create pending commission.',
  createInventory: 'Add an item that EmmyTech needs to track inside the business. The SKU is created automatically.',
  createTransfer: 'Move stock from one EmmyTech location to another. The item goes through In Transit until the destination receives it.',
  createWebsiteLink: 'Connect an internal item to a website product. This is optional.',
  productManager: 'This is the same Product manager used in Marketing. Any change here changes the same website product record.',
};
