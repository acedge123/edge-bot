#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// Credentials stay in memory; only gate outcomes are printed.
const env = JSON.parse(execFileSync('railway', ['variables', '--json'], { encoding: 'utf8' }));
const mom = env.MOM_WALK_FUNCTIONS_URL || 'https://lkdtkhfpydznwaptyufl.supabase.co/functions/v1';
const hub = env.SURVEY_HUB_FUNCTIONS_URL || 'https://vombjszkchcffrnkrfto.supabase.co/functions/v1';
async function post(url, body, headers = {}) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  return { status: response.status, data: await response.json() };
}
const minted = await post(`${mom}/mint-agent-token`, {}, { 'x-agent-key': env.MOM_WALK_AGENT_MINT_SECRET });
assert.equal(minted.status, 200, 'Agent authentication failed');
const auth = { Authorization: `Bearer ${minted.data.access_token}` };
const list = await post(`${mom}/survey-approvals`, { action: 'list' }, auth);
assert.equal(list.status, 200, 'Agent cannot read pending requests');
for (const action of ['approve', 'reject']) {
  const result = await post(`${mom}/survey-approvals`, { action, requestId: '00000000-0000-4000-8000-000000000000' }, auth);
  assert.equal(result.status, 403, `Agent could ${action} its own request`);
}
const send = await post(`${mom}/send-survey-solicitation`, {}, auth);
assert.notEqual(send.status, 200, 'Agent could call direct email delivery');
const publish = await post(`${hub}/manage`, { action: 'survey.publish' },
  { Authorization: `Bearer ${env.SURVEY_HUB_MANAGE_SECRET || env.MANAGE_API_SECRET}` });
assert.equal(publish.status, 403, 'Manage credential alone could publish');
console.log(JSON.stringify({ pendingRequestsReadable: true, agentApproveDenied: true, agentRejectDenied: true,
  directSendDenied: true, directPublishDenied: true, emailsSent: 0 }));
