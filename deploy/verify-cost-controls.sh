#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$ROOT_DIR/deploy/runtime-template/openclaw.json"
WORKER="$ROOT_DIR/workspace/scripts/echelon-agent-worker.mjs"
WRAPPER_CONTRACT="$ROOT_DIR/deploy/TGA_OPENCLAW_WRAPPERS.md"
GITHUB_HELPER="$ROOT_DIR/workspace/scripts/github-via-owner.mjs"
GITHUB_SKILL="$ROOT_DIR/workspace/skills/github/SKILL.md"
GITHUB_DOC="$ROOT_DIR/workspace/docs/GITHUB_ACCESS_FOR_AGENT.md"

test -s "$WRAPPER_CONTRACT"
grep -q 'GitHub override' "$WRAPPER_CONTRACT"
grep -q 'Required acceptance tests' "$WRAPPER_CONTRACT"
test -x "$ROOT_DIR/workspace/scripts/github-askpass.sh"
grep -q "candidates = \['EDGE_BOT_PERSONAL'\]" "$GITHUB_HELPER"
grep -q "candidates = \['EDGE_BOT_TOKEN', 'TGA_GH_TOKEN'\]" "$GITHUB_HELPER"
grep -q 'github_identity_status' "$GITHUB_SKILL"
grep -q 'acedge123.*EDGE_BOT_PERSONAL' "$GITHUB_DOC"
grep -q 'The-Gig-Agency.*EDGE_BOT_TOKEN' "$GITHUB_DOC"

jq -e '
  .agents.defaults.heartbeat.every == "0m" and
  .agents.defaults.thinkingDefault == "low" and
  .agents.defaults.contextInjection == "always" and
  .agents.defaults.bootstrapMaxChars == 20000 and
  .agents.defaults.bootstrapTotalMaxChars == 150000 and
  .agents.defaults.startupContext.enabled == true and
  .agents.defaults.contextPruning.mode == "cache-ttl" and
  .agents.defaults.compaction.keepRecentTokens == 8000 and
  .agents.defaults.compaction.recentTurnsPreserve == 2 and
  .agents.defaults.compaction.postIndexSync == "off" and
  .agents.defaults.compaction.memoryFlush.enabled == false and
  .session.reset.mode == "idle" and
  .session.reset.idleMinutes == 60 and
  .skills.allowBundled == [] and
  (.skills | has("limits") | not) and
  (.agents.entries.main | has("skills") | not) and
  (.agents.entries["main-med"] | has("skills") | not) and
  (.tools.deny | index("computer")) != null and
  (.tools.deny | index("sessions_spawn")) != null and
  (.tools.deny | index("automations")) != null and
  .memory.search.enabled == true and
  .memory.search.provider == "none" and
  .cron.enabled == false and
  .cron.triggers.enabled == false and
  .skills.workshop.autonomous.mode == "off" and
  .discovery.mdns.mode == "off" and
  .plugins.entries["memory-core"].enabled == true and
  .plugins.entries["memory-core"].config.dreaming.enabled == false and
  .agents.defaults.model.primary == "openai/gpt-5.6-luna" and
  .agents.entries.main.model == "openai/gpt-5.6-luna" and
  .agents.entries["main-light"].model == "openai/gpt-5.6-luna" and
  .agents.entries["main-med"].model == "openai/gpt-5.6-sol" and
  .agents.entries["main-critical"].model == "openai/gpt-5.6-sol"
' "$CONFIG" >/dev/null

grep -q '/v1/chat/completions' "$WORKER"
if grep -q "gatewayCall('chat.send'" "$WORKER" || grep -q "gatewayCall('chat.history'" "$WORKER"; then
  echo "Echelon worker must not infer completion by polling chat.send/chat.history" >&2
  exit 1
fi
grep -q 'maxMessages: 12' "$WORKER"
grep -q 'readSessionLog' "$WORKER"
grep -q 'appendSessionLog' "$WORKER"
grep -q 'provider circuit is open; not claiming jobs' "$WORKER"
grep -q 'app_signal bypassed model processing' "$WORKER"
grep -q 'capability query bypassed model processing' "$WORKER"
grep -q 'buildEchelonSessionKey' "$WORKER"
grep -q 'Do not enable session transcript indexing' "$ROOT_DIR/workspace/skills/openclaw-mem/SKILL.md"
grep -q 'Do not write memory after ordinary chat' "$ROOT_DIR/workspace/AGENTS.md"
grep -q 'AGENTS.md CONFIG.md HEARTBEAT.md' "$ROOT_DIR/deploy/entrypoint.sh"
grep -q 'MEMORY.pre-context-compaction.md' "$ROOT_DIR/deploy/entrypoint.sh"
node --test "$ROOT_DIR/workspace/scripts/echelon-model-route.test.mjs" >/dev/null
node --test "$ROOT_DIR/workspace/scripts/echelon-app-signal-policy.test.mjs" >/dev/null
node --test "$ROOT_DIR/workspace/scripts/echelon-session-key.test.mjs" >/dev/null
node --test "$ROOT_DIR/workspace/scripts/echelon-capability-query.test.mjs" >/dev/null
node --test "$ROOT_DIR/workspace/scripts/echelon-workbook-attachment.test.mjs" >/dev/null
node --test "$ROOT_DIR/workspace/scripts/echelon-reply-capture.test.mjs" >/dev/null
node --test "$ROOT_DIR/workspace/scripts/echelon-slack-delivery.test.mjs" >/dev/null
node --test "$ROOT_DIR/workspace/scripts/repo-c-lane-a.test.mjs" >/dev/null
node --test "$ROOT_DIR/workspace/scripts/github-via-owner.test.mjs" >/dev/null

if grep -q 'plugins list' "$ROOT_DIR/deploy/entrypoint.sh"; then
  echo "Entrypoint must not dump the full plugin inventory during startup." >&2
  exit 1
fi

if grep -q 'routedChatCompletion' "$WORKER"; then
  echo "Worker must use the canonical synchronous completion path." >&2
  exit 1
fi

echo "Cost-control invariants verified."
