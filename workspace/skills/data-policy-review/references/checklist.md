# Data Policy Review Checklist

Use this checklist when auditing a repo or system.

## 1. Classification
- Is data classified explicitly, or only implied by naming?
- Are public, internal, confidential, secret, regulated, tenant-scoped, and operator-scoped data distinguished?
- Are sensitive fields labeled in schemas, DTOs, docs, or code comments?

## 2. Retention and deletion
- Is retention defined for raw events, logs, uploads, audit trails, and work artifacts?
- Is deletion behavior defined and implemented?
- Are archived, summarized, or derived copies handled separately?
- Can a tenant/user request deletion and actually get it?

## 3. Access boundaries
- Who can read or mutate the data?
- Are human, service, agent, and admin permissions separated?
- Are RLS, ACLs, auth checks, or queue boundaries enforced in code?
- Are privileged paths narrowly scoped?

## 4. Source of truth
- Which system owns tenant identity, credentials, policy, audit, content, or billing?
- Are duplicate records intentional or accidental?
- Is reconciliation documented when copies diverge?

## 5. Data movement
- What is copied between systems?
- What must stay in one system and be referenced instead?
- Are prompt logs, embeddings, exports, cache layers, and analytics pipelines moving sensitive data?
- Is cross-environment data movement allowed or blocked?

## 6. Logging and redaction
- Are secrets, tokens, passwords, and PII excluded from logs?
- Are logs hashed, tokenized, truncated, or redacted where needed?
- Do errors leak payloads or identifiers?
- Are traces and analytics also checked, not just app logs?

## 7. Environment separation
- Is prod data kept out of dev/test unless explicitly allowed?
- Are lower environments sanitized?
- Are test fixtures and seeding scripts safe?
- Are backups or restores environment-scoped?

## 8. Backups and restore
- Are backup contents known?
- Are restore permissions restricted?
- Are retention and deletion consistent with backups?
- Can restored data reintroduce deleted or expired records?

## 9. Tenant isolation
- Can one tenant read another tenant’s records through code, jobs, search, export, or analytics?
- Are tenant IDs required and verified at boundaries?
- Are shared caches, queues, and indexes partitioned safely?

## 10. AI-specific data handling
- Are prompts, tool outputs, embeddings, and agent memories treated as data assets?
- Are vendor calls sending sensitive data unnecessarily?
- Are derived artifacts classified and retained appropriately?
- Are prompt logs and retrieval stores redacted and access-controlled?

## Evidence standard
For each item, capture:
- file path
- behavior observed
- why it matters
- whether it is Pass, Fail, or Unknown
