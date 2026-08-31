// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeLatex,
  renderLatexTemplate,
  buildReceiptTemplateData,
  buildQuotationTemplateData,
} from './template-data.ts';

test('escapeLatex neutralizes user-controlled LaTeX special characters', () => {
  assert.equal(
    escapeLatex(String.raw`A&B_50% #1 {test} $5 \\ path`),
    String.raw`A\&B\_50\% \#1 \{test\} \$5 \textbackslash{}\textbackslash{} path`,
  );
});

test('renderLatexTemplate replaces every declared placeholder and rejects unresolved placeholders', () => {
  const result = renderLatexTemplate('Receipt <<NAME>> / <<TOTAL>>', { NAME: 'B-TECH', TOTAL: '1,270,000.00' });
  assert.equal(result, 'Receipt B-TECH / 1,270,000.00');
  assert.throws(() => renderLatexTemplate('Receipt <<NAME>> / <<MISSING>>', { NAME: 'B-TECH' }), /Unresolved LaTeX placeholder/);
});

test('payment receipt data preserves the payment amount, cumulative paid and balance', () => {
  const data = buildReceiptTemplateData({
    documentNumber: 'RCT-P-001',
    issuedAt: '2026-08-31T05:00:00.000Z',
    snapshot: {
      source_type: 'order',
      source_code: 'OPS-100',
      customer_name: 'B&TECH',
      customer_phone: '+2348000000000',
      customer_email: 'hello@example.com',
      items: [{ item_name: 'Laptop & Bag', quantity: 1, unit_price: 650000, line_total: 650000 }],
      transaction_total: 650000,
      payment_amount: 200000,
      cumulative_paid: 200000,
      balance_due: 450000,
      payment_method: 'bank_transfer',
      payment_reference: 'REF_100',
      paid_at: '2026-08-31T04:30:00.000Z',
    },
  });

  assert.equal(data.DOCUMENT_NUMBER, 'RCT-P-001');
  assert.equal(data.SOURCE_REFERENCE, 'OPS-100');
  assert.equal(data.CUSTOMER_NAME, 'B\\&TECH');
  assert.equal(data.AMOUNT_RECEIVED, '200,000.00');
  assert.equal(data.TOTAL_PAID, '200,000.00');
  assert.equal(data.BALANCE_DUE, '450,000.00');
  assert.equal(data.PAYMENT_STATUS, 'Part Payment');
  assert.match(data.ITEM_ROWS, /Laptop \\& Bag/);
});

test('final receipt data shows paid status and full total received when there is no single payment amount', () => {
  const data = buildReceiptTemplateData({
    documentNumber: 'RCT-S-001',
    issuedAt: '2026-08-31T05:00:00.000Z',
    snapshot: {
      source_type: 'order', source_code: 'OPS-101', customer_name: 'Customer',
      items: [{ item_name: 'Phone', quantity: 1, unit_price: 500000, line_total: 500000 }],
      transaction_total: 500000, total_paid: 500000, balance_due: 0,
      payments: [{ amount: 200000 }, { amount: 300000 }],
    },
  });
  assert.equal(data.PAYMENT_STATUS, 'Paid in Full');
  assert.equal(data.AMOUNT_RECEIVED, '500,000.00');
  assert.equal(data.TOTAL_PAID, '500,000.00');
});

test('quotation data uses quotation validity and total without payment language', () => {
  const data = buildQuotationTemplateData({
    documentNumber: 'QT-20260831-ABC',
    issuedAt: '2026-08-31T05:00:00.000Z',
    snapshot: {
      quotation_code: 'QT-20260831-ABC',
      version: 2,
      customer_name: 'B-TECH',
      customer_phone: '+2348000000000',
      total_amount: 1270000,
      validity_expires_at: '2026-09-07T23:59:59.000Z',
      items: [{ item_name: 'Solar inverter', quantity: 1, final_unit_price: 350000 }],
      terms: 'Stock subject to availability.',
    },
  });
  assert.equal(data.QUOTATION_NUMBER, 'QT-20260831-ABC');
  assert.equal(data.VERSION, '2');
  assert.equal(data.TOTAL, '1,270,000.00');
  assert.match(data.VALID_UNTIL, /7 September 2026/);
  assert.match(data.ITEM_ROWS, /Solar inverter/);
});
