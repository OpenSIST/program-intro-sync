# Architecture

## Boundary

This project sits outside the OpenSIST frontend. It reads from OpenSIST backend APIs and public external sources, then writes source state and change events into Cloudflare D1.

```txt
External repos/web  ----\
                         -> program-intro-sync -> Cloudflare D1
OpenSIST backend  -------/
```

## Core Modules

### Sources

Source modules fetch and parse external content.

Initial sources:

- OpenCS: `https://github.com/opencsapp/opencsapp.github.io`
- GlobalCS: `https://github.com/Global-CS-application/global-cs-application.github.io`
- CSGrad: `https://github.com/csms-apply/csgrad`

Future source:

- Official university/program web pages, implemented as source-specific scrapers.

Each source module outputs normalized `SourceDoc` objects.

### OpenSIST Client

The OpenSIST fetcher fetches:

- Program list
- Current program descriptions
- Optional metadata used for matching, such as university aliases

It must not call mutation APIs.

### Matching

The matcher maps a `SourceDoc` to an OpenSIST `ProgramID`.

It combines:

- University alias matching
- Program name alias matching
- Path/title signals
- Optional LLM-assisted disambiguation later

The matcher returns confidence and reasons. Low-confidence matches go to review instead of merge.

### Change Detection

Change detection compares the current run with persisted source state.

It flags:

- New source documents
- Changed source documents
- Removed source documents
- Match target changes
- OpenSIST description changes

Only changed items should go into LLM merge.

### Change Event Store

The monitor writes immutable-ish change events to D1. Downstream systems can query these rows later to run LLM merge, manual review, notifications, or PR creation.

The monitoring core does not call an LLM and does not create PRs.

## Data Flow

```txt
fetchExternalSources()
  -> SourceDoc[]

fetchOpenSistPrograms()
  -> Program[]

matchSources(SourceDoc[], Program[])
  -> MatchedSourceDoc[]

detectChanges(MatchedSourceDoc[], SourceState)
  -> ChangeSet

persistChanges(ChangeSet)
  -> D1 rows
```

## Storage

Use Cloudflare D1 as the single durable store for monitoring state. Store hashes and metadata by default. Store full normalized markdown only if we explicitly decide the license and retention policy are acceptable.

Recommended storage:

```txt
D1 tables:
- sources
- source_documents
- program_matches
- description_change_events
- monitor_runs
```
