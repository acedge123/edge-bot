// Small shared transport for the two read-only AB-51 clients. No error bodies escape.
export class LearningClientError extends Error {
  constructor(code, status = null) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
export function requireThat(value, code = 'invalid_contract') {
  if (!value) throw new LearningClientError(code);
}
export function exact(value, fields) {
  requireThat(value && typeof value === 'object' && !Array.isArray(value));
  requireThat(
    Object.keys(value).length === fields.length && fields.every((k) => Object.hasOwn(value, k)),
  );
}
export const uuid = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export function origin(value, expected, allowLocal = false) {
  let u;
  try {
    u = new URL(value);
  } catch {
    throw new LearningClientError('invalid_origin');
  }
  requireThat(
    !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash,
    'invalid_origin',
  );
  const local =
    allowLocal &&
    u.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  requireThat(local || (u.protocol === 'https:' && u.origin === expected), 'unapproved_origin');
  return u.origin;
}
export async function requestJson(
  url,
  { body, headers = {}, deadline, maxBytes = 131072, timeoutMs = 5000, fetchImpl = fetch },
) {
  const remaining = deadline - Date.now();
  requireThat(remaining > 0, 'deadline_exceeded');
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(1, Math.min(30000, timeoutMs, remaining))),
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new LearningClientError('service_rejected', response.status);
    }
    const reader = response.body?.getReader();
    requireThat(reader, 'invalid_response');
    const chunks = [];
    let bytes = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new LearningClientError('response_too_large');
      }
      chunks.push(part.value);
    }
    requireThat(Date.now() <= deadline, 'deadline_exceeded');
    let data;
    try {
      data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    } catch {
      throw new LearningClientError('invalid_response');
    }
    return { data, headers: response.headers };
  } catch (error) {
    if (error instanceof LearningClientError) throw error;
    throw new LearningClientError('service_unavailable');
  }
}
