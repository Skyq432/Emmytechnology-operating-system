import type { JsonRecord } from '../template-data';
import {
  PAGE_W, PAGE_H, NAVY, NAVY_DEEP, GOLD, GOLD_LIGHT, GOLD_PALE, GRAY, INK, LIGHT, HAIR, PAPER,
  ROW_TINT, SUCCESS_BG, PARTIAL_BG, PARTIAL_BORDER, PARTIAL_INK,
  num, money, date, clean, helveticaTextWidth, wrap, humanPaymentMethod, formatSpecsLine,
  loadLogoPng, makePdf, text, line, fillPolygon, fillRect, fillRoundedRect, strokeRoundedRect,
  strokeCircle, diamond, textRight, centeredText, sectionTitle, statusBadge,
} from './shared.ts';

function receiptItems(snapshot: JsonRecord) {
  const items = Array.isArray(snapshot.items) ? snapshot.items as JsonRecord[] : [];
  if (items.length) return items;
  if (snapshot.source_type === 'repair') {
    return [{
      item_name: [snapshot.device_type, snapshot.brand, snapshot.model, snapshot.repair_type]
        .filter(Boolean)
        .join(' - ') || 'Repair service',
      quantity: 1,
      line_total: snapshot.transaction_total,
      specs: snapshot.serial_or_imei ? { serial_number: snapshot.serial_or_imei } : null,
    }];
  }
  return [];
}

