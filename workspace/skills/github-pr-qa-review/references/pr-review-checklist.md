# PR QA checklist (quick)

## CI
- [ ] Required checks passing
- [ ] New warnings addressed
- [ ] Flaky tests acknowledged/mitigated

## Diff review
- [ ] No secrets/keys committed
- [ ] Authz and tenant boundaries respected
- [ ] Input validation and error handling
- [ ] No breaking changes without plan
- [ ] Tests added/updated
- [ ] Logging/telemetry appropriate

## Local QA
- [ ] Install/build
- [ ] Unit tests
- [ ] Typecheck/lint (if applicable)
- [ ] Smoke test key flows
