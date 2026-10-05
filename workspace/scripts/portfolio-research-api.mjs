#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const DEFAULT_PORTFOLIO_API_BASE =
  'https://vqucicshrmzjlsxzqylx.supabase.co/functions/v1/agent-api/v1';

const WRITE_ROUTES = new Set([
  '/agent/config',
  '/agent/screen',
  '/agent/research-report',
  '/agent/backtest',
  '/agent/paper-order',
  '/agent/watchlist',
  '/agent/notes',
  '/agent/report-subscription',
  '/agent/macro/events',
  '/agent/macro/refresh',
  '/agent/ai-news',
  '/agent/test-fixture',
]);

export function normalizePortfolioApiBase(value) {
  const base = String(value || DEFAULT_PORTFOLIO_API_BASE).trim().replace(/\/+$/, '');
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.hostname !== 'vqucicshrmzjlsxzqylx.supabase.co') {
    throw new Error('AGENT_API_BASE must use the approved portfolio Supabase host over HTTPS');
  }
  if (url.pathname !== '/functions/v1/agent-api/v1') {
    throw new Error('AGENT_API_BASE must target /functions/v1/agent-api/v1');
  }
  return base;
}

export function normalizePortfolioRoute(value) {
  const route = `/${String(value || '').trim().replace(/^\/+/, '')}`;
  if (route.includes('..') || route.includes('://')) throw new Error('Invalid portfolio API route');
  if (!/^\/(health|openapi\.json|agent(?:\/|$))/.test(route)) {
    throw new Error('Route is outside the portfolio agent API');
  }
  return route;
}

export function validatePortfolioOperation(method, route) {
  const normalizedMethod = String(method || '').toUpperCase();
  const normalizedRoute = normalizePortfolioRoute(route);
  if (normalizedMethod === 'GET') return { method: normalizedMethod, route: normalizedRoute };
  if (normalizedMethod === 'POST' && WRITE_ROUTES.has(normalizedRoute)) {
    return { method: normalizedMethod, route: normalizedRoute };
  }
  if (
    normalizedMethod === 'DELETE' &&
    /^\/agent\/watchlist\/[A-Za-z0-9.-]+$/.test(normalizedRoute)
  ) {
    return { method: normalizedMethod, route: normalizedRoute };
  }
  throw new Error(`${normalizedMethod} ${normalizedRoute} is not an approved portfolio API operation`);
}

export function containsLiveTradingRequest(value) {
  if (!value || typeof value !== 'object') return false;
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (
      ['live', 'live_trading', 'real_money', 'execute_live'].includes(normalizedKey) &&
      item === true
    ) return true;
    if (normalizedKey === 'paper_trading' && item === false) return true;
    if (normalizedKey === 'mode' && String(item).toLowerCase() === 'live') return true;
    if (containsLiveTradingRequest(item)) return true;
  }
  return false;
}

export function portfolioHeaders({ method, env = process.env }) {
  if (method === 'GET' && String(env.PORTFOLIO_AGENT_READ_KEY || '').trim()) {
    return {
      'x-agent-api-key': String(env.PORTFOLIO_AGENT_READ_KEY).trim(),
      credentialEnv: 'PORTFOLIO_AGENT_READ_KEY',
    };
  }
  const key = String(env.PORTFOLIO_AGENT_API_KEY || '').trim();
  if (!key) throw new Error('PORTFOLIO_AGENT_API_KEY is unavailable on this execution surface');
  return { 'x-agent-api-key': key, credentialEnv: 'PORTFOLIO_AGENT_API_KEY' };
}

function parseArguments(args) {
  const [command = 'help', routeValue, ...rest] = args;
  let bodyFile = '';
  let inlineJson = '';
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--body-file') {
      bodyFile = rest[index + 1] || '';
      index += 1;
    } else if (rest[index] === '--json') {
      inlineJson = rest[index + 1] || '';
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${rest[index]}`);
    }
  }
  if (bodyFile && inlineJson) throw new Error('Use either --body-file or --json, not both');
  return { command, routeValue, bodyFile, inlineJson };
}

function usage() {
  console.log(`Usage:
  portfolio-research-api.mjs health
  portfolio-research-api.mjs get /agent/portfolio
  portfolio-research-api.mjs post /agent/config --body-file /path/request.json
  portfolio-research-api.mjs delete /agent/watchlist/TICKER

The helper is restricted to the paper-trading Research Lab API.`);
}

async function main() {
  const { command, routeValue, bodyFile, inlineJson } = parseArguments(process.argv.slice(2));
  if (command === 'help' || command === '--help') {
    usage();
    return;
  }

  const method = command === 'health' ? 'GET' : command.toUpperCase();
  const route = command === 'health' ? '/health' : routeValue;
  if (!route) throw new Error(`${command} requires a route`);
  const operation = validatePortfolioOperation(method, route);
  const base = normalizePortfolioApiBase(process.env.AGENT_API_BASE);

  let body;
  if (operation.method === 'POST') {
    const raw = bodyFile ? readFileSync(resolve(bodyFile), 'utf8') : inlineJson;
    if (!raw) throw new Error('POST requires --body-file or --json');
    body = JSON.parse(raw);
    if (containsLiveTradingRequest(body)) {
      throw new Error('Live or real-money trading requests are prohibited');
    }
  } else if (bodyFile || inlineJson) {
    throw new Error(`${operation.method} does not accept a request body`);
  }

  const headers = { Accept: 'application/json' };
  if (operation.route !== '/health' && operation.route !== '/openapi.json') {
    const auth = portfolioHeaders({ method: operation.method });
    headers['x-agent-api-key'] = auth['x-agent-api-key'];
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${base}${operation.route}`, {
    method: operation.method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await response.text();
  let payload = text;
  try { payload = JSON.parse(text); } catch {}
  console.log(JSON.stringify({ status: response.status, ok: response.ok, response: payload }, null, 2));
  if (!response.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[portfolio-research-api] ${error.message}`);
    process.exitCode = 1;
  });
}
