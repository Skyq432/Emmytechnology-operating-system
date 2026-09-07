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


function renderApprovedReceiptPdf(input: { documentNumber: string; issuedAt: string; snapshot: JsonRecord }) {
  const s = input.snapshot || {};
  const rows = items(s);
  const total = num(s.transaction_total ?? s.total_amount);
  const totalPaid = num(s.cumulative_paid ?? s.total_paid ?? (Array.isArray(s.payments) ? (s.payments as JsonRecord[]).reduce((sum, p) => sum + num(p.amount), 0) : 0));
  const balance = Math.max(0, num(s.balance_due ?? total - totalPaid));
  const paymentAmount = num(s.payment_amount ?? totalPaid);
  const status = balance <= 0 && totalPaid >= total && total > 0 ? 'PAID IN FULL' : totalPaid > 0 ? 'PART PAYMENT' : 'PAYMENT RECORDED';
  const sourceRef = clean(s.source_code || input.documentNumber);
  const referenceLabel = s.source_type === 'repair' ? 'Repair Ref' : 'Order Ref';
  const customer = clean(s.customer_name || 'Customer');
  const contact = [s.customer_phone, s.customer_email].filter(Boolean).map(clean).join(' | ') || 'Nigeria';
  const method = clean(s.payment_method || 'Not specified').replace(/_/g,' ');
  const paymentReference = clean(s.payment_reference || '-');
  const paymentDate = date(s.paid_at || input.issuedAt);

  const lines: PdfLine[] = [];
  const rules: Array<{x1:number;y1:number;x2:number;y2:number;rgb:[number,number,number];width:number}> = [];

  // Approved top arc/gold-trim visual language.
  rules.push({x1:0,y1:754,x2:PAGE_W,y2:816,rgb:YELLOW,width:3});
  rules.push({x1:0,y1:748,x2:PAGE_W,y2:810,rgb:[1,.84,.48],width:1});
  lines.push({text:'PAYMENT',x:42,y:720,size:23,bold:true,rgb:BLUE});
  lines.push({text:'RECEIPT',x:155,y:720,size:23,bold:true,rgb:[0,0,0]});
  lines.push({text:'Computer Resources - Professional Tech Solutions & ICT Consultancy',x:42,y:701,size:7,rgb:[.43,.47,.53]});

  // EmmyTech brand mark is right-aligned; receipt source remains receipt.tex.
  lines.push({text:'EMMY',x:433,y:728,size:16,bold:true,rgb:BLUE});
  lines.push({text:'TECHNOLOGY',x:476,y:728,size:16,bold:true,rgb:YELLOW});

  lines.push({text:'Receipt No:',x:42,y:676,size:7.5,bold:true});
  lines.push({text:input.documentNumber,x:94,y:676,size:7.5,bold:true,rgb:BLUE});
  lines.push({text:'Date Issued:',x:210,y:676,size:7.5,bold:true});
  lines.push({text:date(input.issuedAt),x:269,y:676,size:7.5});
  lines.push({text:referenceLabel+':',x:397,y:676,size:7.5,bold:true});
  lines.push({text:sourceRef,x:447,y:676,size:7.5});
  rules.push({x1:42,y1:662,x2:553,y2:662,rgb:[.84,.75,.51],width:1.4});

  lines.push({text:'RECEIVED FROM',x:42,y:638,size:8,bold:true,rgb:BLUE});
  lines.push({text:customer,x:42,y:620,size:13,bold:true});
  lines.push({text:contact,x:42,y:606,size:7.5});
  lines.push({text:'PAYMENT STATUS',x:440,y:638,size:8,bold:true,rgb:BLUE});
  lines.push({text:status,x:440,y:620,size:11,bold:true,rgb:[.43,.47,.53]});

  lines.push({text:'SERVICE & PRODUCT RECEIPT',x:58,y:578,size:10,bold:true,rgb:BLUE});
  let y=552;
  lines.push({text:'S/N',x:64,y,size:7.5,bold:true,rgb:BLUE});
  lines.push({text:'Description of Services & Products',x:104,y,size:7.5,bold:true,rgb:BLUE});
  lines.push({text:'Amount (NGN)',x:459,y,size:7.5,bold:true,rgb:BLUE});
  rules.push({x1:58,y1:y-7,x2:537,y2:y-7,rgb:BLUE,width:1.5});
  y-=24;

  const shown=rows.length?rows.slice(0,10):[{item_name:'Service / product',quantity:1,line_total:total}];
  shown.forEach((row,index)=>{
    const qty=Math.max(1,num(row.quantity));
    const desc=clean(row.item_name || row.description || 'Item') + (qty>1 ? ' ('+qty+' units)' : '');
    const amount=num(row.line_total ?? (num(row.final_unit_price ?? row.unit_price)*qty));
    const wrapped=wrap(desc,56).slice(0,2);
    lines.push({text:String(index+1),x:66,y,size:7.5});
    wrapped.forEach((part,j)=>lines.push({text:part,x:104,y:y-(j*10),size:7.5}));
    lines.push({text:money(amount).replace('NGN ',''),x:467,y,size:7.5,bold:true});
    y-=Math.max(21,wrapped.length*11+6);
  });
  rules.push({x1:58,y1:y+7,x2:537,y2:y+7,rgb:[.84,.75,.51],width:.7});
  lines.push({text:'TRANSACTION TOTAL',x:330,y:y-12,size:8,bold:true});
  lines.push({text:'NGN '+money(total).replace('NGN ',''),x:459,y:y-12,size:8,bold:true});
  y-=50;

  const sumX=350;
  lines.push({text:'Amount Received:',x:sumX,y,size:8,bold:true});
  lines.push({text:'NGN '+money(paymentAmount).replace('NGN ',''),x:462,y,size:8,bold:true});
  lines.push({text:'Total Paid to Date:',x:sumX,y:y-16,size:8});
  lines.push({text:'NGN '+money(totalPaid).replace('NGN ',''),x:462,y:y-16,size:8});
  lines.push({text:'Balance Due:',x:sumX,y:y-32,size:8,bold:true});
  lines.push({text:'NGN '+money(balance).replace('NGN ',''),x:462,y:y-32,size:8,bold:true});

  const sectionY=y-78;
  lines.push({text:'SERVICE NOTES',x:42,y:sectionY,size:9,bold:true,rgb:BLUE});
  [
    'All items are genuine and tested',
    'Installation materials include applicable warranty',
    'Professional service and after-sales support',
    'This receipt records payment actually received',
  ].forEach((note,i)=>lines.push({text:'- '+note,x:42,y:sectionY-18-(i*13),size:7.5}));

  // Payment details deliberately align directly below the balance summary.
  lines.push({text:'PAYMENT DETAILS',x:sumX,y:sectionY,size:9,bold:true,rgb:BLUE});
  [
    'Payment method: '+method,
    'Payment reference: '+paymentReference,
    'Payment date: '+paymentDate,
    'Issued by Emmy Technology',
  ].forEach((detail,i)=>lines.push({text:'- '+detail,x:sumX,y:sectionY-18-(i*13),size:7.5}));

  const settleY=sectionY-105;
  if(balance<=0){
    lines.push({text:'SETTLEMENT STATUS',x:42,y:settleY,size:9,bold:true,rgb:BLUE});
    lines.push({text:'This transaction is fully settled. No further payment is due.',x:42,y:settleY-20,size:7.5});
    lines.push({text:'Retain this receipt as proof of payment.',x:42,y:settleY-36,size:7.5,rgb:[.43,.47,.53]});
  } else {
    lines.push({text:'OUTSTANDING BALANCE',x:42,y:settleY,size:9,bold:true,rgb:BLUE});
    lines.push({text:'Balance of NGN '+money(balance).replace('NGN ','')+' remains on this transaction.',x:42,y:settleY-20,size:7.5});
    lines.push({text:'To settle, transfer to the account below:',x:42,y:settleY-34,size:7.5});
    lines.push({text:'Account Name: Emmy Technologies PC PROFESSIONAL',x:42,y:settleY-55,size:7.2,bold:true});
    lines.push({text:'Account No: 5128460113',x:42,y:settleY-70,size:7.2,bold:true});
    lines.push({text:'Bank: Moniepoint',x:42,y:settleY-85,size:7.2,bold:true});
    lines.push({text:'Quote '+sourceRef+' as your payment reference.',x:42,y:settleY-103,size:7.2,rgb:[.43,.47,.53]});
  }
  lines.push({text:'WITH THANKS',x:sumX,y:settleY,size:9,bold:true,rgb:BLUE});
  wrap('Thank you for your payment and for choosing Emmy Technology.',47).slice(0,2)
    .forEach((part,i)=>lines.push({text:part,x:sumX,y:settleY-20-(i*13),size:7.5,rgb:[.43,.47,.53]}));

  rules.push({x1:42,y1:91,x2:553,y2:91,rgb:YELLOW,width:1.6});
  lines.push({text:'Thank you for choosing Emmy Technology!',x:201,y:73,size:8.5,bold:true,rgb:BLUE});
  lines.push({text:'We value our partnership and look forward to working with you again.',x:165,y:59,size:7});
  lines.push({text:'+234 814 650 3700 | www.emmytechnology.com | support@emmytechnology.com | Sango branch, Ibadan',x:74,y:39,size:6.5});

  return makePdf(pageContent(lines,rules));
}

function renderNonReceiptFallbackPdf(input: { documentNumber: string; documentType: 'quotation_pdf' | 'refund_document'; issuedAt: string; snapshot: JsonRecord }) {
  const model = input.documentType === 'quotation_pdf' ? buildQuotationLines(input) : buildRefundLines(input);
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

  if (model.title === 'REFUND') {
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


export function renderFallbackSalesPdf(input: { documentNumber: string; documentType: FallbackPdfType; issuedAt: string; snapshot: JsonRecord }) {
  if (input.documentType === 'payment_receipt' || input.documentType === 'final_sales_receipt') {
    return renderApprovedReceiptPdf(input);
  }
  return renderNonReceiptFallbackPdf({ ...input, documentType: input.documentType });
}
