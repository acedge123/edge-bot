import test from 'node:test';
import assert from 'node:assert/strict';
import {
  containsLiveTradingRequest,
  normalizePortfolioApiBase,
  normalizePortfolioRoute,
  portfolioHeaders,
  validatePortfolioOperation,
} from './portfolio-research-api.mjs';

test('uses only the approved portfolio API base', () => {
  assert.equal(
    normalizePortfolioApiBase(''),
    'https://vqucicshrmzjlsxzqylx.supabase.co/functions/v1/agent-api/v1',
  );
  assert.throws(() => normalizePortfolioApiBase('https://example.com/v1'), /approved/);
});

test('restricts routes and mutating operations', () => {
  assert.deepEqual(validatePortfolioOperation('GET', '/agent/portfolio'), {
    method: 'GET',
    route: '/agent/portfolio',
  });
  assert.deepEqual(validatePortfolioOperation('POST', '/agent/config'), {
    method: 'POST',
    route: '/agent/config',
  });
  assert.throws(() => validatePortfolioOperation('POST', '/agent/portfolio'), /not an approved/);
  assert.throws(() => normalizePortfolioRoute('https://example.com'), /Invalid/);
});

test('rejects live-trading flags recursively', () => {
  assert.equal(containsLiveTradingRequest({ mode: 'paper' }), false);
  assert.equal(containsLiveTradingRequest({ nested: { execute_live: true } }), true);
  assert.equal(containsLiveTradingRequest({ paper_trading: false }), true);
});

test('uses read key for reads and write key for mutations', () => {
  assert.equal(
    portfolioHeaders({ method: 'GET', env: {
      PORTFOLIO_AGENT_READ_KEY: 'read',
      PORTFOLIO_AGENT_API_KEY: 'write',
    } }).credentialEnv,
    'PORTFOLIO_AGENT_READ_KEY',
  );
  assert.equal(
    portfolioHeaders({ method: 'POST', env: {
      PORTFOLIO_AGENT_READ_KEY: 'read',
      PORTFOLIO_AGENT_API_KEY: 'write',
    } }).credentialEnv,
    'PORTFOLIO_AGENT_API_KEY',
  );
});
