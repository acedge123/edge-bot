#!/usr/bin/env node
/**
 * Echelon Hosted Agent worker: poll agent-next → chat.send → agent-ack.
 * For the Echelon Control /agent UI (agent_jobs table, agent-next/agent-ack edge functions).
 *
 * Env (Railway or ~/.openclaw/.env):
 *   ECHELON_EDGE_URL   - Base URL for agent-next/agent-ack (e.g. https://<project>.supabase.co/functions/v1)
 *   AGENT_EDGE_KEY     - Bearer token for agent-next and agent-ack
 *   GATEWAY_HTTP_URL   - Gateway base (default http://127.0.0.1:${PORT:-18789}) for same-container Railway
 *   OPENCLAW_HOOK_TOKEN - For /hooks/wake fallback; not needed if using gateway call only
 *   ECHELON_POLL_MS    - Poll interval when idle (default 2000)
 *   WORKER_ID          - worker_id sent to agent-next (default railway-echelon-worker)
 *
 * Run alongside openclaw gateway. On Railway, both run in same container.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

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

const ECHELON_EDGE_URL = (process.env.ECHELON_EDGE_URL || 'https://yczomejrvihbmydyraqg.supabase.co/functions/v1').replace(/\/+$/, '');
const AGENT_EDGE_KEY = (process.env.AGENT_EDGE_KEY || '').trim();
const PORT = process.env.PORT || '18789';
const GATEWAY_HTTP_URL = (process.env.GATEWAY_HTTP_URL || `http://127.0.0.1:${PORT}`).replace(/\/+$/, '');
const HOOK_TOKEN = (process.env.OPENCLAW_HOOK_TOKEN || process.env.OPENCLAW_GATEWAY_TOKEN || '').trim();
const POLL_MS = Math.max(1000, parseInt(process.env.ECHELON_POLL_MS || '2000', 10));
const WORKER_ID = process.env.WORKER_ID || 'railway-echelon-worker';
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw';

if (!AGENT_EDGE_KEY) {
  console.error('Missing AGENT_EDGE_KEY. Set in Railway env or ~/.openclaw/.env');
  process.exit(1);
}

const checkOnly = process.argv.includes('--check');
if (checkOnly) {
  console.log('Echelon worker config:');
  console.log('  ECHELON_EDGE_URL:', ECHELON_EDGE_URL);
  console.log('  AGENT_EDGE_KEY:', AGENT_EDGE_KEY ? '***set***' : '(missing)');
  console.log('  GATEWAY_HTTP_URL:', GATEWAY_HTTP_URL);
  console.log('  WORKER_ID:', WORKER_ID);
  (async () => {
    try {
      const job = await claimNextJob();
      if (job) console.log('  agent-next: got job', job.id);
      else console.log('  agent-next: 204 (no job)');
    } catch (e) {
      console.log('  agent-next error:', e.message);
    }
    process.exit(0);
  })();
} else {
  runLoop();
}

/** Claim one job from Echelon agent-next. Returns job or null. */
async function claimNextJob() {
  const res = await fetch(`${ECHELON_EDGE_URL}/agent-next`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AGENT_EDGE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ worker_id: WORKER_ID }),
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`agent-next ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.job || null;
}

/** Ack job to Echelon agent-ack. */
async function ackJob(jobId, status, { responseText = null, error = null } = {}) {
  const body = { job_id: jobId, status };
  if (responseText) body.response_text = responseText;
  if (error) body.error = error;
  const res = await fetch(`${ECHELON_EDGE_URL}/agent-ack`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AGENT_EDGE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`agent-ack ${res.status}: ${t.slice(0, 200)}`);
  }
}

/** OpenClaw gateway call (chat.send, chat.history). */
async function gatewayCall(method, params, { timeoutMs = 60000 } = {}) {
  const { stdout } = await execFileAsync(OPENCLAW_BIN, [
    'gateway',
    'call',
    method,
    '--params',
    JSON.stringify(params),
    '--timeout',
    String(timeoutMs),
    '--json',
  ], { timeout: timeoutMs + 5000, maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(stdout);
}

/** POST to OpenClaw Gateway /hooks/wake (fallback when gateway call unavailable). */
async function postWake(text) {
  if (!HOOK_TOKEN) throw new Error('OPENCLAW_HOOK_TOKEN required for /hooks/wake');
  const res = await fetch(`${GATEWAY_HTTP_URL}/hooks/wake`, {
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

/**
 * Process one Echelon job: send to agent via chat, get response, ack.
 * Uses chat.send + chat.history to capture the agent's reply for response_text.
 */
async function handleJob(job) {
  const jobId = String(job.id || '');
  const tenantId = String(job.tenant_id || job.tenantId || 'default');
  const message = String(job.text || '').trim();
  if (!message) {
    throw new Error('Job has no text');
  }

  const sessionKey = `agent:main:echelon:${tenantId}`;
  const idempotencyKey = jobId;

  // Baseline: last assistant message timestamp before we send
  let baselineLastTs = 0;
  try {
    const baseline = await gatewayCall('chat.history', { sessionKey, limit: 5 }, { timeoutMs: 10_000 });
    const msgs = baseline?.messages || [];
    baselineLastTs = [...msgs].reverse().find((m) => m.role === 'assistant')?.timestamp || 0;
  } catch (_) {
    // No history yet
  }

  // Send message to agent
  await gatewayCall('chat.send', {
    sessionKey,
    message,
    deliver: false,
    idempotencyKey,
    timeoutMs: 15 * 60 * 1000,
  }, { timeoutMs: 70_000 });

  // Poll for new assistant response (up to 5 min)
  const deadline = Date.now() + (5 * 60 * 1000);
  while (Date.now() < deadline) {
    const hist = await gatewayCall('chat.history', { sessionKey, limit: 50 }, { timeoutMs: 10_000 });
    const msgs = hist?.messages || [];

    const lastNew = [...msgs]
      .reverse()
      .find((m) => m.role === 'assistant' && (m.timestamp || 0) > baselineLastTs && Array.isArray(m.content));

    const text = lastNew?.content?.map((c) => c?.text).filter(Boolean).join('')?.trim() || '';
    if (text) {
      return text;
    }

    await new Promise((r) => setTimeout(r, 750));
  }

  throw new Error('Timeout waiting for agent response');
}

async function runLoop() {
  while (true) {
    try {
      const job = await claimNextJob();
      if (!job) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        continue;
      }

      try {
        const responseText = await handleJob(job);
        await ackJob(job.id, 'done', { responseText });
        console.log('[echelon-worker] job', job.id, '→ done');
      } catch (err) {
        console.error('[echelon-worker] job', job.id, 'error:', err.message);
        await ackJob(job.id, 'failed', { error: err.message }).catch((e) =>
          console.error('[echelon-worker] ack failed:', e.message)
        );
      }

      const cooldownMs = Math.max(0, parseInt(process.env.ECHELON_COOLDOWN_MS || '2000', 10));
      await new Promise((r) => setTimeout(r, cooldownMs));
    } catch (e) {
      console.error('[echelon-worker] poll error:', e.message);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }
}

if (!checkOnly) runLoop();
