import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';

test('receipt runtime loads in the Node document worker', async () => {
  await assert.doesNotReject(() => import('./runtime.ts'));
});

test('receipt runtime renders a PDF with the embedded EmmyTech logo', async () => {
  const { renderDocumentPdf } = await import('./runtime.ts');

  const pdf = await renderDocumentPdf({
    documentNumber: 'RCT-P-TEST-1',
    documentType: 'payment_receipt',
    issuedAt: '2026-09-09T09:15:00.000Z',
    snapshot: {
      customer_name: 'Test Customer',
      transaction_total: 1000,
      payment_amount: 1000,
      cumulative_paid: 1000,
      balance_due: 0,
    },
  });

  assert.equal(pdf.subarray(0, 8).toString('binary'), '%PDF-1.4');
  assert.match(pdf.toString('binary'), /\/Logo Do/);
});

test('receipt embeds the complete EmmyTech symbol and wordmark asset', async () => {
  const { renderDocumentPdf } = await import('./runtime.ts');
  const pdf = await renderDocumentPdf({
    documentNumber: 'RCT-P-TEST-2',
    documentType: 'payment_receipt',
    issuedAt: '2026-09-09T09:15:00.000Z',
    snapshot: { customer_name: 'Test Customer', transaction_total: 1000, cumulative_paid: 1000 },
  });

  assert.match(pdf.toString('binary'), /\/Width 1126 \/Height 323/);
});

test('receipt places the full logo lockup in the white header area', async () => {
  const { renderDocumentPdf } = await import('./runtime.ts');
  const pdf = await renderDocumentPdf({
    documentNumber: 'RCT-P-TEST-LOGO-POSITION',
    documentType: 'payment_receipt',
    issuedAt: '2026-09-09T09:15:00.000Z',
    snapshot: { customer_name: 'Test Customer', transaction_total: 1000, cumulative_paid: 1000 },
  });

  assert.match(pdf.toString('binary'), /q [\d.]+ 0 0 [\d.]+ [\d.]+ 710 cm \/Logo Do Q/);
});

test('receipt logo uses navy lettering that remains visible on white', async () => {
  const { renderDocumentPdf } = await import('./runtime.ts');
  const pdf = await renderDocumentPdf({
    documentNumber: 'RCT-P-TEST-LOGO-COLOR',
    documentType: 'payment_receipt',
    issuedAt: '2026-09-09T09:15:00.000Z',
    snapshot: { customer_name: 'Test Customer', transaction_total: 1000, cumulative_paid: 1000 },
  });
  const binary = pdf.toString('binary');
  const imageHeader = /\/Width 1126 \/Height 323[\s\S]*?\/ColorSpace \/DeviceRGB[\s\S]*?\/Length (\d+) >>\nstream\n/.exec(
    binary,
  );

  assert.ok(imageHeader, 'embedded RGB logo image should be present');
  const streamStart = imageHeader.index + imageHeader[0].length;
  const compressed = pdf.subarray(streamStart, streamStart + Number(imageHeader[1]));
  const pixels = inflateSync(compressed);
  let navyPixels = 0;
  for (let offset = 0; offset < pixels.length; offset += 3) {
    if (pixels[offset] === 0 && pixels[offset + 1] === 51 && pixels[offset + 2] === 102) {
      navyPixels += 1;
    }
  }

  assert.ok(navyPixels > 1000, 'wordmark should contain a substantial number of EmmyTech navy pixels');
});

test('receipt centers the footer contact details using their rendered width', async () => {
  const { renderDocumentPdf } = await import('./runtime.ts');
  const pdf = await renderDocumentPdf({
    documentNumber: 'RCT-P-TEST-3',
    documentType: 'payment_receipt',
    issuedAt: '2026-09-09T09:15:00.000Z',
    snapshot: { customer_name: 'Test Customer', transaction_total: 1000, cumulative_paid: 1000 },
  });
  const content = pdf.toString('binary');
  const contactPosition = content.match(
    /1 0 0 1 ([\d.]+) 39 Tm \(\+234 814 650 3700.*Sango branch, Ibadan\) Tj ET/,
  );

  assert.ok(contactPosition, 'footer contact line should be present in the receipt');
  assert.ok(Math.abs(Number(contactPosition[1]) - 133.47) < 0.02);
});
