# Unified Architecture Reference

## Compact doctrine

- Keep presentation passive.
- Use explicit layered execution.
- Inject dependencies.
- Log meaningful actions and failures.
- Centralize error handling.
- Use design tokens and shared primitives.
- Keep test hooks stable.
- Plan recovery for remote dependencies.

## Tier guide

### Tier 1: Simple
Use lightweight structure for display-only, low-risk, single-screen, low-state work.

Allowed shortcuts:
- local state
- minimal service layer
- small view helpers

Still required:
- no hidden globals
- no magic styling values when tokens exist
- logging for meaningful actions

### Tier 2: Standard
Use a layered approach for async data, validation, navigation consequences, or moderate business importance.

Expected:
- presentation
- state controller or action layer
- use case or service
- repository abstraction
- data source or connector
- typed failures
- structured logs

### Tier 3: Critical
Use governed architecture for money, access, customer data, high-volume side effects, or audited workflows.

Required:
- strict DI
- explicit interfaces
- centralized errors
- complete logs
- typed result/failure system
- robust tests
- rollback or fallback thinking

## Review heuristics

Prefer comments that land in one of three buckets:

- **Must fix**: architecture, observability, safety, or critical design violation
- **Should fix**: maintainability or testability issue
- **Nice to improve**: polish only

## Stack reminders

### Flutter
- Widgets render state and emit events.
- Move orchestration into Bloc/Cubit/reducer/use-case layers.
- Keep navigation and one-shot effects out of random callbacks.

### React
- Components should remain presentation-first.
- Move async orchestration into actions, reducers, state machines, or services.
- Keep direct fetch logic out of reusable components.

### Backend / agent systems
- Separate policy from execution.
- Keep connectors behind interfaces.
- Log model choice, tool choice, input shape, result status, retries, and escalation.
