#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { sponsorOpsHeaders } from './brand-connect-sponsor-ops.mjs';

export const CAMPAIGN_API_URL = 'https://evthfmqawotwbbkxfxep.supabase.co/functions/v1/api-campaign-requests';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_COMMUNITIES = 500;
const MAX_COMMUNITY_SEARCH_RESULTS = 500;
const MAX_RADIUS_MILES = 250;
const MAX_RECIPIENTS = 1_000_000;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function imageType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  throw new Error('Image must have a JPG, PNG, or WebP file signature');
}

function imageFields(input) {
  if (input.image_base64 === undefined) {
    if (input.image_content_type !== undefined) throw new Error('image_content_type requires image_base64');
    return {};
  }
  if (typeof input.image_base64 !== 'string' || input.image_base64.length > 7_000_000) {
    throw new Error('image_base64 must be a base64 string for an image of at most 5 MB');
  }
  let encoded = input.image_base64.trim();
  const dataUrl = encoded.match(/^data:(image\/(?:jpeg|png|webp));base64,/i);
  if (dataUrl) encoded = encoded.slice(dataUrl[0].length);
  const type = input.image_content_type ?? dataUrl?.[1].toLowerCase();
  if (!IMAGE_TYPES.includes(type)) throw new Error('image_content_type must be image/jpeg, image/png, or image/webp (or use a data URL)');
  encoded = encoded.replace(/\s/g, '');
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error('image_base64 is not valid base64');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) throw new Error('image_base64 is not canonical base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('Image must be nonempty and 5 MB or smaller');
  if (imageType(bytes) !== type || (dataUrl && dataUrl[1].toLowerCase() !== type)) {
    throw new Error('Image content type does not match the image bytes');
  }
  return { image_base64: bytes.toString('base64'), image_content_type: type };
}

export async function loadImageFile(path) {
  if (typeof path !== 'string' || !path.trim()) throw new Error('--image-file requires a local file path');
  const file = await open(path, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile() || !info.size || info.size > MAX_IMAGE_BYTES) throw new Error('Image must be a regular nonempty file of at most 5 MB');
    // Bound reads even if the file grows after stat; never load arbitrary-size attachments.
    const buffer = Buffer.alloc(MAX_IMAGE_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await file.read(buffer, size, buffer.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (!size || size > MAX_IMAGE_BYTES) throw new Error('Image must be nonempty and 5 MB or smaller');
    const bytes = buffer.subarray(0, size);
    return imageFields({ image_base64: bytes.toString('base64'), image_content_type: imageType(bytes) });
  } finally {
    await file.close();
  }
}

function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('params must be a JSON object');
  return value;
}

function known(params, fields) {
  const unknown = Object.keys(params).filter((key) => !fields.includes(key));
  if (unknown.length) throw new Error(`Unsupported parameters: ${unknown.join(', ')}`);
}

function text(value, name, max, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.trim().length > max) {
    throw new Error(`${name} must be a string of ${allowEmpty ? 0 : 1}-${max} characters`);
  }
  return value.trim();
}

function uuid(value, name) {
  const result = text(value, name, 36).toLowerCase();
  if (!UUID.test(result)) throw new Error(`${name} must be a UUID`);
  return result;
}

function email(value) {
  const result = text(value, 'brand_email', 255).toLowerCase();
  if (!EMAIL.test(result)) throw new Error('brand_email must be a valid email');
  return result;
}

