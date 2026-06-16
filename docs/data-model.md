# Data Model

## Core Principle

D1 is the only durable store for the monitor.

The monitor stores:

- source metadata
- normalized content hash
- latest OpenSIST program match
- change events
- run status

The monitor does not store LLM merge drafts.

## Runtime Types

### SourceDoc

Normalized external document.

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

`contentHash` should use normalized markdown.

### OpenSistProgram

Program record fetched from OpenSIST backend.

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

### MatchedSourceDoc

Source document plus match result.

```ts
type MatchedSourceDoc = SourceDoc & {
  matchedProgramId: string | null;
  matchConfidence: number;
  matchReasons: string[];
  matchAlternatives: Array<{
    programId: string;
    confidence: number;
    reasons: string[];
  }>;
};
```

## D1 Schema

### sources

Registered upstream sources.

```sql
create table if not exists sources (
  id integer primary key autoincrement,
  name text not null unique,
  type text not null check (type in ('github_repo', 'web')),
  repo_url text,
  default_branch text,
  license_label text not null,
  enabled integer not null default 1,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);
```

### source_documents

Latest known state for each external description document.

```sql
create table if not exists source_documents (
  id integer primary key autoincrement,
  source_id integer not null references sources(id),
  source_key text not null unique,
  source_path text,
  source_url text not null,
  source_commit text,
  blob_sha text,
  title text,
  content_hash text not null,
  content_length integer not null default 0,
  text_preview text,
  license_label text not null,
  first_seen_at text not null default current_timestamp,
  last_seen_at text not null default current_timestamp,
  deleted_at text,
  parse_status text not null default 'ok'
    check (parse_status in ('ok', 'ignored', 'parse_failed')),
  parse_error text
);

create index if not exists idx_source_documents_source_id
  on source_documents(source_id);

create index if not exists idx_source_documents_content_hash
  on source_documents(content_hash);
```

Do not store full markdown in this table by default.

### opensist_program_snapshots

Latest OpenSIST program metadata used by matcher.

```sql
create table if not exists opensist_program_snapshots (
  program_id text primary key,
  university text not null,
  program_name text not null,
  degree text,
  region_json text,
  target_applicant_major_json text,
  description_hash text,
  seen_at text not null default current_timestamp
);
```

### program_matches

Latest deterministic match for each source document.

```sql
create table if not exists program_matches (
  source_document_id integer primary key references source_documents(id),
  matched_program_id text,
  confidence real not null,
  reasons_json text not null,
  alternatives_json text,
  status text not null
    check (status in ('high_confidence', 'needs_review', 'unmatched')),
  matched_at text not null default current_timestamp
);

create index if not exists idx_program_matches_program_id
  on program_matches(matched_program_id);

create index if not exists idx_program_matches_status
  on program_matches(status);
```

### description_change_events

Append-only event log for downstream consumers.

```sql
create table if not exists description_change_events (
  id integer primary key autoincrement,
  event_key text not null unique,
  source_document_id integer references source_documents(id),
  event_type text not null
    check (
      event_type in (
        'source_new',
        'source_changed',
        'source_removed',
        'match_changed',
        'match_confidence_changed',
        'opensist_program_changed',
        'opensist_description_changed',
        'license_changed'
      )
    ),
  matched_program_id text,
  previous_hash text,
  current_hash text,
  previous_value_json text,
  current_value_json text,
  status text not null default 'pending'
    check (status in ('pending', 'acknowledged', 'ignored', 'consumed')),
  created_at text not null default current_timestamp,
  consumed_at text
);

create index if not exists idx_description_change_events_status
  on description_change_events(status);

create index if not exists idx_description_change_events_program
  on description_change_events(matched_program_id);
```

### monitor_runs

One row per scan.

```sql
create table if not exists monitor_runs (
  id integer primary key autoincrement,
  run_id text not null unique,
  trigger_type text not null check (trigger_type in ('cron', 'manual', 'dry_run')),
  status text not null check (status in ('running', 'success', 'failed')),
  started_at text not null default current_timestamp,
  finished_at text,
  sources_scanned integer not null default 0,
  documents_seen integer not null default 0,
  events_created integer not null default 0,
  error_message text
);
```

## Downstream Merge State

The monitor does not store LLM merge drafts in the current MVP.

When a downstream DeepSeek/AI Gateway merge worker is added, introduce a new migration for draft state instead of overloading `description_change_events`. See `docs/llm-merge-policy.md` for the expected merge input/output contract.

Then the body contains the LLM-generated review draft.
