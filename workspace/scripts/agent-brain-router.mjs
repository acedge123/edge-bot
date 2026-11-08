#!/usr/bin/env node
// AB-41 client recovered from the mounted workspace (see AB-51 runbook), hardened
// and made import-safe. The documented intake/recommend CLI remains available.
import { randomUUID } from 'node:crypto';
import { createReadStream, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { LearningClientError, requireThat, origin, requestJson, uuid } from './learning-http.mjs';

export const BRAIN_ORIGIN = 'https://agent-brain-production-6956.up.railway.app';
export const BRAIN_API_VERSION = '1.0.0';
const regimes = ['prune', 'explore', 'compound', 'coordinate'];
export async function callAgentBrain({
  mode = 'intake',
  body,
  token,
  baseUrl = BRAIN_ORIGIN,
  traceId = randomUUID(),
  deadline = Date.now() + 10000,
  fetchImpl = fetch,
  allowLocal = false,
}) {
  requireThat(['intake', 'recommend'].includes(mode), 'invalid_mode');
  const base = origin(baseUrl, BRAIN_ORIGIN, allowLocal);
  requireThat(
    typeof token === 'string' && token.trim().length > 0 && !/[\r\n]/.test(token),
    'brain_token_required',
  );
  requireThat(uuid(traceId), 'invalid_trace');
  requireThat(
    body &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      Buffer.byteLength(JSON.stringify(body)) <= 32768,
    'request_too_large',
  );
  const { data, headers } = await requestJson(
    base + (mode === 'intake' ? '/v1/intake-recommend' : '/v1/recommend'),
    {
      body,
      headers: { Authorization: 'Bearer ' + token, 'X-Trace-Id': traceId },
      deadline,
      fetchImpl,
    },
  );
  requireThat(data?.api_version === BRAIN_API_VERSION, 'brain_version_mismatch');
  const r = data.recommendation;
  requireThat(
    r &&
      regimes.includes(r.primary_regime) &&
      regimes.includes(r.opposing_regime) &&
      (r.secondary_regime === null || regimes.includes(r.secondary_regime)) &&
      (r.transition_candidate === null || regimes.includes(r.transition_candidate)) &&
      Number.isFinite(r.confidence) &&
      r.confidence >= 0 &&
      r.confidence <= 1,
    'invalid_brain_response',
  );
  // v1 intake echoes the trace in its body; the current server has no trace
  // response header. Structured recommend only has caller/log correlation.
  requireThat(
    (!headers.get('x-trace-id') || headers.get('x-trace-id') === traceId) &&
      (mode !== 'intake' || data.trace_id === traceId),
    'brain_trace_mismatch',
  );
  return { ok: true, status: 200, trace_id: traceId, body: data };
}
async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--help') {
    console.log(
      'agent-brain-router.mjs intake|recommend [--file request.json]\nRequires AGENT_BRAIN_BEARER_TOKEN. AGENT_BRAIN_URL defaults to the pinned Railway origin. No automatic retries.',
    );
    return;
  }
  requireThat(
    ['intake', 'recommend'].includes(args[0]) &&
      (args.length === 1 || (args.length === 3 && args[1] === '--file')),
    'invalid_arguments',
  );
  let raw = '';
  const input = args[1] ? createReadStream(args[2], { encoding: 'utf8' }) : process.stdin;
  input.setEncoding('utf8');
  // The input deadline includes a stalled stdin/file stream.
  const timer = setTimeout(() => input.destroy(new LearningClientError('input_timeout')), 5000);
  try {
    for await (const chunk of input) {
      raw += chunk;
      requireThat(Buffer.byteLength(raw) <= 32768, 'request_too_large');
    }
  } finally {
    clearTimeout(timer);
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new LearningClientError('invalid_request');
  }
  const result = await callAgentBrain({
    mode: args[0],
    body,
    token: process.env.AGENT_BRAIN_BEARER_TOKEN,
    baseUrl: process.env.AGENT_BRAIN_URL || BRAIN_ORIGIN,
    traceId: process.env.AGENT_BRAIN_TRACE_ID || randomUUID(),
  });
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        error: error instanceof LearningClientError ? error.code : 'client_failed',
        status: error instanceof LearningClientError ? error.status : null,
      }),
    );
    process.exitCode = 1;
  });
}
