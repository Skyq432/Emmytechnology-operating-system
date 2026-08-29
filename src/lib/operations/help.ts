export const OPERATIONS_NAV = [
  {
    key: 'overview',
    href: '/modules/operations',
    label: 'Overview',
    help: 'See the most important Operations work in one place: open orders, urgent work, stock and recent activity.',
  },
  {
    key: 'orders',
    href: '/modules/operations/orders',
    label: 'Orders',
    help: 'Track what needs to be done for a customer and see which team is handling it now.',
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
    help: 'Keep track of items EmmyTech has or uses inside the business. An inventory item does not have to be on the website.',
  },
  {
    key: 'websiteLinks',
    href: '/modules/operations/website-links',
    label: 'Website Links',
    help: 'Connect a website product to an internal inventory item when they are related. They can also stay separate.',
  },
] as const;

export const OPERATIONS_HELP: Record<string, string> = {
  openOrders: 'Orders EmmyTech has started but has not finished or cancelled yet.',
  urgent: 'Active orders marked urgent because they need faster attention.',
  dispatch: 'Orders that are ready to leave EmmyTech or are already on the way.',
  inventoryItems: 'The number of internal items Operations is keeping track of.',
  lowStock: 'Items that are at or below the quantity where we should think about restocking.',
  websiteLinks: 'Links between internal inventory and products customers can see on the website.',
  recentOrders: 'The latest orders the Operations team has worked on.',
  activityTimeline: 'A simple history of order changes and team handovers.',
  createOrder: 'Create a new internal order so the team can track it from start to finish.',
  createInventory: 'Add an item that EmmyTech needs to track inside the business.',
  createWebsiteLink: 'Connect an internal item to a website product. This is optional.',
  productManager: 'This is the same Product manager used in Marketing. Any change here changes the same website product record.',
};
