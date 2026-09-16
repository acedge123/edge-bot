#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$ROOT_DIR/deploy/runtime-template/openclaw.json"
WORKER="$ROOT_DIR/workspace/scripts/echelon-agent-worker.mjs"

jq -e '
  .agents.defaults.heartbeat.every == "0m" and
  .memory.search.enabled == false and
  .memory.search.provider == "none" and
  .agents.entries.main.model == "openai/gpt-5.4-mini" and
  .agents.entries["main-med"].model == "openai/gpt-5.4" and
  .agents.entries["main-critical"].model == "openai/gpt-5.6-sol"
' "$CONFIG" >/dev/null

grep -q "'chat.send'" "$WORKER"
grep -q 'jobNeedsCompletionsPath' "$WORKER"
grep -q 'provider circuit is open; not claiming jobs' "$WORKER"
grep -q 'Do not enable session transcript indexing' "$ROOT_DIR/workspace/skills/openclaw-mem/SKILL.md"

if grep -qE 'routedChatCompletion|session-history' "$WORKER"; then
  echo "Worker must not maintain and resend a parallel conversation transcript." >&2
  exit 1
fi

echo "Cost-control invariants verified."
