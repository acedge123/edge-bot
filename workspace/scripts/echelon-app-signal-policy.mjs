const MAX_DETERMINISTIC_RESPONSE_CHARS = 4000;

function isTruthyMetadata(value) {
  if (value === true) return true;
  const text = String(value || '').trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'yes';
}

export function isAppSignalJob(metadata = {}) {
  const source = String(metadata?.source || '').trim();
  return source === 'app_signal' || Boolean(metadata?.signal_event_id) || Boolean(metadata?.signal_type);
}

export function isApprovalRequiredSignalJob(metadata = {}, messageText = '') {
  if (!isAppSignalJob(metadata)) return false;

  return (
    isTruthyMetadata(metadata?.requires_approval) ||
    isTruthyMetadata(metadata?.triage_only) ||
    String(metadata?.route || '').trim() === 'approval_required' ||
    /\bAPPROVAL REQUIRED\b/i.test(String(messageText || ''))
  );
}

export function shouldBypassAppSignalModel(metadata = {}, processWithLlm = false) {
  return isAppSignalJob(metadata) && !processWithLlm;
}

export function buildDeterministicAppSignalResponse({ message, metadata = {} }) {
  const requestText = String(message || '').trim();
  if (isApprovalRequiredSignalJob(metadata, requestText)) {
    return requestText.slice(0, MAX_DETERMINISTIC_RESPONSE_CHARS);
  }

  const signalType = String(metadata.signal_type || 'app_signal').trim() || 'app_signal';
  return `Recorded automated app signal "${signalType}" without model processing.`;
}
