#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const DEFAULT_FUNCTIONS_URL =
  "https://lkdtkhfpydznwaptyufl.supabase.co/functions/v1";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class UsageError extends Error {}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new UsageError(`${label} must be a JSON object.`);
  }
  return value;
}

function rejectUnknown(params, allowed) {
  const unknown = Object.keys(params).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw new UsageError(`Unsupported parameter(s): ${unknown.join(", ")}.`);
  }
}

function validateFindUser(input) {
  const params = assertObject(input, "params");
  rejectUnknown(params, ["query", "limit"]);
  const query = typeof params.query === "string" ? params.query.trim() : "";
  if (!query || query.length > 200) {
    throw new UsageError("query must contain 1-200 characters.");
  }
  const limit = params.limit === undefined ? 10 : Number(params.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
    throw new UsageError("limit must be an integer from 1 to 25.");
  }
  return { query, limit };
}

function normalizeTarget(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validateResetUserPassword(input, confirmation) {
  const params = assertObject(input, "params");
  rejectUnknown(params, ["email", "user_id"]);
  const email = normalizeTarget(params.email);
  const userId = typeof params.user_id === "string" ? params.user_id.trim() : "";
  if (email && !EMAIL_PATTERN.test(email)) {
    throw new UsageError("email is invalid.");
  }
  if (userId && !UUID_PATTERN.test(userId)) {
    throw new UsageError("user_id must be a UUID.");
  }
  if ((!email && !userId) || (email && userId)) {
    throw new UsageError("Provide exactly one of email or user_id.");
  }

  const target = normalizeTarget(email || userId);
  if (normalizeTarget(confirmation) !== target) {
    throw new UsageError(
      "--confirm-target must exactly match the email or user_id being reset.",
    );
  }
  return { ...(email ? { email } : { user_id: userId }), notify: true };
}

export const ACTIONS = Object.freeze({
  "admin.find-user": {
    resource: "admin",
    action: "find-user",
    risk: "read",
    validate: (params) => validateFindUser(params),
  },
  "admin.reset-user-password": {
    resource: "admin",
    action: "reset-user-password",
    risk: "critical",
    validate: (params, options) =>
      validateResetUserPassword(params, options.confirmTarget),
  },
});

export function parseCliArgs(argv) {
  const [actionName, ...rest] = argv;
  if (!actionName) throw new UsageError("An action is required.");
  if (actionName === "list-actions") return { listActions: true };

  let paramsJson = null;
  let confirmTarget = null;
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (flag === "--params-json" && value !== undefined) {
      paramsJson = value;
      index += 1;
    } else if (flag === "--confirm-target" && value !== undefined) {
      confirmTarget = value;
      index += 1;
    } else {
      throw new UsageError(`Unknown or incomplete argument: ${flag}.`);
    }
  }
  if (paramsJson === null) throw new UsageError("--params-json is required.");

  let params;
  try {
    params = JSON.parse(paramsJson);
  } catch {
    throw new UsageError("--params-json must be valid JSON.");
  }
  return { actionName, params, confirmTarget };
}

function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;

  const redacted = {};
  for (const [key, item] of Object.entries(value)) {
    if (/token|password|secret/i.test(key)) {
      if (item !== undefined) redacted[key] = "[REDACTED]";
    } else {
      redacted[key] = redactSecrets(item);
    }
  }
  return redacted;
}

async function readJson(response, label) {
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label} returned a non-JSON response (${response.status}).`);
  }
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : label;
    throw new Error(`${message} (${response.status}).`);
  }
  return payload;
}

export async function executeAction(
  actionName,
  params,
  options = {},
  dependencies = {},
) {
  const definition = ACTIONS[actionName];
  if (!definition) throw new UsageError(`Unsupported action: ${actionName}.`);
  const validatedParams = definition.validate(params, options);

  const env = dependencies.env ?? process.env;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const mintSecret = env.MOM_WALK_AGENT_MINT_SECRET?.trim();
  if (!mintSecret) throw new Error("MOM_WALK_AGENT_MINT_SECRET is not configured.");

  const functionsUrl = (env.MOM_WALK_FUNCTIONS_URL || DEFAULT_FUNCTIONS_URL)
    .trim()
    .replace(/\/+$/, "");
  const anonKey = env.MOM_WALK_SUPABASE_ANON_KEY?.trim();
  const commonHeaders = {
    "Content-Type": "application/json",
    ...(anonKey ? { apikey: anonKey } : {}),
  };

  const mintPayload = await readJson(
    await fetchImpl(`${functionsUrl}/mint-agent-token`, {
      method: "POST",
      headers: { ...commonHeaders, "x-agent-key": mintSecret },
      signal: AbortSignal.timeout(15_000),
    }),
    "Token minting failed",
  );
  if (typeof mintPayload.access_token !== "string" || !mintPayload.access_token) {
    throw new Error("Token minting returned no access token.");
  }

  const managePayload = await readJson(
    await fetchImpl(`${functionsUrl}/manage`, {
      method: "POST",
      headers: {
        ...commonHeaders,
        Authorization: `Bearer ${mintPayload.access_token}`,
      },
      body: JSON.stringify({
        resource: definition.resource,
        action: definition.action,
        params: validatedParams,
      }),
      signal: AbortSignal.timeout(30_000),
    }),
    "Mom Walk manage request failed",
  );
  if (managePayload.success === false) {
    throw new Error(
      typeof managePayload.error === "string"
        ? managePayload.error
        : "Mom Walk manage request failed.",
    );
  }

  return redactSecrets(managePayload);
}

async function main(argv) {
  const parsed = parseCliArgs(argv);
  if (parsed.listActions) {
    process.stdout.write(
      `${JSON.stringify({ actions: Object.entries(ACTIONS).map(([name, value]) => ({ name, risk: value.risk })) })}\n`,
    );
    return;
  }

  const result = await executeAction(parsed.actionName, parsed.params, {
    confirmTarget: parsed.confirmTarget,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main(process.argv.slice(2)).catch((error) => {
    const isUsage = error instanceof UsageError;
    process.stderr.write(
      `${JSON.stringify({ error: error instanceof Error ? error.message : String(error), type: isUsage ? "usage" : "runtime" })}\n`,
    );
    process.exitCode = isUsage ? 2 : 1;
  });
}
