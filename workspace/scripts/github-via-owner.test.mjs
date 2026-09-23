import test from 'node:test';
import assert from 'node:assert/strict';
import {
  githubApiHeaders,
  parseGitHubRepository,
  selectGitHubCredential,
} from './github-via-owner.mjs';

test('normalizes GitHub repository names and URLs', () => {
  assert.deepEqual(parseGitHubRepository('https://github.com/acedge123/example.git'), {
    owner: 'acedge123',
    repo: 'example',
    slug: 'acedge123/example',
  });
  assert.equal(
    parseGitHubRepository('https://x-access-token:placeholder@github.com/The-Gig-Agency/example.git').slug,
    'The-Gig-Agency/example',
  );
});

test('routes acedge123 repositories only to EDGE_BOT_PERSONAL', () => {
  const selected = selectGitHubCredential('acedge123/example', {
    EDGE_BOT_PERSONAL: 'personal-token',
    EDGE_BOT_TOKEN: 'org-token',
  });
  assert.equal(selected.tokenEnv, 'EDGE_BOT_PERSONAL');
  assert.equal(selected.token, 'personal-token');
});

test('routes The-Gig-Agency repositories to EDGE_BOT_TOKEN', () => {
  const selected = selectGitHubCredential('The-Gig-Agency/example', {
    EDGE_BOT_PERSONAL: 'personal-token',
    EDGE_BOT_TOKEN: 'org-token',
    TGA_GH_TOKEN: 'legacy-token',
  });
  assert.equal(selected.tokenEnv, 'EDGE_BOT_TOKEN');
  assert.equal(selected.token, 'org-token');
});

test('uses TGA_GH_TOKEN only as the organization fallback', () => {
  const selected = selectGitHubCredential('the-gig-agency/example', {
    TGA_GH_TOKEN: 'legacy-token',
  });
  assert.equal(selected.tokenEnv, 'TGA_GH_TOKEN');
  assert.throws(
    () => selectGitHubCredential('acedge123/example', { TGA_GH_TOKEN: 'legacy-token' }),
    /EDGE_BOT_PERSONAL/,
  );
});

test('requires an explicit credential route for other owners', () => {
  assert.throws(
    () => selectGitHubCredential('mb2470/SDR', { GITHUB_SDR_TOKEN: 'sdr-token' }),
    /--token-env/,
  );
  const selected = selectGitHubCredential(
    'mb2470/SDR',
    { GITHUB_SDR_TOKEN: 'sdr-token' },
    'GITHUB_SDR_TOKEN',
  );
  assert.equal(selected.tokenEnv, 'GITHUB_SDR_TOKEN');
});

test('builds GitHub API headers without changing the token', () => {
  assert.equal(githubApiHeaders('secret').Authorization, 'Bearer secret');
});
