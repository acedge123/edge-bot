---
name: "ops-signal-routing"
description: "Approval-needed signal posts route to the single ops Slack channel and tag ACE."
---

# Ops Signal Routing

Use when sending Mom Walk or other approval-needed signal messages.

## Steps
1. Check whether the message needs human approval.
2. If yes, send it to Slack channel `C0BVBR6029Y`.
3. Put `<@U32PGT1PA>` near the start of the message.
4. Use that channel for every approval-needed signal, regardless of source system or upstream metadata.
5. Treat approval flags on requeued triage rows as authoritative even if the actor id changes; if a row says `requires_approval`, `triage_only`, or `route=approval_required`, handle it as an approval-needed signal.
6. Fail closed if an approval-needed signal does not have a usable Slack destination; do not mark it done until the message can be posted.
7. Do not apply this rule to routine chatter or non-approval follow-ups.

## Verify
- Approval-needed signals target `C0BVBR6029Y`.
- ACE is mentioned at the start.
- No fallback or per-source channel override is used.
