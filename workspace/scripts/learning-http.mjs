// Shared bounded transport. Provider diagnostics are opt-in and contain no error text.
export class LearningClientError extends Error {
  constructor(code, status = null) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
export function requireThat(value, code = "invalid_contract") {
  if (!value) throw new LearningClientError(code);
}
export function exact(value, fields) {
  requireThat(value && typeof value === "object" && !Array.isArray(value));
  requireThat(
    Object.keys(value).length === fields.length &&
      fields.every((k) => Object.hasOwn(value, k)),
  );
}
export const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );
export function origin(value, expected, allowLocal = false) {
  let u;
  try {
    u = new URL(value);
  } catch {
    throw new LearningClientError("invalid_origin");
  }
  requireThat(
    !u.username && !u.password && u.pathname === "/" && !u.search && !u.hash,
    "invalid_origin",
  );
  const local =
    allowLocal &&
    u.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
  requireThat(
    local || (u.protocol === "https:" && u.origin === expected),
    "unapproved_origin",
  );
  return u.origin;
}
const PROVIDER_CODES = new Set([
  "invalid_api_key",
  "insufficient_quota",
  "rate_limit_exceeded",
  "model_not_found",
  "permission_denied",
  "invalid_request_error",
  "unsupported_parameter",
  "unsupported_value",
  "context_length_exceeded",
  "server_error",
]);
const PROVIDER_PARAMETERS = new Set([
  "model",
  "messages",
  "tools",
  "tool_choice",
  "max_completion_tokens",
  "max_tokens",
  "response_format",
  "store",
  "n",
  "stream",
]);
async function readProviderFailure(response) {
  const requestId = response.headers.get("x-request-id");
  const diagnostics = {
    request_id: /^req_[A-Za-z0-9_-]{1,120}$/.test(requestId || "")
      ? requestId
      : null,
    code: null,
    type: null,
    parameter: null,
  };
  const reader = response.body?.getReader();
  if (!reader) return diagnostics;
  try {
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) return diagnostics;
      chunks.push(value);
    }
    const error = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    )?.error;
    if (PROVIDER_CODES.has(error?.code)) diagnostics.code = error.code;
    if (PROVIDER_CODES.has(error?.type)) diagnostics.type = error.type;
    if (PROVIDER_PARAMETERS.has(error?.param))
      diagnostics.parameter = error.param;
    // Never retain message, body, headers, user input or unknown code strings.
  } catch {
  } finally {
    try {
      await reader.cancel();
    } catch {}
  }
  return diagnostics;
}
export async function requestJson(
  url,
  {
    body,
    headers = {},
    deadline,
    maxBytes = 131072,
    timeoutMs = 5000,
    providerDiagnostics = false,
    fetchImpl = fetch,
  },
) {
  const remaining = deadline - Date.now();
  requireThat(remaining > 0, "deadline_exceeded");
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(
        Math.max(1, Math.min(30000, timeoutMs, remaining)),
      ),
    });
    if (response.status !== 200) {
      const error = new LearningClientError(
        "service_rejected",
        response.status,
      );
      if (providerDiagnostics)
        error.providerDiagnostics = await readProviderFailure(response);
      else await response.body?.cancel();
      throw error;
    }
    const reader = response.body?.getReader();
    requireThat(reader, "invalid_response");
    const chunks = [];
    let bytes = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new LearningClientError("response_too_large");
      }
      chunks.push(part.value);
    }
    requireThat(Date.now() <= deadline, "deadline_exceeded");
    let data;
    try {
      data = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
      );
    } catch {
      throw new LearningClientError("invalid_response");
    }
    return { data, headers: response.headers };
  } catch (error) {
    if (error instanceof LearningClientError) throw error;
    throw new LearningClientError("service_unavailable");
  }
}
