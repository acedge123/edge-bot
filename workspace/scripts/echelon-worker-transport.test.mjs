import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workerSource = readFileSync(new URL('./echelon-agent-worker.mjs', import.meta.url), 'utf8');

test('Echelon jobs use synchronous chat completions instead of polling progress messages', () => {
  assert.match(workerSource, /fetch\(`\$\{GATEWAY_HTTP_URL\}\/v1\/chat\/completions`/);
  assert.doesNotMatch(workerSource, /gatewayCall\('chat\.send'/);
  assert.doesNotMatch(workerSource, /gatewayCall\('chat\.history'/);
});

test('completed responses and bounded conversation history are persisted', () => {
  assert.match(workerSource, /readSessionLog\(\{ sessionKey, maxMessages: 12 \}\)/);
  assert.match(workerSource, /appendSessionLog\(\{ sessionKey, role: 'assistant', text: responseText \}\)/);
  assert.match(workerSource, /return gatewayChatCompletion\(\{ sessionKey, requestText: message/);
});
