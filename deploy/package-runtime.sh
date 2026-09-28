#!/bin/bash
# Package ~/.openclaw runtime for Docker (excludes secrets).
# Run from OpenClaw_Github root.
# Output: deploy/runtime/

set -e
SRC="${1:-$HOME/.openclaw}"
DEST="$(cd "$(dirname "$0")" && pwd)/runtime"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Packaging OpenClaw runtime from $SRC -> $DEST"

rm -rf "$DEST"
mkdir -p "$DEST"

# Copy core runtime (exclude secrets and volatile dirs)
if command -v rsync &>/dev/null; then
  rsync -aL \
    --exclude='.env' \
    --exclude='*.key' --exclude='*.pem' --exclude='*.p12' \
    --exclude='credentials/' --exclude='logs/' --exclude='media/' \
    --exclude='delivery-queue/' --exclude='browser/' --exclude='canvas/' \
    --exclude='.git' --exclude='workspace' \
    --exclude='node_modules/' --exclude='**/node_modules/' \
    --exclude='agents/*/sessions/' \
    "$SRC/" "$DEST/"
else
  for f in config.yaml openclaw.json; do
    [ -f "$SRC/$f" ] && cp "$SRC/$f" "$DEST/"
  done
  for d in agents memory skills identity hooks cron completions devices subagents; do
    [ -d "$SRC/$d" ] && cp -r "$SRC/$d" "$DEST/"
  done
fi

# Workspace comes from repo (COPY in Dockerfile), not from ~/.openclaw/workspace

# Create .env.template for reference (secrets injected at runtime via Railway)
cat > "$DEST/.env.template" << 'EOF'
# Set these in Railway env vars — never commit real values
OPENCLAW_GATEWAY_TOKEN=
OPENAI_API_KEY=
AGENT_VAULT_URL=
AGENT_EDGE_KEY=
AGENT_HOSTED_EDGE_KEY=
OPENCLAW_HOOK_TOKEN=
ECHELON_EDGE_URL=
EOF

# Force OpenAI defaults for Railway (override whatever was in ~/.openclaw)
# Strip legacy agent.* key and use the keyed agents.entries roster.
if [ -f "$DEST/openclaw.json" ] && command -v jq &>/dev/null; then
  jq '
    del(.agent) |
    .agents.ownership = "explicit" |
    .agents.defaults.workspace = "/app/.openclaw/workspace" |
    .agents.defaults.model.primary = "openai/gpt-5.6-luna" |
    .agents.defaults.model.fallbacks = ["openai/gpt-5.6-sol"] |
    .agents.defaults.thinkingDefault = "low" |
    .agents.defaults.heartbeat.every = "0m" |
    .agents.defaults.heartbeat.agentId = "main" |
    .agents.defaults.contextInjection = "always" |
    .agents.defaults.bootstrapMaxChars = 20000 |
    .agents.defaults.bootstrapTotalMaxChars = 150000 |
    .agents.defaults.startupContext = {"enabled":true} |
    .agents.defaults.systemAgent.agentId = "main" |
    .agents.entries = {"main":{"model":"openai/gpt-5.6-luna","workspace":"/app/.openclaw/workspace"},"main-light":{"model":"openai/gpt-5.6-luna","workspace":"/app/.openclaw/workspace"},"main-med":{"model":"openai/gpt-5.6-sol","workspace":"/app/.openclaw/workspace"},"main-critical":{"model":"openai/gpt-5.6-sol","workspace":"/app/.openclaw/workspace"}} |
    .memory.search.enabled = true |
    .memory.search.provider = "none" |
    .memory.search.rememberAcrossConversations = false |
    .memory.search.sources = ["memory"] |
    .cron.enabled = false |
    .cron.triggers.enabled = false |
    .skills.workshop.autonomous.mode = "off" |
    .tools.deny = ["computer","sessions_spawn","subagents","automations","skill_workshop","canvas","image_generate","music_generate","video_generate","tts","nodes","node_exec","node_inference","mobile_ui","conversations_*","sessions_list","sessions_history","sessions_search","sessions_send","sessions_yield","agents_list","progress_card"] |
    .skills.allowBundled = [] |
    del(.skills.limits) |
    .discovery.mdns.mode = "off" |
    .plugins.entries["memory-core"].enabled = true |
    .plugins.entries["memory-core"].config.dreaming.enabled = false |
    .plugins.entries.brave.enabled = true |
    .plugins.entries.codex.enabled = true |
    del(.auth.profiles["openai:default"]) |
    del(.auth.order.openai) |
    del(.agents.list)
  ' "$DEST/openclaw.json" > "$DEST/openclaw.json.tmp" && mv "$DEST/openclaw.json.tmp" "$DEST/openclaw.json"
  jq -e '
    .agents.defaults.heartbeat.every == "0m" and
    .agents.defaults.thinkingDefault == "low" and
    .agents.defaults.contextInjection == "always" and
    .agents.defaults.bootstrapMaxChars == 20000 and
    .agents.defaults.bootstrapTotalMaxChars == 150000 and
    .agents.defaults.startupContext.enabled == true and
    (.agents.entries.main | has("skills") | not) and
    (.skills | has("limits") | not) and
    (.tools.deny | index("computer")) != null and
    (.tools.deny | index("sessions_spawn")) != null and
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
  ' "$DEST/openclaw.json" >/dev/null
  echo "Applied Railway cost controls: tiered models, disabled autonomous work, bounded bootstrap context"
fi

echo "Done. Runtime packaged in $DEST"
echo "Next: docker build -f deploy/Dockerfile -t openclaw-gateway ."
echo "Or: railway up (after linking project)"
