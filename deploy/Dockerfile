# OpenClaw Gateway — Railway / Docker
# Packages the OpenClaw runtime for hosted deployment.
# Secrets: set via Railway env vars (never in image).
#
# Build from OpenClaw_Github root:
#   ./deploy/package-runtime.sh
#   docker build -f deploy/Dockerfile -t openclaw-gateway .

FROM node:22.22.3-slim

ENV OPENCLAW_STATE_DIR=/app/.openclaw
ENV NODE_ENV=production

# Install runtime tools. openpyxl lets the hosted agent inspect Excel uploads without per-job installs.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates jq curl python3 python3-openpyxl python3-xlrd \
  && rm -rf /var/lib/apt/lists/*

# AWS Roles Anywhere signing helper (for credential_process)
# Pinned version + paths from AWS release notes (not releases/latest/*-linux-amd64; those 403).
ARG AWS_SIGNING_HELPER_VERSION=1.8.0
RUN set -eux; \
  arch="$(dpkg --print-architecture)"; \
  case "$arch" in \
    amd64) rel_path="X86_64/Linux/Amzn2023/aws_signing_helper" ;; \
    arm64) rel_path="Aarch64/Linux/Amzn2023/aws_signing_helper" ;; \
    *) echo "Unsupported architecture for aws_signing_helper: $arch" >&2; exit 1 ;; \
  esac; \
  curl -fsSL "https://rolesanywhere.amazonaws.com/releases/${AWS_SIGNING_HELPER_VERSION}/${rel_path}" \
    -o /usr/local/bin/aws_signing_helper; \
  chmod +x /usr/local/bin/aws_signing_helper; \
  /usr/local/bin/aws_signing_helper version || true

# Use HTTPS for git (avoids ssh for public deps like libsignal-node)
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"

# Install OpenClaw globally
# Pin to npm dist-tag latest; see https://github.com/openclaw/openclaw/releases
ARG OPENCLAW_VERSION=2026.8.2
RUN npm install -g "openclaw@${OPENCLAW_VERSION}"

# Root-owned, policy-constrained client for Mom Walk /manage actions. The agent
# may execute this binary, but does not receive general shell or curl access.
COPY tools/mom-walk-manage.mjs /usr/local/lib/edge-bot/mom-walk-manage.mjs
RUN chmod 755 /usr/local/lib/edge-bot/mom-walk-manage.mjs \
  && ln -s /usr/local/lib/edge-bot/mom-walk-manage.mjs /usr/local/bin/mom-walk-manage

# Create runtime directory
RUN mkdir -p /app/.openclaw

# Copy runtime: use packaged (from package-runtime.sh) if present, else template (for GitHub builds)
COPY deploy/ /tmp/deploy/
RUN if [ -d /tmp/deploy/runtime ] && [ -n "$(ls -A /tmp/deploy/runtime 2>/dev/null)" ]; then \
      cp -a /tmp/deploy/runtime/. /app/.openclaw/; \
    else \
      cp -a /tmp/deploy/runtime-template/. /app/.openclaw/; \
    fi && rm -rf /tmp/deploy

# Control UI CORS: set per Railway service at image build (clone-friendly). Default keeps current prod URL.
# Railway: Service → Settings → Build → Docker Build Args → CONTROL_UI_ALLOWED_ORIGINS=https://…
ARG CONTROL_UI_ALLOWED_ORIGINS=https://edge-bot-production.up.railway.app

# Force one reviewed runtime policy over either packaged or template config.
COPY deploy/apply-runtime-config.jq /tmp/apply-runtime-config.jq
RUN test -f /app/.openclaw/openclaw.json && \
    jq --arg origin "${CONTROL_UI_ALLOWED_ORIGINS}" -f /tmp/apply-runtime-config.jq \
      /app/.openclaw/openclaw.json > /tmp/oc.json && \
    mv /tmp/oc.json /app/.openclaw/openclaw.json && \
    rm /tmp/apply-runtime-config.jq

# Fail the image build if an OpenClaw upgrade or config rewrite removes a cost guardrail.
RUN jq -e '.agents.defaults.heartbeat.every == "0m" and .agents.defaults.thinkingDefault == "low" and .agents.defaults.contextInjection == "continuation-skip" and .agents.defaults.bootstrapTotalMaxChars == 12000 and .agents.defaults.startupContext.enabled == false and .agents.defaults.contextPruning.mode == "cache-ttl" and .agents.defaults.compaction.keepRecentTokens == 8000 and .agents.defaults.compaction.recentTurnsPreserve == 2 and .agents.defaults.compaction.postIndexSync == "off" and .agents.defaults.compaction.memoryFlush.enabled == false and .session.reset.idleMinutes == 60 and .skills.allowBundled == [] and .skills.limits.maxSkillsInPrompt == 12 and .skills.limits.maxSkillsPromptChars == 2200 and (.agents.entries.main.skills | length) == 12 and (.agents.entries["main-med"].skills | length) == 12 and (.tools.deny | index("computer")) != null and (.tools.deny | index("sessions_spawn")) != null and (.tools.deny | index("automations")) != null and .memory.search.enabled == false and .memory.search.provider == "none" and .cron.enabled == false and .cron.triggers.enabled == false and .skills.workshop.autonomous.mode == "off" and .plugins.entries["memory-core"].config.dreaming.enabled == false and .agents.defaults.model.primary == "openai/gpt-5.6-luna" and .agents.entries.main.model == "openai/gpt-5.6-luna" and .agents.entries["main-light"].model == "openai/gpt-5.6-luna" and .agents.entries["main-med"].model == "openai/gpt-5.6-sol" and .agents.entries["main-critical"].model == "openai/gpt-5.6-sol"' /app/.openclaw/openclaw.json >/dev/null
RUN OPENCLAW_STATE_DIR=/app/.openclaw openclaw config validate

# Copy workspace (CONFIG.md, scripts, skills incl. repo-map, etc.)
# workspace/skills has highest precedence per OpenClaw; must be present
COPY workspace/ /app/.openclaw/workspace/
# Wiki reference docs (mirrored from sunafusion-agent-shell) for hosted agent read path under workspace/docs/
COPY docs/WIKI_SYSTEM_OVERVIEW.md docs/WIKI_USAGE_GUIDE.md /app/.openclaw/workspace/docs/
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
