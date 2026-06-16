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

Recommended config:

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
```

LLM keys belong to the downstream merge service, not the monitor.

## Rate Limits

For GitHub repos:

- Prefer GitHub REST tree APIs and raw file downloads.
- Use `GITHUB_TOKEN` to avoid low unauthenticated rate limits.
- Download raw Markdown only for new or changed blobs.

For web sources:

- Add source-specific rate limits.
- Respect robots.txt where applicable.
- Store fetch timestamp and content hash.

For LLM:

- Merge only changed docs.
- Batch by ProgramID.
- Keep prompts bounded.
- Retry transient errors with exponential backoff.
