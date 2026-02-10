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
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw';

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
  // Be liberal in what we send: some older agent-vault deployments expect job_id.
  const body = { jobId, job_id: jobId, status };
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

/** Build wake text from job payload.
 *
 * For chat-ui jobs, we embed stable metadata so the agent can post a writeback
 * to Agent Vault (/learnings) after responding.
 */
function wakeTextFromPayload(job, payload) {
  const text = (payload && typeof payload.text === 'string') ? payload.text.trim() : '';
  const source = (payload && typeof payload.source === 'string') ? payload.source.trim() : '';

  if (source === 'chat_ui') {
    // UI payload should include these IDs; fall back to job.id as job_id.
    const jobId = (payload && (payload.job_id || payload.jobId)) ? String(payload.job_id || payload.jobId) : (job?.id || '');
    const userId = (payload && (payload.user_id || payload.userId)) ? String(payload.user_id || payload.userId) : '';
    const learningId = (payload && (payload.learning_id || payload.learningId)) ? String(payload.learning_id || payload.learningId) : '';

    // One-line header, easy to parse.
    const header = `[chat_ui] job_id=${jobId} user_id=${userId} learning_id=${learningId}`.trim();

    return [header, text].filter(Boolean).join('\n');
  }

  if (text) return text;

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

async function postChatLearningToVault({ jobId, userId, learningId, text, kind }) {
  const url = `${AGENT_VAULT_URL}/learnings`;
  const payload = {
    learning: text,
    category: kind,
    kind,
    visibility: 'private',
    source: 'openclaw',
    tags: ['chat_ui'],
    confidence: 1.0,
    metadata: {
      job_id: jobId,
      user_id: userId,
      query_learning_id: learningId,
      source: 'openclaw',
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AGENT_EDGE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`vault /learnings ${res.status}: ${t.slice(0, 200)}`);
  }
}

async function handleChatUiJob(job, payload) {
  const userId = String(payload.user_id || payload.userId || '').trim();
  const learningId = String(payload.learning_id || payload.learningId || '').trim();
  const message = String(payload.text || '').trim();
  const jobId = String(payload.job_id || payload.jobId || job.id || '').trim();

  if (!userId || !learningId || !message || !jobId) {
    throw new Error('chat_ui payload missing one of: job_id, user_id, learning_id, text');
  }

  // Use a per-user sessionKey so chats don’t collide.
  const sessionKey = `agent:main:chat_ui:${userId}`;
  const idempotencyKey = jobId;

  // Progress policy: only emit progress if it’s actually taking time.
  const progressTimers = [];
  const clearProgressTimers = () => {
    for (const t of progressTimers) clearTimeout(t);
    progressTimers.length = 0;
  };

  // T+15s: “this may take a while…”
  progressTimers.push(setTimeout(() => {
    postChatLearningToVault({
      jobId,
      userId,
      learningId,
      kind: 'chat_progress',
      text: "Got it — working on it now. This may take a few minutes; I’ll update you when I have a complete answer.",
    }).catch(() => {});
  }, 15_000));

  // T+90s: still running
  progressTimers.push(setTimeout(() => {
    postChatLearningToVault({
      jobId,
      userId,
      learningId,
      kind: 'chat_progress',
      text: "Still on it — pulling sources and double-checking details.",
    }).catch(() => {});
  }, 90_000));

  // Then every 3 minutes, lightly reassure.
  const scheduleRepeatingProgress = () => {
    const tick = () => {
      postChatLearningToVault({
        jobId,
        userId,
        learningId,
        kind: 'chat_progress',
        text: "Still working — I’ll post as soon as it’s ready.",
      }).catch(() => {});
      progressTimers.push(setTimeout(tick, 180_000));
    };
    progressTimers.push(setTimeout(tick, 180_000));
  };
  scheduleRepeatingProgress();

  // Snapshot baseline so we only accept a *new* assistant message.
  const baseline = await gatewayCall('chat.history', { sessionKey, limit: 5 }, { timeoutMs: 10_000 });
  const baselineMsgs = baseline?.messages || [];
  const baselineLastTs = [...baselineMsgs].reverse().find((m) => m.role === 'assistant')?.timestamp || 0;

  // Fire the run (don’t deliver to iMessage; we’ll write back to Supabase).
  await gatewayCall('chat.send', {
    sessionKey,
    message,
    deliver: false,
    idempotencyKey,
    timeoutMs: 15 * 60 * 1000,
  }, { timeoutMs: 70_000 });

  // Poll for a *new* assistant message.
  const deadline = Date.now() + (15 * 60 * 1000);
  try {
    while (Date.now() < deadline) {
      const hist = await gatewayCall('chat.history', { sessionKey, limit: 50 }, { timeoutMs: 10_000 });
      const msgs = hist?.messages || [];

      const lastNewAssistant = [...msgs]
        .reverse()
        .find((m) => m.role === 'assistant' && (m.timestamp || 0) > baselineLastTs && Array.isArray(m.content));

      const text = lastNewAssistant?.content?.map((c) => c?.text).filter(Boolean).join('')?.trim() || '';
      if (text) {
        clearProgressTimers();
        await postChatLearningToVault({ jobId, userId, learningId, kind: 'chat_response', text });
        return;
      }

      await new Promise((r) => setTimeout(r, 750));
    }
  } finally {
    clearProgressTimers();
  }

  throw new Error('chat_ui timeout waiting for assistant response');
}

const chatUiQueue = [];
let chatUiActive = false;

function pumpChatUiQueue() {
  if (chatUiActive) return;
  const next = chatUiQueue.shift();
  if (!next) return;

  chatUiActive = true;
  const { job, payload } = next;

  // Run in background so the worker can keep polling/acking other jobs.
  void (async () => {
    try {
      await handleChatUiJob(job, payload);
      await ackJob(job.id, 'done');
      console.log('[worker] chat_ui job', job.id, '→ gateway call → learnings → acked');
    } catch (err) {
      console.error('[worker] chat_ui error:', err.message);
      await ackJob(job.id, 'failed', err.message).catch((e) => console.error('[worker] ack failed:', e.message));
    } finally {
      chatUiActive = false;
      pumpChatUiQueue();
    }
  })();
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

      // Special case: chat UI jobs want request/response semantics.
      if (payload && typeof payload === 'object' && String(payload.source || '') === 'chat_ui') {
        chatUiQueue.push({ job, payload });
        pumpChatUiQueue();
        // Go back to polling immediately.
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }

      const text = wakeTextFromPayload(job, payload);
      try {
        await postWake(text);
        await ackJob(job.id, 'done');
        console.log('[worker] job', job.id, '→ /hooks/wake → acked');
      } catch (err) {
        console.error('[worker] wake or ack error:', err.message);
        await ackJob(job.id, 'failed', err.message).catch((e) => console.error('[worker] ack failed:', e.message));
      }

      // Cooldown after wake to avoid burst token usage and throttling (default 3s).
      const cooldownMs = Math.max(0, parseInt(process.env.JOBS_WAKE_COOLDOWN_MS || '3000', 10));
      await new Promise((r) => setTimeout(r, cooldownMs));
    } catch (e) {
      console.error('[worker] error', e.message);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }
}

if (!checkOnly) runLoop();
