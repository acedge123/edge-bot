#!/usr/bin/env bash
set -euo pipefail

: "${AGENT_VAULT_URL:?AGENT_VAULT_URL must be set}"
: "${AGENT_EDGE_KEY:?AGENT_EDGE_KEY must be set}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec env \
  AGENT_VAULT_URL="$AGENT_VAULT_URL" \
  AGENT_EDGE_KEY="$AGENT_EDGE_KEY" \
  python3 "$SCRIPT_DIR/run_media_buyer.py" "$@"
