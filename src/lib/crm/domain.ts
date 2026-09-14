import type { CrmStage, IdentityActivity, IdentitySource, Lead, TrackingType } from './types';

export const CRM_STAGES: CrmStage[] = [
  { id: 1, name: 'Awareness', short: 'Spin', tracking: 'Automatic' },
  { id: 2, name: 'Interest', short: 'Voucher claim', tracking: 'Automatic' },
  { id: 3, name: 'Consideration', short: 'Browse / ask', tracking: 'Automatic' },
  { id: 4, name: 'Intent', short: 'Added to cart', tracking: 'Automatic' },
  { id: 5, name: 'Purchase', short: 'WhatsApp handoff', tracking: 'Manual' },
  { id: 6, name: 'Onboarding', short: 'Paid / delivery', tracking: 'Manual' },
  { id: 7, name: 'Satisfaction', short: 'Feedback / review', tracking: 'Manual' },
  { id: 8, name: 'Loyalty', short: 'Repeat buyer', tracking: 'Manual' },
  { id: 9, name: 'Expansion', short: 'Cross-sell ready', tracking: 'Recommended' },
  { id: 10, name: 'Advocacy', short: 'Qualified referral', tracking: 'Manual' },
];

const STAGE_ACTIVITY_COPY: Record<number, { title: string; detail: string; tracking: TrackingType; tone: IdentityActivity['tone'] }> = {
  1: { title: 'Spin completed', detail: 'Identity captured from first tracked Spin Wheel interaction.', tracking: 'Automatic', tone: 'blue' },
  2: { title: 'Voucher claimed', detail: 'Voucher was attached to the same identity after verification.', tracking: 'Automatic', tone: 'green' },
  3: { title: 'Product interest detected', detail: 'Product views, searches or enquiries moved the identity into consideration.', tracking: 'Automatic', tone: 'blue' },
  4: { title: 'Product added to cart', detail: 'Cart activity confirms stronger purchase intent.', tracking: 'Automatic', tone: 'green' },
  5: { title: 'WhatsApp handoff', detail: 'Customer clicked Send to EmmyTech. Conversation outcome is now a manual blind spot.', tracking: 'Manual', tone: 'amber' },
  6: { title: 'Payment / delivery confirmed', detail: 'Staff manually confirmed the purchase and moved the identity into onboarding.', tracking: 'Manual', tone: 'green' },
  7: { title: 'Post-sale follow-up', detail: 'Feedback, review or satisfaction status is recorded manually.', tracking: 'Manual', tone: 'blue' },
  8: { title: 'Repeat purchase recorded', detail: 'The same identity has returned and is now treated as a loyal customer.', tracking: 'Manual', tone: 'green' },
  9: { title: 'Cross-sell opportunity', detail: 'Known purchase history triggered a recommended next product or bundle.', tracking: 'Recommended', tone: 'amber' },
  10: { title: 'Advocacy qualification', detail: 'Qualified referred purchases make this identity eligible for Ambassador review.', tracking: 'Manual', tone: 'blue' },
};

export function identityProfile(lead: Lead) {
  return {
    email: lead.email ?? '—',
    location: lead.location ?? '—',
    firstSeen: lead.firstSeen ?? '—',
    lastSeen: lead.age,
    mergeConfidence: lead.mergeConfidence ?? 'Identity links from Supabase',
    sources: lead.identitySources?.length
      ? lead.identitySources
      : ([{ label: 'CRM', detail: lead.id.slice(0, 8).toUpperCase(), tone: 'blue' }] as IdentitySource[]),
  };
}

export function identityActivities(lead: Lead): IdentityActivity[] {
  if (lead.activities?.length) return lead.activities;
  const data = STAGE_ACTIVITY_COPY[lead.stage];
  return data ? [{ ...data, title: lead.lastAction, time: lead.age }] : [];
}

export function friendlyActionError(raw: string) {
  const message = raw || 'CRM action failed';
  if (message.includes('crm_tasks_status_check')) return 'Could not update this task. Refresh the CRM and try again.';
  if (message.includes('foreign key constraint')) return 'This customer record is not fully linked yet. Refresh and try again.';
  if (message.includes('check constraint')) return 'That update is not allowed yet. Refresh the CRM and try again.';
  if (message.trim().startsWith('{') || message.length > 180) return 'The CRM could not save this change. Please try again.';
  return message;
}

export function whatsappHref(lead: Lead) {
  const saved = lead.whatsappUrl?.trim();
  if (saved && /^https?:\/\//i.test(saved)) return saved;
  let phone = lead.phone.replace(/\D/g, '');
  if (phone.startsWith('0')) phone = `234${phone.slice(1)}`;
  const message = lead.whatsappMessage?.trim() || `Hello ${lead.name}, this is EmmyTech. I am following up on your ${lead.product || 'product'} enquiry.`;
  return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : '';
}

export function initialsFor(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('');
}
