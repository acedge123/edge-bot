import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import test from 'node:test';

import {
  downloadWorkbookAttachment,
  isWorkbookAttachment,
} from './echelon-workbook-attachment.mjs';

test('recognizes supported Excel workbook attachments', () => {
  assert.equal(isWorkbookAttachment({ filename: 'Personal Monthly Bills.xlsx' }), true);
  assert.equal(isWorkbookAttachment({ name: 'budget.xlsm' }), true);
  assert.equal(isWorkbookAttachment({ filename: 'legacy.xls' }), true);
  assert.equal(isWorkbookAttachment({ filename: 'notes.txt' }), false);
});

test('downloads a workbook to the per-job upload directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'echelon-workbook-'));
  const body = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01]);
  const fetchImpl = async () => new Response(body, {
    status: 200,
    headers: { 'content-length': String(body.length) },
  });

  const result = await downloadWorkbookAttachment({
    att: { filename: '2026 Test.xlsx', url: 'https://example.test/file' },
    workspaceRoot: root,
    jobId: 'job-1',
    serial: 0,
    fetchImpl,
  });

  assert.equal(result.ok, true);
  assert.equal(result.rel, 'tmp/echelon-uploads/job-1-0-2026_Test.xlsx');
  assert.deepEqual(await readFile(result.abs), body);
});

test('rejects oversized workbooks before reading the response body', async () => {
  const fetchImpl = async () => new Response(Buffer.from('unused'), {
    status: 200,
    headers: { 'content-length': '101' },
  });
  const result = await downloadWorkbookAttachment({
    att: { filename: 'large.xlsx', url: 'https://example.test/file' },
    workspaceRoot: '/tmp',
    jobId: 'job-2',
    serial: 0,
    fetchImpl,
    maxBytes: 100,
  });

  assert.deepEqual(result, { ok: false, reason: 'too-large' });
});
