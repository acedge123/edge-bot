---
name: acp-install-guide
description: Guide and perform honest, engineer-led installation of Agentic Control Plane (ACP/Echelon) into an existing SaaS repository. Use when evaluating repo fit for ACP, classifying repo topology (django, express, supabase, hybrid netlify+supabase), running `echelon init` or `echelon install`, summarizing planned file writes, checking prerequisites, distinguishing bootstrap vs durable adapters, or explaining what governance provisioning is still manual.
---

# ACP Install Guide

Edge uses this skill to help SaaS owners and engineers install ACP honestly: as a constrained operator workflow, not as a magic-product demo.

## Core stance

- Treat ACP install as **guided scaffolding** unless proven otherwise.
- Distinguish three states explicitly:
  - **supported topology**
  - **successful scaffold**
  - **production-ready governance-backed install**
- Never imply those are the same thing.

## Current truth to preserve

Default supported shapes are currently bounded. Prefer these labels when classification is clear:
- `django`
- `express`
- `supabase`
- `hybrid_netlify_supabase`

ACP can currently do useful local installation work such as:
- detect a supported repo shape
- scaffold control-plane files into the repo
- generate bindings, kernel files, migrations, env examples, and install manifest
- generate a local `kernel_id`
- run audit/readiness checks

ACP does **not** currently guarantee hosted self-serve provisioning by default. Do not overclaim:
- hosted login/link/env flows may be incomplete
- governance tenant/org creation may still be manual
- `ACP_KERNEL_KEY` is not assumed to self-provision
- a generated local `kernel_id` is not the same as governance-issued identity

If needed, read `references/current-truth.md` before giving install guidance.

## Workflow

### 1) Classify the repo

Inspect the repo first. Determine whether it is:
- **supported**: clearly maps to one of the bounded topologies
- **partially supported**: close enough to scaffold, but likely needs manual adaptation
- **unsupported**: custom shape where ACP install should be framed as exploratory only

State the evidence used for classification, not just the label.

### 2) Check prerequisites

Before running install commands, verify at minimum:
- user is at repo root
- Node version is compatible with current ACP requirements
- package manager / scripts are available
- repo has a clean-enough state for scaffolded changes to be reviewed

If the environment is ambiguous, say so.

### 3) Prefer dry-run first

Default first command:

```bash
npx --package agentic-control-plane-kit echelon init --dry-run --report-json
```

Use the dry-run to answer:
- what topology was detected
- what files will be created or modified
- whether detection was confident or shaky
- what risks or follow-up steps are likely

If detection is uncertain but the target shape is known, use the explicit installer form.

Example:

```bash
npx --package agentic-control-plane-kit echelon install --framework hybrid_netlify_supabase --env development
```

### 4) Summarize planned writes before real install

Before running the real install, provide a short install preview covering:
- detected / chosen framework
- likely generated files
- whether adapters are bootstrap or durable
- whether governance registration is expected
- what still must be supplied manually

Keep this short and operational.

### 5) Run the real scaffold only after the dry-run looks sane

Typical flow:

```bash
npx --package agentic-control-plane-kit echelon init
npx --package agentic-control-plane-kit echelon audit
```

If explicit framework selection is needed:

```bash
npx --package agentic-control-plane-kit echelon install --framework <shape> --env development
npx --package agentic-control-plane-kit echelon audit
```

### 6) Report outcome in four buckets

After install, report:
1. **What ACP created**
2. **What identity/provisioning happened**
3. **What is still manual**
4. **Whether the repo is actually production-ready**

Always mention:
- generated `kernel_id` status
- whether governance registration actually happened
- whether bootstrap/in-memory adapters remain active
- what env vars or hosted endpoints are still missing

## Guardrails

### Never overclaim provisioning

Do not claim ACP has provisioned any of the following unless directly verified:
- tenant/org records
- governance linkage
- hosted login state
- trusted kernel credentials
- real `tenant_id`
- `ACP_KERNEL_KEY`

### Never collapse bootstrap into production

If bootstrap or in-memory adapters are present:
- say so explicitly
- call the install scaffold-level or dev-level
- warn if the user appears to be treating it as production-ready

### Never present local identity as hosted identity

A locally generated `kernel_id` means local install state exists. It does **not** prove:
- governance registration
- trusted hosted identity
- durable authorization setup

## Recommended response shape

Use this structure for install help:

### Fit
- supported / partially supported / unsupported
- detected or recommended topology

### Run this first
- dry-run command

### If that looks good
- real install command
- audit command

### Expect ACP to create
- concise list of files/artifacts

### Still manual
- governance URL / kernel key / tenant mapping / hosted orchestration gaps

### Confidence
- high / medium / low, with one-line reason

## Escalation rule

If repo shape is novel, detection is unclear, or the user wants business-owner self-serve claims, slow down and state the limit plainly:
- ACP may still be useful as an engineer-led scaffold
- that is different from universal self-serve installation

## References

- Read `references/current-truth.md` when you need exact wording about hosted orchestration gaps, local `kernel_id`, governance registration, or the bounded supported topologies.
