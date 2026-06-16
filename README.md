# Program Intro Sync

Program Intro Sync is a standalone monitoring service for tracking external program description changes and matching them to OpenSIST programs.

It is intentionally separate from `OpenSIST.github.io`. The frontend should not own crawler logic, LLM integration, source state, or automation secrets.

## Goals

- Monitor external repositories such as OpenCS, GlobalCS, and CSGrad.
- Fetch current OpenSIST program metadata and existing descriptions from the backend.
- Detect new or changed external program descriptions.
- Match external documents to OpenSIST `ProgramID`.
- Store monitoring state and change events in Cloudflare D1.
- Expose changed description candidates for downstream consumers.
- Never write directly to the OpenSIST production backend.

## Non-Goals

- Do not auto-publish merged descriptions.
- Do not run LLM merge inside the monitoring core.
- Do not store backend cookies, API keys, or LLM credentials in repo files.
- Do not scrape arbitrary websites without source-specific rules and rate limits.

## Repository Layout

```txt
program-intro-sync/
  README.md
  wrangler.jsonc
  package.json
  migrations/
    0001_initial.sql
  docs/
    AI_CODING_AGENT.md
    architecture.md
    description-monitor.md
    sync-pipeline.md
    cloudflare-llm-research.md
    llm-merge-policy.md
    data-model.md
    security-and-config.md
    memory/
      project-memory.md

  src/
    config/
    db/
    sources/
    opensist/
    matching/
    pipeline/
    utils/
```

The current MVP implements the data monitor only. LLM merge, draft storage, review UI, and PR output are intentionally outside this service.

## High-Level Pipeline

```txt
Cloudflare Worker Cron/manual trigger
-> fetch OpenSIST programs/descriptions
-> fetch external sources
-> parse source documents
-> compute content hashes
-> match source docs to ProgramID
-> detect new/changed documents
-> write source state and change events to D1
```

## Important Design Rule

The monitoring core only records facts: source content hashes, match results, and change events. Data fetching and LLM merge are separate modules connected through stored D1 rows.

## Local Setup

Install dependencies:

```sh
npm install
```

Create a D1 database and replace `database_id` in `wrangler.jsonc`:

```sh
wrangler d1 create program-intro-sync
```

Apply migrations:

```sh
npm run db:migrate:local
npm run db:migrate:remote
```

Set secrets:

```sh
wrangler secret put OPENSIST_COOKIE
wrangler secret put GITHUB_TOKEN
wrangler secret put ADMIN_TOKEN
```

Run locally:

```sh
npm run dev
```

Admin endpoints:

```txt
GET  /health
POST /admin/monitor/run
GET  /admin/monitor/runs?limit=20
GET  /admin/monitor/events?status=pending&limit=100
POST /admin/monitor/events/:id/acknowledge
POST /admin/monitor/events/:id/ignore
POST /admin/monitor/events/:id/consume
```

If `ADMIN_TOKEN` is set, admin routes require:

```txt
Authorization: Bearer <ADMIN_TOKEN>
```

## Documentation Map

- [AI coding agent guide](docs/AI_CODING_AGENT.md): start here when asking an AI agent to work on this repo.
- [Project memory](docs/memory/project-memory.md): persistent context, decisions, and current state.
- [Architecture](docs/architecture.md): boundaries, modules, and storage policy.
- [Description monitor](docs/description-monitor.md): monitor scope, event types, and API shape.
- [Sync pipeline](docs/sync-pipeline.md): step-by-step runtime flow.
- [Data model](docs/data-model.md): D1 tables and runtime data shapes.
- [Security and config](docs/security-and-config.md): secrets, logging, license, and rate-limit rules.
- [Cloudflare LLM research](docs/cloudflare-llm-research.md): Workers AI, AI Gateway, and pricing notes.
- [LLM merge policy](docs/llm-merge-policy.md): future DeepSeek/Qwen merge constraints.
