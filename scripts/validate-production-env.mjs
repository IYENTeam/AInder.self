#!/usr/bin/env node
/* eslint-disable no-console */

const isUrl = (value, { requireHttps = false } = {}) => {
  try {
    const url = new URL(value);
    return requireHttps ? url.protocol === 'https:' : url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const isLocalhost = (value) => /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::|\/|$)/i.test(value);

const required = [
  'OPENAI_API_KEY',
  'AINDER_SESSION_SECRET',
  'AINDER_ALLOWED_ORIGINS',
  'GGUI_MCP_URL',
  'GGUI_AINDER_MCP_URL',
  'VITE_AGENT_ENDPOINT_URL',
];

const urlVars = ['GGUI_MCP_URL', 'GGUI_AINDER_MCP_URL', 'VITE_AGENT_ENDPOINT_URL'];
const errors = [];

for (const name of required) {
  if (!process.env[name]?.trim()) errors.push(`${name} is required`);
}

for (const name of urlVars) {
  const value = process.env[name]?.trim();
  if (!value) continue;
  const requireHttps = process.env.NODE_ENV === 'production' && name === 'VITE_AGENT_ENDPOINT_URL';
  if (!isUrl(value, { requireHttps })) errors.push(`${name} must be a valid ${requireHttps ? 'https' : 'http(s)'} URL`);
  if (process.env.NODE_ENV === 'production' && isLocalhost(value)) errors.push(`${name} must not point at localhost in production`);
}

for (const origin of (process.env.AINDER_ALLOWED_ORIGINS ?? '').split(',').map((v) => v.trim()).filter(Boolean)) {
  if (!isUrl(origin, { requireHttps: process.env.NODE_ENV === 'production' })) errors.push(`AINDER_ALLOWED_ORIGINS contains an invalid URL: ${origin}`);
  if (process.env.NODE_ENV === 'production' && isLocalhost(origin)) {
    errors.push(`AINDER_ALLOWED_ORIGINS must not include localhost in production: ${origin}`);
  }
}

if (process.env.NODE_ENV === 'production' && process.env.AINDER_ALLOW_DEMO_BOOTSTRAP === 'true') {
  errors.push('AINDER_ALLOW_DEMO_BOOTSTRAP must not be true in production');
}
if (process.env.NODE_ENV === 'production' && process.env.AINDER_ENABLE_ADMIN_DEBUG === 'true') {
  errors.push('AINDER_ENABLE_ADMIN_DEBUG must not be true in production');
}

if (errors.length > 0) {
  console.error('Production environment validation failed:');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log('Production environment validation passed.');
