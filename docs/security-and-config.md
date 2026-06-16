# Security And Config

## Secrets

Use Cloudflare secrets for:

- OpenSIST backend auth cookie or token
- LLM provider API keys

Never commit:

- JWT cookies
- API keys
- Raw request headers
- Full backend responses containing private user data

## Backend Access

The sync bot should only need read endpoints:

- Program list
- Program descriptions

Do not give the bot write access to production backend unless the publish flow is redesigned with strict approval gates.

## D1 Only Storage

The monitor should use D1 as its only durable store.

Do not require:

- R2 for the initial monitor
- GitHub artifact storage
- committed state files

If raw external markdown retention becomes necessary, add an explicit retention and license policy first.

## Logging

Logs may include:

- Source repo names
- Commit SHAs
- Counts
- ProgramIDs
- Error types

Logs must not include:

- Cookie values
- API keys
- Full source markdown
- Full LLM prompts if they include copyrighted content

## Output Hygiene

The monitor should not commit generated outputs to any repo. It writes D1 rows only.

## License Handling

Every `SourceDoc` must carry a license label.

Initial labels:

- OpenCS: `CC BY-NC-SA 4.0`
- GlobalCS: `CHECK_SOURCE_LICENSE`
- CSGrad: `CHECK_SOURCE_LICENSE`

If license is unknown:

- Allow local/internal review drafts.
- Do not publish copied or closely paraphrased content without approval.
- Prefer source links and summaries until permission is confirmed.

## Config Files

Current non-secret Cloudflare config lives in `wrangler.jsonc`.

Configured resources:

```txt
account_id = c1e0d935e0f8ba4685b9b6702130efe7
D1 binding = DB
D1 database_name = program-intro-sync
D1 database_id = 3073eab7-e1f8-4e1e-b171-33740db9ad20
MAX_PROGRAM_UPSERTS_PER_RUN = 25
MAX_RAW_DOWNLOADS_PER_SOURCE = 1
```

Remote D1 migration `0001_initial.sql` has already been applied.

Legacy/future config files may be useful if config grows:

```txt
config/sources.json
config/matching.json
config/llm.json
```

Example:

```json
{
  "opensist": {
    "apiRoot": "https://alpha.opensist.tech/",
    "requireAuth": true
  },
  "matching": {
    "highConfidence": 0.72,
    "lowConfidence": 0.45
  },
  "llm": {
    "enabled": false
  }
}
```

Secrets should be supplied by environment variables, not config files:

```txt
OPENSIST_COOKIE
GITHUB_TOKEN
ADMIN_TOKEN
```

LLM keys belong to the downstream merge service, not the monitor.

## Deployment Checklist

Before deploying the Worker:

1. Confirm `wrangler.jsonc` points at the intended account and D1 database.
2. Run `npm run typecheck`.
3. Run `npm run db:migrate:remote` if migrations changed.
4. Set secrets with `wrangler secret put`.
5. Run `npm run deploy`.

The current repo has completed steps 1-3. `ADMIN_TOKEN` has been generated locally, stored in ignored file `.admin-token`, and uploaded as a Worker secret.

Current secret status:

- `ADMIN_TOKEN` is set.
- `OPENSIST_COOKIE` is set for the MVP.
- Optionally set `GITHUB_TOKEN` if unauthenticated GitHub API limits become a problem.
- Re-deploy after code/config changes.

## Rate Limits

For GitHub repos:

- Prefer GitHub REST tree APIs and raw file downloads.
- Use `GITHUB_TOKEN` to avoid low unauthenticated rate limits.
- Download raw Markdown only for new or changed blobs.
- Keep `MAX_RAW_DOWNLOADS_PER_SOURCE` bounded so the first scan can progress across multiple Worker invocations without hitting subrequest limits.

For web sources:

- Add source-specific rate limits.
- Respect robots.txt where applicable.
- Store fetch timestamp and content hash.

For LLM:

- Merge only changed docs.
- Batch by ProgramID.
- Keep prompts bounded.
- Retry transient errors with exponential backoff.
