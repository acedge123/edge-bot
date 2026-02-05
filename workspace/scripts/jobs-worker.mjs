#!/usr/bin/env node
/**
 * Jobs worker: poke-only. Polls Supabase for queued jobs; when any exist, wakes
 * OpenClaw via the CLI (openclaw system event --mode now). Does NOT claim or
 * complete jobs — OpenClaw pulls from Supabase (claim_next_job / complete_job)
 * when it runs.
 *
 * Env (e.g. from ~/.openclaw/.env):
 *   SUPABASE_URL, SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 *   OPENCLAW_CLI_PATH (default /opt/homebrew/bin/openclaw)
 *   OPENCLAW_GATEWAY_URL (optional, e.g. ws://127.0.0.1:18789) — passed to openclaw system event --url
 *   OPENCLAW_GATEWAY_TOKEN or OPENCLAW_HOOK_TOKEN (optional) — passed as --token
 *   JOBS_POLL_INTERVAL_MS (default 4000)
 *   JOBS_WAKE_COOLDOWN_MS (default 30000) — after waking, wait this long before checking again
 *
 * Run as daemon: see docs/WORKER_DAEMON.md. Full contract: docs/JOBS_AND_WAKE_REFERENCE.md.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawn } from 'child_process';

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

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nljlsqgldgmxlbylqazg.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENCLAW_CLI_PATH = process.env.OPENCLAW_CLI_PATH || '/opt/homebrew/bin/openclaw';
const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || process.env.OPENCLAW_HOOK_TOKEN || '';
const POLL_MS = Math.max(2000, parseInt(process.env.JOBS_POLL_INTERVAL_MS || '4000', 10));
const COOLDOWN_MS = Math.max(5000, parseInt(process.env.JOBS_WAKE_COOLDOWN_MS || '30000', 10));

const supabaseKey = SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
  const envPath = process.env.OPENCLAW_ENV_FILE || join(homedir(), '.openclaw', '.env');
  console.error(`Missing SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY. Set in ~/.openclaw/.env. (Checked: ${envPath})`);
  process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, supabaseKey);

/** Check if there is at least one queued job (read-only; we do not claim). */
async function hasQueuedJob() {
  const { data, error } = await supabase
    .from('jobs')
    .select('id')
    .eq('status', 'queued')
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[worker] jobs check error:', error.message);
    return false;
  }
  return data != null;
}

/** Wake OpenClaw via CLI: openclaw system event --text "..." --mode now. */
function wakeOpenClaw() {
  return new Promise((resolve, reject) => {
    const args = [
      'system', 'event',
      '--text', 'new job queued',
      '--mode', 'now',
      '--url', OPENCLAW_GATEWAY_URL,
    ];
    if (OPENCLAW_GATEWAY_TOKEN) args.push('--token', OPENCLAW_GATEWAY_TOKEN);

    const child = spawn(OPENCLAW_CLI_PATH, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stderr = '';
    child.stderr?.on('data', (c) => { stderr += c; });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`openclaw exit ${code}${stderr ? ': ' + stderr.trim().slice(-200) : ''}`));
    });
  });
}

async function runLoop() {
  while (true) {
    try {
      const queued = await hasQueuedJob();
      if (queued) {
        try {
          await wakeOpenClaw();
          console.log('[worker] wake sent (openclaw system event); OpenClaw will pull jobs from Supabase');
        } catch (err) {
          console.error('[worker] wake error:', err.message);
        }
        await new Promise((r) => setTimeout(r, COOLDOWN_MS));
        continue;
      }
    } catch (e) {
      console.error('[worker] error', e.message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

runLoop();
