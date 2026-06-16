# Project Memory

This file preserves project context for future humans and AI coding agents. Treat it as the durable replacement for chat history.

## Product Context

OpenSIST has many programs whose descriptions are empty or incomplete. Several public CS application projects have useful program-specific descriptions, notes, and DP-style content:

- OpenCS: `https://github.com/opencsapp/opencsapp.github.io`
- GlobalCS: `https://github.com/Global-CS-application/global-cs-application.github.io`
- CSGrad: `https://github.com/csms-apply/csgrad`

The goal is to monitor those upstream sources, detect new or changed program descriptions, match them to OpenSIST programs, and make changed candidates available for a later merge/review process.

## Repository Boundary

This project is intentionally independent from `OpenSIST.github.io`.

Reasons:

- It pulls data from multiple places: OpenSIST backend, GitHub repos, and later possibly web pages.
- It owns crawler/monitoring state and automation secrets.
- It should output events and later PRs/drafts without coupling to frontend deploys.
- It must not pollute OpenSIST backend data during MVP work.

Current local path:

```txt
/Users/caleblee/Desktop/program-intro-sync
```

Original OpenSIST frontend/backend-adjacent repo used for earlier exploration:

```txt
/Users/caleblee/Desktop/OpenSIST.github.io
```

## Current MVP Decision

The current MVP implements the data monitor only.

It does:

- Fetch OpenSIST program list and current descriptions.
- Fetch external Markdown documents from configured GitHub repos.
- Normalize Markdown and compute content hashes.
- Match source documents to OpenSIST `ProgramID` with deterministic rules.
- Store source state, OpenSIST program snapshots, match results, monitor runs, and change events in D1.
- Expose admin endpoints to run the monitor and inspect/mark events.

It does not:

- Call DeepSeek, Qwen, Workers AI, or any other LLM.
- Generate merged descriptions.
- Write to the OpenSIST backend.
- Create GitHub PRs.
- Store full normalized Markdown in D1 by default.
- Scrape arbitrary websites.

## Cloudflare Runtime Decisions

Use Cloudflare Workers + D1 for the monitor.

Use D1 as the only durable store for the monitor. Do not introduce JSON state files, R2, GitHub artifacts, or committed generated output for MVP state.

Use Workers Cron for scheduled runs and an authenticated HTTP endpoint for manual runs.

Use Containers only if future requirements need tools Workers cannot run efficiently, such as full `git`, browser scraping, or heavyweight parsing.

## LLM Direction

Assume future merge work can use AI Gateway + DeepSeek.

Important boundary: AI Gateway + DeepSeek belongs in a downstream merge service, not in the monitor core. The monitor should create D1 events that a later merge worker consumes.

Recommended future shape:

```txt
Monitor Worker
  -> description_change_events

Merge Worker
  -> read pending high-confidence events
  -> fetch current source/OpenSIST context
  -> call DeepSeek through AI Gateway
  -> write merge_drafts

Review/Publisher
  -> human review
  -> optional PR or backend update
```

## Pricing Research Memory

Prior research found:

- Workers AI has a free allocation of 10,000 Neurons/day.
- Workers Paid charges usage above the free allocation at a published Neurons rate.
- Cloudflare Workers AI pricing listed `@cf/qwen/qwen3-30b-a3b-fp8` as much cheaper than Cloudflare-hosted `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`.
- Official DeepSeek API pricing can be cheaper than Cloudflare-hosted DeepSeek-distill for output-heavy workloads.
- AI Gateway is not a model; it is the control/observability layer for provider calls.

Keep model names and cost assumptions configurable because provider pricing changes.

## Current Implementation State

Core files:

- `wrangler.jsonc`: Worker, cron, D1 binding, and config vars.
- `migrations/0001_initial.sql`: D1 schema.
- `src/index.ts`: Worker entry, scheduled handler, admin HTTP routes.
- `src/pipeline/monitor.ts`: end-to-end monitor run.
- `src/opensist/client.ts`: read-only OpenSIST API client.
- `src/sources/github.ts`: GitHub REST tree scanner and raw Markdown fetcher.
- `src/matching/matcher.ts`: deterministic source-to-program matcher.
- `src/db/repository.ts`: D1 access layer.
- `src/config/sources.ts`: configured upstream repos.

Verification already performed:

- `npm install`
- `npm run typecheck`
- `npm run db:migrate:local`
- `npm audit --omit=dev`

Notes from verification:

- `npm install` reported dev dependency audit findings, but `npm audit --omit=dev` reported zero production vulnerabilities.
- Local `wrangler dev` reached `Ready` after setting `compatibility_date` to `2026-05-03`.
- The environment used during implementation could not curl the local Wrangler port from another shell, likely due to proxy/sandbox isolation, so `/health` was not fully verified through HTTP.

## Secrets And Config

Expected Cloudflare secrets:

- `OPENSIST_COOKIE`: optional cookie for read-only OpenSIST backend access.
- `GITHUB_TOKEN`: optional GitHub token to avoid low unauthenticated rate limits.
- `ADMIN_TOKEN`: optional bearer token for admin endpoints.

Do not commit real cookies, JWTs, provider API keys, raw request headers, or full private backend responses.

## Event Semantics

The monitor records facts as idempotent events in `description_change_events`.

Event types:

- `source_new`
- `source_changed`
- `source_removed`
- `match_changed`
- `match_confidence_changed`
- `opensist_program_changed`
- `opensist_description_changed`
- `license_changed`

Downstream services should query pending events and mark them `consumed`, `ignored`, or `acknowledged`.

## Known Limitations

- Matcher is deterministic and conservative; it needs more aliases and evaluation data.
- GitHub tree fetch currently fails if GitHub returns a truncated recursive tree.
- Source license labels for GlobalCS and CSGrad still need confirmation.
- The monitor does not store full source Markdown, so a future merge service may need to re-fetch source content by `source_url`/`source_commit`.
- Source-level partial failure is not implemented; one source failure currently fails the run.
- No automated test suite exists yet beyond TypeScript checking and local D1 migration validation.

## Next Useful Work

1. Add tests for `matcher.ts`, markdown normalization, and event idempotency.
2. Add source-level failure tracking if partial success is important.
3. Confirm GlobalCS and CSGrad license policy before using content beyond internal review.
4. Add `merge_drafts` schema and a separate DeepSeek/AI Gateway consumer.
5. Add a small evaluation fixture set for known source documents and expected `ProgramID` matches.
