# Setup Instructions

## Initial Git Setup

If this is a new repository, run:

```bash
git init
git add .
git commit -m "Initial commit: Agentic Control Plane Kit"
```

## Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `agentic-control-plane-kit`
3. Visibility: Private (recommended for internal tooling)
4. Do NOT initialize with README, .gitignore, or license (we already have these)

## Connect and Push

```bash
# Add remote (replace YOUR_ORG with your GitHub org/username)
git remote add origin https://github.com/YOUR_ORG/agentic-control-plane-kit.git

# Or if using SSH:
git remote add origin git@github.com:YOUR_ORG/agentic-control-plane-kit.git

# Push to main branch
git branch -M main
git push -u origin main
```

## For The-Gig-Agency Organization

If pushing to The-Gig-Agency organization:

```bash
git remote add origin https://github.com/The-Gig-Agency/agentic-control-plane-kit.git
git branch -M main
git push -u origin main
```
