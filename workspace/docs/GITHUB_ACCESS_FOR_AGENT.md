# GitHub Access for Edge Bot

This is the canonical, non-secret contract for GitHub authentication in the
hosted Edge Bot. The source-controlled copy also lives at
`docs/GITHUB_ACCESS_FOR_AGENT.md`.

## Repository-owner routing

| Repository owner | Primary environment variable | Fallback | Intended identity |
|---|---|---|---|
| `acedge123` | `EDGE_BOT_PERSONAL` | None | Alan's approved personal-repository identity |
| `The-Gig-Agency` | `EDGE_BOT_TOKEN` | `TGA_GH_TOKEN` | TGA organization bot identity |

The owner comparison is case-insensitive. A repository under any other owner
must name an approved credential explicitly with `--token-env NAME`. Do not
fall back to a global `GITHUB_TOKEN`, personal token, or organization token.

## Canonical helper

Use `/app/.openclaw/workspace/scripts/github-via-owner.mjs` for authenticated
repository operations:

```bash
node /app/.openclaw/workspace/scripts/github-via-owner.mjs check \
  acedge123/portfolio-progress-pilot
node /app/.openclaw/workspace/scripts/github-via-owner.mjs check \
  The-Gig-Agency/the-mom-walk-flutter
```

The helper supports `check`, `clone`, `fetch`, `pull`, and `push`. Run `help`
for exact arguments. For another approved owner, pass `--token-env NAME`.

The helper:

- selects credentials deterministically from the repository owner;
- uses GitHub's REST API for access checks;
- uses HTTPS askpass for git operations;
- keeps credentials out of remote URLs, command arguments, and output;
- verifies an existing checkout's `origin` matches the routed repository before
  fetch, pull, or push.

## Native OpenClaw GitHub behavior

OpenClaw's `github_identity_status` and Settings -> Agents -> Tools inspect
OpenClaw account connections. They do not prove whether Railway's scoped TGA
environment credentials are configured or authorized.

For TGA-hosted GitHub work:

- run the helper's non-mutating `check` command before declaring access absent;
- do not treat a native identity failure as proof that GitHub is unavailable;
- do not use the bundled `github` skill when this workspace skill exists;
- do not require `gh`; it is not installed in the hosted image.

## Permissions and mutations

Read checks do not prove write permission. Only perform pushes, comments,
reviews, merges, or other mutations when the user requested them.

Report only the repository, selected environment-variable name, operation, and
status. Never print the credential, request headers, child process environment,
or a URL containing authentication.

## Upgrade protection

The GitHub workspace skill, owner-routing helper, askpass script, tests, this
document, wrapper inventory, and deploy verifier form one protected wrapper.
Run the repository test suite and both live read-only owner checks before
approving an OpenClaw upgrade.
