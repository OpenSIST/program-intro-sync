# Description Monitor Scope

## Scope

This service only monitors external description changes.

It owns:

- Source registration
- Scheduled scans
- External document discovery
- Content hashing
- OpenSIST program matching
- Change detection
- D1 persistence
- Query APIs for changed candidates

It does not own:

- LLM merge
- Backend publishing
- Backend mutation
- Human review UI
- Publishing final descriptions

Those can be separate services that consume D1 rows.

## Cloudflare-First Runtime

Recommended runtime:

```txt
Cloudflare Worker
  - cron trigger
  - manual trigger endpoint
  - D1 binding
  - source fetchers
  - deterministic matcher
```

Use Containers only if the monitor later needs tools that Workers cannot run efficiently, such as full `git` operations, heavyweight parsing, or browser scraping. For the initial monitor, use GitHub REST APIs and raw file downloads instead of cloning repositories.

## Decoupled Flow

```txt
Monitor:
  external source + OpenSIST metadata
  -> source_documents
  -> program_matches
  -> description_change_events

LLM merge service:
  description_change_events
  -> fetch needed source text
  -> call model
  -> write merge_drafts

Publisher/reviewer:
  merge_drafts
  -> human review
  -> backend publish API
```

The monitor should be able to run even if no LLM provider exists.

## Source Polling

For GitHub-hosted sources:

1. Read source repository branch/head commit.
2. Fetch Git tree recursively.
3. Filter `.md` and `.mdx` paths.
4. Compare `blob_sha` and stored `content_hash`.
5. Download only new or changed files.
6. Normalize markdown.
7. Compute content hash.
8. Match to OpenSIST program.
9. Write event if new, changed, removed, or match changed.

Avoid shallow clone in the monitor. GitHub API calls are cheaper and easier to run inside Workers.

## Change Event Types

- `source_new`
- `source_changed`
- `source_removed`
- `match_changed`
- `match_confidence_changed`
- `opensist_program_changed`
- `opensist_description_changed`
- `license_changed`

## Idempotency

Each run should be idempotent.

Use deterministic keys:

```txt
source_key = source_name + ":" + source_path
event_key = source_key + ":" + event_type + ":" + relevant_hash
```

Before inserting an event, check whether the same event key already exists.

## Failure Behavior

- If OpenSIST fetch fails, mark run failed and do not emit source match events.
- If one external source fails in the MVP, mark the run failed. Add source-level failure rows before changing this to partial success.
- If D1 write fails, fail the run.
- If source content cannot be parsed, record parse failure but keep scanning.

## Minimal Public API

The Worker can expose authenticated endpoints:

```txt
POST /admin/monitor/run
GET /admin/monitor/runs
GET /admin/monitor/events?status=pending
POST /admin/monitor/events/:id/acknowledge
POST /admin/monitor/events/:id/ignore
POST /admin/monitor/events/:id/consume
```

Do not expose raw backend credentials or source tokens.