function date(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} must be a real date in YYYY-MM-DD format`);
  }
  return value;
}

function requestFields(input, { partial = false } = {}) {
  known(input, ['brand_account_id', 'brand_email', 'brand_name', 'brand_website', 'create_brand', 'request_type', 'product_name',
    'product_description', 'product_url', 'product_image_url', 'image_base64', 'image_content_type', 'community_ids',
    'target_recipients', 'start_date', 'end_date', 'interest_deadline', 'instructions', 'ambassadors_only',
    ...(partial ? [] : ['stage'])]);
  const params = imageFields(input);
  if (input.stage !== undefined) {
    if (!['rfq', 'pre_campaign'].includes(input.stage)) throw new Error('stage must be rfq or pre_campaign');
    params.stage = input.stage;
  }
  if (input.brand_account_id !== undefined) params.brand_account_id = uuid(input.brand_account_id, 'brand_account_id');
  if (input.brand_email !== undefined) params.brand_email = email(input.brand_email);
  if (input.brand_name !== undefined) params.brand_name = text(input.brand_name, 'brand_name', 200);
  if (input.create_brand !== undefined) {
    if (typeof input.create_brand !== 'boolean') throw new Error('create_brand must be boolean');
    if (input.create_brand && !params.brand_name) throw new Error('create_brand requires the exact brand_name');
    if (input.create_brand && params.brand_account_id) throw new Error('Use an existing brand_account_id without create_brand, or create by brand_name');
    params.create_brand = input.create_brand;
  }
  if (!partial && !params.brand_account_id && !params.brand_email && !params.brand_name) throw new Error('brand_account_id, brand_email, or brand_name is required');
  if (input.brand_website !== undefined && !params.brand_account_id && !params.brand_email && !params.brand_name) throw new Error('brand_website requires a brand identity');
  if ((!partial && params.stage !== 'pre_campaign') || input.request_type !== undefined) {
    if (!['sampling', 'seeding', 'irl_gifting'].includes(input.request_type)) throw new Error('request_type must be sampling, seeding, or irl_gifting');
    params.request_type = input.request_type;
  }
  if (!partial || input.product_name !== undefined) params.product_name = text(input.product_name, 'product_name', 200);
  if (!partial || input.community_ids !== undefined) {
    if (!Array.isArray(input.community_ids) || !input.community_ids.length || input.community_ids.length > MAX_COMMUNITIES) {
      throw new Error(`community_ids must contain 1-${MAX_COMMUNITIES} UUIDs resolved from the API`);
    }
    params.community_ids = [...new Set(input.community_ids.map((id) => uuid(id, 'community_ids')))];
  }
  for (const key of ['product_description', 'instructions']) {
    if (input[key] !== undefined) params[key] = text(input[key], key, 4000, true);
  }
  for (const [key, max] of [['product_url', 500], ['product_image_url', 1000], ['brand_website', 500]]) {
    if (input[key] === undefined) continue;
    const value = text(input[key], key, max);
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${key} must be HTTPS without credentials`);
    params[key] = value;
  }
  if (input.target_recipients !== undefined) {
    if (!Number.isInteger(input.target_recipients) || input.target_recipients < 1 || input.target_recipients > MAX_RECIPIENTS) {
      throw new Error(`target_recipients must be an integer from 1 to ${MAX_RECIPIENTS}`);
    }
    params.target_recipients = input.target_recipients;
  }
  for (const key of ['start_date', 'end_date', 'interest_deadline']) {
    if (input[key] !== undefined) params[key] = date(input[key], key);
  }
  if (params.start_date && params.end_date && params.end_date < params.start_date) throw new Error('end_date is before start_date');
  if (input.ambassadors_only !== undefined && typeof input.ambassadors_only !== 'boolean') throw new Error('ambassadors_only must be boolean');
  if (!partial || input.ambassadors_only !== undefined) params.ambassadors_only = input.ambassadors_only ?? false;
  return params;
}

function confirmTarget(value, target, message) {
  if (typeof value !== 'string' || value.trim().toLowerCase() !== target) throw new Error(message);
}

function confirmBrandCreation(params, options) {
  if (params.create_brand && options.confirmBrandName !== params.brand_name) {
    throw new Error('--confirm-brand-name must exactly match brand_name, including spelling and capitalization, to permit pipeline creation');
  }
}

