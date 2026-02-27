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
OPENCLAW_HOOK_TOKEN=
EOF

# Force OpenAI gpt-5.2 for Railway (override whatever was in ~/.openclaw)
# Strip legacy agent.* key (use agents.defaults only)
if [ -f "$DEST/openclaw.json" ] && command -v jq &>/dev/null; then
  jq '
    del(.agent) |
    .agents.defaults.model.primary = "openai/gpt-5.2" |
    .agents.defaults.model.fallbacks = ["openai/gpt-4o-mini"] |
    (.agents.list[]? | select(.id == "main") | .model) = "openai/gpt-5.2"
  ' "$DEST/openclaw.json" > "$DEST/openclaw.json.tmp" && mv "$DEST/openclaw.json.tmp" "$DEST/openclaw.json"
  echo "Set packaged model to openai/gpt-5.2 for Railway"
fi

echo "Done. Runtime packaged in $DEST"
echo "Next: docker build -f deploy/Dockerfile -t openclaw-gateway ."
echo "Or: railway up (after linking project)"
