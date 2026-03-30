---
name: aws-roles-anywhere
description: AWS API access on the hosted Railway edge-bot container via IAM Roles Anywhere (credential_process). Use when the user asks for S3, STS, or other AWS calls and the task runs on this gateway image with RA_* secrets configured in Railway.
---

# AWS (Roles Anywhere) on hosted edge-bot

## When this applies

- **Runtime:** Railway deployment of this repo’s Docker image (`deploy/Dockerfile` + `deploy/entrypoint.sh`).
- **Credentials:** If Railway has the full `RA_*` set (see below), startup writes `/root/.aws/config` and sets **`AWS_PROFILE`** (default profile name **`rolesanywhere`** unless overridden).
- **Binary:** `/usr/local/bin/aws_signing_helper` implements `credential_process` for that profile.

If `RA_*` is **not** set, there is **no** Roles Anywhere profile—do not assume AWS access.

## Environment (Railway; never log or paste values)

| Variable | Purpose |
|----------|---------|
| `RA_CERT_PEM` | Leaf cert PEM (`\n` or `\\n` for newlines in env) |
| `RA_KEY_PEM` | Private key PEM |
| `RA_TRUST_ANCHOR_ARN` | Trust anchor ARN |
| `RA_PROFILE_ARN` | Profile ARN |
| `RA_ROLE_ARN` | Role to assume |
| `AWS_REGION` / `AWS_DEFAULT_REGION` | Region (entrypoint defaults to `us-west-2` if unset) |
| `AWS_ROLES_ANYWHERE_PROFILE` | Optional; overrides default profile name `rolesanywhere` |
| `AWS_PROFILE` | Optional; if unset after entrypoint, matches the Roles Anywhere profile |

**Files on disk (container):** `/tmp/ra-cert.pem`, `/tmp/ra-key.pem` — treat as secrets; do not read them back into chat.

## What is *not* in the image

- **AWS CLI v2** is not installed by default. Prefer the AWS SDK in **Node** (`@aws-sdk/client-*`) if you need `GetCallerIdentity`, S3, etc., with `AWS_PROFILE` set—or shell out to `aws_signing_helper credential-process` only for a quick credential JSON check.

## Quick health check (read-only)

If you can run shell on the **same** container:

```sh
/usr/local/bin/aws_signing_helper credential-process \
  --certificate /tmp/ra-cert.pem \
  --private-key /tmp/ra-key.pem \
  --trust-anchor-arn "$RA_TRUST_ANCHOR_ARN" \
  --profile-arn "$RA_PROFILE_ARN" \
  --role-arn "$RA_ROLE_ARN"
```

Success: JSON with temporary credentials fields. Failure: fix IAM / ARNs / cert chain outside the agent.

## Example user prompts

- “Confirm AWS is wired: with `AWS_PROFILE` as configured on this host, call STS **GetCallerIdentity** and return only the **Arn**.”
- “Using the default AWS profile on this container, **list** objects under `s3://BUCKET/PREFIX/` (read-only).”
- “If Roles Anywhere isn’t configured, say so and list which `RA_*` variables are missing—don’t guess ARNs.”

## Safety

- Least privilege on the IAM role; no broad `*:*`.
- Never exfiltrate `RA_CERT_PEM`, `RA_KEY_PEM`, or raw credential JSON into Slack or logs.
