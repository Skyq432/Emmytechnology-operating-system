import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'public', 'branding', 'emmytechnology-logo.png');
const target = path.join(root, 'src', 'lib', 'sales', 'documents', 'pdf', 'logo-data.ts');

const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

// The approved source lockup is designed for dark backgrounds. Preserve the
// gold symbol and recolor its neutral white lettering for the receipt's white header.
for (let offset = 0; offset < data.length; offset += 4) {
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const alpha = data[offset + 3];
  const brightest = Math.max(red, green, blue);
  const darkest = Math.min(red, green, blue);

  if (alpha > 0 && brightest >= 128 && brightest - darkest <= 12) {
    data[offset] = 0;
    data[offset + 1] = 51;
    data[offset + 2] = 102;
  }
}

const logo = await sharp(data, {
  raw: { width: info.width, height: info.height, channels: 4 },
})
  .png()
  .toBuffer();
const generated = [
  '// Generated from public/branding/emmytechnology-logo.png with a navy wordmark for white receipt headers. Do not hand-edit.',
  `export const EMMYTECH_LOGO_PNG_BASE64 = ${JSON.stringify(logo.toString('base64'))};`,
  '',
].join('\n');

await fs.writeFile(target, generated, 'utf8');
