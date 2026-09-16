import zlib from 'node:zlib';
import type { JsonRecord } from '../template-data';
import { EMMYTECH_LOGO_PNG_BASE64 } from './logo-data.ts';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
// Approved premium palette (navy + gold), carried over from the design review.
const NAVY: [number, number, number] = [0, 0.2, 0.4];
const NAVY_DEEP: [number, number, number] = [0, 0.106, 0.2];
const GOLD: [number, number, number] = [1, 0.72, 0];
const GOLD_LIGHT: [number, number, number] = [1, 0.84, 0.48];
const GOLD_PALE: [number, number, number] = [1, 0.937, 0.761];
const GRAY: [number, number, number] = [0.43, 0.47, 0.53];
const INK: [number, number, number] = [0.11, 0.17, 0.23];
const LIGHT: [number, number, number] = [0.95, 0.95, 0.95];
const HAIR: [number, number, number] = [0.84, 0.75, 0.51];
const PAPER: [number, number, number] = [1, 0.992, 0.973];
const ROW_TINT: [number, number, number] = [0.976, 0.965, 0.933];
const SUCCESS_BG: [number, number, number] = [1, 0.953, 0.816];
const PARTIAL_BG: [number, number, number] = [0.992, 0.945, 0.886];
const PARTIAL_BORDER: [number, number, number] = [0.89, 0.72, 0.47];
const PARTIAL_INK: [number, number, number] = [0.631, 0.384, 0.106];
const HELVETICA_WIDTHS: Record<string, number> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278,
  J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
  S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222,
  j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333,
  s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  '{': 334, '|': 260, '}': 334, '~': 584,
};

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

function helveticaTextWidth(value: unknown, size: number) {
  const units = [...clean(value)].reduce((total, character) => {
    if (/\d/.test(character)) return total + 556;
    return total + (HELVETICA_WIDTHS[character] ?? 556);
  }, 0);
  return units * size / 1000;
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
    const file = Buffer.from(EMMYTECH_LOGO_PNG_BASE64, 'base64');
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

function roundedRectPath(x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  const k = r * 0.5523;
  return [
    `${x + r} ${y} m`,
    `${x + width - r} ${y} l`,
    `${x + width - r + k} ${y} ${x + width} ${y + r - k} ${x + width} ${y + r} c`,
    `${x + width} ${y + height - r} l`,
    `${x + width} ${y + height - r + k} ${x + width - r + k} ${y + height} ${x + width - r} ${y + height} c`,
    `${x + r} ${y + height} l`,
    `${x + r - k} ${y + height} ${x} ${y + height - r + k} ${x} ${y + height - r} c`,
    `${x} ${y + r} l`,
    `${x} ${y + r - k} ${x + r - k} ${y} ${x + r} ${y} c`,
    'h',
  ];
}

function fillRoundedRect(
  cmd: string[],
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  rgb: [number, number, number],
) {
  cmd.push(`${rgb[0]} ${rgb[1]} ${rgb[2]} rg`, ...roundedRectPath(x, y, width, height, radius), 'f');
}

function strokeRoundedRect(
  cmd: string[],
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  rgb: [number, number, number],
  lineWidth = 0.6,
) {
  cmd.push(`${rgb[0]} ${rgb[1]} ${rgb[2]} RG ${lineWidth} w`, ...roundedRectPath(x, y, width, height, radius), 'S');
}

function strokeCircle(
  cmd: string[],
  cx: number,
  cy: number,
  r: number,
  rgb: [number, number, number],
  lineWidth = 1,
) {
  const k = r * 0.5523;
  cmd.push(
    `${rgb[0]} ${rgb[1]} ${rgb[2]} RG ${lineWidth} w`,
    `${cx + r} ${cy} m`,
    `${cx + r} ${cy + k} ${cx + k} ${cy + r} ${cx} ${cy + r} c`,
    `${cx - k} ${cy + r} ${cx - r} ${cy + k} ${cx - r} ${cy} c`,
    `${cx - r} ${cy - k} ${cx - k} ${cy - r} ${cx} ${cy - r} c`,
    `${cx + k} ${cy - r} ${cx + r} ${cy - k} ${cx + r} ${cy} c`,
    'S',
  );
}

function diamond(cmd: string[], cx: number, cy: number, r: number, rgb: [number, number, number]) {
  fillPolygon(cmd, [[cx, cy + r], [cx + r, cy], [cx, cy - r], [cx - r, cy]], rgb);
}

function textRight(
  cmd: string[],
  value: unknown,
  rightX: number,
  y: number,
  size: number,
  font: 'F1' | 'F2' | 'F3' = 'F1',
  rgb: [number, number, number] = [0, 0, 0],
) {
  const w = helveticaTextWidth(value, size);
  text(cmd, value, rightX - w, y, size, font, rgb);
}

function centeredText(
  cmd: string[],
  value: unknown,
  cx: number,
  y: number,
  size: number,
  font: 'F1' | 'F2' | 'F3' = 'F1',
  rgb: [number, number, number] = [0, 0, 0],
) {
  const w = helveticaTextWidth(value, size);
  text(cmd, value, cx - w / 2, y, size, font, rgb);
}

function sectionTitle(cmd: string[], label: string, x: number, y: number, endX: number) {
  text(cmd, label, x, y, 10, 'F2', NAVY);
  const w = helveticaTextWidth(label, 10);
  line(cmd, x + w + 8, y + 3.2, endX, y + 3.2, HAIR, 0.8);
}

function statusBadge(
  cmd: string[],
  rightX: number,
  y: number,
  label: string,
  bg: [number, number, number],
  border: [number, number, number],
  ink: [number, number, number],
) {
  const size = 8.5;
  const padX = 10;
  const textW = helveticaTextWidth(label, size);
  const w = textW + padX * 2;
  const h = 17;
  const x = rightX - w;
  fillRoundedRect(cmd, x, y, w, h, h / 2, bg);
  strokeRoundedRect(cmd, x, y, w, h, h / 2, border, 0.8);
  text(cmd, label, x + padX, y + 5.5, size, 'F2', ink);
  return w;
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
    const rowH = Math.max(18, wrapped.length * 10 + 6);

    if (index % 2 === 1) fillRect(cmd, tableX, y - rowH + 12, tableW, rowH, ROW_TINT);

    text(cmd, String(index + 1), tableX, y, 7.5, 'F1', GRAY);
    wrapped.forEach((part, j) => {
      text(cmd, part, tableX + snW, y - j * 10, 7.5, j === 0 ? 'F2' : 'F1', j === 0 ? INK : GRAY);
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
