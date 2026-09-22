---
name: gmail-sa
description: Google Workspace service-account + domain-wide delegation for Gmail, Calendar, Docs, and Sheets (impersonated user via env vars GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY/GOOGLE_IMPERSONATED_USER). No local token files.
---

# gmail-sa (Google Workspace Service Account + Domain-Wide Delegation)

Use Google APIs **as an impersonated user** (domain-wide delegation), with credentials provided via environment variables.

## Keywords / triggers
Gmail, Google Calendar, meeting invite, calendar event, Docs, Google Docs, Sheets, Google Sheets.

## Intended use (current helper coverage)
- Gmail: **read inbox**, **fetch a message**, **send email** from the impersonated mailbox.

## Also compatible (same auth; helper scripts may need to be extended)
If the Workspace admin has approved the scopes and APIs are enabled for the service account, the *same impersonation setup* can also be used for:
- **Google Drive**: list/search files & folders, enumerate folder contents (shared-with-user access)
- **Google Calendar**: create events / meeting invites, list calendars/events
- **Google Docs**: create/read/update docs
- **Google Sheets**: read/write spreadsheets

## Required environment variables

- `GOOGLE_CLIENT_EMAIL` — service account client email
- `GOOGLE_PRIVATE_KEY` — service account private key (often stored with literal `\n`; the code normalizes it)
- `GOOGLE_IMPERSONATED_USER` — the mailbox to impersonate (e.g. `edge@thegig.agency`)

## Google admin prerequisites (one-time)

In Google Workspace Admin:

1. Enable **Domain-wide delegation** for the service account.
2. Authorize the service account client ID with these scopes (adjust as needed):
   - Gmail:
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/gmail.send`
     - (Optional, only if you want label/archive/mark read later): `https://www.googleapis.com/auth/gmail.modify`
   - Drive (if listing/searching Drive and reading doc metadata/files):
     - `https://www.googleapis.com/auth/drive.readonly`
     - or narrower (metadata only): `https://www.googleapis.com/auth/drive.metadata.readonly`
   - Calendar (if creating meeting invites / events):
     - `https://www.googleapis.com/auth/calendar`
     - or narrower: `https://www.googleapis.com/auth/calendar.events`
   - Docs (if creating/updating docs):
     - `https://www.googleapis.com/auth/documents`
   - Sheets (if reading/writing sheets):
     - `https://www.googleapis.com/auth/spreadsheets`

## Dependencies

None. This skill uses a Node helper (`agent.mjs`) with **no external packages**.

## How Edge should use this skill

Run the helper script:

- List recent messages:
  ```bash
  node skills/gmail-sa/agent.mjs list --max 10
  ```

- Read a message by id:
  ```bash
  node skills/gmail-sa/agent.mjs read --id <MESSAGE_ID>
  ```

- Send an email:
  ```bash
  node skills/gmail-sa/agent.mjs send --to someone@example.com --subject "Hi" --body "Hello there"
  ```

### Calendar (meeting invites / events)

Create an event (optionally with attendees) in the impersonated user's calendar:

```bash
node skills/gmail-sa/agent.mjs calendar-create-event \
  --summary "Intro call" \
  --start "2026-04-05T15:00:00-07:00" \
  --end "2026-04-05T15:30:00-07:00" \
  --attendees "person1@example.com,person2@example.com" \
  --time-zone "America/Los_Angeles" \
  --send-updates all
```

List upcoming events:

```bash
node skills/gmail-sa/agent.mjs calendar-list-events --max 10 --time-min "2026-04-01T00:00:00Z"
```

### Docs

Create a document:

```bash
node skills/gmail-sa/agent.mjs docs-create --title "Notes"
```

Insert text into a doc:

```bash
node skills/gmail-sa/agent.mjs docs-insert-text --document-id <DOC_ID> --text "Hello" --index 1
```

### Sheets

Create a spreadsheet:

```bash
node skills/gmail-sa/agent.mjs sheets-create --title "Tracker"
```

Update a range (values must be JSON):

```bash
node skills/gmail-sa/agent.mjs sheets-update \
  --spreadsheet-id <SHEET_ID> \
  --range "Sheet1!A1:B2" \
  --values '[["A1","B1"],["A2","B2"]]'
```

## Safety notes

- Do not print or log any env var values.
- If `GOOGLE_PRIVATE_KEY` is malformed, it’s usually newline escaping; ensure it contains the full PEM including `-----BEGIN PRIVATE KEY-----`.
