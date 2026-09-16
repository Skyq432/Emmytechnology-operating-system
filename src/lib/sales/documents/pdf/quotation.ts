import type { JsonRecord } from '../template-data';
import {
  PAGE_W, PAGE_H, NAVY, NAVY_DEEP, GOLD, GOLD_LIGHT, GOLD_PALE, GRAY, INK, HAIR, PAPER,
  ROW_TINT, SUCCESS_BG, PARTIAL_BG, PARTIAL_BORDER, PARTIAL_INK,
  num, money, date, clean, helveticaTextWidth, wrap, formatSpecsLine,
  loadLogoPng, makePdf, text, line, fillPolygon, fillRect, fillRoundedRect, strokeRoundedRect,
  textRight, centeredText, sectionTitle, statusBadge,
} from './shared.ts';

function quotationItems(snapshot: JsonRecord) {
  return Array.isArray(snapshot.items) ? snapshot.items as JsonRecord[] : [];
}

export function renderQuotationPdf(input: {
  documentNumber: string;
  issuedAt: string;
  snapshot: JsonRecord;
}) {
  const s = input.snapshot || {};
  const rows = quotationItems(s);
  const subtotal = num(s.subtotal);
  const discount = num(s.discount_amount);
  const total = num(s.total_amount);
  const validityExpiresAt = s.validity_expires_at ? String(s.validity_expires_at) : null;
  const isExpired = validityExpiresAt ? new Date(validityExpiresAt).getTime() < Date.now() : false;

  const sourceReference = clean(s.quotation_code ? `${s.quotation_code} · V${num(s.version) || 1}` : input.documentNumber);
  const customerName = clean(s.customer_name || 'Customer');
  const customerContact =
    [s.customer_phone, s.customer_email].filter(Boolean).map(clean).join(' | ') || 'Nigeria';

  const cmd: string[] = [];
  const tableX = 42;
  const tableW = 511;
  const rightEdge = tableX + tableW;

  fillRect(cmd, 0, 0, PAGE_W, PAGE_H, PAPER);

  const bandLeftH = 118;
  const bandRightH = 84;
  fillPolygon(cmd, [[0, PAGE_H], [PAGE_W, PAGE_H], [PAGE_W, PAGE_H - bandRightH], [0, PAGE_H - bandLeftH]], NAVY_DEEP);
  line(cmd, 0, PAGE_H - bandLeftH - 3, PAGE_W, PAGE_H - bandRightH - 3, GOLD, 2.4);
  line(cmd, 0, PAGE_H - bandLeftH - 9, PAGE_W, PAGE_H - bandRightH - 9, GOLD_LIGHT, 1);

  text(cmd, 'PRICE', tableX, PAGE_H - 46, 24, 'F2', GOLD);
  const wordW = helveticaTextWidth('PRICE ', 24);
  text(cmd, 'QUOTATION', tableX + wordW, PAGE_H - 46, 24, 'F2', [1, 1, 1]);
  text(cmd, 'Computer Resources - Professional Tech Solutions & ICT Consultancy', tableX, PAGE_H - 64, 8, 'F3', [0.79, 0.84, 0.9]);

  const logo = loadLogoPng();
  if (!logo) throw new Error('Approved EmmyTech logo could not be decoded for quotation PDF.');
  const chipW = 150;
  const chipH = 42;
  const chipX = rightEdge - chipW;
  const chipY = PAGE_H - 74;
  fillRoundedRect(cmd, chipX, chipY, chipW, chipH, 6, PAPER);
  {
    const pad = 6;
    const scale = Math.min((chipW - pad * 2) / logo.width, (chipH - pad * 2) / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    const x = chipX + (chipW - w) / 2;
    const y = chipY + (chipH - h) / 2;
    cmd.push(`q ${w} 0 0 ${h} ${x} ${y} cm /Logo Do Q`);
  }

  const metaY = 686;
  text(cmd, 'Quote No:', tableX, metaY, 7.5, 'F2', INK);
  text(cmd, sourceReference, tableX + 50, metaY, 7.5, 'F2', NAVY);
  text(cmd, 'Date Issued:', 250, metaY, 7.5, 'F2', INK);
  text(cmd, date(input.issuedAt), 309, metaY, 7.5, 'F1', INK);
  text(cmd, 'Valid Until:', 397, metaY, 7.5, 'F2', INK);
  text(cmd, validityExpiresAt ? date(validityExpiresAt) : 'Contact us', 397 + helveticaTextWidth('Valid Until:', 7.5) + 5, metaY, 7.5, 'F1', INK);
  line(cmd, tableX, metaY - 14, rightEdge, metaY - 14, HAIR, 1.2);

  const partyY = metaY - 38;
  text(cmd, 'PREPARED FOR', tableX, partyY, 8, 'F2', NAVY);
  text(cmd, customerName, tableX, partyY - 18, 13, 'F2', INK);
  text(cmd, customerContact, tableX, partyY - 32, 7.5, 'F1', GRAY);

  textRight(cmd, 'QUOTE STATUS', rightEdge, partyY, 8, 'F2', NAVY);
  const statusLabel = isExpired ? 'EXPIRED' : 'AWAITING DECISION';
  const badgeBg = isExpired ? PARTIAL_BG : SUCCESS_BG;
  const badgeBorder = isExpired ? PARTIAL_BORDER : GOLD;
  const badgeInk = isExpired ? PARTIAL_INK : NAVY;
  statusBadge(cmd, rightEdge, partyY - 30, statusLabel, badgeBg, badgeBorder, badgeInk);

  let y = partyY - 62;
  sectionTitle(cmd, 'QUOTED ITEMS', tableX, y, rightEdge);
  y -= 22;

  const snW = 32;
  text(cmd, 'S/N', tableX, y, 8, 'F2', NAVY);
  text(cmd, 'Description of Services & Products', tableX + snW, y, 8, 'F2', NAVY);
  textRight(cmd, 'Amount (NGN)', rightEdge, y, 8, 'F2', NAVY);
  line(cmd, tableX, y - 6, rightEdge, y - 6, NAVY, 1.6);
  y -= 18;

  const shownRows = rows.length ? rows.slice(0, 10) : [{ item_name: 'Quoted item', quantity: 1, final_unit_price: total }];

  shownRows.forEach((row, index) => {
    const qty = Math.max(1, num(row.quantity));
    const description = clean(row.item_name || 'Item') + (qty > 1 ? ` (${qty} units)` : '');
    // final_unit_price is already the post-discount unit price the customer pays —
    // line_discount_amount is informational (list minus final, for the summary card),
    // not a further deduction from this line's total.
    const unitPrice = num(row.final_unit_price ?? row.list_price);
    const amount = unitPrice * qty;
    const wrapped = wrap(description, 62).slice(0, 2);
    const specLine = formatSpecsLine(row.item_type, row.specs);
    const noteLine = row.note ? clean(row.note as string) : '';
    const subLine = [specLine, noteLine].filter(Boolean).join(' · ');
    const specWrapped = subLine ? wrap(subLine, 78).slice(0, 2) : [];
    const rowH = Math.max(18, (wrapped.length + specWrapped.length) * 10 + 6);

    if (index % 2 === 1) fillRect(cmd, tableX, y - rowH + 12, tableW, rowH, ROW_TINT);

    text(cmd, String(index + 1), tableX, y, 7.5, 'F1', GRAY);
    wrapped.forEach((part, j) => {
      text(cmd, part, tableX + snW, y - j * 10, 7.5, j === 0 ? 'F2' : 'F1', j === 0 ? INK : GRAY);
    });
    specWrapped.forEach((part, j) => {
      text(cmd, part, tableX + snW, y - (wrapped.length + j) * 10, 6.8, 'F3', GRAY);
    });
    textRight(cmd, money(amount), rightEdge, y, 7.5, 'F2', INK);
    line(cmd, tableX, y - rowH + 12, rightEdge, y - rowH + 12, HAIR, 0.5);

    y -= rowH;
  });

  y -= 10;

  // Subtotal / discount / total summary card, matching the receipt's payment card.
  const cardW = 178;
  const cardX = rightEdge - cardW;
  const cardTop = y + 12;
  const cardH = discount > 0 ? 62 : 48;
  const cardY = cardTop - cardH;
  fillRoundedRect(cmd, cardX, cardY, cardW, cardH, 3, ROW_TINT);
  strokeRoundedRect(cmd, cardX, cardY, cardW, cardH, 3, HAIR, 0.7);
  strokeRoundedRect(cmd, cardX + 4, cardY + 4, cardW - 8, cardH - 8, 2, GOLD_PALE, 0.6);

  const cardPadX = 12;
  let cardLineY = cardTop - 15;
  text(cmd, 'Subtotal', cardX + cardPadX, cardLineY, 8, 'F1', INK);
  textRight(cmd, `NGN ${money(subtotal)}`, cardX + cardW - cardPadX, cardLineY, 8, 'F1', INK);
  if (discount > 0) {
    cardLineY -= 14;
    text(cmd, 'Discount', cardX + cardPadX, cardLineY, 8, 'F1', INK);
    textRight(cmd, `- NGN ${money(discount)}`, cardX + cardW - cardPadX, cardLineY, 8, 'F1', INK);
  }
  line(cmd, cardX + cardPadX, cardLineY - 8, cardX + cardW - cardPadX, cardLineY - 8, HAIR, 0.5);
  text(cmd, 'Total quoted', cardX + cardPadX, cardLineY - 21, 9, 'F2', NAVY);
  textRight(cmd, `NGN ${money(total)}`, cardX + cardW - cardPadX, cardLineY - 21, 9, 'F2', NAVY);

  // Customer note / terms, two columns with gold diamond-free prose blocks.
  const sectionY = cardY - 26;
  const col2X = tableX + tableW / 2 + 10;

  const customerNote = s.customer_note ? clean(s.customer_note as string) : '';
  const terms = s.terms ? clean(s.terms as string) : '';

  text(cmd, 'NOTE TO CUSTOMER', tableX, sectionY, 9, 'F2', NAVY);
  wrap(customerNote || 'This quotation reflects current pricing and stock availability at the time of issue.', 46)
    .slice(0, 5)
    .forEach((part, index) => {
      text(cmd, part, tableX, sectionY - 16 - index * 12, 7.5, 'F1', INK);
    });

  text(cmd, 'TERMS', col2X, sectionY, 9, 'F2', NAVY);
  wrap(terms || 'Prices are subject to change once this quotation expires. Stock is not reserved until an order is confirmed.', 46)
    .slice(0, 5)
    .forEach((part, index) => {
      text(cmd, part, col2X, sectionY - 16 - index * 12, 7.5, 'F1', INK);
    });

  const settlementY = sectionY - 104;

  sectionTitle(cmd, 'HOW TO ACCEPT', tableX, settlementY, tableX + 240);
  wrap('Reply to confirm you wish to proceed, or contact us by phone or WhatsApp. We will convert this quotation to an order once accepted and stock is confirmed.', 46)
    .slice(0, 4)
    .forEach((part, index) => {
      text(cmd, part, tableX, settlementY - 18 - index * 11, 7.3, 'F1', GRAY);
    });

  text(cmd, 'WITH THANKS', col2X, settlementY, 9, 'F2', NAVY);
  wrap('Thank you for considering Emmy Technology for this purchase.', 44)
    .slice(0, 2)
    .forEach((part, index) => {
      text(cmd, part, col2X, settlementY - 18 - index * 12, 7.5, 'F3', GRAY);
    });

  line(cmd, tableX, 88, rightEdge, 88, GOLD, 1.6);
  centeredText(cmd, 'Thank you for choosing Emmy Technology!', PAGE_W / 2, 70, 9, 'F2', NAVY);
  centeredText(cmd, 'This is a price quotation, not an invoice — no payment is due until you accept.', PAGE_W / 2, 57, 7, 'F1', GRAY);
  const contactLine = '+234 814 650 3700   |   www.emmytechnology.com   |   support@emmytechnology.com   |   Sango branch, Ibadan';
  centeredText(cmd, contactLine, PAGE_W / 2, 39, 6.5, 'F1', GRAY);

  return makePdf(cmd.join('\n'), logo);
}
