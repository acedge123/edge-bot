#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ASKPASS_PATH = resolve(SCRIPT_DIR, 'github-askpass.sh');

export function parseGitHubRepository(value) {
  const input = String(value || '').trim()
    .replace(/^https?:\/\/(?:[^@/]+@)?github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/\.git\/?$/i, '')
    .replace(/^\/+|\/+$/g, '');
  const match = input.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match) throw new Error('Repository must be an owner/repo name or GitHub URL');
  return { owner: match[1], repo: match[2], slug: `${match[1]}/${match[2]}` };
}

export function selectGitHubCredential(repository, env = process.env, explicitTokenEnv = '') {
  const { owner, slug } = parseGitHubRepository(repository);
  const ownerKey = owner.toLowerCase();
  const requested = String(explicitTokenEnv || '').trim();

  let candidates;
  if (requested) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(requested)) {
      throw new Error('Explicit token environment name is invalid');
    }
    candidates = [requested];
  } else if (ownerKey === 'acedge123') {
    candidates = ['EDGE_BOT_PERSONAL'];
  } else if (ownerKey === 'the-gig-agency') {
    candidates = ['EDGE_BOT_TOKEN', 'TGA_GH_TOKEN'];
  } else {
    throw new Error(`No approved GitHub credential route for ${slug}; pass --token-env NAME`);
  }

  const tokenEnv = candidates.find((name) => String(env[name] || '').trim());
  if (!tokenEnv) {
    throw new Error(`GitHub credential is unavailable on this execution surface; expected ${candidates.join(' or ')}`);
  }
  return { token: String(env[tokenEnv]).trim(), tokenEnv, slug };
}

export function githubApiHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'tga-edge-bot',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function parseCli(args) {
  const positional = [];
  let tokenEnv = '';
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--token-env') {
      tokenEnv = args[index + 1] || '';
      index += 1;
    } else {
      positional.push(args[index]);
    }
  }
  return { positional, tokenEnv };
}

function gitEnvironment(token) {
  return {
    ...process.env,
    GIT_ASKPASS: ASKPASS_PATH,
    GIT_ASKPASS_REQUIRE: 'force',
    GIT_TERMINAL_PROMPT: '0',
    TGA_GITHUB_ROUTED_TOKEN: token,
  };
}

function runGit(args, { cwd, token }) {
  const result = spawnSync('git', ['-c', 'credential.helper=', ...args], {
    cwd,
    env: gitEnvironment(token),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function assertMatchingOrigin(cwd, slug) {
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`Cannot read origin remote in ${cwd}`);
  const origin = parseGitHubRepository(result.stdout);
  if (origin.slug.toLowerCase() !== slug.toLowerCase()) {
    throw new Error(`Checkout origin ${origin.slug} does not match routed repository ${slug}`);
  }
}

async function checkAccess(slug, token, tokenEnv) {
  const response = await fetch(`https://api.github.com/repos/${slug}`, {
    headers: githubApiHeaders(token),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub access check failed for ${slug} using ${tokenEnv}: HTTP ${response.status}`);
  }
  const body = await response.json();
  console.log(JSON.stringify({
    repository: body.full_name,
    private: Boolean(body.private),
    default_branch: body.default_branch,
    credential_env: tokenEnv,
    access: 'confirmed',
  }, null, 2));
}

function usage() {
  console.log(`Usage:
  github-via-owner.mjs check owner/repo [--token-env NAME]
  github-via-owner.mjs clone owner/repo destination [--token-env NAME]
  github-via-owner.mjs fetch owner/repo checkout [--token-env NAME]
  github-via-owner.mjs pull owner/repo checkout [--token-env NAME]
  github-via-owner.mjs push owner/repo checkout [refspec] [--token-env NAME]

Credential routing:
  acedge123/*       -> EDGE_BOT_PERSONAL
  The-Gig-Agency/*  -> EDGE_BOT_TOKEN (TGA_GH_TOKEN legacy fallback)`);
}

async function main() {
  const { positional, tokenEnv: explicitTokenEnv } = parseCli(process.argv.slice(2));
  const [command, repository, ...rest] = positional;
  if (!command || command === 'help' || command === '--help') {
    usage();
    return;
  }
  if (!repository) throw new Error('Repository is required');

  const { token, tokenEnv, slug } = selectGitHubCredential(repository, process.env, explicitTokenEnv);
  if (command === 'check') {
    await checkAccess(slug, token, tokenEnv);
    return;
  }
  if (command === 'clone') {
    if (rest.length !== 1) throw new Error('clone requires one destination path');
    process.exitCode = runGit(['clone', `https://github.com/${slug}.git`, rest[0]], { token });
    return;
  }
  if (command === 'fetch' || command === 'pull') {
    if (rest.length !== 1) throw new Error(`${command} requires one checkout path`);
    assertMatchingOrigin(rest[0], slug);
    process.exitCode = runGit([command, 'origin'], { cwd: rest[0], token });
    return;
  }
  if (command === 'push') {
    const [checkout, refspec] = rest;
    if (!checkout || rest.length > 2) throw new Error('push requires checkout and optional refspec');
    assertMatchingOrigin(checkout, slug);
    const gitArgs = ['push', 'origin'];
    if (refspec) gitArgs.push(refspec);
    process.exitCode = runGit(gitArgs, { cwd: checkout, token });
    return;
  }
  throw new Error(`Unsupported command: ${command}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[github-via-owner] ${error.message}`);
    process.exitCode = 1;
  });
}
