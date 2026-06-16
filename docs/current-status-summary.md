# Current Status Summary

## What Exists Now

`program-intro-sync` is a standalone Cloudflare Worker project for monitoring external program-description sources.

The current MVP is a data monitor. It:

- reads OpenSIST program metadata and current descriptions from the backend
- reads external Markdown documents from OpenCS, GlobalCS, and CSGrad
- normalizes source text and stores hashes
- deterministically matches source documents to OpenSIST `ProgramID`
- writes state and change events to Cloudflare D1
- exposes admin endpoints for manual runs and event inspection

It does not:

- write OpenSIST backend data
- generate final merged descriptions
- create PRs
- publish anything
- run LLMs inside the monitor worker

## Cloudflare Deployment

Worker:

```txt
program-intro-sync
https://program-intro-sync.libn-152b4a.workers.dev
```

D1:

```txt
database_name = program-intro-sync
database_id = 3073eab7-e1f8-4e1e-b171-33740db9ad20
```

Secrets set:

```txt
ADMIN_TOKEN
OPENSIST_COOKIE
```

Optional secret:

```txt
GITHUB_TOKEN
```

## Remote D1 State

Latest known remote counts:

```txt
sources = 3
source_documents = 26
program_matches = 26
opensist_program_snapshots = 327
description_change_events = 26
```

Latest successful manual monitor run:

```txt
run_id = 03e50966-b0ef-45ba-a859-6e47c26029e4
sourcesScanned = 3
documentsSeen = 26
eventsCreated = 2
```

Initial ingestion is intentionally gradual because of Cloudflare Workers subrequest limits:

```txt
MAX_PROGRAM_UPSERTS_PER_RUN = 25
MAX_RAW_DOWNLOADS_PER_SOURCE = 1
```

Run additional manual monitor passes to continue first source ingestion.

## Admin API

Health:

```txt
GET /health
```

Admin routes require:

```txt
Authorization: Bearer <ADMIN_TOKEN>
```

Routes:

```txt
POST /admin/monitor/run
GET  /admin/monitor/runs?limit=20
GET  /admin/monitor/events?status=pending&limit=100
POST /admin/monitor/events/:id/acknowledge
POST /admin/monitor/events/:id/ignore
POST /admin/monitor/events/:id/consume
```

## LLM Summary Evaluation

A local-only evaluation workflow exists:

```txt
prompts/llm-summary-system.md
scripts/evaluate-llm-summary/index.mjs
docs/llm-summary-evaluation.md
outputs/llm-summary-evals/
```

Dry-run:

```sh
npm run eval:llm-summary -- --dry-run --limit 2
```

Real call:

```sh
CLOUDFLARE_API_TOKEN=<token> npm run eval:llm-summary -- --limit 2
```

Current baseline model:

```txt
@cf/meta/llama-3.3-70b-instruct-fp8-fast
```

Known behavior:

- Llama 3.3 70B fast gives usable strict JSON.
- Qwen3 and GLM reasoning models spent output tokens on visible reasoning and were less convenient for this JSON summary task.
- A batch of two OpenCS samples hit one Cloudflare AI 408 timeout; the script now records per-sample failures instead of aborting the whole run.

Latest successful local LLM summary output:

```txt
outputs/llm-summary-evals/2026-06-16T08-46-11-669Z.json
```

That sample:

```txt
OpenCS:docs/CSE@Harvard.md -> CSE@Harvard
validation = ok
prompt_tokens = 1125
completion_tokens = 305
total_tokens = 1430
```

## Important Finding

The current deterministic matcher has a false-positive risk.

Observed example:

```txt
sourceKey = GlobalCS:docs/Program/T0.5/EPFL MSDH.md
matchedProgramId = MSCS@EPFL
confidence = 0.99
```

This is wrong: `MSDH` is Digital Humanities, not `MSCS`.

The LLM summary correctly marked `shouldUseForDraft=false`, but the real fix belongs in the matcher. The matcher needs stronger program-code/name disagreement checks before a source can become high confidence.

## Next Engineering Step

Improve matching before building merge drafts.

Recommended changes:

1. Add a matcher fixture set with known positives and negatives.
2. Add negative case: `EPFL MSDH` must not match `MSCS@EPFL`.
3. Penalize explicit program-code mismatch between source title/path and candidate `programName` or `ProgramID`.
4. Require a stronger program-name match when multiple programs share the same university.
5. Keep ambiguous matches as `needs_review` or `unmatched`, not `high_confidence`.

Relevant files:

```txt
src/matching/matcher.ts
src/types.ts
docs/llm-summary-evaluation.md
docs/memory/project-memory.md
```

## Publishing Direction

Program descriptions live in the OpenSIST backend database.

The final production path should be:

```txt
description_change_events
-> merge_drafts
-> human review
-> backend admin publish API
```

Do not use frontend PRs as the primary publishing mechanism.

See:

```txt
docs/backend-publish-api.md
```
