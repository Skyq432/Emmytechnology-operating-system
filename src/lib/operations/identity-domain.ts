export function normalizeOperationsPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length >= 10) return `+234${digits.slice(1)}`;
  if (digits.length === 10) return `+234${digits}`;
  return `+${digits}`;
}

export function buildOperationsIdentitySignals(input: {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}) {
  const signals: Array<{ type: string; value: string }> = [];
  const phone = normalizeOperationsPhone(input.phone || '');
  const email = (input.email || '').trim().toLowerCase();
  const name = (input.name || '').trim();
  if (phone) signals.push({ type: 'phone', value: phone });
  if (email) signals.push({ type: 'email', value: email });
  if (name) signals.push({ type: 'name', value: name });
  return signals;
}
