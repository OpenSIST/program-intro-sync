# Sync Pipeline

## Trigger

The monitoring pipeline should run in Cloudflare Workers.

Triggers:

- Workers Cron Trigger
- Authenticated manual HTTP trigger
- Optional dry-run trigger with custom source refs

Recommended schedule:

Use daily or twice-daily polling. Start with daily.

## Step 1: Fetch OpenSIST Data

Inputs:

- Backend API root
- Optional auth cookie from Cloudflare secret `OPENSIST_COOKIE`

Fetch:

- Programs
- Current descriptions

The client should normalize programs into:

```ts
type OpenSistProgram = {
  programId: string;
  university: string;
  programName: string;
  degree?: string;
  region?: string[];
  targetApplicantMajor?: string[];
  descriptionMarkdown?: string | null;
  descriptionHash: string | null;
};
```

If OpenSIST data cannot be fetched, the workflow should fail unless explicitly running in source-only dry-run mode.

## Step 2: Fetch External Sources

For GitHub sources:

- Fetch branch head commit through GitHub REST API.
- Fetch recursive Git tree through GitHub REST API.
- Record commit SHA.
- Scan source-specific content roots.
- Parse `.md` and `.mdx`.
- Ignore assets, generated sites, navigation pages, and very short pages.
- Download raw markdown only for new or changed blobs.

Each source doc gets a stable key:

```txt
<source>:<path>
```

## Step 3: Normalize Source Docs

Normalize to `SourceDoc`:

```ts
type SourceDoc = {
  source: "OpenCS" | "GlobalCS" | "CSGrad";
  sourceKey: string;
  sourceRepo: string;
  sourcePath: string;
  sourceCommit: string;
  sourceUrl: string;
  license: string;
  title: string;
  markdown?: string;
  textPreview: string;
  contentHash: string;
  contentLength: number;
  blobSha: string;
  changed: boolean;
};
```

The hash should be based on normalized Markdown, not raw file bytes, so formatting-only frontmatter changes can be ignored if desired.

## Step 4: Match to ProgramID

Run deterministic matching first.

Output:

```ts
type ProgramMatch = {
  matchedProgramId: string | null;
  confidence: number;
  reasons: string[];
  alternatives: Array<{
    programId: string;
    confidence: number;
    reasons: string[];
  }>;
};
```

Confidence bands:

- `>= 0.72`: high confidence
- `0.45 - 0.72`: needs review
- `< 0.45`: unmatched

Only high-confidence matches can enter automatic draft generation.

## Step 5: Detect Changes

Compare current source docs with D1 rows in `source_documents`, `program_matches`, and `opensist_program_snapshots`.

Change types:

- `source_new`
- `source_changed`
- `source_removed`
- `match_changed`
- `opensist_description_changed`
- `opensist_program_changed`
- `match_confidence_changed`
- `license_changed`

The LLM merge step should run when:

- A high-confidence matched source is new.
- A high-confidence matched source changed.
- The current OpenSIST description changed since the last draft.
- A previously low-confidence source becomes high-confidence.

## Step 6: Persist Events

The monitor writes D1 rows:

1. Upsert source document metadata.
2. Upsert latest program match.
3. Insert idempotent change events.
4. Mark monitor run as success/failure.

## Step 7: Downstream Consumption

LLM merge, review, notification, or PR creation are downstream consumers.

They read:

```sql
select e.*, d.source_key, d.source_path, d.source_url, d.title
from description_change_events e
left join source_documents d on d.id = e.source_document_id
where e.status = 'pending'
order by e.created_at asc;
```

The monitor does not call these consumers synchronously.

## No-Change Behavior

If no relevant changes are detected:

- Write monitor run summary.
- Do not create events.
- Exit successfully.
