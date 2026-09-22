import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRepoCLaneAHeaders } from './repo-c-lane-a.mjs';

test('builds the trusted Lane A headers without consumer or anon keys', () => {
  const headers = buildRepoCLaneAHeaders({
    executorSecret: '  executor-secret  ',
    tenantId: ' tenant-7 ',
  });

  assert.deepEqual(headers, {
    Authorization: 'Bearer executor-secret',
    'X-Tenant-Id': 'tenant-7',
    'Content-Type': 'application/json',
  });
  assert.equal('X-API-Key' in headers, false);
  assert.equal('apikey' in headers, false);
});

test('rejects missing trusted credentials', () => {
  assert.throws(
    () => buildRepoCLaneAHeaders({ executorSecret: '', tenantId: 'tenant-7' }),
    /EXECUTOR_SECRET/,
  );
  assert.throws(
    () => buildRepoCLaneAHeaders({ executorSecret: 'secret', tenantId: '' }),
    /X-Tenant-Id/,
  );
});
