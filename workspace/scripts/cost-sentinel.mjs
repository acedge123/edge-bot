#!/usr/bin/env node
/**
 * Cost Sentinel (v1): OpenAI + (stub) Composio
 *
 * Produces a short text report suitable for iMessage.
 *
 * Env:
 *   OPENAI_API_KEY (required for OpenAI)
 *   COMPOSIO_API_KEY (optional; v1 stub)
 */

import { readFileSync, existsSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const args = new Set(process.argv.slice(2));
const mode = (() => {
  const m = process.argv.find((a) => a.startsWith('--mode='))?.slice('--mode='.length);
  return m || 'daily';
})();
const dryRun = args.has('--dry-run');
const checkPause = args.has('--check-pause');

// Kill-switch: write ~/.openclaw/.cost-pause when spend exceeds threshold; jobs-worker refuses non-chat_ui jobs
const COST_PAUSE_FILE = join(homedir(), '.openclaw', '.cost-pause');
const COST_PAUSE_DAILY_USD = parseFloat(process.env.COST_PAUSE_DAILY_USD || '0') || 0;
const COST_PAUSE_HOURLY_USD = parseFloat(process.env.COST_PAUSE_HOURLY_USD || '0') || 0;

function loadEnvFileIfPresent() {
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
  } catch {
    // ignore
  }
}

// Ensure cron runs (which may not inherit ~/.openclaw/.env) still see secrets.
loadEnvFileIfPresent();

function isoDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatUSD(value, { unit = 'usd' } = {}) {
  if (value == null || Number.isNaN(Number(value))) return 'n/a';
  if (unit === 'cents') return `$${(Number(value) / 100).toFixed(2)}`;
  return `$${Number(value).toFixed(2)}`;
}

async function fetchJson(url, headers) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`non-json response from ${url}: ${text.slice(0, 120)}`);
  }
}

async function openaiCostsSummary({ startUnixSec, endUnixSec, bucketWidth = '1d' }) {
  // New-style org usage/costs endpoints require a key with api.usage.read scope.
  const key = process.env.OPENAI_ADMIN_API_KEY || process.env.OPENAI_ADMIN_KEY || process.env.OPENAI_API_KEY;
  if (!key) {
    return { ok: false, summary: 'OpenAI: missing OPENAI_ADMIN_API_KEY (or OPENAI_ADMIN_KEY / OPENAI_API_KEY with api.usage.read)' };
  }

  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  // NOTE: This endpoint paginates buckets. If you request a wide range (e.g. MTD), you MUST follow
  // next_page until has_more=false, otherwise you’ll undercount (often capped to 7 buckets).
  const baseUrl = `https://api.openai.com/v1/organization/costs?start_time=${startUnixSec}&end_time=${endUnixSec}&bucket_width=${bucketWidth || '1d'}`;

  try {
    let pageUrl = baseUrl;
    let guard = 0;

    // Flexible parsing: sum any bucket.result.amount.value fields if present.
    let totalUsd = 0;
    let foundAny = false;

    // Keep the first page for debugging.
    let firstPageRaw = null;

    while (pageUrl) {
      guard += 1;
      if (guard > 50) throw new Error('OpenAI costs: pagination guard tripped (>50 pages)');

      const data = await fetchJson(pageUrl, headers);
      if (!firstPageRaw) firstPageRaw = data;

      const buckets = Array.isArray(data?.data) ? data.data : [];
      for (const b of buckets) {
        const results = Array.isArray(b?.results) ? b.results : [];
        for (const r of results) {
          const amt = r?.amount;
          const vRaw =
            (amt && (typeof amt.value === 'number' || typeof amt.value === 'string') ? amt.value : null) ??
            (typeof r?.amount_usd === 'number' || typeof r?.amount_usd === 'string' ? r.amount_usd : null);

          const v = typeof vRaw === 'string' ? Number.parseFloat(vRaw) : vRaw;
          if (typeof v === 'number' && Number.isFinite(v)) {
            totalUsd += v;
            foundAny = true;
          }
        }
      }

      if (data?.has_more && data?.next_page) {
        pageUrl = `${baseUrl}&page=${encodeURIComponent(data.next_page)}`;
      } else {
        pageUrl = null;
      }
    }

    // Some orgs may return total_cost. Prefer our computed sum if we found any line items;
    // fall back to total_cost when there were no parsed items.
    if (!foundAny && typeof firstPageRaw?.total_cost === 'number') {
      return { ok: true, usd: firstPageRaw.total_cost, raw: firstPageRaw };
    }

    if (!foundAny) {
      return { ok: false, summary: 'OpenAI costs: unexpected response shape (endpoint ok but could not parse any results)' };
    }

    return { ok: true, usd: totalUsd, raw: firstPageRaw };
  } catch (e) {
    // Provide human-actionable hints for the common failure modes.
    const msg = String(e.message || e);
    if (msg.includes('Missing scopes') || msg.includes('insufficient permissions')) {
      return { ok: false, summary: 'OpenAI: insufficient permissions for Costs API (need api.usage.read scope; use an admin/org key)' };
    }
    if (msg.includes('404')) {
      return { ok: false, summary: 'OpenAI: Costs API unavailable (404). Account may not have org usage endpoints enabled.' };
    }
    return { ok: false, summary: `OpenAI costs fetch failed: ${msg}` };
  }
}

