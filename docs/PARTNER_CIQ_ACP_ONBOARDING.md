# Partner onboarding — CIQ automations via our ACP

Use this to point a **partner whose agent** wants to call **our** Control Plane API to get access to **CIQ automations** (campaigns, lists, publishers, etc.).

---

## What to give the partner

| What | Value |
|------|--------|
| **Endpoint** | `POST https://<YOUR_SUPABASE_PROJECT>.supabase.co/functions/v1/manage` |
| **Auth** | Header `X-API-Key: <platform_key>` — **you issue** a platform/tenant API key for them (same kind you use, e.g. from your signup/onboarding, often `ciq_xxx`-style). |
| **Docs** | This doc + the **action catalog** (see below). |

Replace `<YOUR_SUPABASE_PROJECT>` with your real Supabase project reference (e.g. `yczomejrvihbmydyraqg`). Do **not** give partners your own platform key; issue one per partner/tenant.

---

## How their agent calls it

- **Method:** `POST`
- **Headers:** `Content-Type: application/json`, `X-API-Key: <platform_key>`
- **Body:** JSON with `action`, optional `params`, optional `brand_id` or `brand_slug`, optional `dry_run`.

Example (list campaigns for a brand):

```json
{
  "action": "domain.ciq.campaigns.list",
  "brand_slug": "The Mom Walk Collective",
  "params": { "page": 1, "size": 10 }
}
```

Discovery (no brand needed):

```json
{ "action": "meta.brands.list" }
```

```json
{ "action": "meta.actions" }
```

---

## Action catalog and workflow

- **Full list of actions and param schemas:** `workspace/docs/CIQ_MANAGE_API.md` (you can export a copy or link them to a published version).
- **Workflow:** 1) `meta.brands.list` → 2) choose brand → 3) call `domain.ciq.*` actions with `brand_id` or `brand_slug`. Prefer `brand_id` after discovery.

---

## “Using our MCP”

We expose an **HTTP API** (the `/manage` endpoint above), not an MCP server in this repo.

- **If their agent can call HTTP:** They use the endpoint + platform key directly (e.g. a “call ACP” tool that POSTs to your URL with their key). No MCP required.
- **If they want MCP tools** (e.g. in Cursor/Claude): You (or they) can add a thin **MCP server** that wraps this API (env: `ACP_BASE_URL`, `ACP_API_KEY`), exposing tools like `ciq_list_brands`, `ciq_list_campaigns`, etc. Point them to that server’s config (e.g. `command` + `args` + env with your base URL and the key you issued). We don’t ship that MCP server in this repo today.

---

## Summary

| Question | Answer |
|----------|--------|
| Where do they call? | `POST https://<YOUR_SUPABASE_PROJECT>.supabase.co/functions/v1/manage` |
| What auth? | `X-API-Key: <platform_key>` (you issue per partner) |
| What to point them at? | This doc + `workspace/docs/CIQ_MANAGE_API.md` (or a published copy) |
| MCP? | API is HTTP; MCP wrapper is optional and not in this repo |
