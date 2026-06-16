# AI Coding Agent Guide

Read this file first when working on `program-intro-sync`.

## Mission

This repo is a standalone Cloudflare Worker service that monitors external program-description sources and stores change events in Cloudflare D1.

The current task boundary is data monitoring only:

- fetch OpenSIST program metadata and current descriptions
- fetch external GitHub Markdown sources
- normalize and hash source docs
- deterministically match source docs to OpenSIST `ProgramID`
- write source state, matches, runs, and change events to D1

Do not add LLM merge, backend mutation, PR publishing, or UI work unless the user explicitly asks for that next phase.

## Read These Files In Order

1. `docs/memory/project-memory.md`
   - Persistent project context, decisions, current state, known limitations, and next work.

2. `README.md`
   - Setup, commands, endpoint list, and documentation map.

3. `docs/architecture.md`
   - System boundaries and module responsibilities.

4. `docs/description-monitor.md`
   - Monitor scope, event types, idempotency, and admin API shape.

5. `docs/data-model.md`
   - D1 schema and runtime data shapes.

6. `docs/security-and-config.md`
   - Secrets, logging, license handling, and config rules.

7. `src/types.ts`
   - Shared TypeScript contracts.

8. `src/pipeline/monitor.ts`
   - Main runtime flow. Most behavioral changes start here.

9. `src/db/repository.ts`
   - D1 access layer. Keep SQL and schema changes consistent with migrations/docs.

10. Relevant module for the requested change:
    - `src/opensist/client.ts` for OpenSIST API reads.
    - `src/sources/github.ts` for upstream GitHub scanning.
    - `src/matching/matcher.ts` for program matching.
    - `src/config/sources.ts` for source definitions.
    - `src/index.ts` for Worker routes, cron, and admin API.

Read `docs/cloudflare-llm-research.md` and `docs/llm-merge-policy.md` only when the user asks about the future LLM merge phase.

## Current Runtime

Cloudflare Worker:

- scheduled cron handler in `src/index.ts`
- manual admin trigger: `POST /admin/monitor/run`
- event inspection: `GET /admin/monitor/events?status=pending`
- event marking:
  - `POST /admin/monitor/events/:id/acknowledge`
  - `POST /admin/monitor/events/:id/ignore`
  - `POST /admin/monitor/events/:id/consume`

D1 is the only durable store.

## Important Invariants

Preserve these unless the user explicitly changes project direction:

- The monitor must not write to OpenSIST backend mutation APIs.
- The monitor must not call DeepSeek/Qwen/Workers AI.
- The monitor must not commit generated state or output files.
- Secrets must come from Cloudflare secrets or environment variables, never repo files.
- Do not store full external Markdown in D1 by default.
- All event insertion should be idempotent through deterministic `event_key`.
- A source document key is stable as `<source-name>:<source-path>`.
- D1 schema changes require a new migration and docs update.

## Working Commands

Install dependencies:

```sh
npm install
```

Typecheck:

```sh
npm run typecheck
```

Apply local D1 migrations:

```sh
npm run db:migrate:local
```

Run local Worker:

```sh
npm run dev
```

Apply remote D1 migrations:

```sh
npm run db:migrate:remote
```

Deploy:

```sh
npm run deploy
```

## Config And Secrets

`wrangler.jsonc` contains non-secret config:

- `OPENSIST_API_ROOT`
- `HIGH_CONFIDENCE`
- `LOW_CONFIDENCE`
- D1 binding
- cron trigger

Expected secrets:

- `OPENSIST_COOKIE`
- `GITHUB_TOKEN`
- `ADMIN_TOKEN`

Use:

```sh
wrangler secret put OPENSIST_COOKIE
wrangler secret put GITHUB_TOKEN
wrangler secret put ADMIN_TOKEN
```

## Common Change Patterns

### Add or change a source repo

Read:

- `src/config/sources.ts`
- `src/sources/github.ts`
- `docs/security-and-config.md`

Then:

- update `SOURCE_CONFIGS`
- define content roots and excluded path parts
- set a clear `licenseLabel`
- update docs if source behavior or license policy changes

### Improve matching

Read:

- `src/matching/matcher.ts`
- `src/types.ts`
- `docs/data-model.md`
- `docs/memory/project-memory.md`

Then:

- keep output as `ProgramMatch`
- keep confidence bands configurable through env vars
- add reasons for every meaningful score contribution
- prefer deterministic tests/fixtures before adding embeddings or LLM matching

### Change D1 schema

Read:

- `migrations/0001_initial.sql`
- `src/db/repository.ts`
- `docs/data-model.md`

Then:

- add a new migration file; do not edit already-applied migrations for deployed databases
- update repository methods and types
- update docs and memory if the change affects architecture or state semantics
- run `npm run typecheck` and `npm run db:migrate:local`

### Add DeepSeek or AI Gateway merge work

Read:

- `docs/cloudflare-llm-research.md`
- `docs/llm-merge-policy.md`
- `docs/memory/project-memory.md`

Then:

- implement it as a downstream consumer, not inside monitor core
- read pending D1 events
- write merge drafts to a new table
- keep backend publishing/manual review separate
- never send secrets or raw provider prompts to logs

## Verification Expectations

At minimum, run:

```sh
npm run typecheck
```

If SQL or D1 access changes, also run:

```sh
npm run db:migrate:local
```

If Worker routing changes, start local dev and test the relevant endpoint when the environment allows local port access.

## Known Environment Notes

During initial implementation:

- `wrangler` installed as a dev dependency.
- `compatibility_date` was set to `2026-05-03` because Wrangler 4.86.0 did not support `2026-06-16`.
- Local D1 migration succeeded.
- `wrangler dev` reached `Ready`.
- Curling the local dev port from another shell failed in the implementation environment, likely due to proxy/sandbox isolation.

## Style For Future Work

Keep changes small and aligned with the current module boundaries.

When changing behavior:

- update code
- update docs
- update `docs/memory/project-memory.md` when a decision, limitation, or verified state changes
- state clearly what was verified and what was not
