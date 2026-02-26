# Runtime template

Used when `deploy/runtime/` is absent (e.g. GitHub-triggered builds).
For local/CLI deploys, run `./deploy/package-runtime.sh` to create `deploy/runtime/` from ~/.openclaw/.

Never commit .env or credentials in runtime-template.
