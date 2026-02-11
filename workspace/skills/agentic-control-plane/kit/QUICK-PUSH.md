# Quick Push Guide

## TL;DR

```bash
# 1. Create repo on GitHub: https://github.com/new
#    Name: agentic-control-plane-kit
#    Private, no README/.gitignore/license

# 2. Push the kit
cd /Users/rastakit/tga-workspace/repos/agentic-control-plane-kit
git init
git add .
git commit -m "Initial commit: Agentic Control Plane Kit"
git remote add origin https://github.com/The-Gig-Agency/agentic-control-plane-kit.git
git branch -M main
git push -u origin main

# 3. Check onsite-affiliate for docs to commit
cd /Users/rastakit/tga-workspace/repos/onsite-affiliate
git status
# If docs/AGENTIC-CONTROL-PLANE-MASTER.md or docs/MANAGEMENT-API.md changed:
git add docs/
git commit -m "docs: Add agentic control plane documentation"
git push
```

## Full Details

See [REPOSITORY-SETUP.md](./REPOSITORY-SETUP.md) for complete instructions.
