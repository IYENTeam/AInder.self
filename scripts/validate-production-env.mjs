#!/usr/bin/env node
/* eslint-disable no-console */

const PROFILE = process.env.NODE_ENV === 'production' ? 'production' : (process.env.AINDER_ENV_PROFILE ?? 'development');
const isProduction = PROFILE === 'production';

const requiredProduction = [
  'OPENAI_API_KEY',
  'VITE_AGENT_ENDPOINT_URL',
  'GGUI_MCP_URL',
  'GGUI_AINDER_MCP_URL',
  'AINDER_ALLOWED_ORIGINS',
  'AINDER_SESSION_SECRET',
  'AINDER_ADMIN_TOKEN',
  'AINDER_STORE_PATH',
];

const requiredProviderLabels = ['COCOUN_API_KEY', 'TOBL_API_KEY'];

function present(name) {
  return typeof process.env[name] === 'string' && process.env[name].trim().length > 0;
}

function isLocalhostUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '0.0.0.0';
  } catch {
    return false;
  }
}

const failures = [];
if (isProduction) {
  for (const name of requiredProduction) {
    if (!present(name)) failures.push(`${name} is required in production.`);
  }
  for (const name of requiredProviderLabels) {
    if (!present(name)) failures.push(`${name} must be configured or the matching provider feature must stay disabled.`);
  }
  for (const name of ['VITE_AGENT_ENDPOINT_URL', 'GGUI_MCP_URL', 'GGUI_AINDER_MCP_URL']) {
    const value = process.env[name];
    if (value && isLocalhostUrl(value)) failures.push(`${name} must not point at localhost in production.`);
  }
  const origins = (process.env.AINDER_ALLOWED_ORIGINS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (origins.some((origin) => origin === '*' || isLocalhostUrl(origin))) {
    failures.push('AINDER_ALLOWED_ORIGINS must be explicit public origins, not wildcard/localhost.');
  }
  if ((process.env.AINDER_SESSION_SECRET ?? '').length < 32) {
    failures.push('AINDER_SESSION_SECRET must be at least 32 characters.');
  }
}

if (failures.length > 0) {
  console.error(`AInder ${PROFILE} environment validation failed:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`AInder ${PROFILE} environment validation passed.`);
