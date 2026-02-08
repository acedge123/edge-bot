#!/usr/bin/env node
/**
 * Jobs worker: poll → claim one job → POST to OpenClaw Gateway /hooks/wake → ack.
 * OpenClaw Gateway is the always-on brain; this script is the pulse. Do NOT run
 * openclaw agent from bash — run `openclaw gateway --port 18789` separately.
 *
 * Env (e.g. from ~/.openclaw/.env):
 *   AGENT_VAULT_URL   - Edge functions base (e.g. https://<project>.supabase.co/functions/v1); worker appends /agent-vault/...
 *   AGENT_EDGE_KEY    - Bearer token for /jobs/next and /jobs/ack
 *   GATEWAY_HTTP_URL  - Gateway base (default http://127.0.0.1:18789) for POST /hooks/wake
 *   OPENCLAW_HOOK_TOKEN - Required. Same as hooks.token in OpenClaw config (Authorization: Bearer)
 *   JOBS_POLL_INTERVAL_MS - default 2000
 *
 * Run as daemon: docs/WORKER_DAEMON.md. Full contract: docs/JOBS_AND_WAKE_REFERENCE.md.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

function loadOpenClawEnv() {
  const envPath = process.env.OPENCLAW_ENV_FILE || join(homedir(), '.openclaw', '.env');
  if (!existsSync(envPath)) return;
  try {
    const raw = readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.replace(/#.*/, '').trim();
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
  } catch (_) {}
}
loadOpenClawEnv();

// Accept AGENT_VAULT_URL / AGENT_EDGE_KEY or CONFIG-style SUPABASE_EDGE_SECRETS_*
//
// AGENT_VAULT_URL can be either:
//  - Edge functions root: https://<project>.supabase.co/functions/v1
//  - Function base URL:    https://<project>.supabase.co/functions/v1/agent-vault
//
// We normalize to the function base URL so callers can use either form safely.
const AGENT_VAULT_URL_RAW = (process.env.AGENT_VAULT_URL || process.env.SUPABASE_EDGE_SECRETS_URL || '').replace(/\/+$/, '');
const AGENT_VAULT_URL = AGENT_VAULT_URL_RAW
  ? (AGENT_VAULT_URL_RAW.endsWith('/agent-vault') ? AGENT_VAULT_URL_RAW : `${AGENT_VAULT_URL_RAW}/agent-vault`)
  : '';

const AGENT_EDGE_KEY = (process.env.AGENT_EDGE_KEY || process.env.SUPABASE_EDGE_SECRETS_AUTH || '').trim();
const GATEWAY_HTTP_URL = (process.env.GATEWAY_HTTP_URL || 'http://127.0.0.1:18789').replace(/\/+$/, '');
const HOOK_TOKEN = (process.env.OPENCLAW_HOOK_TOKEN || process.env.OPENCLAW_GATEWAY_TOKEN || '').trim();
const POLL_MS = Math.max(1000, parseInt(process.env.JOBS_POLL_INTERVAL_MS || '2000', 10));

if (!AGENT_VAULT_URL || !AGENT_EDGE_KEY) {
  const envPath = process.env.OPENCLAW_ENV_FILE || join(homedir(), '.openclaw', '.env');
  console.error('Missing agent-vault URL or key. Set in ~/.openclaw/.env either:');
  console.error('  AGENT_VAULT_URL + AGENT_EDGE_KEY');
  console.error('  or SUPABASE_EDGE_SECRETS_URL + SUPABASE_EDGE_SECRETS_AUTH');
  console.error('(Checked: ' + envPath + ')');
  process.exit(1);
}
if (!HOOK_TOKEN) {
  console.error('Missing OPENCLAW_HOOK_TOKEN. OpenClaw webhooks require hooks.enabled and hooks.token in config; set the same value as OPENCLAW_HOOK_TOKEN in ~/.openclaw/.env');
  process.exit(1);
}

// Optional: node workspace/scripts/jobs-worker.mjs --check — verify env and one poll, then exit
const checkOnly = process.argv.includes('--check');
if (checkOnly) {
  console.log('Config check:');
  console.log('  AGENT_VAULT_URL:', AGENT_VAULT_URL ? AGENT_VAULT_URL.slice(0, 40) + '...' : '(missing)');
  console.log('  AGENT_EDGE_KEY:', AGENT_EDGE_KEY ? '***set***' : '(missing)');
  console.log('  GATEWAY_HTTP_URL:', GATEWAY_HTTP_URL);
  console.log('  OPENCLAW_HOOK_TOKEN:', HOOK_TOKEN ? '***set***' : '(missing)');
  (async () => {
    try {
      const claimed = await claimNextJob();
      if (claimed) console.log('  jobs/next: got 1 job (id:', claimed.job?.id + ')');
      else console.log('  jobs/next: 204 (no job)');
    } catch (e) {
      console.log('  jobs/next error:', e.message);
    }
    process.exit(0);
  })();
} else {
  runLoop();
}

/** Claim one job from agent-vault. Returns { job, payload } or null. */
async function claimNextJob() {
  const res = await fetch(`${AGENT_VAULT_URL}/jobs/next`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AGENT_EDGE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ agentId: 'openclaw-worker' }),
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`jobs/next ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return { job: data.job, payload: data.payload || data.job?.payload || {} };
}

/** Ack job (done or failed). */
async function ackJob(jobId, status, errorMsg = null) {
  const body = { jobId, status };
  if (errorMsg) body.error = errorMsg;
  const res = await fetch(`${AGENT_VAULT_URL}/jobs/ack`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AGENT_EDGE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`jobs/ack ${res.status}: ${t.slice(0, 200)}`);
  }
}

/** Build wake text from job payload. */
function wakeTextFromPayload(payload) {
  if (payload && typeof payload.text === 'string' && payload.text.trim()) return payload.text.trim();
  if (payload && typeof payload === 'object') {
    const parts = [];
    if (payload.trigger_name) parts.push(`Trigger: ${payload.trigger_name}`);
    if (payload.learning_id) parts.push(`learning_id=${payload.learning_id}`);
    if (payload.text) parts.push(String(payload.text).slice(0, 500));
    if (parts.length) return parts.join(' — ');
  }
  return 'New job from queue';
}

/** POST to OpenClaw Gateway /hooks/wake. Requires hooks.enabled and hooks.token in OpenClaw config. */
async function postWake(text) {
  const url = `${GATEWAY_HTTP_URL}/hooks/wake`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${HOOK_TOKEN}`,
    },
    body: JSON.stringify({ text, mode: 'now' }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`/hooks/wake ${res.status}: ${t.slice(0, 200)}`);
  }
  return res;
}

async function runLoop() {
  while (true) {
    try {
      const claimed = await claimNextJob();
      if (!claimed) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        continue;
      }
      const { job, payload } = claimed;
      const text = wakeTextFromPayload(payload);
      try {
        await postWake(text);
        await ackJob(job.id, 'done');
        console.log('[worker] job', job.id, '→ /hooks/wake → acked');
      } catch (err) {
        console.error('[worker] wake or ack error:', err.message);
        await ackJob(job.id, 'failed', err.message).catch((e) => console.error('[worker] ack failed:', e.message));
      }
      // No cooldown: go back to poll immediately (or use a small 100ms if you want)
      await new Promise((r) => setTimeout(r, 100));
    } catch (e) {
      console.error('[worker] error', e.message);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }
}

if (!checkOnly) runLoop();