function createParams(input, options) {
  const params = requestFields(input);
  confirmBrandCreation(params, options);
  const target = params.brand_account_id ?? params.brand_email ?? params.brand_name.toLowerCase();
  confirmTarget(options.confirmTarget, target,
    '--confirm-target must match the brand_account_id (preferred), brand_email, or brand_name; creation notifies admins');
  return params;
}

function updateParams(input, options) {
  const { id: rawId, ...changes } = input;
  const id = uuid(rawId, 'id');
  confirmTarget(options.confirmTarget, id, '--confirm-target must match the request id being updated');
  const params = requestFields(changes, { partial: true });
  confirmBrandCreation(params, options);
  if (!Object.keys(params).length) throw new Error('Provide at least one field to update');
  return { id, ...params };
}

export const ACTIONS = Object.freeze(['communities.search', 'brands.search', 'brands.resolve-email', 'requests.create', 'requests.get', 'requests.update']);

export function buildRequest(action, input = {}, options = {}) {
  const params = object(input);
  if (action === 'requests.create') return { method: 'POST', body: createParams(params, options), query: '' };
  if (action === 'requests.update') return { method: 'PATCH', body: updateParams(params, options), query: '' };
  const query = new URLSearchParams();
  if (action === 'communities.search') {
    known(params, ['query', 'limit', 'sort', 'lat', 'lng', 'radius_miles']);
    const hasCoordinates = params.lat !== undefined || params.lng !== undefined;
    if (hasCoordinates) {
      if (params.query !== undefined) throw new Error('Use an anchor query or coordinates, not both');
      for (const [key, bound] of [['lat', 90], ['lng', 180]]) {
        if (typeof params[key] !== 'number' || !Number.isFinite(params[key]) || Math.abs(params[key]) > bound) {
          throw new Error(`${key} must be a finite number from -${bound} to ${bound}; provide both lat and lng`);
        }
        query.set(key, String(params[key]));
      }
      if (params.radius_miles === undefined) throw new Error('Coordinates require radius_miles');
    } else {
      query.set('communities', text(params.query, 'query', 200));
    }
    if (params.radius_miles !== undefined) {
      if (typeof params.radius_miles !== 'number' || !Number.isFinite(params.radius_miles) ||
        params.radius_miles <= 0 || params.radius_miles > MAX_RADIUS_MILES) {
        throw new Error(`radius_miles must be a finite number greater than 0 and at most ${MAX_RADIUS_MILES}`);
      }
      query.set('radius_miles', String(params.radius_miles));
    }
    const limit = params.limit === undefined ? 25 : params.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_COMMUNITY_SEARCH_RESULTS) {
      throw new Error(`limit must be an integer from 1 to ${MAX_COMMUNITY_SEARCH_RESULTS}`);
    }
    query.set('limit', String(limit));
    if (params.sort !== undefined) {
      if (params.sort !== 'members') throw new Error('sort must be members, or omitted for default name/distance ordering');
      query.set('sort', params.sort);
    }
  } else if (action === 'brands.search') {
    known(params, ['query']);
    query.set('brands', text(params.query, 'query', 200));
  } else if (action === 'brands.resolve-email') {
    known(params, ['brand_email']);
    query.set('brand_email', email(params.brand_email));
  } else if (action === 'requests.get') {
    known(params, ['id']);
    query.set('id', uuid(params.id, 'id'));
  } else throw new Error(`Unsupported action: ${action}`);
  return { method: 'GET', query: `?${query}` };
}

