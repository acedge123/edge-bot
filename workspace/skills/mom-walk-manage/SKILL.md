---
name: mom-walk-manage
description: Safely execute reviewed Mom Walk administrative actions through the root-owned mom-walk-manage client.
metadata:
  openclaw:
    requires:
      bins: [mom-walk-manage]
      env: [MOM_WALK_AGENT_MINT_SECRET]
---

# Mom Walk Manage

Use the root-owned `mom-walk-manage` executable. Never recreate this flow with
`bash`, `curl`, `jq`, or a hand-built HTTP request.

## Supported actions

List the reviewed registry:

```bash
mom-walk-manage list-actions
```

Find a user before any password reset:

```bash
mom-walk-manage admin.find-user --params-json '{"query":"person@example.com","limit":10}'
```

Reset a confirmed account and email the temporary password:

```bash
mom-walk-manage admin.reset-user-password \
  --params-json '{"email":"person@example.com"}' \
  --confirm-target 'person@example.com'
```

## Required workflow

1. Run `admin.find-user` first.
2. Show the matched identity to the requesting admin without exposing secrets.
3. Obtain explicit confirmation for the exact email or user ID.
4. Run `admin.reset-user-password` with the same value in `--confirm-target`.
5. Report whether the notification email was sent.

The client forces `notify: true`. It rejects caller-supplied passwords and never
prints the minted access token or temporary password.

New `/manage` actions require a reviewed registry entry, parameter validation,
tests, and an appropriate confirmation rule in the client source. Do not bypass
the registry with a generic shell command.
