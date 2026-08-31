// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMimeMessage, sanitizeMailHeader } from './smtp.ts';

test('sanitizeMailHeader strips CRLF header injection', () => {
  assert.equal(sanitizeMailHeader('Receipt\r\nBcc: attacker@example.com'), 'Receipt Bcc: attacker@example.com');
});

test('buildMimeMessage creates a PDF attachment without exposing raw binary', () => {
  const message = buildMimeMessage({
    fromName: 'Emmy Technology', fromEmail: 'support@emmytechnology.com', to: 'customer@example.com',
    subject: 'Payment Receipt RCT-P-1', text: 'Attached is your receipt.', filename: 'RCT-P-1.pdf', pdf: Buffer.from('%PDF-test'),
  });
  assert.match(message, /Content-Type: multipart\/mixed/);
  assert.match(message, /Content-Type: application\/pdf/);
  assert.match(message, /Content-Disposition: attachment; filename="RCT-P-1.pdf"/);
  assert.match(message, /JVBERi10ZXN0/);
  assert.doesNotMatch(message, /%PDF-test/);
});
