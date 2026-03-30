# OpenClaw Gateway — Railway / Docker
# Packages the OpenClaw runtime for hosted deployment.
# Secrets: set via Railway env vars (never in image).
#
# Build from OpenClaw_Github root:
#   ./deploy/package-runtime.sh
#   docker build -f deploy/Dockerfile -t openclaw-gateway .

FROM node:22-slim

ENV OPENCLAW_STATE_DIR=/app/.openclaw
ENV NODE_ENV=production

# Install git, ca-certificates, jq, curl, python3 (agent tools may run curl/python)
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates jq curl python3 \
  && rm -rf /var/lib/apt/lists/*

# AWS Roles Anywhere signing helper (for credential_process)
# Installs aws_signing_helper to /usr/local/bin (arch-aware).
RUN set -eux; \
  arch="$(dpkg --print-architecture)"; \
  case "$arch" in \
    amd64) helper="aws_signing_helper-linux-amd64" ;; \
    arm64) helper="aws_signing_helper-linux-arm64" ;; \
    *) echo "Unsupported architecture for aws_signing_helper: $arch" >&2; exit 1 ;; \
  esac; \
  curl -fsSL "https://rolesanywhere.amazonaws.com/releases/latest/${helper}" -o /usr/local/bin/aws_signing_helper; \
  chmod +x /usr/local/bin/aws_signing_helper; \
  /usr/local/bin/aws_signing_helper version || true

# Use HTTPS for git (avoids ssh for public deps like libsignal-node)
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"

# Install OpenClaw globally
RUN npm install -g openclaw@latest

# Create runtime directory
RUN mkdir -p /app/.openclaw

# Copy runtime: use packaged (from package-runtime.sh) if present, else template (for GitHub builds)
COPY deploy/ /tmp/deploy/
RUN if [ -d /tmp/deploy/runtime ] && [ -n "$(ls -A /tmp/deploy/runtime 2>/dev/null)" ]; then \
      cp -a /tmp/deploy/runtime/. /app/.openclaw/; \
    else \
      cp -a /tmp/deploy/runtime-template/. /app/.openclaw/; \
    fi && rm -rf /tmp/deploy

# Force OpenAI gpt-5.2 in image (overrides any packaged/template config)
# Use agents.defaults only (legacy agent.* key removed)
RUN if [ -f /app/.openclaw/openclaw.json ]; then \
      jq 'del(.agent) | .agents.defaults.model.primary = "openai/gpt-5.2" | .agents.defaults.model.fallbacks = ["openai/gpt-4o-mini"] | .agents.defaults.workspace = "/app/.openclaw/workspace" | .hooks.enabled = true | .hooks.token = "${OPENCLAW_HOOK_TOKEN}" | .gateway.controlUi.allowedOrigins = ["https://edge-bot-production.up.railway.app"] | .gateway.http.endpoints.chatCompletions.enabled = true | .gateway.http.endpoints.chatCompletions.images.allowUrl = true | del(.gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback)' /app/.openclaw/openclaw.json > /tmp/oc.json && mv /tmp/oc.json /app/.openclaw/openclaw.json; \
    else \
      echo '{"agents":{"defaults":{"workspace":"/app/.openclaw/workspace","model":{"primary":"openai/gpt-5.2","fallbacks":["openai/gpt-4o-mini"]}}},"auth":{"profiles":{"openai:default":{"provider":"openai","mode":"api_key"}},"order":{"openai":["openai:default"]}},"env":{"vars":{}},"hooks":{"enabled":true,"token":"${OPENCLAW_HOOK_TOKEN}"},"gateway":{"controlUi":{"allowedOrigins":["https://edge-bot-production.up.railway.app"]},"http":{"endpoints":{"chatCompletions":{"enabled":true,"images":{"allowUrl":true}}}}}}' > /app/.openclaw/openclaw.json; \
    fi

# Copy workspace (CONFIG.md, scripts, skills incl. repo-map, etc.)
# workspace/skills has highest precedence per OpenClaw; must be present
COPY workspace/ /app/.openclaw/workspace/
RUN ls -la /app/.openclaw/workspace/ && ls -la /app/.openclaw/workspace/skills/ 2>/dev/null || echo "WARN: workspace/skills missing"

# Volume-safe workspace: keep a baked copy to seed into a mounted volume
RUN rm -rf /app/.openclaw/workspace.baked && cp -a /app/.openclaw/workspace /app/.openclaw/workspace.baked
COPY deploy/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

WORKDIR /app

EXPOSE 18789

# Gateway + Echelon worker: gateway in background, worker polls agent-next
# Bind to Railway port and all interfaces (0.0.0.0 required for Railway)
# OPENCLAW_GATEWAY_PORT so gateway call connects to correct port
CMD ["/app/entrypoint.sh"]
