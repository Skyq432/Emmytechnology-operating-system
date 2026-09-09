// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { getDocumentTemplateName, getDocumentEmailCopy } from './runtime.ts';

test('document types map to the correct EmmyTech template', () => {
  assert.equal(getDocumentTemplateName('payment_receipt'), 'receipt.tex');
  assert.equal(getDocumentTemplateName('final_sales_receipt'), 'receipt.tex');
  assert.equal(getDocumentTemplateName('quotation_pdf'), 'quotation.tex');
  assert.equal(getDocumentTemplateName('refund_document'), 'refund.tex');
});

test('document email copy describes receipts, quotations and refunds correctly', () => {
  assert.match(getDocumentEmailCopy('payment_receipt', 'RCT-P-1').subject, /Payment Receipt/);
  assert.match(getDocumentEmailCopy('final_sales_receipt', 'RCT-S-1').subject, /Sales Receipt/);
  assert.match(getDocumentEmailCopy('quotation_pdf', 'QT-1').subject, /Quotation/);
  assert.match(getDocumentEmailCopy('refund_document', 'RCT-R-1').subject, /Refund/);
});
