---
name: youtrack
description: |
  Interact with YouTrack (JetBrains issue tracker) via the REST API: list, create, update, and delete issues; read and add comments; search with YouTrack query syntax.
  Use when the user asks to work with YouTrack issues, create bugs/tasks, search the tracker, or add comments.
metadata: {"clawdbot":{"requires":{"env":["YOUTRACK_BASE_URL","YOUTRACK_TOKEN"]}}}
---

# YouTrack REST API Skill

Use the [YouTrack REST API](https://www.jetbrains.com/help/youtrack/devportal/youtrack-rest-api.html) to work with issues and comments. The Edge bot has no connected browser; all actions are via HTTP using this skill.

**Env (required):** `YOUTRACK_BASE_URL`, `YOUTRACK_TOKEN`

- **YOUTRACK_BASE_URL** — Base URL of your YouTrack instance **without** `/api`. Examples:
  - Cloud: `https://your-org.youtrack.cloud`
  - Server: `https://youtrack.example.com` or `https://www.example.com/youtrack`
- **YOUTRACK_TOKEN** — Permanent token for API auth. Create under YouTrack → Profile → Account Security → Permanent tokens. Use as Bearer token.

**Auth for every request:**
- `Authorization: Bearer $YOUTRACK_TOKEN`
- `Accept: application/json`
- `Content-Type: application/json` for POST/PUT

**API base:** `{YOUTRACK_BASE_URL}/api` (e.g. `https://your-org.youtrack.cloud/api`).

---

## 1. Issues — list (GET)

Get issues matching a query.

**Request:**
```http
GET {YOUTRACK_BASE_URL}/api/issues?query={query}&fields={fields}&$top={n}&$skip={n}
```

- **query** (optional) — YouTrack search query. Examples:
  - `for: me #Unresolved` — my unresolved issues
  - `project: {Sample Project}` — issues in project "Sample Project"
  - `for: john.doe #Unresolved summary` — assignee john.doe, unresolved, word "summary"
  - Empty = all issues (subject to export limit).
- **fields** — Comma-separated issue attributes to return. If omitted, only `entityID` is returned. Useful: `id,idReadable,summary,description,project(name),reporter(login),customFields(name,value(name))`.
- **$top** — Max number of issues (default/server limit applies if omitted).
- **$skip** — Number to skip (pagination).

**Example (curl):**
```bash
curl -sS -X GET "${YOUTRACK_BASE_URL}/api/issues?query=for:%20me%20%23Unresolved&fields=id,idReadable,summary,project(name)&\$top=20" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer ${YOUTRACK_TOKEN}"
```

---

## 2. Issues — create (POST)

Create a new issue.

**Request:**
```http
POST {YOUTRACK_BASE_URL}/api/issues?fields={fields}
Content-Type: application/json
```

**Body (required: summary, project):**
```json
{
  "summary": "Issue title",
  "description": "Optional description.",
  "project": { "id": "0-0" },
  "customFields": [
    { "name": "Priority", "value": { "name": "Critical" }, "$type": "SingleEnumIssueCustomField" },
    { "name": "Type", "value": { "name": "Bug" }, "$type": "SingleEnumIssueCustomField" }
  ]
}
```

- **project.id** — Use project database ID (e.g. from `/api/admin/projects` or from an existing issue’s `project(id)`). Required.
- **customFields** — Optional. Field names and value shapes depend on your YouTrack project. Use `name` and `value(name)` or `value(id)` as in the API.

**Example:**
```bash
curl -sS -X POST "${YOUTRACK_BASE_URL}/api/issues?fields=idReadable" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer ${YOUTRACK_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"summary":"Houston!","description":"We have a problem!","project":{"id":"0-0"}}'
```

---

## 3. Single issue — get (GET)

**Request:**
```http
GET {YOUTRACK_BASE_URL}/api/issues/{issueID}?fields={fields}
```

- **issueID** — Either human-readable ID (e.g. `SP-38`) or database ID (e.g. `2-42`).

**Example:**
```bash
curl -sS -X GET "${YOUTRACK_BASE_URL}/api/issues/SP-38?fields=id,idReadable,summary,description,project(name),reporter(login),customFields(name,value(name)))" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer ${YOUTRACK_TOKEN}"
```

---

## 4. Single issue — update (POST)

**Request:**
```http
POST {YOUTRACK_BASE_URL}/api/issues/{issueID}?fields={fields}
Content-Type: application/json
```

**Body (send only fields you want to change):**
```json
{
  "summary": "New summary",
  "description": "Updated description.",
  "customFields": [
    { "name": "Priority", "value": { "name": "Major" }, "id": "92-1", "$type": "SingleEnumIssueCustomField" },
    { "name": "State", "value": { "name": "In Progress" }, "id": "92-3", "$type": "StateIssueCustomField" }
  ]
}
```

- For custom fields, include the field **id** (from the issue’s current `customFields`) when updating.

---

## 5. Single issue — delete (DELETE)

**Request:**
```http
DELETE {YOUTRACK_BASE_URL}/api/issues/{issueID}
```

- Irreversible. Requires Delete Issue permission.

---

## 6. Comments — list (GET)

**Request:**
```http
GET {YOUTRACK_BASE_URL}/api/issues/{issueID}/comments?fields={fields}&$top={n}&$skip={n}
```

**Example fields:** `id,text,author(login,name),created,updated`.

---

## 7. Comments — add (POST)

**Request:**
```http
POST {YOUTRACK_BASE_URL}/api/issues/{issueID}/comments?fields={fields}
Content-Type: application/json
```

**Body:**
```json
{
  "text": "Comment text. Supports wiki/markdown."
}
```

- Optional: `visibility` for limited visibility (see YouTrack API docs).

---

## 8. Other useful endpoints

- **Current user:** `GET {YOUTRACK_BASE_URL}/api/users/me` — profile of the authenticated user.
- **Projects (admin):** `GET {YOUTRACK_BASE_URL}/api/admin/projects` — list projects (admin). Use to get `project.id` for creating issues.
- **Issue sub-resources:** For an issue you can also use:
  - `/api/issues/{issueID}/links` — issue links
  - `/api/issues/{issueID}/attachments` — attachments
  - `/api/issues/{issueID}/activities` — activity stream
  - `/api/issues/{issueID}/tags` — tags
  - `/api/issues/{issueID}/sprints` — sprints (if agile)
  - `/api/issues/{issueID}/timeTracking` — time tracking

---

## 9. Query and fields reference

- **Query syntax:** Same as YouTrack search in the UI. Use `query` parameter; URL-encode spaces and special characters (`#` → `%23`, `{` → `%7B`, `}` → `%7D`). See [Query Syntax](https://www.jetbrains.com/help/youtrack/devportal/api-query-syntax.html) and [Search Query Reference](https://www.jetbrains.com/help/youtrack/cloud/search-and-command-attributes.html).
- **fields:** Request only the attributes you need. Nested objects use parentheses: e.g. `reporter(login,name)`, `project(name)`, `customFields(name,value(name))`.
- **Pagination:** Many list endpoints return at most 42 items by default. Use `$top` and `$skip` for more.

---

## 10. Rules

- Always send `Accept: application/json` and `Authorization: Bearer $YOUTRACK_TOKEN`.
- For POST/PUT, send `Content-Type: application/json` and valid JSON body.
- Use `idReadable` (e.g. `SP-38`) in messages to users; use `id` (e.g. `2-42`) or `idReadable` in API paths.
- When creating issues, resolve project by name via `/api/admin/projects` or from context if the user specified a project.
