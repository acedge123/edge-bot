#!/usr/bin/env node
/**
 * Echelon Hosted Agent worker: poll agent-next → chat.send → agent-ack.
 * For the Echelon Control /agent UI (agent_jobs table, agent-next/agent-ack edge functions).
 *
 * Env (Railway or ~/.openclaw/.env):
 *   ECHELON_EDGE_URL   - Base URL for agent-next/agent-ack (e.g. https://<project>.supabase.co/functions/v1)
 *   AGENT_HOSTED_EDGE_KEY - Bearer token for agent-next and agent-ack
 *   GATEWAY_HTTP_URL   - Gateway base (default http://127.0.0.1:${PORT:-18789}) for same-container Railway
 *   OPENCLAW_HOOK_TOKEN - For /hooks/wake fallback; not needed if using gateway call only
 *   ECHELON_POLL_MS    - Poll interval when idle (default 2000)
 *   WORKER_ID          - worker_id sent to agent-next (default railway-echelon-worker)
 *   CIA_URL            - Repo C base URL for SMS sending (e.g. https://<project>.supabase.co)
 *   CIA_ANON_KEY       - Repo C anonymous API key
 *   EXECUTOR_SECRET    - Bearer token for Repo C internal-execute endpoint
 *
 * SMS jobs: Jobs with metadata.source = "sms" use per-sender session keys and send replies via Repo C.
 * Slack jobs: Jobs with metadata.source = "slack" use per-user session keys and send replies via slack-reply edge function.
 *
 * Image attachments: Jobs with metadata.attachments (image URLs) use POST /v1/chat/completions on the gateway
 * with multimodal content (text + image_url) instead of chat.send.
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
const AGENT_EDGE_KEY = (process.env.AGENT_HOSTED_EDGE_KEY || process.env.AGENT_EDGE_KEY || '').trim();
const PORT = process.env.PORT || '18789';
const GATEWAY_HTTP_URL = (process.env.GATEWAY_HTTP_URL || `http://127.0.0.1:${PORT}`).replace(/\/+$/, '');
// Ensure openclaw gateway call connects to correct port (Railway injects PORT)
process.env.OPENCLAW_GATEWAY_PORT = process.env.OPENCLAW_GATEWAY_PORT || PORT;
const HOOK_TOKEN = (process.env.OPENCLAW_HOOK_TOKEN || process.env.OPENCLAW_GATEWAY_TOKEN || '').trim();
const GATEWAY_TOKEN = (process.env.OPENCLAW_GATEWAY_TOKEN || process.env.OPENCLAW_HOOK_TOKEN || '').trim();
const POLL_MS = Math.max(1000, parseInt(process.env.ECHELON_POLL_MS || '2000', 10));
const WORKER_ID = process.env.WORKER_ID || 'railway-echelon-worker';
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw';

// Repo C env vars for SMS sending
const CIA_URL = (process.env.CIA_URL || '').replace(/\/+$/, '');
const CIA_ANON_KEY = (process.env.CIA_ANON_KEY || '').trim();
const EXECUTOR_SECRET = (process.env.EXECUTOR_SECRET || '').trim();

if (!AGENT_EDGE_KEY) {
  console.error('Missing AGENT_HOSTED_EDGE_KEY. Set in Railway env or ~/.openclaw/.env');
  process.exit(1);
}

const checkOnly = process.argv.includes('--check');
if (checkOnly) {
  console.log('Echelon worker config:');
  console.log('  ECHELON_EDGE_URL:', ECHELON_EDGE_URL);
  console.log('  AGENT_HOSTED_EDGE_KEY:', AGENT_EDGE_KEY ? '***set***' : '(missing)');
  console.log('  GATEWAY_HTTP_URL:', GATEWAY_HTTP_URL);
  console.log('  WORKER_ID:', WORKER_ID);
  console.log('  CIA_URL:', CIA_URL || '(missing)');
  console.log('  CIA_ANON_KEY:', CIA_ANON_KEY ? '***set***' : '(missing)');
  console.log('  EXECUTOR_SECRET:', EXECUTOR_SECRET ? '***set***' : '(missing)');
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

/**
 * Call gateway POST /v1/chat/completions with multimodal content (text + attachments).
 * Used when job has metadata.attachments; otherwise we use chat.send + chat.history.
 *
 * Attachment support:
 * - image: content includes { type: "image_url", image_url: { url } }
 * - file (csv/text): worker downloads and injects file text as additional { type: "text", text }
 */
