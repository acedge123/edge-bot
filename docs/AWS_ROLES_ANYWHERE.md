## AWS Roles Anywhere (hosted edge-bot)

This repo’s Docker image installs the AWS Roles Anywhere `aws_signing_helper` binary and the entrypoint can configure an AWS profile via `credential_process`.

### 1) Railway variables (recommended)

Set these as **Railway variables** on the `edge-bot` service (never commit them):

- `RA_CERT_PEM` — PEM certificate (use `\n` for newlines in env var form)
- `RA_KEY_PEM` — PEM private key (use `\n` for newlines in env var form)
- `RA_TRUST_ANCHOR_ARN`
- `RA_PROFILE_ARN`
- `RA_ROLE_ARN`
- `AWS_REGION` (or `AWS_DEFAULT_REGION`)

Optional:

- `AWS_ROLES_ANYWHERE_PROFILE` (default `rolesanywhere`)
- `AWS_PROFILE` (if you want to force a specific profile name)

On container start, `deploy/entrypoint.sh` will:

- write cert/key to `/tmp/ra-cert.pem` and `/tmp/ra-key.pem`
- write `/root/.aws/config` with a profile containing `credential_process`
- export `AWS_PROFILE` and region vars

### 2) Verify credentials (no AWS CLI required)

From Node (inside the container), use AWS SDK v3 STS `GetCallerIdentity` and log the ARN.

If you prefer to use AWS CLI, you must install it separately (not included by default).

### 3) Security notes

- Treat `RA_CERT_PEM` / `RA_KEY_PEM` as secrets.
- Never paste cookies/keys into chat or git.
- Prefer least-privilege on the Roles Anywhere role policy for the S3 bucket actions you need.

