---
name: music-dna
description: Run and evaluate MusicDNA persona tests against the test-harness API. Use when working on the MusicDNA app, its diagnostic canon, onboarding/pairing flow, or when you need to drive scripted personas through the 3-song opener, pairing rounds, choice submission, reporting, resets, or compare how different personas change results.
---

# MusicDNA

## Use this skill

Use the MusicDNA test-harness API, not the browser, when you need repeatable persona runs, algorithm inspection, or endpoint-driven QA.

## Workflow

1. Pick a persona label.
   - Make it stable and descriptive, like `shoegaze-obsessive-pure-v1`.
2. Write a human brief, not an ontology brief.
   - Good: "Lifelong Radiohead fan. Choose what you'd rather hear right now. Don't optimize for consistency."
   - Avoid telling the persona about dimensions, scoring, archetypes, or what the test is trying to infer.
3. Prefer 3 variants for the same concept.
   - `pure-archetype`
   - `realistic-fan`
   - `contrarian-fan`
4. Run the harness lifecycle.
   - `POST /opener` with exactly 3 starter songs.
   - `POST /next` to fetch each pairing.
   - `POST /choice` to submit the selection.
   - `POST /report` to finalize and capture the synthesis.
   - `POST /reset` when you need a clean rerun.
5. Compare outputs.
   - Inspect opener lane, per-round reveals, final archetype, defining choices, confidence/hesitation, and whether variants meaningfully diverge.

## Test design rules

- Keep personas synthetic and short-lived.
- Simulate a believable listener, not a dimension solver.
- Do not reverse engineer the ontology from pairing labels or expected outcomes.
- Assume fans are fallible and fickle, not perfectly self-consistent.
- Use realistic `ms_to_decide` values to exercise reveal copy.
- Capture per-choice confidence locally, even if the API only accepts `ms_to_decide` today.
- Reset before reruns when you want fresh state.
- Stop when `/next` returns `done: true`.

## Persona templates

- `pure-archetype`: strongest center of gravity, maximum signal.
- `realistic-fan`: favorite artist plus adjacent loves and contradictions.
- `contrarian-fan`: same fandom, but with internal disagreement or era bias.
- `shoegaze-obsessive`: high-value smell test for atmosphere / immersion / transformation.

## Request shape

Use the public test base from `docs/test-harness.md` and send the secret header on every request.

Required header:

```text
x-test-harness-secret: <TEST_HARNESS_SECRET>
```

If the environment uses the renamed variable, read `AGENT_TEST_HARNESS_KEY` first.

## What to inspect

- `opener.lane` and `opener.candidate_dimensions`
- `pairing.tests`, `pairing.song_a`, `pairing.song_b`
- `reveal.verdict`, `reveal.why`, `reveal.dim`, `reveal.delta`
- `finalize.archetypeName` and `finalize.vector`
- `synth.kept_choosing` and `result.definingChoices`
- `reasoning.allowed_claims` vs `reasoning.blocked_claims`

## Good outputs

A good run should tell a coherent story, not just return scores. The point is to see whether the app infers a believable taste profile from a small number of revealing decisions, and whether different persona variants create meaningfully different outcomes.

## Local harness artifacts

Current harness files:

- `tools/musicdna/persona_harness.mjs`
- `tools/musicdna/personas.example.json`
- `docs/musicdna/persona-testing-process.md`

The harness can run in interactive mode for true human-in-the-loop picks, or auto-persona mode that uses persona taste hints without reading pairing test labels.

## Reference

Read `references/test-harness-api.md` for the endpoint contract and the canonical curl flow.