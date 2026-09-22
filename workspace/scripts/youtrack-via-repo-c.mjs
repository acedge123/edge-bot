#!/usr/bin/env node
/**
 * Hosted-friendly YouTrack access via Repo C internal-execute.
 *
 * This script is designed to run inside Railway containers (no local /Users/... paths).
 *
 * Env:
 *   CIA_URL            Repo C base URL (e.g. https://rrzewykkwjdkkccwrjyf.supabase.co)
 *   EXECUTOR_SECRET    Repo C executor secret (Bearer)
 *   DEFAULT_TENANT_ID  Optional fallback tenant (defaults to "leadscore")
 *
 * Examples:
 *   node workspace/scripts/youtrack-via-repo-c.mjs issues.get \
 *     --issueId TGA-293 \
 *     --tenant-id <tenant-id>
 *
 *   node workspace/scripts/youtrack-via-repo-c.mjs issues.create \
 *     --projectId 0-97 \
 *     --summary "Test ticket" \
 *     --description "Created through Repo C" \
 *     --tenant-id leadscore
 *
 *   node workspace/scripts/youtrack-via-repo-c.mjs commands.apply \
 *     --issueId AIGIFT-2 \
 *     --query "Assignee EdgeBot State Backlog" \
 *     --tenant-id leadscore
 */
import process from 'process';
import { buildRepoCLaneAHeaders } from './repo-c-lane-a.mjs';

function mustEnv(name) {
  const v = String(process.env[name] || '').trim();
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith('--')) return null;
  return v;
}

function usage() {
  console.error(`Usage:
  youtrack-via-repo-c.mjs issues.get --issueId <key> [--tenant-id <tenant>]
  youtrack-via-repo-c.mjs issues.create --projectId <id> --summary <text> [--description <text>] [--tenant-id <tenant>]
  youtrack-via-repo-c.mjs commands.apply --issueId <key> --query <command> [--tenant-id <tenant>]
`);
}

async function callInternalExecute({ tenantId, service, action, params }) {
  const CIA_URL = mustEnv('CIA_URL').replace(/\/+$/, '');
  const EXECUTOR_SECRET = mustEnv('EXECUTOR_SECRET');

  const res = await fetch(`${CIA_URL}/functions/v1/internal-execute`, {
    method: 'POST',
    headers: buildRepoCLaneAHeaders({ executorSecret: EXECUTOR_SECRET, tenantId }),
    body: JSON.stringify({ service, action, params }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`internal-execute ${res.status}: ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text);
  } catch (_) {
    return text;
  }
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === '-h' || cmd === '--help') {
    usage();
    process.exit(cmd ? 0 : 2);
  }

  const tenantId = (getArg('--tenant-id') || process.env.DEFAULT_TENANT_ID || 'leadscore').trim();

  if (cmd === 'issues.get') {
    const issueId = getArg('--issueId');
    if (!issueId) {
      usage();
      throw new Error('issues.get requires --issueId');
    }
    const out = await callInternalExecute({
      tenantId,
      service: 'youtrack',
      action: 'issues.get',
      params: { issueId },
    });
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return;
  }

  if (cmd === 'issues.create') {
    const projectId = getArg('--projectId');
    const summary = getArg('--summary');
    const description = getArg('--description') || '';
    if (!projectId || !summary) {
      usage();
      throw new Error('issues.create requires --projectId and --summary');
    }
    const out = await callInternalExecute({
      tenantId,
      service: 'youtrack',
      action: 'issues.create',
      params: { projectId, summary, description },
    });
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return;
  }

  if (cmd === 'commands.apply') {
    const issueId = getArg('--issueId');
    const query = getArg('--query');
    if (!issueId || !query) {
      usage();
      throw new Error('commands.apply requires --issueId and --query');
    }
    const out = await callInternalExecute({
      tenantId,
      service: 'youtrack',
      action: 'commands.apply',
      params: { issueId, query },
    });
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return;
  }

  usage();
  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
