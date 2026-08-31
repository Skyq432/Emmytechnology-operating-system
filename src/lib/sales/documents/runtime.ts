import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  buildQuotationTemplateData,
  buildReceiptTemplateData,
  buildRefundTemplateData,
  renderLatexTemplate,
  type JsonRecord,
} from './template-data';

const execFileAsync = promisify(execFile);
export type SalesDocumentType = 'payment_receipt' | 'final_sales_receipt' | 'quotation_pdf' | 'refund_document';

export function getDocumentTemplateName(type: SalesDocumentType) {
  if (type === 'quotation_pdf') return 'quotation.tex';
  if (type === 'refund_document') return 'refund.tex';
  return 'receipt.tex';
}

export function getDocumentEmailCopy(type: SalesDocumentType, number: string) {
  if (type === 'quotation_pdf') return { subject: `Emmy Technology Quotation ${number}`, text: `Please find attached quotation ${number} from Emmy Technology.` };
  if (type === 'refund_document') return { subject: `Emmy Technology Refund ${number}`, text: `Please find attached refund confirmation ${number} from Emmy Technology.` };
  if (type === 'final_sales_receipt') return { subject: `Emmy Technology Sales Receipt ${number}`, text: `Thank you for your business. Please find attached your final sales receipt ${number}.` };
  return { subject: `Emmy Technology Payment Receipt ${number}`, text: `Thank you for your payment. Please find attached payment receipt ${number}.` };
}

function templateDir() {
  return path.join(process.cwd(), 'src', 'lib', 'sales', 'documents', 'templates');
}

export async function buildDocumentLatex(input: {
  documentNumber: string;
  documentType: SalesDocumentType;
  issuedAt: string;
  snapshot: JsonRecord;
}) {
  const templateName = getDocumentTemplateName(input.documentType);
  const template = await fs.readFile(path.join(templateDir(), templateName), 'utf8');
  const common = { documentNumber: input.documentNumber, issuedAt: input.issuedAt, snapshot: input.snapshot };
  const data = input.documentType === 'quotation_pdf'
    ? buildQuotationTemplateData(common)
    : input.documentType === 'refund_document'
      ? buildRefundTemplateData(common)
      : buildReceiptTemplateData(common);
  return renderLatexTemplate(template, data);
}

async function renderRemote(source: string, logo: Buffer): Promise<Buffer> {
  const url = process.env.SALES_LATEX_RENDER_URL?.trim();
  if (!url) throw new Error('Remote LaTeX renderer is not configured');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (process.env.SALES_LATEX_RENDER_TOKEN) headers.authorization = `Bearer ${process.env.SALES_LATEX_RENDER_TOKEN}`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ source, assets: { 'Emmytech2.png': logo.toString('base64') } }),
  });
  if (!response.ok) throw new Error(`Remote LaTeX renderer failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/pdf')) throw new Error(`Remote LaTeX renderer returned unexpected content type: ${type || 'unknown'}`);
  return Buffer.from(await response.arrayBuffer());
}

async function renderLocal(source: string, logo: Buffer): Promise<Buffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'emmytech-sales-doc-'));
  try {
    await fs.writeFile(path.join(dir, 'document.tex'), source, 'utf8');
    await fs.writeFile(path.join(dir, 'Emmytech2.png'), logo);
    await execFileAsync(
      process.env.SALES_PDFLATEX_BIN || 'pdflatex',
      ['-interaction=nonstopmode', '-halt-on-error', 'document.tex'],
      { cwd: dir, timeout: 30000, maxBuffer: 2_000_000 }
    );
    return await fs.readFile(path.join(dir, 'document.pdf'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export async function renderDocumentPdf(input: {
  documentNumber: string;
  documentType: SalesDocumentType;
  issuedAt: string;
  snapshot: JsonRecord;
}): Promise<Buffer> {
  const source = await buildDocumentLatex(input);
  const logo = await fs.readFile(path.join(templateDir(), 'Emmytech2.png'));
  if (process.env.SALES_LATEX_RENDER_URL?.trim()) return renderRemote(source, logo);
  try {
    return await renderLocal(source, logo);
  } catch (error) {
    const typed = error as NodeJS.ErrnoException;
    if (typed.code === 'ENOENT') {
      throw new Error('pdflatex is unavailable. Configure SALES_LATEX_RENDER_URL for hosted document generation.');
    }
    throw error;
  }
}
