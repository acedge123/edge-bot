# LLM-assisted development: security pointers (Alan)

These are reminders for reviewing AI-generated code and scaffolds.

1. The model optimizes for “it runs,” not “it’s secure.” Don’t stop at first success.
2. If you didn’t explicitly ask for security, it probably didn’t add it.
3. Don’t accept 80 lines of working code without reading it—one bad line ships vulnerabilities.
4. Bugfixes sometimes “work” by disabling the security check that raised the error. Review especially the magic fixes.
5. When accepting a change, check what *else* got touched—security settings can change in unrelated files.
6. Fixes get reintroduced later. Keep a running list of prior security fixes and paste it back in.
7. If security decisions aren’t in project docs, every new session starts from zero—write down what you’re protecting.
8. API keys pasted into chat are logged somewhere. Use env vars; reference the *name*, never the value.
9. If secrets are prefixed with `NEXT_PUBLIC_` or `VITE_`, they’re exposed in frontend bundles.
10. Don’t let an LLM build your login/auth system from scratch without a serious security review.
11. Models hallucinate package names; attackers publish malicious packages under those names. Verify every dependency.
12. You’ll sometimes get entire “security systems” that are made up. If it’s not in official docs, treat it as invented.
13. Hiding a UI button doesn’t protect the endpoint—backend must enforce authz.
14. DB + file storage are often wide open by default. Lock down to per-user access (RLS / signed URLs / ACLs).
15. Rate limiting + spending caps are rarely added by default. One script can drain budget fast.
16. Payment webhooks must verify signatures. Otherwise attackers can forge “paid” events.
17. Don’t leak stack traces/DB info in prod error pages. Disable debug mode.
18. Treat generated output as a demo/rough draft, not a production app.
19. `.env` might already be in git history. `.gitignore` doesn’t erase it—rotate exposed keys.
20. After builds, run real security audits/scans (LLMs aren’t live vuln databases).
21. Add audit logs (who changed permissions/deleted what). Otherwise you’ll have no trail.
22. Don’t use an LLM as your only security reviewer—use real scanning tools.
23. Backups: ensure they exist and *test restores*.
24. Separate test vs prod (webhooks, DBs, storage). Don’t let test events hit prod.
25. Re-review scaffolding/boilerplate defaults—wide-open configs often ship from day 0.
