#!/usr/bin/env node
/**
 * gmail-sa helper (no external deps)
 *
 * Uses Google service account + domain-wide delegation (JWT bearer flow).
 *
 * Env vars:
 *   GOOGLE_CLIENT_EMAIL
 *   GOOGLE_PRIVATE_KEY   (may contain literal \n)
 *   GOOGLE_IMPERSONATED_USER
 */

import crypto from 'node:crypto';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function makeJwt({ iss, sub, scope }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss,
    sub,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encHeader = b64url(JSON.stringify(header));
  const encPayload = b64url(JSON.stringify(payload));
  const signingInput = `${encHeader}.${encPayload}`;

  const privateKey = requireEnv('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const sig = signer.sign(privateKey);
  const encSig = b64url(sig);

  return `${signingInput}.${encSig}`;
}

async function getAccessToken(scope) {
  const iss = requireEnv('GOOGLE_CLIENT_EMAIL');
  const sub = requireEnv('GOOGLE_IMPERSONATED_USER');
  const assertion = makeJwt({ iss, sub, scope });

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(`Token error (${resp.status}): ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

async function googleFetch(baseUrl, path, { token, method = 'GET', query, jsonBody } = {}) {
  const url = new URL(path, baseUrl);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) {
        url.searchParams.delete(k);
        for (const item of v) url.searchParams.append(k, String(item));
      } else {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const resp = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(jsonBody ? { 'content-type': 'application/json' } : {}),
    },
    body: jsonBody ? JSON.stringify(jsonBody) : undefined,
  });

  const text = await resp.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!resp.ok) {
    throw new Error(`Google API error (${resp.status}): ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

async function gmailFetch(path, { token, method = 'GET', query, jsonBody } = {}) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) {
        url.searchParams.delete(k);
        for (const item of v) url.searchParams.append(k, String(item));
      } else {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const resp = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(jsonBody ? { 'content-type': 'application/json' } : {}),
    },
    body: jsonBody ? JSON.stringify(jsonBody) : undefined,
  });

  const text = await resp.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!resp.ok) {
    throw new Error(`Gmail API error (${resp.status}): ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

function splitCsv(s) {
  if (!s) return [];
  return String(s)
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
}

function decodeB64UrlToUtf8(s) {
  if (!s) return '';
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  return Buffer.from(b64 + pad, 'base64').toString('utf8');
}

function extractTextPlain(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeB64UrlToUtf8(payload.body.data);
  }
  const parts = payload.parts || [];
  for (const p of parts) {
    if (p.mimeType === 'text/plain' && p.body?.data) return decodeB64UrlToUtf8(p.body.data);
  }
  for (const p of parts) {
    const nested = extractTextPlain(p);
    if (nested) return nested;
  }
  return '';
}

function makeRawEmail({ to, subject, body, cc, bcc }) {
  const headers = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    bcc ? `Bcc: ${bcc}` : null,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
  ].filter(Boolean);

  const msg = `${headers.join('\r\n')}\r\n\r\n${body}\r\n`;
  return b64url(Buffer.from(msg, 'utf8'));
}

async function cmdList({ max = 10, query }) {
  const token = await getAccessToken('https://www.googleapis.com/auth/gmail.readonly');
  const data = await gmailFetch('messages', { token, query: { maxResults: max, q: query } });
  const msgs = data.messages || [];
  if (!msgs.length) {
    console.log('No messages found.');
    return;
  }

  for (const m of msgs) {
    const meta = await gmailFetch(`messages/${m.id}`, {
      token,
      query: {
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      },
    });
    const headers = Object.fromEntries((meta.payload?.headers || []).map(h => [h.name.toLowerCase(), h.value || '']));
    console.log(`id=${m.id}\n  date=${headers.date || ''}\n  from=${headers.from || ''}\n  subject=${headers.subject || ''}\n`);
  }
}

async function cmdRead({ id, maxChars = 8000 }) {
  const token = await getAccessToken('https://www.googleapis.com/auth/gmail.readonly');
  const msg = await gmailFetch(`messages/${id}`, { token, query: { format: 'full' } });
  const headers = Object.fromEntries((msg.payload?.headers || []).map(h => [h.name.toLowerCase(), h.value || '']));

  console.log(`id=${id}`);
  console.log(`date=${headers.date || ''}`);
  console.log(`from=${headers.from || ''}`);
  console.log(`to=${headers.to || ''}`);
  console.log(`subject=${headers.subject || ''}`);
  console.log('\n---\n');

  let text = extractTextPlain(msg.payload);
  if (!text) {
    console.log('(No text/plain body found; message may be HTML-only or have attachments.)');
    return;
  }
  if (maxChars && text.length > maxChars) text = text.slice(0, maxChars) + '\n\n[truncated]';
  console.log(text);
}

async function cmdSend({ to, subject, body, cc, bcc }) {
  const token = await getAccessToken('https://www.googleapis.com/auth/gmail.send');
  const raw = makeRawEmail({ to, subject, body, cc, bcc });
  const sent = await gmailFetch('messages/send', { token, method: 'POST', jsonBody: { raw } });
  console.log(`Sent. id=${sent.id || ''}`);
}

async function cmdCalendarCreateEvent({
  calendarId = 'primary',
  summary,
  description,
  location,
  start,
  end,
  timeZone,
  attendees,
  sendUpdates = 'all',
}) {
  // start/end: RFC3339 timestamps (e.g. 2026-04-05T15:00:00-07:00 or ...Z)
  for (const k of ['summary', 'start', 'end']) if (!arguments[0][k]) throw new Error(`Missing --${k}`);

  const token = await getAccessToken('https://www.googleapis.com/auth/calendar.events');
  const body = {
    summary,
    ...(description ? { description } : {}),
    ...(location ? { location } : {}),
    start: { dateTime: start, ...(timeZone ? { timeZone } : {}) },
    end: { dateTime: end, ...(timeZone ? { timeZone } : {}) },
    ...(attendees ? { attendees: splitCsv(attendees).map(email => ({ email })) } : {}),
  };

  const data = await googleFetch(
    'https://www.googleapis.com/calendar/v3/',
    `calendars/${encodeURIComponent(calendarId)}/events`,
    {
      token,
      method: 'POST',
      query: { sendUpdates },
      jsonBody: body,
    }
  );

  console.log(`Created event. id=${data.id || ''}`);
  if (data.htmlLink) console.log(`link=${data.htmlLink}`);
}

async function cmdCalendarListEvents({ calendarId = 'primary', max = 10, timeMin, timeMax, query }) {
  const token = await getAccessToken('https://www.googleapis.com/auth/calendar.readonly');
  const data = await googleFetch(
    'https://www.googleapis.com/calendar/v3/',
    `calendars/${encodeURIComponent(calendarId)}/events`,
    {
      token,
      query: {
        maxResults: max,
        singleEvents: true,
        orderBy: 'startTime',
        ...(timeMin ? { timeMin } : {}),
        ...(timeMax ? { timeMax } : {}),
        ...(query ? { q: query } : {}),
      },
    }
  );
  const items = data.items || [];
  if (!items.length) {
    console.log('No events found.');
    return;
  }
  for (const ev of items) {
    const start = ev.start?.dateTime || ev.start?.date || '';
    const end = ev.end?.dateTime || ev.end?.date || '';
    console.log(`id=${ev.id || ''}\n  start=${start}\n  end=${end}\n  summary=${ev.summary || ''}\n  link=${ev.htmlLink || ''}\n`);
  }
}

async function cmdDocsCreate({ title }) {
  if (!title) throw new Error('Missing --title');
  const token = await getAccessToken('https://www.googleapis.com/auth/documents');
  const data = await googleFetch('https://docs.googleapis.com/v1/', 'documents', {
    token,
    method: 'POST',
    jsonBody: { title },
  });
  console.log(`Created doc. id=${data.documentId || ''}`);
  if (data.documentId) console.log(`link=https://docs.google.com/document/d/${data.documentId}/edit`);
}

async function cmdDocsInsertText({ documentId, text, index = 1 }) {
  if (!documentId) throw new Error('Missing --document-id');
  if (text === undefined) throw new Error('Missing --text');
  const token = await getAccessToken('https://www.googleapis.com/auth/documents');
  const data = await googleFetch(
    'https://docs.googleapis.com/v1/',
    `documents/${encodeURIComponent(documentId)}:batchUpdate`,
    {
      token,
      method: 'POST',
      jsonBody: {
        requests: [
          {
            insertText: {
              location: { index: Number(index) },
              text: String(text),
            },
          },
        ],
      },
    }
  );
  console.log(`Inserted text. replies=${(data.replies || []).length}`);
}

async function cmdSheetsCreate({ title }) {
  if (!title) throw new Error('Missing --title');
  const token = await getAccessToken('https://www.googleapis.com/auth/spreadsheets');
  const data = await googleFetch('https://sheets.googleapis.com/v4/', 'spreadsheets', {
    token,
    method: 'POST',
    jsonBody: { properties: { title } },
  });
  console.log(`Created sheet. id=${data.spreadsheetId || ''}`);
  if (data.spreadsheetId) console.log(`link=https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`);
}

async function cmdSheetsUpdate({ spreadsheetId, range, values, majorDimension = 'ROWS', valueInputOption = 'USER_ENTERED' }) {
  if (!spreadsheetId) throw new Error('Missing --spreadsheet-id');
  if (!range) throw new Error('Missing --range');
  if (values === undefined) throw new Error('Missing --values');

  // values format: JSON string, e.g. '[["A1","B1"],["A2","B2"]]'
  let parsed;
  try {
    parsed = JSON.parse(values);
  } catch {
    throw new Error('Invalid --values (must be JSON like [["a","b"],["c","d"]])');
  }

  const token = await getAccessToken('https://www.googleapis.com/auth/spreadsheets');
  const data = await googleFetch(
    'https://sheets.googleapis.com/v4/',
    `spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
    {
      token,
      method: 'PUT',
      query: { valueInputOption },
      jsonBody: {
        range,
        majorDimension,
        values: parsed,
      },
    }
  );
  console.log(`Updated sheet. updatedCells=${data.updatedCells ?? ''}`);
}

// ----------------------
// Drive helpers
// ----------------------

async function driveFetch(path, { token, method = 'GET', query, jsonBody } = {}) {
  return googleFetch('https://www.googleapis.com/drive/v3/', path, { token, method, query, jsonBody });
}

async function cmdDriveSearch({ query, max = 20 }) {
  if (!query) throw new Error('Missing --query');
  const token = await getAccessToken('https://www.googleapis.com/auth/drive.readonly');
  const data = await driveFetch('files', {
    token,
    query: {
      q: query,
      pageSize: max,
      fields: 'files(id,name,mimeType,modifiedTime,webViewLink,parents,driveId)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      corpora: 'user',
    },
  });
  const files = data.files || [];
  if (!files.length) {
    console.log('No files found.');
    return;
  }
  for (const f of files) {
    console.log(
      `id=${f.id}\n  name=${f.name || ''}\n  mimeType=${f.mimeType || ''}\n  modifiedTime=${f.modifiedTime || ''}\n  link=${f.webViewLink || ''}\n  parents=${(f.parents || []).join(',')}`
      + `\n  driveId=${f.driveId || ''}\n`
    );
  }
}

async function cmdDriveListChildren({ folderId, max = 200 }) {
  if (!folderId) throw new Error('Missing --folder-id');
  const token = await getAccessToken('https://www.googleapis.com/auth/drive.readonly');
  const q = `'${folderId}' in parents and trashed=false`;
  const data = await driveFetch('files', {
    token,
    query: {
      q,
      pageSize: max,
      orderBy: 'folder,name',
      fields: 'files(id,name,mimeType,modifiedTime,webViewLink,size)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    },
  });
  const files = data.files || [];
  if (!files.length) {
    console.log('No children found.');
    return;
  }
  for (const f of files) {
    console.log(
      `id=${f.id}\n  name=${f.name || ''}\n  mimeType=${f.mimeType || ''}\n  modifiedTime=${f.modifiedTime || ''}\n  size=${f.size || ''}\n  link=${f.webViewLink || ''}\n`
    );
  }
}

async function cmdDriveExport({ fileId, mimeType = 'text/plain', maxChars = 20000 }) {
  if (!fileId) throw new Error('Missing --file-id');
  const token = await getAccessToken('https://www.googleapis.com/auth/drive.readonly');
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export`);
  url.searchParams.set('mimeType', mimeType);
  const resp = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Drive export error (${resp.status}): ${text}`);
  let out = text;
  if (maxChars && out.length > maxChars) out = out.slice(0, maxChars) + '\n\n[truncated]';
  console.log(out);
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const v = argv[i + 1];
    args[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
    i++;
  }
  return { cmd, args };
}

async function main() {
  const { cmd, args } = parseArgs();
  const ok = [
    // Gmail
    'list',
    'read',
    'send',
    // Calendar
    'calendar-create-event',
    'calendar-list-events',
    // Docs
    'docs-create',
    'docs-insert-text',
    // Sheets
    'sheets-create',
    'sheets-update',

    // Drive
    'drive-search',
    'drive-list-children',
    'drive-export',
  ];

  if (!cmd || ok.indexOf(cmd) === -1) {
    console.error(
      'Usage:\n'
      + '  # Gmail\n'
      + '  node skills/gmail-sa/agent.mjs list --max 10 --query "..."\n'
      + '  node skills/gmail-sa/agent.mjs read --id <MESSAGE_ID> --max-chars 8000\n'
      + '  node skills/gmail-sa/agent.mjs send --to a@b.com --subject "Hi" --body "Text" [--cc ...] [--bcc ...]\n\n'
      + '  # Calendar\n'
      + '  node skills/gmail-sa/agent.mjs calendar-create-event --summary "..." --start "<RFC3339>" --end "<RFC3339>" [--attendees "a@b.com,b@c.com"] [--calendar-id primary] [--time-zone America/Los_Angeles] [--description "..."] [--location "..."] [--send-updates all]\n'
      + '  node skills/gmail-sa/agent.mjs calendar-list-events --max 10 [--calendar-id primary] [--time-min "<RFC3339>"] [--time-max "<RFC3339>"] [--query "..."]\n\n'
      + '  # Docs\n'
      + '  node skills/gmail-sa/agent.mjs docs-create --title "..."\n'
      + '  node skills/gmail-sa/agent.mjs docs-insert-text --document-id <DOC_ID> --text "..." [--index 1]\n\n'
      + '  # Sheets\n'
      + '  node skills/gmail-sa/agent.mjs sheets-create --title "..."\n'
      + '  node skills/gmail-sa/agent.mjs sheets-update --spreadsheet-id <SHEET_ID> --range "Sheet1!A1:B2" --values "[[\\"A1\\",\\"B1\\"],[\\"A2\\",\\"B2\\"]]"\n'
      + '\n'
      + '  # Drive\n'
      + '  node skills/gmail-sa/agent.mjs drive-search --query "name=\\"TGA Products\\" and mimeType=\\"application/vnd.google-apps.folder\\" and trashed=false" --max 20\n'
      + '  node skills/gmail-sa/agent.mjs drive-list-children --folder-id <FOLDER_ID> --max 200\n'
      + '  node skills/gmail-sa/agent.mjs drive-export --file-id <FILE_ID> --mime-type text/plain --max-chars 20000\n'
    );
    process.exit(2);
  }

  if (cmd === 'list') return cmdList({ max: args.max ? Number(args.max) : 10, query: args.query });
  if (cmd === 'read') {
    if (!args.id) throw new Error('Missing --id');
    return cmdRead({ id: args.id, maxChars: args.maxChars ? Number(args.maxChars) : 8000 });
  }
  if (cmd === 'send') {
    for (const k of ['to', 'subject', 'body']) if (!args[k]) throw new Error(`Missing --${k}`);
    return cmdSend({ to: args.to, subject: args.subject, body: args.body, cc: args.cc, bcc: args.bcc });
  }

  if (cmd === 'calendar-create-event') {
    return cmdCalendarCreateEvent({
      calendarId: args.calendarId,
      summary: args.summary,
      description: args.description,
      location: args.location,
      start: args.start,
      end: args.end,
      timeZone: args.timeZone,
      attendees: args.attendees,
      sendUpdates: args.sendUpdates,
    });
  }

  if (cmd === 'calendar-list-events') {
    return cmdCalendarListEvents({
      calendarId: args.calendarId,
      max: args.max ? Number(args.max) : 10,
      timeMin: args.timeMin,
      timeMax: args.timeMax,
      query: args.query,
    });
  }

  if (cmd === 'docs-create') {
    return cmdDocsCreate({ title: args.title });
  }

  if (cmd === 'docs-insert-text') {
    return cmdDocsInsertText({
      documentId: args.documentId,
      text: args.text,
      index: args.index ? Number(args.index) : 1,
    });
  }

  if (cmd === 'sheets-create') {
    return cmdSheetsCreate({ title: args.title });
  }

  if (cmd === 'sheets-update') {
    return cmdSheetsUpdate({
      spreadsheetId: args.spreadsheetId,
      range: args.range,
      values: args.values,
      majorDimension: args.majorDimension,
      valueInputOption: args.valueInputOption,
    });
  }

  if (cmd === 'drive-search') {
    return cmdDriveSearch({ query: args.query, max: args.max ? Number(args.max) : 20 });
  }
  if (cmd === 'drive-list-children') {
    return cmdDriveListChildren({ folderId: args.folderId, max: args.max ? Number(args.max) : 200 });
  }
  if (cmd === 'drive-export') {
    return cmdDriveExport({ fileId: args.fileId, mimeType: args.mimeType, maxChars: args.maxChars ? Number(args.maxChars) : 20000 });
  }
}

main().catch((e) => {
  console.error(String(e?.message || e));
  process.exit(1);
});
