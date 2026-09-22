---
name: data-policy-review
description: Review repositories, architecture, and configs for data policy gaps, including data classification, retention, deletion, access boundaries, logging/redaction, environment separation, tenant isolation, backups, and AI data movement. Use when asked to audit a repo or system for PII handling, retention, ownership, data lifecycle, or whether data policy is implicit or missing.
---

# Data Policy Review

## Overview

Review systems for explicit, enforceable data policy. Focus on what data exists, who can access it, where it moves, how long it lives, and how it is logged, copied, or deleted.

## Review flow

1. Identify data types and trust boundaries.
2. Map sources of truth and downstream copies.
3. Check code, infra, docs, and configs for policy enforcement.
4. Mark each policy area as Pass, Fail, or Unknown with file evidence.
5. Prioritize fixes by user risk, compliance risk, and blast radius.

## What to check

Use the checklist in [references/checklist.md](references/checklist.md). At minimum, review:
- classification
- retention and deletion
- access boundaries
- source of truth
- data movement
- logging and redaction
- environment separation
- backup and restore
- tenant isolation
- AI-derived data, embeddings, caches, and prompt logs

## Output format

Return:
- top risks, in order
- a policy matrix with Pass / Fail / Unknown
- evidence for each finding
- recommended fixes, ranked

## Rules

- Prefer concrete evidence over inference.
- Treat missing policy as a finding.
- Separate confirmed bugs from unknowns.
- Call out security or compliance exposure early.
- Do not approve vague claims like "handled elsewhere" unless the repo shows where and how.
