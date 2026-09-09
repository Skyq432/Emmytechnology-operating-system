import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { JsonRecord } from '../template-data';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const BLUE: [number, number, number] = [0, 0.2, 0.4];
const GOLD: [number, number, number] = [1, 0.72, 0];
const GRAY: [number, number, number] = [0.43, 0.47, 0.53];
const LIGHT: [number, number, number] = [0.95, 0.95, 0.95];
const HAIR: [number, number, number] = [0.84, 0.75, 0.51];

type EmbeddedPng = { width: number; height: number; rgb: Buffer; alpha?: Buffer };

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function money(value: unknown) {
  return num(value).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function date(value: unknown) {
  if (!value) return '-';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  });
}

function clean(value: unknown) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, ' ')
    .trim();
}

function pdfEscape(value: string) {
  return clean(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrap(value: unknown, maxChars: number) {
  const words = clean(value).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) current = word;
    else if ((current + ' ' + word).length <= maxChars) current += ' ' + word;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

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
    }];
  }
  return [];
}

function humanPaymentMethod(value: unknown) {
  const raw = clean(value);
  if (!raw) return 'Not specified';
  return raw
    .split('_')
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(' ');
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function loadLogoPng(): EmbeddedPng | null {
  try {
    const file = fs.readFileSync(
      path.join(process.cwd(), 'src', 'lib', 'sales', 'documents', 'templates', 'Emmytech2.png'),
    );
    if (!file.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;

    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    const idat: Buffer[] = [];

    while (offset + 12 <= file.length) {
      const length = file.readUInt32BE(offset);
      const type = file.toString('ascii', offset + 4, offset + 8);
      const data = file.subarray(offset + 8, offset + 8 + length);
      if (type === 'IHDR') {
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        bitDepth = data[8];
        colorType = data[9];
      } else if (type === 'IDAT') {
        idat.push(data);
      } else if (type === 'IEND') {
        break;
      }
      offset += 12 + length;
    }

    if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colorType)) return null;

    const channels = colorType === 6 ? 4 : 3;
    const stride = width * channels;
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const recon = Buffer.alloc(height * stride);
    let src = 0;

    for (let y = 0; y < height; y++) {
      const filter = raw[src++];
      const row = raw.subarray(src, src + stride);
      src += stride;
      for (let x = 0; x < stride; x++) {
        const left = x >= channels ? recon[y * stride + x - channels] : 0;
        const up = y > 0 ? recon[(y - 1) * stride + x] : 0;
        const upLeft = y > 0 && x >= channels ? recon[(y - 1) * stride + x - channels] : 0;
        let v = row[x];
        if (filter === 1) v = (v + left) & 255;
        else if (filter === 2) v = (v + up) & 255;
        else if (filter === 3) v = (v + Math.floor((left + up) / 2)) & 255;
        else if (filter === 4) v = (v + paeth(left, up, upLeft)) & 255;
        recon[y * stride + x] = v;
      }
    }

    if (colorType === 2) {
      return { width, height, rgb: zlib.deflateSync(recon) };
    }

    const rgb = Buffer.alloc(width * height * 3);
    const alpha = Buffer.alloc(width * height);
    for (let i = 0, p = 0, a = 0; i < recon.length; i += 4) {
      rgb[p++] = recon[i];
      rgb[p++] = recon[i + 1];
      rgb[p++] = recon[i + 2];
      alpha[a++] = recon[i + 3];
    }
    return { width, height, rgb: zlib.deflateSync(rgb), alpha: zlib.deflateSync(alpha) };
  } catch {
    return null;
  }
}

