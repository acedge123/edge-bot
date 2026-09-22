# ACP install current-truth reference

Use this reference when you need precise install caveats instead of hand-wavy product language.

## Bounded support claim

A defensible current positioning is:

- ACP credibly supports a limited set of SaaS repo shapes better than before.
- The clearest current shapes are:
  - `django`
  - `express`
  - `supabase`
  - `hybrid_netlify_supabase`
- This is not the same as universal arbitrary-repo support.

## What ACP can do now

In a supported repo, ACP may be able to:
- detect repo topology
- scaffold control-plane files into the repo
- generate `/manage` entrypoints and kernel/bindings artifacts
- generate migrations and `.env.example`
- write local install manifest state such as `.acp/install.json`
- generate a local `kernel_id`
- run audit/readiness checks

## What ACP does not automatically guarantee

Do not assume ACP will automatically:
- create hosted login/link/env state
- mint governance credentials
- mint `ACP_KERNEL_KEY`
- provision tenant/org records in governance
- assign a trusted hosted `tenant_id`
- complete full product-shell onboarding by default

## Identity distinction

Keep this distinction explicit:

- **local/generated `kernel_id`**: proves scaffold/install state exists locally
- **governance-issued credentials or registration**: proves hosted trust relationship exists

Those are different.

## Hosted orchestration warning

If hosted orchestration depends on a configured backend (for example an orchestrator base URL), do not imply that path works by default unless the backend is actually present and verified.

## Safe language to use

Prefer phrases like:
- "engineer-led scaffold install"
- "guided install"
- "bounded supported topology"
- "bootstrap path"
- "production follow-through still required"

Avoid phrases like:
- "one-click universal install"
- "fully production-ready by default"
- "self-provisioning governance" unless verified
