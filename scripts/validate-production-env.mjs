#!/usr/bin/env node
/* eslint-disable no-console */

const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
const requiredAlways = ['OPENAI_API_KEY'];
const requiredProduction = [
  'VITE_AGENT_ENDPOINT_URL',
  'GGUI_MCP_URL',
  'GGUI_AINDER_MCP_URL',
  'AINDER_ALLOWED_ORIGINS',
  'AINDER_STATE_FILE',
];

function isLocalhostUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

const failures = [];
for (const name of requiredAlways) {
  if (!process.env[name]?.trim()) failures.push(`${name} is required`);
}
if (IS_PRODUCTION) {
  for (const name of requiredProduction) {
    const value = process.env[name]?.trim();
    if (!value) {
      failures.push(`${name} is required in production`);
    } else if (name.endsWith('URL') && isLocalhostUrl(value)) {
      failures.push(`${name} must not point at localhost in production`);
    }
  }
  if (process.env.AINDER_ENABLE_DEMO_BOOTSTRAP === 'true') {
    failures.push('AINDER_ENABLE_DEMO_BOOTSTRAP must not be true in production');
  }
}

if (failures.length > 0) {
  console.error('Production environment validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Environment validation passed (${IS_PRODUCTION ? 'production' : 'development'}).`);
