import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('existing entrypoint seed/sync makes the real CLI runnable on a masked workspace without replacing memory', async () => {
  const sourceRoot = new URL('../', import.meta.url),
    entrypoint = await readFile(new URL('../deploy/entrypoint.sh', sourceRoot), 'utf8');
  const stop = entrypoint.indexOf('# The volume intentionally preserves');
  assert.ok(stop > 0);
  // Execute the real seeding/sync block, stopping before unrelated runtime startup,
  // memory migration, package installation or network access.
  const block = entrypoint.slice(0, stop);
  const files = [
    'scripts/agent-brain-router.mjs',
    'scripts/learning-http.mjs',
    'scripts/music-dna-learning.mjs',
    'skills/music-dna-learning/SKILL.md',
    'skills/music-dna-learning/approval.example.json',
    'skills/music-dna-learning/fixtures/batch.json',
  ];
  for (const existing of [false, true]) {
    const root = await mkdtemp(join(tmpdir(), 'ab51-sync-')),
      image = join(root, 'image'),
      mounted = join(root, 'volume'),
      baked = join(image, 'workspace.baked');
    for (const relative of files) {
      const target = join(baked, relative);
      await mkdir(join(target, '..'), { recursive: true });
      await copyFile(new URL(relative, sourceRoot), target);
    }
    await writeFile(join(baked, 'AGENTS.md'), 'fixture hosted policy\n');
    if (existing) {
      await mkdir(join(mounted, 'scripts'), { recursive: true });
      await writeFile(join(mounted, 'scripts/echelon-agent-worker.mjs'), 'fixture marker');
      await writeFile(join(mounted, 'MEMORY.md'), 'fixture durable user memory');
    }
    const script = join(root, 'sync.sh');
    await writeFile(script, block);
    const r = spawnSync('sh', [script], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, OPENCLAW_IMAGE_STATE_DIR: image, OPENCLAW_WORKSPACE: mounted },
    });
    assert.equal(r.status, 0, r.stderr);
    for (const relative of files)
      assert.deepEqual(
        await readFile(join(mounted, relative)),
        await readFile(join(baked, relative)),
      );
    if (existing)
      assert.equal(
        await readFile(join(mounted, 'MEMORY.md'), 'utf8'),
        'fixture durable user memory',
      );
    const cli = spawnSync(
      process.execPath,
      [
        join(mounted, 'scripts/music-dna-learning.mjs'),
        'fixture',
        '--output',
        join(root, 'review.json'),
        '--consult-brain',
      ],
      { encoding: 'utf8', env: { PATH: process.env.PATH } },
    );
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(JSON.parse(cli.stdout).receipts, 3);
  }
});
