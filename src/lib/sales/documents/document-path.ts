export function documentStoragePath(input: {
  documentType: string;
  documentNumber: string;
  issuedAt: string;
}) {
  const year = /^\d{4}/.exec(input.issuedAt)?.[0] || new Date().getUTCFullYear().toString();
  const safeNumber = String(input.documentNumber || 'document')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'document';
  const safeType = String(input.documentType || 'document').replace(/[^A-Za-z0-9_-]+/g, '_');
  return `${year}/${safeType}/${safeNumber}.pdf`;
}
