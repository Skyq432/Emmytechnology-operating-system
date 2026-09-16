import zlib from 'node:zlib';
import { EMMYTECH_LOGO_PNG_BASE64 } from './logo-data.ts';
import { ORDER_ITEM_SPEC_LABELS, orderedSpecEntries, type OrderItemType } from '../../../operations/sales-model.ts';

// Shared premium PDF design system (navy + gold), used by every EmmyTech commercial
// document — receipts and quotations alike — so they read as one family of documents.
export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const NAVY: [number, number, number] = [0, 0.2, 0.4];
export const NAVY_DEEP: [number, number, number] = [0, 0.106, 0.2];
export const GOLD: [number, number, number] = [1, 0.72, 0];
export const GOLD_LIGHT: [number, number, number] = [1, 0.84, 0.48];
export const GOLD_PALE: [number, number, number] = [1, 0.937, 0.761];
export const GRAY: [number, number, number] = [0.43, 0.47, 0.53];
export const INK: [number, number, number] = [0.11, 0.17, 0.23];
export const LIGHT: [number, number, number] = [0.95, 0.95, 0.95];
export const HAIR: [number, number, number] = [0.84, 0.75, 0.51];
export const PAPER: [number, number, number] = [1, 0.992, 0.973];
export const ROW_TINT: [number, number, number] = [0.976, 0.965, 0.933];
export const SUCCESS_BG: [number, number, number] = [1, 0.953, 0.816];
export const PARTIAL_BG: [number, number, number] = [0.992, 0.945, 0.886];
export const PARTIAL_BORDER: [number, number, number] = [0.89, 0.72, 0.47];
export const PARTIAL_INK: [number, number, number] = [0.631, 0.384, 0.106];
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

export type EmbeddedPng = { width: number; height: number; rgb: Buffer; alpha?: Buffer };

export function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function money(value: unknown) {
  return num(value).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function date(value: unknown) {
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

export function clean(value: unknown) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, ' ')
    .trim();
}

export function pdfEscape(value: string) {
  return clean(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function helveticaTextWidth(value: unknown, size: number) {
  const units = [...clean(value)].reduce((total, character) => {
    if (/\d/.test(character)) return total + 556;
    return total + (HELVETICA_WIDTHS[character] ?? 556);
  }, 0);
  return units * size / 1000;
}

export function wrap(value: unknown, maxChars: number) {
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

export function humanPaymentMethod(value: unknown) {
  const raw = clean(value);
  if (!raw) return 'Not specified';
  return raw
    .split('_')
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(' ');
}

export function formatSpecsLine(itemType: unknown, specs: unknown): string {
  if (!specs || typeof specs !== 'object') return '';
  const type = typeof itemType === 'string' ? (itemType as OrderItemType) : null;
  return orderedSpecEntries(type, specs as Record<string, unknown>)
    .map(([key, value]) => {
      const label = ORDER_ITEM_SPEC_LABELS[key] || key.replaceAll('_', ' ');
      if (typeof value === 'boolean') return value ? label.replace(/\?$/, '') : null;
      return `${label.replace(/\?$/, '')}: ${clean(value)}`;
    })
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function loadLogoPng(): EmbeddedPng | null {
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

export function makePdf(stream: string, logo?: EmbeddedPng | null) {
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

export function text(
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

export function line(
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

export function fillPolygon(cmd: string[], points: Array<[number, number]>, rgb: [number, number, number]) {
  if (!points.length) return;
  const [first, ...rest] = points;
  cmd.push(
    `${rgb[0]} ${rgb[1]} ${rgb[2]} rg ${first[0]} ${first[1]} m ${rest.map(([x, y]) => `${x} ${y} l`).join(' ')} h f`,
  );
}

export function fillRect(
  cmd: string[],
  x: number,
  y: number,
  width: number,
  height: number,
  rgb: [number, number, number],
) {
  cmd.push(`${rgb[0]} ${rgb[1]} ${rgb[2]} rg ${x} ${y} ${width} ${height} re f`);
}

export function roundedRectPath(x: number, y: number, width: number, height: number, radius: number) {
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

export function fillRoundedRect(
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

export function strokeRoundedRect(
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

export function strokeCircle(
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

export function diamond(cmd: string[], cx: number, cy: number, r: number, rgb: [number, number, number]) {
  fillPolygon(cmd, [[cx, cy + r], [cx + r, cy], [cx, cy - r], [cx - r, cy]], rgb);
}

export function textRight(
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

export function centeredText(
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

export function sectionTitle(cmd: string[], label: string, x: number, y: number, endX: number) {
  text(cmd, label, x, y, 10, 'F2', NAVY);
  const w = helveticaTextWidth(label, 10);
  line(cmd, x + w + 8, y + 3.2, endX, y + 3.2, HAIR, 0.8);
}

export function statusBadge(
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
