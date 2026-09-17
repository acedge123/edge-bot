#!/bin/sh
set -eu

IMAGE_STATE_DIR="${OPENCLAW_IMAGE_STATE_DIR:-/app/.openclaw}"
WORKSPACE_DIR="${OPENCLAW_WORKSPACE:-${IMAGE_STATE_DIR}/workspace}"
BAKED_WORKSPACE_DIR="${IMAGE_STATE_DIR}/workspace.baked"
RUNTIME_STATE_DIR="${OPENCLAW_RUNTIME_STATE_DIR:-${WORKSPACE_DIR}/.openclaw-state}"

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

# Keep mutable OpenClaw state under the Railway-mounted workspace volume. The
# image remains the source of truth for config, while cron/session SQLite state
# survives container replacement.
mkdir -p "${RUNTIME_STATE_DIR}"
for runtime_file in openclaw.json config.yaml; do
  if [ -f "${IMAGE_STATE_DIR}/${runtime_file}" ]; then
    cp "${IMAGE_STATE_DIR}/${runtime_file}" "${RUNTIME_STATE_DIR}/${runtime_file}"
  fi
done
for runtime_dir in agents identity hooks completions devices subagents skills; do
  if [ -d "${IMAGE_STATE_DIR}/${runtime_dir}" ] && [ ! -e "${RUNTIME_STATE_DIR}/${runtime_dir}" ]; then
    cp -a "${IMAGE_STATE_DIR}/${runtime_dir}" "${RUNTIME_STATE_DIR}/${runtime_dir}"
  fi
done

export OPENCLAW_STATE_DIR="${RUNTIME_STATE_DIR}"
export OPENCLAW_WORKSPACE="${WORKSPACE_DIR}"

# OpenClaw 2026.8+ requires cron to be a real directory. Because the entire
# runtime state now lives on the volume, no symlink or per-boot re-import is
# needed after the one-time legacy jobs.json seed.
mkdir -p "${WORKSPACE_DIR}/cron"
mkdir -p "${OPENCLAW_STATE_DIR}/cron"
if [ -f "${WORKSPACE_DIR}/cron/jobs.json" ] && [ ! -f "${OPENCLAW_STATE_DIR}/cron/jobs.json" ]; then
  cp "${WORKSPACE_DIR}/cron/jobs.json" "${OPENCLAW_STATE_DIR}/cron/jobs.json"
  echo "[entrypoint] seeded legacy cron jobs.json into persistent OpenClaw state"
fi
echo "[entrypoint] persistent state: ${OPENCLAW_STATE_DIR}; cron: ${OPENCLAW_STATE_DIR}/cron"

configure_roles_anywhere

# Plugin packages persist on the Railway volume. Install an exact compatible
# version only for a fresh volume; never resolve/download latest on every boot.
OPENCLAW_PLUGIN_VERSION="${OPENCLAW_PLUGIN_VERSION:-2026.8.2}"
PLUGIN_PROJECTS_DIR="${OPENCLAW_STATE_DIR}/npm/projects"

ensure_plugin_package() {
  package_name="$1"
  for plugin_dir in "${PLUGIN_PROJECTS_DIR}"/*/node_modules/${package_name}; do
    if [ -d "${plugin_dir}" ]; then
      echo "[entrypoint] plugin package present: ${package_name}"
      return 0
    fi
  done

  echo "[entrypoint] installing missing plugin package: ${package_name}@${OPENCLAW_PLUGIN_VERSION}"
  openclaw plugins install "${package_name}@${OPENCLAW_PLUGIN_VERSION}" --accept-capabilities
}

ensure_plugin_package "@openclaw/codex"
ensure_plugin_package "@openclaw/brave-plugin"
if [ "${OPENCLAW_RUN_UPDATE_REPAIR:-0}" = "1" ]; then
  echo "[entrypoint] running explicitly enabled OpenClaw update repair"
  openclaw update repair || true
fi
echo "[entrypoint] required plugin packages ready"

# Exec approvals share the persistent SQLite state. Seed once per agent-roster
# version instead of invoking the migration-heavy CLI on every container boot.
APPROVALS_MARKER="${OPENCLAW_STATE_DIR}/state/.mom-walk-manage-approvals-v2"
if [ ! -f "${APPROVALS_MARKER}" ]; then
  for agent_id in main main-light main-med main-critical; do
    openclaw approvals allowlist add --agent "${agent_id}" "/usr/local/bin/mom-walk-manage" >/dev/null
  done
  mkdir -p "$(dirname "${APPROVALS_MARKER}")"
  touch "${APPROVALS_MARKER}"
  echo "[entrypoint] seeded /usr/local/bin/mom-walk-manage approvals"
else
  echo "[entrypoint] persisted mom-walk-manage approvals present"
fi

export PORT="${PORT:-18789}"
export OPENCLAW_GATEWAY_PORT="${PORT}"

# OpenClaw gateway CLI uses --bind (not --host) with a bind mode.
# For Railway, bind on all interfaces so the service port is reachable.
# Valid modes include: loopback, lan, tailnet, auto, custom.
openclaw gateway --bind lan --port "${PORT}" --allow-unconfigured &
sleep 5

node "${WORKSPACE_DIR}/scripts/echelon-agent-worker.mjs" &
wait