export function renderReceiptPdf(input: {
  documentNumber: string;
  issuedAt: string;
  snapshot: JsonRecord;
}) {
  const s = input.snapshot || {};
  const rows = receiptItems(s);
  const total = num(s.transaction_total ?? s.total_amount);
  const payments = Array.isArray(s.payments) ? s.payments as JsonRecord[] : [];
  const lastPayment = payments.length ? payments[payments.length - 1] : null;
  const totalPaid = num(
    s.cumulative_paid ??
      s.total_paid ??
      payments.reduce((sum, payment) => sum + num(payment.amount), 0),
  );
  const balance = Math.max(0, num(s.balance_due ?? total - totalPaid));
  const amountReceived = num(s.payment_amount ?? lastPayment?.amount ?? totalPaid);
  const paymentStatus =
    balance <= 0 && totalPaid >= total && total > 0
      ? 'PAID IN FULL'
      : totalPaid > 0
        ? 'PART PAYMENT'
        : 'PAYMENT RECORDED';

  const sourceReference = clean(s.source_code || input.documentNumber);
  const referenceLabel = s.source_type === 'repair' ? 'Repair Ref' : 'Order Ref';
  const customerName = clean(s.customer_name || 'Customer');
  const customerContact =
    [s.customer_phone, s.customer_email].filter(Boolean).map(clean).join(' | ') || 'Nigeria';
  const paymentMethod = humanPaymentMethod(s.payment_method ?? lastPayment?.payment_method);
  const paymentReference = clean(s.payment_reference ?? lastPayment?.reference ?? '-');
  const paymentDate = date(s.paid_at ?? lastPayment?.paid_at ?? input.issuedAt);

  const cmd: string[] = [];
  const tableX = 42;
  const tableW = 511;
  const rightEdge = tableX + tableW;

  // Warm paper ground instead of stark white — the approved design's first cue.
  fillRect(cmd, 0, 0, PAGE_W, PAGE_H, PAPER);

  // Diagonal navy header band, tall on the left, gold double trim along its edge.
  const bandLeftH = 118;
  const bandRightH = 84;
  fillPolygon(cmd, [[0, PAGE_H], [PAGE_W, PAGE_H], [PAGE_W, PAGE_H - bandRightH], [0, PAGE_H - bandLeftH]], NAVY_DEEP);
  line(cmd, 0, PAGE_H - bandLeftH - 3, PAGE_W, PAGE_H - bandRightH - 3, GOLD, 2.4);
  line(cmd, 0, PAGE_H - bandLeftH - 9, PAGE_W, PAGE_H - bandRightH - 9, GOLD_LIGHT, 1);

  // Two-tone title sits on the band itself (gold "PAYMENT", white "RECEIPT").
  text(cmd, 'PAYMENT', tableX, PAGE_H - 46, 24, 'F2', GOLD);
  const paymentWordW = helveticaTextWidth('PAYMENT ', 24);
  text(cmd, 'RECEIPT', tableX + paymentWordW, PAGE_H - 46, 24, 'F2', [1, 1, 1]);
  text(cmd, 'Computer Resources - Professional Tech Solutions & ICT Consultancy', tableX, PAGE_H - 64, 8, 'F3', [0.79, 0.84, 0.9]);

  // Logo rides on a small white plate so it reads clearly against the navy band
  // regardless of which of the embedded logo's own colours it uses.
  const logo = loadLogoPng();
  if (!logo) throw new Error('Approved EmmyTech logo could not be decoded for receipt PDF.');
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

  // Meta strip.
  const metaY = 686;
  text(cmd, 'Receipt No:', tableX, metaY, 7.5, 'F2', INK);
  text(cmd, input.documentNumber, tableX + 54, metaY, 7.5, 'F2', NAVY);
  text(cmd, 'Date Issued:', 210, metaY, 7.5, 'F2', INK);
  text(cmd, date(input.issuedAt), 269, metaY, 7.5, 'F1', INK);
  text(cmd, `${referenceLabel}:`, 397, metaY, 7.5, 'F2', INK);
  text(cmd, sourceReference, 397 + helveticaTextWidth(`${referenceLabel}:`, 7.5) + 5, metaY, 7.5, 'F1', INK);
  line(cmd, tableX, metaY - 14, rightEdge, metaY - 14, HAIR, 1.2);

  // Customer / status.
  const partyY = metaY - 38;
  text(cmd, 'RECEIVED FROM', tableX, partyY, 8, 'F2', NAVY);
  text(cmd, customerName, tableX, partyY - 18, 13, 'F2', INK);
  text(cmd, customerContact, tableX, partyY - 32, 7.5, 'F1', GRAY);

  textRight(cmd, 'PAYMENT STATUS', rightEdge, partyY, 8, 'F2', NAVY);
  const isPaidInFull = balance <= 0 && totalPaid >= total && total > 0;
  const isPartial = !isPaidInFull && totalPaid > 0;
  const badgeBg = isPaidInFull ? SUCCESS_BG : isPartial ? PARTIAL_BG : LIGHT;
  const badgeBorder = isPaidInFull ? GOLD : isPartial ? PARTIAL_BORDER : HAIR;
  const badgeInk = isPaidInFull ? NAVY : isPartial ? PARTIAL_INK : GRAY;
  statusBadge(cmd, rightEdge, partyY - 30, paymentStatus, badgeBg, badgeBorder, badgeInk);

  // Item table — navy rule header (matching the approved design) rather than a filled block.
  let y = partyY - 62;
  sectionTitle(cmd, 'SERVICE & PRODUCT RECEIPT', tableX, y, rightEdge);
  y -= 22;

  const snW = 32;
  text(cmd, 'S/N', tableX, y, 8, 'F2', NAVY);
  text(cmd, 'Description of Services & Products', tableX + snW, y, 8, 'F2', NAVY);
  textRight(cmd, 'Amount (NGN)', rightEdge, y, 8, 'F2', NAVY);
  line(cmd, tableX, y - 6, rightEdge, y - 6, NAVY, 1.6);
  y -= 18;

  const shownRows = rows.length
    ? rows.slice(0, 10)
    : [{ item_name: 'Service / product', quantity: 1, line_total: total }];

  shownRows.forEach((row, index) => {
    const qty = Math.max(1, num(row.quantity));
    const description = clean(row.item_name || row.description || 'Item') + (qty > 1 ? ` (${qty} units)` : '');
    const amount = num(row.line_total ?? num(row.unit_price ?? row.final_unit_price) * qty);
    const wrapped = wrap(description, 62).slice(0, 2);
    const specLine = formatSpecsLine(row.item_type, row.specs);
    const specWrapped = specLine ? wrap(specLine, 78).slice(0, 2) : [];
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

  y -= 6;
  line(cmd, tableX, y + 18, rightEdge, y + 18, GOLD, 1.6);
  text(cmd, 'TRANSACTION TOTAL', tableX + snW, y, 8.5, 'F2', NAVY);
  textRight(cmd, `NGN ${money(total)}`, rightEdge, y, 10, 'F2', NAVY);

  y -= 34;

  // Payment summary, framed as a card matching the approved design.
  const cardW = 178;
  const cardX = rightEdge - cardW;
  const cardTop = y + 12;
  const cardH = 62;
  const cardY = cardTop - cardH;
  fillRoundedRect(cmd, cardX, cardY, cardW, cardH, 3, ROW_TINT);
  strokeRoundedRect(cmd, cardX, cardY, cardW, cardH, 3, HAIR, 0.7);
  strokeRoundedRect(cmd, cardX + 4, cardY + 4, cardW - 8, cardH - 8, 2, GOLD_PALE, 0.6);

  const cardPadX = 12;
  text(cmd, 'Amount received', cardX + cardPadX, cardTop - 15, 8, 'F1', INK);
  textRight(cmd, `NGN ${money(amountReceived)}`, cardX + cardW - cardPadX, cardTop - 15, 8, 'F2', INK);
  text(cmd, 'Total paid to date', cardX + cardPadX, cardTop - 29, 8, 'F1', INK);
  textRight(cmd, `NGN ${money(totalPaid)}`, cardX + cardW - cardPadX, cardTop - 29, 8, 'F1', INK);
  line(cmd, cardX + cardPadX, cardTop - 37, cardX + cardW - cardPadX, cardTop - 37, HAIR, 0.5);
  text(cmd, 'Balance due', cardX + cardPadX, cardTop - 50, 9, 'F2', NAVY);
  textRight(cmd, `NGN ${money(balance)}`, cardX + cardW - cardPadX, cardTop - 50, 9, 'F2', NAVY);

  // Service notes / payment details, two columns with gold diamond bullets.
  const sectionY = cardY - 26;
  const col2X = tableX + tableW / 2 + 10;

  text(cmd, 'SERVICE NOTES', tableX, sectionY, 9, 'F2', NAVY);
  [
    'All items are genuine and tested',
    'Installation materials include applicable warranty',
    '1-month guarantee on all UK-used products',
    'Professional service and after-sales support',
    'This receipt records payment actually received',
  ].forEach((note, index) => {
    const ny = sectionY - 16 - index * 13;
    diamond(cmd, tableX + 2, ny + 2.5, 2.2, GOLD);
    text(cmd, note, tableX + 10, ny, 7.5, 'F1', INK);
  });

  text(cmd, 'PAYMENT DETAILS', col2X, sectionY, 9, 'F2', NAVY);
  [
    `Payment method: ${paymentMethod}`,
    `Payment reference: ${paymentReference}`,
    `Payment date: ${paymentDate}`,
    'Issued by Emmy Technology',
  ].forEach((detail, index) => {
    const ny = sectionY - 16 - index * 13;
    diamond(cmd, col2X + 2, ny + 2.5, 2.2, GOLD);
    text(cmd, detail, col2X + 10, ny, 7.5, 'F1', INK);
  });

  const settlementY = sectionY - 100;

  if (balance <= 0) {
    // A gold wax-seal badge, matching the approved "PAID IN FULL" treatment.
    sectionTitle(cmd, 'SETTLEMENT', tableX, settlementY, tableX + 240);
    const cx = tableX + 53;
    const cy = settlementY - 62;
    const r = 40;
    strokeCircle(cmd, cx, cy, r, GOLD, 1.8);
    strokeCircle(cmd, cx, cy, r + 5, GOLD_PALE, 0.8);
    centeredText(cmd, 'PAID', cx, cy + 6, 13, 'F2', NAVY);
    centeredText(cmd, 'IN FULL', cx, cy - 5, 7, 'F2', [0.54, 0.39, 0]);
    centeredText(cmd, 'EMMYTECH', cx, cy - 15, 5.5, 'F1', GRAY);
    wrap('This transaction is fully settled. No further payment is due. Retain this receipt as proof of payment.', 42)
      .slice(0, 3)
      .forEach((part, index) => {
        centeredText(cmd, part, cx, settlementY - 118 - index * 11, 7.3, 'F1', GRAY);
      });
  } else {
    sectionTitle(cmd, 'OUTSTANDING BALANCE', tableX, settlementY, tableX + 240);
    text(cmd, `NGN ${money(balance)}`, tableX, settlementY - 22, 15, 'F2', NAVY);
    wrap('Balance remains on this transaction. To settle, transfer to the account below:', 46)
      .forEach((part, index) => {
        text(cmd, part, tableX, settlementY - 38 - index * 11, 7.3, 'F1', GRAY);
      });

    const bx = tableX;
    const by = settlementY - 128;
    const bw = 245;
    const bh = 58;

    fillRoundedRect(cmd, bx, by, bw, bh, 4, ROW_TINT);
    strokeRoundedRect(cmd, bx, by, bw, bh, 4, HAIR, 0.6);
    line(cmd, bx + 8, by + 19, bx + bw - 8, by + 19, HAIR, 0.5);
    line(cmd, bx + 8, by + 38, bx + bw - 8, by + 38, HAIR, 0.5);

    text(cmd, 'Account Name:', bx + 8, by + 43, 6.8, 'F1', GRAY);
    textRight(cmd, 'Emmy Technologies PC PROFESSIONAL', bx + bw - 8, by + 43, 6.5, 'F2', INK);
    text(cmd, 'Account No:', bx + 8, by + 24, 7, 'F1', GRAY);
    textRight(cmd, '5128460113', bx + bw - 8, by + 24, 7, 'F2', INK);
    text(cmd, 'Bank:', bx + 8, by + 5, 7, 'F1', GRAY);
    textRight(cmd, 'Moniepoint', bx + bw - 8, by + 5, 7, 'F2', INK);

    text(cmd, `Quote ${sourceReference} as your payment reference.`, tableX, by - 16, 7.2, 'F3', GRAY);
  }

  text(cmd, 'WITH THANKS', col2X, settlementY, 9, 'F2', NAVY);
  wrap('Thank you for your payment and for choosing Emmy Technology.', 44)
    .slice(0, 2)
    .forEach((part, index) => {
      text(cmd, part, col2X, settlementY - 18 - index * 12, 7.5, 'F3', GRAY);
    });

  // Footer.
  line(cmd, tableX, 88, rightEdge, 88, GOLD, 1.6);
  centeredText(cmd, 'Thank you for choosing Emmy Technology!', PAGE_W / 2, 70, 9, 'F2', NAVY);
  centeredText(cmd, 'We value our partnership and look forward to working with you again.', PAGE_W / 2, 57, 7, 'F1', GRAY);
  const contactLine = '+234 814 650 3700   |   www.emmytechnology.com   |   support@emmytechnology.com   |   Sango branch, Ibadan';
  centeredText(cmd, contactLine, PAGE_W / 2, 39, 6.5, 'F1', GRAY);

  return makePdf(cmd.join('\n'), logo);
}
