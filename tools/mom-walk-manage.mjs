#!/usr/bin/env node

import { realpathSync } from "node:fs";
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

function validateList(input, options = {}) {
  const params = assertObject(input, "params");
  const allowed = ["limit", "offset", ...(options.extraAllowed ?? [])];
  rejectUnknown(params, allowed);
  const limit = params.limit === undefined ? options.defaultLimit ?? 50 : Number(params.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > (options.maxLimit ?? 100)) {
    throw new UsageError(`limit must be an integer from 1 to ${options.maxLimit ?? 100}.`);
  }
  const offset = params.offset === undefined ? 0 : Number(params.offset);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new UsageError("offset must be a non-negative integer.");
  }
  return { ...params, limit, offset };
}

function validateSurveyLookup(input) {
  const params = assertObject(input, "params");
  rejectUnknown(params, ["id", "slug"]);
  const id = typeof params.id === "string" ? params.id.trim() : "";
  const slug = typeof params.slug === "string" ? params.slug.trim() : "";
  if ((!id && !slug) || (id && slug)) {
    throw new UsageError("Provide exactly one of id or slug.");
  }
  if (id && !UUID_PATTERN.test(id)) throw new UsageError("id must be a UUID.");
  return id ? { id } : { slug };
}

function validateSurveyPayload(input, options = {}) {
  const params = assertObject(input, "params");
  const allowed = [
    "id",
    "name",
    "slug",
    "description",
    "survey_url",
    "external_survey_id",
    "brand_id",
    "event_id",
    "is_active",
    "is_featured",
  ];
  rejectUnknown(params, allowed);
  if (options.requiresId) {
    const id = typeof params.id === "string" ? params.id.trim() : "";
    if (!UUID_PATTERN.test(id)) throw new UsageError("id must be a UUID.");
  }
  if (options.create) {
    if (params.is_active === true) throw new UsageError('Create surveys as drafts; use surveys.request-publish for human approval.');
    for (const key of ["name", "slug", "survey_url"]) {
      if (typeof params[key] !== "string" || !params[key].trim()) {
        throw new UsageError(`${key} is required.`);
      }
    }
  }
  for (const key of ["brand_id", "event_id"]) {
    if (params[key] !== undefined && params[key] !== null && params[key] !== "") {
      if (typeof params[key] !== "string" || !UUID_PATTERN.test(params[key])) {
        throw new UsageError(`${key} must be a UUID.`);
      }
    }
  }
  if (typeof params.survey_url === "string") {
    try {
      new URL(params.survey_url);
    } catch {
      throw new UsageError("survey_url must be a valid URL.");
    }
  }
  if (!options.create && params.is_active === true) {
    throw new UsageError('Use surveys.request-publish for human-approved publication.');
  }
  const normalized = { ...params, ...(options.create ? { is_active: false } : {}) };
  for (const key of ["id", "name", "slug", "description", "survey_url", "external_survey_id", "brand_id", "event_id"]) {
    if (typeof normalized[key] === "string") normalized[key] = normalized[key].trim();
  }
  return normalized;
}

function validateDeleteById(input, confirmation) {
  const params = assertObject(input, "params");
  rejectUnknown(params, ["id"]);
  const id = typeof params.id === "string" ? params.id.trim() : "";
  if (!UUID_PATTERN.test(id)) throw new UsageError("id must be a UUID.");
  if (normalizeTarget(confirmation) !== normalizeTarget(id)) {
    throw new UsageError("--confirm-target must exactly match the id being deleted.");
  }
  return { id };
}

function validateEmailTemplates(input) {
  const params = assertObject(input, "params");
  rejectUnknown(params, []);
  return params;
}

function validateCommunityMembers(input) {
  const params = assertObject(input, "params");
  rejectUnknown(params, ["community_id"]);
  const communityId = typeof params.community_id === "string" ? params.community_id.trim() : "";
  if (!UUID_PATTERN.test(communityId)) throw new UsageError("community_id must be a UUID.");
  return { community_id: communityId };
}

