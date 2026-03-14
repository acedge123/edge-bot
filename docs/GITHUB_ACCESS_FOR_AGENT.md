# Giving the agent GitHub access (clone/pull from private repos)

If you want the agent to **clone or pull** from private repos (e.g. “Repo A”, “Repo B”, “Repo C”), the environment where the agent runs needs a **GitHub identity** with read access to those repos.

**Hosted / Railway / containers:** The runtime image often has **no `ssh` binary** and **no sudo**, so **use HTTPS only** — do not rely on `git clone git@github.com:...`. Set **`GITHUB_TOKEN`** in Railway (or env) and clone with HTTPS (see below). No elevated commands or `apt-get install openssh-client` required.

**Recommendation:** Prefer **HTTPS clone** (Option 1 below). Do **not** enable elevated/sudo just to install `openssh-client`; cloning over HTTPS with `GITHUB_TOKEN` is sufficient and keeps the runtime minimal. If you want the agent to never clone at runtime, use **Option 3** (bake repos into the image at build time).

---

## Option 1: Personal Access Token (PAT) — recommended

Use a **GitHub Personal Access Token** so the agent can use HTTPS to clone/pull. No separate “machine user” required if your own account (or an org bot account) will be granted access.

### 1. Create a token

- **Fine-grained (recommended):** [GitHub → Settings → Developer settings → Personal access tokens → Fine-grained](https://github.com/settings/tokens?type=beta)  
  - Repository access: “Only select repositories” → choose Repo B and Repo C (and any others the agent needs).  
  - Permissions: **Contents** = Read-only, **Metadata** = Read-only.
- **Classic:** [GitHub → Settings → Developer settings → Personal access tokens (classic)](https://github.com/settings/tokens)  
  - Scope: `repo` (or minimal scopes that include read for those repos).

### 2. Grant the token’s account access to the repos

- If the token is for **your user:** Ensure that user is a read-only collaborator (or has access via org membership) on Repo B and Repo C.
- If the token is for a **machine user / bot account:** Invite that GitHub user as a **read-only collaborator** (or add it to an org team with read access) on Repo B and Repo C.  
  - [Repo → Settings → Collaborators → Add people](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-github-profile/managing-your-profile) and add the bot user with **Read** role.

### 3. Put the token where the agent runs

- **Railway (or any env vars):** Add a variable, e.g.  
  **`GITHUB_TOKEN`** = `<your-token>`  
  (Mark as secret if the UI has that option.)
- **Local / self-hosted:** In `~/.openclaw/.env` (or whatever env the gateway uses):  
  `GITHUB_TOKEN=<your-token>`

### 4. Make `git clone` use the token (HTTPS — no SSH needed)

In Railway/containers there is usually **no `ssh`** and **no sudo**, so **always use HTTPS**. For unauthenticated clone without prompts, use the token in the URL:

```bash
git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/OWNER/REPO.git" /path/to/dir
```

- **If `gh` CLI is available:** The agent can run:  
  `echo "$GITHUB_TOKEN" | gh auth login --with-token`  
  then `gh repo clone OWNER/REPO` (or plain `git clone https://github.com/OWNER/REPO.git` and gh’s credential helper will use the token).
- **Otherwise (typical in slim containers):** Use the URL form above. Example for three repos into the workspace:

```bash
# Example: clone Repo A, B, C into workspace (agent can then grep/read them)
git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/The-Gig-Agency/agentic-control-plane-kit.git" /app/.openclaw/workspace/repos/agentic-control-plane-kit
git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/YOUR_ORG/repo-b.git"      /app/.openclaw/workspace/repos/repo-b
git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/YOUR_ORG/repo-c.git"      /app/.openclaw/workspace/repos/repo-c
```

Replace `YOUR_ORG/repo-b` and `YOUR_ORG/repo-c` with the real owner/repo names. **Repo A** (agentic-control-plane-kit) canonical URL: **`https://github.com/The-Gig-Agency/agentic-control-plane-kit.git`**.

After this, the “GitHub identity” that has access is the **account that owns the PAT**. So you’re effectively “giving the agent” that account’s read access to the repos you added.

---

## Option 2: Machine user as read-only collaborator

If you prefer a dedicated GitHub account for the agent (e.g. `myorg-edge-bot`):

1. **Create a GitHub account** for the bot (use a dedicated email, org-owned if possible).
2. **Create a Fine-grained or Classic PAT** for that account with read-only access to the right repos (as in Option 1).
3. **Invite that GitHub user** as a **read-only collaborator** (or org team member with read) on Repo B and Repo C:  
   Repo → Settings → Collaborators → Add people → add the bot → role **Read**.
4. **Set the token in the agent environment** as **`GITHUB_TOKEN`** (Railway, `~/.openclaw/.env`, or equivalent).
5. Use the same **clone/auth** approach as in Option 1 (e.g. `gh auth login --with-token` or token in URL / credential helper).

Then the “identity” that has access is the machine user; you’ve given the agent access by inviting that user and configuring its token in the environment.

---

## Summary

| Step | What to do |
|------|------------|
| **Identity** | Either your (or org) account with a PAT, or a dedicated machine user with a PAT. |
| **Access** | Invite that account as **read-only collaborator** (or org team read) on Repo B and Repo C. |
| **Config** | Set **`GITHUB_TOKEN`** in the environment where the agent runs (Railway env vars, `~/.openclaw/.env`, etc.). |
| **Clone** | Use `gh auth login --with-token` when `gh` is available, or clone with `https://x-access-token:${GITHUB_TOKEN}@github.com/owner/repo.git` (or a credential helper). |

After that, the agent can `git clone` (or pull) from those repos from inside the same environment.

---

## Option 3: Bake repos into the image at build time (no runtime clone)

If you prefer the agent to **already have** Repo A, B, and C on disk with no clone at runtime (no `GITHUB_TOKEN` in the running container, no SSH/HTTPS from the agent):

1. During **Docker build** you have `apt-get` and can install anything. Add a build step that clones the repos into `/app/.openclaw/workspace/repos/` using a **build-time** secret (e.g. `GITHUB_TOKEN` as a build arg, or use public clone if the repos are public).
2. The Dockerfile would need to accept `GITHUB_TOKEN` as an ARG (only available during build; never in the final image if you don’t pass it at runtime), then run the same `git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/..."` commands.
3. Railway: you can set build-time secrets and pass them as build args so the image is built with the repos already present. The agent then only greps/reads; it never runs `git clone`.

This is “easier for the environment” in the sense that the agent doesn’t need to clone at all — you do the clone once in the image. Tradeoff: updates to A/B/C require a rebuild/redeploy.

**Example Dockerfile addition** (after `COPY workspace/`; requires build arg `GITHUB_TOKEN` for private repos):

```dockerfile
# Optional: clone expert repos at build time (no ssh, no runtime clone)
ARG GITHUB_TOKEN
ENV REPOS_ROOT=/app/.openclaw/workspace/repos
RUN mkdir -p "$REPOS_ROOT" && \
    if [ -n "$GITHUB_TOKEN" ]; then \
      git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/The-Gig-Agency/agentic-control-plane-kit.git" "$REPOS_ROOT/agentic-control-plane-kit" || true; \
      # git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/YOUR_ORG/repo-b.git" "$REPOS_ROOT/repo-b" || true; \
      # git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/YOUR_ORG/repo-c.git" "$REPOS_ROOT/repo-c" || true; \
    fi
```

Build with: `docker build --build-arg GITHUB_TOKEN=xxx ...`. In Railway, set `GITHUB_TOKEN` as a build-time secret and pass it as a build arg so the image is built with the repos; do not expose it at runtime if you don’t need runtime clone.

---

## Saving workspace files (MEMORY.md, memory/*) vs. pushing to GitHub

**Does the agent need edge-bot repo access to save files?** **No.**

| Action | Needs GitHub? | Notes |
|--------|----------------|--------|
| **Write files** (e.g. `MEMORY.md`, `memory/2026-03-12.md`, `skills.md`) | **No** | Plain filesystem writes. The agent can save to the workspace directory on Railway with no token. |
| **Commit locally** (`git add` + `git commit` in the workspace) | **No** | Git commit only touches local `.git`. No push, no GitHub. |
| **Push to GitHub** (e.g. push workspace commits to the edge-bot repo) | **Yes** | Requires a token with **write** access to the edge-bot repo (Contents = Read and write for Fine-grained, or `repo` for Classic). |

So the agent **can save locally** without any repo access. It does **not** need edge-bot (or any) repo access just to write or commit in the workspace.

**If the workspace has its own `.git`** (e.g. it’s the edge-bot repo or a clone):

- The agent can **write** and **commit** locally. No GitHub needed.
- If you **don’t** want those commits (or the workspace repo) tracked/pushed, you can:
  - Tell the agent to **not** run `git commit` / `git push` for the workspace (just write files), or
  - Add a `.gitignore` for `repos/`, `memory/`, or other paths you don’t want in the workspace repo.
- If you **do** want the agent to push memory/workspace changes to the edge-bot repo, then give the same token (or a second one) **write** access to the edge-bot repo and have the agent push. Fine-grained: **Contents** = Read and write.

**Persistence on Railway:** Writes to the workspace directory persist only for the lifetime of that deployment (no persistent volume = lost on redeploy). For durable memory across redeploys, use **Agent Vault** (Supabase) or have the agent push to the edge-bot repo so GitHub is the source of truth.
