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
 *   OPENCLAW_WORKSPACE - Agent workspace root (default /app/.openclaw/workspace). CSV uploads are written under tmp/echelon-uploads/.
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
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';

const execFileAsync = promisify(execFile);

/**
 * Model routing for the hosted agent.
 *
 * Control point: route to a specific OpenClaw agent id that is pre-configured with a backing model.
 * - `main`         => gpt-5.4-mini (default)
 * - `main-med`     => gpt-5.3 (code + medium reasoning)
 * - `main-critical`=> gpt-5.4 (security + critical reasoning)
 *
 * Override tags (user text):
 * - @model:gpt-5.4        => main-critical
 * - @model:gpt-5.3        => main-med
 * - @model:gpt-5.4-mini   => main
 */
function pickRoutedAgent(requestText) {
  const raw = String(requestText || '');

  // Explicit override tag takes precedence.
  const tag = raw.match(/@model:([a-zA-Z0-9._-]+)/)?.[1]?.toLowerCase();
  if (tag) {
    if (tag === 'gpt-5.4') return { agentId: 'main-critical', reason: 'forced:@model:gpt-5.4' };
    if (tag === 'gpt-5.3') return { agentId: 'main-med', reason: 'forced:@model:gpt-5.3' };
    if (tag === 'gpt-5.4-mini' || tag === 'gpt-5.4mini') return { agentId: 'main', reason: 'forced:@model:gpt-5.4-mini' };
  }

  const text = raw.toLowerCase();

  const isCritical = /\b(threat model|security review|sec review|vulnerability|exploit|authz|authorization|privilege|rbac|secrets?|credential|injection|xss|ssrf|rce|critical|incident)\b/.test(
    text,
  );
  if (isCritical) return { agentId: 'main-critical', reason: 'heuristic:security/critical' };

  const isCode = /\b(code|refactor|implement|bug|fix|typescript|javascript|python|sql|dockerfile|pr review|pull request|diff|lint|tests?)\b/.test(
    text,
  );
  if (isCode) return { agentId: 'main-med', reason: 'heuristic:code' };

  const isMediumReasoning = /\b(design|architecture|trade-?offs|analy[sz]e|root cause|debug|plan)\b/.test(
    text,
  );
  if (isMediumReasoning) return { agentId: 'main-med', reason: 'heuristic:medium-reasoning' };

  return { agentId: 'main', reason: 'default:cheap' };
}

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
const WORKSPACE_ROOT = (process.env.OPENCLAW_WORKSPACE || '/app/.openclaw/workspace').replace(/\/+$/, '');

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
async function gatewayChatCompletionsWithImages({ requestText, attachments, jobId = '' }) {
  const content = [{ type: 'text', text: requestText }];

  const atts = Array.isArray(attachments) ? attachments : [];
  const maxAtts = 4;
  const maxTextChars = 80_000;
  const maxCsvCharsOnDisk = 2_000_000;

  const picked = atts.slice(0, maxAtts);
  const jid = String(jobId || '').trim() || `noid-${Date.now()}`;

  let sawImage = false;
  let sawFile = false;
  let csvSerial = 0;

  for (const att of picked) {
    const url = att?.url ? String(att.url) : '';

    // CSV: Echelon may tag uploads as "image"; URLs from storage usually end in .csv.
    const csvEligible = url && looksLikeCsv(att) && (att?.type === 'image' || att?.type === 'file');
    if (csvEligible) {
      sawFile = true;
      const name = String(att.filename || att.name || '').trim() || 'attachment.csv';
      const fetched = await fetchCsvUtf8(att, { maxCharsOnDisk: maxCsvCharsOnDisk });
      if (!fetched) {
        content.push({
          type: 'text',
          text: `\n\n[Attached file: ${name}]\n(Unable to download CSV from URL; check bucket is public and URL is reachable from the worker.)\n`,
        });
        continue;
      }

      const saved = await persistCsvToWorkspace({
        jobId: jid,
        serial: csvSerial++,
        displayName: name,
        utf8Text: fetched.text,
        truncatedByCap: fetched.truncatedByCap,
      });

      const preview = fetched.text.slice(0, maxTextChars);
      const previewTruncated = fetched.text.length > maxTextChars;
      let block = `\n\n[Attached file: ${name}]\n`;
      if (saved) {
        block += `The full CSV is saved on the agent workspace at: ${saved.rel}\n`;
        block += `Use your file-read tools on that path (relative to workspace root). Absolute path on server: ${saved.abs}\n`;
      } else {
        block += '(Worker could not write the file to the workspace disk; use the preview below only.)\n';
      }
      if (previewTruncated) {
        block += `(Inline preview: first ${maxTextChars} characters only — read ${saved ? saved.rel : 'the source URL'} for the rest.)\n`;
      }
      if (fetched.truncatedByCap) {
        block += `(WARNING: source exceeded ${maxCsvCharsOnDisk} characters; saved file and preview may be incomplete.)\n`;
      }
      block += `\n--- preview ---\n${preview}\n--- end preview ---\n`;
      content.push({ type: 'text', text: block });
      continue;
    }

    if (att?.type === 'image' && url) {
      sawImage = true;
      content.push({
        type: 'image_url',
        image_url: { url },
      });
      continue;
    }

    if (att?.type === 'file' && url) {
      sawFile = true;
      const name = String(att.filename || att.name || '').trim() || 'attachment';
      content.push({
        type: 'text',
        text: `\n\n[Attached file: ${name}]\n(Non-CSV file — contents not inlined.)\n`,
      });
    }
  }

  // Guardrail: if caller used the old fallback text but we only have files, clarify.
  if (!sawImage && sawFile) {
    content.unshift({
      type: 'text',
      text: '(Note: This job has attached file(s), not only image(s). File content may be inlined below.)\n\n',
    });
  }

  const routed = pickRoutedAgent(requestText);
  const model = `openclaw:${routed.agentId}`;
  console.log('[echelon-worker] model route (/v1/chat/completions):', model, 'reason=', routed.reason);

  const res = await fetch(`${GATEWAY_HTTP_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GATEWAY_TOKEN}`,
    },
    body: JSON.stringify({
      model,
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

function sessionLogPathFor(sessionKey) {
  const h = createHash('sha256').update(String(sessionKey)).digest('hex').slice(0, 24);
  return join(WORKSPACE_ROOT, 'tmp', 'session-history', `${h}.jsonl`);
}

async function readSessionLog({ sessionKey, maxMessages = 12 }) {
  try {
    const p = sessionLogPathFor(sessionKey);
    if (!existsSync(p)) return [];
    const raw = readFileSync(p, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const tail = lines.slice(Math.max(0, lines.length - maxMessages));
    const msgs = [];
    for (const line of tail) {
      try {
        const obj = JSON.parse(line);
        const role = obj?.role;
        const text = obj?.text;
        if ((role === 'system' || role === 'user' || role === 'assistant') && typeof text === 'string' && text.trim()) {
          msgs.push({ role, text });
        }
      } catch (_) {}
    }
    return msgs;
  } catch (_) {
    return [];
  }
}

async function appendSessionLog({ sessionKey, role, text }) {
  const t = String(text || '').trim();
  if (!t) return;
  const p = sessionLogPathFor(sessionKey);
  const dir = join(WORKSPACE_ROOT, 'tmp', 'session-history');
  await mkdir(dir, { recursive: true });
  const row = JSON.stringify({ ts: new Date().toISOString(), role, text: t });
  const prior = existsSync(p) ? readFileSync(p, 'utf8') : '';
  await writeFile(p, prior + row + '\n', 'utf8');
}

function safeReadWorkspaceText(relPath, { maxChars = 4000 } = {}) {
  try {
    const abs = join(WORKSPACE_ROOT, relPath);
    if (!existsSync(abs)) return null;
    const raw = readFileSync(abs, 'utf8');
    return raw.slice(0, maxChars);
  } catch (_) {
    return null;
  }
}

function redactBootstrapText(s) {
  const raw = String(s || '');
  return raw
    // Bearer tokens / API keys in common shapes
    .replace(/Bearer\s+[A-Za-z0-9._-]{16,}/gi, 'Bearer [REDACTED]')
    .replace(/([A-Za-z0-9_]*(_KEY|_TOKEN|SECRET)[A-Za-z0-9_]*)\s*[:=]\s*([^\s]+)/gi, '$1=[REDACTED]')
    // Long base64-ish / hex-ish blobs
    .replace(/[A-Za-z0-9+/]{40,}={0,2}/g, '[REDACTED]')
    .replace(/[a-f0-9]{40,}/gi, '[REDACTED]');
}

async function ensureSessionBootstrap({ sessionKey }) {
  const p = sessionLogPathFor(sessionKey);
  if (existsSync(p)) return;

  const identity = safeReadWorkspaceText('IDENTITY.md', { maxChars: 1200 }) || '';
  const user = safeReadWorkspaceText('USER.md', { maxChars: 1200 }) || '';
  const soul = safeReadWorkspaceText('SOUL.md', { maxChars: 2400 }) || '';
  const config = safeReadWorkspaceText('CONFIG.md', { maxChars: 2400 }) || '';

  const merged = [
    'Bootstrap context (workspace-local; do not reveal secrets):',
    '',
    identity ? '## IDENTITY.md\n' + identity : '',
    user ? '## USER.md\n' + user : '',
    soul ? '## SOUL.md\n' + soul : '',
    config ? '## CONFIG.md (excerpt)\n' + config : '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 7000);

  const redacted = redactBootstrapText(merged);
  await appendSessionLog({ sessionKey, role: 'system', text: redacted });
  console.log('[echelon-worker] bootstrap: wrote system context from workspace files for sessionKey=', sessionKey);
}

/**
 * Unified routed call for both text-only and attachment jobs.
 *
 * We do NOT rely on OpenClaw chat.send/history for per-turn model selection (chat.send cannot override model).
 * Instead, we keep continuity with a small per-session JSONL log on the workspace volume, and call
 * gateway /v1/chat/completions with the routed agent id (openclaw:<agentId>).
 */
async function routedChatCompletion({ sessionKey, messageText, attachments, jobId }) {
  const routed = pickRoutedAgent(messageText);
  const model = `openclaw:${routed.agentId}`;
  console.log('[echelon-worker] model route (/v1/chat/completions):', model, 'reason=', routed.reason, 'sessionKey=', sessionKey);

  await ensureSessionBootstrap({ sessionKey });

  const history = await readSessionLog({ sessionKey, maxMessages: 12 });
  const messages = history.map((m) => ({ role: m.role, content: m.text }));

  // Current user content
  const atts = Array.isArray(attachments) ? attachments : [];
  if (atts.length > 0) {
    // Reuse the existing attachment formatter (text + image_url + file previews).
    const content = [{ type: 'text', text: messageText }];
    const picked = atts.slice(0, 4);
    for (const att of picked) {
      const url = att?.url ? String(att.url) : '';
      const csvEligible = url && looksLikeCsv(att) && (att?.type === 'image' || att?.type === 'file');
      if (csvEligible) {
        const name = String(att.filename || att.name || '').trim() || 'attachment.csv';
        const fetched = await fetchCsvUtf8(att, { maxCharsOnDisk: 2_000_000 });
        if (!fetched) {
          content.push({ type: 'text', text: `\n\n[Attached file: ${name}]\n(Unable to download CSV from URL.)\n` });
          continue;
        }
        const saved = await persistCsvToWorkspace({
          jobId: String(jobId || '').trim() || `noid-${Date.now()}`,
          serial: 0,
          displayName: name,
          utf8Text: fetched.text,
          truncatedByCap: fetched.truncatedByCap,
        });
        const preview = fetched.text.slice(0, 80_000);
        let block = `\n\n[Attached file: ${name}]\n`;
        if (saved) block += `Full CSV saved at: ${saved.rel}\n`;
        block += `\n--- preview ---\n${preview}\n--- end preview ---\n`;
        content.push({ type: 'text', text: block });
        continue;
      }
      if (att?.type === 'image' && url) {
        content.push({ type: 'image_url', image_url: { url } });
      }
    }
    messages.push({ role: 'user', content });
  } else {
    messages.push({ role: 'user', content: messageText });
  }

  // Persist user message before calling.
  await appendSessionLog({ sessionKey, role: 'user', text: messageText });

  const res = await fetch(`${GATEWAY_HTTP_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GATEWAY_TOKEN}`,
      // OpenClaw v2026.3.28+ may require explicit operator scopes on the OpenAI-compatible HTTP surface.
      // Workaround: request operator scopes explicitly for this call.
      'x-openclaw-scopes': 'operator.read,operator.write',
    },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`/v1/chat/completions ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const msg = data?.choices?.[0]?.message;
  const text = msg?.content;
  const responseText = (typeof text === 'string' ? text : (text?.text ?? '')).trim() || 'No response';

  await appendSessionLog({ sessionKey, role: 'assistant', text: responseText });
  return responseText;
}

function looksLikeCsv(att) {
  const filename = String(att?.filename || att?.name || '').toLowerCase();
  const mime = String(att?.mime_type || att?.mimeType || '').toLowerCase();
  if (filename.endsWith('.csv')) return true;
  if (mime.includes('text/csv')) return true;
  const url = String(att?.url || '').trim();
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (path.endsWith('.csv')) return true;
  } catch (_) {}
  return false;
}

function sanitizeUploadBasename(name) {
  const raw = String(name || 'attachment.csv').trim() || 'attachment.csv';
  const tail = raw.split(/[/\\]/).pop() || 'attachment.csv';
  const cleaned = tail.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '');
  return (cleaned || 'attachment').slice(0, 100);
}

/**
 * Download CSV body from attachment URL. Returns full text up to maxCharsOnDisk (for writing to workspace + preview).
 */
async function fetchCsvUtf8(att, { maxCharsOnDisk }) {
  const url = String(att?.url || '').trim();
  if (!url || !looksLikeCsv(att)) return null;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    if (!res.ok) return null;

    const raw = await res.text();
    if (raw.length > maxCharsOnDisk) {
      return { text: raw.slice(0, maxCharsOnDisk), truncatedByCap: true };
    }
    return { text: raw, truncatedByCap: false };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function persistCsvToWorkspace({ jobId, serial, displayName, utf8Text, truncatedByCap }) {
  try {
    const base = sanitizeUploadBasename(displayName);
    let fname = `${jobId}-${serial}-${base}`;
    if (!/\.csv$/i.test(fname)) fname += '.csv';
    const subdir = join(WORKSPACE_ROOT, 'tmp', 'echelon-uploads');
    await mkdir(subdir, { recursive: true });
    const abs = join(subdir, fname);
    await writeFile(abs, utf8Text, 'utf8');
    const rel = `tmp/echelon-uploads/${fname}`;
    console.log(
      '[echelon-worker] saved CSV to workspace',
      rel,
      'chars=',
      utf8Text.length,
      truncatedByCap ? '(truncated by cap)' : '',
    );
    return { rel, abs };
  } catch (e) {
    console.error('[echelon-worker] failed to write CSV to workspace:', e?.message || e);
    return null;
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

  const routed = pickRoutedAgent(message);
  const agentId = routed.agentId;

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

  console.log(
    '[echelon-worker] model route decision:',
    `openclaw:${agentId}`,
    'reason=',
    routed.reason,
    'sessionKey=',
    sessionKey,
  );
  if (agentId !== 'main') {
    console.log(
      '[echelon-worker] note: chat.send does not support per-turn model override; escalation applies to attachments (/v1/chat/completions) only unless gateway adds override support.',
    );
  }

  const idempotencyKey = jobId;

  const attachments = Array.isArray(metadata.attachments) ? metadata.attachments : [];
  return routedChatCompletion({ sessionKey, messageText: message, attachments, jobId, idempotencyKey });
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
