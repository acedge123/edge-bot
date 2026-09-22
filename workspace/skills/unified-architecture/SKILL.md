---
name: unified-architecture
description: Cross-platform engineering doctrine for building and reviewing software with passive presentation, explicit dependency injection, layered execution, observability, typed errors, design-system discipline, stable test hooks, and resilience-first behavior. Use when implementing or reviewing Flutter, React/Next, backend, or agent workflows; when architecture feels leaky or inconsistent; or when the user asks for a standard to guide code structure, boundaries, logging, testing, or refactoring.
---

# Unified Architecture

Use this skill to keep products and agent systems clean, explainable, and testable without overbuilding them.

## First decision: complexity tier

Classify the feature before designing it:

- **Tier 1 — Simple**: display-only or nearly so, low risk, few states
- **Tier 2 — Standard**: async data, validation, multi-step UI, external service interaction
- **Tier 3 — Critical**: money, access, customer data, write actions, auditability, or hard-to-reverse side effects

If two or more are true, move up a tier: side effects, more than two meaningful states, expensive failure, reuse likely, detailed logs needed, or agent automation will call it.

## Core doctrine

### 1. Keep presentation passive

Presentation layers render state and emit events. They do not own business rules, API orchestration, or navigation decisions.

Allowed in UI:
- display state
- simple formatting
- forwarding events
- tiny view-only conditionals

Not allowed in UI:
- business-rule evaluation
- direct API calls when a logic layer exists
- orchestration that belongs in a controller/action/use-case layer
- ad hoc navigation decisions based on hidden logic

### 2. Use a clear execution path

Prefer a stable flow such as:

`Presentation -> State Controller -> Use Case / Action -> Repository Interface -> Repository Implementation -> Data Source / External Tool`

Adapt the names to the stack, but keep responsibilities one-directional and narrow.

### 3. Make dependencies explicit

Inject repositories, services, API clients, loggers, notifications, and tool adapters. Avoid hidden globals for core logic.

### 4. Make observability mandatory

Log meaningful actions and failures:
- screen or page entry
- user actions that matter
- async request start and end
- state transitions
- external tool or API calls
- retries, fallbacks, and failures

### 5. Centralize errors

Prefer typed failures, shared handlers, and consistent user-facing messaging over scattered try/catch blocks.

### 6. Use design tokens, not guesses

Do not invent colors, spacing, typography, or one-off helpers when a design system exists.

### 7. Keep test hooks stable

Use centralized identifiers and named contracts for selectors, events, and tool interfaces.

### 8. Design for recovery

When remote systems are involved, define retry, cache, fallback, or graceful-degradation behavior up front.

## Stack guidance

### Flutter / mobile
- Keep widgets presentation-first.
- Push orchestration into Bloc/Cubit/reducer/use-case layers.
- Put navigation and one-off effects behind state/effect handling.
- Centralize widget keys used by tests.

### React / web
- Keep components presentation-first.
- Put complex async flows in action, reducer, state machine, or service layers.
- Keep fetch logic out of reusable UI components.
- Use shared selectors and route contracts.

### Backend / agents
- Separate decision logic from tool execution.
- Keep connectors behind interfaces.
- Log model choice, tool choice, input shape, result status, retries, and escalation paths.
- Treat audited write actions as critical systems.

## Review checklist

Classify findings as:

- **Must fix**: breaks architecture, observability, safety, or critical boundaries
- **Should fix**: hurts maintainability or testability
- **Nice to improve**: quality refinement

Check:
- Is business logic leaking into presentation?
- Are dependencies explicit and injectable?
- Are errors typed and handled consistently?
- Are important actions observable?
- Are selectors and contracts stable?
- Is the feature overbuilt or underbuilt for its tier?

## Reference

See [Architecture reference](references/architecture.md) for the compact doctrine, tier examples, and review heuristics.
