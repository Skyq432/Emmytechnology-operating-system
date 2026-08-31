import tls from 'node:tls';

export function sanitizeMailHeader(value: string): string {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function wrapBase64(value: Buffer): string {
  return value.toString('base64').replace(/(.{76})/g, '$1\r\n');
}

export function buildMimeMessage(input: {
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  text: string;
  filename: string;
  pdf: Buffer;
}): string {
  const boundary = `emmytech-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const fromName = sanitizeMailHeader(input.fromName);
  const fromEmail = sanitizeMailHeader(input.fromEmail);
  const to = sanitizeMailHeader(input.to);
  const subject = sanitizeMailHeader(input.subject);
  const filename = sanitizeMailHeader(input.filename).replace(/["\\]/g, '_');

  return [
    `From: ${fromName} <${fromEmail}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.text,
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${filename}"`,
    '',
    wrapBase64(input.pdf),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

function readResponse(socket: tls.TLSSocket): Promise<{ code: number; text: string }> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return;
      const last = lines[lines.length - 1];
      const match = last.match(/^(\d{3})\s/);
      if (!match) return;
      cleanup();
      resolve({ code: Number(match[1]), text: buffer.trim() });
    };
    socket.on('data', onData);
    socket.on('error', onError);
  });
}

async function command(socket: tls.TLSSocket, line: string, expected: number | number[]) {
  socket.write(`${line}\r\n`);
  const response = await readResponse(socket);
  const codes = Array.isArray(expected) ? expected : [expected];
  if (!codes.includes(response.code)) throw new Error(`SMTP ${line.split(' ')[0]} failed: ${response.text}`);
  return response;
}

export async function sendSalesEmail(input: {
  to: string;
  subject: string;
  text: string;
  filename: string;
  pdf: Buffer;
}) {
  const host = process.env.SALES_SMTP_HOST?.trim();
  const user = process.env.SALES_SMTP_USER?.trim();
  const pass = process.env.SALES_SMTP_PASS || '';
  const fromEmail = process.env.SALES_SMTP_FROM_EMAIL?.trim() || user;
  const fromName = process.env.SALES_SMTP_FROM_NAME?.trim() || 'Emmy Technology';
  const port = Number(process.env.SALES_SMTP_PORT || 465);

  if (!host || !user || !pass || !fromEmail) throw new Error('Sales SMTP is not configured');
  if (!Number.isFinite(port) || port <= 0) throw new Error('Invalid SALES_SMTP_PORT');
  const to = sanitizeMailHeader(input.to);
  if (!to || !to.includes('@')) throw new Error('Invalid recipient email');

  const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true });
  socket.setTimeout(20000, () => socket.destroy(new Error('SMTP connection timed out')));
  await new Promise<void>((resolve, reject) => {
    socket.once('secureConnect', resolve);
    socket.once('error', reject);
  });

  try {
    let response = await readResponse(socket);
    if (response.code !== 220) throw new Error(`SMTP greeting failed: ${response.text}`);
    await command(socket, `EHLO ${process.env.SALES_SMTP_HELO || 'emmytechnology.com'}`, 250);
    await command(socket, 'AUTH LOGIN', 334);
    await command(socket, Buffer.from(user).toString('base64'), 334);
    await command(socket, Buffer.from(pass).toString('base64'), 235);
    await command(socket, `MAIL FROM:<${sanitizeMailHeader(fromEmail)}>`, 250);
    await command(socket, `RCPT TO:<${to}>`, [250, 251]);
    await command(socket, 'DATA', 354);
    const message = buildMimeMessage({
      fromName,
      fromEmail,
      to,
      subject: input.subject,
      text: input.text,
      filename: input.filename,
      pdf: input.pdf,
    });
    const stuffed = message.replace(/^\./gm, '..');
    socket.write(`${stuffed}\r\n.\r\n`);
    response = await readResponse(socket);
    if (response.code !== 250) throw new Error(`SMTP DATA failed: ${response.text}`);
    await command(socket, 'QUIT', 221).catch(() => undefined);
    return { success: true as const };
  } finally {
    socket.end();
  }
}
