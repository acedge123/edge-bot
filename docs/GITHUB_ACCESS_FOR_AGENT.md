# GitHub Access for Edge Bot

This is the canonical, non-secret contract for GitHub authentication in the
hosted Edge Bot. The deployed copy lives at
`/app/.openclaw/workspace/docs/GITHUB_ACCESS_FOR_AGENT.md`.

## Repository-owner routing

| Repository owner | Primary environment variable | Fallback | Intended identity |
|---|---|---|---|
| `acedge123` | `EDGE_BOT_PERSONAL` | None | Alan's approved personal-repository identity |
| `The-Gig-Agency` | `EDGE_BOT_TOKEN` | `TGA_GH_TOKEN` | TGA organization bot identity |

The owner comparison is case-insensitive. A repository under any other owner
must name an approved credential explicitly with `--token-env NAME`. Do not
fall back to a global `GITHUB_TOKEN`, personal token, or organization token.

## Canonical helper

Use `workspace/scripts/github-via-owner.mjs` for authenticated repository
operations:

```bash
node workspace/scripts/github-via-owner.mjs check acedge123/portfolio-progress-pilot
node workspace/scripts/github-via-owner.mjs check The-Gig-Agency/the-mom-walk-flutter
node workspace/scripts/github-via-owner.mjs clone OWNER/REPO /path/to/destination
node workspace/scripts/github-via-owner.mjs fetch OWNER/REPO /path/to/checkout
node workspace/scripts/github-via-owner.mjs pull OWNER/REPO /path/to/checkout
node workspace/scripts/github-via-owner.mjs push OWNER/REPO /path/to/checkout
```

For a separately approved owner-specific credential:

```bash
node workspace/scripts/github-via-owner.mjs check mb2470/SDR \
  --token-env GITHUB_SDR_TOKEN
```

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

- do not send the user to OpenClaw Settings before running the helper's
  non-mutating `check` command;
- do not treat a native identity failure as proof that GitHub is unavailable;
- do not use the bundled `github` skill when the workspace skill exists;
- do not require `gh`; it is not installed in the hosted image.

## Permissions and mutations

The selected token still needs access to the target repository. Read checks do
not prove write permission. Only perform pushes, comments, reviews, merges, or
other mutations when the user requested them.

If GitHub returns `401`, the selected credential is invalid or expired. If it
returns `403`, the credential may be valid but lack repository permission or
required scope. A private repository commonly returns `404` when the selected
identity cannot see it.

Report only the repository, selected environment-variable name, operation, and
status. Never print the credential, request headers, child process environment,
or a URL containing authentication.

## Upgrade protection

The following files form one wrapper and must be reviewed together:

- `workspace/skills/github/SKILL.md`
- `workspace/scripts/github-via-owner.mjs`
- `workspace/scripts/github-askpass.sh`
- `workspace/scripts/github-via-owner.test.mjs`
- `workspace/docs/GITHUB_ACCESS_FOR_AGENT.md`
- `deploy/TGA_OPENCLAW_WRAPPERS.md`
- `deploy/verify-cost-controls.sh`

An OpenClaw upgrade must not replace the workspace skill with the bundled
`gh`-oriented skill. Run the repository test suite and both live read-only
owner checks before approving an upgrade.
