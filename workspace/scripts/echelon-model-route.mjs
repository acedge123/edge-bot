const LIGHTWEIGHT_TIERS = new Set(['cheap', 'light', 'lightweight', 'mini']);

function normalizedMetadataValue(metadata, ...keys) {
  for (const key of keys) {
    const value = String(metadata?.[key] || '').trim().toLowerCase();
    if (value) return value;
  }
  return '';
}

/** Default ordinary work to Mini and escalate explicitly complex work to Sol. */
export function pickRoutedAgent(requestText, metadata = {}) {
  const raw = String(requestText || '');
  const tag = raw.match(/@model:([a-zA-Z0-9._-]+)/)?.[1]?.toLowerCase();

  if (tag === 'gpt-5-mini' || tag === 'mini') {
    return { agentId: 'main-light', reason: 'forced:@model:gpt-5-mini' };
  }
  if (tag === 'gpt-5.6-sol' || tag === 'gpt-5.6' || tag === 'sol') {
    return { agentId: 'main-critical', reason: 'forced:@model:gpt-5.6-sol' };
  }

  const declaredTier = normalizedMetadataValue(metadata, 'model_tier', 'modelTier', 'complexity');
  if (LIGHTWEIGHT_TIERS.has(declaredTier)) {
    return { agentId: 'main-light', reason: `metadata:${declaredTier}` };
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

  const isMediumReasoning = /\b(design|architecture|trade-?offs|analy[sz]e|root cause|debug|plan)\b/.test(text);
  if (isMediumReasoning) return { agentId: 'main-med', reason: 'heuristic:medium-reasoning' };

  const isNarrowTransformation = /^\s*(?:please\s+)?(?:format|proofread|rewrite|shorten|classify|categorize|extract)\b/.test(
    text,
  );
  if (isNarrowTransformation) {
    return { agentId: 'main-light', reason: 'heuristic:lightweight-transformation' };
  }

  return { agentId: 'main', reason: 'default:lightweight' };
}
