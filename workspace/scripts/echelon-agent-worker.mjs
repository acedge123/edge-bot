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
 *   After successful Slack/SMS delivery, markers under tmp/echelon-delivery/ prevent duplicate outbound sends on job retry (volume-backed).
 *   SIGNAL_APPROVAL_SLACK_CHANNEL - Slack channel for approval-required app signals (default C0BVBR6029Y).
 *   ECHELON_PROCESS_APP_SIGNALS_WITH_LLM - Opt-in for model processing of app signals (default false).
 *   ECHELON_CIRCUIT_FAILURE_THRESHOLD - Consecutive provider failures before pausing claims (default 2).
 *   ECHELON_CIRCUIT_OPEN_MS - How long to pause claims after the circuit opens (default 15 minutes).
 *
 * SMS jobs use per-sender sessions. Slack jobs use per-thread sessions. Echelon UI jobs use per-actor sessions.
 * App signal approval jobs: Jobs with metadata.source = "app_signal" and approval markers post to Slack before acking done.
 *
 * Image attachments: Jobs with real image URLs use POST /v1/chat/completions for vision.
 * Text and CSV jobs use chat.send so OpenClaw owns session context and compaction.
 *
 * Run alongside openclaw gateway. On Railway, both run in same container.
 */

import { readFileSync, existsSync } from 'fs';
import { mkdir, writeFile, rename } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { pickRoutedAgent } from './echelon-model-route.mjs';
import { answerCapabilityQuery } from './echelon-capability-query.mjs';
import { buildEchelonSessionKey } from './echelon-session-key.mjs';
import {
  downloadWorkbookAttachment,
  isWorkbookAttachment,
  MAX_WORKBOOK_BYTES,
} from './echelon-workbook-attachment.mjs';
import {
  buildDeterministicAppSignalResponse,
  isApprovalRequiredSignalJob,
  shouldBypassAppSignalModel,
} from './echelon-app-signal-policy.mjs';

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
const WORKSPACE_ROOT = (process.env.OPENCLAW_WORKSPACE || '/app/.openclaw/workspace').replace(/\/+$/, '');
const SIGNAL_APPROVAL_SLACK_CHANNEL = (
  process.env.SIGNAL_APPROVAL_SLACK_CHANNEL ||
  process.env.SLACK_OPS_CHANNEL_ID ||
  process.env.SLACK_OPS_CHANNEL_NAME ||
  'C0BVBR6029Y'
).trim();
const PROCESS_APP_SIGNALS_WITH_LLM = /^(1|true|yes)$/i.test(
  String(process.env.ECHELON_PROCESS_APP_SIGNALS_WITH_LLM || '').trim(),
);
function positiveIntegerEnv(name, fallback, minimum) {
  const parsed = Number.parseInt(process.env[name] || String(fallback), 10);
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : fallback;
}

const CIRCUIT_FAILURE_THRESHOLD = positiveIntegerEnv('ECHELON_CIRCUIT_FAILURE_THRESHOLD', 2, 1);
const CIRCUIT_OPEN_MS = positiveIntegerEnv('ECHELON_CIRCUIT_OPEN_MS', 15 * 60 * 1000, 60_000);

/** Durable idempotency markers (Slack/SMS) — survives restarts when workspace is on a Railway volume. */
const ECHELON_DELIVERY_DIR = () => join(WORKSPACE_ROOT, 'tmp', 'echelon-delivery');

function safeJobIdForPath(jobId) {
  return String(jobId || 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '_') || 'unknown';
}

const CIRCUIT_STATE_PATH = () => join(WORKSPACE_ROOT, 'tmp', 'echelon-circuit-breaker.json');
let consecutiveProviderFailures = 0;
let circuitOpenUntil = 0;
let circuitLogUntil = 0;

function readCircuitState() {
  try {
    const state = JSON.parse(readFileSync(CIRCUIT_STATE_PATH(), 'utf8'));
    circuitOpenUntil = Number(state?.openUntil) || 0;
    consecutiveProviderFailures = Number(state?.consecutiveProviderFailures) || 0;
  } catch (_) {
    circuitOpenUntil = 0;
    consecutiveProviderFailures = 0;
  }
}