function makePdf(stream: string, logo?: EmbeddedPng | null) {
  const objects: Buffer[] = [];
  const add = (body: string | Buffer) => {
    objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body, 'binary'));
    return objects.length;
  };

  const regular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const italic = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>');

  let logoId: number | null = null;
  if (logo) {
    let alphaId: number | null = null;
    if (logo.alpha) {
      alphaId = add(Buffer.concat([
        Buffer.from(
          `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${logo.alpha.length} >>\nstream\n`,
          'binary',
        ),
        logo.alpha,
        Buffer.from('\nendstream', 'binary'),
      ]));
    }

    logoId = add(Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode${alphaId ? ` /SMask ${alphaId} 0 R` : ''} /Length ${logo.rgb.length} >>\nstream\n`,
        'binary',
      ),
      logo.rgb,
      Buffer.from('\nendstream', 'binary'),
    ]));
  }

  const streamBuffer = Buffer.from(stream, 'binary');
  const content = add(Buffer.concat([
    Buffer.from(`<< /Length ${streamBuffer.length} >>\nstream\n`, 'binary'),
    streamBuffer,
    Buffer.from('\nendstream', 'binary'),
  ]));

  const pageId = objects.length + 1;
  const pagesId = pageId + 1;
  const xObject = logoId ? ` /XObject << /Logo ${logoId} 0 R >>` : '';
  add(
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R /F3 ${italic} 0 R >>${xObject} >> /Contents ${content} 0 R >>`,
  );
  add(`<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`);
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n', 'binary')];
  const offsets = [0];
  let total = chunks[0].length;

  objects.forEach((body, index) => {
    offsets[index + 1] = total;
    const chunk = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, 'binary'),
      body,
      Buffer.from('\nendobj\n', 'binary'),
    ]);
    chunks.push(chunk);
    total += chunk.length;
  });

  const xrefOffset = total;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'binary'));

  return Buffer.concat(chunks);
}

function text(
  cmd: string[],
  value: unknown,
  x: number,
  y: number,
  size: number,
  font: 'F1' | 'F2' | 'F3' = 'F1',
  rgb: [number, number, number] = [0, 0, 0],
) {
  cmd.push(
    `BT /${font} ${size} Tf ${rgb[0]} ${rgb[1]} ${rgb[2]} rg 1 0 0 1 ${x} ${y} Tm (${pdfEscape(String(value ?? ''))}) Tj ET`,
  );
}

