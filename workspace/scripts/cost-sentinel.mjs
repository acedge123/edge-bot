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

import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const args = new Set(process.argv.slice(2));
const mode = (() => {
  const m = process.argv.find((a) => a.startsWith('--mode='))?.slice('--mode='.length);
  return m || 'daily';
})();
const dryRun = args.has('--dry-run');

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

async function openaiCostsSummary({ startUnixSec, endUnixSec }) {
  // New-style org usage/costs endpoints require a key with api.usage.read scope.
  const key = process.env.OPENAI_ADMIN_API_KEY || process.env.OPENAI_ADMIN_KEY || process.env.OPENAI_API_KEY;
  if (!key) {
    return { ok: false, summary: 'OpenAI: missing OPENAI_ADMIN_API_KEY (or OPENAI_ADMIN_KEY / OPENAI_API_KEY with api.usage.read)' };
  }

  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  // Prefer Costs endpoint (authoritative spend). If unavailable, we’ll return a clear error.
  const url = `https://api.openai.com/v1/organization/costs?start_time=${startUnixSec}&end_time=${endUnixSec}&bucket_width=1d`;
  try {
    const data = await fetchJson(url, headers);

    // Flexible parsing: sum any bucket.result.amount.value fields if present.
    let totalUsd = 0;
    let found = false;

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
          found = true;
        }
      }
    }

    if (!found && typeof data?.total_cost === 'number') {
      totalUsd = data.total_cost;
      found = true;
    }

    if (!found) {
      return { ok: false, summary: 'OpenAI costs: unexpected response shape (endpoint ok but could not parse total)' };
    }

    return { ok: true, usd: totalUsd, raw: data };
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

const report = await buildReport();

if (dryRun) {
  console.log(report);
  process.exit(0);
}

console.log(report);