async function writeCircuitState() {
  const path = CIRCUIT_STATE_PATH();
  const tmpPath = `${path}.tmp`;
  await mkdir(join(WORKSPACE_ROOT, 'tmp'), { recursive: true });
  await writeFile(
    tmpPath,
    JSON.stringify({
      v: 1,
      openUntil: circuitOpenUntil,
      consecutiveProviderFailures,
      updatedAt: new Date().toISOString(),
    }),
    'utf8',
  );
  await rename(tmpPath, path);
}

function isProviderFailure(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('insufficient_quota') ||
    message.includes('no credits remaining') ||
    message.includes('upstream provider timeout') ||
    message.includes('timeout waiting for agent response') ||
    message.includes('rate limit') ||
    message.includes('/v1/chat/completions 408') ||
    message.includes('/v1/chat/completions 429') ||
    message.includes('stream disconnected before completion')
  );
}

async function recordProviderFailure(error) {
  if (!isProviderFailure(error)) return false;

  consecutiveProviderFailures += 1;
  if (consecutiveProviderFailures >= CIRCUIT_FAILURE_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
    console.error(
      '[echelon-worker] provider circuit opened after %s consecutive failures; pausing claims until %s',
      consecutiveProviderFailures,
      new Date(circuitOpenUntil).toISOString(),
    );
  }
  await writeCircuitState().catch((stateError) =>
    console.error('[echelon-worker] failed to persist circuit state:', stateError.message),
  );
  return true;
}

async function resetProviderCircuit() {
  if (consecutiveProviderFailures === 0 && circuitOpenUntil === 0) return;
  consecutiveProviderFailures = 0;
  circuitOpenUntil = 0;
  await writeCircuitState().catch((stateError) =>
    console.error('[echelon-worker] failed to clear circuit state:', stateError.message),
  );
}

function circuitWaitMs() {
  return Math.max(0, circuitOpenUntil - Date.now());
}

readCircuitState();

