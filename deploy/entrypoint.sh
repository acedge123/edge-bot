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
  echo "[entrypoint] syncing workspace/scripts, workspace/skills, workspace/docs, and workspace/.clawhub from image"
  mkdir -p "${WORKSPACE_DIR}/scripts" "${WORKSPACE_DIR}/skills" "${WORKSPACE_DIR}/docs" "${WORKSPACE_DIR}/.clawhub"
  cp -a "${BAKED_WORKSPACE_DIR}/scripts/." "${WORKSPACE_DIR}/scripts/"
  cp -a "${BAKED_WORKSPACE_DIR}/skills/." "${WORKSPACE_DIR}/skills/"
  if [ -d "${BAKED_WORKSPACE_DIR}/.clawhub" ]; then
    cp -a "${BAKED_WORKSPACE_DIR}/.clawhub/." "${WORKSPACE_DIR}/.clawhub/"
  fi
  if [ -d "${BAKED_WORKSPACE_DIR}/docs" ]; then
    cp -a "${BAKED_WORKSPACE_DIR}/docs/." "${WORKSPACE_DIR}/docs/"
  fi
fi

# This hosted runtime only needs the reviewed Mom Walk manage command path.
# Remove local skill folders that can cause OpenClaw to rehydrate browser/search
# plugin packages requiring interactive capability consent.
for unused_skill_dir in brave-search agent-browser cursor-agent; do
  if [ -d "${WORKSPACE_DIR}/skills/${unused_skill_dir}" ]; then
    rm -rf "${WORKSPACE_DIR}/skills/${unused_skill_dir}"
    echo "[entrypoint] removed unused hosted skill ${unused_skill_dir}"
  fi
done

# OpenClaw 2026.8 migrates legacy cron jobs into SQLite during startup and
# requires ${OPENCLAW_STATE_DIR}/cron to be a real directory, not a symlink.
mkdir -p "${WORKSPACE_DIR}/cron"
if [ -L "${OPENCLAW_STATE_DIR}/cron" ]; then
  rm -f "${OPENCLAW_STATE_DIR}/cron"
fi
mkdir -p "${OPENCLAW_STATE_DIR}/cron"
if [ -f "${WORKSPACE_DIR}/cron/jobs.json" ] && \
   [ ! -f "${OPENCLAW_STATE_DIR}/cron/jobs.json" ] && \
   [ ! -f "${OPENCLAW_STATE_DIR}/cron/jobs.json.migrated" ]; then
  cp "${WORKSPACE_DIR}/cron/jobs.json" "${OPENCLAW_STATE_DIR}/cron/jobs.json"
  echo "[entrypoint] copied legacy cron jobs from volume for OpenClaw migration"
else
  echo "[entrypoint] cron directory ready: ${OPENCLAW_STATE_DIR}/cron"
fi

configure_roles_anywhere

# Remove empty plugin project folders left behind by older OpenClaw installs.
# These stale records can trigger capability-consent repair even though the
# hosted Mom Walk manage runtime does not use the plugins.
for stale_plugin_project in \
  "${OPENCLAW_STATE_DIR}"/npm/projects/openclaw-brave-plugin-* \
  "${OPENCLAW_STATE_DIR}"/npm/projects/openclaw-codex-*; do
  [ -d "${stale_plugin_project}" ] || continue
  if [ -z "$(find "${stale_plugin_project}" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
    rm -rf "${stale_plugin_project}"
    echo "[entrypoint] removed empty stale plugin project ${stale_plugin_project}"
  else
    echo "[entrypoint] left non-empty plugin project in place: ${stale_plugin_project}"
  fi
done

# Rebuild the persisted registry from actual plugin manifests. Railway keeps
# OpenClaw state on a volume, so stale plugin records can survive image updates
# and block gateway readiness with capability-consent prompts.
openclaw plugins registry --refresh >/dev/null
echo "[entrypoint] refreshed OpenClaw plugin registry"

openclaw update repair --yes --no-restart --accept-capabilities >/dev/null
echo "[entrypoint] OpenClaw update repair passed"

# The OpenAI profile must exist in auth-profiles.json, not only in
# openclaw.json. Import the Railway-provided key without writing it to logs.
if [ -n "${OPENAI_API_KEY:-}" ]; then
  for agent_id in main main-med main-critical; do
    printf '%s' "${OPENAI_API_KEY}" | openclaw models auth paste-api-key --provider openai --profile-id openai:default --agent "${agent_id}" >/dev/null
  done
  echo "[entrypoint] imported OPENAI_API_KEY into OpenClaw auth profiles"
else
  echo "[entrypoint] OPENAI_API_KEY is not set; OpenAI chat completions will fail" >&2
fi

# Exec approvals are host-local state. Seed the reviewed binary on every
# container start so headless Railway sessions do not depend on UI approvals.
for agent_id in main main-med main-critical; do
  openclaw approvals allowlist add --agent "${agent_id}" "/usr/local/bin/mom-walk-manage"
done
echo "[entrypoint] allowlisted /usr/local/bin/mom-walk-manage for hosted agents"

export PORT="${PORT:-18789}"
export OPENCLAW_GATEWAY_PORT="${PORT}"

# OpenClaw gateway CLI uses --bind (not --host) with a bind mode.
# For Railway, bind on all interfaces so the service port is reachable.
# Valid modes include: loopback, lan, tailnet, auto, custom.
openclaw gateway run --bind lan --port "${PORT}" --allow-unconfigured &
sleep 5

node "${WORKSPACE_DIR}/scripts/echelon-agent-worker.mjs" &
wait
