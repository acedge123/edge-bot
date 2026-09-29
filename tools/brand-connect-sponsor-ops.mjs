#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const DEFAULT_SPONSOR_OPS_BASE =
  'https://evthfmqawotwbbkxfxep.supabase.co/functions/v1/agent-sponsor-ops';

const APPROVED_HOST = 'evthfmqawotwbbkxfxep.supabase.co';
const APPROVED_PATH = '/functions/v1/agent-sponsor-ops';

export function normalizeSponsorOpsBase(value) {
  const base = String(value || DEFAULT_SPONSOR_OPS_BASE).trim().replace(/\/+$/, '');
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.hostname !== APPROVED_HOST) {
    throw new Error('Brand Connect sponsor ops must use the approved Supabase host over HTTPS');
  }
  if (url.pathname !== APPROVED_PATH) {
    throw new Error('Brand Connect sponsor ops must target /functions/v1/agent-sponsor-ops');
  }
  return base;
}

export function sponsorOpsHeaders({ env = process.env } = {}) {
  const key = String(env.ENRICHMENT_AGENT_KEY || '').trim();
  if (!key) throw new Error('ENRICHMENT_AGENT_KEY is unavailable on this execution surface');
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${key}`,
  };
}

export function parseBoolean(value, fallback = true) {
  if (value === undefined || value === '') return fallback;
  const normalized = String(value).toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  throw new Error(`Invalid boolean: ${value}`);
}

function parseArguments(args) {
  const [command = 'help', ...rest] = args;
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (!flag.startsWith('--')) throw new Error(`Unknown argument: ${flag}`);
    const key = flag.slice(2).replace(/-/g, '_');
    if (key === 'confirm_live') {
      flags[key] = true;
      continue;
    }
    flags[key] = rest[index + 1] || '';
    index += 1;
  }
  return { command, flags };
}

function jsonBodyFromFlags(flags) {
  if (flags.body_file && flags.json) throw new Error('Use either --body-file or --json, not both');
  if (flags.body_file) return JSON.parse(readFileSync(resolve(flags.body_file), 'utf8'));
  if (flags.json) return JSON.parse(flags.json);
  return {};
}

export function buildRequest(command, flags = {}) {
  if (command === 'stats') return { method: 'GET', route: '/stats' };
  if (command === 'next-community') return { method: 'GET', route: '/communities/next' };

  if (command === 'review-status') {
    const params = new URLSearchParams();
    if (flags.days) params.set('days', String(flags.days));
    if (flags.since) params.set('since', String(flags.since));
    if (flags.community_id) params.set('community_id', String(flags.community_id));
    if (flags.community) params.set('community', String(flags.community));
    const query = params.toString();
    return { method: 'GET', route: `/review-status${query ? `?${query}` : ''}` };
  }

  if (command === 'search-communities') {
    const params = new URLSearchParams();
    if (flags.query) params.set('query', String(flags.query));
    if (flags.state) params.set('state', String(flags.state));
    if (flags.limit) params.set('limit', String(flags.limit));
    const query = params.toString();
    return { method: 'GET', route: `/communities${query ? `?${query}` : ''}` };
  }

  if (command === 'run-cycle') {
    const baseBody = jsonBodyFromFlags(flags);
    const body = {
      ...baseBody,
      agent_id: flags.agent_id || baseBody.agent_id || 'open-claw',
    };
    if (flags.community_id) body.community_id = flags.community_id;
    if (flags.community) body.community = flags.community;
    if (flags.community_name) body.community_name = flags.community_name;
    if (flags.max_discover) body.max_discover = Number(flags.max_discover);
    if (flags.max_promote) body.max_promote = Number(flags.max_promote);
    if (flags.max_emails) body.max_emails = Number(flags.max_emails);
    body.dry_run = parseBoolean(flags.dry_run, body.dry_run ?? true);
    if (body.dry_run === false && flags.confirm_live !== true) {
      throw new Error('Live sponsor outreach requires --confirm-live; dry_run defaults to true');
    }
    if (!body.community_id && !body.community && !body.community_name && !body.community_query) {
      throw new Error('run-cycle requires --community-id, --community, --community-name, or --json with community data');
    }
    return { method: 'POST', route: '/run-cycle', body };
  }

  throw new Error(`Unknown command: ${command}`);
}

function usage() {
  console.log(`Usage:
  brand-connect-sponsor-ops stats
  brand-connect-sponsor-ops search-communities --query Gaithersburg --state MD --limit 10
  brand-connect-sponsor-ops next-community
  brand-connect-sponsor-ops review-status --days 1 --community "Gaithersburg, MD"
  brand-connect-sponsor-ops run-cycle --community-id <uuid> --dry-run true
  brand-connect-sponsor-ops run-cycle --community "Gaithersburg, MD" --dry-run true

The helper is restricted to Brand Connect Hub agent-sponsor-ops and uses ENRICHMENT_AGENT_KEY bearer auth.`);
}

async function main() {
  const { command, flags } = parseArguments(process.argv.slice(2));
  if (command === 'help' || command === '--help') {
    usage();
    return;
  }

  const base = normalizeSponsorOpsBase(process.env.BRAND_CONNECT_SPONSOR_OPS_BASE);
  const request = buildRequest(command, flags);
  const headers = sponsorOpsHeaders();
  if (request.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${base}${request.route}`, {
    method: request.method,
    headers,
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
    signal: AbortSignal.timeout(180_000),
  });
  const text = await response.text();
  let payload = text;
  try { payload = JSON.parse(text); } catch {}
  console.log(JSON.stringify({ status: response.status, ok: response.ok, response: payload }, null, 2));
  if (!response.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[brand-connect-sponsor-ops] ${error.message}`);
    process.exitCode = 1;
  });
}