function readDeliveryMarker(kind, jobId) {
  const p = join(ECHELON_DELIVERY_DIR(), `${kind}-${safeJobIdForPath(jobId)}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

/** Atomic write so a crash mid-write does not leave a complete marker. */
async function writeDeliveryMarker(kind, jobId, extraFields) {
  const dir = ECHELON_DELIVERY_DIR();
  await mkdir(dir, { recursive: true });
  const base = `${kind}-${safeJobIdForPath(jobId)}.json`;
  const finalPath = join(dir, base);
  const tmpPath = join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
  const payload = JSON.stringify({
    v: 1,
    kind,
    jobId: String(jobId),
    ...extraFields,
    savedAt: new Date().toISOString(),
  });
  await writeFile(tmpPath, payload, 'utf8');
  await rename(tmpPath, finalPath);
}

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
  console.log('  SIGNAL_APPROVAL_SLACK_CHANNEL:', SIGNAL_APPROVAL_SLACK_CHANNEL || '(missing)');
  console.log('  App signal model processing:', PROCESS_APP_SIGNALS_WITH_LLM ? 'enabled' : 'disabled (deterministic)');
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
 * Call gateway POST /v1/chat/completions with multimodal content.
 * Used only when at least one attachment is a real image; otherwise we use chat.send.
 *
 * Attachment support:
 * - image: content includes { type: "image_url", image_url: { url } }
 * - file (csv/text): worker downloads and injects file text as additional { type: "text", text }
 */
async function gatewayChatCompletionsWithImages({ requestText, attachments, metadata = {}, jobId = '' }) {
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
  let workbookSerial = 0;

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

    if (url && isWorkbookAttachment(att)) {
      sawFile = true;
      const name = String(att.filename || att.name || '').trim() || 'workbook.xlsx';
      const saved = await downloadWorkbookAttachment({
        att,
        workspaceRoot: WORKSPACE_ROOT,
        jobId: jid,
        serial: workbookSerial++,
      });
      if (saved.ok) {
        console.log('[echelon-worker] saved workbook to workspace', saved.rel, 'bytes=', saved.bytes);
        content.push({
          type: 'text',
          text: `\n\n[Attached workbook: ${name}]\nThe workbook is saved at ${saved.rel} (absolute path: ${saved.abs}).\nUse Python with openpyxl for .xlsx/.xlsm or xlrd for .xls. Complete the requested analysis in this run; do not reply with only a plan.\n`,
        });
      } else {
        const maxMb = Math.floor(MAX_WORKBOOK_BYTES / 1024 / 1024);
        content.push({
          type: 'text',
          text: `\n\n[Attached workbook: ${name}]\n(Unable to make this workbook available: ${saved.reason}. Supported formats are .xls/.xlsx/.xlsm up to ${maxMb} MB.)\n`,
        });
      }
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

  const routed = pickRoutedAgent(requestText, metadata);
  const model = `openclaw:${routed.agentId}`;
  console.log('[echelon-worker] model route (/v1/chat/completions):', model, 'reason=', routed.reason);

  const res = await fetch(`${GATEWAY_HTTP_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GATEWAY_TOKEN}`,
      // OpenClaw v2026.3.28+ may require explicit operator scopes on the OpenAI-compatible HTTP surface.
      'x-openclaw-scopes': 'operator.read,operator.write',
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

function isRealImageAttachment(att) {
  if (att?.type !== 'image') return false;
  const url = att?.url ? String(att.url) : '';
  return Boolean(url) && !looksLikeCsv(att) && !isWorkbookAttachment(att);
}

function jobNeedsCompletionsPath(attachments) {
  const atts = Array.isArray(attachments) ? attachments : [];
  return atts.some(isRealImageAttachment);
}

async function formatCsvAttachment(
  att,
  { jobId, serial, maxTextChars = 80_000, maxCsvCharsOnDisk = 2_000_000 },
) {
  const name = String(att.filename || att.name || '').trim() || 'attachment.csv';
  const fetched = await fetchCsvUtf8(att, { maxCharsOnDisk: maxCsvCharsOnDisk });
  if (!fetched) {
    return `\n\n[Attached file: ${name}]\n(Unable to download CSV from URL; check bucket is public and URL is reachable from the worker.)\n`;
  }

  const saved = await persistCsvToWorkspace({
    jobId: String(jobId || '').trim() || `noid-${Date.now()}`,
    serial,
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
    block += `(Inline preview: first ${maxTextChars} characters only - read ${saved ? saved.rel : 'the source URL'} for the rest.)\n`;
  }
  if (fetched.truncatedByCap) {
    block += `(WARNING: source exceeded ${maxCsvCharsOnDisk} characters; saved file and preview may be incomplete.)\n`;
  }
  block += `\n--- preview ---\n${preview}\n--- end preview ---\n`;
  return block;
}

async function augmentMessageWithFileAttachments({ requestText, attachments, jobId }) {
  const picked = (Array.isArray(attachments) ? attachments : []).slice(0, 4);
  const normalizedJobId = String(jobId || '').trim() || `noid-${Date.now()}`;
  let message = requestText;
  let sawFile = false;
  let csvSerial = 0;
  let workbookSerial = 0;

  for (const att of picked) {
    const url = att?.url ? String(att.url) : '';
    const csvEligible = url && looksLikeCsv(att) && (att?.type === 'image' || att?.type === 'file');
    if (csvEligible) {
      sawFile = true;
      message += await formatCsvAttachment(att, {
        jobId: normalizedJobId,
        serial: csvSerial++,
      });
      continue;
    }
    if (url && isWorkbookAttachment(att)) {
      sawFile = true;
      const name = String(att.filename || att.name || '').trim() || 'workbook.xlsx';
      const saved = await downloadWorkbookAttachment({
        att,
        workspaceRoot: WORKSPACE_ROOT,
        jobId: normalizedJobId,
        serial: workbookSerial++,
      });
      if (saved.ok) {
        console.log('[echelon-worker] saved workbook to workspace', saved.rel, 'bytes=', saved.bytes);
        message += `\n\n[Attached workbook: ${name}]\n`;
        message += `The workbook is saved at ${saved.rel} (absolute path: ${saved.abs}).\n`;
        message += 'Use Python with openpyxl for .xlsx/.xlsm or xlrd for .xls to inspect every worksheet and value needed for the request. ';
        message += 'Complete the requested analysis in this run; do not reply with only a plan or promise of future work.\n';
      } else {
        const maxMb = Math.floor(MAX_WORKBOOK_BYTES / 1024 / 1024);
        message += `\n\n[Attached workbook: ${name}]\n`;
        message += `(Unable to make this workbook available: ${saved.reason}. Supported formats are .xls/.xlsx/.xlsm up to ${maxMb} MB.)\n`;
      }
      continue;
    }
    if (att?.type === 'file' && url) {
      sawFile = true;
      const name = String(att.filename || att.name || '').trim() || 'attachment';
      message += `\n\n[Attached file: ${name}]\n(Non-CSV file - contents not inlined.)\n`;
    }
  }

  return sawFile
    ? '(Note: This job has attached file(s). File content may be inlined below.)\n\n' + message
    : message;
}

async function chatSendAndWaitForReply({ sessionKey, message, idempotencyKey, timeoutMs = 15 * 60 * 1000 }) {
  let baselineLastTs = 0;
  try {
    const baseline = await gatewayCall('chat.history', { sessionKey, limit: 5 }, { timeoutMs: 10_000 });
    const messages = baseline?.messages || [];
    baselineLastTs = [...messages].reverse().find((item) => item.role === 'assistant')?.timestamp || 0;
  } catch (_) {
    // New sessions have no history yet.
  }

  await gatewayCall(
    'chat.send',
    {
      sessionKey,
      message,
      deliver: false,
      idempotencyKey,
      timeoutMs,
    },
    { timeoutMs: 70_000 },
  );

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const history = await gatewayCall('chat.history', { sessionKey, limit: 50 }, { timeoutMs: 10_000 });
    const messages = history?.messages || [];
    const reply = [...messages]
      .reverse()
      .find(
        (item) =>
          item.role === 'assistant' &&
          (item.timestamp || 0) > baselineLastTs &&
          Array.isArray(item.content),
      );
    const text = reply?.content?.map((item) => item?.text).filter(Boolean).join('')?.trim() || '';
    if (text) return text;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  throw new Error('Timeout waiting for agent response');
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

async function sendSlackReply({ job, responseText, slackChannel, slackThreadTs = '' }) {
  const channel = String(slackChannel || '').trim();
  const threadTs = String(slackThreadTs || '').trim();
  if (!channel) {
    throw new Error('Slack delivery requires a non-empty channel');
  }

  console.log(
    '[echelon-worker] job',
    job.id,
    'Slack delivery -> channel=%s thread_ts=%s',
    channel,
    threadTs || '(none)',
  );

  const slackMarker = readDeliveryMarker('slack', job.id);
  const markerChannel = slackMarker?.slack_channel != null ? String(slackMarker.slack_channel) : '';
  const markerThread = slackMarker?.slack_thread_ts != null ? String(slackMarker.slack_thread_ts) : '';
  const sameThread =
    slackMarker?.v === 1 &&
    slackMarker.kind === 'slack' &&
    markerChannel === channel &&
    markerThread === threadTs;

  if (sameThread) {
    console.log('[echelon-worker] job', job.id, 'Slack delivery already recorded; skipping slack-reply');
    return;
  }

  const slackReplyUrl = `${ECHELON_EDGE_URL}/slack-reply`;
  const replyRes = await fetch(slackReplyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AGENT_EDGE_KEY}`,
    },
    body: JSON.stringify({
      job_id: job.id,
      text: responseText,
      slack_channel: channel,
      slack_thread_ts: threadTs || undefined,
    }),
  });
  const replyBody = await replyRes.text();
  if (!replyRes.ok) {
    console.error('[echelon-worker] Slack reply failed:', replyRes.status, slackReplyUrl, replyBody.slice(0, 300));
    throw new Error(`Slack reply failed: ${replyRes.status} ${replyBody.slice(0, 100)}`);
  }

  await writeDeliveryMarker('slack', job.id, {
    slack_channel: channel,
    slack_thread_ts: threadTs,
  });
  console.log('[echelon-worker] job', job.id, '-> Slack reply sent (status %s)', replyRes.status);
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

  // Detect job source before deterministic handling and model routing.
  const source = String(metadata.source || '').trim();

  if (shouldBypassAppSignalModel(metadata, PROCESS_APP_SIGNALS_WITH_LLM)) {
    console.log('[echelon-worker] job', jobId, 'app_signal bypassed model processing');
    return buildDeterministicAppSignalResponse({ message, metadata });
  }

  const capabilityResponse = answerCapabilityQuery(message, (skill) =>
    existsSync(join(WORKSPACE_ROOT, 'skills', skill, 'SKILL.md')),
  );
  if (capabilityResponse) {
    console.log('[echelon-worker] job', jobId, 'capability query bypassed model processing');
    return capabilityResponse;
  }

  const routed = pickRoutedAgent(message, metadata);
  const agentId = routed.agentId;

  if (source === 'sms' && !String(metadata.from_number || '').trim()) {
    throw new Error('SMS job missing metadata.from_number');
  }
  if (source === 'slack' && !String(metadata.slack_user || '').trim()) {
    throw new Error('Slack job missing metadata.slack_user');
  }
  const sessionKey = buildEchelonSessionKey({
    agentId,
    tenantId,
    actorId: job.actor_id || job.actorId,
    source,
    metadata,
    jobId,
  });

  console.log(
    '[echelon-worker] model route decision:',
    `openclaw:${agentId}`,
    'reason=',
    routed.reason,
    'sessionKey=',
    sessionKey,
  );
  const idempotencyKey = jobId;
  const attachments = Array.isArray(metadata.attachments) ? metadata.attachments : [];
  if (jobNeedsCompletionsPath(attachments)) {
    console.log(
      '[echelon-worker] job',
      jobId,
      'using /v1/chat/completions with',
      attachments.length,
      'attachment(s) (vision only)',
    );
    return gatewayChatCompletionsWithImages({ requestText: message, attachments, metadata, jobId });
  }

  let outboundMessage = message;
  if (attachments.length > 0) {
    outboundMessage = await augmentMessageWithFileAttachments({
      requestText: message,
      attachments,
      jobId,
    });
    console.log('[echelon-worker] job', jobId, 'file attachment(s) inlined; using chat.send');
  }

  return chatSendAndWaitForReply({ sessionKey, message: outboundMessage, idempotencyKey });
}