function line(
  cmd: string[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rgb: [number, number, number],
  width = 1,
) {
  cmd.push(`${rgb[0]} ${rgb[1]} ${rgb[2]} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
}

function fillPolygon(cmd: string[], points: Array<[number, number]>, rgb: [number, number, number]) {
  if (!points.length) return;
  const [first, ...rest] = points;
  cmd.push(
    `${rgb[0]} ${rgb[1]} ${rgb[2]} rg ${first[0]} ${first[1]} m ${rest.map(([x, y]) => `${x} ${y} l`).join(' ')} h f`,
  );
}

function fillRect(
  cmd: string[],
  x: number,
  y: number,
  width: number,
  height: number,
  rgb: [number, number, number],
) {
  cmd.push(`${rgb[0]} ${rgb[1]} ${rgb[2]} rg ${x} ${y} ${width} ${height} re f`);
}

function strokeRect(
  cmd: string[],
  x: number,
  y: number,
  width: number,
  height: number,
  rgb: [number, number, number],
  lineWidth = 0.6,
) {
  cmd.push(`${rgb[0]} ${rgb[1]} ${rgb[2]} RG ${lineWidth} w ${x} ${y} ${width} ${height} re S`);
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

  // Approved blue/gold page treatment.
  fillPolygon(cmd, [[0, PAGE_H], [PAGE_W, PAGE_H], [PAGE_W, PAGE_H - 27], [0, PAGE_H - 88]], BLUE);
  line(cmd, 0, PAGE_H - 90, PAGE_W, PAGE_H - 29, GOLD, 2.6);
  line(cmd, 0, PAGE_H - 96, PAGE_W, PAGE_H - 35, [1, 0.84, 0.48], 1);
  fillPolygon(cmd, [[0, 0], [148, 0], [0, 58]], BLUE);
  line(cmd, 0, 61, 148, 0, GOLD, 2.2);

  // Header.
  text(cmd, 'PAYMENT', 42, 724, 23, 'F2', BLUE);
  text(cmd, 'RECEIPT', 156, 724, 23, 'F2');
  text(
    cmd,
    'Computer Resources - Professional Tech Solutions & ICT Consultancy',
    42,
    703,
    7.5,
    'F3',
    GRAY,
  );

  const logo = loadLogoPng();
  if (logo) {
    // Preserve the full logo inside a dedicated right-side header box.
    const maxW = 126;
    const maxH = 55;
    const scale = Math.min(maxW / logo.width, maxH / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    const x = 553 - w;
    const y = 704;
    cmd.push(`q ${w} 0 0 ${h} ${x} ${y} cm /Logo Do Q`);
  } else {
    text(cmd, 'EMMY', 433, 730, 16, 'F2', BLUE);
    text(cmd, 'TECHNOLOGY', 476, 730, 16, 'F2', GOLD);
  }

  // Meta.
  text(cmd, 'Receipt No:', 42, 676, 7.5, 'F2');
  text(cmd, input.documentNumber, 94, 676, 7.5, 'F2', BLUE);
  text(cmd, 'Date Issued:', 210, 676, 7.5, 'F2');
  text(cmd, date(input.issuedAt), 269, 676, 7.5);
  text(cmd, `${referenceLabel}:`, 397, 676, 7.5, 'F2');
  text(cmd, sourceReference, 447, 676, 7.5);
  line(cmd, 42, 662, 553, 662, HAIR, 1.4);

  // Customer / status.
  text(cmd, 'RECEIVED FROM', 42, 638, 8, 'F2', BLUE);
  text(cmd, customerName, 42, 620, 13, 'F2');
  text(cmd, customerContact, 42, 606, 7.5);
  text(cmd, 'PAYMENT STATUS', 440, 638, 8, 'F2', BLUE);
  text(cmd, paymentStatus, 440, 620, 11, 'F2', GRAY);

  // Item table.
  text(cmd, 'SERVICE & PRODUCT RECEIPT', 58, 578, 10, 'F2', BLUE);

  const tableX = 58;
  const tableW = 479;
  const snW = 32;
  const amountW = 92;
  let y = 552;

  fillRect(cmd, tableX, y, tableW, 20, BLUE);
  text(cmd, 'S/N', tableX + 7, y + 6, 7.5, 'F2', [1, 1, 1]);
  text(cmd, 'Description of Services & Products', tableX + snW + 8, y + 6, 7.5, 'F2', [1, 1, 1]);
  text(cmd, 'Amount (NGN)', tableX + tableW - amountW + 8, y + 6, 7.5, 'F2', [1, 1, 1]);

  y -= 20;
  const shownRows = rows.length
    ? rows.slice(0, 10)
    : [{ item_name: 'Service / product', quantity: 1, line_total: total }];

  shownRows.forEach((row, index) => {
    const qty = Math.max(1, num(row.quantity));
    const description =
      clean(row.item_name || row.description || 'Item') + (qty > 1 ? ` (${qty} units)` : '');
    const amount = num(row.line_total ?? num(row.unit_price ?? row.final_unit_price) * qty);
    const wrapped = wrap(description, 57).slice(0, 2);
    const rowH = Math.max(19, wrapped.length * 10 + 7);

    strokeRect(cmd, tableX, y - rowH + 20, tableW, rowH, HAIR, 0.45);
    line(cmd, tableX + snW, y - rowH + 20, tableX + snW, y + 20, HAIR, 0.45);
    line(cmd, tableX + tableW - amountW, y - rowH + 20, tableX + tableW - amountW, y + 20, HAIR, 0.45);

    text(cmd, String(index + 1), tableX + 10, y + 5, 7.5);
    wrapped.forEach((part, j) => {
      text(cmd, part, tableX + snW + 8, y + 5 - j * 10, 7.5);
    });
    text(cmd, money(amount), tableX + tableW - amountW + 10, y + 5, 7.5, 'F2');

    y -= rowH;
  });

  const totalH = 21;
  fillRect(cmd, tableX, y - totalH + 20, tableW, totalH, LIGHT);
  strokeRect(cmd, tableX, y - totalH + 20, tableW, totalH, HAIR, 0.45);
  line(cmd, tableX + snW, y - totalH + 20, tableX + snW, y + 20, HAIR, 0.45);
  line(cmd, tableX + tableW - amountW, y - totalH + 20, tableX + tableW - amountW, y + 20, HAIR, 0.45);
  text(cmd, 'TRANSACTION TOTAL', tableX + snW + 8, y + 5, 8, 'F2');
  text(cmd, `NGN ${money(total)}`, tableX + tableW - amountW + 8, y + 5, 8, 'F2');

  y -= totalH + 24;

  // Right-side payment summary.
  const summaryX = 350;
  text(cmd, 'Amount Received:', summaryX, y, 8, 'F2');
  text(cmd, `NGN ${money(amountReceived)}`, 462, y, 8, 'F2');
  text(cmd, 'Total Paid to Date:', summaryX, y - 16, 8);
  text(cmd, `NGN ${money(totalPaid)}`, 462, y - 16, 8);
  text(cmd, 'Balance Due:', summaryX, y - 32, 8, 'F2');
  text(cmd, `NGN ${money(balance)}`, 462, y - 32, 8, 'F2');

  const sectionY = y - 78;

  text(cmd, 'SERVICE NOTES', 42, sectionY, 9, 'F2', BLUE);
  [
    'All items are genuine and tested',
    'Installation materials include applicable warranty',
    'Professional service and after-sales support',
    'This receipt records payment actually received',
  ].forEach((note, index) => {
    text(cmd, `- ${note}`, 42, sectionY - 18 - index * 13, 7.5);
  });

  // Payment details align directly under the payment summary.
  text(cmd, 'PAYMENT DETAILS', summaryX, sectionY, 9, 'F2', BLUE);
  [
    `Payment method: ${paymentMethod}`,
    `Payment reference: ${paymentReference}`,
    `Payment date: ${paymentDate}`,
    'Issued by Emmy Technology',
  ].forEach((detail, index) => {
    text(cmd, `- ${detail}`, summaryX, sectionY - 18 - index * 13, 7.5);
  });

  const settlementY = sectionY - 105;

  if (balance <= 0) {
    text(cmd, 'SETTLEMENT STATUS', 42, settlementY, 9, 'F2', BLUE);
    text(cmd, 'This transaction is fully settled. No further payment is due.', 42, settlementY - 20, 7.5);
    text(cmd, 'Retain this receipt as proof of payment.', 42, settlementY - 36, 7.5, 'F3', GRAY);
  } else {
    text(cmd, 'OUTSTANDING BALANCE', 42, settlementY, 9, 'F2', BLUE);
    text(
      cmd,
      `Balance of NGN ${money(balance)} remains on this transaction.`,
      42,
      settlementY - 20,
      7.5,
    );
    text(cmd, 'To settle, transfer to the account below:', 42, settlementY - 34, 7.5);

    const bx = 42;
    const by = settlementY - 102;
    const bw = 245;
    const bh = 58;

    strokeRect(cmd, bx, by, bw, bh, HAIR, 0.6);
    line(cmd, bx + 82, by, bx + 82, by + bh, HAIR, 0.5);
    line(cmd, bx, by + 19, bx + bw, by + 19, HAIR, 0.5);
    line(cmd, bx, by + 38, bx + bw, by + 38, HAIR, 0.5);

    text(cmd, 'Account Name:', bx + 7, by + 43, 7, 'F2');
    text(cmd, 'Emmy Technologies PC PROFESSIONAL', bx + 89, by + 43, 6.7);
    text(cmd, 'Account No:', bx + 7, by + 24, 7, 'F2');
    text(cmd, '5128460113', bx + 89, by + 24, 7, 'F2');
    text(cmd, 'Bank:', bx + 7, by + 5, 7, 'F2');
    text(cmd, 'Moniepoint', bx + 89, by + 5, 7, 'F2');
    text(
      cmd,
      `Quote ${sourceReference} as your payment reference.`,
      42,
      by - 18,
      7.3,
      'F3',
    );
  }

  text(cmd, 'WITH THANKS', summaryX, settlementY, 9, 'F2', BLUE);
  wrap('Thank you for your payment and for choosing Emmy Technology.', 47)
    .slice(0, 2)
    .forEach((part, index) => {
      text(cmd, part, summaryX, settlementY - 20 - index * 13, 7.5, 'F3', GRAY);
    });

  // Footer.
  line(cmd, 42, 91, 553, 91, GOLD, 1.6);
  text(cmd, 'Thank you for choosing Emmy Technology!', 201, 73, 8.5, 'F2', BLUE);
  text(cmd, 'We value our partnership and look forward to working with you again.', 165, 59, 7);
  text(
    cmd,
    '+234 814 650 3700   |   www.emmytechnology.com   |   support@emmytechnology.com   |   Sango branch, Ibadan',
    74,
    39,
    6.5,
  );

  return makePdf(cmd.join('\n'), logo);
}
