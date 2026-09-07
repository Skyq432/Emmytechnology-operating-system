import type { JsonRecord } from './template-data.ts';

export type FallbackPdfType = 'payment_receipt' | 'final_sales_receipt' | 'quotation_pdf' | 'refund_document';

type PdfLine = { text: string; x: number; y: number; size: number; bold?: boolean; rgb?: [number, number, number] };

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const BLUE: [number, number, number] = [0, 0.2, 0.4];
const YELLOW: [number, number, number] = [1, 0.72, 0];

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function money(value: unknown) {
  return `NGN ${num(value).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function date(value: unknown) {
  if (!value) return '-';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
}
function clean(value: unknown) {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7E]/g, ' ').trim();
}
function pdfEscape(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
function wrap(text: string, maxChars: number) {
  const words = clean(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) current = word;
    else if ((current + ' ' + word).length <= maxChars) current += ' ' + word;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines;
}
function items(snapshot: JsonRecord) {
  const rows = Array.isArray(snapshot.items) ? snapshot.items as JsonRecord[] : [];
  if (rows.length) return rows;
  if (snapshot.source_type === 'repair') {
    return [{
      item_name: [snapshot.device_type, snapshot.brand, snapshot.model, snapshot.repair_type].filter(Boolean).join(' - ') || 'Repair service',
      quantity: 1,
      line_total: snapshot.transaction_total,
    }];
  }
  return [];
}

function buildReceiptLines(input: { documentNumber: string; issuedAt: string; snapshot: JsonRecord }) {
  const s = input.snapshot || {};
  const total = num(s.transaction_total ?? s.total_amount);
  const totalPaid = num(s.cumulative_paid ?? s.total_paid ?? (Array.isArray(s.payments) ? (s.payments as JsonRecord[]).reduce((sum, p) => sum + num(p.amount), 0) : 0));
  const balance = Math.max(0, num(s.balance_due ?? total - totalPaid));
  const paymentAmount = num(s.payment_amount ?? totalPaid);
  const status = balance <= 0 && totalPaid >= total && total > 0 ? 'PAID IN FULL' : totalPaid > 0 ? 'PART PAYMENT' : 'PAYMENT RECORDED';
  const rows = items(s);
  return { title: 'RECEIPT', reference: clean(s.source_code || input.documentNumber), customer: clean(s.customer_name || 'Customer'), contact: [s.customer_phone, s.customer_email].filter(Boolean).map(clean).join(' | ') || 'Nigeria', total, rows, status, paymentAmount, totalPaid, balance, method: clean(s.payment_method || 'Not specified').replace(/_/g,' '), paymentReference: clean(s.payment_reference || '-'), paymentDate: date(s.paid_at || input.issuedAt) };
}

function buildQuotationLines(input: { documentNumber: string; issuedAt: string; snapshot: JsonRecord }) {
  const s = input.snapshot || {};
  const rows = Array.isArray(s.items) ? s.items as JsonRecord[] : [];
  const total = num(s.total_amount ?? s.transaction_total ?? rows.reduce((sum, row) => sum + num(row.line_total ?? num(row.final_unit_price) * Math.max(1, num(row.quantity))), 0));
  return { title: 'QUOTATION', reference: clean(s.quotation_code || input.documentNumber), customer: clean(s.customer_name || 'Customer'), contact: [s.customer_phone, s.customer_email].filter(Boolean).map(clean).join(' | ') || 'Nigeria', total, rows, status: clean(s.status || 'Published').toUpperCase(), validity: date(s.validity_expires_at), terms: clean(s.terms || 'Stock and pricing are subject to availability until confirmation.') };
}

function buildRefundLines(input: { documentNumber: string; issuedAt: string; snapshot: JsonRecord }) {
  const s = input.snapshot || {};
  return { title: 'REFUND', reference: clean(s.order_code || s.source_code || '-'), customer: clean(s.customer_name || 'Customer'), contact: [s.customer_phone, s.customer_email].filter(Boolean).map(clean).join(' | ') || 'Nigeria', total: num(s.refund_amount), rows: [] as JsonRecord[], status: 'REFUND RECORDED', returnReference: clean(s.return_code || '-'), method: clean(s.payment_method || 'Not specified').replace(/_/g,' '), paymentReference: clean(s.reference || '-'), paymentDate: date(s.refunded_at || input.issuedAt) };
}

function pageContent(lines: PdfLine[], rules: Array<{x1:number;y1:number;x2:number;y2:number;rgb:[number,number,number];width:number}>) {
  const out: string[] = [];
  for (const r of rules) out.push(`${r.rgb[0]} ${r.rgb[1]} ${r.rgb[2]} RG ${r.width} w ${r.x1} ${r.y1} m ${r.x2} ${r.y2} l S`);
  for (const line of lines) {
    const color = line.rgb || [0.08,0.12,0.18];
    out.push('BT');
    out.push(`/${line.bold ? 'F2' : 'F1'} ${line.size} Tf`);
    out.push(`${color[0]} ${color[1]} ${color[2]} rg`);
    out.push(`1 0 0 1 ${line.x} ${line.y} Tm`);
    out.push(`(${pdfEscape(clean(line.text))}) Tj`);
    out.push('ET');
  }
  return out.join('\n');
}

function makePdf(stream: string) {
  const objects: string[] = [];
  const add = (body: string) => { objects.push(body); return objects.length; };
  const fontRegular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const fontBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const content = add(`<< /Length ${Buffer.byteLength(stream,'ascii')} >>\nstream\n${stream}\nendstream`);
  const page = add(`<< /Type /Page /Parent 5 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${content} 0 R >>`);
  const pages = add(`<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`);
  const catalog = add(`<< /Type /Catalog /Pages ${pages} 0 R >>`);
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf,'ascii');
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf,'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i=1;i<=objects.length;i++) pdf += String(offsets[i]).padStart(10,'0') + ' 00000 n \n';
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf,'ascii');
}

export function renderFallbackSalesPdf(input: { documentNumber: string; documentType: FallbackPdfType; issuedAt: string; snapshot: JsonRecord }) {
  const model = input.documentType === 'quotation_pdf' ? buildQuotationLines(input) : input.documentType === 'refund_document' ? buildRefundLines(input) : buildReceiptLines(input);
  const lines: PdfLine[] = [];
  const rules: Array<{x1:number;y1:number;x2:number;y2:number;rgb:[number,number,number];width:number}> = [];
  lines.push({ text: 'EMMY', x: 42, y: 795, size: 22, bold: true, rgb: BLUE });
  lines.push({ text: 'TECHNOLOGY', x: 110, y: 795, size: 22, bold: true, rgb: YELLOW });
  lines.push({ text: 'Computer Resources', x: 42, y: 778, size: 10, bold: true, rgb: BLUE });
  lines.push({ text: 'Professional Tech Solutions & ICT Consultancy', x: 42, y: 764, size: 8 });
  lines.push({ text: model.title, x: 410, y: 790, size: 24, bold: true, rgb: [0.72,0.75,0.8] });
  lines.push({ text: `${model.title === 'QUOTATION' ? 'Quotation' : model.title === 'REFUND' ? 'Refund' : 'Receipt'} No: ${input.documentNumber}`, x: 385, y: 768, size: 8, bold: true, rgb: BLUE });
  lines.push({ text: `Date Issued: ${date(input.issuedAt)}`, x: 385, y: 754, size: 8 });
  rules.push({x1:42,y1:738,x2:553,y2:738,rgb:BLUE,width:2});

  lines.push({ text: model.title === 'QUOTATION' ? 'PREPARED FOR:' : model.title === 'REFUND' ? 'REFUND TO:' : 'RECEIVED FROM:', x:42, y:715, size:8, bold:true, rgb:BLUE });
  lines.push({ text: model.customer, x:42, y:697, size:14, bold:true });
  lines.push({ text: model.contact, x:42, y:682, size:8 });
  lines.push({ text: 'STATUS:', x:420, y:715, size:8, bold:true, rgb:BLUE });
  lines.push({ text: model.status, x:420, y:696, size:11, bold:true });
  if ('validity' in model) lines.push({ text: `Valid Until: ${model.validity}`, x:420, y:680, size:8 });
  rules.push({x1:42,y1:660,x2:553,y2:660,rgb:[0.82,0.84,0.88],width:0.8});

  let y = 638;
  lines.push({text:'S/N',x:48,y,size:8,bold:true,rgb:BLUE});
  lines.push({text:'Description of Services & Products',x:92,y,size:8,bold:true,rgb:BLUE});
  lines.push({text:'Amount (NGN)',x:455,y,size:8,bold:true,rgb:BLUE});
  y -= 18;
  if (model.rows.length) {
    model.rows.slice(0,12).forEach((row,index) => {
      const qty=Math.max(1,num(row.quantity));
      const desc=clean(row.item_name || row.description || 'Item') + (qty>1 ? ` (${qty} units)` : '');
      const amount=num(row.line_total ?? (num(row.final_unit_price ?? row.unit_price) * qty));
      const wrapped=wrap(desc,55).slice(0,2);
      lines.push({text:String(index+1),x:50,y,size:8});
      wrapped.forEach((part,j)=>lines.push({text:part,x:92,y:y-(j*11),size:8}));
      lines.push({text:money(amount).replace('NGN ','') ,x:455,y,size:8,bold:true});
      y -= Math.max(24, wrapped.length*12+8);
    });
  } else if (model.title !== 'REFUND') {
    lines.push({text:'1',x:50,y,size:8}); lines.push({text:'Service / product',x:92,y,size:8}); lines.push({text:'0.00',x:455,y,size:8}); y-=24;
  }
  rules.push({x1:42,y1:y+7,x2:553,y2:y+7,rgb:[0.82,0.84,0.88],width:0.8});
  lines.push({text:model.title==='REFUND'?'REFUND AMOUNT':'TOTAL',x:350,y:y-12,size:10,bold:true,rgb:BLUE});
  lines.push({text:money(model.total),x:455,y:y-12,size:10,bold:true});
  y -= 48;

  if (model.title === 'RECEIPT') {
    const r=model as ReturnType<typeof buildReceiptLines>;
    lines.push({text:`Amount Received: ${money(r.paymentAmount)}`,x:330,y,size:9,bold:true});
    lines.push({text:`Total Paid: ${money(r.totalPaid)}`,x:330,y:y-15,size:9});
    lines.push({text:`Balance Due: ${money(r.balance)}`,x:330,y:y-30,size:9,bold:true});
    lines.push({text:`Payment method: ${r.method}`,x:42,y,size:8});
    lines.push({text:`Reference: ${r.paymentReference}`,x:42,y:y-15,size:8});
    lines.push({text:`Payment date: ${r.paymentDate}`,x:42,y:y-30,size:8});
    y -= 62;
  } else if (model.title === 'REFUND') {
    const r=model as ReturnType<typeof buildRefundLines>;
    lines.push({text:`Original order: ${r.reference}`,x:42,y,size:9});
    lines.push({text:`Return reference: ${r.returnReference}`,x:42,y:y-16,size:9});
    lines.push({text:`Method: ${r.method}`,x:42,y:y-32,size:9});
    lines.push({text:`Payment reference: ${r.paymentReference}`,x:330,y,size:9});
    lines.push({text:`Refund date: ${r.paymentDate}`,x:330,y:y-16,size:9});
    y -= 62;
  } else {
    const q=model as ReturnType<typeof buildQuotationLines>;
    lines.push({text:'Terms',x:42,y,size:9,bold:true,rgb:BLUE});
    wrap(q.terms,95).slice(0,3).forEach((part,i)=>lines.push({text:part,x:42,y:y-15-(i*11),size:8}));
    y -= 60;
  }

  lines.push({text:'Sango branch: Shop 9, The 16th shopping plaza beside SPAC Church, Sango-Poly Road, Ibadan.',x:42,y:105,size:7});
  lines.push({text:'Phone: +234 814 650 3700 | support@emmytechnology.com | www.emmytechnology.com',x:42,y:92,size:7});
  rules.push({x1:42,y1:78,x2:553,y2:78,rgb:YELLOW,width:1});
  lines.push({text:'Thank you for choosing Emmy Technology!',x:190,y:61,size:9,bold:true,rgb:BLUE});
  lines.push({text:'We value our partnership and look forward to working with you again.',x:150,y:47,size:7});

  return makePdf(pageContent(lines,rules));
}
