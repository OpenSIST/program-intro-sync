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
