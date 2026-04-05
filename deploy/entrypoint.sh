#!/bin/sh
set -eu

OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-/app/.openclaw}"
WORKSPACE_DIR="${OPENCLAW_STATE_DIR}/workspace"
BAKED_WORKSPACE_DIR="${OPENCLAW_STATE_DIR}/workspace.baked"

# AWS Roles Anywhere (optional)
# If RA_* env vars are provided, configure an AWS profile using credential_process.
# Secrets should be provided via Railway variables; never commit certs/keys.
configure_roles_anywhere() {
  # Require the minimal set.
  if [ -z "${RA_CERT_PEM:-}" ] || [ -z "${RA_KEY_PEM:-}" ] || \
     [ -z "${RA_TRUST_ANCHOR_ARN:-}" ] || [ -z "${RA_PROFILE_ARN:-}" ] || [ -z "${RA_ROLE_ARN:-}" ]; then
    return 0
  fi

  if ! command -v aws_signing_helper >/dev/null 2>&1; then
    echo "[entrypoint] Roles Anywhere env set but aws_signing_helper not found" >&2
    return 1
  fi

  cert_path="/tmp/ra-cert.pem"
  key_path="/tmp/ra-key.pem"

  # Convert literal \n sequences into real newlines (Railway env var friendly).
  printf "%s" "${RA_CERT_PEM}" | sed 's/\\\\n/\n/g' > "${cert_path}"
  printf "%s" "${RA_KEY_PEM}"  | sed 's/\\\\n/\n/g' > "${key_path}"
  chmod 600 "${cert_path}" "${key_path}" || true

  mkdir -p /root/.aws

  profile_name="${AWS_ROLES_ANYWHERE_PROFILE:-rolesanywhere}"
  region="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-west-2}}"

  cat > /root/.aws/config <<EOF
[profile ${profile_name}]
region = ${region}
credential_process = /usr/local/bin/aws_signing_helper credential-process --certificate ${cert_path} --private-key ${key_path} --trust-anchor-arn ${RA_TRUST_ANCHOR_ARN} --profile-arn ${RA_PROFILE_ARN} --role-arn ${RA_ROLE_ARN}
EOF

  export AWS_PROFILE="${AWS_PROFILE:-${profile_name}}"
  export AWS_REGION="${region}"
  export AWS_DEFAULT_REGION="${region}"
  echo "[entrypoint] AWS Roles Anywhere configured (profile ${profile_name}, region ${region})"
}

# If the workspace path is backed by a volume, it can mask the image's workspace.
# Seed workspace when missing; always sync scripts/ and skills/ from image so redeploys get latest worker and skills.
if [ ! -f "${WORKSPACE_DIR}/scripts/echelon-agent-worker.mjs" ]; then
  echo "[entrypoint] workspace scripts missing; seeding workspace into mounted volume"
  mkdir -p "${WORKSPACE_DIR}"
  cp -a "${BAKED_WORKSPACE_DIR}/." "${WORKSPACE_DIR}/"
else
  echo "[entrypoint] syncing workspace/scripts, workspace/skills, and workspace/docs from image (so worker, skills, and wiki reference docs are current)"
  mkdir -p "${WORKSPACE_DIR}/scripts" "${WORKSPACE_DIR}/skills" "${WORKSPACE_DIR}/docs"
  cp -a "${BAKED_WORKSPACE_DIR}/scripts/." "${WORKSPACE_DIR}/scripts/"
  cp -a "${BAKED_WORKSPACE_DIR}/skills/." "${WORKSPACE_DIR}/skills/"
  if [ -d "${BAKED_WORKSPACE_DIR}/docs" ]; then
    cp -a "${BAKED_WORKSPACE_DIR}/docs/." "${WORKSPACE_DIR}/docs/"
  fi
fi

# OpenClaw expects cron under ${OPENCLAW_STATE_DIR}/cron. When the Railway volume is mounted only on
# workspace/, store jobs.json on the volume and symlink the canonical path (survives redeploy).
mkdir -p "${WORKSPACE_DIR}/cron"
if [ -e "${OPENCLAW_STATE_DIR}/cron" ] && [ ! -L "${OPENCLAW_STATE_DIR}/cron" ]; then
  rm -rf "${OPENCLAW_STATE_DIR}/cron"
fi
ln -sfn "${WORKSPACE_DIR}/cron" "${OPENCLAW_STATE_DIR}/cron"
echo "[entrypoint] cron -> volume: ${OPENCLAW_STATE_DIR}/cron -> ${WORKSPACE_DIR}/cron"

configure_roles_anywhere

export PORT="${PORT:-18789}"
export OPENCLAW_GATEWAY_PORT="${PORT}"

# OpenClaw gateway CLI uses --bind (not --host) with a bind mode.
# For Railway, bind on all interfaces so the service port is reachable.
# Valid modes include: loopback, lan, tailnet, auto, custom.
openclaw gateway --bind lan --port "${PORT}" --allow-unconfigured &
sleep 5

node "${WORKSPACE_DIR}/scripts/echelon-agent-worker.mjs" &
wait

