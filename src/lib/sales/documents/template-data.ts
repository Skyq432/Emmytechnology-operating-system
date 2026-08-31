export type JsonRecord = Record<string, unknown>;

export function escapeLatex(value: unknown): string {
  const text = String(value ?? '');
  return text.replace(/[\\{}$&#_%~^]/g, (char) => {
    const map: Record<string, string> = {
      '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$', '&': '\\&', '#': '\\#', '_': '\\_', '%': '\\%', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
    };
    return map[char] ?? char;
  });
}

export function renderLatexTemplate(template: string, values: Record<string, string>): string {
  const rendered = template.replace(/<<([A-Z0-9_]+)>>/g, (match, key: string) => Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match);
  const unresolved = rendered.match(/<<([A-Z0-9_]+)>>/);
  if (unresolved) throw new Error(`Unresolved LaTeX placeholder: ${unresolved[1]}`);
  return rendered;
}

function number(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function money(value: unknown): string {
  return number(value).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function date(value: unknown): string {
  if (!value) return '—';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return escapeLatex(value);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
}

function calendarDate(value: unknown): string {
  if (!value) return '—';
  const raw = String(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return date(value);
  const d = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00.000Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function contact(snapshot: JsonRecord): string {
  return [snapshot.customer_phone, snapshot.customer_email].filter(Boolean).map(escapeLatex).join(' \\textbar{} ') || 'Nigeria';
}

function receiptItems(snapshot: JsonRecord): Array<JsonRecord> {
  const items = Array.isArray(snapshot.items) ? snapshot.items as JsonRecord[] : [];
  if (items.length) return items;
  if (snapshot.source_type === 'repair') {
    const description = [snapshot.device_type, snapshot.brand, snapshot.model, snapshot.repair_type].filter(Boolean).join(' · ') || 'Repair service';
    return [{ item_name: description, quantity: 1, line_total: snapshot.transaction_total }];
  }
  return [];
}

function itemRows(items: Array<JsonRecord>, priceKey: 'receipt' | 'quotation'): string {
  if (!items.length) return `    1 & ${escapeLatex('Service / product')} & 0.00 \\\\`;
  return items.map((item, index) => {
    const qty = Math.max(1, number(item.quantity));
    const name = escapeLatex(item.item_name || item.description || 'Item');
    const description = qty > 1 ? `${name} (${qty} units)` : name;
    const amount = priceKey === 'quotation'
      ? number(item.line_total ?? (number(item.final_unit_price) * qty))
      : number(item.line_total ?? (number(item.unit_price) * qty));
    return `    ${index + 1} & ${description} & ${money(amount)} \\\\`;
  }).join('\n');
}

function humanPaymentMethod(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Not specified';
  return escapeLatex(raw.split('_').map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(' '));
}

export function buildReceiptTemplateData(input: { documentNumber: string; issuedAt: string; snapshot: JsonRecord }): Record<string, string> {
  const s = input.snapshot || {};
  const total = number(s.transaction_total ?? s.total_amount);
  const totalPaid = number(s.cumulative_paid ?? s.total_paid ?? (Array.isArray(s.payments) ? (s.payments as JsonRecord[]).reduce((sum, payment) => sum + number(payment.amount), 0) : 0));
  const balance = Math.max(0, number(s.balance_due ?? (total - totalPaid)));
  const amountReceived = number(s.payment_amount ?? totalPaid);
  const paymentStatus = balance <= 0 && totalPaid >= total && total > 0 ? 'Paid in Full' : totalPaid > 0 ? 'Part Payment' : 'Payment Recorded';
  const payments = Array.isArray(s.payments) ? s.payments as JsonRecord[] : [];
  const lastPayment = payments.length ? payments[payments.length - 1] : null;
  const paymentDate = s.paid_at ?? lastPayment?.paid_at ?? input.issuedAt;
  return {
    DOCUMENT_NUMBER: escapeLatex(input.documentNumber), DATE_ISSUED: date(input.issuedAt), SOURCE_REFERENCE: escapeLatex(s.source_code || input.documentNumber),
    CUSTOMER_NAME: escapeLatex(s.customer_name || 'Customer'), CUSTOMER_CONTACT: contact(s), PAYMENT_STATUS: escapeLatex(paymentStatus),
    ITEM_ROWS: itemRows(receiptItems(s), 'receipt'), TRANSACTION_TOTAL: money(total), AMOUNT_RECEIVED: money(amountReceived), TOTAL_PAID: money(totalPaid), BALANCE_DUE: money(balance),
    PAYMENT_METHOD: humanPaymentMethod(s.payment_method ?? lastPayment?.payment_method), PAYMENT_REFERENCE: escapeLatex(s.payment_reference ?? lastPayment?.reference ?? '—'), PAYMENT_DATE: date(paymentDate),
  };
}

export function buildQuotationTemplateData(input: { documentNumber: string; issuedAt: string; snapshot: JsonRecord }): Record<string, string> {
  const s = input.snapshot || {};
  const items = Array.isArray(s.items) ? s.items as JsonRecord[] : [];
  const total = number(s.total_amount ?? s.transaction_total ?? items.reduce((sum, item) => sum + number(item.line_total ?? (number(item.final_unit_price) * Math.max(1, number(item.quantity)))), 0));
  const documentNumber = String(s.quotation_code || input.documentNumber);
  return {
    DOCUMENT_NUMBER: escapeLatex(documentNumber), QUOTATION_NUMBER: escapeLatex(documentNumber), VERSION: escapeLatex(s.version ?? '1'), DATE_ISSUED: date(input.issuedAt), VALID_UNTIL: calendarDate(s.validity_expires_at),
    CUSTOMER_NAME: escapeLatex(s.customer_name || 'Customer'), CUSTOMER_CONTACT: contact(s), QUOTATION_STATUS: escapeLatex(s.status || 'Published'), ITEM_ROWS: itemRows(items, 'quotation'),
    TRANSACTION_TOTAL: money(total), TOTAL: money(total), CUSTOMER_NOTE: escapeLatex(s.customer_note || 'Please contact Emmy Technology if you need any clarification.'),
    TERMS: escapeLatex(s.terms || 'Stock and pricing are subject to availability until the sale/order is confirmed.'),
  };
}

export function buildRefundTemplateData(input: { documentNumber: string; issuedAt: string; snapshot: JsonRecord }): Record<string, string> {
  const s = input.snapshot || {};
  return {
    DOCUMENT_NUMBER: escapeLatex(input.documentNumber),
    DATE_ISSUED: date(input.issuedAt),
    SOURCE_REFERENCE: escapeLatex(s.order_code || s.source_code || '—'),
    RETURN_REFERENCE: escapeLatex(s.return_code || '—'),
    CUSTOMER_NAME: escapeLatex(s.customer_name || 'Customer'),
    CUSTOMER_CONTACT: contact(s),
    REFUND_AMOUNT: money(s.refund_amount),
    PAYMENT_METHOD: humanPaymentMethod(s.payment_method),
    PAYMENT_REFERENCE: escapeLatex(s.reference || '—'),
    PAYMENT_DATE: date(s.refunded_at || input.issuedAt),
  };
}
