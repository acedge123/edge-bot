#!/bin/bash
# Deploy to Railway from a clean bundle (avoids Cursor socket / symlink issues).
# Run from OpenClaw_Github root:
#   ./deploy/railway-deploy.sh
#
# The tracked, sanitized runtime-template is sufficient. If a local
# deploy/runtime package exists, Docker will prefer it as documented.

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="/tmp/openclaw-railway-bundle"

cd "$REPO_ROOT"

# Require at least the tracked sanitized runtime source used by CI deployments.
[ -f "deploy/runtime-template/openclaw.json" ] || {
  echo "Missing deploy/runtime-template/openclaw.json"
  exit 1
}

echo "Bundling to $BUNDLE (no symlinks, dereferenced)..."

rm -rf "$BUNDLE"
mkdir -p "$BUNDLE/deploy" "$BUNDLE/workspace"

# Copy deploy/ - dereference symlinks (-L) so no symlinks in output
rsync -aL \
  --exclude='.git' \
  --exclude='node_modules' \
  "$REPO_ROOT/deploy/" "$BUNDLE/deploy/"

# Copy workspace/ - exclude node_modules, .venv
rsync -aL \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.venv' \
  "$REPO_ROOT/workspace/" "$BUNDLE/workspace/"

# Railway expects railway.json and Dockerfile at deploy/
cp "$REPO_ROOT/deploy/railway.json" "$BUNDLE/"
cp "$REPO_ROOT/deploy/railway.json" "$BUNDLE/deploy/" 2>/dev/null || true

echo "Bundle size: $(du -sh "$BUNDLE" | cut -f1)"
echo "Running railway up from clean bundle..."
cd "$BUNDLE"
railway up --no-gitignore --verbose
