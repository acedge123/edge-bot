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

# Install git + ca-certificates (git for npm deps, ca-certs for HTTPS)
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

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

# Copy workspace (AGENTS.md, scripts, skills, etc.)
COPY workspace/ /app/.openclaw/workspace/

WORKDIR /app

EXPOSE 18789

# Gateway binds to 0.0.0.0 for Railway (override bind in config for production)
CMD ["openclaw", "gateway", "--port", "18789", "--allow-unconfigured"]
