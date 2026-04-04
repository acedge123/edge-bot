---
name: pr-code-review-qa
description: |
  Thorough pull-request and code review with emphasis on security, architecture, correctness, and operability.
  Use when the user asks for PR review, security review, architecture review, pre-merge QA, threat modeling of changes,
  or a structured audit of a branch or diff. Complements the github skill (gh pr, checks) and local git inspection.
metadata: {"clawdbot":{"optional":{"env":["GITHUB_TOKEN"]}}}
---

# PR & code QA (security + architecture)

This skill defines **how** to review code—not just **that** to review it. The goal is maximum signal: catch real risks, avoid nitpick theater, and produce an actionable report the author and reviewers can execute on.

## When to apply

- User requests: PR review, security pass, architecture check, “ship/no-ship” assessment, diff review, release QA.
- Triggers: GitHub PR URL/number, branch name vs base, local uncommitted changes, or ticket linking to a PR.
- **Do not** use for: vague “is this good?” without scope—clarify **what** changed and **base branch** first if missing.

## Preconditions (establish before deep reading)

1. **Scope**: Base ref (e.g. `main`) and head ref (branch or SHA). Prefer `git merge-base` / PR diff over guessing.
2. **Surface area**: List changed files; classify (auth, data layer, API, infra, UI, deps).
3. **Intent**: One sentence from PR title/body or user: what problem does this solve?
4. **Runtime**: If hosted (Railway, Lambda, etc.), note trust boundaries and data flows touched by the change.

If the workspace has no checkout, say so and use **`github`** skill patterns (`gh pr diff`, `gh pr view`) or ask the user to clone—do not invent file contents.

## Review philosophy

- **Adversarial but fair**: Assume mistakes and abuse; do not assume malice.
- **Severity over volume**: Few critical findings beat a long list of opinions.
- **Exploitability > pattern-matching**: Prefer “who can trigger this and how?” over “I saw `eval`.”
- **Architecture before style**: Layer violations and trust-boundary bugs outrank formatting.
- **Verifiable claims**: Tie findings to files/lines or concrete behaviors; mark hypotheses as such.

## Review phases (run in order; skip only if N/A)

### Phase 0 — Meta

- PR description matches diff; no unrelated drive-by changes (or flag scope creep).
- CI status: if **`github`** / `gh pr checks` is available, note failures and whether they block review.
- Size: huge PRs get a “split recommended” note and focus on high-risk paths first.

### Phase 1 — Architecture & design

- **Boundaries**: Do new calls cross layers correctly (e.g. UI → API → domain → data)? Any business logic leaked into wrong tier?
- **Coupling**: New tight coupling to concrete implementations; missing interfaces where tests or swaps matter.
- **Data flow**: Where does untrusted input enter, transform, persist, and exit?
- **Failure modes**: Timeouts, partial failure, retries, idempotency for writes, crash-only behavior.
- **Concurrency**: Races, shared mutable state, async mistakes, transaction boundaries.
- **Extensibility**: Will the next feature duplicate this pattern or extend cleanly?
- **Dependencies**: New deps justified? License, maintenance, supply-chain posture (pinning, lockfile).

### Phase 2 — Security (systematic)

Checklist—apply what fits the stack; **do not** treat as a literal tick-box if irrelevant.

| Area | Questions |
|------|-----------|
| **AuthN / AuthZ** | Who can call this? Session/JWT/API key validation? IDOR (object access by guessing IDs)? Role checks on every mutating path? |
| **Injection** | SQL/NoSQL/command/LDAP/template/log injection; concatenated queries; unsafe `eval` / dynamic code. |
| **XSS / CSRF** | Reflected/stored DOM XSS; CSP implications; CSRF tokens or SameSite for state-changing browser flows. |
| **SSRF** | User-controlled URLs fetching server-side; metadata endpoints; redirect chains. |
| **Path / file** | Traversal in uploads, exports, static serving; symlink issues; ZIP slip. |
| **Secrets** | Hardcoded tokens, keys in logs, echoed env, client-side secrets, weak rotation story. |
| **Crypto** | Correct primitives (no homegrown); TLS where needed; password hashing if applicable. |
| **Deserialization** | Unsafe pickle/YAML/`serialize` patterns; prototype pollution in JS. |
| **Rate limits / abuse** | Brute force, enumeration, expensive endpoints, unbounded payloads. |
| **Headers / transport** | HSTS, secure cookies, CORS misconfiguration, mixed content. |
| **Third-party** | Webhooks verifying signatures; OAuth state/PKCE; redirect URI allowlists. |
| **Logging** | PII/secrets in logs; log injection; enough context for incident response without leaking data. |

