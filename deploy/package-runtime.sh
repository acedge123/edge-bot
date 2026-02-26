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
  rsync -a \
    --exclude='.env' \
    --exclude='*.key' --exclude='*.pem' --exclude='*.p12' \
    --exclude='credentials/' --exclude='logs/' --exclude='media/' \
    --exclude='delivery-queue/' --exclude='browser/' --exclude='canvas/' \
    --exclude='.git' --exclude='workspace' \
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
ANTHROPIC_API_KEY=
OPENROUTER_API_KEY=
AGENT_VAULT_URL=
AGENT_EDGE_KEY=
OPENCLAW_HOOK_TOKEN=
EOF

echo "Done. Runtime packaged in $DEST"
echo "Next: docker build -f deploy/Dockerfile -t openclaw-gateway ."
echo "Or: railway up (after linking project)"
