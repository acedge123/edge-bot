#!/usr/bin/env node
/**
 * Persistent jobs worker for edge-bot. Runs on the Mac; polls Supabase jobs table,
 * atomically claims one job, POSTs to local OpenClaw /hooks/wake (or /hooks/agent), marks done/failed.
 *
 * Env (e.g. from ~/.openclaw/.env):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or key with access to jobs + RPC)
 *   OPENCLAW_HOOK_URL (default http://127.0.0.1:18789/hooks/wake)
 *   OPENCLAW_HOOK_TOKEN (required if hook requires auth)
 *   JOBS_WORKER_ID (optional, default openclaw-worker)
 *   JOBS_POLL_INTERVAL_MS (optional, default 4000)
 *
 * Run as daemon: pm2 start scripts/jobs-worker.mjs --name openclaw-worker
 * Or launchd (see docs/WORKER_DAEMON.md).
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nljlsqgldgmxlbylqazg.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENCLAW_HOOK_URL = process.env.OPENCLAW_HOOK_URL || 'http://127.0.0.1:18789/hooks/wake';
const OPENCLAW_HOOK_TOKEN = process.env.OPENCLAW_HOOK_TOKEN || '';
const WORKER_ID = process.env.JOBS_WORKER_ID || 'openclaw-worker';
const POLL_MS = Math.max(2000, parseInt(process.env.JOBS_POLL_INTERVAL_MS || '4000', 10));

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY. Set in env or ~/.openclaw/.env');
  process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function claimOne() {
  const { data, error } = await supabase.rpc('claim_next_job', { p_worker_id: WORKER_ID });
  if (error) {
    console.error('claim_next_job error:', error.message);
    return null;
  }
  const job = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return job;
}

async function completeJob(jobId, status, lastError = null) {
  const { error } = await supabase.rpc('complete_job', {
    p_job_id: jobId,
    p_status: status,
    p_last_error: lastError,
  });
  if (error) console.error('complete_job error:', error.message);
}

async function runOpenClawAction(job) {
  const body = {
    text: job.payload?.text ?? `Job ${job.type}: ${JSON.stringify(job.payload)}`,
    mode: 'now',
  };
  const headers = {
    'Content-Type': 'application/json',
  };
  if (OPENCLAW_HOOK_TOKEN) headers['Authorization'] = `Bearer ${OPENCLAW_HOOK_TOKEN}`;

  const res = await fetch(OPENCLAW_HOOK_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Hook ${res.status}: ${t}`);
  }
}

async function runLoop() {
  while (true) {
    try {
      const job = await claimOne();
      if (job) {
        try {
          await runOpenClawAction(job);
          await completeJob(job.id, 'done');
          console.log('[worker] done', job.id, job.type);
        } catch (err) {
          await completeJob(job.id, 'failed', err.message);
          console.error('[worker] failed', job.id, err.message);
        }
        continue;
      }
    } catch (e) {
      console.error('[worker] error', e.message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

runLoop();
