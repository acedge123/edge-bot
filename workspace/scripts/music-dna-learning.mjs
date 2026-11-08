#!/usr/bin/env node
// Human-invoked read-only synthetic pilot. Never imported by the signal worker.
import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { open, readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { callAgentBrain } from './agent-brain-router.mjs';
import { LearningClientError, requireThat, exact, uuid, requestJson } from './learning-http.mjs';

export const ECHELON_ORIGIN = 'https://yczomejrvihbmydyraqg.supabase.co';
const HASH = /^[0-9a-f]{64}$/;
const code = (v) =>
  v === null || (typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(v));
const time = (v) =>
  typeof v === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}(\d{3})?Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v.replace(/(\.\d{3})\d{3}Z$/, '$1Z');
const integer = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function validateApproval(a, { live = true, now = Date.now() } = {}) {
  exact(a, [
    'schema_version',
    'approval_ref',
    'approved',
    'first_hop_accepted',
    'source',
    'environment',
    'tenant_id',
    'reviewer_user_id',
    'observed_from',
    'observed_until',
    'expires_at',
    'budget',
  ]);
  requireThat(
    a.schema_version === 'musicdna-learning-approval.v1' &&
      uuid(a.approval_ref) &&
      a.approved === true,
    'approval_required',
  );
  requireThat(
    typeof a.first_hop_accepted === 'boolean' && (!live || a.first_hop_accepted),
    'first_hop_acceptance_required',
  );
  requireThat(
    a.source === 'music-dna-staging' && a.environment === 'staging',
    'synthetic_staging_only',
  );
  requireThat(
    typeof a.tenant_id === 'string' &&
      /^[a-z0-9][a-z0-9-]{0,63}$/.test(a.tenant_id) &&
      uuid(a.reviewer_user_id),
    'invalid_approval_binding',
  );
  requireThat(
    [a.observed_from, a.observed_until, a.expires_at].every(time) &&
      new Date(a.observed_from).toISOString() === a.observed_from &&
      new Date(a.observed_until).toISOString() === a.observed_until &&
      Date.parse(a.observed_from) < Date.parse(a.observed_until) &&
      Date.parse(a.observed_until) <= now &&
      Date.parse(a.observed_until) - Date.parse(a.observed_from) <= 31 * 86400000 &&
      Date.parse(a.expires_at) > now &&
      Date.parse(a.expires_at) - now <= 31 * 86400000,
    'invalid_approval_window',
  );
  const b = a.budget;
  exact(b, [
    'page_size',
    'max_pages',
    'max_receipts',
    'max_elapsed_ms',
    'max_brain_calls',
    'max_brain_input_bytes',
    'max_model_tokens',
  ]);
  requireThat(
    integer(b.page_size, 1, 50) &&
      integer(b.max_pages, 1, 10) &&
      integer(b.max_receipts, b.page_size, 100) &&
      integer(b.max_elapsed_ms, 100, 60000) &&
      integer(b.max_brain_calls, 0, 1) &&
      integer(b.max_brain_input_bytes, 512, 4096) &&
      b.max_model_tokens === 0,
    'invalid_budget',
  );
  return structuredClone(a);
}
function reviewerToken(token, a, now) {
  requireThat(typeof token === 'string' && !/[\r\n]/.test(token), 'reviewer_session_required');
  let claims;
  try {
    claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    throw new LearningClientError('reviewer_session_required');
  }
  // A local scope check, NOT signature verification. Echelon validates the JWT
  // and reviewer grant; the tenant comes from its source registry, never our DTO.
  requireThat(
    token.split('.').length === 3 &&
      claims.iss === ECHELON_ORIGIN + '/auth/v1' &&
      claims.role === 'authenticated' &&
      claims.sub === a.reviewer_user_id &&
      Number.isFinite(claims.exp) &&
      claims.exp * 1000 > now,
    'reviewer_binding_mismatch',
  );
}
function validateItem(i, a) {
  exact(i, [
    'receipt_id',
    'observation_id',
    'source',
    'environment',
    'schema_version',
    'privacy_policy_version',
    'evidence_refs',
    'observed_at',
    'received_at',
    'versions',
    'policy',
    'feedback',
    'status',
    'provenance',
    'outcome_state',
    'late_for_window',
  ]);
  requireThat(
    uuid(i.receipt_id) &&
      uuid(i.observation_id) &&
      i.source === a.source &&
      i.environment === a.environment &&
      i.schema_version === 'learning-observation.v1' &&
      i.privacy_policy_version === 'synthetic-pilot.v1' &&
      i.status === 'received' &&
      i.outcome_state === 'unknown' &&
      typeof i.late_for_window === 'boolean',
    'receipt_scope_mismatch',
  );
  requireThat(
    time(i.observed_at) &&
      time(i.received_at) &&
      Date.parse(i.observed_at) >= Date.parse(a.observed_from) &&
      Date.parse(i.observed_at) < Date.parse(a.observed_until) &&
      i.late_for_window === Date.parse(i.received_at) >= Date.parse(a.observed_until),
    'receipt_window_mismatch',
  );
  const r = i.evidence_refs;
  exact(r, ['subject_ref', 'decision_ref', 'result_ref', 'result_version', 'feedback_ref']);
  for (const [k, prefix] of [
    ['subject_ref', 's'],
    ['decision_ref', 'd'],
    ['result_ref', 'r'],
    ['feedback_ref', 'f'],
  ]) {
    requireThat(
      typeof r[k] === 'string' && r[k].startsWith(prefix + '_') && HASH.test(r[k].slice(2)),
      'invalid_reference',
    );
  }
  requireThat(Number.isSafeInteger(r.result_version) && r.result_version >= 1);
  exact(i.versions, ['evidence', 'catalog']);
  requireThat(Object.values(i.versions).every(code));
  exact(i.policy, ['id', 'version', 'recommendation_event_id', 'experiment_id', 'variant']);
  requireThat(
    [i.policy.id, i.policy.version, i.policy.recommendation_event_id, i.policy.experiment_id].every(
      code,
    ) &&
      [null, 'control', 'treatment'].includes(i.policy.variant) &&
      (i.policy.id === null) === (i.policy.version === null) &&
      (i.policy.experiment_id === null) === (i.policy.variant === null) &&
      (i.policy.recommendation_event_id === null || i.policy.id !== null),
  );
  exact(i.feedback, ['accuracy', 'rating']);
  requireThat(
    [null, 'accurate', 'mixed', 'not_accurate'].includes(i.feedback.accuracy) &&
      [null, -1, 0, 1].includes(i.feedback.rating),
  );
  requireThat(i.feedback.accuracy !== null || i.feedback.rating !== null);
  exact(i.provenance, ['result_source', 'answered_count', 'data_class', 'purpose']);
  requireThat(
    ['pairings', 'chat_self_report'].includes(i.provenance.result_source) &&
      i.provenance.answered_count === 6 &&
      i.provenance.data_class === 'synthetic' &&
      i.provenance.purpose === 'musicdna_diagnostic_quality',
    'unapproved_data_class',
  );
}
function validatePage(p, a) {
  exact(p, [
    'ok',
    'batch_ref',
    'source',
    'environment',
    'window',
    'items',
    'next_cursor',
    'has_more',
    'readout',
  ]);
  requireThat(
    p.ok === true && uuid(p.batch_ref) && p.source === a.source && p.environment === a.environment,
    'page_scope_mismatch',
  );
  exact(p.window, ['observed_from', 'observed_until', 'captured_at']);
  requireThat(
    p.window.observed_from === a.observed_from &&
      p.window.observed_until === a.observed_until &&
      time(p.window.captured_at),
    'page_window_mismatch',
  );
  requireThat(
    Array.isArray(p.items) &&
      p.items.length <= a.budget.page_size &&
      typeof p.has_more === 'boolean' &&
      (p.has_more
        ? p.items.length > 0 &&
          typeof p.next_cursor === 'string' &&
          p.next_cursor.length > 0 &&
          p.next_cursor.length <= 6000
        : p.next_cursor === null),
    'invalid_pagination',
  );
  p.items.forEach((i) => validateItem(i, a));
  exact(p.readout, [
    'page_receipts',
    'late_receipts',
    'outcome_state',
    'session_completeness',
    'quality_assessment',
  ]);
  requireThat(
    p.readout.page_receipts === p.items.length &&
      p.readout.late_receipts === p.items.filter((i) => i.late_for_window).length &&
      p.readout.outcome_state === 'unknown' &&
      p.readout.session_completeness === 'not_asserted' &&
      p.readout.quality_assessment === 'not_evaluated',
  );
}
function summarize(items) {
  const out = {
    receipts: items.length,
    accurate: 0,
    mixed: 0,
    not_accurate: 0,
    accuracy_missing: 0,
    rating_missing: 0,
    late_receipts: 0,
    unknown_outcomes: items.length,
    pairing_results: 0,
    chat_results: 0,
    versioned_experiment_tags: 0,
  };
  for (const i of items) {
    out[i.feedback.accuracy ?? 'accuracy_missing']++;
    if (i.feedback.rating === null) out.rating_missing++;
    if (i.late_for_window) out.late_receipts++;
    out[i.provenance.result_source === 'pairings' ? 'pairing_results' : 'chat_results']++;
    if (i.policy.experiment_id && i.policy.variant && i.policy.id && i.policy.version)
      out.versioned_experiment_tags++;
  }
  return out;
}
export async function runLearningBatch(
  input,
  {
    reviewerSession,
    publishableKey,
    brainToken,
    brainBaseUrl,
    consultBrain = false,
    live = true,
    fetchImpl = fetch,
  } = {},
) {
  const a = validateApproval(input, { live });
  const started = Date.now(),
    deadline = Math.min(started + a.budget.max_elapsed_ms, Date.parse(a.expires_at));
  reviewerToken(reviewerSession, a, started);
  requireThat(
    typeof publishableKey === 'string' &&
      publishableKey.length > 0 &&
      !/[\r\n]/.test(publishableKey),
    'publishable_key_required',
  );
  requireThat(!consultBrain || a.budget.max_brain_calls === 1, 'brain_budget_not_approved');
  const items = [],
    receipts = new Set(),
    observations = new Set(),
    cursors = new Set();
  let cursor,
    batchRef,
    capturedAt,
    hasMore = false,
    pages = 0,
    previousOrder;
  for (; pages < a.budget.max_pages;) {
    requireThat(Date.now() < deadline, 'deadline_exceeded');
    // Cursor binds limit too. Never change page size in mid-batch to fill a cap.
    if (a.budget.max_receipts - items.length < a.budget.page_size) break;
    const body = {
      source: a.source,
      environment: a.environment,
      observed_from: a.observed_from,
      observed_until: a.observed_until,
      limit: a.budget.page_size,
      ...(cursor ? { cursor } : {}),
    };
    const { data: p } = await requestJson(ECHELON_ORIGIN + '/functions/v1/musicdna-learning-read', {
      body,
      headers: { Authorization: 'Bearer ' + reviewerSession, apikey: publishableKey },
      deadline,
      fetchImpl,
    });
    validatePage(p, a);
    if (batchRef)
      requireThat(
        p.batch_ref === batchRef && p.window.captured_at === capturedAt,
        'snapshot_changed',
      );
    batchRef = p.batch_ref;
    capturedAt = p.window.captured_at;
    for (const i of p.items) {
      requireThat(
        !receipts.has(i.receipt_id) && !observations.has(i.observation_id),
        'duplicate_receipt',
      );
      const order = i.observed_at.replace(/\.(\d{3})Z$/, '.$1000Z') + ':' + i.receipt_id;
      requireThat(!previousOrder || order > previousOrder, 'receipt_order_changed');
      previousOrder = order;
      receipts.add(i.receipt_id);
      observations.add(i.observation_id);
      items.push(i);
    }
    pages++;
    hasMore = p.has_more;
    if (!hasMore) break;
    requireThat(!cursors.has(p.next_cursor), 'cursor_cycle');
    cursors.add(p.next_cursor);
    cursor = p.next_cursor;
  }
  const numeric = summarize(items),
    traceId = randomUUID();
  const batchId =
    'musicdna-review-' +
    hash([
      a.approval_ref,
      a.source,
      a.environment,
      a.observed_from,
      a.observed_until,
      batchRef,
      [...receipts],
    ]).slice(0, 32);
  let guidance = {
    state: consultBrain ? 'skipped_no_complete_evidence' : 'not_requested',
    calls: 0,
    api_version: null,
    trace_id: null,
    policy_version: null,
    strategy_version: null,
  };
  if (consultBrain && items.length && !hasMore) {
    // Only fixed text and numeric aggregates cross this boundary: no refs,
    // source free text, reading content, comments, tenant or participant IDs.
    const body = {
      problem_summary:
        'Design a controlled experiment to assess Music DNA reading feedback. Synthetic diagnostic evidence cannot establish listener benefit.',
      context: JSON.stringify(numeric),
      signals: [
        'Synthetic QA only',
        'Outcomes unknown',
        'Human review required; do not apply pairing policy',
      ],
    };
    requireThat(
      Buffer.byteLength(JSON.stringify(body)) <= a.budget.max_brain_input_bytes,
      'brain_input_budget_exceeded',
    );
    try {
      const r = await callAgentBrain({
        body,
        token: brainToken,
        baseUrl: brainBaseUrl,
        traceId,
        deadline,
        fetchImpl: (...args) => {
          guidance.calls++;
          return fetchImpl(...args);
        },
      });
      guidance = {
        ...guidance,
        state: 'received_generic_advice',
        api_version: r.body.api_version,
        trace_id: r.trace_id,
        primary_regime: r.body.recommendation.primary_regime,
        confidence: r.body.recommendation.confidence,
      };
    } catch (error) {
      guidance = {
        ...guidance,
        state: 'unavailable',
        error: error instanceof LearningClientError ? error.code : 'client_failed',
        status: error instanceof LearningClientError ? error.status : null,
      };
    }
  }
  return {
    schema_version: 'musicdna-learning-review.v1',
    batch_id: batchId,
    mode: live ? 'authorized_staging' : 'offline_fixture',
    decision: 'hold',
    approval_ref: a.approval_ref,
    source: a.source,
    environment: a.environment,
    tenant_binding:
      'Live reads rely on Echelon-verified session/source registry/reviewer grant. Operator must verify the approved tenant/source mapping; redacted readback does not expose tenant identity.',
    provenance: {
      contract: 'learning-observation.v1',
      data_class: 'synthetic',
      privacy_policy: 'synthetic-pilot.v1',
      echelon_batch_ref: batchRef,
      window: {
        observed_from: a.observed_from,
        observed_until: a.observed_until,
        captured_at: capturedAt,
      },
      pages,
      complete: !hasMore,
      receipts: items.map((i) => ({
        receipt_id: i.receipt_id,
        observation_id: i.observation_id,
        result_version: i.evidence_refs.result_version,
        versions: i.versions,
        policy: i.policy,
      })),
    },
    counts: numeric,
    budget: { ...a.budget, automatic_retries: 0, direct_model_calls: 0, direct_model_tokens: 0 },
    guidance,
    supporting_cases: items
      .filter((i) => i.feedback.accuracy === 'accurate')
      .map((i) => i.receipt_id),
    contrary_cases: items
      .filter((i) => ['mixed', 'not_accurate'].includes(i.feedback.accuracy))
      .map((i) => i.receipt_id),
    hypothesis:
      'A preregistered policy comparison may change exact-version feedback; this batch does not establish that effect.',
    next_verification:
      'Human review and AB-52 experiment design; no policy, memory or skill change authorized.',
    limitations: [
      'Synthetic QA is separate from real observations; real data is rejected by this version.',
      'Missing/late feedback and unknown outcomes are not successes; no causal quality or pairing-policy inference.',
      'Agent Brain v1.0.0 provides generic deterministic regime advice; policy/strategy versions are not exposed and remain null.',
      'No serving source revision is asserted by an API schema version; hosted deployment/sync and authenticated integration require separate receipts.',
      'Direct model calls are zero; downstream provider counters are not observed by this client.',
      ...(hasMore
        ? [
            'Budget reached before the snapshot ended; this is an incomplete batch and advice was skipped.',
          ]
        : []),
      ...(!items.length ? ['No authorized observations returned; insufficient evidence.'] : []),
    ],
  };
}
async function readBoundedFile(path, max = 32768) {
  const f = await open(path, 'r');
  try {
    const size = (await f.stat()).size;
    requireThat(size <= max, 'file_too_large');
    const b = Buffer.alloc(max + 1);
    const { bytesRead } = await f.read(b, 0, max + 1, 0);
    requireThat(bytesRead <= max, 'file_too_large');
    return JSON.parse(b.subarray(0, bytesRead).toString('utf8'));
  } finally {
    await f.close();
  }
}
async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--help') {
    console.log(
      'music-dna-learning.mjs fixture|review --approval path.json --output new-report.json [--consult-brain]\nfixture uses shipped synthetic pages only and no network; review needs approved AB-50 closure, reviewer session and grant. No automatic retries, LLMs, jobs, messages or policy writes.',
    );
    return;
  }
  const mode = args.shift();
  requireThat(['fixture', 'review'].includes(mode), 'invalid_arguments');
  const opts = {};
  while (args.length) {
    const k = args.shift();
    requireThat(
      ['--approval', '--output', '--consult-brain'].includes(k) && !Object.hasOwn(opts, k),
      'invalid_arguments',
    );
    if (k === '--consult-brain') opts[k] = true;
    else {
      const v = args.shift();
      requireThat(v && !v.startsWith('--'), 'invalid_arguments');
      opts[k] = v;
    }
  }
  requireThat(opts['--output'] && (mode === 'fixture' || opts['--approval']), 'invalid_arguments');
  // Exclusive creation before HTTP: reruns cannot overwrite a reviewed artifact.
  // Failure leaves a sanitized failure record; it never stores a partial page/cursor.
  const output = await open(opts['--output'], 'wx', 0o600);
  try {
    let a, deps;
    if (mode === 'fixture') {
      const f = JSON.parse(
        await readFile(
          new URL('../skills/music-dna-learning/fixtures/batch.json', import.meta.url),
          'utf8',
        ),
      );
      a = { ...f.approval, expires_at: new Date(Date.now() + 3600000).toISOString() };
      let page = 0;
      deps = {
        live: false,
        reviewerSession:
          'fixture.' +
          Buffer.from(
            JSON.stringify({
              iss: ECHELON_ORIGIN + '/auth/v1',
              role: 'authenticated',
              sub: a.reviewer_user_id,
              exp: Math.floor(Date.now() / 1000) + 3600,
            }),
          ).toString('base64url') +
          '.fixture',
        publishableKey: 'fixture-public',
        brainToken: 'fixture-brain',
        fetchImpl: async (url, options) => {
          if (url === ECHELON_ORIGIN + '/functions/v1/musicdna-learning-read')
            return new Response(JSON.stringify(f.pages[page++]));
          requireThat(
            url === 'https://agent-brain-production-6956.up.railway.app/v1/intake-recommend',
          );
          return new Response(
            JSON.stringify({ ...f.brain_response, trace_id: options.headers['X-Trace-Id'] }),
          );
        },
      };
    } else {
      const info = await stat(opts['--approval']);
      requireThat(info.isFile() && (info.mode & 0o077) === 0, 'approval_file_must_be_private');
      a = await readBoundedFile(opts['--approval']);
      deps = {
        reviewerSession: process.env.ECHELON_LEARNING_REVIEWER_SESSION,
        publishableKey: process.env.ECHELON_LEARNING_PUBLISHABLE_KEY,
        brainToken: process.env.AGENT_BRAIN_BEARER_TOKEN,
        brainBaseUrl: process.env.AGENT_BRAIN_URL,
      };
    }
    const report = await runLearningBatch(a, {
      ...deps,
      consultBrain: opts['--consult-brain'] === true,
    });
    await output.writeFile(JSON.stringify(report, null, 2) + '\n');
    console.log(
      JSON.stringify({
        ok: true,
        mode: report.mode,
        batch_id: report.batch_id,
        decision: report.decision,
        receipts: report.counts.receipts,
        guidance: report.guidance.state,
      }),
    );
  } catch (error) {
    await output.writeFile(
      JSON.stringify({
        ok: false,
        error: error instanceof LearningClientError ? error.code : 'client_failed',
      }) + '\n',
    );
    throw error;
  } finally {
    await output.close();
  }
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
