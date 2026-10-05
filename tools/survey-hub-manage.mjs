#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const DEFAULT_FUNCTIONS_URL =
  "https://vombjszkchcffrnkrfto.supabase.co/functions/v1";
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

function normalizeTarget(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function cleanParams(input, allowed) {
  const params = assertObject(input, "params");
  rejectUnknown(params, allowed);
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      typeof value === "string" ? value.trim() : value,
    ]),
  );
}

function validatePassthrough(input) {
  return assertObject(input, "params");
}

function validateDelete(input, confirmation, idKeys) {
  const params = assertObject(input, "params");
  const idKey = idKeys.find((key) => typeof params[key] === "string" && params[key].trim());
  if (!idKey) {
    throw new UsageError(`Provide one of: ${idKeys.join(", ")}.`);
  }
  const target = params[idKey].trim();
  if (idKey.toLowerCase().includes("id") && !UUID_PATTERN.test(target)) {
    throw new UsageError(`${idKey} must be a UUID.`);
  }
  if (normalizeTarget(confirmation) !== normalizeTarget(target)) {
    throw new UsageError(`--confirm-target must exactly match ${idKey}.`);
  }
  return { ...params, [idKey]: target, confirm: true };
}

function validateList(input, allowed) {
  const params = cleanParams(input, allowed);
  if (params.limit !== undefined) {
    const limit = Number(params.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new UsageError("limit must be an integer from 1 to 200.");
    }
    params.limit = limit;
  }
  if (params.offset !== undefined) {
    const offset = Number(params.offset);
    if (!Number.isInteger(offset) || offset < 0) {
      throw new UsageError("offset must be a non-negative integer.");
    }
    params.offset = offset;
  }
  return params;
}

export const ACTIONS = Object.freeze({
  "brand.lookup": {
    risk: "read",
    validate: (params) =>
      cleanParams(params, [
        "id",
        "brandId",
        "brandSlug",
        "clientId",
        "clientSlug",
        "slug",
        "subdomain",
        "name",
        "includeSurveys",
      ]),
  },
  "brand.list": {
    risk: "read",
    validate: (params) => validateList(params, ["search", "limit", "offset"]),
  },
  "brand.create": {
    risk: "write",
    validate: (params) => cleanParams(params, ["brand"]),
  },
  "brand.update": {
    risk: "write",
    validate: (params) =>
      cleanParams(params, [
        "id",
        "brandId",
        "brandSlug",
        "clientId",
        "clientSlug",
        "slug",
        "subdomain",
        "name",
        "updates",
      ]),
  },
  "brand.delete": {
    risk: "destructive",
    validate: (params, options) =>
      validateDelete(params, options.confirmTarget, [
        "brandId",
        "clientId",
        "id",
        "brandSlug",
        "clientSlug",
        "slug",
        "subdomain",
        "name",
      ]),
  },
  "survey.list": {
    risk: "read",
    validate: (params) =>
      cleanParams(params, [
        "id",
        "brandId",
        "brandSlug",
        "clientId",
        "clientSlug",
        "slug",
        "subdomain",
        "name",
      ]),
  },
  "survey.lookup": {
    risk: "read",
    validate: (params) =>
      cleanParams(params, [
        "id",
        "surveyId",
        "surveySlug",
        "brandId",
        "brandSlug",
        "clientId",
        "clientSlug",
        "slug",
        "subdomain",
        "name",
      ]),
  },
  "questions.list": {
    risk: "read",
    validate: (params) => cleanParams(params, ["id", "surveyId", "surveySlug", "brandSlug", "clientSlug", "slug"]),
  },
  "question.create": {
    risk: "write",
    validate: validatePassthrough,
  },
  "question.update": {
    risk: "write",
    validate: validatePassthrough,
  },
  "question.delete": {
    risk: "destructive",
    validate: (params, options) => validateDelete(params, options.confirmTarget, ["questionId", "id"]),
  },
  "question.reorder": {
    risk: "write",
    validate: validatePassthrough,
  },
  "responses.list": {
    risk: "read",
    validate: (params) =>
      validateList(params, [
        "id",
        "surveyId",
        "surveySlug",
        "brandSlug",
        "clientSlug",
        "slug",
        "status",
        "includeAnswers",
        "limit",
        "offset",
      ]),
  },
  "response.get": {
    risk: "read",
    validate: (params) => cleanParams(params, ["id", "responseId"]),
  },
  "response.create": {
    risk: "write",
    validate: validatePassthrough,
  },
  "response.update": {
    risk: "write",
    validate: validatePassthrough,
  },
  "response.delete": {
    risk: "destructive",
    validate: (params, options) => validateDelete(params, options.confirmTarget, ["responseId", "id"]),
  },
  "answer.upsert": {
    risk: "write",
    validate: validatePassthrough,
  },
  "answer.delete": {
    risk: "destructive",
    validate: (params, options) => validateDelete(params, options.confirmTarget, ["answerId", "id"]),
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
    if (/token|password|secret|api_key/i.test(key)) {
      if (item !== undefined) redacted[key] = "[REDACTED]";
    } else {
      redacted[key] = redactSecrets(item);
    }
  }
  return redacted;
}

async function readJson(response) {
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Survey Hub manage returned a non-JSON response (${response.status}).`);
  }
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : "Survey Hub manage request failed";
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
  const secret = env.SURVEY_HUB_MANAGE_SECRET?.trim() || env.MANAGE_API_SECRET?.trim();
  if (!secret) throw new Error("SURVEY_HUB_MANAGE_SECRET is not configured.");

  const functionsUrl = (env.SURVEY_HUB_FUNCTIONS_URL || DEFAULT_FUNCTIONS_URL)
    .trim()
    .replace(/\/+$/, "");

  const payload = await readJson(
    await fetchImpl(`${functionsUrl}/manage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ action: actionName, ...validatedParams }),
      signal: AbortSignal.timeout(30_000),
    }),
  );

  return redactSecrets(payload);
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
