#!/usr/bin/env node
/* eslint-disable no-console */

const REQUIRED = [
  'OPENAI_API_KEY',
  'AINDER_SESSION_SECRET',
  'AINDER_BOOTSTRAP_USER_ID',
  'AINDER_BOOTSTRAP_PASSWORD_HASH',
  'AINDER_ALLOWED_ORIGINS',
  'AINDER_DATA_FILE',
  'GGUI_MCP_URL',
  'GGUI_AINDER_MCP_URL',
  'VITE_AGENT_ENDPOINT_URL',
];

const failures = [];

for (const name of REQUIRED) {
  if (!process.env[name]?.trim()) failures.push(`${name} is required`);
}

for (const name of ['GGUI_MCP_URL', 'GGUI_AINDER_MCP_URL', 'VITE_AGENT_ENDPOINT_URL']) {
  const value = process.env[name]?.trim();
  if (!value) continue;
  try {
    const url = new URL(value);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      failures.push(`${name} must not point at localhost in production`);
    }
  } catch {
    failures.push(`${name} must be a valid URL`);
  }
}

for (const origin of (process.env.AINDER_ALLOWED_ORIGINS ?? '').split(',')) {
  const trimmed = origin.trim();
  if (!trimmed) continue;
  try {
    new URL(trimmed);
  } catch {
    failures.push(`AINDER_ALLOWED_ORIGINS contains invalid URL: ${trimmed}`);
  }
}

const sessionSecret = process.env.AINDER_SESSION_SECRET?.trim() ?? '';
if (sessionSecret && sessionSecret.length < 32) {
  failures.push('AINDER_SESSION_SECRET must be at least 32 characters');
}

const passwordHash = process.env.AINDER_BOOTSTRAP_PASSWORD_HASH?.trim() ?? '';
if (passwordHash && !passwordHash.startsWith('scrypt:')) {
  failures.push('AINDER_BOOTSTRAP_PASSWORD_HASH must be a scrypt hash');
}

if (process.env.AINDER_ALLOW_DEMO_SEEDING === 'true') {
  failures.push('AINDER_ALLOW_DEMO_SEEDING must not be true in production');
}

if (failures.length > 0) {
  console.error('Production environment validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Production environment validation passed.');