### Phase 3 — Correctness & quality

- Logic bugs, off-by-one, null handling, type holes, incorrect defaults.
- Error handling: swallowed errors, generic messages hiding causes, user-facing leaks.
- API contracts: breaking changes, versioning, nullable fields, pagination consistency.
- Migrations: backward compatibility, rollback story, data loss risk.
- Performance obvious wins: N+1 queries, unbounded loops, loading huge blobs into memory.

### Phase 4 — Tests & verification

- New behavior covered by tests where risk warrants it; critical paths not only happy path.
- Tests assert behavior, not implementation detail, unless necessary.
- Flaky patterns: time, network, order-dependent assertions.

### Phase 5 — Ops & reliability

- Config: env vars documented; safe defaults in prod.
- Observability: metrics/logs/traces for new failure points.
- Deploy: migrations order, feature flags, kill switches.
- Resource limits: memory, disk, connection pools, job timeouts.

### Phase 6 — Documentation & DX

- README/runbook updates when behavior or setup changes.
- Public API or skill docs updated if contracts change.

## Output format (required structure)

Produce a single report with this skeleton so humans and agents can scan it:

```markdown
## Summary
- **Verdict**: (Approve / Approve with nits / Request changes / Block) + one-line why
- **Risk level**: Low / Medium / High / Critical (highest single finding)

## Scope
- Base: … | Head: … | Files: N | CI: pass/fail/unknown

## Critical / High (must fix before merge)
1. …

## Medium
1. …

## Low / nits (optional)
1. …

## Security notes
- …

## Architecture notes
- …

## Test & verification gaps
- …

## Questions for author
- …
```

Rules:

- Every **Critical/High** item: **location** (path, optional line), **issue**, **exploit or failure scenario**, **fix direction** (not necessarily full patch).
- If uncertain, label **Hypothesis** and what would confirm it.

## Tooling (prefer deterministic facts)

- `git diff base...head --stat` and full diff for bounded PRs.
- `gh pr view`, `gh pr diff`, `gh pr checks` when **`github`** skill applies.
- Search: risky APIs (`eval`, `exec`, `innerHTML`, `dangerouslySetInnerHTML`, `pickle`, `yaml.load`, `child_process`, raw SQL builders).
- Run project linters/tests **only if** user requests or environment is clearly set up; otherwise note “not run locally.”

## Integration with other skills

- **`github`**: PR metadata, checks, diff without full clone.
- **`youtrack`**: Optional comment posting or ticket linkage—never paste secrets; summarize findings.

## Non-goals (unless user explicitly asks)

- Bike-shedding naming unless it harms clarity or conflicts with conventions.
- Rewriting the PR; suggest patches or pseudocode only when small and clear.
- Guaranteeing absence of bugs; state limits of static review.

## Example user prompts

- “Review PR #42 in `owner/repo` against `main`; security and architecture first.”
- “Diff `feature/x` vs `main`: ship/no-ship with a structured report.”
- “Threat-model the auth changes in this PR.”
- “List only Critical/High issues; ignore style.”

## Guardrails

- Never reproduce or echo **secrets** from code or CI logs in the review output.
- Do not claim **compliance** (SOC2, HIPAA, PCI) certification from a code review alone.
- Respect embargo: if user says coordinated disclosure, do not suggest public issue text that leaks vulnerability details before fix.
