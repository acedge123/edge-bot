#!/usr/bin/env node
/**
 * Minimal Google Drive API helper using Service Account + Domain-Wide Delegation.
 * Uses env vars:
 *   GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_IMPERSONATED_USER
 *
 * Commands:
 *   node skills/gmail-sa/drive.mjs drives
 *   node skills/gmail-sa/drive.mjs shared [--pageSize 50]
 *   node skills/gmail-sa/drive.mjs children --folderId <ID|root> [--pageSize 50]
 *   node skills/gmail-sa/drive.mjs ls --driveId <ID> [--folderId <ID>] [--pageSize 50]
 *   node skills/gmail-sa/drive.mjs export --fileId <ID> --mime text/plain
 *   node skills/gmail-sa/drive.mjs meta --fileId <ID>
 */

import crypto from 'node:crypto';

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function normalizePrivateKey(key) {
  // Common pattern is literal \n in env vars
  return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function getAccessToken({ scope }) {
  const clientEmail = env('GOOGLE_CLIENT_EMAIL');
  const privateKey = normalizePrivateKey(env('GOOGLE_PRIVATE_KEY'));
  const subject = env('GOOGLE_IMPERSONATED_USER');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: clientEmail,
    sub: subject,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claimSet))}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  sign.end();
  const signature = sign.sign(privateKey);
  const assertion = `${unsigned}.${base64url(signature)}`;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${res.statusText}: ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

async function driveFetch(path, { token, searchParams } = {}) {
  const url = new URL(`https://www.googleapis.com/drive/v3/${path}`);
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Drive API error: ${res.status} ${res.statusText} @ ${url.toString()} :: ${text}`);
  }
  return res.json();
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (!val || val.startsWith('--')) args[key] = true;
      else {
        args[key] = val;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const cmd = args._[0];
  if (!cmd || ['drives', 'shared', 'children', 'ls', 'export', 'meta'].indexOf(cmd) === -1) {
    console.error('Usage: node skills/gmail-sa/drive.mjs <drives|shared|children|ls|export|meta> [--flags]');
    process.exit(2);
  }

  // Minimal scopes; adjust if you need more.
  const scope = [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
  ].join(' ');

  const token = await getAccessToken({ scope });

  if (cmd === 'drives') {
    const json = await driveFetch('drives', {
      token,
      searchParams: { pageSize: args.pageSize ?? 100 },
    });
    console.log(JSON.stringify(json, null, 2));
    return;
  }

  if (cmd === 'shared') {
    const pageSize = Number(args.pageSize ?? 50);
    // Items shared with the impersonated user (may include folders or shortcuts)
    const q = 'sharedWithMe = true and trashed = false';
    const json = await driveFetch('files', {
      token,
      searchParams: {
        q,
        pageSize,
        includeItemsFromAllDrives: 'true',
        supportsAllDrives: 'true',
        fields: 'files(id,name,mimeType,modifiedTime,owners,webViewLink,parents),nextPageToken',
      },
    });
    console.log(JSON.stringify(json, null, 2));
    return;
  }

  if (cmd === 'children') {
    const folderId = args.folderId ?? 'root';
    const pageSize = Number(args.pageSize ?? 50);
    const q = `'${folderId}' in parents and trashed = false`;
    const json = await driveFetch('files', {
      token,
      searchParams: {
        q,
        pageSize,
        includeItemsFromAllDrives: 'true',
        supportsAllDrives: 'true',
        fields: 'files(id,name,mimeType,modifiedTime,owners,webViewLink,parents,size),nextPageToken',
      },
    });
    console.log(JSON.stringify(json, null, 2));
    return;
  }

  if (cmd === 'ls') {
    const driveId = args.driveId;
    if (!driveId) throw new Error('Missing --driveId');
    const folderId = args.folderId ?? 'root';
    const pageSize = Number(args.pageSize ?? 50);

    // List children in folderId within a shared drive.
    const q = `'${folderId}' in parents and trashed = false`;
    const json = await driveFetch('files', {
      token,
      searchParams: {
        corpora: 'drive',
        driveId,
        includeItemsFromAllDrives: 'true',
        supportsAllDrives: 'true',
        q,
        fields: 'files(id,name,mimeType,modifiedTime,owners,webViewLink,parents),nextPageToken',
        pageSize,
      },
    });
    console.log(JSON.stringify(json, null, 2));
    return;
  }

  if (cmd === 'meta') {
    const fileId = args.fileId;
    if (!fileId) throw new Error('Missing --fileId');
    const json = await driveFetch(`files/${fileId}`, {
      token,
      searchParams: {
        supportsAllDrives: 'true',
        fields: '*',
      },
    });
    console.log(JSON.stringify(json, null, 2));
    return;
  }

  if (cmd === 'export') {
    const fileId = args.fileId;
    if (!fileId) throw new Error('Missing --fileId');
    const mime = args.mime ?? 'text/plain';

    const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}/export`);
    url.searchParams.set('mimeType', mime);

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: '*/*',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Export error: ${res.status} ${res.statusText} :: ${text}`);
    }
    const text = await res.text();
    process.stdout.write(text);
    return;
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
