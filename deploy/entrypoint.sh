#!/bin/sh
set -eu

OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-/app/.openclaw}"
WORKSPACE_DIR="${OPENCLAW_STATE_DIR}/workspace"
BAKED_WORKSPACE_DIR="${OPENCLAW_STATE_DIR}/workspace.baked"

# If the workspace path is backed by a volume, it can mask the image's workspace.
# Seed workspace when missing; always sync scripts/ and skills/ from image so redeploys get latest worker and skills.
if [ ! -f "${WORKSPACE_DIR}/scripts/echelon-agent-worker.mjs" ]; then
  echo "[entrypoint] workspace scripts missing; seeding workspace into mounted volume"
  mkdir -p "${WORKSPACE_DIR}"
  cp -a "${BAKED_WORKSPACE_DIR}/." "${WORKSPACE_DIR}/"
else
  echo "[entrypoint] syncing workspace/scripts and workspace/skills from image (so worker and skills are current)"
  mkdir -p "${WORKSPACE_DIR}/scripts" "${WORKSPACE_DIR}/skills"
  cp -a "${BAKED_WORKSPACE_DIR}/scripts/." "${WORKSPACE_DIR}/scripts/"
  cp -a "${BAKED_WORKSPACE_DIR}/skills/." "${WORKSPACE_DIR}/skills/"
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

