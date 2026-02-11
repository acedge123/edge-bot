# Repository Setup & Push Instructions

## Overview

This document provides step-by-step instructions to:
1. Create the GitHub repository for `agentic-control-plane-kit`
2. Push the kit to GitHub
3. Push any related changes to `onsite-affiliate`

---

## Part 1: Create & Push agentic-control-plane-kit

### Step 1: Create GitHub Repository

1. Go to: https://github.com/new
2. **Repository name**: `agentic-control-plane-kit`
3. **Owner**: `The-Gig-Agency` (or your organization)
4. **Visibility**: **Private** (recommended for internal tooling)
5. **DO NOT** check any of these:
   - ❌ Add a README file
   - ❌ Add .gitignore
   - ❌ Choose a license
   
   (We already have all of these)
6. Click **"Create repository"**

### Step 2: Initialize Git and Push

Open terminal and run:

```bash
# Navigate to the kit directory
cd /Users/rastakit/tga-workspace/repos/agentic-control-plane-kit

# Initialize git (if not already initialized)
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: Agentic Control Plane Kit

- Kernel: Core router, auth, audit, idempotency, rate limiting, ceilings
- Packs: IAM, Webhooks, Settings (universal packs)
- Domain template: Starter template for repo-specific actions
- OpenAPI generator: Auto-generate OpenAPI 3.0 spec
- Invariant tests: Cross-repo compatibility tests
- Integration guide: Step-by-step Django/Express/Supabase examples"

# Add remote (replace The-Gig-Agency if different)
git remote add origin https://github.com/The-Gig-Agency/agentic-control-plane-kit.git

# Set main branch
git branch -M main

# Push to GitHub
git push -u origin main
```

### Step 3: Verify

After pushing, verify at:
**https://github.com/The-Gig-Agency/agentic-control-plane-kit**

You should see:
- ✅ README.md
- ✅ kernel/ directory (with src/ subdirectory)
- ✅ packs/ directory (iam, webhooks, settings, domain-template)
- ✅ config/ directory (bindings schema and example)
- ✅ tests/ directory (invariant tests with mocks)
- ✅ scripts/ directory (OpenAPI generator)
- ✅ INTEGRATION-GUIDE.md
- ✅ PUSH-INSTRUCTIONS.md
- ✅ package.json, tsconfig.json

---

## Part 2: Push Changes to onsite-affiliate (if needed)

The onsite-affiliate repo has documentation files that reference the control plane:

- `docs/AGENTIC-CONTROL-PLANE-MASTER.md` - Generic blueprint
- `docs/MANAGEMENT-API.md` - OA-specific implementation

### Check Status

```bash
cd /Users/rastakit/tga-workspace/repos/onsite-affiliate
git status
```

### If There Are Changes to Commit

```bash
# Review changes
git diff

# Stage documentation files
git add docs/AGENTIC-CONTROL-PLANE-MASTER.md docs/MANAGEMENT-API.md

# Commit
git commit -m "docs: Add agentic control plane blueprint and management API docs"

# Push
git push origin main
```

---

## Troubleshooting

### Authentication Issues

If `git push` fails with authentication:

**Option 1: Use GitHub CLI**
```bash
gh auth login
git push -u origin main
```

**Option 2: Use SSH**
```bash
git remote set-url origin git@github.com:The-Gig-Agency/agentic-control-plane-kit.git
git push -u origin main
```

**Option 3: Use Personal Access Token**
- Go to: https://github.com/settings/tokens
- Create token with `repo` scope
- Use token as password when prompted

### Remote Already Exists

If you get "remote origin already exists":

```bash
git remote set-url origin https://github.com/The-Gig-Agency/agentic-control-plane-kit.git
```

### Force Push (Use with Caution!)

Only if you need to overwrite remote:

```bash
git push -u origin main --force
```

⚠️ **Warning**: Force push overwrites remote history. Only use if you're sure!

---

## Next Steps After Pushing

1. **Set up repository settings**:
   - Add description: "Reusable starter kit for adding /manage control-plane API to multi-tenant SaaS platforms"
   - Add topics: `control-plane`, `api`, `multi-tenant`, `agentic`, `management-api`
   - Enable branch protection for `main` (optional but recommended)

2. **Add collaborators** (if needed):
   - Settings → Collaborators → Add people

3. **Create initial release** (optional):
   - Go to Releases → Create a new release
   - Tag: `v0.1.0`
   - Title: "Initial Release: Agentic Control Plane Kit"
   - Description: Copy from README.md overview

4. **Update onsite-affiliate** to reference the kit:
   - Add link to kit repo in documentation
   - Update integration instructions

---

## Repository Structure Reference

```
agentic-control-plane-kit/
├── README.md                    # Main documentation
├── INTEGRATION-GUIDE.md         # Django/Express/Supabase examples
├── PUSH-INSTRUCTIONS.md         # This file
├── package.json                 # NPM dependencies
├── tsconfig.json                # TypeScript config
├── kernel/                      # Core router and utilities
│   ├── index.ts
│   └── src/
│       ├── router.ts            # Main /manage router
│       ├── auth.ts              # API key validation
│       ├── audit.ts             # Audit logging
│       ├── idempotency.ts       # Idempotency cache
│       ├── rate_limit.ts        # Rate limiting
│       ├── ceilings.ts          # Hard ceilings
│       ├── validate.ts          # Schema validation
│       ├── openapi.ts           # OpenAPI generator
│       ├── pack.ts              # Pack contract
│       ├── meta-pack.ts         # Built-in meta pack
│       └── types.ts             # TypeScript interfaces
├── packs/                       # Swappable domain modules
│   ├── iam/                     # IAM pack (keys, teams)
│   ├── webhooks/                # Webhooks pack
│   ├── settings/                # Settings pack
│   ├── domain-template/         # Template for repo-specific
│   └── index.ts                 # Pack exports
├── config/                      # Bindings configuration
│   ├── bindings.schema.json     # JSON schema
│   └── example.bindings.json    # Example config
├── tests/                       # Invariant tests
│   ├── invariants.spec.ts       # Core invariant tests
│   └── mocks/                   # Mock adapters
└── scripts/                     # Utility scripts
    └── generate-openapi.ts       # OpenAPI generator
```

---

## Questions?

- See [README.md](./README.md) for usage
- See [INTEGRATION-GUIDE.md](./INTEGRATION-GUIDE.md) for integration examples
- See [MASTER-BLUEPRINT.md](./MASTER-BLUEPRINT.md) for complete specification (if exists)
