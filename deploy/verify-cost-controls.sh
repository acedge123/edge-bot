#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$ROOT_DIR/deploy/runtime-template/openclaw.json"
WORKER="$ROOT_DIR/workspace/scripts/echelon-agent-worker.mjs"

jq -e '
  .agents.defaults.heartbeat.every == "0m" and
  .agents.defaults.bootstrapMaxChars == 7000 and
  .memory.search.enabled == false and
  .memory.search.provider == "none" and
  .cron.enabled == false and
  .cron.triggers.enabled == false and
  .skills.workshop.autonomous.mode == "off" and
  .plugins.entries["memory-core"].config.dreaming.enabled == false and
  .agents.defaults.model.primary == "openai/gpt-5.6-sol" and
  .agents.entries.main.model == "openai/gpt-5.6-sol" and
  .agents.entries["main-light"].model == "openai/gpt-5-mini" and
  .agents.entries["main-med"].model == "openai/gpt-5.6-sol" and
  .agents.entries["main-critical"].model == "openai/gpt-5.6-sol"
' "$CONFIG" >/dev/null

grep -q "'chat.send'" "$WORKER"
grep -q 'jobNeedsCompletionsPath' "$WORKER"
grep -q 'provider circuit is open; not claiming jobs' "$WORKER"
grep -q 'app_signal bypassed model processing' "$WORKER"
grep -q 'Do not enable session transcript indexing' "$ROOT_DIR/workspace/skills/openclaw-mem/SKILL.md"
node --test "$ROOT_DIR/workspace/scripts/echelon-model-route.test.mjs" >/dev/null
node --test "$ROOT_DIR/workspace/scripts/echelon-app-signal-policy.test.mjs" >/dev/null

if grep -q 'plugins list' "$ROOT_DIR/deploy/entrypoint.sh"; then
  echo "Entrypoint must not dump the full plugin inventory during startup." >&2
  exit 1
fi

if grep -qE 'routedChatCompletion|session-history' "$WORKER"; then
  echo "Worker must not maintain and resend a parallel conversation transcript." >&2
  exit 1
fi

echo "Cost-control invariants verified."
