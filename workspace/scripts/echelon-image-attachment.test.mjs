import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { downloadImageAttachment, prepareImageAttachment } from './echelon-image-attachment.mjs';
import { loadImageFile, executeAction } from '../../tools/brand-connect-campaigns.mjs';

const edgeUrl = 'https://example.supabase.co/functions/v1';
const url = 'https://example.supabase.co/storage/v1/object/public/agent-attachments/user/photo.png';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0S8AAAAASUVORK5CYII=', 'base64');
const att = { type: 'image', name: 'photo.png', url };

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'echelon-image-test-'));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test('UI image stays multimodal and gains a usable path for image-only campaign PATCH', async () => {
  await fixture(async workspaceRoot => {
    const prepared = await prepareImageAttachment({ att, workspaceRoot, edgeUrl, fetchImpl: async (target, init) => {
      assert.equal(target, url); assert.equal(init.redirect, 'manual'); assert.equal(init.method, 'GET');
      return new Response(png);
    } });
    assert.equal(prepared.saved.ok, true);
    assert.deepEqual(await readFile(prepared.saved.abs), png);
    assert.deepEqual(prepared.content[0], { type: 'image_url', image_url: { url } });
    assert.ok(prepared.content[1].text.includes(prepared.saved.abs));
    assert.ok(prepared.content[1].text.includes('--image-file'));
    assert.equal((await loadImageFile(prepared.saved.abs)).image_content_type, 'image/png');
    const id = '11111111-1111-4111-8111-111111111111';
    let writes = 0;
    const result = await executeAction('requests.update', { id }, { confirmTarget: id, imageFile: prepared.saved.abs }, {
      env: { ENRICHMENT_AGENT_KEY: 'test-only' }, fetchImpl: async (target, init) => {
        if (init.method === 'GET') return new Response(JSON.stringify({ request: { id, stage: 'pre_campaign', interest_status: 'draft' } }));
        writes++;
        assert.equal(init.method, 'PATCH');
        assert.equal(JSON.parse(init.body).image_base64, png.toString('base64'));
        return new Response(JSON.stringify({ id, request: { id }, updated_fields: ['product_image_url'] }));
      },
    });
    assert.equal(result.ok, true); assert.equal(writes, 1);
  });
});

test('safe generated filenames ignore traversal and extension in attachment names', async () => {
  await fixture(async workspaceRoot => {
    for (const bytes of [png, Buffer.from('ffd8ffe00000', 'hex'), Buffer.from('524946460400000057454250', 'hex')]) {
      const saved = await downloadImageAttachment({ att: { ...att, name: '../../evil.txt' }, workspaceRoot, edgeUrl,
        fetchImpl: async () => new Response(bytes) });
      assert.equal(saved.ok, true);
      assert.ok(saved.abs.startsWith(join(workspaceRoot, 'tmp', 'echelon-uploads') + '/'));
      assert.match(saved.rel, /^tmp\/echelon-uploads\/image-[a-f0-9-]+\.(png|jpg|webp)$/);
    }
  });
});

test('download allows only HTTPS Echelon image-bucket URLs and never follows redirects', async () => {
  for (const target of ['http://example.supabase.co/storage/v1/object/public/agent-attachments/x',
    'https://example.supabase.co.evil.test/storage/v1/object/public/agent-attachments/x',
    'https://localhost/image.png', 'file:///etc/passwd',
    'https://user:pass@example.supabase.co/storage/v1/object/public/agent-attachments/x',
    'https://example.supabase.co/storage/v1/object/public/other-bucket/x',
    'https://example.supabase.co/storage/v1/object/public/agent-attachments/../secrets/x']) {
    const result = await downloadImageAttachment({ att: { ...att, url: target }, workspaceRoot: '/tmp', edgeUrl,
      fetchImpl: () => assert.fail('Untrusted URLs must not be fetched') });
    assert.equal(result.reason, 'untrusted-image-url');
  }
  const result = await downloadImageAttachment({ att, workspaceRoot: '/tmp', edgeUrl,
    fetchImpl: async (target, init) => {
      assert.equal(init.redirect, 'manual');
      return new Response(null, { status: 302, headers: { location: 'http://localhost/private' } });
    } });
  assert.equal(result.reason, 'download-http-302');
});

test('oversized content length and streamed bodies are rejected and cancelled', async () => {
  for (const declared of [true, false]) {
    let cancelled = false;
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(png); },
      cancel() { cancelled = true; },
    });
    const result = await downloadImageAttachment({ att, workspaceRoot: '/tmp', edgeUrl, maxBytes: 8,
      fetchImpl: async () => new Response(stream, { headers: declared ? { 'content-length': String(png.length) } : {} }) });
    assert.equal(result.reason, 'too-large'); assert.equal(cancelled, true);
  }
});

test('invalid bytes, HTTP failure, timeout and storage failures get actionable failure content', async () => {
  await fixture(async workspaceRoot => {
    const cases = [
      [async () => new Response('<html>not an image</html>'), 'unsupported-or-invalid-image'],
      [async () => new Response(null, { status: 403 }), 'download-http-403'],
      [async () => { throw Object.assign(new Error('timeout'), { name: 'AbortError' }); }, 'timeout'],
    ];
    for (const [fetchImpl, reason] of cases) {
      const prepared = await prepareImageAttachment({ att, workspaceRoot, edgeUrl, fetchImpl });
      assert.equal(prepared.saved.ok, false); assert.equal(prepared.saved.reason, reason);
      assert.ok(prepared.content[1].text.includes(reason));
      assert.equal(prepared.content[0].image_url.url, url);
      assert.deepEqual(await readdir(workspaceRoot), []);
    }
    const result = await downloadImageAttachment({ att, workspaceRoot: '/dev/null', edgeUrl, fetchImpl: async () => new Response(png) });
    assert.equal(result.reason, 'download-or-save-failed');
  });
});