export async function executeAction(action, params = {}, options = {}, dependencies = {}) {
  if (options.imageFile !== undefined) {
    if (!['requests.create', 'requests.update'].includes(action)) throw new Error('--image-file is only supported for requests.create or requests.update');
    object(params);
    if (params.image_base64 !== undefined || params.image_content_type !== undefined) {
      throw new Error('Use --image-file or image_base64/image_content_type, not both');
    }
    params = { ...params, ...await (dependencies.loadImageFile ?? loadImageFile)(options.imageFile) };
  }
  const request = buildRequest(action, params, options);
  if (action === 'requests.update') {
    const current = await executeAction('requests.get', { id: request.body.id }, {}, dependencies);
    if (!current.ok) return { ...current, action };
    const existing = current.response.request;
    if (existing?.id !== request.body.id) throw new Error('Could not verify the current request before updating');
    if (existing.stage === 'pre_campaign') {
      if (existing.interest_status !== 'draft' || existing.converted_to_draft_id) {
        throw new Error('Only draft pre-campaigns may be updated; stop after sending, closing, or conversion');
      }
    } else if (existing.status !== 'submitted') {
      throw new Error('Only submitted, unquoted requests may be updated; submit a new request after quoting');
    }
    const start = request.body.start_date ?? existing.start_date;
    const end = request.body.end_date ?? existing.end_date;
    if (start && end && end < start) throw new Error('end_date is before start_date on the existing request');
  }
  const env = dependencies.env ?? process.env;
  const headers = sponsorOpsHeaders({ env });
  if (request.body) headers['Content-Type'] = 'application/json';
  // Never retry writes automatically: POST notifies admins; PATCH records history.
  const response = await (dependencies.fetchImpl ?? fetch)(`${CAMPAIGN_API_URL}${request.query}`, {
    method: request.method, headers, redirect: 'error',
    body: request.body ? JSON.stringify(request.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json();
  const secret = env.ENRICHMENT_AGENT_KEY.trim();
  let safeJson = JSON.stringify(payload).split(secret).join('[REDACTED]');
  for (const encoded of [params.image_base64, request.body?.image_base64]) {
    if (encoded) safeJson = safeJson.split(encoded).join('[IMAGE REDACTED]');
  }
  const safePayload = JSON.parse(safeJson);
  if (response.ok && action === 'requests.create' && (response.status !== 201 || payload.status !== 'submitted' || !UUID.test(payload.id ?? ''))) {
    throw new Error('Unexpected creation response; outcome uncertain. Check Admin Requests before retrying.');
  }
  if (response.ok && action === 'requests.create' && request.body.stage === 'pre_campaign' && payload.stage !== 'pre_campaign') {
    throw new Error('Unexpected pre-campaign stage; outcome uncertain. Check Admin Requests before retrying.');
  }
  if (response.ok && action === 'requests.update' && (response.status !== 200 || payload.id !== request.body.id ||
    payload.request?.id !== request.body.id || !Array.isArray(payload.updated_fields))) {
    throw new Error('Unexpected update response; outcome uncertain. Read the request before retrying.');
  }
  return { action, status: response.status, ok: response.ok, response: safePayload };
}

export function parseCliArgs(args) {
  const [action = 'help', ...rest] = args;
  const result = { action, params: {}, options: {} };
  const seen = new Set();
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    if (!['--params-json', '--confirm-target', '--confirm-brand-name', '--image-file'].includes(flag) || seen.has(flag) || rest[i + 1] === undefined) throw new Error(`Invalid CLI flag: ${flag}`);
    seen.add(flag);
    if (flag === '--params-json') result.params = JSON.parse(rest[i + 1]);
    else if (flag === '--confirm-target') result.options.confirmTarget = rest[i + 1];
    else if (flag === '--confirm-brand-name') result.options.confirmBrandName = rest[i + 1];
    else result.options.imageFile = rest[i + 1];
  }
  return result;
}

async function main() {
  const { action, params, options } = parseCliArgs(process.argv.slice(2));
  if (action === 'list-actions' || action === 'help') {
    console.log(JSON.stringify({ actions: ACTIONS, usage: 'brand-connect-campaigns <action> --params-json <json> [--confirm-target <brand-id-or-email-or-name-or-request-id>] [--confirm-brand-name <exact-name>] [--image-file <local-jpg-png-webp-path>]' }));
    return;
  }
  const result = await executeAction(action, params, options);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(JSON.stringify({ event: 'campaign_request.failed', message: error.message }));
    process.exitCode = 1;
  });
}
