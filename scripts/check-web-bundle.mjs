#!/usr/bin/env node
import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const distDir = join(process.cwd(), 'apps/web/dist/assets');
const rawLimit = Number.parseInt(process.env.AINDER_WEB_BUNDLE_LIMIT_BYTES ?? '1100000', 10);
const gzipLimit = Number.parseInt(process.env.AINDER_WEB_BUNDLE_GZIP_LIMIT_BYTES ?? '300000', 10);

const jsFiles = readdirSync(distDir).filter((name) => name.endsWith('.js'));
if (jsFiles.length === 0) {
  console.error('No built web JS assets found. Run the production web build first.');
  process.exit(1);
}

let failed = false;
for (const file of jsFiles) {
  const path = join(distDir, file);
  const rawBytes = statSync(path).size;
  const gzipBytes = gzipSync(readFileSync(path)).byteLength;
  console.log(`${file}: raw=${rawBytes} gzip=${gzipBytes}`);
  if (rawBytes > rawLimit) {
    console.error(`- ${file} exceeds raw bundle limit (${rawBytes} > ${rawLimit})`);
    failed = true;
  }
  if (gzipBytes > gzipLimit) {
    console.error(`- ${file} exceeds gzip bundle limit (${gzipBytes} > ${gzipLimit})`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('Web bundle budget check passed.');
