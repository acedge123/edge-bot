function comparableMessageTime(message) {
  const raw = message?.timestamp ?? message?.created_at ?? message?.createdAt ?? message?.ts ?? 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const text = String(raw || '').trim();
  if (!text) return 0;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textSignaturePhase(value) {
  if (typeof value !== 'string' || !value.startsWith('{')) return '';
  try {
    const parsed = JSON.parse(value);
    return parsed?.v === 1 && ['commentary', 'final_answer'].includes(parsed.phase)
      ? parsed.phase
      : '';
  } catch (_) {
    return '';
  }
}

function textFromContentPart(part) {
  if (typeof part === 'string') return part;
  if (!part || typeof part !== 'object') return '';
  if (typeof part.text === 'string') return part.text;
  if (typeof part.text?.value === 'string') return part.text.value;
  if (typeof part.content === 'string') return part.content;
  if (typeof part.output_text === 'string') return part.output_text;
  if (typeof part.value === 'string') return part.value;
  return '';
}

export function assistantMessagePhase(message) {
  if (!message || message.role !== 'assistant') return '';
  if (['commentary', 'final_answer'].includes(message.phase)) return message.phase;
  if (!Array.isArray(message.content)) return '';

  const phases = new Set(
    message.content
      .map((part) => textSignaturePhase(part?.textSignature))
      .filter(Boolean),
  );
  return phases.size === 1 ? [...phases][0] : '';
}

export function assistantMessageText(message) {
  if (!message || message.role !== 'assistant') return '';
  if (typeof message.text === 'string') return message.text.trim();
  if (typeof message.content === 'string') return message.content.trim();
  if (Array.isArray(message.content)) {
    return message.content.map(textFromContentPart).filter(Boolean).join('').trim();
  }
  if (Array.isArray(message.parts)) {
    return message.parts.map(textFromContentPart).filter(Boolean).join('').trim();
  }
  return '';
}

export function latestAssistantTimestamp(messages) {
  return (Array.isArray(messages) ? messages : []).reduce((latest, message) => {
    if (message?.role !== 'assistant') return latest;
    return Math.max(latest, comparableMessageTime(message));
  }, 0);
}

export function isLikelyProgressReply(text) {
  const normalized = String(text || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return false;

  return [
    /^got it\b.*\b(working|work on|checking|check|looking|look|pulling|reviewing|review|analyzing|analyse|analyze)\b/i,
    /^i(?:'|’)?ll\b.*\b(first|check|look|review|analy[sz]e|compare|load|pull|research|investigate|report back|call that out|follow up)\b/i,
    /^i am\b.*\b(working|checking|looking|reviewing|analyzing|investigating)\b/i,
    /^i(?:'|’)?m\b.*\b(working|checking|looking|reviewing|analyzing|investigating)\b/i,
    /\bstill (?:on it|working|checking|looking|reviewing|analyzing)\b/i,
    /\bthis may take (?:a few|some) minutes\b/i,
    /\bi(?:'|’)?ll (?:update|post|reply|report back) (?:you )?when\b/i,
  ].some((pattern) => pattern.test(normalized));
}

export function collectNewAssistantReplies(messages, baselineTimestamp) {
  return (Array.isArray(messages) ? messages : [])
    .map((message, index) => ({
      index,
      timestamp: comparableMessageTime(message),
      phase: assistantMessagePhase(message),
      text: assistantMessageText(message),
    }))
    .filter((reply) => reply.text && reply.timestamp > baselineTimestamp)
    .sort((a, b) => a.timestamp - b.timestamp || a.index - b.index);
}

export function pickFinalAssistantReply(messages, baselineTimestamp) {
  const replies = collectNewAssistantReplies(messages, baselineTimestamp);
  const explicitFinal = [...replies].reverse().find((reply) => reply.phase === 'final_answer');
  if (explicitFinal) return explicitFinal.text;

  const unphasedFinal = [...replies]
    .reverse()
    .find((reply) => !reply.phase && !isLikelyProgressReply(reply.text));
  return unphasedFinal?.text || '';
}

export async function waitForFinalAssistantReply({
  readHistory,
  baselineTimestamp,
  timeoutMs,
  pollIntervalMs = 750,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onProgress = () => {},
}) {
  const deadline = now() + timeoutMs;
  let lastProgressText = '';

  while (now() < deadline) {
    const history = await readHistory();
    const messages = history?.messages || [];
    const finalText = pickFinalAssistantReply(messages, baselineTimestamp);
    if (finalText) return finalText;

    const latestReply = collectNewAssistantReplies(messages, baselineTimestamp).at(-1);
    if (latestReply?.text && latestReply.text !== lastProgressText) {
      lastProgressText = latestReply.text;
      onProgress(latestReply);
    }

    const remainingMs = deadline - now();
    if (remainingMs > 0) await sleep(Math.min(pollIntervalMs, remainingMs));
  }

  throw new Error('Timeout waiting for agent response');
}