async function runLoop() {
  while (true) {
    try {
      const waitMs = circuitWaitMs();
      if (waitMs > 0) {
        if (circuitLogUntil !== circuitOpenUntil) {
          console.warn(
            '[echelon-worker] provider circuit is open; not claiming jobs until',
            new Date(circuitOpenUntil).toISOString(),
          );
          circuitLogUntil = circuitOpenUntil;
        }
        await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 30_000)));
        continue;
      }
      if (circuitOpenUntil > 0) {
        circuitOpenUntil = 0;
        circuitLogUntil = 0;
        console.warn('[echelon-worker] provider circuit half-open; allowing one probe job');
        await writeCircuitState().catch((stateError) =>
          console.error('[echelon-worker] failed to persist half-open circuit state:', stateError.message),
        );
      }

      const job = await claimNextJob();
      if (!job) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        continue;
      }

      try {
        const responseText = await handleJob(job);
        await resetProviderCircuit();

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
        const approvalSignalJob = isApprovalRequiredSignalJob(metadata, job.request_text || job.text || '');
        console.log(
          '[echelon-worker] job',
          job.id,
          'source=%s slack_channel=%s approval_signal=%s',
          source || '(none)',
          metadata.slack_channel || '(none)',
          approvalSignalJob ? 'yes' : 'no',
        );

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

          const smsMarker = readDeliveryMarker('sms', job.id);
          if (smsMarker?.v === 1 && smsMarker.kind === 'sms' && String(smsMarker.to) === fromNumber) {
            console.log('[echelon-worker] job', job.id, 'SMS delivery already recorded; skipping Repo C send');
          } else {
            try {
              await sendSmsViaRepoC({
                tenantId: job.tenant_id || job.tenantId || 'default',
                toNumber: fromNumber,
                messageText: responseText,
              });
              await writeDeliveryMarker('sms', job.id, { to: fromNumber });
              console.log('[echelon-worker] job', job.id, '→ SMS sent to', fromNumber);
            } catch (smsErr) {
              throw new Error(`SMS send failed: ${smsErr.message}`);
            }
          }
        }

        const isSlackJob = source === 'slack';
        if (isSlackJob || approvalSignalJob) {
          const slackChannel = String(metadata.slack_channel || '').trim() || (approvalSignalJob ? SIGNAL_APPROVAL_SLACK_CHANNEL : '');
          const slackThreadTs = String(metadata.slack_thread_ts || '').trim();
          await sendSlackReply({
            job,
            responseText,
            slackChannel,
            slackThreadTs,
          });
        }

        await ackJob(job.id, 'done', { responseText });
        console.log('[echelon-worker] job', job.id, '→ done');
      } catch (err) {
        console.error('[echelon-worker] job', job.id, 'error:', err.message);
        await recordProviderFailure(err);
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
