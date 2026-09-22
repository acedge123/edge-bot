# MusicDNA Test Harness API

Base URL:

- Production: `https://project--bf62bea5-34b0-497c-a8a5-6c41d3f35ed6.lovable.app/api/public/test`
- Preview: `https://project--bf62bea5-34b0-497c-a8a5-6c41d3f35ed6-dev.lovable.app/api/public/test`

Header:

```text
x-test-harness-secret: <TEST_HARNESS_SECRET>
```

Lifecycle:

- `POST /opener` , submit exactly 3 songs and optional `pairing_count`
- `POST /next` , fetch the next pairing
- `POST /choice` , submit the selected song for the current pairing
- `POST /report` , finalize the run and synthesize the result
- `GET /status` , inspect persona state
- `POST /reset` , wipe persona state

Response fields to inspect:

- `opener.lane`
- `opener.candidate_dimensions`
- `pairing.tests`
- `pairing.song_a`, `pairing.song_b`
- `reveal.verdict`
- `reveal.why`
- `reveal.dim`
- `finalize.archetypeName`
- `synth.kept_choosing`
- `result.definingChoices`
- `reasoning.allowed_claims`
- `reasoning.blocked_claims`

Suggested persona patterns:

- decade-first
- movement-first
- atmosphere-first
- tension-first
- mainstream-vs-obscure

Canonical curl sketch:

```bash
SECRET="$AGENT_TEST_HARNESS_KEY"
BASE="https://project--bf62bea5-34b0-497c-a8a5-6c41d3f35ed6-dev.lovable.app/api/public/test"
P="90s-alt-movement-v1"

H=(-H "x-test-harness-secret: $SECRET" -H "content-type: application/json")

curl -s "$BASE/opener" "${H[@]}" -d '{"persona_id":"'$P'","songs":["Song A","Song B","Song C"],"pairing_count":6}'
curl -s "$BASE/next" "${H[@]}" -d '{"persona_id":"'$P'"}'
curl -s "$BASE/choice" "${H[@]}" -d '{"persona_id":"'$P'","pairing_id":"...","chosen_song_id":"...","ms_to_decide":3500}'
curl -s "$BASE/report" "${H[@]}" -d '{"persona_id":"'$P'"}'
```