function validateSurveyDeploy(input, confirmation) {
  const params = assertObject(input, "params");
  rejectUnknown(params, ["surveyId", "templateId", "recipients"]);
  if (typeof params.surveyId !== "string" || !UUID_PATTERN.test(params.surveyId)) {
    throw new UsageError("surveyId must be a UUID.");
  }
  if (typeof params.templateId !== "string" || !UUID_PATTERN.test(params.templateId)) {
    throw new UsageError("templateId must be a UUID.");
  }
  if (!Array.isArray(params.recipients) || params.recipients.length < 1 || params.recipients.length > 500) {
    throw new UsageError("recipients must contain 1-500 recipients.");
  }
  const recipients = params.recipients.map((recipient, index) => {
    assertObject(recipient, `recipients[${index}]`);
    rejectUnknown(recipient, ["userId", "email", "name"]);
    if (typeof recipient.userId !== "string" || !UUID_PATTERN.test(recipient.userId)) {
      throw new UsageError(`recipients[${index}].userId must be a UUID.`);
    }
    const email = normalizeTarget(recipient.email);
    if (!EMAIL_PATTERN.test(email)) {
      throw new UsageError(`recipients[${index}].email is invalid.`);
    }
    const name = typeof recipient.name === "string" && recipient.name.trim()
      ? recipient.name.trim()
      : "there";
    return { userId: recipient.userId.trim(), email, name };
  });
  if (normalizeTarget(confirmation) !== normalizeTarget(params.surveyId)) {
    throw new UsageError("--confirm-target must exactly match the surveyId being deployed.");
  }
  return { surveyId: params.surveyId.trim(), templateId: params.templateId.trim(), recipients };
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
  "surveys.list": {
    resource: "surveys",
    action: "list",
    risk: "read",
    validate: (params) => validateList(params, { extraAllowed: ["active_only"], defaultLimit: 25 }),
  },
  "surveys.get": {
    resource: "surveys",
    action: "get",
    risk: "read",
    validate: (params) => validateSurveyLookup(params),
  },
  "surveys.create": {
    resource: "surveys",
    action: "create",
    risk: "write",
    validate: (params) => validateSurveyPayload(params, { create: true }),
  },
  "surveys.update": {
    resource: "surveys",
    action: "update",
    risk: "write",
    validate: (params) => validateSurveyPayload(params, { requiresId: true }),
  },
  "surveys.delete": {
    resource: "surveys",
    action: "delete",
    risk: "destructive",
    validate: (params, options) => validateDeleteById(params, options.confirmTarget),
  },
  "survey.deploy-recipients": {
    endpoint: "survey-approvals",
    payloadAction: "request-send",
    risk: "write",
    validate: (params, options) => validateSurveyDeploy(params, options.confirmTarget),
  },
  "surveys.request-publish": {
    endpoint: "survey-approvals",
    payloadAction: "request-publish",
    risk: "write",
    validate: (params) => {
      const validated = validateSurveyLookup(params);
      if (!validated.id) throw new UsageError('Provide the Mom Walk survey id.');
      return { surveyId: validated.id };
    },
  },
  "surveys.approvals": {
    endpoint: "survey-approvals",
    payloadAction: "list",
    risk: "read",
    validate: (params) => validateEmailTemplates(params),
  },
  "admin.list-email-templates": {
    resource: "admin",
    action: "list-email-templates",
    risk: "read",
    validate: (params) => validateEmailTemplates(params),
  },
  "admin.list-users": {
    resource: "admin",
    action: "list-users",
    risk: "read",
    validate: (params) => validateList(params, { defaultLimit: 50, maxLimit: 200 }),
  },
  "communities.list": {
    resource: "communities",
    action: "list",
    risk: "read",
    validate: (params) => validateList(params, { extraAllowed: ["active_only"], defaultLimit: 50 }),
  },
  "communities.list-members": {
    resource: "communities",
    action: "list-members",
    risk: "read",
    validate: (params) => validateCommunityMembers(params),
  },
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

  const targetFunction = definition.endpoint ?? "manage";
  const requestBody = definition.endpoint
    ? { ...(definition.payloadAction ? { action: definition.payloadAction } : {}), ...validatedParams }
    : {
        resource: definition.resource,
        action: definition.action,
        params: validatedParams,
      };

  const managePayload = await readJson(
    await fetchImpl(`${functionsUrl}/${targetFunction}`, {
      method: "POST",
      headers: {
        ...commonHeaders,
        Authorization: `Bearer ${mintPayload.access_token}`,
      },
      body: JSON.stringify(requestBody),
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

const invokedPath = process.argv[1] ? pathToFileURL(realpathSync(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main(process.argv.slice(2)).catch((error) => {
    const isUsage = error instanceof UsageError;
    process.stderr.write(
      `${JSON.stringify({ error: error instanceof Error ? error.message : String(error), type: isUsage ? "usage" : "runtime" })}\n`,
    );
    process.exitCode = isUsage ? 2 : 1;
  });
}
