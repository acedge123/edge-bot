function sessionPart(value, fallback) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._+-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return normalized || fallback;
}

/** Build the narrowest stable conversation boundary supplied by a transport. */
export function buildEchelonSessionKey({
  agentId,
  tenantId,
  actorId,
  source,
  metadata = {},
  jobId,
}) {
  const agent = sessionPart(agentId, 'main');
  const tenant = sessionPart(tenantId, 'default');

  if (source === 'sms') {
    return `agent:${agent}:sms:${tenant}:${sessionPart(metadata.from_number, 'unknown')}`;
  }

  if (source === 'slack') {
    const channel = sessionPart(metadata.slack_channel, 'channel');
    const thread = sessionPart(metadata.slack_thread_ts, sessionPart(metadata.slack_user, 'unknown'));
    return `agent:${agent}:slack:${tenant}:${channel}:${thread}`;
  }

  if (source === 'app_signal') {
    const signal = sessionPart(metadata.signal_event_id, sessionPart(jobId, 'unknown'));
    return `agent:${agent}:signal:${tenant}:${signal}`;
  }

  const actor = sessionPart(
    actorId || metadata.actor_id || metadata.user_id,
    'anonymous',
  );
  const explicitConversation =
    metadata.session_id || metadata.conversation_id || metadata.chat_id;
  const conversation = sessionPart(
    explicitConversation,
    actor === 'anonymous' ? sessionPart(jobId, 'isolated') : actor,
  );
  return `agent:${agent}:echelon:${tenant}:${actor}:${conversation}`;
}