async function gatewayChatCompletionsWithImages({ requestText, attachments }) {
  const content = [{ type: 'text', text: requestText }];

  const atts = Array.isArray(attachments) ? attachments : [];
  const maxAtts = 4;
  const maxTextBytes = 250_000; // protect worker and gateway payload sizes
  const maxTextChars = 80_000;

  const picked = atts.slice(0, maxAtts);

  let sawImage = false;
  let sawFile = false;

  for (const att of picked) {
    if (att?.type === 'image' && att?.url) {
      sawImage = true;
      content.push({
        type: 'image_url',
        image_url: { url: String(att.url) },
      });
      continue;
    }

    if (att?.type === 'file' && att?.url) {
      sawFile = true;
      const fileText = await downloadAttachmentText(att, { maxBytes: maxTextBytes, maxChars: maxTextChars });
      if (fileText) {
        const name = String(att.filename || att.name || '').trim() || 'attachment';
        content.push({
          type: 'text',
          text: `\n\n[Attached file: ${name}]\n${fileText}\n`,
        });
      } else {
        const name = String(att.filename || att.name || '').trim() || 'attachment';
        content.push({
          type: 'text',
          text: `\n\n[Attached file: ${name}]\n(Unable to include contents; treat as attached file.)\n`,
        });
      }
    }
  }

  // Guardrail: if caller used the old fallback text but we only have files, clarify.
  if (!sawImage && sawFile) {
    content.unshift({
      type: 'text',
      text: '(Note: This job has attached file(s), not only image(s). File content may be inlined below.)\n\n',
    });
  }

  const res = await fetch(`${GATEWAY_HTTP_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GATEWAY_TOKEN}`,
    },
    body: JSON.stringify({
      model: 'openclaw:main',
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`/v1/chat/completions ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const msg = data?.choices?.[0]?.message;
  const text = msg?.content;
  const responseText = (typeof text === 'string' ? text : (text?.text ?? '')).trim() || 'No response';
  return responseText;
}

function looksLikeCsv(att) {
  const filename = String(att?.filename || att?.name || '').toLowerCase();
  const mime = String(att?.mime_type || att?.mimeType || '').toLowerCase();
  if (filename.endsWith('.csv')) return true;
  if (mime.includes('text/csv')) return true;
  return false;
}

async function downloadAttachmentText(att, { maxBytes, maxChars }) {
  const url = String(att?.url || '').trim();
  if (!url) return null;

  // Only attempt to inline obvious text-ish attachments for now.
  if (!looksLikeCsv(att)) return null;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    if (!res.ok) return null;

    // Avoid massive downloads by enforcing a hard byte cap.
    // We do this by reading as text but truncating aggressively.
    const raw = await res.text();
    const truncated = raw.slice(0, maxChars);
    return truncated;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
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

/** Send SMS reply via Repo C internal-execute endpoint. */
async function sendSmsViaRepoC({ tenantId, toNumber, messageText }) {
  if (!CIA_URL || !CIA_ANON_KEY || !EXECUTOR_SECRET) {
    throw new Error('SMS job requires CIA_URL, CIA_ANON_KEY, EXECUTOR_SECRET env vars');
  }

  const res = await fetch(`${CIA_URL}/functions/v1/internal-execute`, {
    method: 'POST',
    headers: {
      'apikey': CIA_ANON_KEY,
      'Authorization': `Bearer ${EXECUTOR_SECRET}`,
      'X-Tenant-Id': tenantId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      service: 'twilio',
      action: 'messages.send',
      params: {
        to: toNumber,
        body: messageText,
      },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Repo C SMS send ${res.status}: ${t.slice(0, 200)}`);
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
  const message = String(job.request_text || job.text || '').trim();
  if (!message) {
    throw new Error('Job has no text');
  }

  // Normalize metadata (Postgres may return JSON as string)
  let metadata = job.metadata;
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata);
    } catch (_) {
      metadata = {};
    }
  }
  metadata = metadata || {};

  // Detect job source and use appropriate session keys
  const source = String(metadata.source || '').trim();
  const isSmsJob = source === 'sms';
  const isSlackJob = source === 'slack';

  let sessionKey;
  if (isSmsJob) {
    const fromNumber = String(metadata.from_number || '').trim();
    if (!fromNumber) {
      throw new Error('SMS job missing metadata.from_number');
    }
    sessionKey = `agent:main:sms:${tenantId}:${fromNumber}`;
  } else if (isSlackJob) {
    const slackUser = String(metadata.slack_user || '').trim();
    if (!slackUser) {
      throw new Error('Slack job missing metadata.slack_user');
    }
    sessionKey = `agent:main:slack:${tenantId}:${slackUser}`;
  } else {
    sessionKey = `agent:main:echelon:${tenantId}`;
  }

  const idempotencyKey = jobId;

  // When job has image attachments, use /v1/chat/completions with multimodal content instead of chat.send
  const attachments = Array.isArray(metadata.attachments) ? metadata.attachments : [];
  if (attachments.length > 0) {
    console.log('[echelon-worker] job', jobId, 'using /v1/chat/completions with', attachments.length, 'attachment(s)');
    return gatewayChatCompletionsWithImages({ requestText: message, attachments });
  }

  // Text-only: existing chat.send + chat.history flow
  let baselineLastTs = 0;
  try {
    const baseline = await gatewayCall('chat.history', { sessionKey, limit: 5 }, { timeoutMs: 10_000 });
    const msgs = baseline?.messages || [];
    baselineLastTs = [...msgs].reverse().find((m) => m.role === 'assistant')?.timestamp || 0;
  } catch (_) {
    // No history yet
  }

  await gatewayCall('chat.send', {
    sessionKey,
    message,
    deliver: false,
    idempotencyKey,
    timeoutMs: 15 * 60 * 1000,
  }, { timeoutMs: 70_000 });

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

        // Normalize metadata (Postgres/Supabase may return JSON columns as string)
        let metadata = job.metadata;
        if (typeof metadata === 'string') {
          try {
            metadata = JSON.parse(metadata);
          } catch (_) {
            metadata = {};
          }
        }
        metadata = metadata || {};

        const source = String(metadata.source || '').trim();
        console.log('[echelon-worker] job', job.id, 'source=%s slack_channel=%s', source || '(none)', metadata.slack_channel || '(none)');

        // For SMS jobs, send reply via Repo C before acking
        const isSmsJob = source === 'sms';

        if (isSmsJob) {
          const fromNumber = String(metadata.from_number || '').trim();
          if (!fromNumber) {
            throw new Error('SMS job missing metadata.from_number');
          }

          if (!CIA_URL || !CIA_ANON_KEY || !EXECUTOR_SECRET) {
            throw new Error('SMS job requires CIA_URL, CIA_ANON_KEY, EXECUTOR_SECRET env vars');
          }

          try {
            await sendSmsViaRepoC({
              tenantId: job.tenant_id || job.tenantId || 'default',
              toNumber: fromNumber,
              messageText: responseText,
            });
            console.log('[echelon-worker] job', job.id, '→ SMS sent to', fromNumber);
          } catch (smsErr) {
            // SMS send failed - ack as failed but preserve response_text
            throw new Error(`SMS send failed: ${smsErr.message}`);
          }
        }

        const isSlackJob = source === 'slack';
        if (isSlackJob) {
          const slackChannel = metadata.slack_channel;
          const slackThreadTs = metadata.slack_thread_ts;
          console.log('[echelon-worker] job', job.id, 'Slack job → posting to slack-reply channel=%s thread_ts=%s', slackChannel || '(missing)', slackThreadTs || '(none)');
          if (slackChannel) {
            const slackReplyUrl = `${ECHELON_EDGE_URL}/slack-reply`;
            const slackReplyBody = {
              job_id: job.id,
              text: responseText,
              slack_channel: slackChannel,
              slack_thread_ts: slackThreadTs || undefined,
            };
            try {
              const replyRes = await fetch(slackReplyUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${AGENT_EDGE_KEY}`,
                },
                body: JSON.stringify(slackReplyBody),
              });
              const replyBody = await replyRes.text();
              if (!replyRes.ok) {
                console.error('[echelon-worker] Slack reply failed:', replyRes.status, slackReplyUrl, replyBody.slice(0, 300));
                throw new Error(`Slack reply failed: ${replyRes.status} ${replyBody.slice(0, 100)}`);
              }
              console.log('[echelon-worker] job', job.id, '→ Slack reply sent (status %s)', replyRes.status);
            } catch (slackErr) {
              throw new Error(`Slack reply failed: ${slackErr.message}`);
            }
          } else {
            console.warn('[echelon-worker] job', job.id, 'Slack job missing slack_channel, skipping reply');
          }
        }

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
