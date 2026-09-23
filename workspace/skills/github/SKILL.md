---
name: github
description: "Use TGA's repository-owner-aware GitHub helper for authenticated repository checks and git operations."
---

# GitHub

This workspace skill overrides OpenClaw's bundled GitHub integration. TGA
GitHub access is provided by scoped Railway environment variables, not by an
OpenClaw account connection.

## Required helper

Use:

```bash
node /app/.openclaw/workspace/scripts/github-via-owner.mjs <command> <owner/repo> [arguments]
```

Run `help` for the supported commands. Do not recreate authentication with a
token-bearing URL, `gh auth login`, or an OpenClaw native GitHub tool.

## Credential routing

The repository owner determines the credential:

| Repository owner | Credential |
|---|---|
| `acedge123` | `EDGE_BOT_PERSONAL` |
| `The-Gig-Agency` | `EDGE_BOT_TOKEN` |

`TGA_GH_TOKEN` is a legacy fallback only when `EDGE_BOT_TOKEN` is absent.
Other owners require an explicitly approved `--token-env NAME`; never guess or
silently use one of the two credentials above.

## Operating rules

1. For a request to check access, run `check`; do not inspect OpenClaw account
   connections first.
2. Before reading instructions from an existing checkout, run the helper's
   `pull` command and confirm the checkout is current. A repository existing on
   the persistent volume does not mean it is up to date.
3. Treat `github_identity_status` and Settings -> Agents -> Tools as
   non-authoritative for these env-backed credentials.
4. Use the helper for `clone`, `fetch`, `pull`, and `push`. It authenticates
   through HTTPS askpass without placing a token in the URL or command line.
5. Never print token values, authenticated URLs, request headers, or child
   process environments.
6. Do not push, comment, merge, or otherwise mutate GitHub unless the user
   requested that action.
7. If access fails, report the repository, selected environment-variable name,
   HTTP/git status, and likely scope or identity issue. Never report a token as
   globally missing based on a different execution surface.
8. Prefer GitHub's REST API for issue, PR, review, and comment operations when
   a reviewed helper supports the exact operation. `gh` is not installed in
   the hosted image and is not the authentication source of truth.

## Examples

```bash
# Personal repository: selects EDGE_BOT_PERSONAL
node /app/.openclaw/workspace/scripts/github-via-owner.mjs check \
  acedge123/portfolio-progress-pilot

# TGA repository: selects EDGE_BOT_TOKEN
node /app/.openclaw/workspace/scripts/github-via-owner.mjs clone \
  The-Gig-Agency/the-mom-walk-flutter /app/.openclaw/workspace/repos/the-mom-walk-flutter

# Existing checkout
node /app/.openclaw/workspace/scripts/github-via-owner.mjs fetch \
  The-Gig-Agency/the-mom-walk-flutter /app/.openclaw/workspace/repos/the-mom-walk-flutter
```

Read `/app/.openclaw/workspace/docs/GITHUB_ACCESS_FOR_AGENT.md` for the full
contract and troubleshooting guidance.
