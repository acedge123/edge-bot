---
name: openai-model-router-lite
description: Lightweight model-routing for OpenClaw that chooses a cheaper OpenAI model for simple prompts and a stronger model for coding/complex tasks. Use when you want to save tokens/cost by auto-selecting a model (e.g., gpt-4o-mini for quick Q&A/summaries and gpt-5.2 for coding, debugging, architecture, or high-stakes reasoning). Includes a local keyword/heuristic classifier script and guidance for applying a per-session model override.
---

# OpenAI Model Router (Lite)

Goal: **save tokens** by routing each request to an appropriate model.

Default policy (customize in `scripts/router-config.json`):
- **Cheap / fast**: `openai/gpt-4o-mini`
- **Strong**: `openai/gpt-5.2`

## How it works

1. Run the classifier on the incoming user prompt.
2. If it looks like **coding / debugging / complex multi-step**, pick the strong model.
3. Otherwise default to the cheaper model.

This is intentionally **heuristic** (keyword + pattern matching). It’s fast, local, and doesn’t spend tokens just to choose a model.

## Quick use (CLI)

```bash
node scripts/classify-prompt.mjs "Explain what an ETF is in 3 bullets"
node scripts/classify-prompt.mjs "Fix this Typescript error: TS2322 ..." --json
```

## Integrating into your OpenClaw workflow

### A) Manual (no code changes)

- For each user prompt: run `classify-prompt.mjs`.
- Apply the recommendation by setting a per-session model override (how you do this depends on your OpenClaw surface; typical options are:
  - run in a separate session via `sessions_spawn --model ...`, or
  - use a per-session override mechanism if your UI supports it).

### B) Semi-automatic (agent instruction)

If you’re editing your own agent instructions/system prompt, add a short rule:

- "Before answering, classify the user prompt with `node <path>/classify-prompt.mjs`. If confidence ≥ threshold, switch model accordingly. If uncertain, stay on the current/default model."

## Routing rules (defaults)

The classifier assigns **signals** and scores them:

### Strong-model signals (examples)

- Code blocks / diffs: ``` , `diff`, `patch`, `stack trace`
- Dev words: `bug`, `error`, `exception`, `traceback`, `segfault`, `build failed`, `compile`, `lint`, `typescript`, `python`, `node`, `sql`, `regex`
- Tooling: `docker`, `kubernetes`, `terraform`, `CI`, `github actions`
- Requests for: *design an architecture*, *refactor*, *write tests*, *optimize*, *security review*

### Cheap-model signals (examples)

- Short factual Qs: definitions, quick summaries, rewrite/formatting
- Simple planning: "make a checklist", "draft a short email"

### Explicit overrides

If the prompt contains:
- `@model:gpt-5.2` → force strong model
- `@model:gpt-4o-mini` → force cheap model

(You can change these tags in config.)

## Files

- `scripts/classify-prompt.mjs` — main classifier
- `scripts/router-config.json` — keywords, thresholds, model names

## Safety / limitations

- This is **not** a safety filter.
- It may misclassify borderline requests. When in doubt, choose the stronger model for:
  - anything high-stakes
  - ambiguous prompts that could hide complexity

