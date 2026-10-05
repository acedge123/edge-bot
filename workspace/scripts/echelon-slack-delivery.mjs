function normalizedTarget(slackChannel, slackThreadTs) {
  return {
    channel: String(slackChannel || '').trim(),
    threadTs: String(slackThreadTs || '').trim(),
  };
}

function markerMatchesTarget(marker, target) {
  return marker?.v === 1 &&
    marker.kind === 'slack' &&
    String(marker.slack_channel || '') === target.channel &&
    String(marker.slack_thread_ts || '') === target.threadTs;
}

export async function deliverSlackReply({
  jobId,
  responseText,
  slackChannel,
  slackThreadTs = '',
  readMarker,
  writeMarker,
  postReply,
}) {
  const target = normalizedTarget(slackChannel, slackThreadTs);
  if (!target.channel) throw new Error('Slack delivery requires a non-empty channel');

  const marker = await readMarker();
  if (markerMatchesTarget(marker, target)) {
    return { status: 'duplicate', target };
  }

  const payload = {
    job_id: jobId,
    text: responseText,
    slack_channel: target.channel,
    ...(target.threadTs ? { slack_thread_ts: target.threadTs } : {}),
  };
  const result = await postReply(payload);
  if (!result?.ok) {
    const status = result?.status ?? 'unknown';
    const body = String(result?.body || '').slice(0, 100);
    throw new Error(`Slack reply failed: ${status}${body ? ` ${body}` : ''}`);
  }

  await writeMarker({
    slack_channel: target.channel,
    slack_thread_ts: target.threadTs,
  });
  return { status: 'sent', target, responseStatus: result.status };
}
