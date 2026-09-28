---
name: github-pr-qa-review
description: |
  Review GitHub pull requests end-to-end using the gh CLI: fetch PR metadata and diffs, check CI status, run local QA (tests/lint/build), and produce a structured review (summary + risk areas + required fixes). Use when Alan asks to review a PR, do QA on a branch, check CI failures, or prepare a PR review comment without merging.
---

# GitHub PR QA Review

Use `gh` + local git to review PRs and perform QA before Alan approves/merges.

Also review the diff against the **Unified Architecture** standard in `skills/unified-architecture/SKILL.md`: passive presentation, layered execution, explicit DI, observability, centralized errors, design tokens, stable test hooks, and resilience-first behavior.

## Workflow (default)

### 0) Safety / scope

- Do **not** merge/approve unless explicitly asked.
- Prefer local branches/commits; pushing needs explicit go-ahead.
- **Approval constraint:** GitHub does not allow approving your *own* PR. If PR author == your GitHub identity, you can still (a) review/comment and (b) merge if the user explicitly requests and branch protection allows.

### 0.1) Tooling reality check (gh vs API)

Prefer `gh` when available.

If `gh` is not installed/authenticated, fall back to GitHub REST API using `TGA_GH_TOKEN` (or `GITHUB_TOKEN` if that is the configured org env):

- List PRs: `GET /repos/{owner}/{repo}/pulls`
- PR details: `GET /repos/{owner}/{repo}/pulls/{number}`
- PR files: `GET /repos/{owner}/{repo}/pulls/{number}/files`
- Merge: `PUT /repos/{owner}/{repo}/pulls/{number}/merge`

When using git over HTTPS for private repos, prefer `http.https://github.com/.extraheader` (avoid token-in-URL). Use the org token env that is configured, typically `TGA_GH_TOKEN` for The-Gig-Agency.

### 1) Identify the PR

Input can be any of:
- PR URL
- `owner/repo#123`
- PR number + repo

Commands:
```bash
gh pr view <PR> --repo owner/repo
gh pr view <PR> --repo owner/repo --json number,title,author,state,baseRefName,headRefName,url
```

### 2) Check CI and required checks

```bash
gh pr checks <PR> --repo owner/repo
# If needed:
gh run list --repo owner/repo --limit 10
```

If failing, pull logs:
```bash
gh pr checks <PR> --repo owner/repo --watch
# or
gh run view <run-id> --repo owner/repo --log-failed
```

### 3) Review the diff

```bash
gh pr diff <PR> --repo owner/repo
# files + stats
gh pr view <PR> --repo owner/repo --json files,additions,deletions
```

Review priorities:
- correctness and edge cases
- security (authz, input validation, secrets)
- backwards compatibility / migrations
- test coverage
- maintainability (API boundaries, naming, duplication)

Tip (latency/timeout mitigation): for large diffs or high-risk areas, spawn a sub-agent to do an independent pass (security + regressions + test plan), then consolidate.

### 4) Local QA (when repo is available)

Checkout and run the project’s standard verification.

```bash
gh pr checkout <PR> --repo owner/repo
# then run the repo’s standard commands, e.g.
# npm test / npm run typecheck / pytest / cargo test / etc.
```

#### Deployment parity (required when asked to merge)

If the user asks you to merge, you must do at least one of:
- Run the same command(s) the deployment pipeline runs (preferred), or
- Explicitly state you could not reproduce the deploy command and treat the review as **static-only** (do not merge unless the user explicitly overrides).

At minimum, prefer including a **typecheck** step when the stack supports it.

#### Minimal sanity set

If the repo has no documented verification commands, run the minimal set (as applicable):
- `npm test` / `pnpm test` / `bun test` / `pytest` / etc.
- `npm run build` (or equivalent)
- `npm run typecheck` (if present) or `tsc -p tsconfig.json --noEmit`
- `npm run lint` (if present)

Notes:
- Some deploy pipelines run with `NODE_ENV=production` and may skip devDependencies; ensure the CI/deploy command installs what it needs for typecheck.

### 5) Produce a structured review

Deliver a review with:
- **Summary** (what changed)
- **Risk level** (low/med/high) + why
- **Must-fix** items (blockers)
- **Should-fix** items (non-blocking)
- **Nice-to-have**
- **QA status** (what you ran / what you couldn’t run)

Optionally post via `gh` (only if asked):
```bash
gh pr review <PR> --repo owner/repo --comment -b "<message>"
# or for approval/request changes:
# gh pr review <PR> --repo owner/repo --approve -b "..."
# gh pr review <PR> --repo owner/repo --request-changes -b "..."
```

## Merge procedure (only if explicitly asked)

1) Confirm CI/checks status (or note missing checks)
2) Confirm deploy-parity command run status
3) Merge method preference (squash by default)

Using API fallback (example):
- `PUT /repos/{owner}/{repo}/pulls/{number}/merge` with `{ "merge_method": "squash" }`