async function buildReport() {
  const now = new Date();

  // Daily report = yesterday (local date) and month-to-date.
  // (We keep it simple: date arithmetic in local time.)
  const y = new Date(now);
  y.setDate(y.getDate() - 1);

  const startYesterday = isoDate(y);
  const endYesterday = isoDate(now);

  const startMonth = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const endToday = isoDate(now);

  const titleDate = isoDate(now);

  const lines = [];
  lines.push(`Cost Sentinel (${titleDate})`);

  if (mode === 'weekly') {
    // last 7 days
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    const start7 = isoDate(start);
    const end = isoDate(now);

    const openai7 = await openaiCostsSummary({
      startUnixSec: Math.floor(new Date(start7).getTime() / 1000),
      endUnixSec: Math.floor(new Date(end).getTime() / 1000),
    });
    if (openai7.ok) lines.push(`OpenAI (last 7d): ${formatUSD(openai7.usd)}`);
    else lines.push(openai7.summary);

    const openaiMtd = await openaiCostsSummary({
      startUnixSec: Math.floor(new Date(startMonth).getTime() / 1000),
      endUnixSec: Math.floor(new Date(endToday).getTime() / 1000),
    });
    if (openaiMtd.ok) lines.push(`OpenAI (MTD): ${formatUSD(openaiMtd.usd)}`);

    // Composio v1 stub
    if (process.env.COMPOSIO_API_KEY) {
      lines.push('Composio: usage/billing check not implemented yet (key detected)');
    } else {
      lines.push('Composio: not configured');
    }

    lines.push('Reply “details” if you want a provider breakdown + anomaly check.');
    return lines.join('\n');
  }

  // daily
  const openaiY = await openaiCostsSummary({
    startUnixSec: Math.floor(new Date(startYesterday).getTime() / 1000),
    endUnixSec: Math.floor(new Date(endYesterday).getTime() / 1000),
  });
  if (openaiY.ok) lines.push(`OpenAI (yesterday): ${formatUSD(openaiY.usd)}`);
  else lines.push(openaiY.summary);

  const openaiMtd = await openaiCostsSummary({
    startUnixSec: Math.floor(new Date(startMonth).getTime() / 1000),
    endUnixSec: Math.floor(new Date(endToday).getTime() / 1000),
  });
  if (openaiMtd.ok) lines.push(`OpenAI (MTD): ${formatUSD(openaiMtd.usd)}`);

  if (process.env.COMPOSIO_API_KEY) {
    lines.push('Composio: usage/billing check not implemented yet (key detected)');
  } else {
    lines.push('Composio: not configured');
  }

  return lines.join('\n');
}

if (checkPause) {
  // Kill-switch: write .cost-pause when spend exceeds threshold; jobs-worker refuses non-chat_ui jobs
  if (COST_PAUSE_DAILY_USD <= 0 && COST_PAUSE_HOURLY_USD <= 0) {
    console.error('check-pause: set COST_PAUSE_DAILY_USD and/or COST_PAUSE_HOURLY_USD (e.g. 50 for $50)');
    process.exit(1);
  }
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  let dailyUsd = 0;
  let hourlyUsd = 0;
  let fail = false;

  if (COST_PAUSE_DAILY_USD > 0) {
    const r = await openaiCostsSummary({
      startUnixSec: Math.floor(oneDayAgo.getTime() / 1000),
      endUnixSec: Math.floor(now.getTime() / 1000),
    });
    if (r.ok) dailyUsd = r.usd;
    else {
      console.error('check-pause: daily fetch failed:', r.summary);
      fail = true;
    }
  }
  if (COST_PAUSE_HOURLY_USD > 0 && !fail) {
    const r = await openaiCostsSummary({
      startUnixSec: Math.floor(oneHourAgo.getTime() / 1000),
      endUnixSec: Math.floor(now.getTime() / 1000),
      bucketWidth: '1h',
    });
    if (r.ok) hourlyUsd = r.usd;
    else {
      // API may not support 1h; fall back to daily check only for this run
      hourlyUsd = 0;
      if (!COST_PAUSE_DAILY_USD) console.warn('check-pause: hourly fetch failed (try COST_PAUSE_DAILY_USD):', r.summary);
    }
  }

  const dailyExceeded = COST_PAUSE_DAILY_USD > 0 && dailyUsd >= COST_PAUSE_DAILY_USD;
  const hourlyExceeded = COST_PAUSE_HOURLY_USD > 0 && hourlyUsd >= COST_PAUSE_HOURLY_USD;

  if (dailyExceeded || hourlyExceeded) {
    const msg = `Cost-pause: daily=${dailyUsd.toFixed(2)} (limit ${COST_PAUSE_DAILY_USD}), hourly=${hourlyUsd.toFixed(2)} (limit ${COST_PAUSE_HOURLY_USD})`;
    const dir = join(homedir(), '.openclaw');
    try {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(COST_PAUSE_FILE, JSON.stringify({ at: now.toISOString(), dailyUsd, hourlyUsd, reason: msg }), 'utf8');
      console.log('PAUSE ACTIVE:', msg);
      process.exit(1);
    } catch (e) {
      console.error('check-pause: could not write .cost-pause:', e.message);
      process.exit(1);
    }
  } else {
    if (existsSync(COST_PAUSE_FILE)) {
      try {
        unlinkSync(COST_PAUSE_FILE);
        console.log('Cost-pause cleared (spend within limits)');
      } catch (e) {
        console.error('check-pause: could not remove .cost-pause:', e.message);
      }
    }
    console.log('Cost-pause check: OK (daily=$' + dailyUsd.toFixed(2) + ', hourly=$' + hourlyUsd.toFixed(2) + ')');
    process.exit(0);
  }
}

const report = await buildReport();

if (dryRun) {
  console.log(report);
  process.exit(0);
}

console.log(report);
